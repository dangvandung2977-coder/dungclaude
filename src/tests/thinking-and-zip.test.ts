import { describe, it, expect } from "vitest";
import { parseThinking, extractCodeBlocks, isLargeProject } from "@/lib/ai/thinking";
import { detectArtifactIntent } from "@/lib/artifacts/intent";
import { projectZipSchema } from "@/lib/artifacts/schema";
import JSZip from "jszip";

describe("Thinking parser (parseThinking)", () => {
  it("extracts closed <think> block and leaves clean content", () => {
    const raw = "<think>\nLet me analyze the problem step by step.\n1. First step\n2. Second step\n</think>\n\nHere is the final answer for you.";
    const res = parseThinking(raw);

    expect(res.thinking).toContain("Let me analyze the problem");
    expect(res.content).toBe("Here is the final answer for you.");
    expect(res.isThinking).toBe(false);
    expect(res.wordCount).toBeGreaterThan(5);
  });

  it("extracts closed <thinking> block correctly", () => {
    const raw = "<thinking>Reasoning here...</thinking>Actual response text.";
    const res = parseThinking(raw);

    expect(res.thinking).toBe("Reasoning here...");
    expect(res.content).toBe("Actual response text.");
    expect(res.isThinking).toBe(false);
  });

  it("handles in-progress streaming with unclosed <think> tag", () => {
    const raw = "<think>\nI am currently thinking about how to solve this...";
    const res = parseThinking(raw);

    expect(res.thinking).toBe("I am currently thinking about how to solve this...");
    expect(res.content).toBe("");
    expect(res.isThinking).toBe(true);
  });

  it("handles normal text without any thinking tags", () => {
    const raw = "Xin chào bạn, tôi có thể giúp gì cho bạn hôm nay?";
    const res = parseThinking(raw);

    expect(res.thinking).toBe("");
    expect(res.content).toBe(raw);
    expect(res.isThinking).toBe(false);
    expect(res.wordCount).toBe(0);
  });

  it("handles multiple thinking tags in a single message", () => {
    const raw = "<think>First thought</think>Middle text<think>Second thought</think>End text";
    const res = parseThinking(raw);

    expect(res.thinking).toContain("First thought");
    expect(res.thinking).toContain("Second thought");
    expect(res.content).toContain("Middle text");
    expect(res.content).toContain("End text");
  });
});

describe("Code block extraction (extractCodeBlocks)", () => {
  it("extracts single code block with explicit meta filename", () => {
    const md = "Dưới đây là file HTML:\n```html index.html\n<!DOCTYPE html>\n<html></html>\n```";
    const files = extractCodeBlocks(md);

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("index.html");
    expect(files[0].language).toBe("html");
    expect(files[0].code).toContain("<!DOCTYPE html>");
  });

  it("extracts multiple code blocks for web project", () => {
    const md = `
# Dự án Todo App

HTML file:
\`\`\`html index.html
<!DOCTYPE html>
<html lang="vi">
<head><title>Todo</title></head>
<body><h1>App</h1></body>
</html>
\`\`\`

CSS file:
\`\`\`css styles.css
body { background: #000; color: #fff; }
\`\`\`

JavaScript file:
\`\`\`javascript app.js
console.log("ready");
\`\`\`
`;
    const files = extractCodeBlocks(md);

    expect(files).toHaveLength(3);
    expect(files[0].filename).toBe("index.html");
    expect(files[1].filename).toBe("styles.css");
    expect(files[2].filename).toBe("app.js");
  });

  it("derives fallback filenames when no explicit filename is provided", () => {
    const md = `
\`\`\`python
def main():
    print("hello")
\`\`\`

\`\`\`python
def test():
    assert True
\`\`\`
`;
    const files = extractCodeBlocks(md);

    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe("main.py");
    expect(files[1].filename).toMatch(/main_2\.py|file_2\.py/);
  });
});

describe("ZIP Bundling with JSZip", () => {
  it("bundles multiple files into a valid readable ZIP archive", async () => {
    const zip = new JSZip();
    zip.file("index.html", "<!DOCTYPE html><html><body>Test</body></html>");
    zip.file("style.css", "body { color: red; }");
    zip.file("src/main.js", "console.log('bundled');");

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(50);

    // Verify ZIP header magic number: PK (0x50, 0x4b)
    expect(zipBuffer[0]).toBe(0x50);
    expect(zipBuffer[1]).toBe(0x4b);

    // Unpack and verify contents
    const readZip = await JSZip.loadAsync(zipBuffer);
    const htmlContent = await readZip.file("index.html")?.async("string");
    const cssContent = await readZip.file("style.css")?.async("string");
    const jsContent = await readZip.file("src/main.js")?.async("string");

    expect(htmlContent).toContain("Test");
    expect(cssContent).toContain("color: red");
    expect(jsContent).toContain("console.log('bundled')");
  });
});

describe("ZIP Artifact Intent & Schema", () => {
  it("detects ZIP intent from Vietnamese user message", () => {
    const intent = detectArtifactIntent("Tạo dự án web bán hàng gồm html css js và gộp thành file zip");
    expect(intent.kind).toBe("zip");
  });

  it("validates projectZipSchema", () => {
    const data = {
      title: "my-web-app",
      description: "Simple web application",
      files: [
        { path: "index.html", content: "<h1>Hello</h1>" },
        { path: "style.css", content: "h1 { color: blue; }" },
      ],
    };

    const parsed = projectZipSchema.parse(data);
    expect(parsed.title).toBe("my-web-app");
    expect(parsed.files).toHaveLength(2);
  });

  it("does not hijack normal code requests into artifact files", () => {
    // Normal coding questions should return null, not zip or other artifacts
    expect(detectArtifactIntent("viết cho tôi một hàm python để đọc file").kind).toBeNull();
    expect(detectArtifactIntent("hướng dẫn tôi cách gộp file trong python").kind).toBeNull();
    expect(detectArtifactIntent("viết code JavaScript xử lý sự kiện click").kind).toBeNull();
  });
});

describe("isLargeProject Heuristic", () => {
  it("rejects small code snippets (< 60 lines, no project structure)", () => {
    const files = [
      { language: "html", filename: "index.html", code: "<div>Hello</div>" },
      { language: "css", filename: "style.css", code: "div { color: red; }" },
    ];
    expect(isLargeProject(files, "Dưới đây là ví dụ về HTML và CSS đơn giản:")).toBe(false);
  });

  it("rejects terminal/shell commands combined with a single code snippet", () => {
    const files = [
      { language: "bash", filename: "file_1.sh", code: "npm install express" },
      { language: "javascript", filename: "index.js", code: "const express = require('express');\nconst app = express();\napp.listen(3000);" },
    ];
    expect(isLargeProject(files, "Chạy lệnh sau để cài đặt và sử dụng:")).toBe(false);
  });

  it("accepts a real multi-file project with 3+ files and substantial lines", () => {
    const htmlCode = Array(35).fill("<div>Row item with content</div>").join("\n");
    const cssCode = Array(35).fill(".row { display: flex; margin: 4px; }").join("\n");
    const jsCode = Array(35).fill("console.log('managing application state');").join("\n");

    const files = [
      { language: "html", filename: "index.html", code: htmlCode },
      { language: "css", filename: "style.css", code: cssCode },
      { language: "javascript", filename: "app.js", code: jsCode },
    ];

    const content = "Dưới đây là toàn bộ mã nguồn của **dự án web bán hàng** với cấu trúc thư mục đầy đủ:";
    expect(isLargeProject(files, content)).toBe(true);
  });

  it("accepts a 2-file project when manifest file exists and both are substantial", () => {
    const packageJson = JSON.stringify({ name: "my-app", dependencies: { express: "^4.0.0" } }, null, 2)
      + "\n" + Array(30).fill("// package config comment").join("\n");
    const serverCode = Array(50).fill("app.get('/api', (req, res) => res.json({ ok: true }));").join("\n");

    const files = [
      { language: "json", filename: "package.json", code: packageJson },
      { language: "javascript", filename: "server.js", code: serverCode },
    ];

    const content = "Dưới đây là dự án Node.js backend với package.json:";
    expect(isLargeProject(files, content)).toBe(true);
  });
});
