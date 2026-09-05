import { requireUser } from "@/lib/auth/auth";
import { fail, httpError } from "@/lib/http";
import { getAttachment } from "@/lib/db/repos";
import { downloadBuffer } from "@/lib/files/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated file serving from Supabase Storage — never exposes public URLs.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getAttachment(id);
    const canAccess =
      !a?.userId ||
      a.userId === user.id ||
      a.userId === "shared" ||
      user.role === "admin";
    if (!a || !canAccess) return fail("Không tìm thấy file.", 404);
    const buf = await downloadBuffer(a.storagePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(a.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) { return httpError(e); }
}
