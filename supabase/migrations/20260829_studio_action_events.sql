create table if not exists public.studio_action_events (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action_key text not null,
  label text not null default '',
  route text not null default '/',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists studio_action_events_created_at_idx on public.studio_action_events (created_at desc);
create index if not exists studio_action_events_action_key_idx on public.studio_action_events (action_key);
alter table public.studio_action_events enable row level security;

drop policy if exists studio_action_events_member_insert on public.studio_action_events;
create policy studio_action_events_member_insert on public.studio_action_events
for insert to authenticated
with check (lower(coalesce(actor_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists studio_action_events_member_read on public.studio_action_events;
create policy studio_action_events_member_read on public.studio_action_events
for select to authenticated
using (lower(coalesce(actor_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) or exists (
  select 1 from public.portfolio_members m
  where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and m.role = 'admin'
));
