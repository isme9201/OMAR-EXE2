-- Fix Avenmedia save errors caused by mismatched table names and missing actor_email.
create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.studio_workspace_records') is not null
     and to_regclass('public.workspace_records') is null then
    alter table public.studio_workspace_records rename to workspace_records;
  end if;
end $$;

create table if not exists public.workspace_records (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  record_type text not null check (record_type in ('task','message','client','schedule','invoice','upload','equipment','channel')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_records_actor_type_idx on public.workspace_records(actor_email, record_type);
create index if not exists workspace_records_updated_at_idx on public.workspace_records(updated_at desc);
alter table public.workspace_records enable row level security;

drop policy if exists "workspace records self read" on public.workspace_records;
drop policy if exists "workspace records self write" on public.workspace_records;
drop policy if exists workspace_records_select on public.workspace_records;
drop policy if exists workspace_records_insert on public.workspace_records;
drop policy if exists workspace_records_update on public.workspace_records;
create policy workspace_records_select on public.workspace_records for select to authenticated using (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy workspace_records_insert on public.workspace_records for insert to authenticated with check (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy workspace_records_update on public.workspace_records for update to authenticated using (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email',''))) with check (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email','')));
grant select, insert, update on public.workspace_records to authenticated;

create table if not exists public.studio_actions (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  label text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.studio_actions enable row level security;
drop policy if exists studio_actions_select on public.studio_actions;
drop policy if exists studio_actions_insert on public.studio_actions;
create policy studio_actions_select on public.studio_actions for select to authenticated using (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy studio_actions_insert on public.studio_actions for insert to authenticated with check (lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email','')));
grant select, insert on public.studio_actions to authenticated;

notify pgrst, 'reload schema';
