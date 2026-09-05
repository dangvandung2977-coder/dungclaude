import { describe, it, expect, vi } from "vitest";
import {
  ASPECT_RATIOS,
  STYLE_PRESETS,
  getAvailableImageModels,
  generateImage,
} from "@/lib/ai/image-gen";
import { executeTool } from "@/lib/tools/tools";
import { FUNCTION_LABELS } from "@/lib/config";

// Mock Supabase storage and attachment creation so tests run standalone without network
vi.mock("@/lib/files/storage", () => ({
  uploadBuffer: vi.fn().mockResolvedValue({
    id: "test-att-123",
    url: "/api/files/test-att-123",
    fileName: "image-test.png",
    mimeType: "image/png",
    sizeBytes: 1024,
  }),
}));

vi.mock("@/lib/db/repos", () => ({
  createAttachment: vi.fn().mockResolvedValue({
    id: "test-att-123",
    fileName: "image-test.png",
    mimeType: "image/png",
    sizeBytes: 1024,
  }),
}));

describe("Image Generation System", () => {
  describe("Configuration & Presets", () => {
    it("has image_gen defined in FUNCTION_LABELS for Admin routing", () => {
      expect(FUNCTION_LABELS.image_gen).toBeDefined();
      expect(FUNCTION_LABELS.image_gen).toContain("Tạo ảnh");
    });

    it("defines valid aspect ratios with standard dimensions", () => {
      expect(ASPECT_RATIOS["1:1"]).toBeDefined();
      expect(ASPECT_RATIOS["1:1"].width).toBe(1024);
      expect(ASPECT_RATIOS["1:1"].height).toBe(1024);

      expect(ASPECT_RATIOS["16:9"]).toBeDefined();
      expect(ASPECT_RATIOS["16:9"].width).toBeGreaterThan(ASPECT_RATIOS["16:9"].height);

      expect(ASPECT_RATIOS["9:16"]).toBeDefined();
      expect(ASPECT_RATIOS["9:16"].height).toBeGreaterThan(ASPECT_RATIOS["9:16"].width);
    });

    it("defines curated artistic styles with evocative prompt suffixes", () => {
      expect(STYLE_PRESETS.photographic).toBeDefined();
      expect(STYLE_PRESETS.photographic.promptSuffix).toContain("photorealistic");

      expect(STYLE_PRESETS.anime).toBeDefined();
      expect(STYLE_PRESETS.anime.promptSuffix).toContain("anime");

      expect(STYLE_PRESETS.cyberpunk).toBeDefined();
      expect(STYLE_PRESETS.cyberpunk.promptSuffix).toContain("cyberpunk");
    });
  });

  describe("Model Availability", () => {
    it("returns available image models with image_gen capability", async () => {
      const { models, activeRoute } = await getAvailableImageModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(activeRoute).toBeDefined();

      const dalle = models.find((m) => m.id.includes("dall-e-3"));
      expect(dalle).toBeDefined();
      expect(dalle?.capabilities).toContain("image_gen");
    });
  });

  describe("Generation & Fallback Engine", () => {
    it("generates an image with userId and returns attachment metadata", async () => {
      const result = await generateImage({
        prompt: "A beautiful golden dragon flying over misty mountains",
        aspectRatio: "16:9",
        style: "cinematic",
        userId: "user-123",
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("test-att-123");
      expect(result.url).toBe("/api/files/test-att-123");
      expect(result.prompt).toContain("dragon");
      expect(result.aspectRatio).toBe("16:9");
      expect(result.width).toBe(1792);
      expect(result.height).toBe(1024);
    });

    it("generates fallback data URL when userId is omitted and handles 1:1 ratio", async () => {
      const result = await generateImage({
        prompt: "Futuristic neon city",
        aspectRatio: "1:1",
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.url).toContain("data:image/");
      expect(result.width).toBe(1024);
      expect(result.height).toBe(1024);
    });
  });

  describe("Tool Execution (executeTool)", () => {
    it("executes generate_image tool and returns JSON with success and url", async () => {
      const outputStr = await executeTool("generate_image", {
        prompt: "Cute puppy in a flower field",
        aspectRatio: "1:1",
        style: "photographic",
      });

      const parsed = JSON.parse(outputStr);
      expect(parsed.success).toBe(true);
      expect(parsed.imageUrl).toBeDefined();
      expect(parsed.fileId).toBeDefined();
      expect(parsed.prompt).toContain("Cute puppy");
      expect(parsed.aspectRatio).toBe("1:1");
    });
  });
});
