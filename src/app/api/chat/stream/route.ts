import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { fail } from "@/lib/http";
import { getConversation, createConversation, createMessage, updateMessageStats, getAttachment, getProject, updateConversation } from "@/lib/db/repos";
import { getSupabase, str } from "@/lib/db/supabase";
import { resolveModel } from "@/lib/ai/providers-config";
import { runGateway, type VisionAttachment } from "@/lib/ai/gateway";
import { isUpstreamUnsupportedError } from "@/lib/ai/streaming-capabilities";
import { TOOL_DEFS, executeTool } from "@/lib/tools/tools";
import { buildBaseSystem } from "@/lib/ai/system-prompt";
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
import {
  registerActiveTask,
  appendTaskToken,
  completeActiveTask,
  failActiveTask,
} from "@/lib/ai/active-tasks";
import { isPromptCreationRequest } from "@/lib/prompt-intent";
import { isImageGenerationRequest, generateImage } from "@/lib/ai/image-gen";

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
  reasoningEffort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
  model_reasoning_effort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
  reasoning_effort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
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
    const seenSigs = new Set<string>();
    const uniqueIds = Array.from(new Set(body.attachmentIds));
    for (const id of uniqueIds) {
      const a = await getAttachment(id).catch(() => null);
      if (!a || a.userId !== user.id) continue;
      const sig = `${a.fileName}-${a.sizeBytes}`;
      if (seenSigs.has(sig)) continue;
      seenSigs.add(sig);
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
  // ── Quota + cost budget gates (telemetry only — no artificial limits) ──
  if (settings) {
    await Promise.all([
      checkUserQuota(user.id, settings).catch(() => null),
      user.role === "admin" ? Promise.resolve(null) : checkCostBudget(settings).catch(() => null),
    ]);
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
  const availableModels = await modelsPromise;
  const baseSystem = (targetModel: AIModel) => buildBaseSystem(targetModel, availableModels);
  let projectInstructions = "";
  const prj = await projectPromise;
  if (prj?.instructions) projectInstructions = `[Project instructions — always follow]:\n${prj.instructions}`;

  const imgIntent = isImageGenerationRequest(body.content);
  let enabledToolNames: string[] = ["calculator", "file_search", "generate_image", "create_document"];
  if (Array.isArray(body.tools)) {
    enabledToolNames = body.tools;
  } else if (body.tools && typeof body.tools === "object") {
    enabledToolNames = [];
    const tObj = body.tools as Record<string, boolean>;
    if (tObj.calculator !== false) enabledToolNames.push("calculator");
    if (tObj.fileSearch !== false) enabledToolNames.push("file_search");
    if (tObj.webSearch) enabledToolNames.push("web_search");
    if (tObj.generateImage !== false) enabledToolNames.push("generate_image");
    if (tObj.createDocument !== false) enabledToolNames.push("create_document");
  }
  if (imgIntent.isImage && !enabledToolNames.includes("generate_image")) {
    enabledToolNames.push("generate_image");
  }
  const enabledTools = TOOL_DEFS.filter((t) => enabledToolNames.includes(t.name));

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

  const activeTask = registerActiveTask(conv.id, user.id, optimized.routing.modelId);
  const requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let isControllerClosed = false;
      const send = (t: string, d: unknown) => {
        if (isControllerClosed) return;
        try {
          controller.enqueue(enc.encode(sseEncode(t, d)));
        } catch {
          // Client disconnected / lost internet, but VPS keeps running AI call in background!
          isControllerClosed = true;
        }
      };
      send("conversation", { conversationId: conv.id, title: conv.title });
      if (imgIntent.isImage) {
        send("image_generating", { prompt: imgIntent.prompt });
        send("status", { status: `Đang vẽ hình ảnh: ${imgIntent.prompt}…` });
      }
      const started = Date.now();
      let full = "";
      let assistantMsgSaved = false;
      const toolEvents: Array<{ id: string; name: string; input: unknown; output: string }> = [];
      try {
        // ── Direct Image Generation branch: user requested an image/artwork ──
        if (imgIntent.isImage) {
          send("image_generating", { prompt: imgIntent.prompt });
          send("status", { status: `Đang kết nối endpoint AI để tạo hình ảnh: "${imgIntent.prompt}"…` });

          try {
            const imageResult = await generateImage({
              prompt: imgIntent.prompt,
              aspectRatio: imgIntent.aspectRatio || "1:1",
              style: imgIntent.style,
              userId: user.id,
              conversationId: conv.id,
              projectId: conv.projectId ?? undefined,
            });

            const finalImgUrl = imageResult.url || (imageResult.id ? `/api/files/${imageResult.id}` : "");
            const validFileId = imageResult.fileId || (imageResult.id && !imageResult.id.startsWith("img_") ? imageResult.id : undefined);

            send("image_generated", {
              url: finalImgUrl,
              fileId: validFileId,
              fileName: imageResult.fileName,
              prompt: imageResult.prompt,
              aspectRatio: imageResult.aspectRatio,
              model: imageResult.model,
            });

            const replyText = `Tôi đã tạo hình ảnh theo yêu cầu cho bạn: "${imageResult.prompt}".`;
            send("token", { delta: replyText });

            const assistantMsg = await createMessage({
              conversationId: conv.id,
              role: "assistant",
              content: replyText,
              parts: [
                { type: "text", text: replyText },
                {
                  type: "image",
                  url: finalImgUrl,
                  fileId: validFileId,
                  fileName: imageResult.fileName,
                  mimeType: "image/png",
                },
              ],
              modelId: imageResult.model || "image_gen",
            });
            assistantMsgSaved = true;

            send("done", {
              messageId: assistantMsg.id,
              text: replyText,
              parts: [
                { type: "text", text: replyText },
                {
                  type: "image",
                  url: finalImgUrl,
                  fileId: validFileId,
                  fileName: imageResult.fileName,
                  mimeType: "image/png",
                },
              ],
            });
            controller.close();
            return;
          } catch (imgErr) {
            console.warn("[ImageGen] Direct image generation error, falling back to gateway:", imgErr);
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

        const promptEnforcement = isPromptCreationRequest(body.content)
          ? `\n\n[MANDATORY PROMPT FORMATTING — CHATGPT STYLE SEPARATION]:
The user requested a prompt. Follow the standard ChatGPT layout with CLEAR SEPARATION:
1. OUTSIDE BEFORE THE BOX: Brief conversational intro (e.g. "Dưới đây là prompt bạn có thể sử dụng:").
2. INSIDE THE BOX: Enclose ONLY the actual ready-to-run prompt text inside a single code block using FOUR BACKTICKS (\`\`\`\`) labeled:
\`\`\`\`markdown:prompt.md
<ONLY the core prompt instructions/role/task to be copied here>
\`\`\`\`
   - Inside this box must be ONLY the prompt itself.
   - DO NOT put greetings, conversational chatter, or explanations inside this box!
   - You MUST use FOUR backticks (\`\`\`\`) for the outer container and close with \`\`\`\`.
3. OUTSIDE AFTER THE BOX: Provide any usage tips, explanations, or parameter customization instructions in normal Markdown text OUTSIDE and below the code block.`
          : "";

        const imageGenGuidance = imgIntent.isImage
          ? `\n\n[CRITICAL IMAGE GENERATION INSTRUCTION]:
The user explicitly requests generating or drawing an image for: "${imgIntent.prompt}".
You MUST call the "generate_image" tool with prompt: "${imgIntent.prompt}" to create the artwork.`
          : "";

        const result = await runGateway({
          modelId: optimized.routing.modelId,
          messages: optimized.messages.map((m, i) => i === optimized.messages.length - 1 ? { ...m, attachments: atts } : m),
          system: `${optimized.system}${promptEnforcement}${imageGenGuidance}`,
          stableSystemPrefix: optimized.stableSystemPrefix,
          tools: enabledTools,
          maxTokens: undefined,
          supportsStreaming,
          capabilities: modelMeta?.capabilities,
          reasoningEffort: body.reasoningEffort ?? body.model_reasoning_effort ?? body.reasoning_effort,
          cb: {
            onToken: (t) => {
              full += t;
              appendTaskToken(conv.id, t);
              send("token", { delta: t });
            },
            onToolCall: (id, name, input) => send("tool_call", { id, name, input }),
            onStatus: (st) => send("status", { status: st }),
            // Decoupled: only abort when user explicitly stops, NOT when user's local network drops!
            signal: activeTask.abortController.signal,
          },
          executeTool: (name, input) =>
            executeTool(name, input, {
              conversationId: conv.id,
              projectId: conv.projectId ?? undefined,
              userId: user.id,
            }),
        });
        const generatedImageParts: Array<{
          type: "image";
          url: string;
          fileId?: string;
          fileName?: string;
          mimeType: string;
        }> = [];

        const generatedFileParts: Array<{
          type: "file";
          fileName: string;
          fileId: string;
          url: string;
          mimeType: string;
        }> = [];

        for (const tc of result.toolCalls) {
          toolEvents.push(tc);
          send("tool_result", { id: tc.id, name: tc.name, status: "success" });
          if (tc.name === "generate_image" && tc.output) {
            try {
              const imgData = JSON.parse(tc.output);
              if (imgData.success && (imgData.imageUrl || imgData.fileId)) {
                const finalImgUrl = imgData.imageUrl || (imgData.fileId ? `/api/files/${imgData.fileId}` : "");
                generatedImageParts.push({
                  type: "image",
                  url: finalImgUrl,
                  fileId: imgData.fileId || undefined,
                  fileName: imgData.fileName || "ai-generated-image.png",
                  mimeType: "image/png",
                });
                send("image_generated", {
                  url: finalImgUrl,
                  fileId: imgData.fileId || undefined,
                  fileName: imgData.fileName,
                  prompt: imgData.prompt,
                  aspectRatio: imgData.aspectRatio,
                  model: imgData.model,
                });
              }
            } catch {}
          }
          if (tc.name === "create_document" && tc.output) {
            try {
              const artData = JSON.parse(tc.output);
              if (artData.success && artData.fileId) {
                generatedFileParts.push({
                  type: "file",
                  fileName: artData.fileName,
                  fileId: artData.fileId,
                  url: artData.url,
                  mimeType: artData.mimeType,
                });
                send("artifact", {
                  id: artData.fileId,
                  fileName: artData.fileName,
                  kind: artData.kind,
                  mimeType: artData.mimeType,
                  sizeBytes: artData.sizeBytes,
                  url: artData.url,
                });
              }
            } catch {}
          }
        }

        // Auto-generation fallback: If user requested an image but the model did not execute tool call
        if (imgIntent.isImage && generatedImageParts.length === 0) {
          try {
            send("status", { status: "Đang tự động khởi tạo hình ảnh cho bạn…" });
            const autoImg = await generateImage({
              prompt: imgIntent.prompt,
              userId: user.id,
              conversationId: conv.id,
              projectId: conv.projectId ?? undefined,
            });
            if (autoImg && (autoImg.url || autoImg.id)) {
              const autoUrl = autoImg.url || (autoImg.id ? `/api/files/${autoImg.id}` : "");
              const validFileId = autoImg.fileId || (autoImg.id && !autoImg.id.startsWith("img_") ? autoImg.id : undefined);
              generatedImageParts.push({
                type: "image",
                url: autoUrl,
                fileId: validFileId,
                fileName: autoImg.fileName || "ai-generated-image.png",
                mimeType: "image/png",
              });
              send("image_generated", {
                url: autoUrl,
                fileId: validFileId,
                fileName: autoImg.fileName,
                prompt: autoImg.prompt,
                aspectRatio: autoImg.aspectRatio,
                model: autoImg.model,
              });
            }
          } catch (err) {
            console.warn("[AutoImageGen] stream fallback error:", err);
          }
        }

        // Clean up refusal text if the LLM outputted refusal or prompt block when user wanted an image
        if (imgIntent.isImage) {
          const refusalRegex = /không\s+(?:thể|hỗ\s+trợ)\s+(?:trực\s+tiếp\s+)?tạo\s+(?:hình\s+)?ảnh|không\s+có\s+khả\s+năng\s+tạo\s+ảnh|cannot\s+generate\s+images|i\s+can't\s+create\s+images|chưa\s+hỗ\s+trợ\s+tạo\s+ảnh|không\s+thể\s+vẽ/i;
          if (!full.trim() || refusalRegex.test(full) || full.includes("markdown:prompt.md") || full.includes("prompt.md")) {
            full = `Tôi đã tạo hình ảnh theo yêu cầu cho bạn: "${imgIntent.prompt}".`;
          }
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
            ...generatedImageParts,
            ...generatedFileParts,
            ...toolEvents.map((t) => ({ type: "tool_call" as const, toolName: t.name, toolCallId: t.id, toolInput: t.input, toolOutput: t.output, status: "success" as const })),
          ],
          modelId: respondingModelId,
        });
        assistantMsgSaved = true;
        await updateMessageStats(assistantMsg.id, inTok, outTok, cost);
        if (respondingModelId && conv.modelId !== respondingModelId) {
          void updateConversation(conv.id, user.id, { modelId: respondingModelId }).catch(() => {});
        }
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
        completeActiveTask(conv.id, assistantMsg.id, Date.now() - started);
        send("done", { messageId: assistantMsg.id, latencyMs: Date.now() - started, parts: assistantMsg.parts });
        try { controller.close(); } catch { /* ignore */ }
      } catch (e) {
        if (activeTask.abortController.signal.aborted) {
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
        failActiveTask(conv.id, friendlyMsg);
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
