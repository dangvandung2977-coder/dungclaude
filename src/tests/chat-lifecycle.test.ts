import { describe, it, expect } from "vitest";
import type { Message, MessageStatus } from "@/types";

describe("chat lifecycle & state machine", () => {
  it("supports full explicit message status transitions", () => {
    const statuses: MessageStatus[] = [
      "pending",
      "sending",
      "streaming",
      "completed",
      "error",
      "cancelled",
    ];
    expect(statuses).toHaveLength(6);

    const userMsg: Message = {
      id: "tmp_user_1",
      conversationId: "conv_test",
      role: "user",
      content: "Explain quantum computing",
      status: "completed",
      parts: [{ id: "p1", type: "text", text: "Explain quantum computing" }],
      createdAt: new Date().toISOString(),
    };

    const asstMsg: Message = {
      id: "tmp_asst_1",
      conversationId: "conv_test",
      role: "assistant",
      content: "",
      status: "streaming",
      parts: [{ id: "p2", type: "text", text: "" }],
      createdAt: new Date().toISOString(),
    };

    expect(userMsg.status).toBe("completed");
    expect(asstMsg.status).toBe("streaming");

    // Transition to completed
    const completedAsst: Message = {
      ...asstMsg,
      id: "msg_persistent_999",
      content: "Quantum computing uses qubits...",
      status: "completed",
    };
    expect(completedAsst.status).toBe("completed");
    expect(completedAsst.id).toBe("msg_persistent_999");
  });

  it("handles retry without duplicating preceding user message", () => {
    const messages: Message[] = [
      {
        id: "msg_user_1",
        conversationId: "conv_test",
        role: "user",
        content: "What is React?",
        status: "completed",
        parts: [{ id: "p1", type: "text", text: "What is React?" }],
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg_asst_1",
        conversationId: "conv_test",
        role: "assistant",
        content: "React is a JS library",
        status: "error",
        parts: [{ id: "p2", type: "text", text: "React is a JS library" }],
        createdAt: new Date().toISOString(),
      },
    ];

    // Retry simulation: find assistant message, reset in-place, reuse user message
    const asstIndex = messages.findIndex((m) => m.id === "msg_asst_1");
    const precedingUser = [...messages.slice(0, asstIndex)].reverse().find((m) => m.role === "user");

    expect(precedingUser).toBeDefined();
    expect(precedingUser?.content).toBe("What is React?");

    const retriedMessages = messages.map((m) =>
      m.id === "msg_asst_1"
        ? { ...m, content: "", status: "streaming" as const }
        : m
    );

    // Verify messages count remained 2 (no duplicate user message)
    expect(retriedMessages).toHaveLength(2);
    expect(retriedMessages[0].id).toBe("msg_user_1");
    expect(retriedMessages[1].id).toBe("msg_asst_1");
    expect(retriedMessages[1].status).toBe("streaming");
  });

  it("SSE buffer parser handles partial chunks and split event frames", () => {
    // Simulates TCP fragmentation across multiple read() iterations
    const rawChunks = [
      'event: conversation\ndata: {"conversationId":"conv_123"}\n\n',
      'event: token\ndata: {"delta":"Hello"}\n\n',
      'event: token\nda',
      'ta: {"delta":" world"}\n\n',
      'event: done\ndata: {"messageId":"msg_done"}\n\n',
    ];

    let buf = "";
    const parsedEvents: Array<{ type: string; data: Record<string, unknown> }> = [];

    for (const chunk of rawChunks) {
      buf += chunk;
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";

      for (const frame of frames) {
        const lines = frame.split("\n");
        let type = "";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) type = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (type && dataStr) {
          parsedEvents.push({ type, data: JSON.parse(dataStr) });
        }
      }
    }

    expect(parsedEvents).toHaveLength(4);
    expect(parsedEvents[0]).toEqual({ type: "conversation", data: { conversationId: "conv_123" } });
    expect(parsedEvents[1]).toEqual({ type: "token", data: { delta: "Hello" } });
    expect(parsedEvents[2]).toEqual({ type: "token", data: { delta: " world" } });
    expect(parsedEvents[3]).toEqual({ type: "done", data: { messageId: "msg_done" } });
    expect(buf).toBe(""); // All frames processed cleanly
  });

  it("handles cancelled generation cleanly", () => {
    const asstMsg: Message = {
      id: "tmp_asst_2",
      conversationId: "conv_test",
      role: "assistant",
      content: "Partial content before user click",
      status: "streaming",
      parts: [],
      createdAt: new Date().toISOString(),
    };

    // User triggers stop
    const cancelledMsg: Message = {
      ...asstMsg,
      status: "cancelled",
    };

    expect(cancelledMsg.status).toBe("cancelled");
    expect(cancelledMsg.content).toBe("Partial content before user click");
  });

  it("updates conversation title optimistically and handles custom rename events", () => {
    const initialConversations = [
      { id: "conv_1", title: "Cuộc trò chuyện cũ", pinned: false, archived: false },
      { id: "conv_2", title: "Hội thoại khác", pinned: false, archived: false },
    ];

    const newTitle = "Tên đoạn chat mới đã đổi";
    const targetId = "conv_1";

    // Optimistic mapper as used in AppShell and Sidebar
    const updated = initialConversations.map((c) =>
      c.id === targetId ? { ...c, title: newTitle } : c
    );

    expect(updated[0].title).toBe(newTitle);
    expect(updated[1].title).toBe("Hội thoại khác");
    expect(updated[0].id).toBe("conv_1");
  });

  it("resolves last used model correctly per conversation", () => {
    const messages: Message[] = [
      {
        id: "msg_1",
        conversationId: "conv_1",
        role: "user",
        content: "Hi",
        status: "completed",
        parts: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg_2",
        conversationId: "conv_1",
        role: "assistant",
        content: "Hello",
        modelId: "anthropic:claude-3-7-sonnet",
        status: "completed",
        parts: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg_3",
        conversationId: "conv_1",
        role: "assistant",
        content: "Latest reply",
        modelId: "openai:gpt-4o",
        status: "completed",
        parts: [],
        createdAt: new Date().toISOString(),
      },
    ];

    const lastUsedModel = [...messages].reverse().find((m) => m.modelId)?.modelId;
    expect(lastUsedModel).toBe("openai:gpt-4o");
  });
});
