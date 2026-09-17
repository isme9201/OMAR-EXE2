-- Avenmedia overdue register, task notifications, status updates, and archive/restore.
create extension if not exists pgcrypto;

alter table public.tasks add column if not exists archived_at timestamptz;
alter table public.tasks add column if not exists completed_at timestamptz;

create table if not exists public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  notification_type text not null default 'assigned',
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists task_notifications_recipient_idx on public.task_notifications(recipient_id, read_at, created_at desc);
create index if not exists tasks_overdue_idx on public.tasks(due_at, status, archived_at);

create or replace function public.notify_task_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare task_title text;
begin
  select title into task_title from public.tasks where id = new.task_id;
  insert into public.task_notifications(recipient_id, task_id, notification_type, title, body)
  values (new.employee_id, new.task_id, 'assigned', 'تم إسناد مهمة جديدة إليك', coalesce(task_title, 'مهمة جديدة'));
  return new;
end;
$$;
drop trigger if exists task_assignment_notification on public.task_assignments;
create trigger task_assignment_notification after insert on public.task_assignments for each row execute function public.notify_task_assignee();

create or replace function public.update_task_status(p_task_id uuid, p_status text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare result public.tasks;
begin
  if not (public.is_task_manager() or exists (select 1 from public.task_assignments where task_id = p_task_id and employee_id = auth.uid())) then
    raise exception 'ليس لديك صلاحية تعديل هذه المهمة';
  end if;
  update public.tasks set status = p_status, completed_at = case when p_status in ('completed','done') then now() else null end, archived_at = case when p_status in ('completed','done') then now() else null end, updated_at = now() where id = p_task_id returning * into result;
  return result;
end;
$$;
grant execute on function public.update_task_status(uuid,text) to authenticated;

create or replace view public.avenmedia_overdue_tasks as
select t.id, t.title, t.client_name, t.estimated_cost, t.due_at, t.status, t.archived_at,
  greatest(0, floor(extract(epoch from (now() - t.due_at))/86400))::int as overdue_days,
  coalesce(string_agg(distinct p.name, ', ' order by p.name), 'غير مسند') as assignees
from public.tasks t
left join public.task_assignments ta on ta.task_id = t.id
left join public.profiles p on p.id = ta.employee_id
where t.due_at is not null and t.due_at < now() and t.status not in ('completed','done','cancelled') and t.archived_at is null
group by t.id;
revoke all on public.avenmedia_overdue_tasks from anon;
grant select on public.avenmedia_overdue_tasks to authenticated;

alter table public.task_notifications enable row level security;
drop policy if exists task_notifications_self_read on public.task_notifications;
create policy task_notifications_self_read on public.task_notifications for select to authenticated using (recipient_id = auth.uid() or public.is_task_manager());
drop policy if exists task_notifications_self_update on public.task_notifications;
create policy task_notifications_self_update on public.task_notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
grant select, update on public.task_notifications to authenticated;

do $$ begin alter publication supabase_realtime add table public.task_notifications; exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
