-- Keep message mutations behind membership-checked security-definer RPCs.
DROP POLICY IF EXISTS conversation_messages_sender_update ON public.conversation_messages;
REVOKE UPDATE, DELETE ON public.conversation_messages FROM authenticated;

-- Trigger functions are invoked by the database trigger and are not callable as exposed RPCs.
REVOKE ALL ON FUNCTION public.touch_conversation_on_message() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
