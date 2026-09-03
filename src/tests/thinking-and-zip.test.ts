import { describe, it, expect } from "vitest";
import { parseThinking, extractCodeBlocks } from "@/lib/ai/thinking";
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
});
