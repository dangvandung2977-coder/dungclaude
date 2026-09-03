import type { NextConfig } from "next";

// NEXT_DIST_DIR: thư mục build/cache (mặc định ".next").
// QUAN TRỌNG: không bao giờ chạy `next build` và `next dev` chung một
// distDir — build sẽ xóa cache của dev gây lỗi 500 hàng loạt.
// Build kiểm tra: $env:NEXT_DIST_DIR='.next-build'; npm run build  (PowerShell)
// Chạy dev/prod bình thường (dùng .next).
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "",
  },
};

export default nextConfig;
