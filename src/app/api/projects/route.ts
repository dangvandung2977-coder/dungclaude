import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { listProjects, createProject } from "@/lib/db/repos";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return ok({ projects: await listProjects(user.id) });
  } catch (e) { return httpError(e); }
}

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(8000).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    return ok({ project: await createProject(user.id, body.name, body.description, body.instructions) });
  } catch (e) { return httpError(e); }
}
