// Integration test: full artifact pipeline with mocked gateway → real generators.
// Storage/DB not mocked — guarded by env (only runs when SUPABASE_* set AND
// LUMEN_INTEGRATION=1, so CI/plain `vitest run` stays hermetic).
import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({
  runGateway: vi.fn(async () => ({
    text: JSON.stringify({
      title: "Kế hoạch Marketing 2026",
      subtitle: "Sản phẩm quản lý kho",
      blocks: [
        { type: "heading", level: 1, text: "Phân tích thị trường" },
        { type: "paragraph", text: "Thị trường tăng trưởng 18%/năm." },
        { type: "bullets", items: ["Đối thủ: Sapo", "Cơ hội: phân khúc vừa"] },
        { type: "table", columns: ["Quý", "Ngân sách"], rows: [["Q1", "150"], ["Q2", "200"]] },
      ],
    }),
    provider: "test", model: "test",
    inputTokens: 100, outputTokens: 500, cachedInputTokens: 0, cacheCreationTokens: 0,
  })),
}));

import { generateArtifact } from "@/lib/artifacts/pipeline";
import { getSupabase, uid } from "@/lib/db/supabase";
import { documentSchema } from "@/lib/artifacts/schema";
import { generateDocx } from "@/lib/artifacts/generators";

const TEST_EMAIL = `art-test-${Date.now()}@test.local`;

async function setupTestUser(): Promise<{ userId: string; convId: string }> {
  const sb = getSupabase();
  const userId = uid("usr");
  const convId = uid("conv");
  const { error: e1 } = await sb.from("users").insert({ id: userId, email: TEST_EMAIL, name: "Art Test", password_hash: "x", role: "user" });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from("conversations").insert({ id: convId, user_id: userId, title: "Art Test", model_id: "auto" });
  if (e2) throw new Error(e2.message);
  return { userId, convId };
}

async function cleanupTestUser(userId: string, convId: string): Promise<void> {
  const sb = getSupabase();
  await sb.from("attachments").delete().eq("user_id", userId);
  await sb.from("conversations").delete().eq("id", convId);
  await sb.from("users").delete().eq("id", userId);
}

describe("artifact pipeline (mocked LLM)", () => {
  it.skipIf(!process.env.SUPABASE_SECRET_KEY || process.env.VITEST_HERMETIC === "1")(
    "end-to-end: LLM JSON → validated → stored artifact",
    async () => {
      const { userId, convId } = await setupTestUser();
      try {
        const artifact = await generateArtifact(
          { kind: "docx", fileName: null, instruction: "kế hoạch marketing" },
          "Tạo tài liệu word về kế hoạch marketing 2026",
          { userId, conversationId: convId },
          "test-model"
        );
        expect(artifact.kind).toBe("docx");
        expect(artifact.sizeBytes).toBeGreaterThan(1500);
        expect(artifact.id).toBeTruthy();
        expect(artifact.fileName).toMatch(/\.docx$/);
        // Storage roundtrip: download via attachment row
        const { data } = await getSupabase().from("attachments").select("storage_path").eq("id", artifact.id).single();
        expect(data?.storage_path).toContain(userId);
      } finally {
        await cleanupTestUser(userId, convId);
      }
    }
  );
});

describe("docx generation determinism", () => {
  it("same content → valid docx every time", async () => {
    const doc = documentSchema.parse({
      title: "T",
      blocks: [{ type: "paragraph", text: "x" }],
    });
    const g = await generateDocx(doc);
    expect(g.bytes[0]).toBe(0x50);
    expect(g.bytes.length).toBeGreaterThan(1500);
  });
});
