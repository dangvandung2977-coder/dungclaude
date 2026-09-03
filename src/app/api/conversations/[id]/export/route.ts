import { requireUser } from "@/lib/auth/auth";
import { fail, httpError } from "@/lib/http";
import { getConversation, listMessages } from "@/lib/db/repos";

export const runtime = "nodejs";

// GET /api/conversations/[id]/export?format=md|json
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const conv = await getConversation(id, user.id);
    if (!conv) return fail("Không tìm thấy.", 404);
    const messages = await listMessages(id, 2000);
    const format = new URL(req.url).searchParams.get("format") ?? "md";
    if (format === "json") {
      return new Response(JSON.stringify({ conversation: conv, messages }, null, 2), {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${conv.title.slice(0, 40)}.json"` },
      });
    }
    const md = [`# ${conv.title}`, `> Model: ${conv.modelId} · ${conv.updatedAt}`, ""]
      .concat(messages.flatMap((m) => [`## ${m.role === "user" ? "🧑 Bạn" : "🤖 Lumen"}`, "", m.content, ""]))
      .join("\n");
    return new Response(md, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="chat.md"` },
    });
  } catch (e) { return httpError(e); }
}
