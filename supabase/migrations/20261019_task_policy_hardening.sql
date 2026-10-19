-- Close remaining permissive legacy policies after per-assignee task visibility was introduced.
-- This is a live/shared database migration; keep it in source control and apply only after approval.

-- Read access to profile details is limited to the profile owner and task managers.
DROP POLICY IF EXISTS "Employees read profiles" ON public.profiles;
DROP POLICY IF EXISTS avenmedia_profiles_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_or_manager_read ON public.profiles;
CREATE POLICY profiles_self_or_manager_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR public.is_task_manager()
  );

-- Remove creator/self-write variants from older RLS repairs.
DROP POLICY IF EXISTS avenmedia_tasks_insert ON public.tasks;
DROP POLICY IF EXISTS avenmedia_tasks_update ON public.tasks;
DROP POLICY IF EXISTS avenmedia_tasks_delete ON public.tasks;
DROP POLICY IF EXISTS tasks_manager_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_manager_update ON public.tasks;
DROP POLICY IF EXISTS tasks_manager_delete ON public.tasks;
CREATE POLICY tasks_manager_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_task_manager() AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY tasks_manager_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_task_manager())
  WITH CHECK (public.is_task_manager());
CREATE POLICY tasks_manager_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_task_manager());

-- Keep the legacy direct-message fallback narrowly scoped to the sender's own chat task.
DROP POLICY IF EXISTS tasks_chat_message_insert ON public.tasks;
CREATE POLICY tasks_chat_message_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (task_type = 'chat' AND created_by = auth.uid() AND client_name IS NOT NULL);

-- Managers alone can edit assignments. Chat's fallback may create only the recipient assignment
-- explicitly encoded in the sender-owned chat task; it cannot assign another employee to a task.
DROP POLICY IF EXISTS avenmedia_assignments_write ON public.task_assignments;
DROP POLICY IF EXISTS task_assignments_manager_write ON public.task_assignments;
DROP POLICY IF EXISTS task_assignments_manager_insert ON public.task_assignments;
DROP POLICY IF EXISTS task_assignments_manager_update ON public.task_assignments;
DROP POLICY IF EXISTS task_assignments_manager_delete ON public.task_assignments;
CREATE POLICY task_assignments_manager_write ON public.task_assignments
  FOR ALL TO authenticated
  USING (public.is_task_manager())
  WITH CHECK (public.is_task_manager());
DROP POLICY IF EXISTS task_assignments_chat_recipient_insert ON public.task_assignments;
CREATE POLICY task_assignments_chat_recipient_insert ON public.task_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks AS t
      WHERE t.id = task_id
        AND t.task_type = 'chat'
        AND t.created_by = auth.uid()
        AND t.client_name = employee_id::text
    )
  );

-- A signed-in user may insert only their own upload record; managers control updates and deletion.
DROP POLICY IF EXISTS avenmedia_uploads_write ON public.client_uploads;
DROP POLICY IF EXISTS client_uploads_authenticated_insert ON public.client_uploads;
CREATE POLICY client_uploads_authenticated_insert ON public.client_uploads
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() OR public.is_task_manager());
DROP POLICY IF EXISTS client_uploads_manager_update ON public.client_uploads;
CREATE POLICY client_uploads_manager_update ON public.client_uploads
  FOR UPDATE TO authenticated
  USING (public.is_task_manager() OR uploaded_by = auth.uid())
  WITH CHECK (public.is_task_manager() OR uploaded_by = auth.uid());
DROP POLICY IF EXISTS client_uploads_manager_delete ON public.client_uploads;
CREATE POLICY client_uploads_manager_delete ON public.client_uploads
  FOR DELETE TO authenticated
  USING (public.is_task_manager());

-- Chat now reads the team through list_active_team(), a scoped SECURITY DEFINER RPC.
NOTIFY pgrst, 'reload schema';

-- list_active_team returns team contact records through a SECURITY DEFINER RPC; authenticated staff only.
REVOKE ALL ON FUNCTION public.list_active_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_team() TO authenticated;
