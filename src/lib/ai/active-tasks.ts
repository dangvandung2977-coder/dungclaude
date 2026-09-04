import { EventEmitter } from "events";

export interface ActiveChatTask {
  conversationId: string;
  userId: string;
  startedAt: number;
  text: string;
  status: "streaming" | "completed" | "error" | "cancelled";
  error?: string;
  messageId?: string;
  modelId?: string;
  latencyMs?: number;
  abortController: AbortController;
  emitter: EventEmitter;
}

// Attach to globalThis to preserve active generations across development reloads or module boundaries
const g = globalThis as unknown as {
  __activeChatTasks?: Map<string, ActiveChatTask>;
};

if (!g.__activeChatTasks) {
  g.__activeChatTasks = new Map<string, ActiveChatTask>();
}

const activeTasks = g.__activeChatTasks;

export function registerActiveTask(
  conversationId: string,
  userId: string,
  modelId?: string
): ActiveChatTask {
  // If an old task exists for this conversation, abort it cleanly first
  const existing = activeTasks.get(conversationId);
  if (existing && existing.status === "streaming") {
    try {
      existing.abortController.abort();
    } catch {
      // ignore
    }
  }

  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  // Default error handler so Node EventEmitter doesn't throw when no listener is attached
  emitter.on("error", () => {});

  const task: ActiveChatTask = {
    conversationId,
    userId,
    startedAt: Date.now(),
    text: "",
    status: "streaming",
    modelId,
    abortController: new AbortController(),
    emitter,
  };

  activeTasks.set(conversationId, task);
  return task;
}

export function getActiveTask(conversationId: string): ActiveChatTask | undefined {
  return activeTasks.get(conversationId);
}

export function appendTaskToken(conversationId: string, delta: string): void {
  const task = activeTasks.get(conversationId);
  if (task && task.status === "streaming") {
    task.text += delta;
    task.emitter.emit("token", delta);
  }
}

export function completeActiveTask(
  conversationId: string,
  messageId?: string,
  latencyMs?: number
): void {
  const task = activeTasks.get(conversationId);
  if (task) {
    task.status = "completed";
    if (messageId) task.messageId = messageId;
    if (latencyMs) task.latencyMs = latencyMs;
    task.emitter.emit("done", { messageId, latencyMs, text: task.text });

    // Retain completed state for 3 minutes so disconnected clients can fetch it, then cleanup
    setTimeout(() => {
      const current = activeTasks.get(conversationId);
      if (current && current.status === "completed") {
        activeTasks.delete(conversationId);
      }
    }, 180_000);
  }
}

export function failActiveTask(conversationId: string, error: string): void {
  const task = activeTasks.get(conversationId);
  if (task) {
    task.status = "error";
    task.error = error;
    task.emitter.emit("error", { error });
    setTimeout(() => {
      const current = activeTasks.get(conversationId);
      if (current && current.status === "error") {
        activeTasks.delete(conversationId);
      }
    }, 60_000);
  }
}

export function abortActiveTask(conversationId: string, userId: string): boolean {
  const task = activeTasks.get(conversationId);
  if (!task || task.userId !== userId) return false;

  task.status = "cancelled";
  task.emitter.emit("cancelled", { text: task.text });
  try {
    task.abortController.abort();
  } catch {
    // ignore
  }

  setTimeout(() => {
    activeTasks.delete(conversationId);
  }, 10_000);

  return true;
}
