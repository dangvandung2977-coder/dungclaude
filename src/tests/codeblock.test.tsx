// CodeBlock + Markdown rendering structure tests — server-render to HTML and
// assert the IDE-editor structure (gutter, no-wrap, header, collapse, filename).
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { CodeBlock } from "@/components/chat/CodeBlock";
import { Markdown } from "@/components/chat/Markdown";

const longLine = "const password = generatePassword(length, includeUppercase, includeNumbers, includeSpecialCharacters, saltRounds, workFactor, pepperSecret);";

describe("CodeBlock structure", () => {
  it("renders line-number gutter with one row per line", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "a\nb\nc\nd", language: "python" })
    );
    expect(html).toContain("cb-gutter");
    // 4 gutter rows
    expect((html.match(/<div>/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("code uses no-wrap mode by default (cb-pre)", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: longLine, language: "typescript" })
    );
    expect(html).toContain("cb-pre");
    expect(html).not.toContain("cb-wrap");
  });

  it("renders filename in header when provided", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "print('x')", language: "python", filename: "password_generator.py" })
    );
    expect(html).toContain("password_generator.py");
  });

  it("collapses blocks over 120 lines with expand control", () => {
    const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const html = renderToString(
      React.createElement(CodeBlock, { code: big, language: "text" })
    );
    expect(html).toContain("dòng còn lại");
    // Not all 200 lines rendered
    expect((html.match(/<div>/g) || []).length).toBeLessThan(250);
  });

  it("small blocks render all lines and no collapse control", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "one\ntwo", language: "python" })
    );
    expect(html).not.toContain("dòng còn lại");
  });

  it("streaming mode renders plain code without highlight DOM", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "x = 1", language: "python", streaming: true }, null)
    );
    expect(html).toContain("cb-pre");
  });

  it("gutter is sticky (never scrolls horizontally with code)", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "x", language: "python" })
    );
    expect(html).toContain("sticky left-0");
  });

  it("code area has horizontal scroll + max height", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "x", language: "python" })
    );
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("max-h-[600px]");
  });

  it("has accessible labels (region, buttons)", () => {
    const html = renderToString(
      React.createElement(CodeBlock, { code: "x", language: "python" })
    );
    expect(html).toContain('aria-label="Sao chép mã"');
    expect(html).toContain('aria-label="Tải mã về"');
    expect(html).toContain('role="region"');
  });
});

describe("Markdown → CodeBlock integration", () => {
  it("renders fenced code through the new CodeBlock", () => {
    const md = "Text before\n\n```python\nprint('hello')\n```\n\nText after";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("codeblock");
    expect(html).toContain("cb-gutter");
    expect(html).toContain("PYTHON");
    expect(html).not.toContain("github-dark");
  });

  it("long line stays in one line container (no aggressive wrap classes on code)", () => {
    const md = "```typescript\n" + longLine + "\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("cb-pre");
    // Whole line (tail included) ends inside a single line div — no mid-line breaks
    expect(html).toContain("pepperSecret);</div>");
  });

  it("inline code stays inline (small, no codeblock)", () => {
    const md = "Use `useState` for state.";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("useState");
    expect(html).not.toContain("codeblock");
    expect(html).not.toContain("cb-gutter");
  });

  it("markdown tables/headers/lists still render", () => {
    const md = "# H1\n\n- item 1\n- item 2\n\n| a | b |\n| - | - |\n| 1 | 2 |";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("<h1");
    expect(html).toContain("<ul");
    expect(html).toContain("<table");
  });

  it("fence meta filename lands in the header", () => {
    const md = "```python password_generator.py\nimport secrets\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("password_generator.py");
    expect(html).toContain("hljs-keyword");
  });

  it("520-line file: collapses, keeps first 120 lines, wide gutter", () => {
    const big = Array.from({ length: 520 }, (_, i) => `export const v${i} = ${i};`).join("\n");
    const html = renderToString(React.createElement(Markdown, { text: "```ts bigfile.ts\n" + big + "\n```" }));
    expect(html).toContain("bigfile.ts");
    expect(html).toContain("dòng còn lại");
    expect(html).toContain("width:2.75rem"); // 3-digit gutter width
    expect(html).toContain("v119");    // last visible collapsed line
    expect(html).not.toContain("v120 ="); // first hidden line
  });

  it("multi-line tokens (comment blocks) split without duplicating text", () => {
    const md = "```python\n# line one\n# line two\nx = 1\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("hljs-comment");
    // Each comment text appears exactly once (no token/child duplication)
    expect((html.match(/line one/g) || []).length).toBe(1);
    expect((html.match(/line two/g) || []).length).toBe(1);
    // 3 gutter rows for 3 lines
    expect((html.match(/<div>(\d+)<\/div>/g) || []).length).toBe(3);
  });

  it("renders PYTHON display name for python code blocks without explicit filename", () => {
    const md = "```python\nprint('hello')\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("PYTHON");
  });

  it("unwraps full markdown documents that contain inner code fences instead of inverting", () => {
    const md = "```markdown:docs/GDD.md\n# Game Title\nSome intro text.\n```\nInner Diagram\n```\n- Bullet point\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    // It should render <h1> for Game Title rather than code block
    expect(html).toContain("<h1");
    expect(html).toContain("Game Title</h1>");
    // It should render the inner diagram inside a code block
    expect(html).toContain("Inner Diagram");
    // Bullet point should render as <li>, not raw code
    expect(html).toContain("<li>Bullet point</li>");
  });

  it("preserves markdown:prompt.md code blocks without unwrapping even with headings", () => {
    const md = "Dưới đây là prompt:\n\n```markdown:prompt.md\n# Prompt tạo game Flappy Bird\nHãy xây dựng game Flappy Bird bằng HTML Canvas.\n```";
    const html = renderToString(React.createElement(Markdown, { text: md }));
    expect(html).toContain("codeblock");
    expect(html).toContain("prompt.md");
    expect(html).toContain("Dùng prompt");
    expect(html).toContain("Hãy xây dựng game Flappy Bird");
  });

  it("automatically wraps loose prompt without colon (from screenshot: --- then Prompt) into a prompt.md code block", () => {
    const loosePrompt = `Dưới đây là prompt hoàn chỉnh, bạn có thể copy và dán trực tiếp cho AI để nhận được game Flappy Bird chạy được ngay:

---

Prompt

Hãy xây dựng game Flappy Bird hoàn chỉnh chạy trên trình duyệt web với các yêu cầu sau:
1. Công nghệ & Cấu trúc file
- Sử dụng HTML + CSS + JavaScript thuần
- Vẽ game bằng HTML5 Canvas.`;

    const html = renderToString(React.createElement(Markdown, { text: loosePrompt }));
    expect(html).toContain("codeblock");
    expect(html).toContain("prompt.md");
    expect(html).toContain("Dùng prompt");
    expect(html).toContain("Hãy xây dựng game Flappy Bird");
    expect(html).toContain("Dưới đây là prompt hoàn chỉnh");
  });

  it("automatically wraps start/end marker format (e.g. ▶️ PROMPT BẮT ĐẦU ... ⏹️ PROMPT KẾT THÚC) into prompt.md code block", () => {
    const raw = `Bạn hãy copy từ "PROMPT BẮT ĐẦU" đến "PROMPT KẾT THÚC" và dán vào AI:

---

▶️ PROMPT BẮT ĐẦU

Vai trò

Bạn là lập trình viên game front-end giàu kinh nghiệm, chuyên về HTML5 Canvas và JavaScript thuần (Vanilla JS). Bạn không dùng bất kỳ framework hay thư viện ngoài nào.

Mục tiêu

Xây dựng game Flappy Bird hoàn chỉnh, chơi trực tiếp trên trình duyệt, đồ họa mượt, chơi tốt trên cả desktop và mobile.

Công nghệ bắt buộc

⏹️ PROMPT KẾT THÚC

Chúc bạn tạo game thành công!`;

    const html = renderToString(React.createElement(Markdown, { text: raw }));
    expect(html).toContain("codeblock");
    expect(html).toContain("prompt.md");
    expect(html).toContain("Dùng prompt");
    expect(html).toContain("Bạn là lập trình viên game front-end");
    expect(html).toContain("Xây dựng game Flappy Bird");
    expect(html).toContain("dán vào AI");
    expect(html).toContain("Chúc bạn tạo game thành công");
  });
});
