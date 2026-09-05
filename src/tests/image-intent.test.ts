import { describe, it, expect } from "vitest";
import { isImageGenerationRequest } from "@/lib/ai/image-gen";

describe("Image Generation Intent Recognition in Chat", () => {
  it("detects Vietnamese image generation requests", () => {
    const res1 = isImageGenerationRequest("vẽ cho tôi con rồng vàng trên đỉnh núi tuyết");
    expect(res1.isImage).toBe(true);
    expect(res1.prompt.toLowerCase()).toContain("con rồng");

    const res2 = isImageGenerationRequest("hãy vẽ bức tranh hoàng hôn trên biển anime");
    expect(res2.isImage).toBe(true);
    expect(res2.prompt.toLowerCase()).toContain("hoàng hôn");

    const res3 = isImageGenerationRequest("tạo ảnh phi hành gia cưỡi khủng long");
    expect(res3.isImage).toBe(true);
    expect(res3.prompt.toLowerCase()).toContain("phi hành gia");

    const res4 = isImageGenerationRequest("sinh ảnh phong cảnh cyberpunk về đêm");
    expect(res4.isImage).toBe(true);
    expect(res4.prompt.toLowerCase()).toContain("cyberpunk");
  });

  it("detects slash commands", () => {
    const res = isImageGenerationRequest("/image futuristic cyberpunk sports car");
    expect(res.isImage).toBe(true);
    expect(res.prompt).toBe("futuristic cyberpunk sports car");
  });

  it("detects English image generation requests", () => {
    const res = isImageGenerationRequest("draw me a cute cat astronaut floating in space");
    expect(res.isImage).toBe(true);
    expect(res.prompt.toLowerCase()).toContain("cute cat astronaut");

    const res2 = isImageGenerationRequest("generate an image of a medieval castle on a floating island");
    expect(res2.isImage).toBe(true);
    expect(res2.prompt.toLowerCase()).toContain("medieval castle");
  });

  it("does not trigger on regular chat or code queries", () => {
    const res1 = isImageGenerationRequest("hãy viết cho tôi một bài thơ về mùa thu");
    expect(res1.isImage).toBe(false);

    const res2 = isImageGenerationRequest("giải thích cách hoạt động của useEffect trong React");
    expect(res2.isImage).toBe(false);

    const res3 = isImageGenerationRequest("bạn là ai và có thể làm được gì?");
    expect(res3.isImage).toBe(false);
  });
});
