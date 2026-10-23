-- Restore the per-assignee visibility column required by the task UI and APIs.
-- Additive only: existing assignments receive the safe default non-financial fields.
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS visible_fields text[] NOT NULL
  DEFAULT ARRAY['client_name','description','requirements','due_at','attachments']::text[];

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

COMMENT ON COLUMN public.task_assignments.visible_fields IS
  'Admin-configured allowlist of task fields visible to this assignee.';

NOTIFY pgrst, 'reload schema';
