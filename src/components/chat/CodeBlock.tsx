"use client";
// IDE-style code block — line-number gutter (fixed, never scrolls horizontally),
// horizontal-only code scrolling, collapse for long files, low-saturation theme.
// Streaming-safe: renders plain text while streaming, highlights once when stable.
import React, { useMemo, useState } from "react";
import { Check, Copy, ChevronDown, ChevronUp, WrapText, Download as DownloadIcon, CornerDownLeft } from "lucide-react";
import { copyText, cn } from "@/lib/utils";
import { insertTextToComposer } from "@/lib/prompt-intent";

const LANG_EXT: Record<string, string> = {
  typescript: "ts", javascript: "js", tsx: "tsx", jsx: "jsx",
  python: "py", py: "py", python3: "py", py3: "py",
  bash: "sh", shell: "sh", zsh: "sh", json: "json", yaml: "yaml", yml: "yaml",
  sql: "sql", html: "html", css: "css", md: "md", markdown: "md",
  rust: "rs", go: "go", java: "java", c: "c", cpp: "cpp", csharp: "cs",
  php: "php", ruby: "rb", kotlin: "kt", swift: "swift", toml: "toml",
  dockerfile: "dockerfile", text: "txt", txt: "txt", ini: "ini", diff: "diff",
};

const COLLAPSE_LINES = 120;

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  /** true while the parent message is still streaming — skips hljs until stable */
  streaming?: boolean;
  children?: React.ReactNode; // pre-highlighted <code> from rehype-highlight
}

export const CodeBlock = React.memo(function CodeBlock({
  code, language, filename, streaming = false, children,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(false);

  const safeCode = code || "";
  const lines = useMemo(() => safeCode.replace(/\n$/, "").split("\n"), [safeCode]);
  const total = lines.length;
  const collapsible = total > COLLAPSE_LINES;
  const visibleLines = collapsible && !expanded
    ? lines.slice(0, COLLAPSE_LINES)
    : lines;
  const gutterWidth = total >= 1000 ? "3.5rem" : total >= 100 ? "2.75rem" : "2.25rem";

  const isPrompt = useMemo(() => {
    const l = (language || "").toLowerCase().trim();
    if (l === "prompt" || l === "systemprompt") return true;
    const f = (filename || "").toLowerCase();
    if (
      f === "prompt.md" ||
      f === "prompt.txt" ||
      f === "prompt" ||
      f.endsWith("/prompt.md") ||
      f.endsWith("\\prompt.md") ||
      f.includes("prompt")
    ) {
      return true;
    }
    return false;
  }, [language, filename]);

  const isPython = useMemo(() => {
    const l = (language || "").toLowerCase().trim();
    if (l === "python" || l === "py" || l === "python3" || l === "py3") return true;
    return /^\s*(import\s+\w+|from\s+\w+\s+import|def\s+\w+\s*\(|class\s+\w+.*:|if\s+__name__\s*==\s*['"]__main__['"]:)/m.test(safeCode);
  }, [language, safeCode]);

  const ext = useMemo(() => {
    if (filename) {
      const dot = filename.lastIndexOf(".");
      if (dot !== -1) return filename.slice(dot + 1);
    }
    if (isPrompt) return "md";
    if (isPython) return "py";
    const l = (language || "").toLowerCase().trim();
    return LANG_EXT[l] ?? (l || "txt");
  }, [filename, isPrompt, isPython, language]);

  const displayName = filename ?? (isPrompt ? "prompt.md" : isPython ? "PYTHON" : language.toUpperCase());

  const highlightedLines: React.ReactNode[][] | null =
    !streaming && React.isValidElement(children)
      ? splitHighlighted(children as React.ReactElement<{ children?: React.ReactNode }>)
      : null;

  const codeScrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (streaming && codeScrollRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [code, streaming]);

  return (
    <div className="codeblock my-3.5 rounded-lg overflow-hidden border border-[var(--cb-border)] bg-[var(--cb-bg)]">
      {/* Minimal header */}
      <div className="flex items-center justify-between h-8 px-3 bg-[var(--cb-header)] border-b border-[var(--cb-border)]">
        <div className="flex items-center gap-2 min-w-0">
          {filename ? (
            <>
              <span className="text-[11px] font-mono text-[var(--cb-lang)] truncate">{filename}</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-3)] shrink-0 hidden sm:inline">{language}</span>
            </>
          ) : (
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--cb-lang)]">{displayName}</span>
          )}
          {collapsible && !expanded && (
            <span className="text-[10px] text-[var(--text-3)] shrink-0 hidden sm:inline">
              {total} dòng
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-pressed={wrap}
            aria-label={wrap ? "Tắt ngắt dòng" : "Ngắt dòng dài"}
            title={wrap ? "Không ngắt dòng (cuộn ngang)" : "Ngắt dòng dài"}
            className={cn(
              "p-1 rounded-[5px] transition-colors cursor-pointer",
              wrap ? "text-[var(--cb-lang)] bg-[var(--cb-btn-active)]" : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--cb-btn-hover)]"
            )}
          >
            <WrapText size={12} />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(code)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }
            }}
            aria-label="Sao chép mã"
            title="Sao chép mã"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-[5px] text-[11px] transition-colors cursor-pointer text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--cb-btn-hover)]"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400">Đã chép</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span className="hidden sm:inline">Sao chép</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              insertTextToComposer(code, { focus: true });
              setInserted(true);
              setTimeout(() => setInserted(false), 1600);
            }}
            aria-label="Đưa vào ô nhập"
            title={isPrompt ? "Đưa đoạn prompt này vào ô chat" : "Đưa mã vào ô chat"}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-1 rounded-[5px] text-[11px] transition-colors cursor-pointer",
              inserted
                ? "text-emerald-400 bg-emerald-500/15 font-medium"
                : isPrompt
                ? "text-[#D97757] bg-[#D97757]/10 hover:bg-[#D97757]/20 font-medium"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--cb-btn-hover)]"
            )}
          >
            {inserted ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400">Đã vào ô chat</span>
              </>
            ) : (
              <>
                <CornerDownLeft size={12} className={isPrompt ? "text-[#D97757]" : undefined} />
                <span className="hidden sm:inline">{isPrompt ? "Dùng prompt" : "Đưa vào ô nhập"}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={downloadSnippet}
            aria-label="Tải mã về"
            title={`Tải về ${filename ?? `snippet.${ext}`}`}
            className="p-1 rounded-[5px] text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--cb-btn-hover)] transition-colors cursor-pointer"
          >
            <DownloadIcon size={12} />
          </button>
        </div>
      </div>

      {/* Body: gutter + code — gutter stays fixed while code scrolls horizontally */}
      <div
        ref={codeScrollRef}
        className="relative font-mono text-[13px] leading-[1.6] overflow-x-auto overflow-y-auto thin-scroll max-h-[600px] cb-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Khối mã ${displayName}`}
      >
        <div className="flex min-w-full w-max">
          {/* Gutter */}
          <div
            aria-hidden="true"
            className="sticky left-0 z-10 shrink-0 select-none text-right bg-[var(--cb-bg)] pr-3 pl-4 border-r border-[var(--cb-gutter-border)] text-[var(--cb-gutter)] cb-gutter"
            style={{ width: gutterWidth }}
          >
            {visibleLines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          {/* Code */}
          <div className={cn("grow py-2.5 pl-4 pr-6 min-w-0", wrap ? "cb-wrap" : "cb-pre")}>
            {streaming || !highlightedLines ? (
              <pre className="m-0 p-0 bg-transparent static"><code>{visibleLines.join("\n")}</code></pre>
            ) : (
              <div>
                {visibleLines.map((_, i) => (
                  <div key={i}>{highlightedLines[i] ? <React.Fragment>{highlightedLines[i]}</React.Fragment> : <code>{lines[i]}</code>}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Fade + expand for collapsed blocks */}
        {collapsible && !expanded && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--cb-bg)] to-transparent pointer-events-none" />
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] bg-[var(--cb-header)] border-t border-[var(--cb-border)] transition-colors cursor-pointer"
        >
          {expanded ? (
            <><ChevronUp size={12} /><span>Thu gọn</span></>
          ) : (
            <><ChevronDown size={12} /><span>Hiện {total - COLLAPSE_LINES} dòng còn lại ({total} dòng)</span></>
          )}
        </button>
      )}
    </div>
  );

  function downloadSnippet() {
    let name: string;
    if (filename) {
      if (isPython && !filename.toLowerCase().endsWith(".py")) {
        name = `${filename}.py`;
      } else {
        name = filename;
      }
    } else {
      name = isPython ? "main.py" : isPrompt ? "prompt.md" : `snippet.${ext}`;
    }
    const blob = new Blob([code], { type: isPython ? "text/x-python;charset=utf-8" : "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

// Split a highlighted <code> element's children into per-line node arrays so
// the gutter stays aligned even when a token spans a newline. Elements that
// contain no newline are pushed whole; ones that do are cloned per line so
// hljs token styling is preserved across the split.
function splitHighlighted(codeEl: React.ReactElement<{ children?: React.ReactNode }>): React.ReactNode[][] {
  const lines: React.ReactNode[][] = [[]];
  const push = (n: React.ReactNode): void => { lines[lines.length - 1].push(n); };
  const breakLine = (): void => { lines.push([]); };

  const walk = (node: React.ReactNode): void => {
    if (node === null || node === undefined || node === false || node === true) return;
    if (typeof node === "string" || typeof node === "number") {
      const parts = String(node).split("\n");
      parts.forEach((p, i) => {
        if (i > 0) breakLine();
        if (p) push(p);
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (React.isValidElement(node)) {
      const kids = (node.props as { children?: React.ReactNode }).children;
      if (!containsNewline(kids)) {
        push(node);
        return;
      }
      // ponytail: clone-per-line handles the rare multiline token
      // (comment/string); nested newline tokens inside it are flattened.
      const sub = splitHighlighted({ type: "x", props: { children: kids } } as unknown as React.ReactElement<{ children?: React.ReactNode }>);
      sub.forEach((lineNodes, i) => {
        if (i > 0) breakLine();
        if (lineNodes.length > 0) {
          push(React.cloneElement(node, undefined, ...lineNodes));
        }
      });
      return;
    }
  };

  walk(codeEl.props?.children);
  return lines;
}

function containsNewline(node: React.ReactNode): boolean {
  if (typeof node === "string" || typeof node === "number") return String(node).includes("\n");
  if (Array.isArray(node)) return node.some(containsNewline);
  if (React.isValidElement(node)) return containsNewline((node.props as { children?: React.ReactNode }).children);
  return false;
}
