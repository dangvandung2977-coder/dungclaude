// Thinking & Code Block Extraction Utilities
// Handles parsing of <think>...</think> / <thinking>...</thinking> tags and extracting code blocks for ZIP bundling.

export interface ParsedThinking {
  thinking: string;
  content: string;
  isThinking: boolean; // true if currently streaming inside an unclosed <think> tag
  wordCount: number;
}

export interface ExtractedCodeFile {
  language: string;
  filename: string;
  code: string;
}

const LANG_DEFAULT_EXT: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  py: "py",
  python3: "py",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  zsh: "sh",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  rust: "rs",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  php: "php",
  ruby: "rb",
  kotlin: "kt",
  swift: "swift",
  toml: "toml",
  dockerfile: "dockerfile",
  markdown: "md",
  md: "md",
  text: "txt",
  txt: "txt",
};

/**
 * Parse <think>...</think> or <thinking>...</thinking> from AI response.
 * Handles both fully closed tags and in-progress streaming where the tag is still open.
 */
export function parseThinking(text: string): ParsedThinking {
  if (!text) {
    return { thinking: "", content: "", isThinking: false, wordCount: 0 };
  }

  // Regex to find closed thinking blocks
  const closedRegex = /<(think|thinking)>([\s\S]*?)<\/\1>/gi;

  const thinkingParts: string[] = [];
  let cleanContent = text;

  // Extract all closed thinking blocks
  cleanContent = cleanContent.replace(closedRegex, (_match, _tag, thought) => {
    thinkingParts.push(thought.trim());
    return "";
  });

  // Check for an unclosed thinking block at the end (streaming in progress)
  const openMatch = /<(think|thinking)>(?![\s\S]*<\/\1>)([\s\S]*)$/i.exec(cleanContent);
  let isThinking = false;

  if (openMatch) {
    isThinking = true;
    thinkingParts.push(openMatch[2].trim());
    cleanContent = cleanContent.slice(0, openMatch.index);
  }

  const thinking = thinkingParts.filter(Boolean).join("\n\n").trim();
  const wordCount = thinking ? thinking.split(/\s+/).filter(Boolean).length : 0;

  return {
    thinking,
    content: cleanContent.trim(),
    isThinking,
    wordCount,
  };
}

/**
 * Extract filename from code block meta line, e.g.
 * ```python app.py
 * ```html index.html
 */
export function parseCodeFenceFilename(meta: string): string | null {
  if (!meta) return null;
  const m = /\b([\p{L}\p{N}._-]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt|ini|dockerfile|env|xml))\b/iu.exec(meta);
  return m ? m[1] : null;
}

/**
 * Extract all fenced code blocks from markdown content for bundling.
 */
export function extractCodeBlocks(markdown: string): ExtractedCodeFile[] {
  if (!markdown) return [];

  const fenceRegex = /```([a-zA-Z0-9_-]+)?(?:[ \t]+([^\n\r]+))?\r?\n([\s\S]*?)```/g;
  const files: ExtractedCodeFile[] = [];
  const usedNames = new Set<string>();

  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    const rawLang = (match[1] || "").toLowerCase().trim();
    const meta = (match[2] || "").trim();
    const code = match[3] ?? "";

    // Don't bundle empty or single-character snippets
    if (!code.trim()) continue;

    let filename = parseCodeFenceFilename(meta);

    // If filename wasn't in meta, check if the first line is a comment filename, e.g. // index.html or # app.py
    if (!filename) {
      const firstLineMatch = /^(?:\/\/|#|\/\*|<!--)[ \t]*([\p{L}\p{N}._-]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt))\b/iu.exec(code.trim());
      if (firstLineMatch) {
        filename = firstLineMatch[1];
      }
    }

    // Fallback: derive name from language
    if (!filename) {
      const ext = LANG_DEFAULT_EXT[rawLang] || "txt";
      if (rawLang === "html" && !usedNames.has("index.html")) {
        filename = "index.html";
      } else if ((rawLang === "css" || rawLang === "scss") && !usedNames.has("style.css")) {
        filename = "style.css";
      } else if ((rawLang === "javascript" || rawLang === "js") && !usedNames.has("script.js")) {
        filename = "script.js";
      } else if ((rawLang === "python" || rawLang === "py") && !usedNames.has("main.py")) {
        filename = "main.py";
      } else {
        filename = `file_${index}.${ext}`;
      }
    }

    // Ensure unique filenames
    let uniqueName = filename;
    let counter = 2;
    while (usedNames.has(uniqueName.toLowerCase())) {
      const parts = filename.split(".");
      if (parts.length > 1) {
        const ext = parts.pop();
        uniqueName = `${parts.join(".")}_${counter}.${ext}`;
      } else {
        uniqueName = `${filename}_${counter}`;
      }
      counter++;
    }

    usedNames.add(uniqueName.toLowerCase());
    files.push({
      language: rawLang || "text",
      filename: uniqueName,
      code,
    });

    index++;
  }

  return files;
}
