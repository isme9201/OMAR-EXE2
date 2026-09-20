-- Avenmedia collaboration layer: chat <-> orders <-> upload rooms.
-- Run after the existing profiles, tasks, task_assignments, client_uploads and task_notifications migrations.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  archived_at timestamptz,
  blocked_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.media_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  upload_id uuid not null references public.client_uploads(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  include_order_details boolean not null default true,
  created_at timestamptz not null default now(),
  unique (conversation_id, upload_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id, conversation_id);
create index if not exists conversation_messages_conversation_idx on public.conversation_messages(conversation_id, created_at);
create index if not exists media_shares_conversation_idx on public.media_shares(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.media_shares enable row level security;

drop policy if exists conversations_member_read on public.conversations;
create policy conversations_member_read on public.conversations for select to authenticated
using (created_by = auth.uid() or exists (select 1 from public.conversation_members cm where cm.conversation_id = conversations.id and cm.user_id = auth.uid()));
drop policy if exists conversations_member_insert on public.conversations;
create policy conversations_member_insert on public.conversations for insert to authenticated
with check (created_by = auth.uid());
drop policy if exists conversations_owner_update on public.conversations;
create policy conversations_owner_update on public.conversations for update to authenticated
using (created_by = auth.uid() or public.is_task_manager()) with check (created_by = auth.uid() or public.is_task_manager());
drop policy if exists conversations_owner_delete on public.conversations;
create policy conversations_owner_delete on public.conversations for delete to authenticated
using (created_by = auth.uid() or public.is_task_manager());

drop policy if exists conversation_members_read on public.conversation_members;
create policy conversation_members_read on public.conversation_members for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()) or public.is_task_manager());
drop policy if exists conversation_members_write on public.conversation_members;
create policy conversation_members_write on public.conversation_members for all to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()) or public.is_task_manager())
with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()) or public.is_task_manager());
drop policy if exists conversation_members_self_update on public.conversation_members;
create policy conversation_members_self_update on public.conversation_members for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists conversation_messages_member_read on public.conversation_messages;
create policy conversation_messages_member_read on public.conversation_messages for select to authenticated
using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()) or public.is_task_manager());
drop policy if exists conversation_messages_member_insert on public.conversation_messages;
create policy conversation_messages_member_insert on public.conversation_messages for insert to authenticated
with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid() and cm.blocked_at is null));
drop policy if exists conversation_messages_sender_update on public.conversation_messages;
create policy conversation_messages_sender_update on public.conversation_messages for update to authenticated
using (sender_id = auth.uid() or public.is_task_manager()) with check (sender_id = auth.uid() or public.is_task_manager());

drop policy if exists media_shares_member_read on public.media_shares;
create policy media_shares_member_read on public.media_shares for select to authenticated
using (sender_id = auth.uid() or public.is_task_manager() or exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
drop policy if exists media_shares_member_write on public.media_shares;
create policy media_shares_member_write on public.media_shares for all to authenticated
using (sender_id = auth.uid() or public.is_task_manager()) with check (sender_id = auth.uid() or public.is_task_manager());

-- Existing task_notifications becomes the in-app and desktop notification feed.
do $$ begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversation_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.conversation_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.media_shares; exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
