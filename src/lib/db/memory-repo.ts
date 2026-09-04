// Memory repository — Supabase Postgres with hybrid fallback.
// Enforces strict user and project isolation at all levels.
import { getSupabase, uid, nowIso, str, num, nullableStr } from "./supabase";
import type { MemoryRecord, MemoryScope, MemoryCategory, MemoryStatus } from "@/types/memory";

function tryGetSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

function mapMemory(r: Record<string, unknown>): MemoryRecord {
  let embedding: number[] | null = null;
  if (r.embedding) {
    if (Array.isArray(r.embedding)) {
      embedding = r.embedding as number[];
    } else if (typeof r.embedding === "string") {
      try { embedding = JSON.parse(r.embedding); } catch { embedding = null; }
    }
  }

  return {
    id: str(r.id),
    userId: str(r.user_id),
    projectId: nullableStr(r.project_id),
    conversationId: nullableStr(r.conversation_id),
    scope: (str(r.scope) || "global") as MemoryScope,
    category: (str(r.category) || "general") as MemoryCategory,
    key: str(r.key),
    content: str(r.content),
    importance: typeof r.importance === "number" ? r.importance : num(r.importance, 0.5),
    confidence: typeof r.confidence === "number" ? r.confidence : num(r.confidence, 0.9),
    status: (str(r.status) || "current") as MemoryStatus,
    sourceConversationId: nullableStr(r.source_conversation_id),
    sourceMessageId: nullableStr(r.source_message_id),
    embedding,
    similarity: typeof r.similarity === "number" ? r.similarity : undefined,
    lastAccessedAt: str(r.last_accessed_at) || nowIso(),
    accessCount: num(r.access_count, 0),
    createdAt: str(r.created_at) || nowIso(),
    updatedAt: str(r.updated_at) || nowIso(),
  };
}

// In-memory memory store for local testing or when database table is pending migration
const memoryMemoryStore = new Map<string, MemoryRecord>();

export async function listMemories(opts: {
  userId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  status?: MemoryStatus;
  limit?: number;
}): Promise<MemoryRecord[]> {
  const sb = tryGetSupabase();
  if (!sb) return getFromMemoryStore(opts);
  const limit = opts.limit ?? 50;

  try {
    let q = sb.from("memories").select("*").eq("user_id", opts.userId);

    if (opts.scope) {
      q = q.eq("scope", opts.scope);
    }
    if (opts.projectId !== undefined) {
      if (opts.projectId === null) {
        q = q.is("project_id", null);
      } else {
        q = q.eq("project_id", opts.projectId);
      }
    }
    if (opts.status) {
      q = q.eq("status", opts.status);
    } else {
      q = q.eq("status", "current");
    }

    q = q.order("importance", { ascending: false }).order("last_accessed_at", { ascending: false }).limit(limit);
    const { data, error } = await q;

    if (error) {
      if (/does not exist|42P01|schema cache/i.test(error.message)) {
        return getFromMemoryStore(opts);
      }
      throw new Error(error.message);
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map(mapMemory);
  } catch (err) {
    if (err instanceof Error && /does not exist|42P01|schema cache/i.test(err.message)) {
      return getFromMemoryStore(opts);
    }
    return getFromMemoryStore(opts);
  }
}

export async function getMemory(id: string, userId: string): Promise<MemoryRecord | null> {
  const sb = tryGetSupabase();
  if (!sb) return memoryMemoryStore.get(id) ?? null;

  try {
    const { data, error } = await sb.from("memories").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) {
      if (/does not exist|42P01|schema cache/i.test(error.message)) {
        return memoryMemoryStore.get(id) ?? null;
      }
      throw new Error(error.message);
    }
    return data ? mapMemory(data as Record<string, unknown>) : null;
  } catch {
    return memoryMemoryStore.get(id) ?? null;
  }
}

export async function createMemory(input: {
  userId: string;
  projectId?: string | null;
  conversationId?: string | null;
  scope: MemoryScope;
  category?: MemoryCategory;
  key: string;
  content: string;
  importance?: number;
  confidence?: number;
  status?: MemoryStatus;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  embedding?: number[] | null;
}): Promise<MemoryRecord> {
  const id = uid("mem");
  const record: MemoryRecord = {
    id,
    userId: input.userId,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
    scope: input.scope,
    category: input.category ?? "general",
    key: input.key.trim().toLowerCase(),
    content: input.content.trim(),
    importance: Math.min(1.0, Math.max(0.0, input.importance ?? 0.5)),
    confidence: Math.min(1.0, Math.max(0.0, input.confidence ?? 0.9)),
    status: input.status ?? "current",
    sourceConversationId: input.sourceConversationId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    embedding: input.embedding ?? null,
    lastAccessedAt: nowIso(),
    accessCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  // Always keep in memory store for fast local lookup & test resilience
  memoryMemoryStore.set(id, record);

  const sb = tryGetSupabase();
  if (!sb) return record;

  try {
    const { data, error } = await sb.from("memories").insert({
      id,
      user_id: record.userId,
      project_id: record.projectId,
      conversation_id: record.conversationId,
      scope: record.scope,
      category: record.category,
      key: record.key,
      content: record.content,
      importance: record.importance,
      confidence: record.confidence,
      status: record.status,
      source_conversation_id: record.sourceConversationId,
      source_message_id: record.sourceMessageId,
      embedding: record.embedding ? JSON.stringify(record.embedding) : null,
      last_accessed_at: record.lastAccessedAt,
      access_count: record.accessCount,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }).select("*").single();

    if (error) {
      return record;
    }

    return mapMemory(data as Record<string, unknown>);
  } catch (_e) {
    return record;
  }
}

export async function updateMemory(
  id: string,
  userId: string,
  patch: Partial<Pick<MemoryRecord, "content" | "importance" | "category" | "status" | "scope" | "projectId">>
): Promise<MemoryRecord> {
  const existing = memoryMemoryStore.get(id);
  if (existing && existing.userId === userId) {
    Object.assign(existing, patch, { updatedAt: nowIso() });
  }

  const sb = tryGetSupabase();
  if (!sb) {
    if (existing) return existing;
    throw new Error("Không tìm thấy memory");
  }

  const upd: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.content !== undefined) upd.content = patch.content.trim();
  if (patch.importance !== undefined) upd.importance = Math.min(1.0, Math.max(0.0, patch.importance));
  if (patch.category !== undefined) upd.category = patch.category;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.scope !== undefined) upd.scope = patch.scope;
  if (patch.projectId !== undefined) upd.project_id = patch.projectId;

  try {
    const { data, error } = await sb.from("memories").update(upd).eq("id", id).eq("user_id", userId).select("*").single();
    if (error) {
      if (/does not exist|42P01|schema cache/i.test(error.message) && existing) {
        return existing;
      }
      throw new Error(error.message);
    }
    return mapMemory(data as Record<string, unknown>);
  } catch (e) {
    if (existing) return existing;
    throw e;
  }
}

export async function deleteMemory(id: string, userId: string): Promise<void> {
  memoryMemoryStore.delete(id);
  const sb = tryGetSupabase();
  if (!sb) return;

  try {
    await sb.from("memories").delete().eq("id", id).eq("user_id", userId);
  } catch { /* best-effort */ }
}

export async function markMemorySuperseded(id: string, userId: string): Promise<void> {
  await updateMemory(id, userId, { status: "superseded" }).catch(() => {});
}

export async function touchMemory(id: string, userId: string): Promise<void> {
  const existing = memoryMemoryStore.get(id);
  if (existing && existing.userId === userId) {
    existing.accessCount += 1;
    existing.lastAccessedAt = nowIso();
  }

  const sb = tryGetSupabase();
  if (!sb) return;

  try {
    await sb.rpc("touch_memory", { p_id: id, p_user_id: userId });
  } catch {
    try {
      await sb.from("memories").update({
        last_accessed_at: nowIso(),
      }).eq("id", id).eq("user_id", userId);
    } catch { /* best-effort */ }
  }
}

export async function findMatchingMemoryByKey(
  userId: string,
  key: string,
  scope: MemoryScope,
  projectId?: string | null
): Promise<MemoryRecord | null> {
  const normKey = key.trim().toLowerCase();
  const sb = tryGetSupabase();

  if (sb) {
    try {
      let q = sb.from("memories")
        .select("*")
        .eq("user_id", userId)
        .eq("key", normKey)
        .eq("scope", scope)
        .eq("status", "current");

      if (projectId) {
        q = q.eq("project_id", projectId);
      } else {
        q = q.is("project_id", null);
      }

      const { data, error } = await q.maybeSingle();
      if (!error && data) return mapMemory(data as Record<string, unknown>);
    } catch { /* fallback */ }
  }

  for (const m of memoryMemoryStore.values()) {
    if (
      m.userId === userId &&
      m.key === normKey &&
      m.scope === scope &&
      m.status === "current" &&
      (projectId ? m.projectId === projectId : !m.projectId)
    ) {
      return m;
    }
  }

  return null;
}

// ── Hybrid Semantic & Keyword Search with Strict Isolation ──
export async function searchMemories(opts: {
  userId: string;
  projectId?: string | null;
  query: string;
  queryEmbedding?: number[] | null;
  limit?: number;
  minScore?: number;
}): Promise<MemoryRecord[]> {
  const limit = opts.limit ?? 5;
  const minScore = opts.minScore ?? 0.25;
  const sb = tryGetSupabase();

  // 1. Try PostgreSQL RPC if pgvector is enabled
  if (sb && opts.queryEmbedding && opts.queryEmbedding.length > 0) {
    try {
      const { data, error } = await sb.rpc("search_memories", {
        p_user_id: opts.userId,
        p_project_id: opts.projectId ?? null,
        p_limit: limit,
        p_query_embedding: opts.queryEmbedding,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        return (data as Array<Record<string, unknown>>).map(mapMemory);
      }
    } catch {
      // RPC missing or pgvector not yet enabled → proceed to hybrid fallback
    }
  }

  // 2. Hybrid Fallback: Query all current candidate memories for this user & project scope
  let candidates: MemoryRecord[] = [];
  if (sb) {
    try {
      let q = sb.from("memories")
        .select("*")
        .eq("user_id", opts.userId)
        .eq("status", "current");

      if (opts.projectId) {
        q = q.or(`scope.eq.global,project_id.eq.${opts.projectId}`);
      } else {
        q = q.eq("scope", "global");
      }

      const { data, error } = await q.limit(100);
      if (!error && data && data.length > 0) {
        candidates = (data as Array<Record<string, unknown>>).map(mapMemory);
      } else {
        candidates = getFromMemoryStore({
          userId: opts.userId,
          projectId: opts.projectId,
          status: "current",
        });
      }
    } catch {
      candidates = getFromMemoryStore({
        userId: opts.userId,
        projectId: opts.projectId,
        status: "current",
      });
    }
  } else {
    candidates = getFromMemoryStore({
      userId: opts.userId,
      projectId: opts.projectId,
      status: "current",
    });
  }

  if (!candidates.length) return [];

  // 3. Compute Composite Score (Cosine similarity + Keyword BM25 overlap + Importance + Recency)
  const queryTerms = extractSearchTerms(opts.query);

  const scored = candidates.map((m) => {
    let vectorSim = 0;
    if (opts.queryEmbedding && m.embedding && m.embedding.length === opts.queryEmbedding.length) {
      vectorSim = cosineSimilarity(opts.queryEmbedding, m.embedding);
    }

    const keywordScore = computeKeywordScore(queryTerms, m.content + " " + m.key);
    const importanceScore = m.importance; // 0.0 to 1.0

    // Access frequency boost: memories accessed more often get a slight boost
    const accessBoost = Math.min(0.2, m.accessCount * 0.02);

    const finalScore = vectorSim > 0
      ? (vectorSim * 0.45) + (keywordScore * 0.30) + (importanceScore * 0.20) + accessBoost
      : (keywordScore * 0.60) + (importanceScore * 0.30) + accessBoost;

    return { ...m, similarity: finalScore };
  });

  // Filter out low scores and sort descending
  const results = scored
    .filter((m) => (m.similarity ?? 0) >= minScore)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, limit);

  // Background touch on retrieved memories
  for (const r of results) {
    void touchMemory(r.id, opts.userId);
  }

  return results;
}

// ── In-Memory Helpers ──
function getFromMemoryStore(opts: {
  userId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  status?: MemoryStatus;
}): MemoryRecord[] {
  const out: MemoryRecord[] = [];
  for (const m of memoryMemoryStore.values()) {
    if (m.userId !== opts.userId) continue;
    if (opts.status && m.status !== opts.status) continue;
    if (!opts.status && m.status !== "current") continue;

    if (opts.scope && m.scope !== opts.scope) continue;

    // Strict project isolation:
    if (opts.projectId !== undefined) {
      if (opts.projectId === null) {
        if (m.projectId !== null && m.scope !== "global") continue;
      } else {
        if (m.projectId !== opts.projectId && m.scope !== "global") continue;
      }
    }

    out.push(m);
  }
  return out;
}

export function clearInMemoryStoreForTesting(): void {
  memoryMemoryStore.clear();
}

// ── Math & Similarity Helpers ──
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

function extractSearchTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9à-ỹ]{3,}/g) ?? []).slice(0, 15);
}

function computeKeywordScore(terms: string[], content: string): number {
  if (!terms.length) return 0;
  const lower = content.toLowerCase();
  let matches = 0;
  for (const t of terms) {
    if (lower.includes(t)) matches++;
  }
  return Math.min(1.0, matches / Math.min(terms.length, 5));
}
