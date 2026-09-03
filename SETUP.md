# SETUP & DEPLOY

## Yêu cầu

- Node.js ≥ 22 (dùng `node:sqlite` built-in, không cần native deps)
- npm

## Dev (Windows / macOS / Linux)

```bash
cd web
cp .env.example .env
# BẮT BUỘC sửa:
#   AUTH_SECRET=<chuỗi ngẫu nhiên ≥32 ký tự>
#   ADMIN_EMAILS=email-cua-ban@example.com
#   SUPABASE_URL / SUPABASE_SECRET_KEY (lấy ở Supabase Dashboard → Settings → API)
npm install
```

**Tạo bảng (1 lần duy nhất):** Supabase Dashboard → **SQL Editor** → New query →
paste toàn bộ `supabase/migration.sql` → **Run**. Bucket `attachments` app tự tạo.

```bash
npm run dev
```

Tạo `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Kiểm thử

```bash
npm run test    # unit: calculator, chunker, registry, upload validation, AES, rate-limit
npm run lint
npm run build   # phải pass trước khi deploy
```

## Production

```bash
npm run build
npm start
# NODE_ENV=production, set APP_URL, AUTH_SECRET, ADMIN_EMAILS
```

> ⚠️ Không chạy `npm run build` và `npm run dev` cùng lúc chung thư mục
> `.next` — build sẽ xóa cache của dev gây lỗi 500 hàng loạt. Build kiểm tra
> dùng thư mục riêng: `$env:NEXT_DIST_DIR='.next-build'; npm run build`.

## Khắc phục sự cố: trang báo 500 / `routes-manifest.json` missing

Nguyên nhân thường gặp: thư mục `.next` (cache của dev server) bị xóa/sửa
giữa chừng — do chạy `npm run build` song song với `npm run dev`, hoặc
antivirus/sync "dọn" file. Cách sửa:

```bash
# 1. Tắt dev server đang chạy (Ctrl+C hoặc kill tiến trình cổng 3000/3100)
# 2. Xóa cache và chạy lại:
Remove-Item -Recurse -Force .\.next
npm run dev
```

Phòng ngừa: thêm thư mục project vào exclusion của Windows Defender
(Virus & threat protection → Manage settings → Exclusions), và luôn build
kiểm tra bằng `NEXT_DIST_DIR` riêng như trên.

Khuyến nghị:

- **App/API**: Vercel / VPS (`next start` sau `next build`)
- **DB**: file SQLite `./data` cần volume persistent; scale lớn → Supabase Postgres
  (implement lại `src/lib/db/*` qua `DATABASE_URL`, giữ nguyên API repos)
- **Storage**: `./data/uploads` → object storage (S3/R2) khi scale
- **Vector**: pgvector khi bật embeddings thật

## Lên Admin cho tài khoản có sẵn

Cách 1: thêm email vào `ADMIN_EMAILS`, đăng nhập lại (tự promote).
Cách 2: admin hiện tại vào `/admin/users` → "Cho làm admin".
