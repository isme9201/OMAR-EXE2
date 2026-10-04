-- Public portfolio delivery: the editor remains write-protected by portfolio_can_edit(),
-- while published portfolio media is readable by the public site.
insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = true;

drop policy if exists portfolio_media_public_read on storage.objects;
create policy portfolio_media_public_read
on storage.objects for select
using (bucket_id = 'portfolio-media');

do $$ begin
  alter publication supabase_realtime add table public.portfolio_pages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.portfolio_elements;
exception when duplicate_object then null;
end $$;
