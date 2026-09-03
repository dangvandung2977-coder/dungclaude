// RAG: chunker + local keyword retriever (works without embeddings keys).
// Embeddings interface is pluggable: set EMBEDDINGS_PROVIDER=openai + key
// to use OpenAI embeddings; retrieval falls back to keyword overlap.
import { listParsedAttachments } from "@/lib/db/repos";

export function chunkText(text: string, maxChars = 1200, overlap = 150): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + maxChars, clean.length);
    if (end < clean.length) {
      const cut = clean.lastIndexOf("\n\n", end);
      if (cut > i + maxChars * 0.4) end = cut;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
    if (chunks.length > 200) break;
  }
  return chunks.filter(Boolean);
}

export interface RetrievalHit { fileName: string; attachmentId: string; chunk: string; score: number; }

export async function retrieve(query: string, scope: { conversationId?: string; projectId?: string }, topK = 4): Promise<RetrievalHit[]> {
  const q = query.toLowerCase().split(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]+/g).filter((w) => w.length > 1);
  if (!q.length) return [];
  if (!scope.conversationId && !scope.projectId) return [];
  const rows = await listParsedAttachments(scope);
  const hits: RetrievalHit[] = [];
  for (const r of rows) {
    for (const chunk of chunkText(r.parsedText, 900, 100)) {
      const low = chunk.toLowerCase();
      let score = 0;
      for (const w of q) if (low.includes(w)) score += w.length > 4 ? 2 : 1;
      if (score > 0) hits.push({ fileName: r.fileName, attachmentId: r.id, chunk: chunk.slice(0, 900), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function buildRagContext(hits: RetrievalHit[]): string {
  if (!hits.length) return "";
  return `\n\n[Relevant documents from attachments:\n${hits.map((h, i) => `[${i + 1}] ${h.fileName}: ${h.chunk}`).join("\n")}\nCite sources as [1], [2]… when using this information.]`;
}
