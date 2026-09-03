import { describe, it, expect } from "vitest";
import { calculate } from "@/lib/tools/tools";
import { chunkText } from "@/lib/rag/retriever";
import { estimateTokens, calcCost, providerOf, modelNameOf, supports, getEffectiveModels, parseModelRef } from "@/lib/ai/registry";
import { validateUpload, encryptSecret, decryptSecret, maskKey, rateLimit } from "@/lib/security/security";

describe("calculator (safe, no eval)", () => {
  it("computes basic arithmetic", () => {
    expect(calculate("2+3*4")).toBe(14);
    expect(calculate("(12.5*3+8)/2")).toBeCloseTo(22.75);
    expect(calculate("2^10")).toBe(1024);
    expect(calculate("sqrt(16)+10%3")).toBe(5);
  });
  it("rejects invalid expressions", () => {
    expect(() => calculate("2+")).toThrow();
    expect(() => calculate("abc")).toThrow();
    expect(() => calculate("process.exit(1)")).toThrow();
  });
});

describe("rag chunker", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("hello")).toEqual(["hello"]);
    expect(chunkText("")).toEqual([]);
  });
  it("splits long text with overlap", () => {
    const long = "a".repeat(5000);
    const chunks = chunkText(long, 1200, 150);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 1200)).toBe(true);
  });
});

describe("model registry", () => {
  it("parses provider/model", () => {
    expect(providerOf("openai:gpt-4o")).toBe("openai");
    expect(modelNameOf("gemini:gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });
  it("estimates tokens and cost", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(calcCost("demo:lumen-echo", 1000, 1000)).toBe(0);
    const customM = [{ id: "custom:ce_test:model", provider: "custom", name: "Custom", contextWindow: 128000, capabilities: ["chat", "vision"], inputPricePerM: 2, outputPricePerM: 5, enabled: true, requiresKey: true }];
    expect(calcCost("custom:ce_test:model", 1_000_000, 0, customM)).toBeCloseTo(2);
  });
  it("checks capabilities", () => {
    const models = getEffectiveModels([], [{ id: "custom:ce_test:model", provider: "custom", name: "Custom", contextWindow: 128000, capabilities: ["chat", "vision"], inputPricePerM: 2, outputPricePerM: 5, enabled: true, requiresKey: true }]);
    expect(supports(models, "custom:ce_test:model", "vision")).toBe(true);
    expect(supports(models, "custom:ce_test:model", "chat")).toBe(true);
  });
  it("parses custom 3-part model refs", () => {
    expect(parseModelRef("custom:ce_abc123:llama-3.1-8b")).toEqual({ provider: "custom", endpointId: "ce_abc123", model: "llama-3.1-8b" });
    expect(providerOf("custom:ce_abc123:llama-3.1-8b")).toBe("custom");
    expect(modelNameOf("custom:ce_abc123:llama-3.1-8b")).toBe("llama-3.1-8b");
    expect(parseModelRef("openai:gpt-4o")).toEqual({ provider: "openai", model: "gpt-4o" });
    expect(modelNameOf("openrouter:deepseek/deepseek-chat")).toBe("deepseek/deepseek-chat");
  });
  it("does not include default Claude models in catalog", () => {
    const models = getEffectiveModels();
    expect(models.some((m) => m.provider === "anthropic")).toBe(false);
    expect(models.some((m) => m.name.includes("Claude"))).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts images and video", () => {
    expect(validateUpload("anh.png", "image/png", 1024).ok).toBe(true);
    expect(validateUpload("clip.mp4", "video/mp4", 50 * 1024 * 1024).kind).toBe("video");
  });
  it("rejects oversized and dangerous names", () => {
    expect(validateUpload("big.mp4", "video/mp4", 500 * 1024 * 1024).ok).toBe(false);
    expect(validateUpload("../evil.sh", "application/x-sh", 10).ok).toBe(false);
    expect(validateUpload("virus.exe", "application/x-msdownload", 10).ok).toBe(false);
  });
});

describe("secret encryption", () => {
  it("round-trips and masks", () => {
    const enc = encryptSecret("sk-test-1234567890");
    expect(enc).not.toContain("sk-test");
    expect(decryptSecret(enc)).toBe("sk-test-1234567890");
    expect(maskKey("sk-test-1234567890")).toMatch(/sk-.*7890/);
  });
});

describe("rate limiter", () => {
  it("blocks after limit", () => {
    const k = `test:${Date.now()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(k, 5).ok).toBe(true);
    expect(rateLimit(k, 5).ok).toBe(false);
  });
});
