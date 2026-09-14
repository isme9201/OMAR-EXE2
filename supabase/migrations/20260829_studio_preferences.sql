create table if not exists public.studio_preferences (
  actor_email text primary key,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

alter table public.studio_preferences enable row level security;

drop policy if exists "studio preferences self read" on public.studio_preferences;
drop policy if exists "studio preferences self write" on public.studio_preferences;

create policy "studio preferences self read"
  on public.studio_preferences for select
  using ((auth.jwt() ->> 'email') = actor_email);

create policy "studio preferences self write"
  on public.studio_preferences for all
  using ((auth.jwt() ->> 'email') = actor_email)
  with check ((auth.jwt() ->> 'email') = actor_email);
