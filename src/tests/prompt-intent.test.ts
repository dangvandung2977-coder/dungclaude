import { describe, it, expect } from "vitest";
import { isPromptCreationRequest, extractGeneratedPrompt } from "@/lib/prompt-intent";

describe("Prompt Intent Detector", () => {
  it("detects Vietnamese requests to write/create prompts", () => {
    expect(isPromptCreationRequest("Hãy viết cho tôi 1 prompt Midjourney vẽ cô gái anime")).toBe(true);
    expect(isPromptCreationRequest("Tạo prompt vẽ chân dung phong cách cyberpunk")).toBe(true);
    expect(isPromptCreationRequest("Soạn giúp tôi một prompt để tạo slide thuyết trình")).toBe(true);
    expect(isPromptCreationRequest("Cho tôi câu lệnh prompt vẽ tranh sơn dầu")).toBe(true);
    expect(isPromptCreationRequest("Gợi ý prompt viết blog về du lịch")).toBe(true);
    expect(isPromptCreationRequest("sinh prompt midjourney cho sản phẩm")).toBe(true);
    expect(isPromptCreationRequest("viết prompt cải thiện menu chính game câu cá")).toBe(true);
    expect(isPromptCreationRequest("t bảo prompt thì đưa vào trong cái ô jj mà")).toBe(true);
    expect(isPromptCreationRequest("cho cái prompt code web")).toBe(true);
    expect(isPromptCreationRequest("Cho tao pormpt vẽ con mèo")).toBe(true);
    expect(isPromptCreationRequest("cái prompt jj thì phân chia lại đi")).toBe(true);
  });

  it("detects English requests to write/create prompts", () => {
    expect(isPromptCreationRequest("Write a prompt for Midjourney to draw a fantasy castle")).toBe(true);
    expect(isPromptCreationRequest("Create a prompt for DALL-E 3 portrait")).toBe(true);
    expect(isPromptCreationRequest("Generate a prompt for copywriting blog posts")).toBe(true);
    expect(isPromptCreationRequest("Please suggest a prompt for coding assistant")).toBe(true);
  });

  it("does not false-positive on general chat questions", () => {
    expect(isPromptCreationRequest("Hôm nay thời tiết thế nào?")).toBe(false);
    expect(isPromptCreationRequest("Giải thích cho tôi khái niệm prompt engineering là gì?")).toBe(false);
    expect(isPromptCreationRequest("Xin chào bạn")).toBe(false);
  });

  it("extracts prompt from ```prompt code block", () => {
    const aiResponse = `Dưới đây là prompt Midjourney dành cho bạn:

\`\`\`prompt
A futuristic cyberpunk city at night, neon lights, volumetric fog --ar 16:9
\`\`\`

Bạn có thể chỉnh sửa các thông số theo nhu cầu.`;

    expect(extractGeneratedPrompt(aiResponse)).toBe(
      "A futuristic cyberpunk city at night, neon lights, volumetric fog --ar 16:9"
    );
  });

  it("extracts multi-line structured prompt without codeblock", () => {
    const aiResponse = `PROMPT: Cải thiện Menu chính — Game câu cá (HTML/CSS/JS thuần)

Bối cảnh
Bạn là frontend developer cho một game câu cá 3D có menu chính web-based, viết bằng HTML + CSS + JavaScript thuần (không framework).

Yêu cầu bắt buộc: giữ nguyên phong cách hiện tại — tông xanh rêu tối, glassmorphism cho panel form, CTA giữ nguyên.

Hy vọng prompt này hữu ích cho bạn!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("PROMPT: Cải thiện Menu chính — Game câu cá (HTML/CSS/JS thuần)");
    expect(extracted).toContain("Bối cảnh\nBạn là frontend developer");
    expect(extracted).toContain("Yêu cầu bắt buộc: giữ nguyên phong cách");
    expect(extracted).not.toContain("Hy vọng prompt này");
  });

  it("extracts prompt from single generic code block", () => {
    const aiResponse = `Đây là câu lệnh gợi ý:

\`\`\`
An oil painting of an astronaut cat playing guitar
\`\`\`
`;
    expect(extractGeneratedPrompt(aiResponse)).toBe(
      "An oil painting of an astronaut cat playing guitar"
    );
  });

  it("extracts prompt from ```markdown:prompt.md code block", () => {
    const aiResponse = `Dưới đây là prompt hoàn chỉnh:

\`\`\`markdown:prompt.md
Hãy xây dựng game Flappy Bird hoàn chỉnh chạy trên trình duyệt web với các yêu cầu sau:
1. Công nghệ & Cấu trúc file
- Sử dụng HTML + CSS + JavaScript thuần
\`\`\`

Chúc bạn code thành công!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("Hãy xây dựng game Flappy Bird");
    expect(extracted).toContain("Sử dụng HTML + CSS + JavaScript thuần");
  });

  it("extracts prompt from loose divider format (from user screenshot)", () => {
    const aiResponse = `Dưới đây là prompt hoàn chỉnh, bạn có thể copy và dán trực tiếp cho AI để nhận được game Flappy Bird chạy được ngay:

---

Prompt

Hãy xây dựng game Flappy Bird hoàn chỉnh chạy trên trình duyệt web với các yêu cầu sau:
1. Công nghệ & Cấu trúc file
- Sử dụng HTML + CSS + JavaScript thuần (không dùng framework, không dùng thư viện ngoài)
- Vẽ game bằng HTML5 Canvas.

Hy vọng prompt này hữu ích!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("Hãy xây dựng game Flappy Bird");
    expect(extracted).toContain("Sử dụng HTML + CSS + JavaScript thuần");
    expect(extracted).not.toContain("Dưới đây là prompt hoàn chỉnh");
    expect(extracted).not.toContain("Hy vọng prompt này hữu ích");
  });

  it("detects user feedback intent to put prompt into md file / code block", () => {
    expect(isPromptCreationRequest("vẫn không đưa vào code block này, m làm kiểu để prompt là file md đi")).toBe(true);
    expect(isPromptCreationRequest("vẫn ko cho vào code block")).toBe(true);
    expect(isPromptCreationRequest("cho vào code block")).toBe(true);
  });

  it("extracts prompt from start/end marker format (from latest user screenshot)", () => {
    const aiResponse = `Bạn hãy copy từ "PROMPT BẮT ĐẦU" đến "PROMPT KẾT THÚC" và dán vào AI:

---

▶️ PROMPT BẮT ĐẦU

Vai trò

Bạn là lập trình viên game front-end giàu kinh nghiệm, chuyên về HTML5 Canvas và JavaScript thuần (Vanilla JS). Bạn không dùng bất kỳ framework hay thư viện ngoài nào.

Mục tiêu

Xây dựng game Flappy Bird hoàn chỉnh, chơi trực tiếp trên trình duyệt, đồ họa mượt, chơi tốt trên cả desktop và mobile.

Công nghệ bắt buộc

⏹️ PROMPT KẾT THÚC

Chúc bạn tạo game thành công!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("Bạn là lập trình viên game front-end");
    expect(extracted).toContain("Xây dựng game Flappy Bird");
    expect(extracted).not.toContain("dán vào AI");
    expect(extracted).not.toContain("PROMPT BẮT ĐẦU");
    expect(extracted).not.toContain("PROMPT KẾT THÚC");
    expect(extracted).not.toContain("Chúc bạn tạo game thành công");
  });

  it("extracts prompt containing nested code fences cleanly", () => {
    const aiResponse = `Dưới đây là prompt:

\`\`\`markdown:prompt.md
# Prompt tạo game
Yêu cầu tạo các file:
\`\`\`css:style.css
\`\`\`
\`\`\`javascript:script.js
\`\`\`
Chỉ cung cấp code hoàn chỉnh.
\`\`\`

Bạn hãy dùng prompt trên!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("# Prompt tạo game");
    expect(extracted).toContain("```css:style.css");
    expect(extracted).toContain("Chỉ cung cấp code hoàn chỉnh.");
  });

  it("extracts prompt wrapped in 4-backtick codeblock (markdown:prompt.md)", () => {
    const aiResponse = `Dưới đây là prompt:

\`\`\`\`markdown:prompt.md
# Prompt tạo Flappy Bird
\`\`\`css:style.css
canvas { display: block; }
\`\`\`
\`\`\`javascript:script.js
console.log("bird");
\`\`\`
\`\`\`\`

Chúc bạn thành công!`;

    const extracted = extractGeneratedPrompt(aiResponse);
    expect(extracted).toContain("# Prompt tạo Flappy Bird");
    expect(extracted).toContain("canvas { display: block; }");
    expect(extracted).toContain("console.log(\"bird\");");
    expect(extracted).not.toContain("Chúc bạn thành công!");
  });
});
