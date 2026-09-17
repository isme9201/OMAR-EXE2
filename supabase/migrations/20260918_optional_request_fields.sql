-- Avenmedia: only client_name is required when creating a request.
-- Run this in Supabase SQL Editor.

alter table public.tasks
  alter column client_phone drop not null,
  alter column title drop not null,
  alter column task_type drop not null,
  alter column description drop not null,
  alter column status drop not null,
  alter column priority drop not null,
  alter column due_at drop not null,
  alter column estimated_cost drop not null,
  alter column requirements drop not null,
  alter column image_urls drop not null;

-- Keep safe defaults for fields the application may omit.
alter table public.tasks
  alter column status set default 'new',
  alter column priority set default 'normal',
  alter column task_type set default 'photography',
  alter column image_urls set default '{}';

-- Repair legacy rows before enforcing the only required field.
update public.tasks
set client_name = 'زبون غير مسمى'
where client_name is null or btrim(client_name) = '';

-- Only this field is required.
alter table public.tasks
  alter column client_name set not null;

notify pgrst, 'reload schema';
