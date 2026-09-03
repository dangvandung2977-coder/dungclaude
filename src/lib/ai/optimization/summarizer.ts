// Conversation Summarizer — incremental, async, cheap model.
// Stores summaries in Supabase (conversation_summaries). Runs AFTER the main
// response completes (never blocks user's streaming).
import { getSupabase, uid, nowIso, str, num, nullableStr, bool } from "@/lib/db/supabase";
import { runGateway, type GatewayMessage } from "@/lib/ai/gateway";
import { estimateTokens } from "@/lib/ai/registry";
import { heuristicTitle, classifyTask } from "./router";

export interface ConversationSummary {
  id: string;
  conversationId: string;
  content: string;
  summaryUpTo: number; // message count covered
  createdAt: string;
}

const SUMMARY_PROMPT = `You are an expert conversation summarizer. Summarize the conversation below into a concise note (max 250 words) RETAINING:
- Key decisions and conclusions reached
- User requirements and constraints (technical, business, preferences)
- Technical details: tech stack, filenames, APIs, data structures, metrics
- Current tasks and unresolved issues
- State of the project/codebase discussed
Exclude: greetings, pleasantries, repetitive content. Output ONLY the summary, without title or conversational filler.`;

interface SummaryRepoOpts {
  conversationId: string;
  userId: string;
  triggerMessageCount: number;
  summarizationModelId: string; // resolved cheap model, "" = pick automatically
  enabled: boolean;
}

// ── Repo ──
export async function getSummary(conversationId: string): Promise<ConversationSummary | null> {
  const { data, error } = await getSupabase()
    .from("conversation_summaries").select("*")
    .eq("conversation_id", conversationId)
    .order("summary_up_to", { ascending: false })
    .limit(1).maybeSingle();
  if (error) return null; // table missing → treat as no summary
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: str(r.id), conversationId: str(r.conversation_id),
    content: str(r.content), summaryUpTo: num(r.summary_up_to, 0),
    createdAt: str(r.created_at),
  };
}

export async function saveSummary(conversationId: string, content: string, summaryUpTo: number): Promise<void> {
  const { error } = await getSupabase().from("conversation_summaries").upsert(
    { id: uid("summ"), conversation_id: conversationId, content: content.slice(0, 20000), summary_up_to: summaryUpTo, updated_at: nowIso() },
    { onConflict: "conversation_id" }
  );
  if (error && !/does not exist|42P01|schema cache/i.test(error.message)) {
    console.warn("[Summarizer] save failed:", error.message);
  }
}

// ── Incremental summarization: old summary + new messages → updated summary ──
export async function summarizeConversation(
  messages: GatewayMessage[],
  previousSummary: string | null,
  modelId: string,
  signal?: AbortSignal
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 2000)}`)
    .join("\n\n").slice(0, 60_000);
  const userPrompt = `${previousSummary ? `[Previous summary — update while preserving valuable context]:\n${previousSummary}\n\n` : ""}[New messages]:\n${transcript}\n\n[Updated summary:]`;

  const result = await runGateway({
    modelId,
    system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    cb: { onToken: () => {}, signal },
  });
  const text = result.text.trim();
  if (!text || text.length < 20) throw new Error("Tóm tắt rỗng");
  return text.slice(0, 8000);
}

// ── Async trigger: called after response completes; fire-and-forget safe ──
export async function maybeSummarize(opts: SummaryRepoOpts & { messages: GatewayMessage[] }): Promise<boolean> {
  if (!opts.enabled) return false;
  try {
    const existing = await getSummary(opts.conversationId);
    const newCount = opts.messages.length - (existing?.summaryUpTo ?? 0);
    // Only summarize when enough NEW messages accumulated (never per-message).
    if (newCount < Math.max(6, Math.floor(opts.triggerMessageCount / 2))) return false;

    const unsummarized = opts.messages.slice(existing?.summaryUpTo ?? 0);
    if (!unsummarized.length) return false;

    const summary = await summarizeConversation(unsummarized, existing?.content ?? null, opts.summarizationModelId);
    await saveSummary(opts.conversationId, summary, opts.messages.length);
    return true;
  } catch (e) {
    console.warn("[Summarizer] skipped:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

// Pick a cheap model for summarization: prefer explicit config, else the
// cheapest enabled chat model, else default route.
export function pickSummarizationModel(models: Array<{ id: string; inputPricePerM: number; enabled: boolean }>, configured: string, fallbackModelId: string): string {
  if (configured && models.some((m) => m.id === configured)) return configured;
  const chatModels = models.filter((m) => m.enabled && !m.id.startsWith("demo:"));
  if (!chatModels.length) return fallbackModelId;
  const cheapest = [...chatModels].sort((a, b) => a.inputPricePerM - b.inputPricePerM)[0];
  // Cheap enough → use it; otherwise default (don't add surprise cost).
  return cheapest.inputPricePerM <= 1 ? cheapest.id : fallbackModelId;
}

// ── Semantic Memory (message_embeddings, pgvector optional) ──
// Embeddings stored when EMBEDDINGS key configured; retrieval falls back to
// keyword overlap (same as RAG retriever) so the feature never blocks chat.

export async function searchMessageMemory(
  userId: string,
  conversationId: string,
  query: string,
  limit = 5
): Promise<Array<{ messageId: string; content: string; score: number }>> {
  try {
    // pgvector similarity — scoped by user + conversation, never cross-user.
    const { data, error } = await getSupabase().rpc("search_message_memory", {
      p_user_id: userId, p_conversation_id: conversationId, p_query: query, p_limit: limit,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      messageId: str(r.message_id), content: str(r.content), score: num(r.score, 0),
    }));
  } catch {
    // Fallback: keyword search over messages table (user-scoped via join).
    try {
      const terms = query.toLowerCase().match(/[a-z0-9À-ɏ]{3,}/g)?.slice(0, 8) ?? [];
      if (!terms.length) return [];
      const like = `%${terms[0]}%`;
      const { data, error } = await getSupabase()
        .from("messages").select("id,content,conversations!inner(user_id)")
        .eq("conversations.user_id", userId)
        .eq("conversation_id", conversationId)
        .ilike("content", like).limit(limit);
      if (error) return [];
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        messageId: str(r.id), content: str(r.content).slice(0, 1500), score: 1,
      }));
    } catch { return []; }
  }
}

// Embed messages in background (only when embeddings provider configured).
export async function embedPendingMessages(conversationId: string, userId: string): Promise<number> {
  const embeddingModel = process.env.EMBEDDINGS_PROVIDER; // e.g. "openai"
  const key = process.env.EMBEDDINGS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!embeddingModel || !key) return 0;
  try {
    // Messages not yet embedded (PostgREST can't subquery — fetch ids and diff).
    const { data: embRows } = await getSupabase()
      .from("message_embeddings").select("message_id")
      .eq("conversation_id", conversationId).limit(2000);
    const embedded = new Set(((embRows ?? []) as Array<Record<string, unknown>>).map((r) => str(r.message_id)));
    const { data: pending } = await getSupabase()
      .from("messages").select("id,content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(100);
    const rows = ((pending ?? []) as Array<Record<string, unknown>>)
      .filter((r) => !embedded.has(str(r.id))).slice(0, 20);
    if (!rows.length) return 0;

    for (const r of rows) {
      const content = str(r.content).slice(0, 4000);
      if (!content.trim()) continue;
      const { data: j } = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
      }).then((x) => x.json() as Promise<{ data?: Array<{ embedding: number[] }> }>).catch(() => ({ data: undefined }));
      const vec = j?.[0]?.embedding;
      if (!vec) continue;
      await getSupabase().from("message_embeddings").upsert(
        { message_id: str(r.id), conversation_id: conversationId, user_id: userId, embedding: JSON.stringify(vec), content_hash: hashOf(content) },
        { onConflict: "message_id" }
      );
    }
    return rows.length;
  } catch {
    return 0;
  }
}

function hashOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

// Title generation: heuristic first (zero tokens), cheap model only if needed.
export async function generateTitle(firstMessage: string, cheapModelId: string): Promise<string | null> {
  const heuristic = heuristicTitle(firstMessage);
  if (heuristic && heuristic.length >= 4) return heuristic;
  try {
    const r = await runGateway({
      modelId: cheapModelId,
      system: "Generate a concise conversation title (maximum 6 words, no quotes, no punctuation). Output ONLY the title.",
      messages: [{ role: "user", content: firstMessage.slice(0, 1000) }],
      cb: { onToken: () => {} },
    });
    return r.text.trim().slice(0, 80) || null;
  } catch { return null; }
}

// Re-export for convenience
export { classifyTask, estimateTokens };
