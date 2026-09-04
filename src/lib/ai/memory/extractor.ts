// Memory Extractor & Consolidation Engine
// Asynchronous background extraction. Extracts ONLY durable, useful, project/user facts.
// Performs automatic deduplication and conflict resolution (supersedes old facts).
import type { AIModel } from "@/types";
import type { MemoryScope, MemoryCategory, MemoryRoutingDecision, MemoryRecord } from "@/types/memory";
import { createMemory, listMemories, markMemorySuperseded, updateMemory } from "@/lib/db/memory-repo";
import { getEmbedding } from "./embeddings";
import { runGateway } from "@/lib/ai/gateway";
import { pickSummarizationModel } from "@/lib/ai/optimization/summarizer";
import { config } from "@/lib/config";

const EXTRACTION_PROMPT = `You are an expert AI Memory Curator. Analyze the conversation turn between User and Assistant.
Extract ONLY durable, permanent, and high-value facts that should be remembered for future chats:
1. User Technical & Workflow Preferences (scope: "global", category: "preference" e.g., preferred languages, styles)
2. Project Architecture & Decisions (scope: "project", category: "architecture" / "technical" e.g., database, frameworks, cloud provider)
3. Project Rules & Technical Constraints (scope: "project", category: "rule" / "constraint" e.g., "no Tailwind", "must use Node 22")
4. Known Issues & Unresolved Bugs (scope: "project", category: "fact")

DO NOT extract:
- Greetings, pleasantries, temporary chatter, transient questions
- Code snippets that are temporary or generic
- Repetitive facts or obvious knowledge

OUTPUT FORMAT: Strict JSON only, no markdown wrapping, no explanation:
{
  "should_store": boolean,
  "memories": [
    {
      "scope": "global" | "project",
      "category": "preference" | "technical" | "architecture" | "constraint" | "fact" | "decision" | "rule",
      "key": string (normalized short key e.g. "pref:language", "arch:database", "rule:styling"),
      "content": string (compact, clear factual sentence),
      "importance": number (0.0 to 1.0),
      "confidence": number (0.0 to 1.0)
    }
  ]
}`;

export async function extractAndStoreMemories(opts: {
  userId: string;
  projectId?: string | null;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  explicitDecision?: MemoryRoutingDecision;
  availableModels: AIModel[];
}): Promise<number> {
  const { userId, projectId, conversationId, userMessage, assistantMessage, explicitDecision } = opts;

  // 1. Handle Explicit Commands with highest priority
  if (explicitDecision?.isExplicitCommand && explicitDecision.explicitAction) {
    return await handleExplicitAction({
      userId,
      projectId,
      conversationId,
      action: explicitDecision.explicitAction,
      content: explicitDecision.explicitContent ?? userMessage,
    });
  }

  // 2. Pre-filter: Check if message turn has durable value
  const combined = `${userMessage}\n${assistantMessage}`.toLowerCase();
  const hasDurableSignals =
    /\b(database|cơ sở dữ liệu|framework|architecture|kiến trúc|dùng|sử dụng|quy tắc|rule|convention|always|never|luôn|không bao giờ|thích|prefer|supabase|postgres|nextjs|react|typescript|python|api|deploy)\b/i.test(
      combined
    );

  if (!hasDurableSignals || userMessage.length < 15) {
    return 0; // Skip cheap LLM call completely for casual messages
  }

  // 3. Call cheap summarization model
  try {
    const cheapModel = pickSummarizationModel(opts.availableModels, "", config.ai.defaultModel);
    const prompt = `User: ${userMessage.slice(0, 2000)}\nAssistant: ${assistantMessage.slice(0, 2000)}`;

    const r = await runGateway({
      modelId: cheapModel,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      cb: { onToken: () => {} },
      maxTokens: 500,
    });

    const parsed = parseExtractionJson(r.text);
    if (!parsed?.should_store || !Array.isArray(parsed.memories) || !parsed.memories.length) {
      return 0;
    }

    let savedCount = 0;
    for (const item of parsed.memories.slice(0, 3)) {
      if (!item.key || !item.content || (item.confidence !== undefined && item.confidence < 0.6)) continue;

      const scope: MemoryScope = (item.scope === "project" && projectId) ? "project" : "global";
      const targetProjectId = scope === "project" ? projectId : null;

      await storeOrConsolidateMemory({
        userId,
        projectId: targetProjectId,
        conversationId,
        scope,
        category: (item.category as MemoryCategory) || "general",
        key: item.key,
        content: item.content,
        importance: item.importance ?? 0.7,
        confidence: item.confidence ?? 0.85,
      });
      savedCount++;
    }

    return savedCount;
  } catch (e) {
    console.warn("[MemoryExtractor] background extraction skipped:", e instanceof Error ? e.message : String(e));
    return 0;
  }
}

// ── Explicit Action Handler ──
async function handleExplicitAction(opts: {
  userId: string;
  projectId?: string | null;
  conversationId: string;
  action: "remember" | "forget" | "save_to_project";
  content: string;
}): Promise<number> {
  const { userId, projectId, conversationId, action, content } = opts;

  if (action === "forget") {
    // Find memories matching terms and archive them
    const existing = await listMemories({ userId, projectId: projectId ?? undefined, status: "current", limit: 30 });
    const terms = content.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
    let archived = 0;

    for (const m of existing) {
      const match = terms.some((t) => m.content.toLowerCase().includes(t) || m.key.toLowerCase().includes(t));
      if (match) {
        await updateMemory(m.id, userId, { status: "archived" });
        archived++;
      }
    }
    return archived;
  }

  // Remember or save to project
  const scope: MemoryScope = (action === "save_to_project" || projectId) ? "project" : "global";
  const targetProjectId = scope === "project" ? (projectId ?? null) : null;
  const key = deriveKeyFromContent(content);

  await storeOrConsolidateMemory({
    userId,
    projectId: targetProjectId,
    conversationId,
    scope,
    category: scope === "global" ? "preference" : "architecture",
    key,
    content,
    importance: 1.0,
    confidence: 1.0,
  });

  return 1;
}

// ── Deduplication & Conflict Resolution ──
async function storeOrConsolidateMemory(input: {
  userId: string;
  projectId?: string | null;
  conversationId?: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  key: string;
  content: string;
  importance: number;
  confidence: number;
}): Promise<MemoryRecord> {
  const normKey = input.key.trim().toLowerCase();

  // 1. Check existing memories with the same key
  const existingList = await listMemories({
    userId: input.userId,
    projectId: input.projectId,
    scope: input.scope,
    status: "current",
    limit: 20,
  });

  const matchingKey = existingList.find((m) => m.key === normKey);

  // 2. Generate embedding for semantic search
  const embedding = await getEmbedding(input.content);

  if (matchingKey) {
    // If content is nearly identical: bump access count & recency, don't duplicate
    if (matchingKey.content.trim().toLowerCase() === input.content.trim().toLowerCase()) {
      return await updateMemory(matchingKey.id, input.userId, {
        importance: Math.max(matchingKey.importance, input.importance),
      });
    }

    // If conflicting or updated information: Mark old memory as SUPERSEDED!
    await markMemorySuperseded(matchingKey.id, input.userId);
  }

  // 3. Create the new memory as current
  return await createMemory({
    userId: input.userId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    scope: input.scope,
    category: input.category,
    key: normKey,
    content: input.content,
    importance: input.importance,
    confidence: input.confidence,
    status: "current",
    embedding,
  });
}

function parseExtractionJson(text: string): { should_store: boolean; memories: Array<{ scope?: string; category?: string; key?: string; content?: string; importance?: number; confidence?: number }> } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch { /* ignore parse error */ }
  return null;
}

function deriveKeyFromContent(content: string): string {
  const clean = content.toLowerCase();
  if (/database|postgres|mysql|mongo|supabase/i.test(clean)) return "arch:database";
  if (/framework|nextjs|react|vue|svelte|fastapi|django/i.test(clean)) return "arch:framework";
  if (/language|ngôn ngữ|typescript|python|rust|golang/i.test(clean)) return "pref:language";
  if (/style|ngắn gọn|chi tiết|concise|detailed/i.test(clean)) return "pref:response_style";
  if (/css|tailwind|styling/i.test(clean)) return "rule:styling";
  const slug = clean.slice(0, 30).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `fact:${slug || "custom"}`;
}
