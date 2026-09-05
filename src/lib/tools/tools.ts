import type { GatewayTool } from "@/lib/ai/gateway";

export const TOOL_DEFS: GatewayTool[] = [
  {
    name: "calculator",
    description: "Tính toán biểu thức số học an toàn (cộng trừ nhân chia, ngoặc, lũy thừa, %, sqrt).",
    parameters: { type: "object", properties: { expression: { type: "string", description: "VD: (12.5*3+8)/2" } }, required: ["expression"] },
  },
  {
    name: "file_search",
    description: "Tìm kiếm trong các file mà user đã upload vào conversation/project hiện tại.",
    parameters: { type: "object", properties: { query: { type: "string" }, conversationId: { type: "string" }, projectId: { type: "string" } }, required: ["query"] },
  },
  {
    name: "web_search",
    description: "Tìm kiếm web. Chỉ khả dụng khi admin đã cấu hình TAVILY_API_KEY hoặc SERPER_API_KEY.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "generate_image",
    description: "Tạo hoặc vẽ hình ảnh chất lượng cao theo mô tả của người dùng. Hãy gọi công cụ này bất cứ khi nào người dùng yêu cầu vẽ, tạo ảnh, thiết kế poster, avatar, phong cảnh, hình minh họa, v.v.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Mô tả chi tiết hình ảnh cần tạo (tiếng Anh hoặc tiếng Việt)" },
        aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"], description: "Tỷ lệ khung hình mong muốn (1:1, 16:9, 9:16, 4:3, 3:4)" },
        style: { type: "string", description: "Phong cách nghệ thuật (photographic, anime, cinematic, digital_art, cyberpunk, 3d, watercolor, minimalist)" },
      },
      required: ["prompt"],
    },
  },
];

export function isToolEnabled(name: string, enabled: string[]): boolean {
  return enabled.includes(name);
}

// Safe arithmetic evaluator (no eval/Function).
export function calculate(expr: string): number {
  const src = expr.replace(/\s+/g, "");
  if (!src) throw new Error("Biểu thức trống");
  const tokens = src.match(/(\d+\.?\d*|\+|\-|\*|\/|\^|%|\(|\)|sqrt)/g);
  if (!tokens) throw new Error("Biểu thức trống");
  // Security: every character must be accounted for — no silent skipping.
  if (tokens.join("") !== src) throw new Error("Biểu thức chứa ký tự không hợp lệ");
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") { const op = next(); const r = parseTerm(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); const r = parseFactor(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; }
    return v;
  }
  function parseFactor(): number {
    let v = parseUnary();
    if (peek() === "^") { next(); v = Math.pow(v, parseFactor()); }
    return v;
  }
  function parseUnary(): number {
    if (peek() === "-") { next(); return -parseUnary(); }
    if (peek() === "sqrt") { next(); return Math.sqrt(parseUnary()); }
    if (peek() === "(") { next(); const v = parseExpr(); if (next() !== ")") throw new Error("Thiếu dấu )"); return v; }
    const t = next();
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`Token không hợp lệ: ${t}`);
    return n;
  }
  const out = parseExpr();
  if (pos !== tokens.length) throw new Error("Biểu thức dư ký tự");
  if (!Number.isFinite(out)) throw new Error("Kết quả không hợp lệ");
  return out;
}

export async function executeTool(
  name: string,
  input: unknown,
  ctx?: { conversationId?: string; projectId?: string; userId?: string }
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === "calculator") {
    const v = calculate(String(args.expression ?? ""));
    return JSON.stringify({ result: v });
  }
  if (name === "file_search") {
    const { retrieve } = await import("@/lib/rag/retriever");
    const hits = await retrieve(String(args.query ?? ""), {
      conversationId: (args.conversationId as string) ?? ctx?.conversationId,
      projectId: (args.projectId as string) ?? ctx?.projectId,
    }, 5);
    return JSON.stringify({ hits });
  }
  if (name === "web_search") {
    return await webSearch(String(args.query ?? ""));
  }
  if (name === "generate_image") {
    const { generateImage } = await import("@/lib/ai/image-gen");
    const res = await generateImage({
      prompt: String(args.prompt ?? ""),
      aspectRatio: (args.aspectRatio as string) || (args.aspect_ratio as string) || "1:1",
      style: args.style ? String(args.style) : undefined,
      conversationId: ctx?.conversationId,
      projectId: ctx?.projectId,
      userId: ctx?.userId,
    });
    return JSON.stringify({
      success: true,
      imageUrl: res.url,
      fileId: res.fileId || (res.id && !res.id.startsWith("img_") ? res.id : null),
      fileName: res.fileName,
      prompt: res.prompt,
      aspectRatio: res.aspectRatio,
      dimensions: `${res.width}x${res.height}`,
      model: res.model,
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function webSearch(query: string): Promise<string> {
  const tavily = process.env.TAVILY_API_KEY;
  if (tavily) {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavily, query, max_results: 5, search_depth: "basic" }),
    });
    if (!r.ok) throw new Error(`Tavily error ${r.status}`);
    const j = await r.json();
    return JSON.stringify({ results: (j.results ?? []).map((x: { title: string; url: string; content: string }) => ({ title: x.title, url: x.url, snippet: (x.content ?? "").slice(0, 400) })) });
  }
  const serper = process.env.SERPER_API_KEY;
  if (serper) {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": serper },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!r.ok) throw new Error(`Serper error ${r.status}`);
    const j = await r.json();
    return JSON.stringify({ results: (j.organic ?? []).map((x: { title: string; link: string; snippet: string }) => ({ title: x.title, url: x.link, snippet: x.snippet })) });
  }
  return JSON.stringify({ unavailable: true, message: "Web search chưa được admin cấu hình (cần TAVILY_API_KEY hoặc SERPER_API_KEY)." });
}
