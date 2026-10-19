-- Compatibility for older clients that read created_at.
alter table public.client_uploads
  add column if not exists created_at timestamptz not null default now();

update public.client_uploads
set created_at = uploaded_at
where uploaded_at is not null;

create index if not exists client_uploads_created_at_idx
  on public.client_uploads(created_at desc);

notify pgrst, 'reload schema';
