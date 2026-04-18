
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.task_visibility AS ENUM ('shared', 'assigned');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  visibility task_visibility NOT NULL DEFAULT 'shared',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ============ TASK ASSIGNEES ============
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- ============ TASK STEPS ============
CREATE TABLE public.task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  done_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;

-- ============ TASK COMMENTS ============
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- ============ AUTO-UPDATE last_activity_at ============
CREATE OR REPLACE FUNCTION public.touch_task_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN _task_id := OLD.task_id; ELSE _task_id := NEW.task_id; END IF;
  UPDATE public.tasks SET last_activity_at = now() WHERE id = _task_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

CREATE TRIGGER trg_steps_touch AFTER INSERT OR UPDATE OR DELETE ON public.task_steps
  FOR EACH ROW EXECUTE FUNCTION public.touch_task_activity();
CREATE TRIGGER trg_comments_touch AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_task_activity();

-- update tasks.last_activity_at whenever the task itself is updated (except last_activity_at)
CREATE OR REPLACE FUNCTION public.tasks_touch_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.is_completed, NEW.completed_by, NEW.completed_at, NEW.visibility)
     IS DISTINCT FROM
     (OLD.title, OLD.description, OLD.is_completed, OLD.completed_by, OLD.completed_at, OLD.visibility)
  THEN NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_touch_activity();

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'display_name',
             NEW.raw_user_meta_data ->> 'username',
             split_part(NEW.email, '@', 1))
  );
  -- assign default 'user' role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles: any authenticated user can read; only admin can modify (besides self display_name)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: authenticated can read all; only admin can modify
CREATE POLICY "roles_select_authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- tasks: any authenticated can read all
CREATE POLICY "tasks_select_authenticated" ON public.tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert_authenticated" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "tasks_update_authenticated" ON public.tasks
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tasks_delete_creator_or_admin" ON public.tasks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- task_assignees: read all; create/delete by creator of task or admin
CREATE POLICY "assignees_select_authenticated" ON public.task_assignees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignees_modify_creator_or_admin" ON public.task_assignees
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  );

-- task_steps: read all; insert by self; update/delete own or admin
CREATE POLICY "steps_select_authenticated" ON public.task_steps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "steps_insert_self" ON public.task_steps
  FOR INSERT TO authenticated WITH CHECK (done_by = auth.uid());
CREATE POLICY "steps_update_own_or_admin" ON public.task_steps
  FOR UPDATE TO authenticated
  USING (done_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "steps_delete_own_or_admin" ON public.task_steps
  FOR DELETE TO authenticated
  USING (done_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- task_comments: same pattern
CREATE POLICY "comments_select_authenticated" ON public.task_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert_self" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_update_own_or_admin" ON public.task_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "comments_delete_own_or_admin" ON public.task_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- indexes
CREATE INDEX idx_tasks_last_activity ON public.tasks(last_activity_at DESC);
CREATE INDEX idx_steps_task ON public.task_steps(task_id);
CREATE INDEX idx_comments_task ON public.task_comments(task_id);
CREATE INDEX idx_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_assignees_user ON public.task_assignees(user_id);
