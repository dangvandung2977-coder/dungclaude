# ARCHITECTURE — Lumen AI Workspace

```text
Browser (React 19, Next.js App Router)
 ├── / (landing) · /login · /signup
 ├── /app/** (user — chat, projects, library, explore, settings, usage)
 └── /admin/** (admin only — providers, model routing, users)
        ↓ fetch (SSE for streaming)
API Routes (Node.js runtime)
 ├── /api/auth/*          signup/login/session/logout (JWT httpOnly cookie, bcrypt)
 ├── /api/chat/stream     SSE: history + project instructions + RAG → AI Gateway
 ├── /api/conversations   CRUD + export (md/json)
 ├── /api/files           upload (validate→store→parse) / serve (auth, no raw paths)
 ├── /api/projects        CRUD + detail (chats + files)
 ├── /api/models          enabled models for current user (admin-filtered)
 ├── /api/search · /api/usage
 └── /api/admin/*         requireAdmin: providers / models+routes / users
        ↓
AI Gateway (src/lib/ai/gateway.ts)
 ├── resolveModel: explicit choice | video→route("video") | image→route("vision") | default
 ├── Model Registry: static catalog + admin model_configs overlay
 ├── Providers: openai-compatible (openai/openrouter/custom) · anthropic · gemini · demo
 │    Vision: image_url parts / Anthropic base64 blocks / Gemini inlineData
 │    Video:  input_video (OpenAI) / inlineData (Gemini) / text fallback + metadata
 ├── Tool loop: calculator · file_search · web_search (Tavily/Serper, graceful unavailable)
 ├── Fallback chain AI_FALLBACK_ORDER khi provider chính lỗi
 └── Usage: tokens (thật khi provider trả usage, ước lượng khi không) + cost → usage_events
        ↓
Data (Supabase — `src/lib/db/*`)
 Postgres: users conversations messages message_parts attachments projects
 usage_events provider_configs model_configs model_routes tool_calls
 (FK + indexes, RLS bật, không policy public — chỉ secret key server truy cập)
 Storage: bucket private `attachments` (tự tạo khi chạy) — serve qua
 /api/files/[id] đã check auth, không lộ public URL.
```

## Quyết định quan trọng

- **Không fake AI**: chưa có key → Demo provider nói rõ là dev mode. Web search chưa cấu hình → tool trả `unavailable`, không bịa kết quả.
- **Key mã hóa AES-256-GCM** (AUTH_SECRET) trong `provider_configs` và
  `custom_endpoints`; ENV key vẫn hỗ trợ (hiện badge "từ ENV").
- **Admin duy nhất**: tài khoản đầu tiên là admin; không API/UI nào nâng user
  khác lên admin (`/api/admin/users` chỉ đọc). User tuân theo model/routes
  do admin đặt.
- **Custom đa endpoint**: `custom_endpoints` (nhiều server OpenAI-compatible)
  + `custom_models` (id `custom:<endpointId>:<apiName>` để gateway định tuyến).
- **Video**: gửi nguyên file cho provider hỗ trợ (Gemini/OpenAI video input); provider không hỗ trợ → kèm metadata + parsed text, không drop lặng lẽ.
- **RAG**: chunker 1200/150 + keyword retriever local (chạy không cần key); interface sẵn để cắm embeddings thật.
- **Rate limit** in-memory/process; production multi-instance dùng Redis.
