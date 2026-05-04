-- Add is_done flag to task steps for checkbox tracking
ALTER TABLE public.task_steps 
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false;

-- Add monthly recurrence flag to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_monthly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reset_at timestamp with time zone;