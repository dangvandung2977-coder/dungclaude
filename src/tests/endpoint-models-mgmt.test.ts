import { describe, it, expect } from "vitest";

describe("Endpoint Models Sorting & Management Logic", () => {
  interface TestModel {
    id: string;
    displayName: string;
    apiName: string;
    capabilities: string[];
    enabled: boolean;
  }

  const sampleModels: TestModel[] = [
    { id: "1", displayName: "Llama 3.1 8B", apiName: "llama-3.1-8b", capabilities: ["chat"], enabled: true },
    { id: "2", displayName: "FLUX.1 Schnell", apiName: "flux-schnell", capabilities: ["image_gen"], enabled: false },
    { id: "3", displayName: "DeepSeek R1", apiName: "deepseek-r1", capabilities: ["chat", "reasoning"], enabled: true },
    { id: "4", displayName: "DALL-E 3 Proxy", apiName: "dall-e-3", capabilities: ["image_gen"], enabled: true },
    { id: "5", displayName: "Qwen 2.5 Vision", apiName: "qwen-2.5-vl", capabilities: ["chat", "vision"], enabled: false },
  ];

  it("sorts models alphabetically (A-Z and Z-A)", () => {
    const sortedAsc = [...sampleModels].sort((a, b) => a.displayName.localeCompare(b.displayName));
    expect(sortedAsc[0].displayName).toBe("DALL-E 3 Proxy");
    expect(sortedAsc[sortedAsc.length - 1].displayName).toBe("Qwen 2.5 Vision");

    const sortedDesc = [...sampleModels].sort((a, b) => b.displayName.localeCompare(a.displayName));
    expect(sortedDesc[0].displayName).toBe("Qwen 2.5 Vision");
    expect(sortedDesc[sortedDesc.length - 1].displayName).toBe("DALL-E 3 Proxy");
  });

  it("sorts models with Image Gen first", () => {
    const sortedImageFirst = [...sampleModels].sort((a, b) => {
      const aImg = a.capabilities.includes("image_gen") ? 1 : 0;
      const bImg = b.capabilities.includes("image_gen") ? 1 : 0;
      return bImg - aImg;
    });

    expect(sortedImageFirst[0].capabilities).toContain("image_gen");
    expect(sortedImageFirst[1].capabilities).toContain("image_gen");
    expect(sortedImageFirst[2].capabilities).not.toContain("image_gen");
  });

  it("sorts models with Enabled first", () => {
    const sortedActiveFirst = [...sampleModels].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));
    expect(sortedActiveFirst[0].enabled).toBe(true);
    expect(sortedActiveFirst[1].enabled).toBe(true);
    expect(sortedActiveFirst[2].enabled).toBe(true);
    expect(sortedActiveFirst[3].enabled).toBe(false);
    expect(sortedActiveFirst[4].enabled).toBe(false);
  });

  it("filters models correctly by capability", () => {
    const imageModels = sampleModels.filter((m) => m.capabilities.includes("image_gen"));
    expect(imageModels.length).toBe(2);
    expect(imageModels.map((m) => m.displayName)).toEqual(["FLUX.1 Schnell", "DALL-E 3 Proxy"]);

    const reasoningModels = sampleModels.filter((m) => m.capabilities.includes("reasoning"));
    expect(reasoningModels.length).toBe(1);
    expect(reasoningModels[0].displayName).toBe("DeepSeek R1");
  });

  it("filters models by search query matching displayName or apiName", () => {
    const query = "flux";
    const filtered = sampleModels.filter(
      (m) => m.displayName.toLowerCase().includes(query) || m.apiName.toLowerCase().includes(query)
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].displayName).toBe("FLUX.1 Schnell");
  });
});
