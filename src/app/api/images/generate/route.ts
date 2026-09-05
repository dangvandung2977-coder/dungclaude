import { z } from "zod";
import { requireUser } from "@/lib/auth/auth";
import { ok, fail, httpError } from "@/lib/http";
import { rateLimit } from "@/lib/security/security";
import { config } from "@/lib/config";
import { generateImage } from "@/lib/ai/image-gen";

export const runtime = "nodejs";

const schema = z.object({
  prompt: z.string().min(1, "Vui lòng nhập mô tả ảnh").max(2000),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("1:1"),
  style: z.string().max(50).optional(),
  modelId: z.string().max(200).optional(),
  conversationId: z.string().optional(),
  projectId: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser().catch(() => null);
    if (!user) return fail("Chưa đăng nhập", 401);

    const ip = req.headers.get("x-forwarded-for") ?? user.id;
    const rl = rateLimit(`image_gen:${ip}`, config.rateLimit.chatPerMin);
    if (!rl.ok) return fail(`Gửi quá nhanh, thử lại sau ${rl.retryAfterSec}s.`, 429);

    let body: z.infer<typeof schema>;
    try {
      body = schema.parse(await req.json());
    } catch (e) {
      if (e instanceof z.ZodError) {
        return fail(e.issues.map((i) => i.message).join(", "), 400);
      }
      return fail("Dữ liệu không hợp lệ.", 400);
    }

    const result = await generateImage({
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      style: body.style,
      modelId: body.modelId,
      userId: user.id,
      conversationId: body.conversationId,
      projectId: body.projectId,
    });

    return ok({ image: result });
  } catch (e) {
    return httpError(e);
  }
}
