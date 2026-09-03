import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { createAttachment } from "@/lib/db/repos";
import { uid } from "@/lib/db/supabase";
import { validateUpload, sanitizeFileName } from "@/lib/security/security";
import { parseUploadBytes } from "@/lib/files/parse";
import { uploadBuffer } from "@/lib/files/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const conversationId = (form.get("conversationId") as string) || null;
    const projectId = (form.get("projectId") as string) || null;
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return fail("Chưa chọn file.", 400);
    if (files.length > 10) return fail("Tối đa 10 file/lần.", 400);

    const out = [];
    for (const f of files) {
      const safe = sanitizeFileName(f.name || "file");
      const mime = f.type || "application/octet-stream";
      const buf = Buffer.from(await f.arrayBuffer());
      const v = validateUpload(safe, mime, buf.length);
      if (!v.ok) return fail(`${safe}: ${v.reason}`, 400);
      // Lưu lên Supabase Storage (bucket private "attachments")
      const storagePath = `${user.id}/${uid("f")}-${safe}`;
      await uploadBuffer(storagePath, buf, mime);
      const parsed = await parseUploadBytes(buf, mime, safe);
      const rec = await createAttachment({
        userId: user.id,
        conversationId, projectId,
        fileName: safe, mimeType: mime, sizeBytes: buf.length,
        storagePath, kind: v.kind ?? "file", parsedText: parsed,
      });
      out.push({ ...rec, url: `/api/files/${rec.id}` });
    }
    return ok({ files: out });
  } catch (e) { return httpError(e); }
}
