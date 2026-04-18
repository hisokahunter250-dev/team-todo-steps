
-- fix search_path on tasks_touch_activity
CREATE OR REPLACE FUNCTION public.tasks_touch_activity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.is_completed, NEW.completed_by, NEW.completed_at, NEW.visibility)
     IS DISTINCT FROM
     (OLD.title, OLD.description, OLD.is_completed, OLD.completed_by, OLD.completed_at, OLD.visibility)
  THEN NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END; $$;

-- replace permissive task UPDATE policy
DROP POLICY IF EXISTS "tasks_update_authenticated" ON public.tasks;
CREATE POLICY "tasks_update_involved_or_admin" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
    OR visibility = 'shared'
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
    OR visibility = 'shared'
  );
