import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { fail, ok } from "@/lib/http";
import {
  getConversation,
  createConversation,
  createMessage,
  updateMessageStats,
  getAttachment,
  getProject,
  recordUsage,
  listMessages,
} from "@/lib/db/repos";
import { resolveModel } from "@/lib/ai/providers-config";
import { runGateway, type VisionAttachment } from "@/lib/ai/gateway";
import { executeTool } from "@/lib/tools/tools";
import { calcCost, estimateTokens } from "@/lib/ai/registry";
import { getCustomModelsAsAIModels } from "@/lib/ai/custom-endpoints";
import { loadCachedModels } from "@/lib/ai/models-loader";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";
import { downloadBuffer } from "@/lib/files/storage";
import { getOptimizationSettings, parseUserMode } from "@/lib/ai/optimization/settings";
import { optimizeContext } from "@/lib/ai/optimization/optimize";
import { calculateCost, checkUserQuota, checkCostBudget, recordOptimizedUsage } from "@/lib/ai/optimization/usage";
import { isUpstreamUnsupportedError } from "@/lib/ai/streaming-capabilities";
import type { AIModel } from "@/types";

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

export async function POST(req: Request): Promise<Response> {
  const user = await requireUser().catch(() => null);
  if (!user) return fail("Chưa đăng nhập", 401);
  const ip = req.headers.get("x-forwarded-for") ?? user.id;
  const rl = rateLimit(`chat:${ip}`, config.rateLimit.chatPerMin);
  if (!rl.ok) return fail(`Gửi quá nhanh, thử lại sau ${rl.retryAfterSec}s.`, 429);

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return fail("Dữ liệu không hợp lệ.", 400);
  }

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

  const started = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Attachments processing
  const atts: VisionAttachment[] = [];
  for (const id of body.attachmentIds) {
    const a = await getAttachment(id).catch(() => null);
    if (!a || a.userId !== user.id) continue;
    const kind = a.mimeType.startsWith("image/") ? "image" : a.mimeType.startsWith("video/") ? "video" : "file";
    let dataUrl = "";
    try {
      const buf = await downloadBuffer(a.storagePath);
      if (buf.length < 15 * 1024 * 1024) dataUrl = `data:${a.mimeType};base64,${buf.toString("base64")}`;
    } catch { /* fallback */ }
    atts.push({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      dataUrl,
      kind,
      parsedText: a.parsedText,
    });
  }

  const modelsPromise = loadCachedModels().catch(() => [] as AIModel[]);
  const settingsPromise = getOptimizationSettings();
  const projectPromise = conv.projectId ? getProject(conv.projectId, user.id).catch(() => null) : Promise.resolve(null);

  const [availableModels, effectiveSettings, project] = await Promise.all([
    modelsPromise,
    settingsPromise,
    projectPromise,
  ]);

  const userMode = parseUserMode(body.optimizationMode) ?? effectiveSettings.mode;
  await Promise.all([
    checkUserQuota(user.id, effectiveSettings).catch(() => null),
    user.role === "admin" ? Promise.resolve(null) : checkCostBudget(effectiveSettings).catch(() => null),
  ]);

  const history = await listMessages(conv.id, 50);
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
  const projectInstructions = project?.instructions ? `[Project instructions — always follow]:\n${project.instructions}` : "";
  const { modelId } = await resolveModel({ explicit: body.modelId, hasVideo: false, hasImage: false });

  // Optimize context
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
    toolsEnabled: false,
    models: availableModels,
    explicitModelId: body.modelId && body.modelId !== "auto" ? modelId : undefined,
    mode: userMode,
    responseLength: body.responseLength,
    settings: effectiveSettings,
    projectId: conv.projectId ?? body.projectId ?? undefined,
  });

  const allModels = [...availableModels, ...(await getCustomModelsAsAIModels().catch(() => []))];
  const modelMeta = allModels.find((m) => m.id === optimized.routing.modelId);

  let full = "";
  const toolEvents: Array<{ id: string; name: string; input: unknown; output: string }> = [];

  try {
    const result = await runGateway({
      modelId: optimized.routing.modelId,
      messages: optimized.messages.map((m, i) =>
        i === optimized.messages.length - 1 ? { ...m, attachments: atts } : m
      ),
      system: optimized.system,
      stableSystemPrefix: optimized.stableSystemPrefix,
      tools: [],
      maxTokens: undefined,
      supportsStreaming: false, // Explicitly non-streaming request
      capabilities: modelMeta?.capabilities,
      cb: {
        onToken: (t) => {
          full += t;
        },
        signal: req.signal,
      },
      executeTool: (name, input) =>
        executeTool(name, input, {
          conversationId: conv.id,
          projectId: conv.projectId ?? undefined,
        }),
    });

    full = result.text;
    for (const tc of result.toolCalls) {
      toolEvents.push(tc);
    }

    const inTok =
      result.inputTokens ||
      estimateTokens(optimized.system + optimized.messages.map((m) => m.content).join("\n"));
    const outTok = result.outputTokens || estimateTokens(full);
    const cost = modelMeta
      ? calculateCost(modelMeta, {
          inputTokens: inTok,
          outputTokens: outTok,
          cachedInputTokens: result.cachedInputTokens,
          cacheCreationTokens: result.cacheCreationTokens,
        })
      : calcCost(optimized.routing.modelId, inTok, outTok, allModels);

    // Save assistant message to database
    const assistantMsg = await createMessage({
      conversationId: conv.id,
      role: "assistant",
      content: full,
      parts: [{ type: "text", text: full }],
      modelId: optimized.routing.modelId,
    });
    await updateMessageStats(assistantMsg.id, inTok, outTok, cost);

    // Record usage
    await recordOptimizedUsage({
      userId: user.id,
      conversationId: conv.id,
      messageId: assistantMsg.id,
      model: optimized.routing.modelId,
      provider: result.provider,
      functionKey: "chat",
      usage: {
        inputTokens: inTok,
        outputTokens: outTok,
        cachedInputTokens: result.cachedInputTokens,
        cacheCreationTokens: result.cacheCreationTokens,
        latencyMs: Date.now() - started,
      },
      costUsd: cost,
      requestId,
      routingReason: optimized.routing.reason,
      optimizationStrategy: optimized.result.strategy,
      tokensSaved: optimized.result.tokensSaved,
      tokensWithoutOptimization: optimized.result.tokensWithoutOptimization,
    }).catch(async (e) => {
      if (e instanceof Error && /column|does not exist/i.test(e.message)) {
        await recordUsage({
          userId: user.id,
          conversationId: conv.id,
          model: optimized.routing.modelId,
          provider: result.provider,
          functionKey: "chat",
          inputTokens: inTok,
          outputTokens: outTok,
          totalTokens: inTok + outTok,
          costUsd: cost,
          durationMs: Date.now() - started,
        }).catch(() => {});
      }
    });

    return ok({
      id: assistantMsg.id,
      conversationId: conv.id,
      content: full,
      model: optimized.routing.modelId,
      provider: result.provider,
      usage: {
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: inTok + outTok,
        costUsd: cost,
      },
    });
  } catch (e) {
    const rawErrMsg = e instanceof Error ? e.message : "AI lỗi, thử lại sau.";
    const friendlyMsg = isUpstreamUnsupportedError(rawErrMsg)
      ? "Mô hình này không hỗ trợ streaming. Đang sử dụng chế độ phản hồi đầy đủ."
      : rawErrMsg;
    return fail(friendlyMsg, 500);
  }
}
