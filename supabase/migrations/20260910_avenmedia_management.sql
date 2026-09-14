-- Avenmedia management expansion: employees, tasks, secure upload links, and Cloudinary metadata.
-- This migration is additive and preserves existing portfolio/workspace data.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists specialty text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tasks
  add column if not exists title text not null default 'مهمة جديدة',
  add column if not exists task_type text not null default 'general',
  add column if not exists due_at timestamptz,
  add column if not exists priority text not null default 'normal';

alter table public.client_uploads
  add column if not exists cloudinary_public_id text,
  add column if not exists resource_type text,
  add column if not exists bytes bigint,
  add column if not exists format text,
  add column if not exists secure_url text,
  add column if not exists uploaded_by uuid references public.profiles(id);

create table if not exists public.task_upload_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  task_id uuid references public.tasks(id) on delete cascade,
  client_name text,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_active_idx on public.profiles(is_active);
create index if not exists tasks_due_at_idx on public.tasks(due_at);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists task_assignments_employee_idx on public.task_assignments(employee_id);
create index if not exists client_uploads_task_idx on public.client_uploads(task_id);
create index if not exists task_upload_links_token_idx on public.task_upload_links(token);
create index if not exists task_upload_links_expires_idx on public.task_upload_links(expires_at);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid() limit 1),
    (select p.role from public.profiles p where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1),
    'viewer'
  );
$$;

create or replace function public.is_task_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() in ('admin', 'manager');
$$;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.client_uploads enable row level security;
alter table public.task_upload_links enable row level security;

drop policy if exists profiles_self_or_manager_read on public.profiles;
create policy profiles_self_or_manager_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_task_manager());

drop policy if exists profiles_manager_insert on public.profiles;
create policy profiles_manager_insert on public.profiles
  for insert to authenticated
  with check (public.is_task_manager());

drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles
  for update to authenticated
  using (public.is_task_manager() or id = auth.uid())
  with check (public.is_task_manager() or id = auth.uid());

drop policy if exists tasks_visible_to_team on public.tasks;
create policy tasks_visible_to_team on public.tasks
  for select to authenticated
  using (
    public.is_task_manager()
    or created_by = auth.uid()
    or exists (select 1 from public.task_assignments a where a.task_id = id and a.employee_id = auth.uid())
  );

drop policy if exists tasks_manager_insert on public.tasks;
create policy tasks_manager_insert on public.tasks
  for insert to authenticated
  with check (public.is_task_manager() and (created_by is null or created_by = auth.uid()));

drop policy if exists tasks_manager_update on public.tasks;
create policy tasks_manager_update on public.tasks
  for update to authenticated
  using (public.is_task_manager())
  with check (public.is_task_manager());

drop policy if exists tasks_manager_delete on public.tasks;
create policy tasks_manager_delete on public.tasks
  for delete to authenticated
  using (public.is_task_manager());

drop policy if exists task_assignments_visible_to_team on public.task_assignments;
create policy task_assignments_visible_to_team on public.task_assignments
  for select to authenticated
  using (
    employee_id = auth.uid()
    or public.is_task_manager()
    or exists (select 1 from public.tasks t where t.id = task_id and t.created_by = auth.uid())
  );

drop policy if exists task_assignments_manager_write on public.task_assignments;
create policy task_assignments_manager_write on public.task_assignments
  for all to authenticated
  using (public.is_task_manager())
  with check (public.is_task_manager());

drop policy if exists client_uploads_visible_to_team on public.client_uploads;
create policy client_uploads_visible_to_team on public.client_uploads
  for select to authenticated
  using (
    public.is_task_manager()
    or uploaded_by = auth.uid()
    or exists (select 1 from public.task_assignments a where a.task_id = client_uploads.task_id and a.employee_id = auth.uid())
  );

drop policy if exists client_uploads_authenticated_insert on public.client_uploads;
create policy client_uploads_authenticated_insert on public.client_uploads
  for insert to authenticated
  with check (uploaded_by = auth.uid() or public.is_task_manager());

drop policy if exists client_uploads_manager_update on public.client_uploads;
create policy client_uploads_manager_update on public.client_uploads
  for update to authenticated
  using (public.is_task_manager() or uploaded_by = auth.uid())
  with check (public.is_task_manager() or uploaded_by = auth.uid());

drop policy if exists client_uploads_manager_delete on public.client_uploads;
create policy client_uploads_manager_delete on public.client_uploads
  for delete to authenticated
  using (public.is_task_manager());

drop policy if exists task_upload_links_manager_read on public.task_upload_links;
create policy task_upload_links_manager_read on public.task_upload_links
  for select to authenticated
  using (public.is_task_manager() or created_by = auth.uid());

drop policy if exists task_upload_links_manager_write on public.task_upload_links;
create policy task_upload_links_manager_write on public.task_upload_links
  for all to authenticated
  using (public.is_task_manager())
  with check (public.is_task_manager() and created_by = auth.uid());
