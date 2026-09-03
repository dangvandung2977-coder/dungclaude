export const config = {
  appName: process.env.APP_NAME ?? "DungClaude",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  dbPath: process.env.DATABASE_PATH ?? "./data/lumen.db",
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  },
  authSecret: process.env.AUTH_SECRET ?? "dev-secret-change-me-min-32-chars!!",
  sessionCookie: process.env.SESSION_COOKIE_NAME ?? "lumen_session",
  sessionMaxAgeSec: (Number(process.env.SESSION_MAX_AGE_DAYS ?? 30) || 30) * 86400,
  // Admin: comma-separated emails that always get admin role
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  ai: {
    defaultModel: process.env.AI_DEFAULT_MODEL ?? "custom:ce_mtlor526e3wmn28x:gemini-3.8-flash",
    fallbackEnabled: (process.env.AI_FALLBACK_ENABLED ?? "true") !== "false",
    fallbackOrder: (process.env.AI_FALLBACK_ORDER ?? "custom,gemini,demo")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 25000) || 25000,
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2) || 2,
  },
  providers: {
    openai: { key: process.env.OPENAI_API_KEY ?? "", baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1" },
    anthropic: { key: process.env.ANTHROPIC_API_KEY ?? "", baseUrl: "https://api.anthropic.com" },
    gemini: { key: process.env.GOOGLE_API_KEY ?? "" },
    openrouter: { key: process.env.OPENROUTER_API_KEY ?? "", baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1" },
    custom: { key: process.env.CUSTOM_API_KEY ?? "", baseUrl: process.env.CUSTOM_BASE_URL ?? "" },
  },
  storageDir: process.env.STORAGE_DIR ?? "./data/uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25) || 25,
  maxVideoMb: Number(process.env.MAX_VIDEO_MB ?? 100) || 100,
  rateLimit: {
    chatPerMin: Number(process.env.RATE_LIMIT_CHAT_PER_MIN ?? 30) || 30,
    authPerMin: Number(process.env.RATE_LIMIT_AUTH_PER_MIN ?? 10) || 10,
  },
};

export type FunctionKey =
  | "chat_default"
  | "chat_fast"
  | "vision"
  | "video"
  | "reasoning"
  | "embeddings";

export const FUNCTION_LABELS: Record<FunctionKey, string> = {
  chat_default: "Chat mặc định",
  chat_fast: "Chat nhanh / tiết kiệm",
  vision: "Đọc ảnh (Vision)",
  video: "Đọc video",
  reasoning: "Suy luận sâu (Reasoning)",
  embeddings: "Embeddings / RAG",
};

export function isAdminEmail(email: string): boolean {
  return config.adminEmails.includes(email.trim().toLowerCase());
}
