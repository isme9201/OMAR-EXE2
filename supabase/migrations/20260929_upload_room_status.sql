-- Upload room operations: lifecycle status, notes, viewed tracking and audit history.
-- Run after the existing client_uploads and profile/RLS migrations.

alter table public.client_uploads
  add column if not exists file_name text,
  add column if not exists status text not null default 'new',
  add column if not exists note text,
  add column if not exists viewed_at timestamptz,
  add column if not exists viewed_by uuid references public.profiles(id);

alter table public.client_uploads
  drop constraint if exists client_uploads_status_check;
alter table public.client_uploads
  add constraint client_uploads_status_check
  check (status in ('new', 'viewed', 'in_progress', 'delivered', 'needs_reupload'));

create index if not exists client_uploads_status_idx on public.client_uploads(status, uploaded_at desc);
create index if not exists client_uploads_client_name_idx on public.client_uploads(client_name);

create table if not exists public.upload_activity (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.client_uploads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists upload_activity_upload_idx on public.upload_activity(upload_id, created_at desc);
alter table public.upload_activity enable row level security;

drop policy if exists upload_activity_team_read on public.upload_activity;
create policy upload_activity_team_read on public.upload_activity
  for select to authenticated
  using (public.is_task_manager() or actor_id = auth.uid() or exists (
    select 1 from public.task_assignments a
    where a.task_id = (select task_id from public.client_uploads u where u.id = upload_activity.upload_id)
      and a.employee_id = auth.uid()
  ));

drop policy if exists upload_activity_team_insert on public.upload_activity;
create policy upload_activity_team_insert on public.upload_activity
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_task_manager());

do $$ begin
  alter publication supabase_realtime add table public.upload_activity;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
