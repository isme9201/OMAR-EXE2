-- Avenmedia direct-chat upgrade. All changes are additive; existing task and upload records remain untouched.

alter table public.conversation_messages
  alter column body set default '',
  add column if not exists message_type text not null default 'text',
  add column if not exists attachment_url text,
  add column if not exists attachment_public_id text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists attachment_resource_type text,
  add column if not exists attachment_format text,
  add column if not exists attachment_duration_seconds numeric(12,3),
  add column if not exists client_message_id uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists reply_to_message_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_type_check' AND conrelid = 'public.conversation_messages'::regclass) THEN
    ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_type_check
      CHECK (message_type IN ('text', 'image', 'video', 'pdf', 'file', 'voice'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_attachment_size_check' AND conrelid = 'public.conversation_messages'::regclass) THEN
    ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_attachment_size_check
      CHECK (attachment_size_bytes IS NULL OR attachment_size_bytes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_reply_fk' AND conrelid = 'public.conversation_messages'::regclass) THEN
    ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_reply_fk
      FOREIGN KEY (reply_to_message_id) REFERENCES public.conversation_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_client_id_idx
  ON public.conversation_messages(sender_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversation_messages_unread_idx
  ON public.conversation_messages(conversation_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.conversation_preferences (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  muted_permanently boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.conversation_message_bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_message_pins (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.conversation_messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.direct_conversation_pairs (
  user_one uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_two uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_one, user_two),
  CHECK (user_one < user_two)
);

WITH candidates AS (
  SELECT c.id AS conversation_id, c.created_at,
    (array_agg(cm.user_id ORDER BY cm.user_id))[1] AS user_one,
    (array_agg(cm.user_id ORDER BY cm.user_id))[2] AS user_two
  FROM public.conversations c
  JOIN public.conversation_members cm ON cm.conversation_id = c.id
  GROUP BY c.id, c.created_at
  HAVING COUNT(DISTINCT cm.user_id) = 2
), ranked AS (
  SELECT candidates.*, ROW_NUMBER() OVER (PARTITION BY user_one, user_two ORDER BY created_at, conversation_id) AS pair_rank
  FROM candidates
)
INSERT INTO public.direct_conversation_pairs (user_one, user_two, conversation_id)
SELECT user_one, user_two, conversation_id FROM ranked WHERE pair_rank = 1
ON CONFLICT (user_one, user_two) DO NOTHING;

ALTER TABLE public.conversation_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversation_pairs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.list_active_team()
RETURNS TABLE (id uuid, name text, email text, role text, specialty text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p.id, p.name, p.email, p.role, p.specialty, p.is_active
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND coalesce(p.is_active, true)
  ORDER BY p.name;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_one uuid;
  v_user_two uuid;
  v_conversation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_user_id THEN RAISE EXCEPTION 'Choose another active team member'; END IF;
  IF (SELECT count(*) FROM public.profiles p WHERE p.id IN (v_user_id, p_other_user_id) AND coalesce(p.is_active, true)) <> 2 THEN
    RAISE EXCEPTION 'One or both team members are inactive';
  END IF;
  v_user_one := least(v_user_id, p_other_user_id);
  v_user_two := greatest(v_user_id, p_other_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_one::text || ':' || v_user_two::text, 0));
  SELECT pair.conversation_id INTO v_conversation_id
  FROM public.direct_conversation_pairs pair
  WHERE pair.user_one = v_user_one AND pair.user_two = v_user_two;
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (title, created_by) VALUES ('محادثة مباشرة', v_user_id)
      RETURNING id INTO v_conversation_id;
    INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_conversation_id, v_user_id), (v_conversation_id, p_other_user_id);
    INSERT INTO public.direct_conversation_pairs (user_one, user_two, conversation_id)
      VALUES (v_user_one, v_user_two, v_conversation_id);
  END IF;
  UPDATE public.conversation_members SET archived_at = NULL
    WHERE conversation_id = v_conversation_id AND user_id = v_user_id;
  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_conversation_message(p_message_id uuid, p_body text)
RETURNS public.conversation_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE v_message public.conversation_messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR length(trim(coalesce(p_body, ''))) = 0 OR char_length(p_body) > 5000 THEN
    RAISE EXCEPTION 'Message text is invalid';
  END IF;
  UPDATE public.conversation_messages
    SET body = trim(p_body), edited_at = now()
    WHERE id = p_message_id AND sender_id = auth.uid() AND deleted_at IS NULL
      AND public.is_conversation_member(conversation_id)
    RETURNING * INTO v_message;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found or not editable'; END IF;
  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_conversation_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.conversation_messages SET deleted_at = now()
    WHERE id = p_message_id AND sender_id = auth.uid() AND deleted_at IS NULL
      AND public.is_conversation_member(conversation_id);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not a conversation member'; END IF;
  UPDATE public.conversation_messages
    SET read_at = now()
    WHERE conversation_id = p_conversation_id AND sender_id <> auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS conversation_message_touch ON public.conversation_messages;
CREATE TRIGGER conversation_message_touch AFTER INSERT ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- Use a narrow, authenticated directory RPC instead of exposing every profiles row through RLS.
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_active_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_conversation_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_conversation_message(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_conversation_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_conversation_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

REVOKE ALL ON public.direct_conversation_pairs FROM anon, authenticated;
REVOKE ALL ON public.conversations, public.conversation_members, public.conversation_messages, public.media_shares,
  public.conversation_preferences, public.conversation_message_reactions, public.conversation_message_bookmarks,
  public.conversation_message_pins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM authenticated;
GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.conversation_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_preferences TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversation_message_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversation_message_bookmarks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversation_message_pins TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_members FROM authenticated;
GRANT SELECT, UPDATE (archived_at) ON public.conversation_members TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.media_shares FROM authenticated;
GRANT SELECT, INSERT ON public.media_shares TO authenticated;

DROP POLICY IF EXISTS conversation_members_write ON public.conversation_members;
DROP POLICY IF EXISTS conversations_member_read ON public.conversations;
CREATE POLICY conversations_member_read ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS conversation_members_read ON public.conversation_members;
CREATE POLICY conversation_members_read ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS conversation_messages_member_read ON public.conversation_messages;
CREATE POLICY conversation_messages_member_read ON public.conversation_messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_messages_member_insert ON public.conversation_messages;
CREATE POLICY conversation_messages_member_insert ON public.conversation_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members self_member
      WHERE self_member.conversation_id = conversation_messages.conversation_id
        AND self_member.user_id = auth.uid() AND self_member.blocked_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_members other_member
      WHERE other_member.conversation_id = conversation_messages.conversation_id
        AND other_member.user_id <> auth.uid() AND other_member.blocked_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS conversation_preferences_read ON public.conversation_preferences;
CREATE POLICY conversation_preferences_read ON public.conversation_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_preferences_insert ON public.conversation_preferences;
CREATE POLICY conversation_preferences_insert ON public.conversation_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_preferences_update ON public.conversation_preferences;
CREATE POLICY conversation_preferences_update ON public.conversation_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id))
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_preferences_delete ON public.conversation_preferences;
CREATE POLICY conversation_preferences_delete ON public.conversation_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS conversation_reactions_read ON public.conversation_message_reactions;
CREATE POLICY conversation_reactions_read ON public.conversation_message_reactions FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_reactions_insert ON public.conversation_message_reactions;
CREATE POLICY conversation_reactions_insert ON public.conversation_message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id) AND EXISTS (
    SELECT 1 FROM public.conversation_messages m WHERE m.id = conversation_message_reactions.message_id AND m.conversation_id = conversation_message_reactions.conversation_id AND m.deleted_at IS NULL
  ));
DROP POLICY IF EXISTS conversation_reactions_delete ON public.conversation_message_reactions;
CREATE POLICY conversation_reactions_delete ON public.conversation_message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS conversation_bookmarks_read ON public.conversation_message_bookmarks;
CREATE POLICY conversation_bookmarks_read ON public.conversation_message_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversation_messages m WHERE m.id = conversation_message_bookmarks.message_id AND public.is_conversation_member(m.conversation_id)
  ));
DROP POLICY IF EXISTS conversation_bookmarks_insert ON public.conversation_message_bookmarks;
CREATE POLICY conversation_bookmarks_insert ON public.conversation_message_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversation_messages m WHERE m.id = conversation_message_bookmarks.message_id AND public.is_conversation_member(m.conversation_id)
  ));
DROP POLICY IF EXISTS conversation_bookmarks_delete ON public.conversation_message_bookmarks;
CREATE POLICY conversation_bookmarks_delete ON public.conversation_message_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS conversation_pins_read ON public.conversation_message_pins;
CREATE POLICY conversation_pins_read ON public.conversation_message_pins FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS conversation_pins_insert ON public.conversation_message_pins;
CREATE POLICY conversation_pins_insert ON public.conversation_message_pins FOR INSERT TO authenticated
  WITH CHECK (pinned_by = auth.uid() AND public.is_conversation_member(conversation_id) AND EXISTS (
    SELECT 1 FROM public.conversation_messages m WHERE m.id = conversation_message_pins.message_id AND m.conversation_id = conversation_message_pins.conversation_id
  ));
DROP POLICY IF EXISTS conversation_pins_delete ON public.conversation_message_pins;
CREATE POLICY conversation_pins_delete ON public.conversation_message_pins FOR DELETE TO authenticated
  USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS media_shares_member_read ON public.media_shares;
CREATE POLICY media_shares_member_read ON public.media_shares FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS media_shares_member_write ON public.media_shares;
DROP POLICY IF EXISTS media_shares_member_insert ON public.media_shares;
CREATE POLICY media_shares_member_insert ON public.media_shares FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS client_uploads_shared_chat_read ON public.client_uploads;
CREATE POLICY client_uploads_shared_chat_read ON public.client_uploads FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.media_shares shared
    WHERE shared.upload_id = client_uploads.id AND public.is_conversation_member(shared.conversation_id)
  ));

ALTER TABLE public.conversation_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_preferences REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_message_bookmarks REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_message_pins REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_preferences; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_message_reactions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_message_bookmarks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_message_pins; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- Additional hardening for attachment metadata and idempotent direct messages.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_attachment_url_check' AND conrelid = 'public.conversation_messages'::regclass) THEN
    ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_attachment_url_check
      CHECK (attachment_url IS NULL OR attachment_url ~ '^https://');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_body_length_check' AND conrelid = 'public.conversation_messages'::regclass) THEN
    ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_body_length_check
      CHECK (char_length(body) <= 5000);
  END IF;
END $$;

-- Presence and typing use Supabase Realtime channel presence/broadcast; no message table is
-- needed, so ephemeral status never becomes a discoverable profile or message record.
REVOKE ALL ON public.direct_conversation_pairs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_active_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
