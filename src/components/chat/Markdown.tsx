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

// ```lang filename.py → dataMeta="filename.py" on the <code> element
function remarkFenceMeta() {
  return (tree: Root) => {
    const visit = (node: Root["children"][number]): void => {
      if (node.type === "code" && (node as Code).meta) {
        const code = node as Code;
        code.data = { ...(code.data ?? {}), hProperties: { ...(code.data?.hProperties ?? {}), dataMeta: code.meta } };
      }
      if ("children" in node && Array.isArray(node.children)) (node.children as Root["children"]).forEach(visit);
    };
    tree.children.forEach(visit);
  };
}

export const Markdown = React.memo(function Markdown({ text, streaming = false }: MarkdownProps) {
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
            const lang = match ? match[1] : "text";
            // rehype-highlight copies the fence meta into data-meta — the
            // conventional home for ```lang filename.py
            const meta = (child?.props?.["data-meta"] ?? "") as string;
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
        {text}
      </ReactMarkdown>
    </div>
  );
});

// Fence meta: ```python password_generator.py → "password_generator.py"
function parseFilename(meta: string): string | null {
  if (!meta) return null;
  const m = /\b([\p{L}\p{N}._-]+\.(?:py|js|jsx|ts|tsx|json|md|html?|css|scss|sql|ya?ml|csv|toml|sh|rs|go|java|kt|swift|c|h|cpp|cs|php|rb|txt|ini|dockerfile|env|xml))\b/iu.exec(meta);
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
