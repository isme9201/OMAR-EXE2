create table if not exists public.equipment_requests (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public.profiles(id) on delete cascade,
 request_text text not null,
 status text not null default 'open' check (status in ('open','done','archived','deleted')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists equipment_requests_status_idx on public.equipment_requests(status,created_at desc);
alter table public.equipment_requests enable row level security;
drop policy if exists equipment_requests_read on public.equipment_requests;
create policy equipment_requests_read on public.equipment_requests for select to authenticated using (requester_id=auth.uid() or public.is_task_manager());
drop policy if exists equipment_requests_insert on public.equipment_requests;
create policy equipment_requests_insert on public.equipment_requests for insert to authenticated with check (requester_id=auth.uid());
drop policy if exists equipment_requests_manager_update on public.equipment_requests;
create policy equipment_requests_manager_update on public.equipment_requests for update to authenticated using (public.is_task_manager()) with check (public.is_task_manager());
grant select,insert,update on public.equipment_requests to authenticated;
do $$ begin alter publication supabase_realtime add table public.equipment_requests; exception when duplicate_object then null; end $$;
notify pgrst,'reload schema';
