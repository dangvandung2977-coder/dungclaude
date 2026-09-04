import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerActiveTask,
  getActiveTask,
  appendTaskToken,
  completeActiveTask,
  failActiveTask,
  abortActiveTask,
} from "@/lib/ai/active-tasks";

describe("ActiveChatTasks background registry", () => {
  const convId = "conv_test_active_123";
  const userId = "user_456";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("registers and retrieves an active task correctly", () => {
    const task = registerActiveTask(convId, userId, "gemini:gemini-2.5-flash");
    expect(task.conversationId).toBe(convId);
    expect(task.userId).toBe(userId);
    expect(task.status).toBe("streaming");
    expect(task.text).toBe("");

    const fetched = getActiveTask(convId);
    expect(fetched).toBeDefined();
    expect(fetched?.conversationId).toBe(convId);
  });

  it("accumulates streamed tokens independently of client connections", () => {
    registerActiveTask(convId, userId);
    appendTaskToken(convId, "Xin ");
    appendTaskToken(convId, "chào ");
    appendTaskToken(convId, "bạn!");

    const task = getActiveTask(convId);
    expect(task?.text).toBe("Xin chào bạn!");
  });

  it("marks completed and stores final message metadata", () => {
    registerActiveTask(convId, userId);
    appendTaskToken(convId, "Câu trả lời hoàn tất");
    completeActiveTask(convId, "msg_final_789", 1250);

    const task = getActiveTask(convId);
    expect(task?.status).toBe("completed");
    expect(task?.messageId).toBe("msg_final_789");
    expect(task?.latencyMs).toBe(1250);
  });

  it("supports explicit user cancellation via abortActiveTask", () => {
    const task = registerActiveTask(convId, userId);
    const aborted = abortActiveTask(convId, userId);
    expect(aborted).toBe(true);
    expect(task.status).toBe("cancelled");
    expect(task.abortController.signal.aborted).toBe(true);
  });

  it("prevents unauthorized user from aborting another user's task", () => {
    registerActiveTask(convId, userId);
    const aborted = abortActiveTask(convId, "attacker_user_999");
    expect(aborted).toBe(false);
    expect(getActiveTask(convId)?.status).toBe("streaming");
  });

  it("handles failure status cleanly", () => {
    registerActiveTask(convId, userId);
    failActiveTask(convId, "Rate limit exceeded upstream");

    const task = getActiveTask(convId);
    expect(task?.status).toBe("error");
    expect(task?.error).toBe("Rate limit exceeded upstream");
  });
});
