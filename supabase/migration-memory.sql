-- Lumen / DungClaude Migration: Persistent Hierarchical AI Memory System
-- Apply via Supabase Dashboard → SQL Editor → Paste & Run.
-- Safe to re-run (idempotent). Full application functionality remains intact with fallback.

-- 1. Enable pgvector extension (if supported by database instance)
create extension if not exists vector;

-- 2. Create memories table
create table if not exists public.memories (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  project_id text references public.projects (id) on delete cascade,
  conversation_id text references public.conversations (id) on delete set null,
  scope text not null check (scope in ('global', 'project', 'conversation')),
  category text not null default 'general',
  key text not null,
  content text not null,
  importance double precision not null default 0.5 check (importance >= 0.0 and importance <= 1.0),
  confidence double precision not null default 0.9 check (confidence >= 0.0 and confidence <= 1.0),
  status text not null default 'current' check (status in ('current', 'superseded', 'archived')),
  source_conversation_id text references public.conversations (id) on delete set null,
  source_message_id text references public.messages (id) on delete set null,
  embedding jsonb,
  last_accessed_at timestamptz not null default now(),
  access_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional vector column if pgvector is installed
do $$
begin
  if exists (select 1 from pg_type where typname = 'vector') then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'memories' and column_name = 'embedding_vec'
    ) then
      alter table public.memories add column embedding_vec vector(1536);
    end if;
  end if;
end $$;

-- 3. Performance Indexes
create index if not exists idx_memories_user_scope on public.memories (user_id, scope, status);
create index if not exists idx_memories_user_project on public.memories (user_id, project_id, status);
create index if not exists idx_memories_key on public.memories (user_id, key);
create index if not exists idx_memories_accessed on public.memories (user_id, last_accessed_at desc);

-- 4. Enable Row Level Security (RLS)
alter table public.memories enable row level security;

-- Strict RLS Policy: Users can only select/insert/update/delete their own memories
create policy "Users can view own memories" on public.memories
  for select using (auth.uid()::text = user_id);

create policy "Users can insert own memories" on public.memories
  for insert with check (auth.uid()::text = user_id);

create policy "Users can update own memories" on public.memories
  for update using (auth.uid()::text = user_id);

create policy "Users can delete own memories" on public.memories
  for delete using (auth.uid()::text = user_id);

-- 5. Semantic Vector Search RPC with Strict Scope & Project Isolation
create or replace function public.search_memories(
  p_user_id text,
  p_project_id text default null,
  p_limit integer default 5,
  p_query_embedding vector(1536) default null
) returns table (
  id text,
  user_id text,
  project_id text,
  conversation_id text,
  scope text,
  category text,
  key text,
  content text,
  importance double precision,
  confidence double precision,
  status text,
  similarity double precision,
  last_accessed_at timestamptz,
  access_count integer
) language sql stable security definer as $$
  select
    m.id,
    m.user_id,
    m.project_id,
    m.conversation_id,
    m.scope,
    m.category,
    m.key,
    m.content,
    m.importance,
    m.confidence,
    m.status,
    case
      when p_query_embedding is not null and m.embedding_vec is not null
      then 1 - (m.embedding_vec <=> p_query_embedding)
      else 0.0
    end as similarity,
    m.last_accessed_at,
    m.access_count
  from public.memories m
  where m.user_id = p_user_id
    and m.status = 'current'
    and (
      -- Outside project: strictly match only global memories that have no project_id
      (p_project_id is null and m.project_id is null and m.scope = 'global')
      -- Inside project: match memories belonging to this project OR unscoped global memories
      or (p_project_id is not null and (m.project_id = p_project_id or (m.scope = 'global' and m.project_id is null)))
    )
  order by
    case
      when p_query_embedding is not null and m.embedding_vec is not null
      then (1 - (m.embedding_vec <=> p_query_embedding)) * 0.5 + m.importance * 0.3 + (case when m.access_count > 0 then 0.2 else 0.0 end)
      else m.importance * 0.7 + (case when m.access_count > 0 then 0.3 else 0.0 end)
    end desc
  limit p_limit;
$$;
