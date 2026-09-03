// Repository layer — Supabase Postgres. Mọi hàm đều async.
// Call sites không cần biết driver; muốn đổi DB chỉ sửa file này.
import { getSupabase, uid, nowIso, type Row, str, num, bool, nullableStr } from "./supabase";
import type { Conversation, Message, MessagePart, Project, UsageEvent, Attachment } from "@/types";

function dbError(e: unknown, fallback: string): Error {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : fallback;
  return new Error(msg || fallback);
}

// In-memory TTL caches (10s TTL) to make client navigation instant (0ms)
const conversationsCache = new Map<string, { data: Conversation[]; expiry: number }>();
const messagesCache = new Map<string, { data: Message[]; expiry: number }>();
const projectsCache = new Map<string, { data: Project[]; expiry: number }>();

export function invalidateConversationsCache(userId?: string): void {
  if (userId) conversationsCache.delete(userId);
  else conversationsCache.clear();
}

export function invalidateMessagesCache(conversationId: string): void {
  messagesCache.delete(conversationId);
}

export function invalidateProjectsCache(userId?: string): void {
  if (userId) projectsCache.delete(userId);
  else projectsCache.clear();
}

// ── Conversations ──
export async function listConversations(userId: string, includeArchived = false): Promise<Conversation[]> {
  if (!includeArchived) {
    const cached = conversationsCache.get(userId);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
  }

  const sb = getSupabase();
  let q = sb.from("conversations").select("*, messages(id)").eq("user_id", userId)
    .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(50);
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw dbError(error, "Không tải được conversations");
  
  // Chỉ lấy những cuộc hội thoại đã có tin nhắn thực tế
  const result = ((data ?? []) as Row[])
    .filter((r) => Array.isArray(r.messages) && r.messages.length > 0)
    .map(mapConversation);

  if (!includeArchived) {
    conversationsCache.set(userId, { data: result, expiry: Date.now() + 10_000 });
  }
  return result;
}

export async function listConversationsByProject(projectId: string, userId: string): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
  const { data, error } = await getSupabase().from("conversations")
    .select("id,title,updated_at").eq("project_id", projectId).eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw dbError(error, "Không tải được chats");
  return ((data ?? []) as Row[]).map((r) => ({ id: str(r.id), title: str(r.title), updatedAt: str(r.updated_at) }));
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  // Check if conversation already exists in user's cached conversations
  const cachedUser = conversationsCache.get(userId);
  if (cachedUser && Date.now() < cachedUser.expiry) {
    const found = cachedUser.data.find((c) => c.id === id);
    if (found) return found;
  }

  const { data, error } = await getSupabase().from("conversations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error, "Không tải được conversation");
  return data ? mapConversation(data as Row) : null;
}

export async function createConversation(userId: string, data: Partial<Conversation> & { title?: string; modelId?: string; projectId?: string | null }): Promise<Conversation> {
  invalidateConversationsCache(userId);
  const id = uid("conv");
  const { data: row, error } = await getSupabase().from("conversations").insert({
    id, user_id: userId, project_id: data.projectId ?? null,
    title: data.title ?? "Cuộc trò chuyện mới", model_id: data.modelId ?? "demo:lumen-echo",
    pinned: data.pinned ?? false, archived: false,
  }).select("*").single();
  if (error) throw dbError(error, "Không tạo được conversation");
  invalidateConversationsCache(userId);
  return mapConversation(row as Row);
}

export async function updateConversation(id: string, userId: string, patch: Partial<Pick<Conversation, "title" | "pinned" | "archived" | "modelId" | "projectId">>): Promise<void> {
  invalidateConversationsCache(userId);
  const upd: Row = { updated_at: nowIso() };
  if (patch.title !== undefined) upd.title = patch.title.slice(0, 200);
  if (patch.pinned !== undefined) upd.pinned = patch.pinned;
  if (patch.archived !== undefined) upd.archived = patch.archived;
  if (patch.modelId !== undefined) upd.model_id = patch.modelId;
  if (patch.projectId !== undefined) upd.project_id = patch.projectId;
  const { error } = await getSupabase().from("conversations").update(upd).eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "Không cập nhật được conversation");
  invalidateConversationsCache(userId);
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  invalidateConversationsCache(userId);
  invalidateMessagesCache(id);
  const { error } = await getSupabase().from("conversations").delete().eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "Không xóa được conversation");
  invalidateConversationsCache(userId);
}

export async function touchConversation(id: string): Promise<void> {
  await getSupabase().from("conversations").update({ updated_at: nowIso() }).eq("id", id);
}

function mapConversation(r: Row): Conversation {
  return {
    id: str(r.id), userId: str(r.user_id), projectId: nullableStr(r.project_id),
    title: str(r.title, "Cuộc trò chuyện mới"), modelId: str(r.model_id, "demo:lumen-echo"),
    pinned: bool(r.pinned), archived: bool(r.archived),
    createdAt: str(r.created_at), updatedAt: str(r.updated_at),
    messageCount: num(r.message_count, 0), lastPreview: str(r.last_preview),
  };
}

// ── Messages (Single-roundtrip query with message_parts) ──
export async function listMessages(conversationId: string, limit = 500): Promise<Message[]> {
  const cached = messagesCache.get(conversationId);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const sb = getSupabase();
  // Single relational query joining messages and message_parts
  const { data: msgs, error } = await sb.from("messages")
    .select("*, message_parts(*)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw dbError(error, "Không tải được messages");
  const rows = ((msgs ?? []) as Row[]);
  if (!rows.length) return [];

  const result = rows.map((r) => {
    const rawParts = Array.isArray(r.message_parts) ? (r.message_parts as Row[]) : [];
    return {
      id: str(r.id),
      conversationId: str(r.conversation_id),
      role: r.role as Message["role"],
      parts: rawParts.map(mapPart),
      content: str(r.content),
      modelId: nullableStr(r.model_id),
      inputTokens: num(r.input_tokens),
      outputTokens: num(r.output_tokens),
      costUsd: num(r.cost_usd),
      createdAt: str(r.created_at),
    };
  });

  messagesCache.set(conversationId, { data: result, expiry: Date.now() + 10_000 });
  return result;
}

export async function listParts(messageId: string): Promise<MessagePart[]> {
  const { data, error } = await getSupabase().from("message_parts").select("*")
    .eq("message_id", messageId).order("created_at", { ascending: true });
  if (error) throw dbError(error, "Không tải được parts");
  return ((data ?? []) as Row[]).map(mapPart);
}

function mapPart(r: Row): MessagePart {
  return {
    id: str(r.id), type: r.type as MessagePart["type"],
    text: nullableStr(r.text) ?? undefined, language: nullableStr(r.language) ?? undefined,
    url: nullableStr(r.url) ?? undefined, mimeType: nullableStr(r.mime_type) ?? undefined,
    fileName: nullableStr(r.file_name) ?? undefined, fileId: nullableStr(r.file_id) ?? undefined,
    toolName: nullableStr(r.tool_name) ?? undefined, toolCallId: nullableStr(r.tool_call_id) ?? undefined,
    toolInput: r.tool_input ? safeJson(str(r.tool_input)) : undefined,
    toolOutput: r.tool_output ? safeJson(str(r.tool_output)) : undefined,
    status: (nullableStr(r.status) as MessagePart["status"]) ?? undefined,
    source: nullableStr(r.source) ?? undefined,
  };
}

export async function createMessage(data: {
  conversationId: string; role: Message["role"]; content: string;
  parts?: Omit<MessagePart, "id">[]; modelId?: string;
}): Promise<Message> {
  const sb = getSupabase();
  const id = uid("msg");
  const { error } = await sb.from("messages").insert({
    id, conversation_id: data.conversationId, role: data.role,
    content: data.content.slice(0, 200000), model_id: data.modelId ?? null,
  });
  if (error) throw dbError(error, "Không lưu được message");
  if (data.parts?.length) {
    const rows = data.parts.map((p) => ({
      id: uid("part"), message_id: id, type: p.type,
      text: p.text ?? null, language: p.language ?? null, url: p.url ?? null,
      mime_type: p.mimeType ?? null, file_name: p.fileName ?? null, file_id: p.fileId ?? null,
      tool_name: p.toolName ?? null, tool_call_id: p.toolCallId ?? null,
      tool_input: p.toolInput !== undefined ? JSON.stringify(p.toolInput) : null,
      tool_output: p.toolOutput !== undefined ? JSON.stringify(p.toolOutput) : null,
      status: p.status ?? null, source: p.source ?? null,
    }));
    const { error: e2 } = await sb.from("message_parts").insert(rows);
    if (e2) throw dbError(e2, "Không lưu được message parts");
  }
  await touchConversation(data.conversationId);
  invalidateMessagesCache(data.conversationId);

  const createdParts: MessagePart[] = (data.parts ?? []).map((p) => ({
    id: uid("part"),
    ...p,
  }));

  return {
    id,
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    parts: createdParts,
    modelId: data.modelId ?? null,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
}

export async function updateMessageStats(id: string, input: number, output: number, cost: number): Promise<void> {
  const { error } = await getSupabase().from("messages")
    .update({ input_tokens: input, output_tokens: output, cost_usd: cost }).eq("id", id);
  if (error) throw dbError(error, "Không cập nhật được stats");
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ── Projects ──
export async function listProjects(userId: string): Promise<Project[]> {
  const cached = projectsCache.get(userId);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const sb = getSupabase();
  const { data, error } = await sb.from("projects").select("*").eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw dbError(error, "Không tải được projects");
  const rows = ((data ?? []) as Row[]);

  // Query counts in parallel across all projects instead of sequential for-loop
  const out: Project[] = await Promise.all(rows.map(async (r) => {
    const pid = str(r.id);
    const [{ count: cc }, { count: fc }] = await Promise.all([
      sb.from("conversations").select("id", { count: "exact", head: true }).eq("project_id", pid),
      sb.from("attachments").select("id", { count: "exact", head: true }).eq("project_id", pid),
    ]);
    return {
      id: pid, userId: str(r.user_id), name: str(r.name),
      description: nullableStr(r.description), instructions: nullableStr(r.instructions),
      createdAt: str(r.created_at), updatedAt: str(r.updated_at),
      conversationCount: cc ?? 0, fileCount: fc ?? 0,
    };
  }));

  projectsCache.set(userId, { data: out, expiry: Date.now() + 15_000 });
  return out;
}

export async function getProject(id: string, userId: string): Promise<Project | null> {
  const { data, error } = await getSupabase().from("projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error, "Không tải được project");
  if (!data) return null;
  const r = data as Row;
  return {
    id: str(r.id), userId: str(r.user_id), name: str(r.name),
    description: nullableStr(r.description), instructions: nullableStr(r.instructions),
    createdAt: str(r.created_at), updatedAt: str(r.updated_at),
  };
}

export async function createProject(userId: string, name: string, description?: string, instructions?: string): Promise<Project> {
  invalidateProjectsCache(userId);
  const id = uid("prj");
  const { data, error } = await getSupabase().from("projects").insert({
    id, user_id: userId, name: name.slice(0, 120), description: description ?? null, instructions: instructions ?? null,
  }).select("*").single();
  if (error) throw dbError(error, "Không tạo được project");
  invalidateProjectsCache(userId);
  const r = data as Row;
  return {
    id, userId, name: str(r.name), description: nullableStr(r.description),
    instructions: nullableStr(r.instructions), createdAt: str(r.created_at), updatedAt: str(r.updated_at),
  };
}

export async function updateProject(id: string, userId: string, patch: Partial<Pick<Project, "name" | "description" | "instructions">>): Promise<void> {
  invalidateProjectsCache(userId);
  const upd: Row = { updated_at: nowIso() };
  if (patch.name !== undefined) upd.name = patch.name.slice(0, 120);
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.instructions !== undefined) upd.instructions = patch.instructions;
  const { error } = await getSupabase().from("projects").update(upd).eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "Không cập nhật được project");
  invalidateProjectsCache(userId);
}

export async function deleteProject(id: string, userId: string): Promise<void> {
  invalidateProjectsCache(userId);
  const sb = getSupabase();
  // Detach any conversations linked to this project so they aren't corrupted
  await sb.from("conversations").update({ project_id: null }).eq("project_id", id).eq("user_id", userId);
  const { error } = await sb.from("projects").delete().eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "Không xóa được project");
  invalidateProjectsCache(userId);
}

// ── Attachments ──
export async function createAttachment(a: Omit<Attachment, "id" | "createdAt"> & { kind?: "image" | "video" | "file" }): Promise<Attachment> {
  const id = uid("file");
  const { data, error } = await getSupabase().from("attachments").insert({
    id, user_id: a.userId, conversation_id: a.conversationId ?? null, project_id: a.projectId ?? null,
    file_name: a.fileName, mime_type: a.mimeType, size_bytes: a.sizeBytes,
    storage_path: a.storagePath, kind: a.kind ?? "file", parsed_text: a.parsedText ?? null,
  }).select("*").single();
  if (error) throw dbError(error, "Không lưu được attachment");
  return mapAttachment(data as Row);
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const { data, error } = await getSupabase().from("attachments").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error, "Không tải được attachment");
  return data ? mapAttachment(data as Row) : null;
}

export async function listAttachmentsByConversation(conversationId: string): Promise<Attachment[]> {
  const { data, error } = await getSupabase().from("attachments").select("*")
    .eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (error) throw dbError(error, "Không tải được attachments");
  return ((data ?? []) as Row[]).map(mapAttachment);
}

export async function listAttachmentsByProject(projectId: string, userId: string): Promise<Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }>> {
  const { data, error } = await getSupabase().from("attachments")
    .select("id,file_name,mime_type,size_bytes,created_at")
    .eq("project_id", projectId).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw dbError(error, "Không tải được files");
  return ((data ?? []) as Row[]).map((r) => ({
    id: str(r.id), fileName: str(r.file_name), mimeType: str(r.mime_type),
    sizeBytes: num(r.size_bytes), createdAt: str(r.created_at),
  }));
}

function mapAttachment(r: Row): Attachment {
  const kind = str(r.kind, "file");
  return {
    id: str(r.id), userId: str(r.user_id),
    conversationId: nullableStr(r.conversation_id), projectId: nullableStr(r.project_id),
    fileName: str(r.file_name), mimeType: str(r.mime_type), sizeBytes: num(r.size_bytes),
    storagePath: str(r.storage_path),
    kind: kind === "image" || kind === "video" ? kind : "file",
    parsedText: nullableStr(r.parsed_text), createdAt: str(r.created_at),
  };
}

// ── Attachments cho RAG (parsed_text theo scope) ──
export async function listParsedAttachments(scope: { conversationId?: string; projectId?: string }, limit = 50): Promise<Array<{ id: string; fileName: string; parsedText: string }>> {
  const sb = getSupabase();
  const ids: Array<{ col: string; val: string }> = [];
  if (scope.conversationId) ids.push({ col: "conversation_id", val: scope.conversationId });
  if (scope.projectId) ids.push({ col: "project_id", val: scope.projectId });
  if (!ids.length) return [];
  // OR theo scope
  const orFilter = ids.map((x) => `${x.col}.eq.${x.val}`).join(",");
  const { data, error } = await sb.from("attachments").select("id,file_name,parsed_text")
    .or(orFilter).not("parsed_text", "is", null).limit(limit);
  if (error) throw dbError(error, "Không tải được attachments");
  return ((data ?? []) as Row[])
    .filter((r) => nullableStr(r.parsed_text))
    .map((r) => ({ id: str(r.id), fileName: str(r.file_name), parsedText: str(r.parsed_text) }));
}

// ── Search ──
function cleanLike(q: string): string {
  return q.replace(/[%_\\,]/g, "").slice(0, 100);
}

export async function searchAll(userId: string, q: string): Promise<{ conversations: Conversation[]; messages: Message[]; projects: Project[] }> {
  const sb = getSupabase();
  const like = `%${cleanLike(q)}%`;
  const [{ data: convs }, { data: prjs }] = await Promise.all([
    sb.from("conversations").select("*").eq("user_id", userId).ilike("title", like).order("updated_at", { ascending: false }).limit(20),
    sb.from("projects").select("*").eq("user_id", userId).or(`name.ilike.${like},description.ilike.${like}`).limit(10),
  ]);
  const convRows = ((convs ?? []) as Row[]);
  // Tìm messages trong MỌI conversation của user
  const { data: allConvs } = await sb.from("conversations").select("id").eq("user_id", userId).limit(500);
  const allIds = ((allConvs ?? []) as Row[]).map((c) => str(c.id));
  let msgs: Message[] = [];
  if (allIds.length) {
    const { data: m } = await sb.from("messages").select("*").in("conversation_id", allIds)
      .ilike("content", like).order("created_at", { ascending: false }).limit(30);
    msgs = ((m ?? []) as Row[]).map((r) => ({
      id: str(r.id), conversationId: str(r.conversation_id), role: r.role as Message["role"],
      parts: [], content: str(r.content).slice(0, 300), modelId: nullableStr(r.model_id), createdAt: str(r.created_at),
    }));
  }
  return {
    conversations: convRows.map(mapConversation),
    messages: msgs,
    projects: ((prjs ?? []) as Row[]).map((r) => ({
      id: str(r.id), userId: str(r.user_id), name: str(r.name),
      description: nullableStr(r.description), instructions: nullableStr(r.instructions),
      createdAt: str(r.created_at), updatedAt: str(r.updated_at),
    })),
  };
}

// ── Usage ──
export async function recordUsage(e: Omit<UsageEvent, "id" | "createdAt"> & { functionKey?: string }): Promise<void> {
  const { error } = await getSupabase().from("usage_events").insert({
    id: uid("use"), user_id: e.userId, conversation_id: e.conversationId ?? null,
    model: e.model, provider: e.provider, function_key: e.functionKey ?? "chat_default",
    input_tokens: e.inputTokens, output_tokens: e.outputTokens, total_tokens: e.totalTokens,
    cost_usd: e.costUsd, duration_ms: e.durationMs ?? 0,
  });
  if (error) throw dbError(error, "Không ghi được usage");
}

export async function usageSummary(userId: string): Promise<{ totalTokens: number; totalCost: number; requests: number; byModel: Array<{ model: string; tokens: number; cost: number; requests: number }> }> {
  const { data, error } = await getSupabase().from("usage_events")
    .select("model,total_tokens,cost_usd").eq("user_id", userId).limit(5000);
  if (error) throw dbError(error, "Không tải được usage");
  const by = new Map<string, { tokens: number; cost: number; requests: number }>();
  for (const r of ((data ?? []) as Row[])) {
    const m = str(r.model);
    const cur = by.get(m) ?? { tokens: 0, cost: 0, requests: 0 };
    cur.tokens += num(r.total_tokens); cur.cost += num(r.cost_usd); cur.requests += 1;
    by.set(m, cur);
  }
  const byModel = [...by.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens);
  return {
    totalTokens: byModel.reduce((a, r) => a + r.tokens, 0),
    totalCost: byModel.reduce((a, r) => a + r.cost, 0),
    requests: byModel.reduce((a, r) => a + r.requests, 0),
    byModel,
  };
}

export async function globalUsageSummary(): Promise<{ totalTokens: number; totalCost: number; requests: number; users: number }> {
  const sb = getSupabase();
  const [{ data: u }, { count: users }] = await Promise.all([
    sb.from("usage_events").select("total_tokens,cost_usd").limit(20000),
    sb.from("users").select("id", { count: "exact", head: true }),
  ]);
  const rows = ((u ?? []) as Row[]);
  return {
    totalTokens: rows.reduce((a, r) => a + num(r.total_tokens), 0),
    totalCost: rows.reduce((a, r) => a + num(r.cost_usd), 0),
    requests: rows.length,
    users: users ?? 0,
  };
}
