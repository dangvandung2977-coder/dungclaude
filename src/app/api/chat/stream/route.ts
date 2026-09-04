import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { fail } from "@/lib/http";
import { getConversation, createConversation, createMessage, updateMessageStats, getAttachment, getProject, updateConversation } from "@/lib/db/repos";
import { getSupabase, str } from "@/lib/db/supabase";
import { resolveModel } from "@/lib/ai/providers-config";
import { runGateway, type VisionAttachment } from "@/lib/ai/gateway";
import { isUpstreamUnsupportedError } from "@/lib/ai/streaming-capabilities";
import { TOOL_DEFS, executeTool } from "@/lib/tools/tools";
import { calcCost, estimateTokens } from "@/lib/ai/registry";
import { getCustomModelsAsAIModels } from "@/lib/ai/custom-endpoints";
import { loadCachedModels } from "@/lib/ai/models-loader";
import { recordUsage } from "@/lib/db/repos";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";
import { downloadBuffer } from "@/lib/files/storage";
import { getOptimizationSettings, parseUserMode } from "@/lib/ai/optimization/settings";
import { optimizeContext } from "@/lib/ai/optimization/optimize";
import { calculateCost, checkUserQuota, checkCostBudget, recordOptimizedUsage, recordFallbackEvent } from "@/lib/ai/optimization/usage";
import { maybeSummarize, embedPendingMessages, pickSummarizationModel, generateTitle } from "@/lib/ai/optimization/summarizer";
import { extractAndStoreMemories } from "@/lib/ai/memory/extractor";
import { detectArtifactIntent } from "@/lib/artifacts/intent";
import { generateArtifact } from "@/lib/artifacts/pipeline";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
import type { AIModel } from "@/types";
import type { ResponseLength } from "@/types/optimization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  conversationId: z.string().min(1),
  content: z.string().max(100000).default(""),
  modelId: z.string().max(120).optional().default("auto"),
  attachmentIds: z.array(z.string()).max(10).optional().default([]),
  tools: z.union([
    z.array(z.string()),
    z.record(z.boolean()),
    z.any(),
  ]).optional().default(["calculator", "file_search"]),
  projectId: z.string().nullable().optional(),
  regenerate: z.boolean().optional().default(false),
  systemPrompt: z.string().max(10000).optional(),
  responseLength: z.enum(["concise", "balanced", "detailed"]).optional().default("balanced"),
  optimizationMode: z.enum(["cost_efficient", "balanced", "max_quality"]).optional(),
});

function sseEncode(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);
  const ip = req.headers.get("x-forwarded-for") ?? user.id;
  const rl = rateLimit(`chat:${ip}`, config.rateLimit.chatPerMin);
  if (!rl.ok) return fail(`Gửi quá nhanh, thử lại sau ${rl.retryAfterSec}s.`, 429);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return fail("Dữ liệu không hợp lệ.", 400); }

  let conv = body.conversationId === "new" ? null : await getConversation(body.conversationId, user.id);
  if (!conv) {
    if (body.conversationId === "new" || !body.conversationId) {
      const initialTitle = body.content.trim().slice(0, 50) || "Cuộc trò chuyện mới";
      conv = await createConversation(user.id, {
        title: initialTitle,
        modelId: body.modelId,
        projectId: body.projectId,
      });
    } else {
      return fail("Không tìm thấy conversation.", 404);
    }
  }

  // ── TTFT: run every independent read concurrently, kick off user-message
  // persistence immediately (non-blocking — the stream does not await it).
  // Only quota/budget gates must resolve before we spend provider tokens. ──
  const sb = getSupabase();
  const settingsPromise = getOptimizationSettings().catch(() => null);
  const modelsPromise = loadCachedModels().catch(() => [] as AIModel[]);
  const projectPromise = conv.projectId
    ? getProject(conv.projectId, user.id).catch(() => null)
    : Promise.resolve(null);
  const attachmentsPromise = (async () => {
    const atts: VisionAttachment[] = [];
    for (const id of body.attachmentIds) {
      const a = await getAttachment(id).catch(() => null);
      if (!a || a.userId !== user.id) continue;
      const kind = a.mimeType.startsWith("image/") ? "image" : a.mimeType.startsWith("video/") ? "video" : "file";
      let dataUrl = "";
      try {
        const buf = await downloadBuffer(a.storagePath);
        // Cap inline size ~15MB per file for provider payloads
        if (buf.length < 15 * 1024 * 1024) dataUrl = `data:${a.mimeType};base64,${buf.toString("base64")}`;
      } catch { /* file missing -> text fallback */ }
      atts.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, dataUrl, kind, parsedText: a.parsedText });
    }
    return atts;
  })();

  // Read history BEFORE inserting the new message (avoids echo/duplicates).
  // Runs concurrently with settings/models/attachments.
  const historyPromise = sb
    .from("messages")
    .select("id,role,content,model_id,input_tokens,output_tokens")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(100)
    .then(({ data }) =>
      ((data ?? []) as Array<{ id: string; role: string; content: string; model_id: string | null; input_tokens: number | null; output_tokens: number | null }>).map((r) => ({
        id: r.id, conversationId: conv.id, role: (r.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        parts: [], content: str(r.content), modelId: r.model_id, inputTokens: r.input_tokens ?? 0,
        outputTokens: r.output_tokens ?? 0, createdAt: "",
      }))
    );

  const settings = await settingsPromise;
  // ── Quota + cost budget gates (before any provider call) ──
  if (settings) {
    const [quota, budget] = await Promise.all([
      checkUserQuota(user.id, settings).catch(() => null),
      user.role === "admin" ? Promise.resolve(null) : checkCostBudget(settings).catch(() => null),
    ]);
    if (quota && !quota.ok) return fail(quota.message ?? "Đã đạt giới hạn sử dụng.", 429);
    // Budget limit: non-admin blocked; admins get a warning but proceed.
    if (budget && budget.level === "limit") return fail(budget.message ?? "Đã vượt ngân sách ngày.", 429);
  }
  const effectiveSettings = settings ?? {
    mode: "balanced" as const,
    contextThresholds: { selectTokens: 8000, summaryTokens: 20000, aggressiveTokens: 40000 },
    recentMessages: 14, maxRelevantHistory: 6, ragTopK: 5,
    routing: { qualityWeight: 0.4, speedWeight: 0.15, costWeight: 0.3, capabilityWeight: 0.15 },
    outputLimits: { simple: 4000, normal: 16000, coding: 64000, reasoning: 64000 },
    responseLengths: { concise: 4000, balanced: 16000, detailed: 64000 },
    quotas: { dailyRequestsPerUser: 200, dailyTokensPerUser: 500000, monthlyTokensPerUser: 5000000 },
    budget: { dailyUsd: 10, warningUsd: 7, criticalUsd: 9 },
    summarization: { enabled: true, modelId: "", triggerMessageCount: 20 },
    promptCaching: { enabled: true },
    fallbackEnabled: true,
  };

  // Load attachments (images/video/files) owned by user — from Supabase Storage
  const atts = await attachmentsPromise;
  const hasImage = atts.some((a) => a.kind === "image");
  const hasVideo = atts.some((a) => a.kind === "video");

  const { modelId, functionKey } = await resolveModel({ explicit: body.modelId, hasVideo, hasImage });

  const userParts: Array<{ type: "text" | "image" | "file"; text?: string; url?: string; mimeType?: string; fileName?: string; fileId?: string }> =
    [{ type: "text", text: body.content }];
  for (const a of atts) {
    userParts.push(a.kind === "image"
      ? { type: "image", url: `/api/files/${a.id}`, mimeType: a.mimeType, fileName: a.fileName, fileId: a.id }
      : { type: "file", url: `/api/files/${a.id}`, mimeType: a.mimeType, fileName: a.fileName, fileId: a.id });
  }

  // Read history BEFORE inserting the new message (avoids echo/duplicates)
  const history = await historyPromise;

  if (body.regenerate) {
    // Khi Tạo lại: xóa câu trả lời cũ khỏi lịch sử để AI sinh lại câu mới toanh
    if (history.length > 0 && history[history.length - 1].role === "assistant") {
      const lastAsst = history.pop();
      if (lastAsst) {
        try {
          await sb.from("messages").delete().eq("id", lastAsst.id);
        } catch {
          /* ignore */
        }
      }
    }
  } else {
    // Persist the user message WITHOUT blocking the stream: the gateway call
    // below starts as soon as the history read (above) has completed. The DB
    // write races with provider TTFT and never gates it.
    void createMessage({
      conversationId: conv.id, role: "user", content: body.content || "(đính kèm file)",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parts: userParts as any,
    }).catch(() => {});
  }

  // Auto-title: heuristic first (zero tokens), cheap model only if heuristic fails
  if (body.content && (conv.title === "New conversation" || conv.title === "Cuộc trò chuyện mới" || conv.title === body.content.slice(0, 50))) {
    void (async () => {
      const models = await loadCachedModels().catch(() => [] as AIModel[]);
      const cheap = pickSummarizationModel(models, effectiveSettings.summarization.modelId, config.ai.defaultModel);
      const title = await generateTitle(body.content, cheap).catch(() => null);
      if (title) await updateConversation(conv.id, user.id, { title }).catch(() => {});
    })();
  }

  // ── Optimization pipeline ──
  const baseSystem = `You are DungClaude, an expert AI assistant and practical coding agent. Respond in the user's preferred language (Vietnamese if the user writes in Vietnamese, English if in English).
When asked to write software, build projects, or produce code:
1. Act as a practical, agile coding agent: write clean, complete, and production-ready code with an organized folder layout.
2. For all requested components or multi-file projects, produce the COMPLETE code without truncation or lazy placeholders like '// TODO' or '...rest of implementation...'.
3. Always label every code block with its exact relative file path in the markdown fence info header, e.g.:
   \`\`\`python:game/main.py
   or
   \`\`\`typescript:src/components/Header.tsx
   This ensures that the project ZIP bundling tool accurately preserves all nested folders and filenames.
4. Keep the solution direct and functional: do NOT generate bulky, complex test suites, mock frameworks, or unnecessary test boilerplate unless the user explicitly asks for tests. Focus directly on the working application code.
5. Use clean Markdown formatting with clear syntax highlighting.`;
  let projectInstructions = "";
  const prj = await projectPromise;
  if (prj?.instructions) projectInstructions = `[Project instructions — always follow]:\n${prj.instructions}`;

  let enabledToolNames: string[] = ["calculator", "file_search"];
  if (Array.isArray(body.tools)) {
    enabledToolNames = body.tools;
  } else if (body.tools && typeof body.tools === "object") {
    enabledToolNames = [];
    const tObj = body.tools as Record<string, boolean>;
    if (tObj.calculator !== false) enabledToolNames.push("calculator");
    if (tObj.fileSearch !== false) enabledToolNames.push("file_search");
    if (tObj.webSearch) enabledToolNames.push("web_search");
  }
  const enabledTools = TOOL_DEFS.filter((t) => enabledToolNames.includes(t.name));

  const availableModels = await modelsPromise;
  const mode = parseUserMode(body.optimizationMode) ?? effectiveSettings.mode;
  const optimized = await optimizeContext({
    user: { id: user.id },
    conversationId: conv.id,
    history,
    currentMessage: body.content,
    system: {
      base: baseSystem,
      userPrompt: body.systemPrompt?.trim() ? `[SYSTEM INSTRUCTIONS]: ${body.systemPrompt.trim()}` : undefined,
      projectInstructions,
    },
    attachmentsCount: atts.length,
    toolsEnabled: enabledTools.length > 0,
    models: availableModels,
    explicitModelId: body.modelId && body.modelId !== "auto" ? modelId : undefined,
    mode,
    responseLength: body.responseLength as ResponseLength,
    settings: effectiveSettings,
    projectId: conv.projectId ?? body.projectId ?? undefined,
  });

  req.signal.addEventListener("abort", () => { /* client aborted; gateway checks signal */ });

  const requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (t: string, d: unknown) => controller.enqueue(enc.encode(sseEncode(t, d)));
      send("conversation", { conversationId: conv.id, title: conv.title });
      const started = Date.now();
      let full = "";
      let assistantMsgSaved = false;
      const toolEvents: Array<{ id: string; name: string; input: unknown; output: string }> = [];
      try {
        // ── Artifact branch: user asked for a real file (docx/pptx/xlsx/pdf/md/csv) ──
        // Runs instead of the normal chat response. Failure → falls back to normal chat.
        const artifactIntent = detectArtifactIntent(body.content);
        if (artifactIntent.kind) {
          try {
            send("token", { delta: `Đang tổng hợp dữ liệu từ cuộc trò chuyện để tạo file ${artifactIntent.kind.toUpperCase()}…\n\n` });
            // Use currently active routing model or fast standard Gemini/Claude, avoiding dead custom endpoints
            const artifactModel = optimized.routing.modelId || pickSummarizationModel(availableModels, "", "gemini:gemini-2.5-flash");
            const artifact = await generateArtifact(
              { kind: artifactIntent.kind, fileName: artifactIntent.fileName, instruction: artifactIntent.instruction },
              body.content,
              { userId: user.id, conversationId: conv.id },
              artifactModel,
              {
                history: optimized.messages,
              }
            );
            // Persist assistant message with the artifact as a file part
            const summary = `Tôi đã tạo thành công file **${artifact.fileName}** (${formatBytes(artifact.sizeBytes)}) dựa trên toàn bộ dữ liệu trong cuộc trò chuyện của chúng ta:`;
            const assistantMsg = await createMessage({
              conversationId: conv.id, role: "assistant", content: summary,
              parts: [{ type: "file", fileName: artifact.fileName, fileId: artifact.id, mimeType: artifact.mimeType }],
              modelId: artifactModel,
            });
            assistantMsgSaved = true;
            send("artifact", {
              id: artifact.id, fileName: artifact.fileName, kind: artifact.kind,
              mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes,
              url: `/api/files/${artifact.id}`,
            });
            send("done", { messageId: assistantMsg.id });
            controller.close();
            return;
          } catch (e) {
            // Artifact pipeline failed → continue with normal chat answer
            if (process.env.NODE_ENV !== "production") console.warn("[Artifact] failed, falling back to chat:", e);
          }
        }

        const allModels = [...availableModels, ...(await getCustomModelsAsAIModels().catch(() => []))];
        const modelMeta = allModels.find((m) => m.id === optimized.routing.modelId);
        const supportsStreaming = modelMeta?.capabilities
          ? !modelMeta.capabilities.includes("no_stream") && !modelMeta.capabilities.includes("non_streaming")
          : undefined;

        send("status", {
          status: hasVideo
            ? "Đang phân tích video…"
            : hasImage
            ? "Đang phân tích ảnh…"
            : supportsStreaming === false
            ? "Đang suy nghĩ (chế độ phản hồi đầy đủ)…"
            : "Đang suy nghĩ…",
        });

        const result = await runGateway({
          modelId: optimized.routing.modelId,
          messages: optimized.messages.map((m, i) => i === optimized.messages.length - 1 ? { ...m, attachments: atts } : m),
          system: optimized.system,
          stableSystemPrefix: optimized.stableSystemPrefix,
          tools: enabledTools,
          maxTokens: optimized.outputLimit,
          supportsStreaming,
          capabilities: modelMeta?.capabilities,
          cb: {
            onToken: (t) => { full += t; send("token", { delta: t }); },
            onToolCall: (id, name, input) => send("tool_call", { id, name, input }),
            onStatus: (st) => send("status", { status: st }),
            signal: req.signal,
          },
          executeTool: (name, input) => executeTool(name, input, { conversationId: conv.id, projectId: conv.projectId ?? undefined }),
        });
        full = result.text;
        for (const tc of result.toolCalls) {
          toolEvents.push(tc);
          send("tool_result", { id: tc.id, name: tc.name, status: "success" });
        }
        const respondingModelId = result.model || optimized.routing.modelId;
        const respondingMeta = allModels.find((m) => m.id === respondingModelId) ?? modelMeta;
        const inTok = result.inputTokens || estimateTokens(optimized.system + optimized.messages.map((m) => m.content).join("\n"));
        const outTok = result.outputTokens || estimateTokens(full);
        const cost = respondingMeta
          ? calculateCost(respondingMeta, { inputTokens: inTok, outputTokens: outTok, cachedInputTokens: result.cachedInputTokens, cacheCreationTokens: result.cacheCreationTokens })
          : calcCost(respondingModelId, inTok, outTok, allModels);
        // Persist assistant message
        const assistantMsg = await createMessage({
          conversationId: conv.id, role: "assistant", content: full,
          parts: [
            { type: "text", text: full },
            ...toolEvents.map((t) => ({ type: "tool_call" as const, toolName: t.name, toolCallId: t.id, toolInput: t.input, toolOutput: t.output, status: "success" as const })),
          ],
          modelId: respondingModelId,
        });
        assistantMsgSaved = true;
        await updateMessageStats(assistantMsg.id, inTok, outTok, cost);
        // Optimized usage tracking (normalized schema; falls back if migration not run)
        await recordOptimizedUsage({
          userId: user.id, conversationId: conv.id, messageId: assistantMsg.id,
          model: respondingModelId, provider: result.provider, functionKey,
          usage: {
            inputTokens: inTok, outputTokens: outTok,
            cachedInputTokens: result.cachedInputTokens, cacheCreationTokens: result.cacheCreationTokens,
            latencyMs: Date.now() - started,
          },
          costUsd: cost, requestId,
          routingReason: optimized.routing.reason,
          optimizationStrategy: optimized.result.strategy,
          tokensSaved: optimized.result.tokensSaved,
          tokensWithoutOptimization: optimized.result.tokensWithoutOptimization,
        }).catch(async (e) => {
          // Pre-migration fallback: legacy recordUsage
          if (e instanceof Error && /column|does not exist/i.test(e.message)) {
            await recordUsage({
              userId: user.id, conversationId: conv.id, model: optimized.routing.modelId, provider: result.provider,
              functionKey, inputTokens: inTok, outputTokens: outTok, totalTokens: inTok + outTok,
              costUsd: cost, durationMs: Date.now() - started,
            }).catch(() => {});
          } else { console.warn("[Usage] record failed:", e); }
        });

        // Track fallbacks (provider order deviation)
        if (result.provider !== optimized.routing.modelId.split(":")[0] && result.provider !== "custom") {
          void recordFallbackEvent(user.id, conv.id, optimized.routing.modelId, `${result.provider}:${result.model}`, `primary provider failed`).catch(() => {});
        }

        // ── Background tasks: never block the response stream ──
        void (async () => {
          try {
            const models = availableModels;
            const summarizeModel = pickSummarizationModel(models, effectiveSettings.summarization.modelId, config.ai.defaultModel);
            // Summarize AFTER inserting assistant message so summary covers the reply.
            const { data: rows } = await sb.from("messages").select("role,content")
              .eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(100);
            const msgs = ((rows ?? []) as Array<{ role: string; content: string }>)
              .map((r) => ({ role: (r.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: str(r.content) }));
            await maybeSummarize({
              conversationId: conv.id, userId: user.id,
              triggerMessageCount: effectiveSettings.summarization.triggerMessageCount,
              summarizationModelId: summarizeModel,
              enabled: effectiveSettings.summarization.enabled,
              messages: msgs,
            });
            await embedPendingMessages(conv.id, user.id);

            // Persistent AI Memory: Background fact extraction, deduplication & consolidation
            await extractAndStoreMemories({
              userId: user.id,
              projectId: conv.projectId ?? body.projectId ?? undefined,
              conversationId: conv.id,
              userMessage: body.content,
              assistantMessage: full,
              explicitDecision: optimized.memoryDecision,
              availableModels,
            });
          } catch { /* background best-effort */ }
        })();

        send("usage", {
          inputTokens: inTok, outputTokens: outTok, costUsd: cost, model: respondingModelId,
          cachedInputTokens: result.cachedInputTokens,
          tokensSaved: optimized.result.tokensSaved,
        });
        send("optimization", {
          model: respondingModelId,
          provider: result.provider,
          taskClass: optimized.routing.taskClass,
          routingReason: optimized.routing.reason,
          strategy: optimized.result.strategy,
          outputLimit: optimized.outputLimit,
          breakdown: optimized.result.breakdown,
          tokensSaved: optimized.result.tokensSaved,
          ragChunks: optimized.result.ragChunksUsed,
          summaryUsed: optimized.result.summaryUsed,
          memoriesUsed: optimized.memoriesUsed ?? 0,
          estimatedCostUsd: optimized.routing.estimatedCostUsd,
          alternativeModelId: optimized.routing.alternativeModelId,
          latencyMs: Date.now() - started,
          requestId,
        });
        if (process.env.NODE_ENV !== "production") {
          console.log(`[CHAT] stream complete: conv=${conv.id} msg=${assistantMsg.id} latency=${Date.now() - started}ms`);
        }
        send("done", { messageId: assistantMsg.id });
        try { controller.close(); } catch { /* ignore */ }
      } catch (e) {
        if (req.signal.aborted) {
          if (process.env.NODE_ENV !== "production") {
            console.log(`[CHAT] generation cancelled by user: conv=${conv.id}`);
          }
          if (full && !assistantMsgSaved) {
            await createMessage({
              conversationId: conv.id,
              role: "assistant",
              content: full,
              parts: [{ type: "text", text: full }],
              modelId: optimized.routing.modelId,
            }).catch(() => {});
            assistantMsgSaved = true;
          }
          send("cancelled", { partialText: full });
          try { controller.close(); } catch { /* ignore */ }
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.error(`[CHAT] generation error: conv=${conv.id}`, e);
        }

        // Persist partial ONLY if assistant message was not already saved
        if (full && !assistantMsgSaved) {
          await createMessage({
            conversationId: conv.id,
            role: "assistant",
            content: full,
            parts: [{ type: "text", text: full }],
            modelId: optimized.routing.modelId,
          }).catch(() => {});
          assistantMsgSaved = true;
        }
        const rawErrMsg = e instanceof Error ? e.message : "AI lỗi, thử lại sau.";
        const friendlyMsg = isUpstreamUnsupportedError(rawErrMsg)
          ? "Mô hình này không hỗ trợ streaming. Hệ thống đã chuyển sang chế độ phản hồi đầy đủ cho các lượt kế tiếp."
          : rawErrMsg;
        send("error", {
          message: friendlyMsg,
          retryable: true,
        });
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
