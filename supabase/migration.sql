-- Lumen migration for Supabase Postgres.
-- HOW TO APPLY (1 lần duy nhất):
--   Supabase Dashboard → SQL Editor → New query → paste toàn bộ file này → Run.
-- Sau đó điền SUPABASE_URL / SUPABASE_SECRET_KEY vào .env và restart app.
--
-- Bảo mật: bật RLS và KHÔNG tạo policy public nào. App truy cập bằng
-- secret key (bypass RLS) từ server. Publishable key không đọc được gì.

-- ── users ──
create table if not exists public.users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text,
  role text not null default 'user',
  created_at timestamptz not null default now()
);
create index if not exists idx_users_email on public.users (email);

-- ── projects ──
create table if not exists public.projects (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  name text not null,
  description text,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_user on public.projects (user_id, updated_at desc);

-- ── conversations ──
create table if not exists public.conversations (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  project_id text references public.projects (id) on delete set null,
  title text not null default 'New conversation',
  model_id text not null default 'demo:lumen-echo',
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conv_user_updated on public.conversations (user_id, updated_at desc);
create index if not exists idx_conv_project on public.conversations (project_id);

-- ── messages ──
create table if not exists public.messages (
  id text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  role text not null,
  content text not null default '',
  model_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_conv on public.messages (conversation_id, created_at asc);

-- ── message_parts ──
create table if not exists public.message_parts (
  id text primary key,
  message_id text not null references public.messages (id) on delete cascade,
  type text not null,
  text text,
  language text,
  url text,
  mime_type text,
  file_name text,
  file_id text,
  tool_name text,
  tool_call_id text,
  tool_input text,
  tool_output text,
  status text,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_parts_msg on public.message_parts (message_id);

-- ── attachments ──
create table if not exists public.attachments (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  conversation_id text references public.conversations (id) on delete set null,
  project_id text references public.projects (id) on delete set null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null,
  kind text not null default 'file',
  width integer,
  height integer,
  duration_sec double precision,
  parsed_text text,
  created_at timestamptz not null default now()
);
create index if not exists idx_att_user on public.attachments (user_id, created_at desc);
create index if not exists idx_att_conv on public.attachments (conversation_id);

-- ── usage_events ──
create table if not exists public.usage_events (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  conversation_id text,
  model text not null,
  provider text not null,
  function_key text not null default 'chat_default',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd double precision not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_user on public.usage_events (user_id, created_at desc);

-- ── provider_configs (API keys mã hóa, chỉ Admin sửa qua /admin) ──
create table if not exists public.provider_configs (
  provider text primary key,
  enabled boolean not null default false,
  base_url text,
  api_key_enc text,
  api_key_hint text,
  updated_at timestamptz not null default now()
);

-- ── model_configs (admin bật/tắt model) ──
create table if not exists public.model_configs (
  model_id text primary key,
  provider text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ── model_routes (model cho từng chức năng: chat/vision/video/...) ──
create table if not exists public.model_routes (
  function_key text primary key,
  model_id text not null,
  updated_at timestamptz not null default now()
);

-- ── tool_calls ──
create table if not exists public.tool_calls (
  id text primary key,
  message_id text not null references public.messages (id) on delete cascade,
  name text not null,
  input text,
  output text,
  status text not null default 'success',
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── Row Level Security: khóa đọc public, chỉ secret key (server) truy cập ──
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_parts enable row level security;
alter table public.attachments enable row level security;
alter table public.usage_events enable row level security;
alter table public.provider_configs enable row level security;
alter table public.model_configs enable row level security;
alter table public.model_routes enable row level security;
alter table public.tool_calls enable row level security;
-- Không tạo policy → anon/publishable key không đọc/ghi được gì.
-- Service/secret key bypass RLS.

-- ── Seed định tuyến chức năng mặc định ──
insert into public.model_routes (function_key, model_id) values
  ('chat_default', 'demo:lumen-echo'),
  ('chat_fast', 'demo:lumen-echo'),
  ('vision', 'demo:lumen-echo'),
  ('video', 'demo:lumen-echo'),
  ('reasoning', 'demo:lumen-echo'),
  ('embeddings', 'local:hash')
on conflict (function_key) do nothing;
