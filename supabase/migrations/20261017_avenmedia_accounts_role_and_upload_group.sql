-- Narrow repair for the live Avenmedia app: normalize manager role casing,
-- create the two missing finance tables, and expose a non-secret upload-link id.
-- Deliberately does not alter client_orders or its RLS configuration.

create extension if not exists pgcrypto;

create or replace function public.is_task_manager()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(btrim(coalesce(public.current_profile_role(), ''))) in ('admin', 'manager');
$$;

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
create policy avenmedia_accounts_read on public.avenmedia_accounts
  for select to authenticated using (auth.uid() is not null);
drop policy if exists avenmedia_accounts_write on public.avenmedia_accounts;
create policy avenmedia_accounts_write on public.avenmedia_accounts
  for all to authenticated
  using (public.is_task_manager() or created_by = auth.uid())
  with check (public.is_task_manager() or created_by = auth.uid());

drop policy if exists avenmedia_transactions_read on public.avenmedia_transactions;
create policy avenmedia_transactions_read on public.avenmedia_transactions
  for select to authenticated using (auth.uid() is not null);
drop policy if exists avenmedia_transactions_write on public.avenmedia_transactions;
create policy avenmedia_transactions_write on public.avenmedia_transactions
  for all to authenticated
  using (public.is_task_manager() or created_by = auth.uid())
  with check (public.is_task_manager() or created_by = auth.uid());

grant select, insert, update, delete on public.avenmedia_accounts to authenticated;
grant select, insert, update, delete on public.avenmedia_transactions to authenticated;

alter table public.client_uploads add column if not exists upload_link_id uuid;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_uploads_upload_link_id_fkey'
      and conrelid = 'public.client_uploads'::regclass
  ) then
    alter table public.client_uploads
      add constraint client_uploads_upload_link_id_fkey
      foreign key (upload_link_id) references public.task_upload_links(id) on delete set null;
  end if;
end $$;

create index if not exists client_uploads_upload_link_id_idx on public.client_uploads(upload_link_id);
update public.client_uploads uploads
set upload_link_id = links.id
from public.task_upload_links links
where uploads.upload_link_id is null
  and uploads.upload_token = links.token;

do $$ begin
  alter publication supabase_realtime add table public.avenmedia_accounts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.avenmedia_transactions;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
