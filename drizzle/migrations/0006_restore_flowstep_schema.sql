
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','gemini','openrouter','anthropic','nvidia','groq')),
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  label text,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can view their own api keys"
  ON public.user_api_keys FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can insert their own api keys"
  ON public.user_api_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can update their own api keys"
  ON public.user_api_keys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own api keys" ON public.user_api_keys;
CREATE POLICY "Users can delete their own api keys"
  ON public.user_api_keys FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_api_keys_updated_at ON public.user_api_keys;
CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.provider_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','gemini','openrouter','anthropic','nvidia','groq')),
  model text NOT NULL,
  source text NOT NULL DEFAULT 'design',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_usage_events_user_provider_idx
  ON public.provider_usage_events (user_id, provider, created_at DESC);

GRANT SELECT, INSERT ON public.provider_usage_events TO authenticated;
GRANT ALL ON public.provider_usage_events TO service_role;

ALTER TABLE public.provider_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own usage" ON public.provider_usage_events;
CREATE POLICY "Users can view their own usage"
  ON public.provider_usage_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own usage" ON public.provider_usage_events;
CREATE POLICY "Users can insert their own usage"
  ON public.provider_usage_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.designs (
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

CREATE INDEX IF NOT EXISTS designs_user_updated_idx ON public.designs (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS designs_share_token_idx ON public.designs (share_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.designs TO authenticated;
GRANT SELECT ON public.designs TO anon;
GRANT ALL ON public.designs TO service_role;

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own designs" ON public.designs;
CREATE POLICY "Users can read own designs"
  ON public.designs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read shared designs" ON public.designs;
CREATE POLICY "Anyone can read shared designs"
  ON public.designs FOR SELECT TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "Users can insert own designs" ON public.designs;
CREATE POLICY "Users can insert own designs"
  ON public.designs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own designs" ON public.designs;
CREATE POLICY "Users can update own designs"
  ON public.designs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own designs" ON public.designs;
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

DROP TRIGGER IF EXISTS designs_touch_updated_at ON public.designs;
CREATE TRIGGER designs_touch_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_designs_updated_at();
