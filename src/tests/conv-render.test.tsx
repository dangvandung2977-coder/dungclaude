import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ChatView } from "@/components/chat/ChatView";
import type { Message } from "@/types";

// Mock Next.js navigation and auth hooks
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/c/conv_test",
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    user: { id: "user_test", email: "test@example.com", name: "Test User", role: "user" },
    loading: false,
    refresh: vi.fn(),
  }),
}));

describe("ChatView rendering with image parts", () => {
  it("renders messages without throwing client exception", () => {
    const testMessages: Message[] = [
      {
        id: "msg_1",
        conversationId: "conv_test",
        role: "user",
        content: "how many animal in this",
        parts: [
          {
            id: "part_1",
            type: "text",
            text: "how many animal in this",
          },
          {
            id: "part_2",
            type: "image",
            url: "/api/files/file_mtly25hx13zbipau",
            mimeType: "image/png",
            fileName: "image.png",
            fileId: "file_mtly25hx13zbipau",
          },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: "msg_2",
        conversationId: "conv_test",
        role: "assistant",
        content: "There are **3** animals in the image.",
        parts: [
          {
            id: "part_3",
            type: "text",
            text: "There are **3** animals in the image.",
          },
        ],
        createdAt: new Date().toISOString(),
      },
    ];

    expect(() => {
      renderToString(
        <ChatView
          conversationId="conv_test"
          initialMessages={testMessages}
          models={[{ id: "auto", name: "Auto", provider: "google", enabled: true, contextWindow: 128000, capabilities: ["chat"], inputPricePerM: 0, outputPricePerM: 0, requiresKey: false }]}
        />
      );
    }).not.toThrow();
  });
});
