# Lumen — AI Workspace (chat text + ảnh + video, đa model)

Chat AI đa model với Projects, RAG trên file đính kèm, Tools, Artifact Canvas
và **trang Admin riêng để quản lí nguồn API / model theo chức năng**.

## Phân quyền

| Admin | ✅ (duy nhất 1 người) | ✅ |
|---|---|---|
| Chat, gửi ảnh/video/file | ✅ | ✅ |
| Projects, search, export | ✅ | ✅ |
| Xem/sửa API key, provider | ✅ tại `/admin` | ❌ (403) |
| Thêm endpoints riêng, gán model Vision/Video/Chat | ✅ | ❌ |
| Quản lí user | xem (không đổi role) | ❌ |

- Chỉ **tài khoản đăng ký đầu tiên** là Admin. Mọi user sau tuân theo cấu hình
  của admin, không thể tự lên admin, không API nào đổi được role.
- `ADMIN_EMAILS` chỉ để khôi phục khi chưa có admin nào.

## Gửi ảnh / video cho AI

1. Trong khung chat bấm 📎 → chọn ảnh (PNG/JPG/WebP/GIF) hoặc video (MP4/WebM/MOV ≤ 100MB).
2. Để model ở **✨ Tự động**: có ảnh → dùng model **Vision**, có video → model **Video** (do Admin gán tại `/admin/models`).
3. Admin cần cấu hình key thật (OpenAI / Anthropic / Gemini / OpenRouter). Khi chưa có key, app chạy **Lumen Echo (dev)** — trả lời rõ là chế độ dev, không giả vờ là model cloud.

Model gợi ý: Vision → `GPT-4o`, `Claude Sonnet`, `Gemini Flash`, `Qwen VL`; Video → `Gemini 2.5`, `GPT-4o`.

## Chạy dev

```bash
cp .env.example .env
# sửa AUTH_SECRET (32+ ký tự) và ADMIN_EMAILS
npm install
npm run dev
# mở http://localhost:3000
```

DB Postgres trên Supabase (`supabase/migration.sql` chạy 1 lần trong SQL Editor).
File upload vào Supabase Storage bucket private `attachments`.

## Cấu hình provider (Admin UI, không cần sửa file)

`/admin` → **Nguồn API**: bật provider, dán key (lưu mã hóa AES-256-GCM,
hiện dạng `sk-••••1234`), bấm **Kiểm tra kết nối**.

`/admin/models` → **Model & chức năng**: bật/tắt model, gán model cho
Chat mặc định / Chat nhanh / Vision / Video / Reasoning / Embeddings
(kể cả model custom từ endpoints riêng).

`/admin/endpoints` → **Endpoints riêng**: thêm NHIỀU server OpenAI-compatible
(Ollama `http://localhost:11434/v1`, vLLM, LM Studio…), mỗi endpoint nhiều
model (tên hiển thị, api_name, khả năng vision/video, giá). User chỉ thấy
model khi endpoint bật + có key.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run start   # chạy production
npm run test    # unit tests (vitest)
npm run lint    # eslint
```

## Tài liệu thêm

- `ARCHITECTURE.md` — kiến trúc chi tiết
- `SETUP.md` — cài đặt + deploy
- `ENVIRONMENT.md` — toàn bộ biến môi trường
