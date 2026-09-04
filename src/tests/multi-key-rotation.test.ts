import { describe, it, expect, vi } from "vitest";
import { parseKeyList, formatKeyHint } from "@/lib/ai/providers-config";
import { formatFriendlyGatewayError, isKeyRetryableError } from "@/lib/ai/gateway";

describe("Multi-Key Pool & Rotation Unit Tests", () => {
  it("parseKeyList handles various input formats correctly", () => {
    // Single key
    expect(parseKeyList("sk-test-12345")).toEqual(["sk-test-12345"]);

    // Multiple keys newline-separated
    const multiline = `
      sk-key-1
      sk-key-2
      sk-key-3
    `;
    expect(parseKeyList(multiline)).toEqual(["sk-key-1", "sk-key-2", "sk-key-3"]);

    // Multiple keys comma-separated
    expect(parseKeyList("sk-key-a, sk-key-b, sk-key-c")).toEqual(["sk-key-a", "sk-key-b", "sk-key-c"]);

    // Mixed newlines and commas + duplicates + empty lines
    const mixed = "sk-dup, sk-dup\nsk-key-3\n\nsk-dup, sk-key-4";
    expect(parseKeyList(mixed)).toEqual(["sk-dup", "sk-key-3", "sk-key-4"]);

    // JSON array format
    const jsonStr = JSON.stringify(["sk-json-1", "sk-json-2"]);
    expect(parseKeyList(jsonStr)).toEqual(["sk-json-1", "sk-json-2"]);

    // Empty or null
    expect(parseKeyList("")).toEqual([]);
    expect(parseKeyList(null)).toEqual([]);
    expect(parseKeyList(undefined)).toEqual([]);
  });

  it("formatKeyHint generates concise masked hints", () => {
    expect(formatKeyHint([])).toBeNull();
    expect(formatKeyHint(["sk-1234567890abcdef"])).toMatch(/•/);
    
    const multi = ["sk-key11111111111111", "sk-key22222222222222", "sk-key33333333333333"];
    const hint = formatKeyHint(multi);
    expect(hint).toContain("(+2 keys)");
  });

  it("failover simulation: rotates from exhausted key to working key", async () => {
    const keyPool = ["key_rate_limited_429", "key_working_200"];
    const attemptedKeys: string[] = [];

    const mockAiCall = vi.fn(async (key: string) => {
      attemptedKeys.push(key);
      if (key === "key_rate_limited_429") {
        throw new Error("429 Too Many Requests: Quota exceeded for this API key");
      }
      return { text: "Success from key 2", status: 200 };
    });

    let result = null;

    for (let i = 0; i < keyPool.length; i++) {
      const activeKey = keyPool[i];
      try {
        result = await mockAiCall(activeKey);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/429|quota/i.test(msg) && i < keyPool.length - 1) {
          continue; // rotate to next key
        }
        throw err;
      }
    }

    expect(attemptedKeys).toEqual(["key_rate_limited_429", "key_working_200"]);
    expect(result).toEqual({ text: "Success from key 2", status: 200 });
  });

  it("isKeyRetryableError recognizes 502, 503, 504 and upstream rate limits", () => {
    expect(isKeyRetryableError(new Error("Provider error 503: upstream_rate_limited"))).toBe(true);
    expect(isKeyRetryableError(new Error("所有回退分组均不可用:Rate limited by the upstream provider."))).toBe(true);
    expect(isKeyRetryableError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isKeyRetryableError(new Error("504 Gateway Timeout"))).toBe(true);
    expect(isKeyRetryableError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isKeyRetryableError(new Error("401 Unauthorized"))).toBe(true);
    expect(isKeyRetryableError(new Error("Random syntax error"))).toBe(false);
  });

  it("formatFriendlyGatewayError translates upstream rate limits cleanly into Vietnamese", () => {
    const rawError = new Error('Provider error 503: {"error":{"code":"upstream_rate_limited","message":"所有回退分组均不可用:Rate limited by the upstream provider. (ID: 38a850b9-1a5b-45f7-943e-5826c7ecff53)","request_id":"abc"}}');
    const formatted = formatFriendlyGatewayError("custom:ce_mtlvonl4onhkmyb8:claude-opus-5", rawError);

    expect(formatted).toContain('Mô hình "custom:ce_mtlvonl4onhkmyb8:claude-opus-5" hiện đang bị giới hạn tải');
    expect(formatted).toContain("Rate Limit");
    // Must NOT contain unformatted Chinese error text
    expect(formatted).not.toContain("所有回退分组均不可用");
  });
});

