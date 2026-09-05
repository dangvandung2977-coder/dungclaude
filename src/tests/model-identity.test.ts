import { describe, it, expect } from "vitest";
import {
  formatModelDisplayName,
  resolveModelDeveloper,
  resolveModelIdentity,
  buildBaseSystem,
} from "@/lib/ai/system-prompt";
import type { AIModel } from "@/types";

describe("Model Identity & System Prompt Suite", () => {
  describe("formatModelDisplayName", () => {
    it("formats known models and custom model IDs cleanly", () => {
      expect(formatModelDisplayName("gpt-6-astra")).toBe("GPT-6 Astra");
      expect(formatModelDisplayName("custom:ce_123:gpt-6-astra")).toBe("GPT-6 Astra");
      expect(formatModelDisplayName("claude-3-7-sonnet")).toBe("Claude 3.7 Sonnet");
      expect(formatModelDisplayName("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
      expect(formatModelDisplayName("deepseek-chat")).toBe("DeepSeek-V3");
      expect(formatModelDisplayName("deepseek-reasoner")).toBe("DeepSeek-R1");
      expect(formatModelDisplayName("gpt-4o")).toBe("GPT-4o");
      expect(formatModelDisplayName("gpt-4o-mini")).toBe("GPT-4o mini");
    });

    it("formats arbitrary custom model strings properly", () => {
      expect(formatModelDisplayName("llama-3.3-70b-instruct")).toBe("Llama 3.3 70b Instruct");
      expect(formatModelDisplayName("qwen-2.5-coder-32b")).toBe("Qwen 2.5 Coder 32b");
    });
  });

  describe("resolveModelDeveloper", () => {
    it("identifies major AI labs and developers correctly", () => {
      expect(resolveModelDeveloper("gpt-6-astra")).toBe("OpenAI");
      expect(resolveModelDeveloper("custom:ce_1:gpt-6-astra")).toBe("OpenAI");
      expect(resolveModelDeveloper("anthropic:claude-3-7-sonnet")).toBe("Anthropic");
      expect(resolveModelDeveloper("gemini:gemini-2.5-flash")).toBe("Google");
      expect(resolveModelDeveloper("deepseek:deepseek-chat")).toBe("DeepSeek");
      expect(resolveModelDeveloper("meta:llama-3.3-70b")).toBe("Meta");
      expect(resolveModelDeveloper("qwen-2.5-coder")).toBe("Alibaba Cloud");
      expect(resolveModelDeveloper("glm-4-plus")).toBe("Zhipu AI");
      expect(resolveModelDeveloper("mistral-large")).toBe("Mistral AI");
      expect(resolveModelDeveloper("kimi-k1.5")).toBe("Moonshot AI");
      expect(resolveModelDeveloper("grok-2")).toBe("xAI");
    });
  });

  describe("resolveModelIdentity", () => {
    it("resolves full identity with available models metadata", () => {
      const sampleModels: AIModel[] = [
        {
          id: "custom:ce_1:gpt-6-astra",
          provider: "custom",
          name: "GPT-6 Astra",
          contextWindow: 128000,
          capabilities: ["chat"],
          inputPricePerM: 0,
          outputPricePerM: 0,
          enabled: true,
          requiresKey: true,
        },
      ];

      const identity = resolveModelIdentity("custom:ce_1:gpt-6-astra", sampleModels);
      expect(identity.id).toBe("custom:ce_1:gpt-6-astra");
      expect(identity.displayName).toBe("GPT-6 Astra");
      expect(identity.developer).toBe("OpenAI");
    });

    it("resolves full identity without prior metadata using heuristic fallback", () => {
      const identity = resolveModelIdentity("claude-3-7-sonnet");
      expect(identity.displayName).toBe("Claude 3.7 Sonnet");
      expect(identity.developer).toBe("Anthropic");
    });
  });

  describe("buildBaseSystem", () => {
    it("constructs model-aware system instructions for GPT-6 Astra", () => {
      const prompt = buildBaseSystem("gpt-6-astra");

      // Verify self-identity assertions
      expect(prompt).toContain("You are GPT-6 Astra");
      expect(prompt).toContain("developed by OpenAI");
      expect(prompt).toContain("DungClaude AI Workspace");

      // Verify guidance on questions regarding identity
      expect(prompt).toContain("NEVER claim you do not know your model name");
      expect(prompt).toContain("NEVER deny your true identity as GPT-6 Astra");
      expect(prompt).toContain("NEVER say you are \"only DungClaude\"");

      // Verify code and prompt.md rules remain intact
      expect(prompt).toContain("prompt.md");
      expect(prompt).toContain("cái ô block file md");
      expect(prompt).toContain("production-ready code");
    });

    it("constructs model-aware system instructions for Claude 3.7 Sonnet", () => {
      const prompt = buildBaseSystem("claude-3-7-sonnet");
      expect(prompt).toContain("You are Claude 3.7 Sonnet");
      expect(prompt).toContain("developed by Anthropic");
      expect(prompt).toContain("DungClaude AI Workspace");
    });

    it("constructs model-aware system instructions for Gemini 2.5 Flash", () => {
      const prompt = buildBaseSystem("gemini:gemini-2.5-flash");
      expect(prompt).toContain("You are Gemini 2.5 Flash");
      expect(prompt).toContain("developed by Google");
      expect(prompt).toContain("DungClaude AI Workspace");
    });
  });
});
