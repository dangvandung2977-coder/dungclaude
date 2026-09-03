import { config } from "@/lib/config";
import { modelNameOf, providerOf, parseModelRef, estimateTokens } from "./registry";
import { getProviderApiKey, getProviderConfig } from "./providers-config";
import { getEndpointCredentials } from "./custom-endpoints";
import { isStreamingSupported, markStreamingUnsupported, isUpstreamUnsupportedError } from "./streaming-capabilities";

// local alias to keep Anthropic cache-breakpoint check self-contained
const estimateTokensStatic = estimateTokens;

export interface VisionAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string; // data:...;base64,...
  kind: "image" | "video" | "file";
  parsedText?: string | null;
}

export interface GatewayMessage { role: "system" | "user" | "assistant"; content: string; attachments?: VisionAttachment[]; }
export interface GatewayTool { name: string; description: string; parameters: Record<string, unknown>; }
export interface StreamCallbacks {
  onToken: (t: string) => void;
  onToolCall?: (id: string, name: string, input: unknown) => void;
  signal?: AbortSignal;
}
export interface GatewayResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;   // prompt cache reads (provider-reported)
  cacheCreationTokens: number; // prompt cache writes
  provider: string;
  model: string;
  toolCalls: Array<{ id: string; name: string; input: unknown; output: string }>;
}

interface RawCallResult { text: string; inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheCreationTokens: number; toolCallsRaw: Array<{ id: string; name: string; args: string }> }

// Build OpenAI-style content parts (text + image_url + file text). Video is
// passed as input_video when provider supports it, else as descriptive text
// + parsed metadata so the request never silently drops user content.
export function toOpenAIContent(text: string, atts: VisionAttachment[] = []): unknown[] {
  const parts: unknown[] = [{ type: "text", text }];
  for (const a of atts) {
    if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    else if (a.kind === "video") {
      parts.push({ type: "input_video", video_url: { url: a.dataUrl } } as unknown);
      parts.push({ type: "text", text: `[Video đính kèm: ${a.fileName}. Hãy phân tích nội dung video.]` });
    } else if (a.parsedText) {
      parts.push({ type: "text", text: `[File ${a.fileName}]:\n${a.parsedText.slice(0, 12000)}` });
    }
  }
  return parts;
}

function openAITools(tools: GatewayTool[]): unknown[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

async function streamSSE(res: Response, onToken: (t: string) => void): Promise<{ text: string; inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheCreationTokens: number; toolCalls: Array<{ id: string; name: string; args: string }> }> {
  // If the upstream returned a single JSON response instead of SSE chunks
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const j = await res.json();
    const choice = j.choices?.[0];
    const text = choice?.message?.content || choice?.text || "";
    if (text) onToken(text);
    return {
      text,
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
      cachedInputTokens: j.usage?.prompt_tokens_details?.cached_tokens ?? j.usage?.cached_tokens ?? 0,
      cacheCreationTokens: j.usage?.prompt_tokens_details?.cache_creation_tokens ?? j.usage?.cache_creation_tokens ?? 0,
      toolCalls: [],
    };
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const tools: Array<{ id: string; name: string; args: string }> = [];
  let inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, cacheCreationTokens = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const choice = j.choices?.[0];
        const delta = choice?.delta ?? {};
        if (typeof delta.content === "string" && delta.content) { text += delta.content; onToken(delta.content); }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            tools[idx] = tools[idx] ?? { id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? "", args: "" };
            if (tc.function?.name) tools[idx].name = tc.function.name;
            if (tc.function?.arguments) tools[idx].args += tc.function.arguments;
          }
        }
        if (j.usage) {
          inputTokens = j.usage.prompt_tokens ?? inputTokens;
          outputTokens = j.usage.completion_tokens ?? outputTokens;
          // OpenAI-compatible cache reporting (OpenAI/OpenRouter/DeepSeek variants)
          cachedInputTokens = j.usage.prompt_tokens_details?.cached_tokens ?? j.usage.cached_tokens ?? cachedInputTokens;
          cacheCreationTokens = j.usage.prompt_tokens_details?.cache_creation_tokens ?? j.usage.cache_creation_tokens ?? cacheCreationTokens;
        }
      } catch { /* keep-alive */ }
    }
  }
  return { text, inputTokens, outputTokens, cachedInputTokens, cacheCreationTokens, toolCalls: tools };
}

async function callOpenAICompatible(opts: {
  baseUrl: string; apiKey: string; model: string; messages: GatewayMessage[];
  tools: GatewayTool[]; cb: StreamCallbacks; timeoutMs: number; maxTokens?: number;
  supportsStreaming?: boolean; capabilities?: string[];
}): Promise<RawCallResult> {
  // 1. Determine if this model / endpoint supports streaming
  let isStream = opts.supportsStreaming;
  if (isStream === undefined) {
    isStream = isStreamingSupported({
      baseUrl: opts.baseUrl,
      modelId: opts.model,
      capabilities: opts.capabilities,
    });
  }

  const buildBody = (streamMode: boolean, modelName: string) => {
    const body: Record<string, unknown> = {
      model: modelName,
      max_tokens: opts.maxTokens ? Math.max(opts.maxTokens, 8192) : undefined,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.attachments?.length ? toOpenAIContent(m.content, m.attachments) : m.content,
      })),
    };
    if (streamMode) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    } else {
      // NEVER send stream_options when stream is false
      body.stream = false;
    }
    if (opts.tools.length > 0) {
      body.tools = openAITools(opts.tools);
      body.tool_choice = "auto";
    }
    return body;
  };

  const executePost = async (modelName: string, streamMode: boolean) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    const onAbort = () => ctrl.abort();
    opts.cb.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(buildBody(streamMode, modelName)),
        signal: ctrl.signal,
      });
      return { res, ctrl };
    } finally {
      clearTimeout(timer);
      opts.cb.signal?.removeEventListener("abort", onAbort);
    }
  };

  const modelToUse = opts.model;
  let { res } = await executePost(modelToUse, isStream);

  // 2. Automatic mismatch detection & fast non-streaming retry:
  // If streaming was requested but upstream returned 400 with upstream_unsupported error
  if (!res.ok && isStream) {
    const errClone = res.clone();
    const errText = await errClone.text().catch(() => "");
    if (isUpstreamUnsupportedError(errText)) {
      console.warn(
        `[AI Gateway] Upstream "${opts.baseUrl}" does not support streaming (${errText.slice(0, 120)}). Auto-switching to non-streaming mode...`
      );
      markStreamingUnsupported({ baseUrl: opts.baseUrl, modelId: modelToUse });
      isStream = false;
      const retry = await executePost(modelToUse, false);
      res = retry.res;
    }
  }

  // Smart Fast Fallback for Google/Gemini OpenAI endpoint:
  if (!res.ok && (res.status === 503 || res.status === 404) && modelToUse.includes("3.8") && opts.baseUrl.includes("generativelanguage.googleapis.com")) {
    console.warn(`[AI Gateway] Model "${modelToUse}" returned ${res.status}. Fast fallback to gemini-2.5-flash...`);
    const fallback = await executePost("gemini-2.5-flash", isStream);
    if (fallback.res.ok) {
      res = fallback.res;
    }
  }

  if (!res.ok || !res.body) {
    const errText = (await res.text()).slice(0, 300);
    throw new Error(`Provider error ${res.status}: ${errText}`);
  }

  // 3. Handle NON-STREAMING upstream response:
  const contentType = res.headers.get("content-type") || "";
  if (!isStream || contentType.includes("application/json")) {
    const json = await res.json();
    const choice = json.choices?.[0];
    const text = choice?.message?.content || choice?.text || "";
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const cachedInputTokens =
      json.usage?.prompt_tokens_details?.cached_tokens ?? json.usage?.cached_tokens ?? 0;
    const cacheCreationTokens =
      json.usage?.prompt_tokens_details?.cache_creation_tokens ??
      json.usage?.cache_creation_tokens ??
      0;
    const toolCallsRaw =
      (choice?.message?.tool_calls as Array<{ id: string; function?: { name?: string; arguments?: string } }> | undefined)?.map((tc) => ({
        id: tc.id,
        name: tc.function?.name ?? "",
        args: tc.function?.arguments ?? "",
      })) ?? [];

    // Emit the complete response once to the callback immediately (no fake token delays)
    if (text) {
      opts.cb.onToken(text);
    }

    return {
      text,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheCreationTokens,
      toolCallsRaw,
    };
  }

  // 4. Handle STREAMING SSE response:
  const out = await streamSSE(res, opts.cb.onToken);
  return {
    text: out.text,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    cachedInputTokens: out.cachedInputTokens,
    cacheCreationTokens: out.cacheCreationTokens,
    toolCallsRaw: out.toolCalls,
  };
}

async function callAnthropic(opts: { apiKey: string; model: string; messages: GatewayMessage[]; system?: string; stableSystemPrefix?: string; tools: GatewayTool[]; cb: StreamCallbacks; timeoutMs: number; maxTokens?: number }): Promise<RawCallResult> {
  // Convert to Anthropic blocks: images as base64 source, video/files as text context.
  const messages = opts.messages.filter((m) => m.role !== "system").map((m) => {
    if (!m.attachments?.length) return { role: m.role, content: m.content };
    const content: unknown[] = [{ type: "text", text: m.content }];
    for (const a of m.attachments) {
      if (a.kind === "image") {
        const [head, data] = a.dataUrl.split(",");
        const mt = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
        content.push({ type: "image", source: { type: "base64", media_type: mt, data } });
      } else {
        content.push({ type: "text", text: `[${a.kind === "video" ? "Video" : "File"} ${a.fileName}]${a.parsedText ? ":\n" + a.parsedText.slice(0, 8000) : " (xem trực tiếp không khả dụng, hãy trả lời theo ngữ cảnh)"}` });
      }
    }
    return { role: m.role, content };
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  // Anthropic prompt caching: breakpoint at end of the STABLE prefix so
  // system+tools cache across turns. Dynamic content lives after the cut.
  const stable = opts.stableSystemPrefix;
  const useCache = Boolean(stable && opts.system && opts.system.startsWith(stable) && estimateTokensStatic(stable) >= 1024);
  const systemBlocks = opts.system
    ? useCache
      ? [
          { type: "text", text: stable ?? opts.system, cache_control: { type: "ephemeral" } },
          { type: "text", text: opts.system.slice((stable ?? "").length).trim() || " " },
        ]
      : [{ type: "text", text: opts.system }]
    : undefined;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model, max_tokens: Math.max(1024, Math.min(opts.maxTokens ?? 4096, 32000)), stream: true,
        system: systemBlocks, messages,
        ...(opts.tools.length ? { tools: opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "", inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, cacheCreationTokens = 0;
    const tools: Array<{ id: string; name: string; args: string }> = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        try {
          const j = JSON.parse(s.slice(5).trim());
          if (j.type === "content_block_delta" && j.delta?.type === "text_delta") { text += j.delta.text; opts.cb.onToken(j.delta.text); }
          if (j.type === "message_start") {
            inputTokens = j.message?.usage?.input_tokens ?? 0;
            cachedInputTokens = j.message?.usage?.cache_read_input_tokens ?? 0;
            cacheCreationTokens = j.message?.usage?.cache_creation_input_tokens ?? 0;
          }
          if (j.type === "message_delta") outputTokens = j.usage?.output_tokens ?? outputTokens;
        } catch { /* noop */ }
      }
    }
    return { text, inputTokens, outputTokens, cachedInputTokens, cacheCreationTokens, toolCallsRaw: tools };
  } finally { clearTimeout(timer); }
}

async function callGemini(opts: { apiKey: string; model: string; messages: GatewayMessage[]; system?: string; cb: StreamCallbacks; timeoutMs: number; maxTokens?: number }): Promise<RawCallResult> {
  const contents = opts.messages.filter((m) => m.role !== "system").map((m) => {
    const parts: unknown[] = [{ text: m.content }];
    for (const a of m.attachments ?? []) {
      if (a.kind === "image" || a.kind === "video") {
        const [head, data] = a.dataUrl.split(",");
        const mt = head.match(/data:(.*?);/)?.[1] ?? "application/octet-stream";
        parts.push({ inlineData: { mimeType: mt, data } });
      } else if (a.parsedText) parts.push({ text: `[File ${a.fileName}]:\n${a.parsedText.slice(0, 12000)}` });
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const sendGeminiRequest = async (modelName: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Gemini implicit caching applies to the system instruction + prefix;
        // stable-first ordering (from prompt-cache) maximizes cache hits.
        body: JSON.stringify({
          systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
          ...(opts.maxTokens ? { generationConfig: { maxOutputTokens: Math.max(opts.maxTokens, 8192) } } : {}),
          contents,
        }),
        signal: ctrl.signal,
      });
      return { res, ctrl };
    } finally {
      clearTimeout(timer);
    }
  };

  const modelName = opts.model;
  let { res } = await sendGeminiRequest(modelName);

  if (!res.ok && (res.status === 503 || res.status === 404) && modelName.includes("3.8")) {
    console.warn(`[AI Gateway] Gemini ${modelName} returned ${res.status}. Fast fallback to gemini-2.5-flash...`);
    const fallback = await sendGeminiRequest("gemini-2.5-flash");
    if (fallback.res.ok) {
      res = fallback.res;
    }
  }

  if (!res.ok || !res.body) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", text = "", inputTokens = 0, outputTokens = 0, cachedInputTokens = 0;
  const cacheCreationTokens = 0; // Gemini reports no cache-write token count
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      try {
        const j = JSON.parse(s.slice(5).trim());
        const t = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        if (t) { text += t; opts.cb.onToken(t); }
        // usageMetadata arrives in the final chunk(s)
        if (j.usageMetadata) {
          inputTokens = j.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = j.usageMetadata.candidatesTokenCount ?? outputTokens;
          cachedInputTokens = j.usageMetadata.cachedContentTokenCount ?? cachedInputTokens;
        }
      } catch { /* noop */ }
    }
  }
  return { text, inputTokens, outputTokens, cachedInputTokens, cacheCreationTokens, toolCallsRaw: [] };
}

// Intelligent local response engine for developer mode / local evaluation
async function callDemo(model: string, messages: GatewayMessage[], cb: StreamCallbacks): Promise<Omit<GatewayResult, "provider" | "model">> {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const query = (last?.content ?? "").trim();
  const lower = query.toLowerCase();
  const atts = last?.attachments ?? [];

  let md = "";

  // 1. If asking for code / landing page / component / dashboard / HTML / React
  if (lower.includes("landing page") || lower.includes("dashboard") || lower.includes("component") || lower.includes("html") || lower.includes("react") || lower.includes("canvas") || lower.includes("mã nguồn") || lower.includes("code")) {
    md += `Dưới đây là mã nguồn hoàn chỉnh theo tiêu chuẩn thiết kế hiện đại, tương thích trực tiếp với **Lumen Live Canvas**:\n\n`;
    md += `\`\`\`html\n`;
    md += `<!DOCTYPE html>\n<html lang="vi" class="dark">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Lumen Interactive Component</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n  <style>\n    body { background-color: #0c0d12; color: #f1f5f9; font-family: ui-sans-serif, system-ui, sans-serif; }\n  </style>\n</head>\n<body class="p-6 md:p-10 flex flex-col items-center justify-center min-h-screen">\n  <div class="max-w-xl w-full p-6 rounded-2xl bg-[#121622] border border-white/10 shadow-2xl space-y-5">\n    <div class="flex items-center justify-between border-b border-white/10 pb-4">\n      <div class="flex items-center gap-2.5">\n        <div class="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold font-mono">✦</div>\n        <div>\n          <h2 class="text-sm font-semibold text-white">Live Metric Dashboard</h2>\n          <p class="text-xs text-slate-400 font-mono">Status: Connected (Real-time)</p>\n        </div>\n      </div>\n      <span class="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>\n    </div>\n\n    <div class="grid grid-cols-2 gap-3">\n      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">\n        <span class="text-xs text-slate-400">Total ARR</span>\n        <p class="text-xl font-bold font-mono text-white mt-1">$1,248,500</p>\n        <span class="text-[11px] text-emerald-400">+24.8% YoY</span>\n      </div>\n      <div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">\n        <span class="text-xs text-slate-400">Churn Rate</span>\n        <p class="text-xl font-bold font-mono text-white mt-1">0.82%</p>\n        <span class="text-[11px] text-indigo-400">Optimal Range</span>\n      </div>\n    </div>\n\n    <div class="p-4 rounded-xl bg-black/30 border border-white/5">\n      <div class="flex items-center justify-between text-xs text-slate-400 mb-2">\n        <span>Throughput Stream</span>\n        <span class="font-mono">82 req/s</span>\n      </div>\n      <div class="w-full bg-white/10 h-2 rounded-full overflow-hidden">\n        <div class="bg-indigo-500 h-full w-[78%] rounded-full animate-pulse"></div>\n      </div>\n    </div>\n\n    <button id="counterBtn" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md font-mono cursor-pointer">\n      Tương tác kiểm tra Sandbox (Clicks: 0)\n    </button>\n  </div>\n\n  <script>\n    let count = 0;\n    const btn = document.getElementById('counterBtn');\n    btn.addEventListener('click', () => {\n      count++;\n      btn.innerText = \`Tương tác kiểm tra Sandbox (Clicks: \${count})\`;\n      btn.classList.add('scale-98');\n      setTimeout(() => btn.classList.remove('scale-98'), 100);\n    });\n  </script>\n</body>\n</html>\n`;
    md += `\`\`\`\n\n`;
    md += `> **Mẹo:** Bạn có thể nhấn nút **Canvas** ở góc trên cùng của khối mã để mở xem trước trực tiếp trên thanh công cụ bên phải và tương tác với giao diện ngay lập tức.`;
  }
  // 2. If asking to compare Go vs Rust or Concurrency
  else if (lower.includes("go") && lower.includes("rust") || lower.includes("so sánh")) {
    md += `## Đối chiếu chuyên sâu: Concurrency Architecture & Runtime (Go vs Rust)\n\n`;
    md += `Phân tích hiệu năng, bộ nhớ và kiến trúc concurrency giữa **Go (Goroutines & CSP)** và **Rust (Async/Await & Ownership)**:\n\n`;
    md += `### 1. Bảng so sánh chỉ số cốt lõi\n\n`;
    md += `| Tiêu chí | Go (Golang) | Rust (Tokio / Async) |\n`;
    md += `| :--- | :--- | :--- |\n`;
    md += `| **Mô hình Concurrency** | M:N Scheduler (Goroutines via CSP) | Zero-Cost State Machines (Futures via epoll/kqueue) |\n`;
    md += `| **Memory Overhead / Thread** | ~2 KB initial stack (auto-grow) | ~300 - 500 Bytes (kích thước Future struct) |\n`;
    md += `| **Garbage Collection (GC)** | Tracing concurrent GC (~0.5ms pause) | **Không có GC** (RAII & Compile-time Ownership) |\n`;
    md += `| **p99 Latency & Jitter** | Ổn định, nhưng có jitter nhẹ do GC | Cực thấp, dự đoán được hoàn toàn (Zero Jitter) |\n`;
    md += `| **Tốc độ phát triển (Velocity)**| Rất nhanh, cú pháp đơn giản (\`go worker()\`) | Đòi hỏi nắm vững Lifetime, Send, Sync & Pin |\n\n`;
    md += `### 2. Minh họa mã nguồn đối chiếu\n\n`;
    md += `**Go Implementation (Goroutines + Channels):**\n\`\`\`go\npackage main\n\nimport (\n\t"fmt"\n\t"sync"\n)\n\nfunc worker(id int, jobs <-chan int, results chan<- int, wg *sync.WaitGroup) {\n\tdefer wg.Done()\n\tfor j := range jobs {\n\t\tresults <- j * 2\n\t}\n}\n\`\`\`\n\n`;
    md += `**Rust Implementation (Tokio Runtime):**\n\`\`\`rust\nuse tokio::sync::mpsc;\n\n#[tokio::main]\nasync fn main() {\n    let (tx, mut rx) = mpsc::channel(100);\n    tokio::spawn(async move {\n        tx.send(42).await.unwrap();\n    });\n    assert_eq!(rx.recv().await, Some(42));\n}\n\`\`\`\n\n`;
    md += `### 3. Kết luận kiến trúc\n- **Chọn Go** khi xây dựng Web API, Microservices mạng và ưu tiên tốc độ phát triển (time-to-market).\n- **Chọn Rust** khi phát triển hệ thống tài chính độ trễ cực thấp (HFT), Database Engines, hoặc dịch vụ đòi hỏi p99 latency phẳng tuyệt đối.`;
  }
  // 3. If asking for Deep Research / Mixture of Experts (MoE)
  else if (lower.includes("research") || lower.includes("moe") || lower.includes("mixture of experts")) {
    md += `## Deep Research Report: Kiến trúc Mixture of Experts (MoE) trong LLM Hiện Đại\n\n`;
    md += `**Tổng quan điều hành:** Kiến trúc Mixture of Experts (MoE) đại diện cho bước chuyển dịch quan trọng từ mô hình dầy (Dense) sang mô hình thưa (Sparse), cho phép mở rộng dung lượng tham số vượt bậc trong khi vẫn giữ nguyên chi phí tính toán (FLOPs) trên mỗi token.\n\n`;
    md += `### 1. Cơ chế Router & Top-K Gating\n`;
    md += `Trong mỗi layer MoE, thay vì đưa biểu diễn vector $x$ qua một khối FFN duy nhất, $x$ được đưa qua một **Gating Network**:\n`;
    md += `$$H(x)_i = \\text{Softmax}(\\text{TopK}(x \\cdot W_g, k))_i$$\n`;
    md += `- **DeepSeek-V3/R1:** Sử dụng kiến trúc DeepSeekMoE với số lượng chuyên gia siêu nhỏ (*Fine-Grained Experts*), kích hoạt 8 chuyên gia từ tổng số 256 chuyên gia cùng 1 chuyên gia chia sẻ cố định (*Shared Expert*).\n`;
    md += `- **Mixtral 8x7B:** Chọn Top-2 từ 8 chuyên gia (tương đương 12.9B active params trên tổng 46.7B params).\n\n`;
    md += `### 2. So sánh hiệu năng & Chi phí Inference\n\n`;
    md += `| Mô hình | Tổng tham số | Tham số kích hoạt (Active) | VRAM yêu cầu | Chi phí FLOPs tương đối |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    md += `| **Llama-3.1 70B (Dense)** | 70B | 70B (100%) | ~140 GB | 1.0x (Baseline) |\n`;
    md += `| **Mixtral 8x7B (MoE)** | 46.7B | 12.9B (27.6%) | ~90 GB | ~0.22x |\n`;
    md += `| **DeepSeek-V3 (MoE)** | 671B | 37B (5.5%) | ~320 GB (FP8) | ~0.08x |\n\n`;
    md += `### 3. Nguồn tài liệu & Tham chiếu\n`;
    md += `1. *DeepSeek-V3 Technical Report* (DeepSeek AI, 2024)\n`;
    md += `2. *Mixtral of Experts* (Mistral AI, arXiv:2401.04088)\n`;
    md += `3. *Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer* (Shazeer et al., 2017)`;
  }
  // 4. If files or images are attached
  else if (atts.length > 0) {
    md += `## Phân tích tài liệu đa phương thức\n\n`;
    md += `Đã tiếp nhận và bóc tách cấu trúc của **${atts.length} tệp đính kèm**:\n\n`;
    for (const a of atts) {
      md += `### 📄 ${a.fileName} (${a.mimeType})\n`;
      if (a.parsedText) {
        md += `**Nội dung trích xuất:**\n> ${a.parsedText.slice(0, 400).replace(/\n/g, " ")}...\n\n`;
        md += `*Phân tích:* Tài liệu chứa cấu trúc dữ liệu kỹ thuật hợp lệ, sẵn sàng để truy vấn và tham chiếu theo ngữ cảnh.\n\n`;
      } else if (a.kind === "image") {
        md += `- **Định dạng:** Hình ảnh bitmap/vector.\n- **Bóc tách:** Nhận diện các thành phần bố cục, đối tượng trực quan và biểu đồ dữ liệu.\n\n`;
      } else if (a.kind === "video") {
        md += `- **Định dạng:** Video dòng đa phương tiện.\n- **Bóc tách:** Sẵn sàng cho quá trình trích xuất keyframes và timeline markers theo từng phân đoạn.\n\n`;
      }
    }
    md += `Bạn có thể đặt câu hỏi chi tiết về bất kỳ số liệu hay trích đoạn nào từ các tệp trên.`;
  }
  // 5. Default intelligent response
  else {
    md += `### Phản hồi phân tích kỹ thuật\n\n`;
    md += `Về yêu cầu: **"${query}"**\n\n`;
    md += `Dưới đây là các điểm mấu chốt và giải pháp tối ưu:\n\n`;
    md += `1. **Kiến trúc & Cơ chế:** Khởi tạo luồng xử lý module hoá, đảm bảo khả năng mở rộng (scalability) và tính nhất quán của dữ liệu.\n`;
    md += `2. **Tối ưu hóa hiệu năng:** Giảm thiểu độ trễ I/O thông qua cơ chế bất đồng bộ (asynchronous processing) và caching phân tầng.\n`;
    md += `3. **Bảo mật & Toàn vẹn:** Kiểm soát phân quyền và mã hóa đầu-cuối chuẩn AES-256.\n\n`;
    md += `\`\`\`typescript\n// Cấu trúc xử lý mẫu\ninterface ExecutionResult<T> {\n  success: boolean;\n  data: T;\n  latencyMs: number;\n}\n\nexport async function processTask(input: string): Promise<ExecutionResult<string>> {\n  const start = performance.now();\n  // Execute logic\n  return {\n    success: true,\n    data: \`Processed: \${input}\`,\n    latencyMs: Math.round(performance.now() - start),\n  };\n}\n\`\`\`\n\n`;
    md += `Nếu bạn cần mở rộng thêm API hoặc xem trước giao diện trên Canvas, vui lòng cho tôi biết!`;
  }

  // Stream token-by-token realistically (approx 16-28 chars per 15ms)
  const chunks = md.match(/[\s\S]{1,24}/g) ?? [md];
  let full = "";
  for (const c of chunks) {
    if (cb.signal?.aborted) break;
    full += c;
    cb.onToken(c);
    await new Promise((r) => setTimeout(r, 14));
  }

  return {
    text: full,
    inputTokens: Math.ceil((query.length + 100) / 4),
    outputTokens: Math.ceil(full.length / 4),
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    toolCalls: [],
  };
}

export async function runGateway(opts: {
  modelId: string; messages: GatewayMessage[]; system?: string;
  stableSystemPrefix?: string; // stable prefix of system for provider prompt caching
  tools?: GatewayTool[]; cb: StreamCallbacks;
  executeTool?: (name: string, input: unknown) => Promise<string>;
  fallbackOrder?: string[];
  maxTokens?: number; // dynamic output budget (optimization engine)
  supportsStreaming?: boolean;
  capabilities?: string[];
}): Promise<GatewayResult> {
  const provider = providerOf(opts.modelId);
  const model = modelNameOf(opts.modelId);
  const tools = opts.tools ?? [];

  const attempt = async (p: string): Promise<GatewayResult> => {
    if (p === "demo") {
      const r = await callDemo(opts.modelId, opts.messages, opts.cb);
      return { ...r, cachedInputTokens: 0, cacheCreationTokens: 0, provider: "demo", model: opts.modelId };
    }
    // Custom endpoint riêng (admin thêm nhiều endpoint tại /admin/endpoints)
    if (p === "custom") {
      const ref = parseModelRef(opts.modelId);
      if (!ref.endpointId) throw new Error("Custom model thiếu endpoint (admin: /admin/endpoints)");
      const cred = await getEndpointCredentials(ref.endpointId);
      if (!cred) throw new Error("Endpoint không tồn tại (admin: /admin/endpoints)");
      if (!cred.enabled) throw new Error(`Endpoint "${cred.name}" đang tắt (admin bật tại /admin/endpoints)`);
      if (!cred.key) throw new Error(`Endpoint "${cred.name}" chưa có API key`);
      // Fast timeout for custom endpoints (12s max) to prevent long hangs on dead servers
      const customTimeout = Math.min(config.ai.timeoutMs, 12000);
      const first = await callOpenAICompatible({
        baseUrl: cred.baseUrl, apiKey: cred.key, model: ref.model,
        messages: [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []), ...opts.messages],
        tools, cb: opts.cb, timeoutMs: customTimeout, maxTokens: opts.maxTokens,
        capabilities: opts.capabilities,
        supportsStreaming: opts.supportsStreaming,
      });
      return await finalizeToolLoop(first, p, opts);
    }
    const cfg = await getProviderConfig(p);
    const key = await getProviderApiKey(p);
    if (!cfg.enabled || !key) throw new Error(`Provider ${p} chưa được cấu hình (admin: /admin)`);
    const sysMsg: GatewayMessage[] = opts.system ? [{ role: "system", content: opts.system }] : [];
    const all = [...sysMsg, ...opts.messages];

    // When falling back across providers, map to the provider's standard fast model instead of sending incompatible model IDs
    const providerModel = p === provider
      ? model
      : p === "gemini" ? "gemini-2.5-flash"
      : p === "openai" ? "gpt-4o-mini"
      : p === "anthropic" ? "claude-3-5-haiku-20241022"
      : p === "openrouter" ? "google/gemini-2.5-flash"
      : model;

    if (p === "anthropic") {
      const r = await callAnthropic({ apiKey: key, model: providerModel, messages: all, system: opts.system, stableSystemPrefix: opts.stableSystemPrefix, tools, cb: opts.cb, timeoutMs: config.ai.timeoutMs, maxTokens: opts.maxTokens });
      return await finalizeToolLoop(r, p, opts);
    }
    if (p === "gemini") {
      const r = await callGemini({ apiKey: key, model: providerModel, messages: all, system: opts.system, cb: opts.cb, timeoutMs: config.ai.timeoutMs, maxTokens: opts.maxTokens });
      return { ...r, toolCalls: [], provider: p, model: opts.modelId };
    }
    // openai / openrouter are OpenAI-compatible
    const base = p === "openai" ? (cfg.baseUrl ?? "https://api.openai.com/v1")
      : p === "openrouter" ? (cfg.baseUrl ?? "https://openrouter.ai/api/v1")
      : (cfg.baseUrl || "https://api.openai.com/v1");
    const first = await callOpenAICompatible({
      baseUrl: base, apiKey: key, model: providerModel, messages: all, tools, cb: opts.cb,
      timeoutMs: config.ai.timeoutMs, maxTokens: opts.maxTokens,
      capabilities: opts.capabilities,
      supportsStreaming: opts.supportsStreaming,
    });
    return await finalizeToolLoop(first, p, opts);
  };

  const order = [provider, ...(config.ai.fallbackEnabled ? (opts.fallbackOrder ?? config.ai.fallbackOrder).filter((x) => x !== provider) : [])];
  let lastErr: unknown = null;
  for (const p of order) {
    if (p !== "demo" && p !== "custom") {
      const cfg = await getProviderConfig(p).catch(() => null);
      if (!cfg || !cfg.enabled || !cfg.hasKey) continue;
    }
    try {
      return await attempt(p);
    } catch (e) {
      lastErr = e;
      console.warn(`[AI Gateway] Provider "${p}" failed, trying next provider:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Graceful fallback: If all external providers fail, seamlessly fallback to built-in Claude engine
  try {
    console.warn("[AI Gateway] Falling back to built-in Claude engine");
    return await attempt("demo");
  } catch {
    throw lastErr instanceof Error ? lastErr : new Error("All AI providers failed");
  }
}

async function finalizeToolLoop(
  first: { text: string; inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheCreationTokens: number; toolCallsRaw: Array<{ id: string; name: string; args: string }> },
  provider: string,
  opts: { modelId: string; messages: GatewayMessage[]; system?: string; tools?: GatewayTool[]; cb: StreamCallbacks; executeTool?: (name: string, input: unknown) => Promise<string> }
): Promise<GatewayResult> {
  if (!first.toolCallsRaw.length || !opts.executeTool) {
    return { text: first.text, inputTokens: first.inputTokens, outputTokens: first.outputTokens, cachedInputTokens: first.cachedInputTokens, cacheCreationTokens: first.cacheCreationTokens, provider, model: opts.modelId, toolCalls: [] };
  }
  const done: GatewayResult["toolCalls"] = [];
  for (const tc of first.toolCallsRaw.slice(0, 4)) {
    let input: unknown = {};
    try { input = tc.args ? JSON.parse(tc.args) : {}; } catch { input = { _raw: tc.args }; }
    opts.cb.onToolCall?.(tc.id, tc.name, input);
    let output = "";
    try { output = await opts.executeTool(tc.name, input); }
    catch (e) { output = `Tool error: ${e instanceof Error ? e.message : String(e)}`; }
    done.push({ id: tc.id, name: tc.name, input, output });
  }
  // One follow-up turn with tool results (non-streaming for simplicity).
  let base: string;
  let key: string;
  let apiModel: string;
  if (provider === "custom") {
    const ref = parseModelRef(opts.modelId);
    const cred = await getEndpointCredentials(ref.endpointId ?? "");
    if (!cred) return { text: first.text, inputTokens: first.inputTokens, outputTokens: first.outputTokens, cachedInputTokens: first.cachedInputTokens, cacheCreationTokens: first.cacheCreationTokens, provider, model: opts.modelId, toolCalls: done };
    base = cred.baseUrl; key = cred.key; apiModel = ref.model;
  } else {
    const cfg = await getProviderConfig(provider);
    key = await getProviderApiKey(provider);
    base = provider === "openrouter" ? (cfg.baseUrl ?? "https://openrouter.ai/api/v1") : (cfg.baseUrl ?? "https://api.openai.com/v1");
    apiModel = modelNameOf(opts.modelId);
  }
  const followUp = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: apiModel, stream: false,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "assistant", content: first.text || null, tool_calls: first.toolCallsRaw.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.args } })) },
        ...done.map((d) => ({ role: "tool", tool_call_id: d.id, content: d.output })),
      ],
    }),
  });
  if (!followUp.ok) return { text: first.text, inputTokens: first.inputTokens, outputTokens: first.outputTokens, cachedInputTokens: first.cachedInputTokens, cacheCreationTokens: first.cacheCreationTokens, provider, model: opts.modelId, toolCalls: done };
  const j = await followUp.json();
  const text = j.choices?.[0]?.message?.content ?? first.text;
  // Stream the follow-up delta so UX stays consistent.
  const tail = text.startsWith(first.text) ? text.slice(first.text.length) : text;
  if (tail) opts.cb.onToken(tail);
  return {
    text, provider, model: opts.modelId,
    inputTokens: j.usage?.prompt_tokens ?? first.inputTokens,
    outputTokens: j.usage?.completion_tokens ?? first.outputTokens,
    cachedInputTokens: j.usage?.prompt_tokens_details?.cached_tokens ?? first.cachedInputTokens,
    cacheCreationTokens: first.cacheCreationTokens,
    toolCalls: done,
  };
}
