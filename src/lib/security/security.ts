import crypto from "node:crypto";
import { config } from "@/lib/config";

// AES-256-GCM for provider API keys at rest. Key derived from AUTH_SECRET.
function encKey(): Buffer {
  return crypto.createHash("sha256").update(config.authSecret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [scheme, ivB, tagB, dataB] = payload.split(":");
  if (scheme !== "gcm") throw new Error("Unknown encryption scheme");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 3)}••••••••${key.slice(-4)}`;
}

// ── Simple in-memory rate limiter (per process; use Redis in multi-instance prod) ──
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, perMin: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + 60000 });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > perMin) return { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

const ALLOWED_UPLOADS = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/markdown", "text/csv", "application/json",
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "text/typescript", "text/javascript", "application/javascript",
]);
const EXT_OK = [".pdf", ".docx", ".txt", ".md", ".markdown", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov", ".ts", ".tsx", ".js", ".jsx", ".py", ".html", ".css"];

export function isImage(mime: string): boolean { return mime.startsWith("image/"); }
export function isVideo(mime: string): boolean { return mime.startsWith("video/"); }

export function validateUpload(fileName: string, mime: string, sizeBytes: number): { ok: boolean; reason?: string; kind?: "image" | "video" | "file" } {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  const kind = isImage(mime) ? "image" : isVideo(mime) ? "video" : "file";
  const maxBytes = kind === "video" ? (Number(process.env.MAX_VIDEO_MB ?? 100) || 100) * 1024 * 1024
    : (Number(process.env.MAX_UPLOAD_MB ?? 25) || 25) * 1024 * 1024;
  if (sizeBytes > maxBytes) return { ok: false, reason: `File quá lớn (tối đa ${Math.round(maxBytes / 1048576)}MB)` };
  if (!ALLOWED_UPLOADS.has(mime) && !EXT_OK.includes(ext)) return { ok: false, reason: `Định dạng không hỗ trợ: ${ext || mime}` };
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return { ok: false, reason: "Tên file không hợp lệ" };
  return { ok: true, kind };
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF ]/g, "_").slice(0, 120);
}
