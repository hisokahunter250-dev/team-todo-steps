-- Allow any authenticated user to update step done state (team workflow)
DROP POLICY IF EXISTS steps_update_own_or_admin ON public.task_steps;
CREATE POLICY steps_update_authenticated ON public.task_steps
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Function to reset a monthly task
CREATE OR REPLACE FUNCTION public.reset_monthly_task(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_steps SET is_done = false WHERE task_id = _task_id;
  UPDATE public.tasks
    SET is_completed = false,
        completed_by = NULL,
        completed_at = NULL,
        last_reset_at = now(),
        last_activity_at = now()
    WHERE id = _task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_monthly_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_monthly_task(uuid) TO authenticated;