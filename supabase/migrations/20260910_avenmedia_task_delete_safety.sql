-- Ensure task deletion is safe after assignments and client uploads exist.
alter table public.task_assignments drop constraint if exists task_assignments_task_id_fkey;
alter table public.task_assignments add constraint task_assignments_task_id_fkey foreign key (task_id) references public.tasks(id) on delete cascade;
alter table public.client_uploads drop constraint if exists client_uploads_task_id_fkey;
alter table public.client_uploads add constraint client_uploads_task_id_fkey foreign key (task_id) references public.tasks(id) on delete set null;
