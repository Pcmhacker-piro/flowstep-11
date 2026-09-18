CREATE TABLE public.designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled design',
  prompt text NOT NULL DEFAULT '',
  model text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_html text,
  screen_count integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  share_token text UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX designs_user_updated_idx ON public.designs (user_id, updated_at DESC);
CREATE INDEX designs_share_token_idx ON public.designs (share_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.designs TO authenticated;
GRANT SELECT ON public.designs TO anon;
GRANT ALL ON public.designs TO service_role;

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own designs"
  ON public.designs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read shared designs"
  ON public.designs FOR SELECT TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Users can insert own designs"
  ON public.designs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own designs"
  ON public.designs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own designs"
  ON public.designs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_designs_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER designs_touch_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_designs_updated_at();