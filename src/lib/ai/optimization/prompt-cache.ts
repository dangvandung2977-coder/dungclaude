// Prompt Cache Manager — orders context so provider-side caching works:
// STABLE (system, tools, project instructions) first, DYNAMIC (summary,
// RAG, current) after. Never mutate the stable prefix between requests.
// Anthropic: adds cache_control breakpoints (5-min TTL) via the gateway.
import { estimateTokens } from "@/lib/ai/registry";
import type { OptimizationSettings } from "@/types/optimization";

export interface ContextParts {
  baseSystem: string;      // stable: core assistant instructions
  userSystemPrompt: string; // stable-ish: custom system prompt for this conv
  projectInstructions: string; // stable: project instructions
  userMemory?: string;     // stable: global user profile/preferences
  projectMemory?: string;  // stable: persistent project facts/architecture
  summary: string;         // dynamic: conversation summary
  semanticMemory: string;  // dynamic: retrieved old messages and cross-chat memory
  ragContext: string;      // dynamic: retrieved file chunks
}

// Build final system string: stable → dynamic. Same input = same output.
export function buildCachedSystem(parts: ContextParts, s: OptimizationSettings): { system: string; stablePrefix: string; dynamicSuffix: string } {
  const stable: string[] = [];
  if (parts.baseSystem) stable.push(parts.baseSystem);
  if (parts.userSystemPrompt) stable.push(parts.userSystemPrompt);
  if (parts.projectInstructions) stable.push(parts.projectInstructions);
  if (parts.userMemory) stable.push(parts.userMemory);
  if (parts.projectMemory) stable.push(parts.projectMemory);
  const stablePrefix = stable.join("\n\n");

  const dynamic: string[] = [];
  if (parts.summary) dynamic.push(`[Summary of previous conversation — key context, condensed:\n${parts.summary}\n]`);
  if (parts.semanticMemory) dynamic.push(`[Relevant context from previous conversations & memory:\n${parts.semanticMemory}\n]`);
  if (parts.ragContext) dynamic.push(parts.ragContext);
  const dynamicSuffix = dynamic.join("\n\n");

  return { system: [stablePrefix, dynamicSuffix].filter(Boolean).join("\n\n"), stablePrefix, dynamicSuffix };
}

// Split point (in tokens) where Anthropic cache breakpoint goes: end of
// stable prefix. Only worth caching when the prefix is large enough
// (Anthropic minimum cacheable is 1024 tokens for Sonnet/Opus, 2048 Haiku).
export function anthropicCachePoint(stablePrefix: string, s: OptimizationSettings): boolean {
  if (!s.promptCaching.enabled) return false;
  return estimateTokens(stablePrefix) >= 1024;
}
