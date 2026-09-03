// Artifact pipeline orchestrator — chat route calls this after detecting intent.
// Flow: intent → LLM (structured JSON, cheap model) → zod validation → generator
// → Supabase Storage upload → attachments row → returns artifact metadata.
import { runGateway, type GatewayMessage } from "@/lib/ai/gateway";
import { uploadBuffer } from "@/lib/files/storage";
import { createAttachment } from "@/lib/db/repos";
import { uid } from "@/lib/db/supabase";
import {
  artifactSystemPrompt, extractJson,
  documentSchema, presentationSchema, spreadsheetSchema, projectZipSchema,
} from "./schema";
import { detectArtifactIntent, safeFileName, ARTIFACT_MIME, type ArtifactKind } from "./intent";
import { generateDocx, generatePptx, generateXlsx, generatePdf, generateMarkdown } from "./generators";

export interface ArtifactResult {
  id: string;             // attachment id — download via /api/files/{id}
  fileName: string;
  kind: ArtifactKind;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Generate an artifact from a user request.
 * @param intent detected intent (kind must be non-null)
 * @param message full user message (prompt for content generation)
 * @param ctx user/conversation ownership
 * @param modelId model for content generation (cheap model is fine)
 * @param opts optional conversation history and progress callbacks
 */
export async function generateArtifact(
  intent: { kind: ArtifactKind; fileName: string | null; instruction: string },
  message: string,
  ctx: { userId: string; conversationId: string },
  modelId: string,
  opts?: {
    history?: GatewayMessage[];
    onToken?: (t: string) => void;
  }
): Promise<ArtifactResult> {
  const kind = intent.kind;

  // 1. LLM produces structured content (JSON) or raw code (Python)
  const prompt = artifactSystemPrompt(kind === "pptx" ? "pptx" : kind === "xlsx" ? "xlsx" : kind === "py" ? "py" : kind === "zip" ? "zip" : "docx");

  // Extract previous conversational context so the artifact reflects the real discussion
  const historyMessages = (opts?.history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8);

  const contextMessages: GatewayMessage[] = [
    ...historyMessages,
    {
      role: "user",
      content: historyMessages.length > 0
        ? `[BASED ON ALL CONVERSATION DATA & CONTEXT ABOVE]: Create a complete, professional ${kind.toUpperCase()} file accurately reflecting the discussed figures, metrics, titles, and topics. Specific request: ${message.slice(0, 4000)}`
        : `User request: ${message.slice(0, 8000)}`,
    },
  ];

  const result = await runGateway({
    modelId,
    system: prompt,
    messages: contextMessages,
    maxTokens: 8000,
    cb: { onToken: opts?.onToken ?? (() => {}) },
  });
  const parsed = kind === "py" ? null : extractJson(result.text);

  // 2. Validate + generate real file
  const fileName = intent.fileName ?? (kind === "py" ? "main.py" : kind === "zip" ? safeFileName(extractTitle(parsed) ?? "project", "zip") : safeFileName(extractTitle(parsed) ?? message.slice(0, 50), kind));
  let bytes: Buffer;
  let mimeType: string;
  switch (kind) {
    case "zip": {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const proj = projectZipSchema.parse(parsed);
      for (const f of proj.files) {
        const cleanPath = f.path.replace(/^\/+/, "");
        zip.file(cleanPath, f.content);
      }
      bytes = (await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })) as Buffer;
      mimeType = ARTIFACT_MIME.zip;
      break;
    }
    case "py": {
      const cleanCode = result.text.trim().replace(/^```(?:python|py)?\s*/i, "").replace(/```\s*$/, "");
      bytes = Buffer.from(cleanCode, "utf8");
      mimeType = ARTIFACT_MIME.py;
      break;
    }
    case "docx":
    case "pdf": {
      const doc = documentSchema.parse(parsed);
      const gen = kind === "docx" ? await generateDocx(doc) : await generatePdf(doc);
      bytes = gen.bytes; mimeType = gen.mimeType;
      break;
    }
    case "pptx": {
      const pres = presentationSchema.parse(parsed);
      const gen = await generatePptx(pres);
      bytes = gen.bytes; mimeType = gen.mimeType;
      break;
    }
    case "xlsx": {
      const sp = spreadsheetSchema.parse(parsed);
      const gen = await generateXlsx(sp);
      bytes = gen.bytes; mimeType = gen.mimeType;
      break;
    }
    case "md": {
      const doc = documentSchema.parse(parsed);
      const gen = generateMarkdown(doc);
      bytes = gen.bytes; mimeType = gen.mimeType;
      break;
    }
    case "csv": {
      // CSV: expect either a spreadsheet schema (single sheet) or document with table
      const sp = spreadsheetSchema.parse(parsed);
      const sheet = sp.sheets[0];
      const { generateCsv } = await import("./generators");
      const gen = generateCsv({ columns: sheet.headers, rows: sheet.rows.map((r) => r.map(String)) });
      bytes = gen.bytes; mimeType = gen.mimeType;
      break;
    }
    default:
      // txt/json/html — plain content from LLM response
      bytes = Buffer.from(result.text, "utf8");
      mimeType = ARTIFACT_MIME[kind];
      break;
  }

  // 3. Upload to private storage + register attachment row (ownership enforced
  // on download via /api/files/{id})
  const storagePath = `artifacts/${ctx.userId}/${ctx.conversationId}/${uid("art")}-${fileName}`;
  await uploadBuffer(storagePath, bytes, mimeType);
  const att = await createAttachment({
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    fileName,
    mimeType,
    sizeBytes: bytes.length,
    storagePath,
    kind: "file",
  });

  return {
    id: att.id,
    fileName,
    kind,
    mimeType,
    sizeBytes: bytes.length,
  };
}

function extractTitle(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && "title" in parsed) {
    const t = (parsed as { title?: unknown }).title;
    if (typeof t === "string" && t.trim()) return t.trim().slice(0, 80);
  }
  return null;
}

export { detectArtifactIntent };
