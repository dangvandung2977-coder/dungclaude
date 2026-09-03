/**
 * Streaming Capability Management & Normalization
 * Tracks which models/endpoints support streaming (SSE) vs non-streaming.
 * Automatically adapts payload (stream: true vs stream: false) and handles retries.
 */

// In-memory set of endpoints / models identified as not supporting streaming
const nonStreamingEndpoints = new Set<string>();
const nonStreamingModels = new Set<string>();

/**
 * Checks whether a given provider, endpoint, or model supports streaming.
 */
export function isStreamingSupported(opts: {
  endpointId?: string;
  baseUrl?: string;
  modelId: string;
  capabilities?: string[];
}): boolean {
  // 1. Explicit capability check
  if (opts.capabilities && Array.isArray(opts.capabilities)) {
    if (opts.capabilities.includes("no_stream") || opts.capabilities.includes("non_streaming")) {
      return false;
    }
  }

  // 2. Endpoint ID check
  if (opts.endpointId && nonStreamingEndpoints.has(opts.endpointId)) {
    return false;
  }

  // 3. Base URL check
  if (opts.baseUrl) {
    const normalizedUrl = opts.baseUrl.trim().toLowerCase().replace(/\/$/, "");
    if (nonStreamingEndpoints.has(normalizedUrl)) {
      return false;
    }
  }

  // 4. Model ID check
  if (opts.modelId) {
    const normalizedModel = opts.modelId.trim().toLowerCase();
    if (nonStreamingModels.has(normalizedModel)) {
      return false;
    }
  }

  return true;
}

/**
 * Dynamically marks an endpoint or model as non-streaming (e.g. after receiving upstream_unsupported).
 */
export function markStreamingUnsupported(opts: {
  endpointId?: string;
  baseUrl?: string;
  modelId?: string;
}): void {
  if (opts.endpointId) {
    nonStreamingEndpoints.add(opts.endpointId);
  }
  if (opts.baseUrl) {
    const normalizedUrl = opts.baseUrl.trim().toLowerCase().replace(/\/$/, "");
    nonStreamingEndpoints.add(normalizedUrl);
  }
  if (opts.modelId) {
    nonStreamingModels.add(opts.modelId.trim().toLowerCase());
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[Streaming Capability] Marked as non-streaming: endpoint=${opts.endpointId || opts.baseUrl}, model=${opts.modelId}`
    );
  }
}

/**
 * Detects whether an upstream error is due to streaming being unsupported.
 */
export function isUpstreamUnsupportedError(errorMessage: string): boolean {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();

  return (
    msg.includes("upstream_unsupported") ||
    msg.includes("stream is not supported") ||
    msg.includes("streaming is not supported") ||
    msg.includes("streaming not supported") ||
    msg.includes("stream not supported") ||
    msg.includes("does not support streaming") ||
    msg.includes("unsupported stream") ||
    msg.includes("invalid_stream") ||
    msg.includes("stream parameter is not supported") ||
    msg.includes("stream=true is not supported")
  );
}
