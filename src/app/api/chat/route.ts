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
import { executeTool, TOOL_DEFS } from "@/lib/tools/tools";
import { isImageGenerationRequest, generateImage } from "@/lib/ai/image-gen";
import { calcCost, estimateTokens } from "@/lib/ai/registry";
import { getCustomModelsAsAIModels } from "@/lib/ai/custom-endpoints";
import { loadCachedModels } from "@/lib/ai/models-loader";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";
import { downloadBuffer } from "@/lib/files/storage";
import { getOptimizationSettings, parseUserMode } from "@/lib/ai/optimization/settings";
import { optimizeContext } from "@/lib/ai/optimization/optimize";
import { calculateCost, checkUserQuota, checkCostBudget, recordOptimizedUsage } from "@/lib/ai/optimization/usage";
import { buildBaseSystem } from "@/lib/ai/system-prompt";
import { isUpstreamUnsupportedError } from "@/lib/ai/streaming-capabilities";
import { isPromptCreationRequest } from "@/lib/prompt-intent";
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
  reasoningEffort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
  model_reasoning_effort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
  reasoning_effort: z.enum(["minimal", "low", "medium", "high", "max"]).optional(),
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
  const baseSystem = (targetModel: AIModel) => buildBaseSystem(targetModel, availableModels);
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
    const promptEnforcement = isPromptCreationRequest(body.content)
      ? `\n\n[MANDATORY FORMATTING REQUIREMENT]:
The user requested a prompt. You MUST output the entire prompt enclosed inside a single file code block using FOUR BACKTICKS (\`\`\`\`) labeled:
\`\`\`\`markdown:prompt.md
<complete prompt content here>
\`\`\`\`
CRITICAL:
1. You MUST use FOUR backticks (\`\`\`\`) for the outer container: \`\`\`\`markdown:prompt.md and close with \`\`\`\`.
2. NEVER use three backticks (\`\`\`) for the outer prompt block, because prompts often describe code or code files, and using 3 backticks will prematurely close and fragment the prompt.
3. DO NOT output fragmented or empty code blocks (like \`\`\`css:style.css \`\`\`). Keep all instructions inside the single \`\`\`\`markdown:prompt.md\`\`\`\` block.
4. DO NOT use plain text headings outside code blocks.
5. The prompt MUST be 100% inside this single block so the user can 1-click copy and insert it into their chat composer!`
      : "";

    const imgIntent = isImageGenerationRequest(body.content);
    if (imgIntent.isImage) {
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
        const replyText = `Tôi đã tạo hình ảnh theo yêu cầu cho bạn: "${imageResult.prompt}".`;

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

        return ok({
          messageId: assistantMsg.id,
          text: replyText,
          parts: assistantMsg.parts,
          model: imageResult.model || "image_gen",
          costUsd: 0,
        });
      } catch (imgErr) {
        console.warn("[ImageGen] Direct image generation failed, falling back to chat gateway:", imgErr);
      }
    }

    const imageGenGuidance = imgIntent.isImage
      ? `\n\n[CRITICAL IMAGE GENERATION INSTRUCTION]:
The user explicitly requests generating or drawing an image for: "${imgIntent.prompt}".
You MUST call the "generate_image" tool with prompt: "${imgIntent.prompt}" to create the artwork.`
      : "";

    const enabledTools = TOOL_DEFS.filter((t) => ["calculator", "file_search", "generate_image"].includes(t.name));

    const result = await runGateway({
      modelId: optimized.routing.modelId,
      messages: optimized.messages.map((m, i) =>
        i === optimized.messages.length - 1 ? { ...m, attachments: atts } : m
      ),
      system: `${optimized.system}${promptEnforcement}${imageGenGuidance}`,
      stableSystemPrefix: optimized.stableSystemPrefix,
      tools: enabledTools,
      maxTokens: undefined,
      supportsStreaming: false, // Explicitly non-streaming request
      capabilities: modelMeta?.capabilities,
      reasoningEffort: body.reasoningEffort ?? body.model_reasoning_effort ?? body.reasoning_effort,
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

    for (const tc of result.toolCalls) {
      toolEvents.push(tc);
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
          }
        } catch {}
      }
    }

    // Auto-generation fallback: If user requested an image but the model did not execute tool call
    if (imgIntent.isImage && generatedImageParts.length === 0) {
      try {
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
        }
      } catch (err) {
        console.warn("[AutoImageGen] non-stream fallback error:", err);
      }
    }

    // Clean up refusal text if the LLM outputted refusal or prompt block when user wanted an image
    if (imgIntent.isImage) {
      const refusalRegex = /không\s+(?:thể|hỗ\s+trợ)\s+(?:trực\s+tiếp\s+)?tạo\s+(?:hình\s+)?ảnh|không\s+có\s+khả\s+năng\s+tạo\s+ảnh|cannot\s+generate\s+images|i\s+can't\s+create\s+images|chưa\s+hỗ\s+trợ\s+tạo\s+ảnh|không\s+thể\s+vẽ/i;
      if (!full.trim() || refusalRegex.test(full) || full.includes("markdown:prompt.md") || full.includes("prompt.md")) {
        full = `Tôi đã tạo hình ảnh theo yêu cầu cho bạn: "${imgIntent.prompt}".`;
      }
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
      parts: [
        { type: "text", text: full },
        ...generatedImageParts,
        ...toolEvents.map((t) => ({
          type: "tool_call" as const,
          toolName: t.name,
          toolCallId: t.id,
          toolInput: t.input,
          toolOutput: t.output,
          status: "success" as const,
        })),
      ],
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
