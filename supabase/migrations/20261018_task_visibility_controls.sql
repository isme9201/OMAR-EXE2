-- Per-assignee task visibility controls. This migration is additive; it does not delete task data.
-- Review and explicitly approve before applying because the Supabase database is live/shared.

ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS visible_fields text[] NOT NULL
  DEFAULT ARRAY['client_name','description','requirements','due_at','attachments']::text[];

-- Keep values within the supported field allowlist if this migration is being reapplied
-- after a partial/manual rollout.
UPDATE public.task_assignments AS a
SET visible_fields = COALESCE(
  (
    SELECT array_agg(v.field ORDER BY v.field)
    FROM (
      SELECT DISTINCT field
      FROM unnest(COALESCE(a.visible_fields, ARRAY[]::text[])) AS item(field)
      WHERE field = ANY (ARRAY['client_name','client_phone','description','requirements','due_at','attachments','finance']::text[])
    ) AS v
  ),
  ARRAY[]::text[]
)
WHERE a.visible_fields IS NULL
   OR EXISTS (
     SELECT 1
     FROM unnest(COALESCE(a.visible_fields, ARRAY[]::text[])) AS item(field)
     WHERE field <> ALL (ARRAY['client_name','client_phone','description','requirements','due_at','attachments','finance']::text[])
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'task_assignments_visible_fields_allowlist'
      AND conrelid = 'public.task_assignments'::regclass
  ) THEN
    ALTER TABLE public.task_assignments
      ADD CONSTRAINT task_assignments_visible_fields_allowlist
      CHECK (visible_fields <@ ARRAY['client_name','client_phone','description','requirements','due_at','attachments','finance']::text[]);
  END IF;
END
$$;

-- Remove legacy policies that made every task or assignment readable to every signed-in user.
DROP POLICY IF EXISTS "Employees read tasks" ON public.tasks;
DROP POLICY IF EXISTS tasks_visible_to_team ON public.tasks;
DROP POLICY IF EXISTS avenmedia_tasks_read ON public.tasks;
DROP POLICY IF EXISTS "Employees read assignments" ON public.task_assignments;
DROP POLICY IF EXISTS task_assignments_visible_to_team ON public.task_assignments;
DROP POLICY IF EXISTS avenmedia_assignments_read ON public.task_assignments;
DROP POLICY IF EXISTS client_uploads_visible_to_team ON public.client_uploads;
DROP POLICY IF EXISTS avenmedia_uploads_read ON public.client_uploads;

-- Managers can see all tasks. Other users can only read direct-chat messages they sent or received.
CREATE POLICY tasks_visible_to_team ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_task_manager()
    OR (
      task_type = 'chat'
      AND (created_by = auth.uid() OR client_name = auth.uid()::text)
    )
  );

-- Assignment details are private to the assignee and task managers.
CREATE POLICY task_assignments_visible_to_team ON public.task_assignments
  FOR SELECT TO authenticated
  USING (public.is_task_manager() OR employee_id = auth.uid());

-- A task's file records are visible to managers or assignees whose settings allow attachments.
-- Explicit media shares remain covered by the existing client_uploads_shared_chat_read policy.
CREATE POLICY client_uploads_visible_to_team ON public.client_uploads
  FOR SELECT TO authenticated
  USING (
    public.is_task_manager()
    OR (
      task_id IS NULL
      AND uploaded_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.task_assignments AS a
      WHERE a.task_id = client_uploads.task_id
        AND a.employee_id = auth.uid()
        AND a.visible_fields @> ARRAY['attachments']::text[]
    )
  );

-- A narrowly scoped RPC returns only the fields a non-manager is allowed to view.
DROP FUNCTION IF EXISTS public.get_current_user_tasks(text);
CREATE FUNCTION public.get_current_user_tasks(p_query text DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_manager boolean := public.is_task_manager();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'task_type', t.task_type,
    'status', t.status,
    'priority', t.priority,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'client_name', CASE WHEN v_manager OR 'client_name' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.client_name ELSE NULL END,
    'client_phone', CASE WHEN v_manager OR 'client_phone' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.client_phone ELSE NULL END,
    'description', CASE WHEN v_manager OR 'description' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.description ELSE NULL END,
    'requirements', CASE WHEN v_manager OR 'requirements' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.requirements ELSE NULL END,
    'due_at', CASE WHEN v_manager OR 'due_at' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.due_at ELSE NULL END,
    'estimated_cost', CASE WHEN v_manager OR 'finance' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.estimated_cost ELSE NULL END,
    'payment_type', CASE WHEN v_manager OR 'finance' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.payment_type ELSE NULL END,
    'paid_amount', CASE WHEN v_manager OR 'finance' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.paid_amount ELSE NULL END,
    'payment_method', CASE WHEN v_manager OR 'finance' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.payment_method ELSE NULL END,
    'payment_note', CASE WHEN v_manager OR 'finance' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN t.payment_note ELSE NULL END,
    'image_urls', CASE
      WHEN v_manager OR 'attachments' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN COALESCE(to_jsonb(t.image_urls), '[]'::jsonb)
      ELSE '[]'::jsonb
    END,
    'visible_fields', CASE
      WHEN v_manager THEN to_jsonb(ARRAY['client_name','client_phone','description','requirements','due_at','attachments','finance']::text[])
      ELSE to_jsonb(COALESCE(mine.visible_fields, ARRAY[]::text[]))
    END,
    'attachments', CASE
      WHEN v_manager OR 'attachments' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[])) THEN (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object(
            'id', u.id,
            'file_name', u.file_name,
            'secure_url', COALESCE(u.secure_url, u.file_url),
            'resource_type', u.resource_type,
            'format', u.format
          ) ORDER BY u.uploaded_at DESC),
          '[]'::jsonb
        )
        FROM public.client_uploads AS u
        WHERE u.task_id = t.id
      )
      ELSE '[]'::jsonb
    END,
    'assignments', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
          'employee_id', ta.employee_id,
          'visible_fields', to_jsonb(ta.visible_fields),
          'profile', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty) END
        ) ORDER BY p.name NULLS LAST),
        '[]'::jsonb
      )
      FROM public.task_assignments AS ta
      LEFT JOIN public.profiles AS p ON p.id = ta.employee_id
      WHERE ta.task_id = t.id
        AND (v_manager OR ta.employee_id = v_user_id)
    )
  )
  FROM public.tasks AS t
  LEFT JOIN LATERAL (
    SELECT a.visible_fields
    FROM public.task_assignments AS a
    WHERE a.task_id = t.id AND a.employee_id = v_user_id
    LIMIT 1
  ) AS mine ON true
  WHERE t.task_type IS DISTINCT FROM 'chat'
    AND (v_manager OR mine.visible_fields IS NOT NULL)
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR t.title ILIKE '%' || BTRIM(p_query) || '%'
      OR ((v_manager OR 'client_name' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[]))) AND COALESCE(t.client_name, '') ILIKE '%' || BTRIM(p_query) || '%')
      OR ((v_manager OR 'client_phone' = ANY(COALESCE(mine.visible_fields, ARRAY[]::text[]))) AND COALESCE(t.client_phone, '') ILIKE '%' || BTRIM(p_query) || '%')
    )
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_tasks(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_tasks(text) TO authenticated;

-- Keep task-status updates but return only non-sensitive status fields instead of the full task row.
DROP FUNCTION IF EXISTS public.update_task_status(uuid, text);
CREATE FUNCTION public.update_task_status(p_task_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_task public.tasks;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً';
  END IF;
  IF NOT (public.is_task_manager() OR EXISTS (
    SELECT 1 FROM public.task_assignments AS a
    WHERE a.task_id = p_task_id AND a.employee_id = v_user_id
  )) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل هذه المهمة';
  END IF;

  UPDATE public.tasks
  SET status = p_status,
      completed_at = CASE WHEN p_status IN ('completed','done') THEN now() ELSE NULL END,
      archived_at = CASE WHEN p_status IN ('completed','done') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المهمة غير موجودة';
  END IF;

  RETURN jsonb_build_object('id', v_task.id, 'status', v_task.status);
END;
$$;
REVOKE ALL ON FUNCTION public.update_task_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_task_status(uuid, text) TO authenticated;

-- The overdue view must obey the underlying task/profile RLS policies for each caller.
ALTER VIEW IF EXISTS public.avenmedia_overdue_tasks SET (security_invoker = true);
GRANT SELECT ON public.avenmedia_overdue_tasks TO authenticated;

NOTIFY pgrst, 'reload schema';
