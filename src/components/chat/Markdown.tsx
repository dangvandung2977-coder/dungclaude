"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Root, Code } from "mdast";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

interface MarkdownProps {
  text: string;
  /** true while the parent message is streaming — CodeBlock defers highlighting */
  streaming?: boolean;
}

// rehype-highlight runs after sanitize; per its README the schema must allow
// the className it adds. dataMeta carries the fence meta: ```lang file.py —
// remark-rehype drops code.meta unless we copy it into hProperties here.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className", "dataMeta"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
  },
};

// ```lang filename.py or ```lang:filename.py → dataMeta="filename.py" on the <code> element
function remarkFenceMeta() {
  return (tree: Root) => {
    const visit = (node: Root["children"][number]): void => {
      if (node.type === "code") {
        const code = node as Code;
        const lang = code.lang || "";
        let meta = code.meta || "";
        // Support ```lang:filepath syntax (e.g. ```markdown:prompt.md or ```python:game/main.py)
        if (lang.includes(":")) {
          const colonIdx = lang.indexOf(":");
          const actualLang = lang.slice(0, colonIdx);
          const filePart = lang.slice(colonIdx + 1);
          if (!meta) meta = filePart;
          code.lang = actualLang;
        }
        if (meta) {
          code.data = { ...(code.data ?? {}), hProperties: { ...(code.data?.hProperties ?? {}), dataMeta: meta } };
        }
      }
      if ("children" in node && Array.isArray(node.children)) (node.children as Root["children"]).forEach(visit);
    };
    tree.children.forEach(visit);
  };
}

/**
 * Unwraps full markdown documents that were mistakenly wrapped in an outer ```markdown:doc.md ... ```
 * which causes inner code fences (like diagrams or math formulas) to prematurely close and invert the document.
 * NOTE: Prompt files (e.g. markdown:prompt.md, PROMPT.md) are intentional files and MUST NEVER be unwrapped!
 */
function unwrapDocumentFences(text: string): string {
  if (!text || (!text.includes("```markdown") && !text.includes("```md"))) return text;

  return text.replace(
    /(^|\n)[ \t]*```(?:markdown|md)(?::([^\n\r]*))?\r?\n([\s\S]*)/g,
    (match, prefix, filePathHeader, afterStart) => {
      const headerStr = (filePathHeader || "").toLowerCase().trim();
      // NEVER unwrap prompt files (e.g. markdown:prompt.md, PROMPT.md, prompt.txt, etc.)
      if (headerStr.includes("prompt")) {
        return match;
      }

      const fenceIndices: number[] = [];
      const re = /(^|\n)[ \t]*```[^\n\r]*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(afterStart)) !== null) {
        fenceIndices.push(m.index + m[1].length);
      }

      // Only unwrap if fenceIndices count is odd AND >= 3 (meaning there are inner code fences inside).
      // If fenceIndices.length === 1, it is a single valid code block and should NEVER be unwrapped!
      if (fenceIndices.length % 2 === 1 && fenceIndices.length >= 3) {
        const lastFenceIdx = fenceIndices[fenceIndices.length - 1];
        const innerDoc = afterStart.slice(0, lastFenceIdx);
        const trailing = afterStart.slice(lastFenceIdx).replace(/^[ \t]*```[^\n\r]*\r?\n?/, "");

        // If inner text explicitly indicates a prompt file or starts with prompt heading, do not unwrap
        if (/^(?:#+\s*|\*\*)?(?:prompt|câu lệnh)\b/im.test(innerDoc.slice(0, 150))) {
          return match;
        }

        // If innerDoc contains markdown headings (# or ##), it is a document, not code
        if (/^#{1,4}\s+/m.test(innerDoc)) {
          return `${prefix}${innerDoc}\n${trailing}`;
        }
      }
      return match;
    }
  );
}

/**
 * Repairs markdown prompt files where the outer code fence was opened with only 3 backticks (```)
 * and contains inner code blocks (like ```css, ```js, etc.), which prematurely breaks the prompt
 * into multiple fragmented or empty code blocks.
 * Upgrades the outer prompt fence to 4 backticks (````markdown:prompt.md ... ````).
 */
function repairNestedPromptFences(text: string): string {
  if (!text || (!text.includes("prompt.md") && !text.includes("PROMPT.md") && !text.includes("```prompt"))) {
    return text;
  }

  // Look for ```markdown:prompt.md or ```md:prompt.md or ```prompt.md (specifically 3 backticks)
  const promptStartRegex = /(^|\n)([ \t]*)(`{3})((?:markdown|md)?:[^\n\r]*prompt[^\n\r]*)\r?\n/i;
  const match = promptStartRegex.exec(text);
  if (!match) return text;

  const prefix = match[1];
  const indent = match[2];
  const header = match[4];
  const fullMatchLen = match[0].length;
  const startIndex = match.index + prefix.length;
  const contentAfterHeader = text.slice(startIndex + fullMatchLen - prefix.length);

  // Find all code fences (``` or ````) in contentAfterHeader
  const fenceRegex = /(^|\n)[ \t]*`{3,}[^\n\r]*/g;
  const fenceMatches: Array<{ index: number; line: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(contentAfterHeader)) !== null) {
    fenceMatches.push({
      index: m.index + (m[0].startsWith("\n") ? 1 : 0),
      line: m[0].trim(),
    });
  }

  // If there are no inner fences (only at most 1 fence that is a closing fence), standard parsing is fine
  if (fenceMatches.length <= 1) {
    if (fenceMatches.length === 1 && /^`{3,}\s*$/.test(fenceMatches[0].line)) {
      const closeIdx = fenceMatches[0].index;
      const promptBody = contentAfterHeader.slice(0, closeIdx);
      const after = contentAfterHeader.slice(closeIdx).replace(/^[ \t]*`{3,}[^\n\r]*\r?\n?/, "");
      return `${text.slice(0, startIndex)}${indent}\`\`\`\`${header}\n${promptBody.trimEnd()}\n${indent}\`\`\`\`${after ? `\n\n${after.trimStart()}` : ""}`;
    }
    return text;
  }

  // There are 2 or more code fences inside the prompt section!
  // Find the true final closing fence
  const lastClosing = [...fenceMatches].reverse().find((f) => /^`{3,}\s*$/.test(f.line));
  const closingFenceIdx = lastClosing ? lastClosing.index : fenceMatches[fenceMatches.length - 1].index;

  const beforePrompt = text.slice(0, startIndex);
  const promptBody = contentAfterHeader.slice(0, closingFenceIdx);
  const afterPrompt = contentAfterHeader.slice(closingFenceIdx).replace(/^[ \t]*`{3,}[^\n\r]*\r?\n?/, "");

  const openingFence = `${indent}\`\`\`\`${header}`;
  const closingFence = `${indent}\`\`\`\``;

  return `${beforePrompt}${openingFence}\n${promptBody.trimEnd()}\n${closingFence}${afterPrompt ? `\n\n${afterPrompt.trimStart()}` : ""}`;
}

/**
 * Automatically wraps loose prompt responses into a styled markdown:prompt.md code block.
 * Handles:
 * 1. Start/End markers (e.g. "▶️ PROMPT BẮT ĐẦU ... ⏹️ PROMPT KẾT THÚC")
 * 2. Section dividers/headings (e.g. "---\n\nPrompt\n\nHãy..." or "### Prompt ...")
 * 3. Labeled prompts (e.g. "PROMPT: ...")
 * This guarantees any prompt is always enclosed in a `prompt.md` codeblock container.
 */
function autoBoxLoosePrompts(text: string): string {
  if (!text) return text;
  // If already contains prompt fence or markdown prompt file fence, do not double wrap
  if (
    text.includes("```prompt") ||
    text.includes("```systemprompt") ||
    /`{3,}(?:markdown|md):[^\n\r]*prompt/i.test(text)
  ) {
    return text;
  }

  // --- Type 1: Start marker like "▶️ PROMPT BẮT ĐẦU" or "PROMPT BẮT ĐẦU" or "START OF PROMPT" ---
  const startMarkerRegex = /(?:^|\n)(?:---[ \t]*\r?\n+)?(?:[ \t]*(?:[#*~_`>▶️🚀📌🎯💡👉-]*\s*)*(?:(?:PROMPT|CÂU LỆNH)\s*(?:BẮT ĐẦU|START|BEGIN)|(?:BẮT ĐẦU|START|BEGIN)\s*(?:PROMPT|CÂU LỆNH))[^\n\r]*)\r?\n+([\s\S]+)$/i;
  const startMatch = startMarkerRegex.exec(text);

  if (startMatch) {
    const matchIndex = startMatch.index;
    let candidate = startMatch[1].trim();

    // Check if there is an end marker like "⏹️ PROMPT KẾT THÚC" or "PROMPT KẾT THÚC" or "END OF PROMPT"
    const endMarkerRegex = /(?:^|\n)[ \t]*(?:[#*~_`>⏹️🛑🔚👉-]*\s*)*(?:(?:PROMPT|CÂU LỆNH)\s*(?:KẾT THÚC|END|FINISH|STOP)|(?:KẾT THÚC|END|FINISH|STOP)\s*(?:PROMPT|CÂU LỆNH))[^\n\r]*(?:\r?\n+|$)/i;
    const endMatch = endMarkerRegex.exec(candidate);

    let trailing = "";
    if (endMatch) {
      trailing = candidate.slice(endMatch.index + endMatch[0].length).trim();
      candidate = candidate.slice(0, endMatch.index).trim();
    }

    if (candidate.length >= 20) {
      const prefix = text.slice(0, matchIndex).trim();
      const wrapped = `\`\`\`\`markdown:prompt.md\n${candidate}\n\`\`\`\``;
      if (prefix && trailing) {
        return `${prefix}\n\n${wrapped}\n\n${trailing}`;
      } else if (prefix) {
        return `${prefix}\n\n${wrapped}`;
      } else if (trailing) {
        return `${wrapped}\n\n${trailing}`;
      }
      return wrapped;
    }
  }

  // --- Type 2: Labeled with colon: (?:#+\s*)?(?:PROMPT|Prompt|CÂU LỆNH|Câu lệnh)\s*:[ \t]*... ---
  const colonMatch = /(?:^|\n)([ \t]*(?:#{1,3}\s*)?(?:PROMPT|Prompt|CÂU LỆNH|Câu lệnh)\s*:[ \t]*[^\n\r]+[\s\S]+)$/i.exec(text);

  // --- Type 3: Separated by horizontal divider (---) or heading containing Prompt / Câu lệnh ---
  // e.g. "Dưới đây là prompt...\n\n---\n\nPrompt\n\nHãy..." or "\n### Prompt tạo game\n\nHãy..."
  const sectionMatch = /(?:^|\n)(?:---[ \t]*\r?\n+)?(?:[ \t]*(?:[#*~_`>▶️🚀📌🎯💡👉-]*\s*)*(?:PROMPT|Prompt|CÂU LỆNH|Câu lệnh)[^\n\r]*\r?\n+)([\s\S]+)$/i.exec(text);

  let matchIndex = -1;
  let candidate = "";

  if (colonMatch && (!sectionMatch || colonMatch.index <= sectionMatch.index)) {
    matchIndex = colonMatch.index;
    candidate = colonMatch[1].trim();
  } else if (sectionMatch) {
    matchIndex = sectionMatch.index;
    candidate = sectionMatch[1].trim();
  }

  if (matchIndex === -1 || !candidate || candidate.length < 30) return text;

  // Do not wrap if candidate already contains balanced code fences
  const fenceCount = (candidate.match(/```/g) || []).length;
  if (fenceCount > 0 && fenceCount % 2 === 0) return text;

  // Check if candidate has an end marker
  const endMarkerRegex = /(?:^|\n)[ \t]*(?:[#*~_`>⏹️🛑🔚👉-]*\s*)*(?:(?:PROMPT|CÂU LỆNH)\s*(?:KẾT THÚC|END|FINISH|STOP)|(?:KẾT THÚC|END|FINISH|STOP)\s*(?:PROMPT|CÂU LỆNH))[^\n\r]*(?:\r?\n+|$)/i;
  const endMatch = endMarkerRegex.exec(candidate);
  let trailing = "";
  if (endMatch) {
    trailing = candidate.slice(endMatch.index + endMatch[0].length).trim();
    candidate = candidate.slice(0, endMatch.index).trim();
  }

  const prefix = text.slice(0, matchIndex).trim();
  const wrapped = `\`\`\`\`markdown:prompt.md\n${candidate}\n\`\`\`\``;

  if (prefix && trailing) {
    return `${prefix}\n\n${wrapped}\n\n${trailing}`;
  } else if (prefix) {
    return `${prefix}\n\n${wrapped}`;
  } else if (trailing) {
    return `${wrapped}\n\n${trailing}`;
  }
  return wrapped;
}

export const Markdown = React.memo(function Markdown({ text, streaming = false }: MarkdownProps) {
  const cleanText = React.useMemo(() => {
    const unwrapped = unwrapDocumentFences(text);
    const repaired = repairNestedPromptFences(unwrapped);
    return autoBoxLoosePrompts(repaired);
  }, [text]);

  return (
    <div className="md-body select-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFenceMeta]}
        rehypePlugins={[[rehypeSanitize, schema], rehypeHighlight]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pre(props: any) {
            const child = props.children as React.ReactElement<{ children?: React.ReactNode; className?: string; "data-meta"?: string }>;
            const codeText = extractText(child?.props?.children);
            const className = child?.props?.className ?? "";
            const match = /language-(\S+)/.exec(className);
            let rawLang = match ? match[1] : "text";
            let meta = (child?.props?.["data-meta"] ?? "") as string;

            // If rawLang still has lang:filepath, extract meta & lang cleanly
            if (rawLang.includes(":")) {
              const colonIdx = rawLang.indexOf(":");
              if (!meta) meta = rawLang.slice(colonIdx + 1);
              rawLang = rawLang.slice(0, colonIdx);
            }
            const lang = rawLang;
            const filename = parseFilename(meta);

            return (
              <CodeBlock
                code={codeText}
                language={lang}
                filename={filename ?? undefined}
                streaming={streaming}
              >
                {props.children}
              </CodeBlock>
            );
          },
          a({ href, children, ...rest }) {
            const isExternal = href?.startsWith("http");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="inline-flex items-baseline gap-0.5"
                {...rest}
              >
                {children}
                {isExternal && <ExternalLink size={11} className="inline opacity-60 ml-0.5" />}
              </a>
            );
          },
        }}
      >
        {cleanText}
      </ReactMarkdown>
    </div>
  );
});

// Fence meta: ```python password_generator.py → "password_generator.py"
function parseFilename(meta: string): string | null {
  if (!meta) return null;
  const m = /\b([\p{L}\p{N}._\-/]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt|ini|dockerfile|env|xml))\b/iu.exec(meta);
  return m ? m[1] : null;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}
