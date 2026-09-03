// Artifact content schema — the structured JSON an LLM produces for document
// generation. Generators (docx/pptx/xlsx/pdf/md/csv) render this into real files.
import { z } from "zod";

// Block types shared by docx/pdf/md rendering
export const blockSchema = z.union([
  z.object({
    type: z.literal("heading"),
    level: z.number().int().min(1).max(4).default(1),
    text: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal("paragraph"),
    text: z.string().min(1).max(5000),
  }),
  z.object({
    type: z.literal("bullets"),
    items: z.array(z.string().max(500)).min(1).max(50),
  }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.string().max(100)).min(1).max(12),
    rows: z.array(z.array(z.string().max(500)).max(12)).max(200),
  }),
  z.object({
    type: z.literal("pageBreak" as string), // marker block
    text: z.string().optional(),
  }).transform((v) => ({ ...v, type: "pageBreak" as const })),
]);
export type Block = z.infer<typeof blockSchema>;

// DOCX / PDF / MD document
export const documentSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional(),
  blocks: z.array(blockSchema).min(1).max(300),
});
export type DocumentContent = z.infer<typeof documentSchema>;

// PPTX presentation
export const slideSchema = z.object({
  title: z.string().min(1).max(120),
  bullets: z.array(z.string().max(200)).max(8).default([]),
  notes: z.string().max(1000).optional(), // speaker notes
});
export const presentationSchema = z.object({
  title: z.string().min(1).max(150),
  subtitle: z.string().max(200).optional(),
  slides: z.array(slideSchema).min(1).max(30),
});
export type PresentationContent = z.infer<typeof presentationSchema>;

// XLSX spreadsheet — multiple sheets
export const sheetSchema = z.object({
  name: z.string().min(1).max(31),
  headers: z.array(z.string().max(100)).min(1).max(30),
  rows: z.array(z.array(z.union([z.string().max(500), z.number(), z.null()]))).max(1000),
});
export const spreadsheetSchema = z.object({
  title: z.string().min(1).max(150),
  sheets: z.array(sheetSchema).min(1).max(10),
});
export type SpreadsheetContent = z.infer<typeof spreadsheetSchema>;

export const projectZipSchema = z.object({
  title: z.string().default("project"),
  description: z.string().optional(),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).min(1),
});
export type ProjectZipContent = z.infer<typeof projectZipSchema>;

// One prompt → one JSON. The router picks the schema by artifact kind.
export function artifactSystemPrompt(kind: "docx" | "pptx" | "xlsx" | "pdf" | "md" | "py" | "zip"): string {
  const lang = "Generate the content in the language requested by the user or matching the conversation context.";
  switch (kind) {
    case "zip":
      return `You are an expert multi-file software architect and full-stack engineer. ${lang}
Output ONLY valid JSON (no markdown fences, no explanatory text) matching this schema:
{"title": string, "description"?: string, "files": [{"path": string, "content": string}]}
Rules:
- Generate complete, production-ready, fully functional code files.
- Each file must have its complete filename/path (e.g. "index.html", "style.css", "main.js", "app.py", "requirements.txt", "README.md").
- Do not abbreviate or write placeholders like "// TODO" or "...rest of code...".
- Accurate, clean, ready to run.`;
    case "py":
      return `You are an expert Python software engineer.
Write clean, robust, well-documented, PEP 8 compliant Python code based on the conversation context and user request.
Output ONLY the raw Python code directly (no markdown fences, no explanatory text, no introductory or concluding conversational prose).`;
    case "pptx":
      return `You are an expert presentation designer. ${lang}
Output ONLY valid JSON (no markdown fences, no explanatory text) matching this schema:
{"title": string, "subtitle"?: string, "slides": [{"title": string, "bullets": string[], "notes"?: string}]}
Rules: 5-12 slides; each slide max 6 bullets, each bullet concise (under 15 words); clear slide titles; include "notes" (speaker notes) for key slides. Content must be comprehensive, professional, structured, and accurately reflect user conversation context.`;
    case "xlsx":
      return `You are an expert data analyst and spreadsheet engineer. ${lang}
Output ONLY valid JSON (no markdown fences, no explanatory text) matching this schema:
{"title": string, "sheets": [{"name": string, "headers": string[], "rows": (string|number|null)[][]}]}
Rules: Data must accurately reflect the user request and conversation context; use numeric types for numbers (not strings); use multiple sheets when logical. If user provided numbers/tables in previous messages, reproduce them accurately.`;
    case "docx":
    case "pdf":
    case "md":
    default:
      return `You are an expert document writer and editor. ${lang}
Output ONLY valid JSON (no markdown fences, no explanatory text) matching this schema:
{"title": string, "subtitle"?: string, "blocks": [{"type":"heading","level":1-4,"text":string} | {"type":"paragraph","text":string} | {"type":"bullets","items":string[]} | {"type":"table","columns":string[],"rows":string[][]} | {"type":"pageBreak"}]}
Rules: Logical document structure (Introduction — Main Sections — Conclusion); use tables for comparative data; use bullets for lists; place pageBreak between major sections. Comprehensive, professional content accurately aligned with conversation context.`;
  }
}

// Extract JSON from an LLM response that may wrap it in fences or prose.
export function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // First {...} or [...] block
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error("Không tìm thấy JSON trong câu trả lời");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }
  throw new Error("JSON không hợp lệ trong câu trả lời");
}
