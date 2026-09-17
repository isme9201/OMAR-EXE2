-- Avenmedia request-management fields and safe task policies.
alter table public.tasks add column if not exists estimated_cost numeric(12,2);
alter table public.tasks add column if not exists requirements text;
alter table public.tasks add column if not exists image_urls text[] not null default '{}';
alter table public.tasks add column if not exists updated_at timestamptz not null default now();

create index if not exists tasks_client_name_idx on public.tasks(lower(client_name));
create index if not exists tasks_due_status_idx on public.tasks(due_at, status);

-- Keep task management available to admins/managers while assigned employees can read their work.
drop policy if exists tasks_manager_insert on public.tasks;
create policy tasks_manager_insert on public.tasks for insert to authenticated
with check (public.is_task_manager() and (created_by is null or created_by = auth.uid()));

drop policy if exists tasks_manager_update on public.tasks;
create policy tasks_manager_update on public.tasks for update to authenticated
using (public.is_task_manager()) with check (public.is_task_manager());

drop policy if exists tasks_manager_delete on public.tasks;
create policy tasks_manager_delete on public.tasks for delete to authenticated
using (public.is_task_manager());

notify pgrst, 'reload schema';
