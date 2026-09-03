# ENVIRONMENT

Copy `.env.example` → `.env`. Không commit `.env`.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `APP_NAME` | Lumen | Tên hiển thị |
| `APP_URL` | http://localhost:3000 | URL public |
| Biến | Mô tả |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SECRET_KEY` | **Server-only**, không bao giờ prefix `NEXT_PUBLIC_`. Bypass RLS |
| `SUPABASE_PUBLISHABLE_KEY` | Public key (hiện chưa dùng ở client; để dành) |
| `AUTH_SECRET` | — | **Bắt buộc đổi**, ≥32 ký tự. Dùng cho JWT + mã hóa API key |
| `SESSION_COOKIE_NAME` | lumen_session | Tên cookie phiên |
| `SESSION_MAX_AGE_DAYS` | 30 | TTL phiên |
| `ADMIN_EMAILS` | — | `a@x.com,b@y.com`: luôn là Admin |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | — | Có thể cấu hình qua `/admin` thay vì ENV |
| `ANTHROPIC_API_KEY` | — | Claude |
| `GOOGLE_API_KEY` | — | Gemini (đọc video tốt) |
| `OPENROUTER_API_KEY` | — | DeepSeek, Qwen… |
| `CUSTOM_API_KEY` / `CUSTOM_BASE_URL` | — | Endpoint OpenAI-compatible tự host |
| `AI_DEFAULT_MODEL` | demo:lumen-echo | Route mặc định khi DB chưa seed |
| `AI_FALLBACK_ENABLED` / `AI_FALLBACK_ORDER` | true / openai,anthropic,gemini,openrouter,demo | Fallback khi provider lỗi |
| `TAVILY_API_KEY` / `SERPER_API_KEY` | — | Web search (thiếu → tool báo unavailable) |
| `STORAGE_DIR` | ./data/uploads | Nơi lưu file upload |
| `MAX_UPLOAD_MB` | 25 | Giới hạn file thường/ảnh |
| `MAX_VIDEO_MB` | 100 | Giới hạn video |
| `RATE_LIMIT_CHAT_PER_MIN` / `RATE_LIMIT_AUTH_PER_MIN` | 30 / 10 | Rate limit |
