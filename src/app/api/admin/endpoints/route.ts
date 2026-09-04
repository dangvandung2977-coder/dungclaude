import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { listEndpoints, createEndpoint, listCustomModels } from "@/lib/ai/custom-endpoints";

export const runtime = "nodejs";

// GET: danh sách endpoints kèm models. Admin only.
export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const endpoints = await listEndpoints();
    const withModels = await Promise.all(
      endpoints.map(async (e) => ({ ...e, models: await listCustomModels(e.id) }))
    );
    return ok({ endpoints: withModels });
  } catch (e) { return httpError(e); }
}

function validHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

const schema = z.object({
  name: z.string().min(1, "Thiếu tên").max(80),
  baseUrl: z.string().min(1, "Thiếu base URL").max(300).refine(validHttpUrl, "Base URL phải http(s)://…"),
  apiKey: z.string().max(20000).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = schema.parse(await req.json());
    const endpoint = await createEndpoint(body);
    return ok({ endpoint });
  } catch (e) { return httpError(e); }
}
