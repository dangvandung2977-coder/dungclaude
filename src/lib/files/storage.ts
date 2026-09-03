// Supabase Storage adapter for uploads (images/video/files).
// SERVER-ONLY (dùng secret key). Bucket private; user tải qua /api/files/[id]
// (đã check auth + ownership), không bao giờ lộ public URL.
import { getSupabase } from "@/lib/db/supabase";

export const ATTACHMENTS_BUCKET = "attachments";

async function ensureBucket(): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.storage.listBuckets();
  if (!data?.some((b) => b.name === ATTACHMENTS_BUCKET)) {
    const { error } = await sb.storage.createBucket(ATTACHMENTS_BUCKET, { public: false });
    if (error) throw new Error(`Không tạo được storage bucket: ${error.message}`);
  }
}

export async function uploadBuffer(storagePath: string, bytes: Uint8Array | Buffer, mimeType: string): Promise<void> {
  await ensureBucket();
  const { error } = await getSupabase().storage.from(ATTACHMENTS_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Upload storage lỗi: ${error.message}`);
}

export async function downloadBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await getSupabase().storage.from(ATTACHMENTS_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Không đọc được file: ${error?.message ?? "unknown"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(storagePath: string): Promise<void> {
  await getSupabase().storage.from(ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => {});
}
