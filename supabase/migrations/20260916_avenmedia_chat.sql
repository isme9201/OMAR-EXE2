-- Avenmedia chat uses the existing tasks table as durable message envelopes and client_uploads as file attachments.
-- The Edge Function writes with service-role after verifying the caller's Supabase JWT.

alter table public.tasks enable row level security;
alter table public.client_uploads enable row level security;
alter table public.task_assignments enable row level security;

create index if not exists tasks_chat_created_at_idx on public.tasks(task_type, created_at);
create index if not exists client_uploads_task_uploaded_at_idx on public.client_uploads(task_id, uploaded_at);

-- Chat participants can read their own messages and messages assigned to them.
drop policy if exists avenmedia_chat_read on public.tasks;
create policy avenmedia_chat_read on public.tasks
  for select to authenticated
  using (
    task_type = 'chat'
    and (
      created_by = auth.uid()
      or exists (select 1 from public.task_assignments a where a.task_id = tasks.id and a.employee_id = auth.uid())
    )
  );

drop policy if exists avenmedia_chat_upload_read on public.client_uploads;
create policy avenmedia_chat_upload_read on public.client_uploads
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from public.task_assignments a where a.task_id = client_uploads.task_id and a.employee_id = auth.uid())
    or exists (select 1 from public.tasks t where t.id = client_uploads.task_id and t.created_by = auth.uid())
  );

-- Safe for repeated deployment; Supabase Realtime ignores already-added tables.
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.client_uploads;
exception when duplicate_object then null;
end $$;
