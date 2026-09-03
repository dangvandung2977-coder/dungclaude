-- Lumen migration 002: nhiều Custom endpoints (OpenAI-compatible) + models.
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → New query → paste file này → Run.

-- ── custom_endpoints: mỗi dòng là 1 server riêng (Ollama, vLLM, LM Studio...) ──
create table if not exists public.custom_endpoints (
  id text primary key,
  name text not null,
  base_url text not null,
  api_key_enc text,
  api_key_hint text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── custom_models: model thuộc về 1 endpoint ──
-- id có dạng custom:<endpointId>:<apiName> để AI Gateway định tuyến.
create table if not exists public.custom_models (
  id text primary key,
  endpoint_id text not null references public.custom_endpoints (id) on delete cascade,
  api_name text not null,
  display_name text not null,
  context_window integer not null default 128000,
  capabilities text not null default 'chat',
  input_price_per_m double precision not null default 0,
  output_price_per_m double precision not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_custom_models_endpoint on public.custom_models (endpoint_id);

-- RLS: khóa đọc public, chỉ secret key (server) truy cập.
alter table public.custom_endpoints enable row level security;
alter table public.custom_models enable row level security;
