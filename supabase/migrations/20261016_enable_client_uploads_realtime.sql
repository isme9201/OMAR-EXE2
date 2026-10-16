-- Keep the upload room live after a fresh Supabase deployment.
do $$ begin
  alter publication supabase_realtime add table public.client_uploads;
exception when duplicate_object then null;
end $$;
