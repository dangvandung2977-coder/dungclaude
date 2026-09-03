-- Lumen migration 003: Token & Cost Optimization System.
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste file này → Run.
-- An toàn chạy lại (idempotent). App vẫn chạy nếu CHƯA chạy migration
-- (tất cả code đều có fallback), nhưng sẽ không có dữ liệu optimization.

-- ── conversation_summaries: tóm tắt hội thoại (compact memory) ──
create table if not exists public.conversation_summaries (
  id text primary key,
  conversation_id text not null unique references public.conversations (id) on delete cascade,
  content text not null,
  summary_up_to integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_summaries_conv on public.conversation_summaries (conversation_id);

-- ── message_embeddings: semantic memory (pgvector nếu có, JSON fallback) ──
-- embedding lưu dạng JSON string để chạy được cả khi chưa bật pgvector ext.
-- Khi bật pgvector: chạy phần OPTIONAL ở cuối file.
create table if not exists public.message_embeddings (
  message_id text primary key references public.messages (id) on delete cascade,
  conversation_id text not null references public.conversations (id) on delete cascade,
  user_id text not null references public.users (id) on delete cascade,
  content_hash text not null default '',
  embedding jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_emb_conv on public.message_embeddings (conversation_id);
create index if not exists idx_msg_emb_user on public.message_embeddings (user_id);

-- ── optimization_settings: cấu hình optimization (1 row, key='global') ──
create table if not exists public.optimization_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── fallback_events: theo dõi khi provider/model chính fail ──
create table if not exists public.fallback_events (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  conversation_id text,
  primary_model text not null,
  fallback_model text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_fallback_user on public.fallback_events (user_id, created_at desc);

-- ── usage_events: thêm cột cho optimization ──
alter table public.usage_events
  add column if not exists message_id text,
  add column if not exists request_id text,
  add column if not exists cached_input_tokens integer not null default 0,
  add column if not exists cache_creation_tokens integer not null default 0,
  add column if not exists routing_reason text,
  add column if not exists optimization_strategy text,
  add column if not exists tokens_saved integer not null default 0,
  add column if not exists tokens_without_optimization integer not null default 0;
create index if not exists idx_usage_created on public.usage_events (created_at desc);
create index if not exists idx_usage_conv on public.usage_events (conversation_id);

-- ── RLS: khóa hết, server dùng secret key (bypass) ──
alter table public.conversation_summaries enable row level security;
alter table public.message_embeddings enable row level security;
alter table public.optimization_settings enable row level security;
alter table public.fallback_events enable row level security;

-- ══════════════ OPTIONAL: pgvector semantic search ══════════════
-- Bật khi muốn semantic search thật (không chỉ keyword):
-- 1) Dashboard → Database → Extensions → bật "vector"
-- 2) Chạy tiếp:
--
-- alter table public.message_embeddings
--   add column if not exists embedding_vec vector(1536);
-- create or replace function public.search_message_memory(
--   p_user_id text, p_conversation_id text, p_query_embedding vector(1536), p_limit integer
-- ) returns table (message_id text, content text, score float8)
-- language sql stable security definer as $$
--   select m.id, m.content, 1 - (me.embedding_vec <=> p_query_embedding)
--   from public.message_embeddings me
--   join public.messages m on m.id = me.message_id
--   where me.user_id = p_user_id and me.conversation_id = p_conversation_id
--   order by me.embedding_vec <=> p_query_embedding
--   limit p_limit;
-- $$;
--
-- (App tự fallback sang keyword search khi RPC này chưa tồn tại.)
