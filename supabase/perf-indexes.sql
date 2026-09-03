-- ==============================================================================
-- HIGH-PERFORMANCE DATABASE INDEXES FOR CLAUDE WORKSPACE
-- Chạy script này trong Supabase Dashboard -> SQL Editor để tăng tốc độ truy vấn
-- ==============================================================================

-- 1. Tăng tốc lọc danh sách conversations theo user_id, pinned, updated_at
CREATE INDEX IF NOT EXISTS idx_conv_user_perf 
ON public.conversations (user_id, archived, pinned DESC, updated_at DESC);

-- 2. Tăng tốc tải tin nhắn theo conversation_id và sắp xếp created_at
CREATE INDEX IF NOT EXISTS idx_msg_conv_created 
ON public.messages (conversation_id, created_at ASC);

-- 3. Tăng tốc tải các phần đính kèm/message_parts theo message_id
CREATE INDEX IF NOT EXISTS idx_parts_msg_created 
ON public.message_parts (message_id, created_at ASC);

-- 4. Tăng tốc kiểm tra quyền sở hữu conversation
CREATE INDEX IF NOT EXISTS idx_conv_id_user 
ON public.conversations (id, user_id);
