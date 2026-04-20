create extension if not exists pgcrypto;

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  anon_id text not null,
  session_id text,
  event_type text not null check (
    event_type in (
      'page_view',
      'calculate',
      'click_consult',
      'click_store',
      'mark_purchase',
      'login',
      'save_project'
    )
  ),
  mode text,
  payload jsonb not null default '{}'::jsonb,
  user_agent text,
  referrer text
);

create index if not exists idx_app_events_created_at on public.app_events(created_at desc);
create index if not exists idx_app_events_event_type on public.app_events(event_type);
create index if not exists idx_app_events_anon_id on public.app_events(anon_id);
create index if not exists idx_app_events_mode on public.app_events(mode);

alter table public.app_events enable row level security;
