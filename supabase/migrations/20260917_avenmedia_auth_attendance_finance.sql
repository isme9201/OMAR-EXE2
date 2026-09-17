-- Avenmedia authentication-adjacent business data: attendance, bookings, and monthly financial ledger.
-- Secrets remain in Supabase Auth/Edge Functions; this migration stores no credentials.
create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_bookings (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_phone text,
  booking_date timestamptz,
  service_type text,
  estimated_cost numeric(12,2),
  requirements text,
  image_urls text[] not null default '{}',
  status text not null default 'new',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('income','expense')),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null,
  entry_date date not null default current_date,
  booking_id uuid references public.studio_bookings(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists attendance_employee_date_idx on public.attendance_logs(employee_id, check_in desc);
create index if not exists bookings_client_idx on public.studio_bookings(lower(client_name));
create index if not exists bookings_date_idx on public.studio_bookings(booking_date desc);
create index if not exists finance_date_idx on public.financial_entries(entry_date desc);

alter table public.attendance_logs enable row level security;
alter table public.studio_bookings enable row level security;
alter table public.financial_entries enable row level security;

drop policy if exists attendance_team_read on public.attendance_logs;
create policy attendance_team_read on public.attendance_logs for select to authenticated using (employee_id = auth.uid() or public.is_task_manager());
drop policy if exists attendance_self_write on public.attendance_logs;
create policy attendance_self_write on public.attendance_logs for insert to authenticated with check (employee_id = auth.uid());
drop policy if exists attendance_self_update on public.attendance_logs;
create policy attendance_self_update on public.attendance_logs for update to authenticated using (employee_id = auth.uid() or public.is_task_manager()) with check (employee_id = auth.uid() or public.is_task_manager());

drop policy if exists bookings_team_read on public.studio_bookings;
create policy bookings_team_read on public.studio_bookings for select to authenticated using (true);
drop policy if exists bookings_manager_write on public.studio_bookings;
create policy bookings_manager_write on public.studio_bookings for all to authenticated using (public.is_task_manager()) with check (public.is_task_manager());

drop policy if exists finance_manager_read on public.financial_entries;
create policy finance_manager_read on public.financial_entries for select to authenticated using (public.is_task_manager());
drop policy if exists finance_manager_write on public.financial_entries;
create policy finance_manager_write on public.financial_entries for all to authenticated using (public.is_task_manager()) with check (public.is_task_manager());

alter table public.attendance_logs replica identity full;
alter table public.studio_bookings replica identity full;
alter table public.financial_entries replica identity full;
do $$ begin alter publication supabase_realtime add table public.attendance_logs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.studio_bookings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.financial_entries; exception when duplicate_object then null; end $$;

create or replace view public.avenmedia_monthly_summary as
select date_trunc('month', entry_date)::date as month,
  coalesce(sum(amount) filter (where entry_type = 'income'), 0) as income,
  coalesce(sum(amount) filter (where entry_type = 'expense'), 0) as expenses,
  coalesce(sum(amount) filter (where entry_type = 'income'), 0) - coalesce(sum(amount) filter (where entry_type = 'expense'), 0) as net
from public.financial_entries
group by 1;
revoke all on public.avenmedia_monthly_summary from anon;
grant select on public.avenmedia_monthly_summary to authenticated;
