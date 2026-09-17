-- Avenmedia: payments attached to tasks and automatic income entries.
-- Run after the tasks and financial_entries tables already exist.

alter table public.tasks
  add column if not exists payment_type text not null default 'none',
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists payment_note text;

alter table public.tasks drop constraint if exists tasks_payment_type_check;
alter table public.tasks add constraint tasks_payment_type_check
  check (payment_type in ('none','deposit','full'));
alter table public.tasks drop constraint if exists tasks_paid_amount_check;
alter table public.tasks add constraint tasks_paid_amount_check
  check (paid_amount >= 0);

create table if not exists public.task_payments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_type text not null default 'deposit' check (payment_type in ('deposit','full')),
  payment_method text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists task_payments_task_idx on public.task_payments(task_id, created_at desc);

alter table public.task_payments enable row level security;
drop policy if exists task_payments_manager_all on public.task_payments;
create policy task_payments_manager_all on public.task_payments
  for all to authenticated
  using (public.is_task_manager())
  with check (public.is_task_manager());
grant select, insert, update, delete on public.task_payments to authenticated;

create or replace function public.record_task_payment_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta numeric(12,2);
begin
  delta := coalesce(new.paid_amount, 0) - coalesce(old.paid_amount, 0);
  if tg_op = 'INSERT' then
    delta := coalesce(new.paid_amount, 0);
  end if;
  if delta > 0 then
    insert into public.financial_entries
      (entry_type, amount, description, entry_date, created_by)
    values
      ('income', delta,
       'دفعة طلب: ' || coalesce(new.client_name, '') ||
       case when coalesce(new.title, '') <> '' then ' — ' || new.title else '' end,
       current_date, coalesce(new.created_by, auth.uid()));
  end if;
  return new;
end;
$$;

 drop trigger if exists tasks_payment_income_trigger on public.tasks;
 create trigger tasks_payment_income_trigger
 after insert or update of paid_amount on public.tasks
 for each row execute function public.record_task_payment_income();

notify pgrst, 'reload schema';
