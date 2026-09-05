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

    // Exact user query from conversation
    const res5 = isImageGenerationRequest("tạo cho t hình ảnh về một con chó đang bay trên trời cùng máy bay");
    expect(res5.isImage).toBe(true);
    expect(res5.prompt.toLowerCase()).toContain("chó đang bay");

    const res6 = isImageGenerationRequest("vẽ cho tao con mèo máy");
    expect(res6.isImage).toBe(true);
    expect(res6.prompt.toLowerCase()).toContain("mèo máy");

    const res7 = isImageGenerationRequest("làm cho mk cái ảnh avatar phi hành gia");
    expect(res7.isImage).toBe(true);
    expect(res7.prompt.toLowerCase()).toContain("phi hành gia");
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

  it("does not trigger on regular chat, code queries, or prompt writing requests", () => {
    const res1 = isImageGenerationRequest("hãy viết cho tôi một bài thơ về mùa thu");
    expect(res1.isImage).toBe(false);

    const res2 = isImageGenerationRequest("giải thích cách hoạt động của useEffect trong React");
    expect(res2.isImage).toBe(false);

    const res3 = isImageGenerationRequest("bạn là ai và có thể làm được gì?");
    expect(res3.isImage).toBe(false);

    const res4 = isImageGenerationRequest("viết prompt tạo ảnh con chó");
    expect(res4.isImage).toBe(false);

    expect(isImageGenerationRequest("viết prompt tạo ảnh").isImage).toBe(false);
    expect(isImageGenerationRequest("tạo prompt tạo ảnh con mèo").isImage).toBe(false);
    expect(isImageGenerationRequest("viết cho tao prompt vẽ tranh").isImage).toBe(false);
    expect(isImageGenerationRequest("prompt vẽ ảnh phi hành gia").isImage).toBe(false);
    expect(isImageGenerationRequest("cho tao pormpt tạo ảnh").isImage).toBe(false);

    const res5 = isImageGenerationRequest("hướng dẫn tạo ảnh bằng AI");
    expect(res5.isImage).toBe(false);
  });

  it("extracts aspect ratios and artistic styles accurately from natural prompt", () => {
    const res1 = isImageGenerationRequest("vẽ cho tao con mèo tỷ lệ 16:9 phong cách anime");
    expect(res1.isImage).toBe(true);
    expect(res1.aspectRatio).toBe("16:9");
    expect(res1.style).toBe("anime");
    expect(res1.prompt.toLowerCase()).toContain("con mèo");

    const res2 = isImageGenerationRequest("tạo ảnh chân dung chiến binh tương lai 3:4 phong cách cyberpunk");
    expect(res2.isImage).toBe(true);
    expect(res2.aspectRatio).toBe("3:4");
    expect(res2.style).toBe("cyberpunk");

    const res3 = isImageGenerationRequest("vẽ tranh phong cảnh hoàng hôn khổ ngang màu nước");
    expect(res3.isImage).toBe(true);
    expect(res3.aspectRatio).toBe("16:9");
    expect(res3.style).toBe("watercolor");
  });
});
