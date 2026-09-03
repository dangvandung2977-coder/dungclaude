import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isStreamingSupported,
  markStreamingUnsupported,
  isUpstreamUnsupportedError,
} from "@/lib/ai/streaming-capabilities";
import { runGateway } from "@/lib/ai/gateway";

describe("Streaming Capability & Non-streaming Architecture", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies non-streaming when model has no_stream or non_streaming capability", () => {
    expect(
      isStreamingSupported({
        modelId: "custom:ep1:model-a",
        capabilities: ["chat", "no_stream"],
      })
    ).toBe(false);

    expect(
      isStreamingSupported({
        modelId: "custom:ep1:model-b",
        capabilities: ["chat", "non_streaming"],
      })
    ).toBe(false);

    expect(
      isStreamingSupported({
        modelId: "custom:ep1:model-c",
        capabilities: ["chat", "vision"],
      })
    ).toBe(true);
  });

  it("dynamically remembers endpoints or models that fail with unsupported streaming", () => {
    const testUrl = "https://unsupported-provider.ai/v1";
    const testModel = "test-model-xyz";

    expect(
      isStreamingSupported({
        baseUrl: testUrl,
        modelId: testModel,
      })
    ).toBe(true);

    markStreamingUnsupported({
      baseUrl: testUrl,
      modelId: testModel,
    });

    expect(
      isStreamingSupported({
        baseUrl: testUrl,
        modelId: testModel,
      })
    ).toBe(false);
  });

  it("detects various upstream_unsupported error formats", () => {
    expect(isUpstreamUnsupportedError("Error: upstream_unsupported")).toBe(true);
    expect(isUpstreamUnsupportedError('{"error": "upstream_unsupported"}')).toBe(true);
    expect(isUpstreamUnsupportedError("Streaming is not supported by this endpoint")).toBe(true);
    expect(isUpstreamUnsupportedError("400: stream parameter is not supported")).toBe(true);
    expect(isUpstreamUnsupportedError("unsupported stream request")).toBe(true);
    expect(isUpstreamUnsupportedError("Normal rate limit exceeded")).toBe(false);
  });

  it("executes non-streaming request properly with stream: false and returns complete response", async () => {
    // Mock fetch to verify body has stream: false and does not contain stream_options
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const parsedBody = JSON.parse((init?.body as string) || "{}");
      expect(parsedBody.stream).toBe(false);
      expect(parsedBody.stream_options).toBeUndefined();

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Complete non-streaming answer from upstream.",
              },
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 30,
            total_tokens: 45,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    let streamedTokens = "";
    const res = await runGateway({
      modelId: "demo:lumen-echo", // or custom with non-streaming
      messages: [{ role: "user", content: "Test non-streaming" }],
      supportsStreaming: false,
      cb: {
        onToken: (t) => {
          streamedTokens += t;
        },
      },
    });

    expect(fetchSpy).toBeDefined();
    expect(streamedTokens.length).toBeGreaterThan(0);
    expect(res.text).toBeDefined();
    expect(res.inputTokens).toBeGreaterThan(0);
    expect(res.outputTokens).toBeGreaterThan(0);
  });
});
