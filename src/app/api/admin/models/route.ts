import { z } from "zod";
import { requireAdmin } from "@/lib/auth/auth";
import { ok, httpError } from "@/lib/http";
import { MODEL_CATALOG, getEffectiveModels } from "@/lib/ai/registry";
import { getModelOverrides, setModelEnabled, getAllRoutes, setRoute, getAllModelNotes, setModelNote } from "@/lib/ai/providers-config";
import { invalidateModelsLoaderCache } from "@/lib/ai/models-loader";
import type { FunctionKey } from "@/lib/config";

export const runtime = "nodejs";

// GET: effective model catalog + per-function routes + model notes. Admin only.
export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const [overrides, notes, routes] = await Promise.all([
      getModelOverrides(),
      getAllModelNotes(),
      getAllRoutes(),
    ]);
    const models = getEffectiveModels(overrides).map((m) => ({
      ...m,
      description: notes[m.id] ?? m.description,
    }));
    return ok({ models, routes, notes, catalog: MODEL_CATALOG });
  } catch (e) { return httpError(e); }
}

const schema = z.union([
  z.object({ action: z.literal("toggle"), modelId: z.string(), provider: z.string(), enabled: z.boolean() }),
  z.object({ action: z.literal("route"), functionKey: z.string(), modelId: z.string() }),
  z.object({ action: z.literal("note"), modelId: z.string(), note: z.string().max(1000) }),
]);

export async function PUT(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const body = schema.parse(await req.json());
    if (body.action === "toggle") {
      await setModelEnabled(body.modelId, body.provider, body.enabled);
    } else if (body.action === "route") {
      await setRoute(body.functionKey as FunctionKey, body.modelId);
    } else if (body.action === "note") {
      await setModelNote(body.modelId, body.note);
      invalidateModelsLoaderCache();
    }
    return ok({ ok: true, routes: await getAllRoutes(), notes: await getAllModelNotes() });
  } catch (e) { return httpError(e); }
}
