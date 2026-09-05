import { uid } from "@/lib/db/supabase";
import { getRoute, getProviderConfig } from "@/lib/ai/providers-config";
import { getEndpointCredentials, getAvailableCustomModels } from "@/lib/ai/custom-endpoints";
import { parseModelRef } from "@/lib/ai/registry";
import { uploadBuffer } from "@/lib/files/storage";
import { createAttachment } from "@/lib/db/repos";
import type { AIModel } from "@/types";

export interface ImageGenParams {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | string;
  style?: string;
  modelId?: string;
  userId?: string;
  conversationId?: string;
  projectId?: string;
}

export interface GeneratedImageResult {
  id: string;
  fileId?: string;
  url: string;
  fileName: string;
  prompt: string;
  aspectRatio: string;
  width: number;
  height: number;
  model: string;
  style?: string;
  createdAt: string;
}

export const ASPECT_RATIOS: Record<string, { width: number; height: number; label: string; ratio: string }> = {
  "1:1": { width: 1024, height: 1024, label: "Vuông 1:1 (Avatar / Social)", ratio: "1:1" },
  "16:9": { width: 1792, height: 1024, label: "Ngang 16:9 (Hình nền / YouTube)", ratio: "16:9" },
  "9:16": { width: 1024, height: 1792, label: "Dọc 9:16 (Story / TikTok)", ratio: "9:16" },
  "4:3": { width: 1024, height: 768, label: "Khổ ngang 4:3 (Tiêu chuẩn)", ratio: "4:3" },
  "3:4": { width: 768, height: 1024, label: "Khổ dọc 3:4 (Chân dung)", ratio: "3:4" },
};

export const STYLE_PRESETS: Record<string, { label: string; promptSuffix: string }> = {
  photographic: { label: "Nhiếp ảnh chân thực", promptSuffix: "photorealistic, 8k resolution, shot on 35mm lens, natural lighting, highly detailed" },
  cinematic: { label: "Điện ảnh (Cinematic)", promptSuffix: "cinematic still, dramatic lighting, 8k, moody atmosphere, depth of field, anamorphic lens" },
  anime: { label: "Anime / Manga", promptSuffix: "vibrant anime artwork, Makoto Shinkai aesthetic, clean lines, beautiful composition, masterwork" },
  digital_art: { label: "Nghệ thuật số", promptSuffix: "detailed digital art, trending on ArtStation, dynamic lighting, vivid colors, fantasy illustration" },
  cyberpunk: { label: "Cyberpunk", promptSuffix: "cyberpunk city, neon lights, night scene, volumetric fog, futuristic technology, high contrast" },
  three_d: { label: "3D Render / CGI", promptSuffix: "3D render, Octane render, raytracing, Pixar-like quality, smooth textures, subsurface scattering" },
  watercolor: { label: "Tranh màu nước", promptSuffix: "watercolor painting, artistic brush strokes, soft edges, paper texture, subtle gradients" },
  minimalist: { label: "Tối giản (Minimalist)", promptSuffix: "minimalist vector design, clean shapes, harmonious color palette, flat art, elegant" },
};

/**
 * Returns available image generation models (including admin custom endpoints with image_gen capability)
 */
export async function getAvailableImageModels(): Promise<{ models: AIModel[]; activeRoute: string }> {
  let activeRoute = await getRoute("image_gen").catch(() => "");
  const customs = await getAvailableCustomModels().catch(() => []);
  const imageCustoms = customs.filter(
    (m) => m.capabilities?.includes("image_gen") || /flux|dall|sdxl|diffusion|imagen|midjourney/i.test(m.id)
  );

  if (!activeRoute && imageCustoms.length > 0) {
    activeRoute = imageCustoms[0].id;
  }
  if (!activeRoute) {
    activeRoute = "openai:dall-e-3";
  }

  const defaultModels: AIModel[] = [
    {
      id: "openai:dall-e-3",
      provider: "openai",
      name: "DALL·E 3 (OpenAI)",
      contextWindow: 4096,
      capabilities: ["image_gen"],
      inputPricePerM: 0,
      outputPricePerM: 0,
      enabled: true,
      requiresKey: true,
      description: "Mô hình tạo ảnh chân thực, sắc nét và bám sát prompt hàng đầu của OpenAI.",
    },
    {
      id: "openrouter:black-forest-labs/flux-1-schnell",
      provider: "openrouter",
      name: "FLUX.1 Schnell (Black Forest Labs)",
      contextWindow: 4096,
      capabilities: ["image_gen"],
      inputPricePerM: 0,
      outputPricePerM: 0,
      enabled: true,
      requiresKey: true,
      description: "Mô hình sinh ảnh thế hệ mới với tốc độ siêu nhanh và độ chi tiết cực cao.",
    },
    {
      id: "openrouter:stabilityai/stable-diffusion-xl-base-1.0",
      provider: "openrouter",
      name: "Stable Diffusion XL 1.0",
      contextWindow: 4096,
      capabilities: ["image_gen"],
      inputPricePerM: 0,
      outputPricePerM: 0,
      enabled: true,
      requiresKey: true,
      description: "Mô hình tạo ảnh mã nguồn mở kinh điển của Stability AI.",
    },
  ];

  const all = [...imageCustoms, ...defaultModels];
  return { models: all, activeRoute };
}

/**
 * Resolves standard OpenAI-compatible image dimensions.
 * Standard endpoints (DALL-E 3, Gemini Image proxies, Flux, Midjourney)
 * strictly require 1024x1024, 1024x1792 (portrait), or 1792x1024 (landscape).
 */
export function resolveApiImageSize(aspectRatio?: string, width = 1024, height = 1024): string {
  if (aspectRatio === "9:16" || aspectRatio === "3:4" || height > width) {
    return "1024x1792";
  }
  if (aspectRatio === "16:9" || aspectRatio === "4:3" || width > height) {
    return "1792x1024";
  }
  return "1024x1024";
}

/**
 * Sniffs image buffer magic bytes to determine exact MIME type and extension.
 */
export function detectImageFormat(buf: Buffer): { mimeType: string; ext: string } {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: "image/jpeg", ext: "jpg" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mimeType: "image/png", ext: "png" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", ext: "webp" };
  }
  return { mimeType: "image/png", ext: "png" };
}

/**
 * Automatically resolves the active image generation model:
 * 1. Explicit modelId if provided
 * 2. Admin routed model for "image_gen"
 * 3. Any enabled Custom Endpoint model with "image_gen" capability
 * 4. Provider models (OpenAI DALL-E, OpenRouter Flux)
 */
export async function resolveImageModel(preferredModelId?: string): Promise<string> {
  if (preferredModelId && preferredModelId !== "auto") {
    return preferredModelId;
  }
  const routed = await getRoute("image_gen").catch(() => null);
  if (routed) {
    const ref = parseModelRef(routed);
    if (ref.provider === "custom" && ref.endpointId) {
      const cred = await getEndpointCredentials(ref.endpointId).catch(() => null);
      if (cred && cred.enabled) return routed;
    } else {
      const cfg = await getProviderConfig(ref.provider).catch(() => null);
      if (cfg && cfg.enabled && cfg.hasKey) return routed;
    }
  }

  // Fallback to any enabled custom model with image_gen capability
  const customs = await getAvailableCustomModels().catch(() => []);
  const customImg = customs.find(
    (m) =>
      (m.capabilities?.includes("image_gen") ||
        /flux|dall|sdxl|diffusion|imagen|midjourney|image/i.test(m.id)) &&
      m.enabled !== false
  );
  if (customImg) {
    return customImg.id;
  }

  // Fallback to OpenAI or OpenRouter if keys configured
  const openAiCfg = await getProviderConfig("openai").catch(() => null);
  if (openAiCfg?.enabled && openAiCfg?.hasKey) {
    return "openai:dall-e-3";
  }

  return routed || "openai:dall-e-3";
}

/**
 * Core image generation function.
 * Dispatches to Admin-configured endpoint (DALL-E 3, OpenRouter, Custom Endpoint, or Fallback).
 */
export async function generateImage(params: ImageGenParams): Promise<GeneratedImageResult> {
  const prompt = (params.prompt || "").trim();
  if (!prompt) {
    throw new Error("Prompt tạo ảnh không được để trống.");
  }

  const aspectRatio = params.aspectRatio || "1:1";
  const dim = ASPECT_RATIOS[aspectRatio] || ASPECT_RATIOS["1:1"];
  const width = dim.width;
  const height = dim.height;

  // Enhance prompt with style if provided
  let fullPrompt = prompt;
  if (params.style && STYLE_PRESETS[params.style]) {
    fullPrompt = `${prompt}, ${STYLE_PRESETS[params.style].promptSuffix}`;
  }

  // Resolve model to use
  const modelToUse = await resolveImageModel(params.modelId);

  let imageBuffer: Buffer | null = null;
  let mimeType = "image/png";

  const ref = parseModelRef(modelToUse);
  const apiSize = resolveApiImageSize(aspectRatio, width, height);

  let lastError = "";

  // 1. Try Custom Endpoint if routed to a custom model
  if (ref.provider === "custom" && ref.endpointId) {
    try {
      const cred = await getEndpointCredentials(ref.endpointId);
      if (cred && cred.enabled) {
        const cleanBase = cred.baseUrl.replace(/\/$/, "");
        const url = cleanBase.endsWith("/images/generations")
          ? cleanBase
          : `${cleanBase}/images/generations`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (cred.key) {
          headers["Authorization"] = `Bearer ${cred.key}`;
        }

        const callEndpoint = async (sizeParam?: string) => {
          const bodyPayload: Record<string, unknown> = {
            prompt: fullPrompt,
            model: ref.model,
            n: 1,
            response_format: "b64_json",
          };
          if (sizeParam) bodyPayload.size = sizeParam;
          return fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(bodyPayload),
          });
        };

        let resp: Response | null = null;
        try {
          resp = await callEndpoint(apiSize);
        } catch (fetchErr) {
          lastError = `Không thể kết nối đến ${url}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
        }

        // If 502 / 503 / 504 from reverse proxy / cloudflare, retry once after short delay
        if (resp && (resp.status === 502 || resp.status === 503 || resp.status === 504)) {
          console.warn(`[ImageGen] Custom endpoint returned ${resp.status}, retrying once after 1.2s...`);
          await new Promise((r) => setTimeout(r, 1200));
          try {
            resp = await callEndpoint(apiSize);
          } catch {}
        }

        // If rejected due to size (400), retry with 1024x1024
        if (resp && !resp.ok && resp.status === 400 && apiSize !== "1024x1024") {
          console.warn(`[ImageGen] Custom endpoint returned 400 for size ${apiSize}, retrying with 1024x1024`);
          try {
            resp = await callEndpoint("1024x1024");
          } catch {}
        }
        // If still 400, retry without size parameter
        if (resp && !resp.ok && resp.status === 400) {
          console.warn(`[ImageGen] Custom endpoint returned 400, retrying without size parameter`);
          try {
            resp = await callEndpoint(undefined);
          } catch {}
        }

        if (resp && resp.ok) {
          const json = await resp.json();
          const item = json.data?.[0];
          if (item?.b64_json) {
            imageBuffer = Buffer.from(item.b64_json, "base64");
          } else if (item?.url) {
            const dl = await fetch(item.url);
            if (dl.ok) imageBuffer = Buffer.from(await dl.arrayBuffer());
          } else if (typeof json.images?.[0] === "string") {
            const b64 = json.images[0].replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(b64, "base64");
          } else if (typeof json.output?.[0] === "string") {
            const b64 = json.output[0].replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(b64, "base64");
          }
        } else if (resp) {
          const errText = await resp.text().catch(() => "");
          lastError = `Endpoint '${cred.name}' (${url}) báo lỗi ${resp.status}: ${errText.slice(0, 200)}`;
          console.warn(`[ImageGen] Custom endpoint error: ${lastError}`);
        }
      } else {
        lastError = `Endpoint '${ref.endpointId}' không tồn tại hoặc đã bị tắt.`;
      }
    } catch (err) {
      lastError = `Lỗi kết nối Custom endpoint: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[ImageGen] Custom endpoint exception:`, err);
    }
  }

  // 2. Try OpenAI DALL-E if routed or if custom wasn't available
  if (!imageBuffer && (ref.provider === "openai" || modelToUse.includes("dall-e"))) {
    try {
      const openAiCfg = await getProviderConfig("openai");
      const key = openAiCfg?.keyHint || process.env.OPENAI_API_KEY;
      if (key) {
        const resp = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: fullPrompt,
            size: apiSize,
            quality: "standard",
            response_format: "b64_json",
            n: 1,
          }),
        });

        if (resp.ok) {
          const json = await resp.json();
          const b64 = json.data?.[0]?.b64_json;
          if (b64) imageBuffer = Buffer.from(b64, "base64");
        } else {
          const errText = await resp.text().catch(() => "");
          lastError = `OpenAI DALL-E báo lỗi ${resp.status}: ${errText.slice(0, 200)}`;
          console.warn(`[ImageGen] OpenAI DALL-E error: ${lastError}`);
        }
      } else {
        lastError = "Chưa cấu hình API Key cho OpenAI trong Cài đặt Provider.";
      }
    } catch (err) {
      lastError = `Lỗi gọi OpenAI DALL-E: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[ImageGen] OpenAI DALL-E call error:`, err);
    }
  }

  // 3. Try OpenRouter if routed or model is openrouter
  if (!imageBuffer && (ref.provider === "openrouter" || modelToUse.startsWith("openrouter:"))) {
    try {
      const openRouterCfg = await getProviderConfig("openrouter");
      const key = openRouterCfg?.keyHint || process.env.OPENROUTER_API_KEY;
      if (key) {
        const resp = await fetch("https://openrouter.ai/api/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: ref.model || "black-forest-labs/flux-1-schnell",
            prompt: fullPrompt,
            response_format: "b64_json",
            n: 1,
          }),
        });

        if (resp.ok) {
          const json = await resp.json();
          const b64 = json.data?.[0]?.b64_json;
          if (b64) imageBuffer = Buffer.from(b64, "base64");
        } else {
          const errText = await resp.text().catch(() => "");
          lastError = `OpenRouter báo lỗi ${resp.status}: ${errText.slice(0, 200)}`;
          console.warn(`[ImageGen] OpenRouter error: ${lastError}`);
        }
      } else {
        lastError = "Chưa cấu hình API Key cho OpenRouter trong Cài đặt Provider.";
      }
    } catch (err) {
      lastError = `Lỗi gọi OpenRouter: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`[ImageGen] OpenRouter call error:`, err);
    }
  }

  // 4. Strict check: Must have real image buffer from endpoint. NEVER fallback to SVG!
  if (!imageBuffer) {
    throw new Error(
      lastError ||
      `Endpoint tạo ảnh không trả về dữ liệu hình ảnh (Model: ${modelToUse}). Vui lòng kiểm tra lại cấu hình endpoint.`
    );
  }

  const format = detectImageFormat(imageBuffer);
  mimeType = format.mimeType;
  const fileExt = format.ext;

  // Generate file name & id
  let attachmentId: string | undefined = undefined;
  const tempFileId = uid("img_");
  const fileName = `ai_gen_${Date.now()}_${aspectRatio.replace(":", "x")}.${fileExt}`;
  const storagePath = `${params.userId || "shared"}/images/${tempFileId}-${fileName}`;

  let finalUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  // Upload to Supabase storage if available
  try {
    await uploadBuffer(storagePath, imageBuffer, mimeType);
    if (params.userId) {
      const rec = await createAttachment({
        userId: params.userId,
        conversationId: params.conversationId || null,
        projectId: params.projectId || null,
        fileName,
        mimeType,
        sizeBytes: imageBuffer.length,
        storagePath,
        kind: "image",
        parsedText: `[Ảnh do AI tạo theo prompt]: ${fullPrompt}`,
      });
      if (rec?.id) {
        attachmentId = rec.id;
        finalUrl = `/api/files/${rec.id}`;
      }
    }
  } catch (err) {
    console.warn("[ImageGen] Storage upload or attachment creation skipped:", err);
  }

  return {
    id: attachmentId || "",
    fileId: attachmentId,
    url: finalUrl,
    fileName,
    prompt: fullPrompt,
    aspectRatio,
    width,
    height,
    model: modelToUse,
    style: params.style,
    createdAt: new Date().toISOString(),
  };
}

export { isImageGenerationRequest, stripAccents } from "./image-intent";


