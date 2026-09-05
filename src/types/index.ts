export type Role = "user" | "assistant" | "system" | "tool";

export interface MessagePart {
  id: string;
  type: "text" | "code" | "image" | "file" | "tool_call" | "tool_result" | "citation" | "reasoning";
  text?: string;
  language?: string;
  url?: string;
  mimeType?: string;
  fileName?: string;
  fileId?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  status?: "pending" | "running" | "success" | "error";
  source?: string;
}

export type MessageStatus = "pending" | "sending" | "streaming" | "completed" | "error" | "cancelled";

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  parts: MessagePart[];
  /** Plain-text fallback for search/export */
  content: string;
  modelId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  status?: MessageStatus;
  createdAt: string;
}

export interface ActiveGeneration {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  abortController: AbortController;
  status: "idle" | "sending" | "streaming" | "completed" | "error" | "cancelled";
  startedAt: number;
}

export interface Conversation {
  id: string;
  userId: string;
  projectId?: string | null;
  title: string;
  modelId: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastPreview?: string;
}

export interface Attachment {
  id: string;
  userId: string;
  conversationId?: string | null;
  projectId?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  kind?: "image" | "video" | "file";
  parsedText?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  createdAt: string;
  updatedAt: string;
  conversationCount?: number;
  fileCount?: number;
}

export interface AIModelCapability {
  id: string;
  label: string;
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "max";

export interface AIModel {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  capabilities: string[];
  inputPricePerM: number;
  outputPricePerM: number;
  enabled: boolean;
  requiresKey: boolean;
  description?: string;
  defaultReasoningEffort?: ReasoningEffort;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface ToolCallRecord {
  id: string;
  messageId: string;
  name: string;
  input: unknown;
  output: unknown;
  status: "pending" | "running" | "success" | "error";
  latencyMs: number;
  createdAt: string;
}

export interface UsageEvent {
  id: string;
  userId: string;
  conversationId?: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface ChatStreamEvent {
  type: "token" | "tool_call" | "tool_result" | "usage" | "done" | "error" | "status";
  delta?: string;
  tool?: { id: string; name: string; input: unknown };
  toolResult?: { id: string; output: unknown; status: string };
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  message?: string;
  status?: string;
}
