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

export function normalizeRelPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

/**
 * Extract filename from code block meta line, e.g.
 * ```python app.py
 * ```html index.html
 * ```python:game/engine.py
 * ```typescript filepath="src/components/Header.tsx"
 */
export function parseCodeFenceFilename(meta: string): string | null {
  if (!meta) return null;
  const cleaned = meta.replace(/^[:\s=]+/, "").trim();

  // 1. Check for attribute format: filepath="...", filename="...", path="...", title="..."
  const attrMatch = /(?:file(?:name|path)?|title|path)=["']?([^"' \t\r\n>]+)["']?/i.exec(cleaned);
  if (attrMatch && attrMatch[1]) {
    return normalizeRelPath(attrMatch[1]);
  }

  // 2. Check for colon or whitespace followed by path with extension
  // Allows letters, digits, '.', '_', '-', and '/' (subdirectories)
  const pathMatch = /(?:^|[\s:])([\p{L}\p{N}._\-/]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt|ini|dockerfile|env|xml))\b/iu.exec(cleaned);
  if (pathMatch && pathMatch[1]) {
    return normalizeRelPath(pathMatch[1]);
  }

  return null;
}

/**
 * Extract all fenced code blocks from markdown content for bundling.
 */
export function extractCodeBlocks(markdown: string): ExtractedCodeFile[] {
  if (!markdown) return [];

  const fenceRegex = /```([a-zA-Z0-9_-]+)?(?::([^\s\n\r]+)|[ \t]+([^\n\r]+))?\r?\n([\s\S]*?)```/g;
  const files: ExtractedCodeFile[] = [];
  const usedNames = new Set<string>();

  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    const rawLang = (match[1] || "").toLowerCase().trim();
    const meta = (match[2] || match[3] || "").trim();
    const code = match[4] ?? "";

    // Don't bundle empty or single-character snippets
    if (!code.trim()) continue;

    let filename = parseCodeFenceFilename(meta);

    // If filename wasn't in meta, check if the first line is a comment filename, e.g. // index.html or # game/pipe.py
    if (!filename) {
      const firstLineMatch = /^(?:\/\/|#|\/\*|<!--)[ \t]*([\p{L}\p{N}._\-/]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt))\b/iu.exec(code.trim());
      if (firstLineMatch) {
        filename = normalizeRelPath(firstLineMatch[1]);
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

    // Ensure unique filenames while preserving folder hierarchy
    let uniqueName = filename;
    let counter = 2;
    while (usedNames.has(uniqueName.toLowerCase())) {
      const lastSlash = filename.lastIndexOf("/");
      const dir = lastSlash !== -1 ? filename.slice(0, lastSlash + 1) : "";
      const baseFile = lastSlash !== -1 ? filename.slice(lastSlash + 1) : filename;
      const dotIndex = baseFile.lastIndexOf(".");
      if (dotIndex > 0) {
        const namePart = baseFile.slice(0, dotIndex);
        const ext = baseFile.slice(dotIndex);
        uniqueName = `${dir}${namePart}_${counter}${ext}`;
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

/**
 * Determines whether an assistant response represents a genuine project
 * that warrants offering a downloadable ZIP bundle.
 */
export function isLargeProject(files: ExtractedCodeFile[], content: string): boolean {
  if (!files || files.length < 2) return false;

  const SHELL_LANGS = new Set([
    "bash", "sh", "shell", "zsh", "powershell", "cmd", "terminal", "console",
  ]);

  // Filter out pure command/terminal blocks
  const realCodeFiles = files.filter(
    (f) => !SHELL_LANGS.has(f.language.toLowerCase()) && f.code.trim().length > 15
  );

  // Small snippets or less than 2 files cannot be a multi-file project
  if (realCodeFiles.length < 2) return false;

  // Count total non-empty lines of code across real files
  let totalLines = 0;
  for (const f of realCodeFiles) {
    const lines = f.code.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
    totalLines += lines;
  }

  // Must have substantial code volume
  if (totalLines < 45) return false;

  // If any file specifies a folder structure (e.g. `src/...` or `game/...`), it's unequivocally a project!
  const hasSubfolders = realCodeFiles.some((f) => f.filename.includes("/"));
  if (hasSubfolders && realCodeFiles.length >= 2 && totalLines >= 45) {
    return true;
  }

  const lowerContent = content.toLowerCase();

  // Project indicator signals
  const projectKeywords = [
    "dự án", "project", "full stack", "fullstack",
    "source code", "mã nguồn", "cấu trúc", "thư mục",
    "folder", "game", "ứng dụng", "module", "tệp", "zip",
  ];
  const hasProjectKeyword = projectKeywords.some((kw) => lowerContent.includes(kw));

  // Check if standard project manifest files exist
  const PROJECT_MANIFEST_FILES = [
    "package.json", "requirements.txt", "docker-compose.yml",
    "tsconfig.json", "vite.config", "cargo.toml",
  ];
  const hasManifest = realCodeFiles.some((f) =>
    PROJECT_MANIFEST_FILES.some((mf) => f.filename.toLowerCase().includes(mf))
  );

  // If 3+ real code files and has project keyword or manifest or 60+ lines
  if (realCodeFiles.length >= 3 && (hasProjectKeyword || hasManifest || totalLines >= 60)) {
    return true;
  }

  // If 2 files, qualify if both are substantial or manifest exists
  if (realCodeFiles.length === 2 && (hasProjectKeyword || hasManifest)) {
    const bothSubstantial = realCodeFiles.every(
      (f) => f.code.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 15
    );
    if (bothSubstantial && totalLines >= 50) {
      return true;
    }
  }

  return false;
}

