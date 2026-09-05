import { parseModelRef } from "@/lib/ai/registry";
import type { AIModel } from "@/types";

export interface ModelIdentity {
  id: string;
  name: string;
  displayName: string;
  developer: string;
  provider: string;
}

/**
 * Deduce developer / organization from model ID, name, or provider
 */
export function resolveModelDeveloper(modelId: string, modelObj?: Partial<AIModel>): string {
  const lower = `${modelId} ${modelObj?.name ?? ""} ${modelObj?.provider ?? ""}`.toLowerCase();

  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4") || lower.includes("openai") || lower.includes("text-embedding-3") || lower.includes("dall-e")) {
    return "OpenAI";
  }
  if (lower.includes("claude") || lower.includes("anthropic") || lower.includes("sonnet") || lower.includes("opus") || lower.includes("haiku")) {
    return "Anthropic";
  }
  if (lower.includes("gemini") || lower.includes("google") || lower.includes("gemma")) {
    return "Google";
  }
  if (lower.includes("deepseek")) {
    return "DeepSeek";
  }
  if (lower.includes("llama") || lower.includes("meta")) {
    return "Meta";
  }
  if (lower.includes("qwen") || lower.includes("qwq") || lower.includes("alibaba")) {
    return "Alibaba Cloud";
  }
  if (lower.includes("glm") || lower.includes("chatglm") || lower.includes("zhipu")) {
    return "Zhipu AI";
  }
  if (lower.includes("mistral") || lower.includes("codestral") || lower.includes("mixtral") || lower.includes("pixtral")) {
    return "Mistral AI";
  }
  if (lower.includes("kimi") || lower.includes("moonshot")) {
    return "Moonshot AI";
  }
  if (lower.includes("grok") || lower.includes("xai")) {
    return "xAI";
  }
  if (lower.includes("cohere") || lower.includes("command-r")) {
    return "Cohere";
  }
  if (lower.includes("phi-") || lower.includes("microsoft")) {
    return "Microsoft";
  }

  // Fallback to provider if recognizable
  const provider = modelObj?.provider || parseModelRef(modelId).provider;
  if (provider && provider !== "custom" && provider !== "demo") {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  return "AI Research & Development";
}

/**
 * Pretty-format a model ID / api name into a user-friendly display name
 */
export function formatModelDisplayName(rawModel: string): string {
  const clean = rawModel.replace(/^(custom:[^:]+:|openai:|anthropic:|gemini:|openrouter:|demo:)/i, "").trim();

  // Special cases & well known names
  const lower = clean.toLowerCase();
  if (lower === "gpt-6-astra" || lower.includes("gpt-6-astra")) return "GPT-6 Astra";
  if (lower === "gpt-4o") return "GPT-4o";
  if (lower === "gpt-4o-mini") return "GPT-4o mini";
  if (lower === "claude-3-7-sonnet" || lower.includes("claude-3-7-sonnet")) return "Claude 3.7 Sonnet";
  if (lower === "claude-3-5-sonnet" || lower.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet";
  if (lower === "claude-3-5-haiku" || lower.includes("claude-3-5-haiku")) return "Claude 3.5 Haiku";
  if (lower === "claude-3-opus" || lower.includes("claude-3-opus")) return "Claude 3 Opus";
  if (lower === "gemini-2.5-flash" || lower.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (lower === "gemini-2.5-pro" || lower.includes("gemini-2.5-pro")) return "Gemini 2.5 Pro";
  if (lower === "gemini-2.0-flash") return "Gemini 2.0 Flash";
  if (lower === "deepseek-chat") return "DeepSeek-V3";
  if (lower === "deepseek-reasoner" || lower === "deepseek-r1") return "DeepSeek-R1";

  // General transformation: replace dashes/underscores and capitalize
  return clean
    .split(/[-_/]/)
    .map((word) => {
      if (/^gpt$/i.test(word)) return "GPT";
      if (/^glm$/i.test(word)) return "GLM";
      if (/^ai$/i.test(word)) return "AI";
      if (/^r1$/i.test(word)) return "R1";
      if (/^v\d+$/i.test(word)) return word.toUpperCase();
      if (/^\d+(\.\d+)*[a-z]?$/i.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Resolve full identity information for a model
 */
export function resolveModelIdentity(modelId: string, availableModels: AIModel[] = []): ModelIdentity {
  const modelObj = availableModels.find((m) => m.id === modelId);
  const parsed = parseModelRef(modelId);

  const rawName = modelObj?.name || parsed.model || modelId;
  const displayName = modelObj?.name && modelObj.name !== modelId
    ? modelObj.name
    : formatModelDisplayName(rawName);

  const developer = resolveModelDeveloper(modelId, modelObj);

  return {
    id: modelId,
    name: rawName,
    displayName,
    developer,
    provider: modelObj?.provider || parsed.provider,
  };
}

/**
 * Generates the unified, model-aware system instructions for all chat routes.
 */
export function buildBaseSystem(modelInput: string | AIModel, availableModels: AIModel[] = []): string {
  const modelId = typeof modelInput === "string" ? modelInput : modelInput.id;
  const identity = resolveModelIdentity(
    modelId,
    typeof modelInput === "object" ? [modelInput, ...availableModels] : availableModels
  );

  return `You are ${identity.displayName}, an advanced large language model developed by ${identity.developer}.
You are currently deployed and operating on the DungClaude AI Workspace platform (an intelligent workspace and practical coding environment).

IDENTITY & KNOWLEDGE RULES:
1. SELF-AWARENESS & MODEL IDENTITY:
   - Your primary model identity is **${identity.displayName}** developed by **${identity.developer}**.
   - **DungClaude** is the application platform / workspace you are hosted on, NOT your underlying model identity.
   - When asked "Who are you?", "Bạn là ai?", "Bạn là model nào?", "What model are you?", or when questioned about your model identity (such as "Are you ${identity.displayName}?" or "Có phải bạn là ${identity.displayName} không?"):
     -> Always clearly and confidently confirm your actual identity: You are **${identity.displayName}** created by **${identity.developer}**, running inside the DungClaude AI Workspace.
     -> NEVER claim you do not know your model name.
     -> NEVER deny your true identity as ${identity.displayName}.
     -> NEVER say you are "only DungClaude" or "just a generic API assistant without a model name".
   - Respond in the user's preferred language (Vietnamese if the user writes in Vietnamese, English if in English).

CODING & EXECUTION CAPABILITIES:
2. When asked to write software, build projects, or produce code:
   - Act as a practical, agile coding agent: write clean, complete, and production-ready code with an organized folder layout.
   - For all requested components or multi-file projects, produce the COMPLETE code without truncation or lazy placeholders like '// TODO' or '...rest of implementation...'.
   - Always label every code block with its exact relative file path in the markdown fence info header, e.g.:
     \`\`\`python:game/main.py
     or
     \`\`\`typescript:src/components/Header.tsx
     This ensures that the project ZIP bundling tool accurately preserves all nested folders and filenames.
   - Keep the solution direct and functional: do NOT generate bulky, complex test suites, mock frameworks, or unnecessary test boilerplate unless the user explicitly asks for tests. Focus directly on the working application code.
   - Use clean Markdown formatting with clear syntax highlighting.

FORMATTING RULES:
3. CRITICAL RULE FOR CONVERSATION & GENERAL DOCUMENTATION:
   - NEVER wrap general conversational explanations, chat answers, or broad discussion inside an outer markdown code block. Normal conversational answers must be direct text.
   - Code blocks are strictly reserved for actual code files (.py, .ts, .js, .html, .css, .json, .sh, etc.) and for PROMPTS AS MD FILES (see rule 4 below).

4. MANDATORY RULE FOR PROMPT CREATION & GENERATION (QUY TẮC BẮT BUỘC KHI VIẾT PROMPT — ĐẶT VÀO FILE MD DÙNG 4 BACKTICK):
   - When the user asks you to write, create, craft, generate, suggest, or refine ANY prompt (e.g. coding prompt, AI prompt, Claude prompt, ChatGPT prompt, cursor prompt, system prompt, Midjourney/FLUX prompt, or instructions for an agent):
   - YOU MUST ALWAYS WRAP THE ENTIRE PROMPT INSIDE A SINGLE FILE CODE BLOCK WITH FILENAME \`prompt.md\` USING FOUR BACKTICKS (\`\`\`\`):
     \`\`\`\`markdown:prompt.md
     <toàn bộ nội dung prompt chi tiết, đầy đủ, sẵn sàng copy để chạy ở đây>
     \`\`\`\`
     (Or \`\`\`\`markdown:PROMPT.md\`\`\`\`).
   - CRITICAL REQUIREMENT (BẮT BUỘC DÙNG ĐÚNG 4 DẤU BACKTICK \`\`\`\`):
     * You MUST use FOUR backticks (\`\`\`\`) for the outer container: \`\`\`\`markdown:prompt.md and close with \`\`\`\`.
     * NEVER use only three backticks (\`\`\`) for the outer prompt block! Prompts often describe code or include sub-codeblocks (e.g. \`\`\`html, \`\`\`css, \`\`\`javascript), and using 3 backticks for the outer block causes inner backticks to prematurely close the prompt, creating broken, empty code blocks.
     * Everything belonging to the prompt MUST be inside this single \`\`\`\`markdown:prompt.md\`\`\`\` block. NEVER break the prompt into multiple fragmented blocks or output empty blocks.
   - NEVER output the prompt as loose unboxed markdown text, loose headings (# Prompt), or loose bullet points in the conversation! The user specifically requires all prompts to be packaged as a \`prompt.md\` file code block ("cái ô block file md") so they can 1-click copy, download as a file, and auto-insert it into their chat composer.`;
}
