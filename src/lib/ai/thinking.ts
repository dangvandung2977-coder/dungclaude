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

/**
 * Determines whether an assistant response represents a genuine "large project" (dự án lớn)
 * that warrants offering a downloadable ZIP bundle.
 *
 * Rules:
 * 1. Filter out command-line / terminal blocks (sh, bash, shell, terminal, cmd, powershell).
 * 2. Must have at least 3 distinct real code files (or 2 substantial files when project
 *    manifest/entrypoint files like package.json, index.html, main.py are present).
 * 3. Total lines of non-empty code across project files must be substantial (>= 60 lines).
 * 4. Content or files should indicate project structure (mentions "dự án", "project",
 *    "cấu trúc thư mục", "full stack", or contains manifest files).
 * 5. Rejects casual snippets, before/after comparisons, and small examples.
 */
export function isLargeProject(files: ExtractedCodeFile[], content: string): boolean {
  if (!files || files.length < 2) return false;

  const SHELL_LANGS = new Set([
    "bash", "sh", "shell", "zsh", "powershell", "cmd", "terminal", "console",
  ]);

  // Filter out pure command/terminal blocks
  const realCodeFiles = files.filter(
    (f) => !SHELL_LANGS.has(f.language.toLowerCase()) && f.code.trim().length > 10
  );

  // If there are less than 2 real code files after removing shell snippets, not a multi-file project
  if (realCodeFiles.length < 2) return false;

  // Count total non-empty lines of code across real files
  let totalLines = 0;
  for (const f of realCodeFiles) {
    const lines = f.code.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
    totalLines += lines;
  }

  // Small snippets (< 60 total lines of code) are definitely NOT a large project
  if (totalLines < 60) return false;

  const lowerContent = content.toLowerCase();

  // Project indicator signals
  const projectKeywords = [
    "dự án", "project", "cấu trúc", "thư mục", "repository", "repo",
    "full stack", "fullstack", "trọn bộ", "source code", "mã nguồn",
    "directory structure", "file structure", "các file trong", "toàn bộ code",
    "kiến trúc ứng dụng", "hệ thống",
  ];
  const hasProjectKeyword = projectKeywords.some((kw) => lowerContent.includes(kw));

  // Check if standard project manifest files exist
  const PROJECT_MANIFEST_FILES = [
    "package.json", "index.html", "requirements.txt", "docker-compose.yml",
    "dockerfile", "tsconfig.json", "vite.config", "next.config", "cargo.toml",
    "pom.xml", "build.gradle", "go.mod",
  ];
  const hasManifest = realCodeFiles.some((f) =>
    PROJECT_MANIFEST_FILES.some((mf) => f.filename.toLowerCase().includes(mf))
  );

  // If it has 3+ real code files and >= 60 lines, and has project keywords or manifest, or substantial lines (>= 90)
  if (realCodeFiles.length >= 3 && (hasProjectKeyword || hasManifest || totalLines >= 90)) {
    return true;
  }

  // If 2 files, only qualify if BOTH are substantial (>= 25 lines each), total >= 80 lines,
  // AND either manifest or explicit project keyword exists
  if (realCodeFiles.length === 2 && (hasProjectKeyword || hasManifest)) {
    const bothSubstantial = realCodeFiles.every(
      (f) => f.code.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 25
    );
    if (bothSubstantial && totalLines >= 80) {
      return true;
    }
  }

  return false;
}
