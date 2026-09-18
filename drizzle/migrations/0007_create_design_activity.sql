CREATE TABLE public.design_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design_id uuid REFERENCES public.designs(id) ON DELETE SET NULL,
  design_name text NOT NULL DEFAULT 'Untitled design',
  action text NOT NULL CHECK (action IN ('created','updated','renamed','duplicated','deleted','shared','unshared')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX design_activity_user_created_idx ON public.design_activity (user_id, created_at DESC);
CREATE INDEX design_activity_design_idx ON public.design_activity (design_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.design_activity TO authenticated;
GRANT ALL ON public.design_activity TO service_role;

ALTER TABLE public.design_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
  ON public.design_activity FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
  ON public.design_activity FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activity"
  ON public.design_activity FOR DELETE TO authenticated
  USING (auth.uid() = user_id);