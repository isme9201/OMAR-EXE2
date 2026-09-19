-- Avenmedia management and finance repair.
-- Policies intentionally avoid cross-table subqueries to prevent RLS recursion.

create extension if not exists pgcrypto;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
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
set row_security = off
as $$ select public.current_profile_role() in ('admin', 'manager', 'Admin', 'Manager'); $$;

-- Remove recursive policy variants created by earlier migrations.
drop policy if exists profiles_self_or_manager_read on public.profiles;
drop policy if exists profiles_manager_insert on public.profiles;
drop policy if exists profiles_manager_update on public.profiles;
drop policy if exists tasks_visible_to_team on public.tasks;
drop policy if exists tasks_manager_insert on public.tasks;
drop policy if exists tasks_manager_update on public.tasks;
drop policy if exists tasks_manager_delete on public.tasks;
drop policy if exists task_assignments_visible_to_team on public.task_assignments;
drop policy if exists task_assignments_manager_write on public.task_assignments;
drop policy if exists client_uploads_visible_to_team on public.client_uploads;
drop policy if exists client_uploads_authenticated_insert on public.client_uploads;
drop policy if exists client_uploads_manager_update on public.client_uploads;
drop policy if exists client_uploads_manager_delete on public.client_uploads;
drop policy if exists avenmedia_chat_read on public.tasks;
drop policy if exists avenmedia_chat_upload_read on public.client_uploads;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.client_uploads enable row level security;

drop policy if exists avenmedia_profiles_read on public.profiles;
create policy avenmedia_profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists avenmedia_profiles_write on public.profiles;
create policy avenmedia_profiles_write on public.profiles for all to authenticated
  using (public.is_task_manager() or id = auth.uid())
  with check (public.is_task_manager() or id = auth.uid());

drop policy if exists avenmedia_tasks_read on public.tasks;
create policy avenmedia_tasks_read on public.tasks for select to authenticated using (true);
drop policy if exists avenmedia_tasks_insert on public.tasks;
create policy avenmedia_tasks_insert on public.tasks for insert to authenticated
  with check (public.is_task_manager() or created_by = auth.uid());
drop policy if exists avenmedia_tasks_update on public.tasks;
create policy avenmedia_tasks_update on public.tasks for update to authenticated
  using (public.is_task_manager() or created_by = auth.uid())
  with check (public.is_task_manager() or created_by = auth.uid());
drop policy if exists avenmedia_tasks_delete on public.tasks;
create policy avenmedia_tasks_delete on public.tasks for delete to authenticated
  using (public.is_task_manager() or created_by = auth.uid());

drop policy if exists avenmedia_assignments_read on public.task_assignments;
create policy avenmedia_assignments_read on public.task_assignments for select to authenticated using (true);
drop policy if exists avenmedia_assignments_write on public.task_assignments;
create policy avenmedia_assignments_write on public.task_assignments for all to authenticated
  using (public.is_task_manager() or employee_id = auth.uid())
  with check (public.is_task_manager());

drop policy if exists avenmedia_uploads_read on public.client_uploads;
create policy avenmedia_uploads_read on public.client_uploads for select to authenticated using (true);
drop policy if exists avenmedia_uploads_write on public.client_uploads;
create policy avenmedia_uploads_write on public.client_uploads for all to authenticated
  using (public.is_task_manager() or uploaded_by = auth.uid())
  with check (public.is_task_manager() or uploaded_by = auth.uid());

create table if not exists public.avenmedia_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null default 'cash' check (account_type in ('cash','bank','wallet','other')),
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.avenmedia_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.avenmedia_accounts(id) on delete cascade,
  direction text not null check (direction in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'general',
  description text not null default '',
  transaction_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists avenmedia_transactions_date_idx on public.avenmedia_transactions(transaction_date desc);
create index if not exists avenmedia_transactions_account_idx on public.avenmedia_transactions(account_id);

alter table public.avenmedia_accounts enable row level security;
alter table public.avenmedia_transactions enable row level security;

drop policy if exists avenmedia_accounts_read on public.avenmedia_accounts;
create policy avenmedia_accounts_read on public.avenmedia_accounts for select to authenticated using (true);
drop policy if exists avenmedia_accounts_write on public.avenmedia_accounts;
create policy avenmedia_accounts_write on public.avenmedia_accounts for all to authenticated
  using (public.is_task_manager() or created_by = auth.uid())
  with check (public.is_task_manager() or created_by = auth.uid());

drop policy if exists avenmedia_transactions_read on public.avenmedia_transactions;
create policy avenmedia_transactions_read on public.avenmedia_transactions for select to authenticated using (true);
drop policy if exists avenmedia_transactions_write on public.avenmedia_transactions;
create policy avenmedia_transactions_write on public.avenmedia_transactions for all to authenticated
  using (public.is_task_manager() or created_by = auth.uid())
  with check (public.is_task_manager() or created_by = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.avenmedia_accounts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.avenmedia_transactions;
exception when duplicate_object then null;
end $$;
