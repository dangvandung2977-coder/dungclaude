import { describe, it, expect } from "vitest";
import {
  isReasoningModel,
  getDefaultReasoningEffort,
  REASONING_EFFORT_OPTIONS,
} from "@/lib/ai/reasoning";

describe("Reasoning Effort & Model Capability Detection", () => {
  it("correctly identifies reasoning models", () => {
    // GLM 5.3 models
    expect(isReasoningModel("custom:ce_mtmr6ivpz7e9jvrx:z-ai_glm-5.3-free")).toBe(true);
    expect(isReasoningModel("z-ai/glm-5.3-free")).toBe(true);
    expect(isReasoningModel("glm-5.3-flash")).toBe(true);

    // OpenAI o-series
    expect(isReasoningModel("openai:o1")).toBe(true);
    expect(isReasoningModel("openai:o3-mini")).toBe(true);
    expect(isReasoningModel("o4-preview")).toBe(true);

    // DeepSeek & Qwen reasoning
    expect(isReasoningModel("deepseek-r1")).toBe(true);
    expect(isReasoningModel("deepseek-reasoner")).toBe(true);
    expect(isReasoningModel("qwq-32b")).toBe(true);

    // Claude thinking models
    expect(isReasoningModel("anthropic:claude-3-7-sonnet")).toBe(true);
    expect(isReasoningModel("custom:ce_123:claude-opus-5-thinking")).toBe(true);

    // Models with capability flag
    expect(isReasoningModel("my-custom-model", ["chat", "reasoning"])).toBe(true);
    expect(isReasoningModel("my-custom-model-2", ["chat", "reasoning_effort"])).toBe(true);

    // Non-reasoning standard models
    expect(isReasoningModel("openai:gpt-4o", ["chat", "vision"])).toBe(false);
    expect(isReasoningModel("openai:gpt-4o-mini", ["chat"])).toBe(false);
    expect(isReasoningModel("gemini:gemini-2.5-flash", ["chat", "vision"])).toBe(false);
    expect(isReasoningModel("anthropic:claude-3-5-haiku-20241022")).toBe(false);
  });

  it("defaults z-ai/glm-5.3-free to 'high' effort as requested", () => {
    expect(getDefaultReasoningEffort("custom:ce_mtmr6ivpz7e9jvrx:z-ai_glm-5.3-free")).toBe("high");
    expect(getDefaultReasoningEffort("z-ai/glm-5.3-free")).toBe("high");
    expect(getDefaultReasoningEffort("any-glm-5.3-free-variant")).toBe("high");

    // Other models default to medium
    expect(getDefaultReasoningEffort("openai:o3-mini")).toBe("medium");
    expect(getDefaultReasoningEffort("claude-3-7-sonnet")).toBe("medium");
  });

  it("has complete reasoning effort options definitions", () => {
    expect(REASONING_EFFORT_OPTIONS).toHaveLength(3);
    const ids = REASONING_EFFORT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual(["low", "medium", "high"]);
    for (const opt of REASONING_EFFORT_OPTIONS) {
      expect(opt.label).toBeTruthy();
      expect(opt.shortLabel).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });
});
