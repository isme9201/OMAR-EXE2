-- Keeps public upload history scoped to the unguessable 24-hour link token.
alter table public.client_uploads
  add column if not exists upload_token text;

create index if not exists client_uploads_upload_token_idx
  on public.client_uploads(upload_token);

notify pgrst, 'reload schema';
