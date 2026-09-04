import { describe, it, expect, beforeEach } from "vitest";
import {
  createMemory,
  listMemories,
  deleteMemory,
  markMemorySuperseded,
  searchMemories,
  clearInMemoryStoreForTesting,
} from "@/lib/db/memory-repo";
import { routeMemory } from "@/lib/ai/memory/router";
import { getEmbedding } from "@/lib/ai/memory/embeddings";
import { composeMemoryContext } from "@/lib/ai/memory/context-composer";
import type { GatewayMessage } from "@/lib/ai/gateway";

describe("Persistent AI Memory System Test Suite", () => {
  beforeEach(() => {
    clearInMemoryStoreForTesting();
  });

  // 1. User Memory Isolation Test
  it("strictly isolates User A and User B memories (no cross-user leakage)", async () => {
    await createMemory({
      userId: "user_alice",
      scope: "global",
      key: "pref:style",
      content: "Alice prefers concise bullet points",
    });

    await createMemory({
      userId: "user_bob",
      scope: "global",
      key: "pref:style",
      content: "Bob prefers detailed essay explanations",
    });

    const aliceMemories = await listMemories({ userId: "user_alice" });
    const bobMemories = await listMemories({ userId: "user_bob" });

    expect(aliceMemories.length).toBe(1);
    expect(aliceMemories[0].content).toContain("Alice");
    expect(aliceMemories[0].content).not.toContain("Bob");

    expect(bobMemories.length).toBe(1);
    expect(bobMemories[0].content).toContain("Bob");
    expect(bobMemories[0].content).not.toContain("Alice");
  });

  // 2. Project Memory Isolation Test
  it("strictly isolates Project Alpha from Project Beta (no cross-project leakage)", async () => {
    const userId = "user_dev";

    // Project Alpha: Next.js + PostgreSQL
    await createMemory({
      userId,
      projectId: "prj_alpha",
      scope: "project",
      category: "architecture",
      key: "arch:database",
      content: "Alpha project uses PostgreSQL with Supabase",
    });

    // Project Beta: Minecraft / Java
    await createMemory({
      userId,
      projectId: "prj_beta",
      scope: "project",
      category: "architecture",
      key: "arch:server",
      content: "Beta project uses PaperMC Java Minecraft server",
    });

    // When querying inside Project Alpha:
    const alphaResults = await searchMemories({
      userId,
      projectId: "prj_alpha",
      query: "What database are we using for this project?",
    });

    expect(alphaResults.some((m) => m.content.includes("PostgreSQL"))).toBe(true);
    expect(alphaResults.some((m) => m.content.includes("Minecraft"))).toBe(false);

    // When querying inside Project Beta:
    const betaResults = await searchMemories({
      userId,
      projectId: "prj_beta",
      query: "What server are we using?",
    });

    expect(betaResults.some((m) => m.content.includes("Minecraft"))).toBe(true);
    expect(betaResults.some((m) => m.content.includes("PostgreSQL"))).toBe(false);
  });

  // 3. Cross-Chat Retrieval in the same Project
  it("retrieves project memory across different conversations within the same project", async () => {
    const userId = "user_lead";
    const projectId = "prj_ecommerce";

    // Saved in Conversation 1:
    await createMemory({
      userId,
      projectId,
      conversationId: "conv_1",
      scope: "project",
      category: "architecture",
      key: "arch:payments",
      content: "Stripe is configured as the exclusive payment gateway",
      importance: 0.9,
    });

    // Retrieved later in Conversation 2:
    const results = await searchMemories({
      userId,
      projectId,
      query: "How are we processing customer payments?",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("Stripe");
  });

  // 4. Memory Conflict Resolution (Old marked as SUPERSEDED)
  it("marks superseded memories when a fact is updated and excludes them from active retrieval", async () => {
    const userId = "user_cto";
    const projectId = "prj_modernize";

    // Old memory: React 18
    const oldMem = await createMemory({
      userId,
      projectId,
      scope: "project",
      key: "arch:ui_framework",
      content: "Project uses React 18 with Pages router",
      importance: 0.7,
      status: "current",
    });

    // Update occurs: React 19 App router
    await markMemorySuperseded(oldMem.id, userId);

    const newMem = await createMemory({
      userId,
      projectId,
      scope: "project",
      key: "arch:ui_framework",
      content: "Project upgraded to React 19 with Next.js App Router",
      importance: 0.95,
      status: "current",
    });

    const activeList = await listMemories({ userId, projectId, status: "current" });
    expect(activeList.length).toBe(1);
    expect(activeList[0].content).toContain("React 19");

    const searchResults = await searchMemories({
      userId,
      projectId,
      query: "Which React version are we using?",
    });

    expect(searchResults.some((m) => m.id === newMem.id)).toBe(true);
    expect(searchResults.some((m) => m.id === oldMem.id)).toBe(false);
  });

  // 5. Memory Deletion / Forgetting
  it("deletes or forgets a memory completely upon request", async () => {
    const userId = "user_privacy";

    const mem = await createMemory({
      userId,
      scope: "global",
      key: "pref:diet",
      content: "User follows a keto diet",
    });

    expect((await listMemories({ userId })).length).toBe(1);

    await deleteMemory(mem.id, userId);
    expect((await listMemories({ userId })).length).toBe(0);
  });

  // 6. Deterministic Relevance Gate (Router)
  it("skips memory retrieval for trivial questions to save latency & tokens", () => {
    const trivial1 = routeMemory({ message: "hello", historyLength: 2 });
    expect(trivial1.needMemory).toBe(false);
    expect(trivial1.needSemanticSearch).toBe(false);

    const trivial2 = routeMemory({ message: "Viết hello world bằng Python", historyLength: 0 });
    expect(trivial2.needMemory).toBe(false);

    const contextual = routeMemory({ message: "Continue the architecture we discussed earlier", historyLength: 4 });
    expect(contextual.needMemory).toBe(true);
    expect(contextual.needSemanticSearch).toBe(true);

    const projectQuery = routeMemory({ message: "What database does this project use?", projectId: "prj_x", historyLength: 2 });
    expect(projectQuery.needMemory).toBe(true);
    expect(projectQuery.needProjectMemory).toBe(true);
  });

  // 7. Explicit Memory Commands
  it("parses explicit remember and forget commands with high priority", () => {
    const remember = routeMemory({ message: "Remember that I prefer TypeScript over Python", historyLength: 0 });
    expect(remember.isExplicitCommand).toBe(true);
    expect(remember.explicitAction).toBe("remember");
    expect(remember.explicitContent).toContain("TypeScript");

    const forget = routeMemory({ message: "Forget that I prefer TypeScript", historyLength: 0 });
    expect(forget.isExplicitCommand).toBe(true);
    expect(forget.explicitAction).toBe("forget");
  });

  // 8. Context Composer & Strict Token Budget
  it("keeps total context compact even for long conversations with 50+ messages", async () => {
    const userId = "user_token_test";
    const projectId = "prj_big";

    await createMemory({
      userId,
      projectId,
      scope: "project",
      key: "arch:core",
      content: "Enterprise distributed microservices with Go and gRPC",
      importance: 0.9,
    });

    // Simulate 60 historical messages
    const longHistory: GatewayMessage[] = [];
    for (let i = 1; i <= 60; i++) {
      longHistory.push({ role: i % 2 === 0 ? "assistant" : "user", content: `Turn #${i}: Details about step ${i} of the build.` });
    }

    const composed = await composeMemoryContext({
      userId,
      projectId,
      conversationId: "conv_long",
      currentMessage: "How do the gRPC services communicate?",
      history: longHistory,
      conversationSummary: "The user has built 10 microservices with Go and gRPC. Communication is load-balanced using Envoy.",
      system: {
        base: "You are DungClaude, an AI coding expert.",
      },
      maxTotalBudget: 4000,
    });

    // Context must NOT contain all 60 messages (prevents linear token explosion)
    expect(composed.messages.length).toBeLessThanOrEqual(14);
    expect(composed.messages.length).toBeGreaterThanOrEqual(4);

    // Context contains the compact summary and project memory
    expect(composed.system).toContain("gRPC");
    expect(composed.system).toContain("Summary of previous conversation turns");

    // Total estimated context should be well within token budget
    expect(composed.composition.tokenEstimate.total).toBeLessThan(3500);
  });

  // 9. Embeddings & Semantic Similarity
  it("computes accurate semantic embeddings with deterministic fallback", async () => {
    const emb1 = await getEmbedding("Next.js App Router and React Server Components");
    const emb2 = await getEmbedding("Building with React Next.js server components");
    const emb3 = await getEmbedding("Baking chocolate chip cookies in the kitchen");

    expect(emb1.length).toBe(1536);
    expect(emb2.length).toBe(1536);
    expect(emb3.length).toBe(1536);

    // Vector 1 and 2 (both about Next.js React) must have higher cosine similarity than Vector 1 and 3 (cookies)
    const sim12 = cosine(emb1, emb2);
    const sim13 = cosine(emb1, emb3);

    expect(sim12).toBeGreaterThan(sim13);
  });
});

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}
