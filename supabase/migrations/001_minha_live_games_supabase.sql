-- ==============================================================================
-- MINHA LIVE GAMES — Supabase PostgreSQL Schema, Triggers & Row Level Security
-- Script 100% idempotente: preserva todas as contas (inclusive ADM) e jogos.
-- Execute no Supabase Dashboard -> SQL Editor.
-- ==============================================================================

-- 1. Tabela de perfis de usuários vinculada permanentemente ao Supabase Auth
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  avatar_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS users_username_idx ON public.users (lower(username));

-- 2. Tabela de jogos e bundles de overlay
CREATE TABLE IF NOT EXISTS public.games (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  engine TEXT NOT NULL,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  cover_image TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  bundle_html TEXT NOT NULL,
  file_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  overlay_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_user_id_idx ON public.games (user_id);
CREATE INDEX IF NOT EXISTS games_is_active_idx ON public.games (is_active);

-- 3. Lista pessoal "Meus Jogos"
CREATE TABLE IF NOT EXISTS public.user_saved_games (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

-- 4. Regras de automação LIVE
CREATE TABLE IF NOT EXISTS public.event_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'all',
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_type TEXT NOT NULL,
  operator TEXT NOT NULL,
  condition_value TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  action_command TEXT NOT NULL,
  action_payload TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_rules_user_id_idx ON public.event_rules (user_id);
CREATE INDEX IF NOT EXISTS event_rules_game_id_idx ON public.event_rules (game_id);

-- 5. Histórico e fila em tempo real de eventos LIVE (inclui entrega para OBS Overlay)
CREATE TABLE IF NOT EXISTS public.live_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  gift_name TEXT,
  gift_count INTEGER,
  comment_text TEXT,
  like_count INTEGER,
  points INTEGER,
  bonus_multiplier DOUBLE PRECISION,
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  matched_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_events_game_created_idx ON public.live_events (game_id, created_at);
CREATE INDEX IF NOT EXISTS live_events_user_created_idx ON public.live_events (user_id, created_at);

-- 6. Histórico de assinaturas e planos
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);

-- 7. Configurações globais da plataforma
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  default_watermark_text TEXT NOT NULL DEFAULT 'MINHA LIVE GAMES',
  max_upload_size_mb INTEGER NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_settings (id, registration_enabled, maintenance_mode, default_watermark_text, max_upload_size_mb)
VALUES (1, TRUE, FALSE, 'MINHA LIVE GAMES', 25)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- FUNÇÕES E TRIGGERS DE PROTEÇÃO (PRESERVAÇÃO DE ADM & ANTI-ESCALADA DE PRIVILÉGIO)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()::text
      AND u.role = 'admin'
      AND u.status = 'active'
  );
$$;

-- Bloqueia que usuários autenticados alterem role, plan ou status pelo navegador via PostgREST
CREATE OR REPLACE FUNCTION public.protect_user_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Alteração de permissão, plano ou status só é permitida pelo servidor autorizado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_sensitive_columns ON public.users;
CREATE TRIGGER trg_protect_user_sensitive_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_sensitive_columns();

-- Sincroniza novos cadastros criados direto no Supabase Auth sem nunca apagar/sobrescrever ADM existente
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_name TEXT;
  v_username TEXT;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id::text OR lower(email) = v_email) THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(v_email, '@', 1));
  v_username := lower(
    regexp_replace(
      COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''), split_part(v_email, '@', 1) || '_' || substr(NEW.id::text, 1, 6)),
      '[^a-zA-Z0-9_]',
      '_',
      'g'
    )
  );

  INSERT INTO public.users (id, name, username, email, role, plan, status, settings)
  VALUES (
    NEW.id::text,
    v_name,
    v_username,
    v_email,
    'user',
    'free',
    'active',
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (id, user_id, plan, status, provider, note)
  VALUES (
    'sub_' || substr(replace(NEW.id::text, '-', ''), 1, 12),
    NEW.id::text,
    'free',
    'active',
    'local-tier',
    'Plano inicial gratuito ativado no cadastro.'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- ==============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Policies: public.users
DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;
CREATE POLICY "users_select_own_or_admin"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS "users_update_own_or_admin" ON public.users;
CREATE POLICY "users_update_own_or_admin"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::text OR public.is_admin())
  WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- Policies: public.games
DROP POLICY IF EXISTS "games_select_active_or_admin" ON public.games;
CREATE POLICY "games_select_active_or_admin"
  ON public.games FOR SELECT
  TO authenticated
  USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "games_insert_admin_only" ON public.games;
CREATE POLICY "games_insert_admin_only"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "games_update_admin_only" ON public.games;
CREATE POLICY "games_update_admin_only"
  ON public.games FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "games_delete_admin_only" ON public.games;
CREATE POLICY "games_delete_admin_only"
  ON public.games FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Policies: public.user_saved_games
DROP POLICY IF EXISTS "saved_games_manage_own" ON public.user_saved_games;
CREATE POLICY "saved_games_manage_own"
  ON public.user_saved_games FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Policies: public.event_rules
DROP POLICY IF EXISTS "event_rules_manage_own" ON public.event_rules;
CREATE POLICY "event_rules_manage_own"
  ON public.event_rules FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Policies: public.live_events
DROP POLICY IF EXISTS "live_events_select_own" ON public.live_events;
CREATE POLICY "live_events_select_own"
  ON public.live_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS "live_events_insert_own" ON public.live_events;
CREATE POLICY "live_events_insert_own"
  ON public.live_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

-- Policies: public.subscriptions
DROP POLICY IF EXISTS "subscriptions_select_own_or_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own_or_admin"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin());

-- Policies: public.platform_settings
DROP POLICY IF EXISTS "platform_settings_select_authenticated" ON public.platform_settings;
CREATE POLICY "platform_settings_select_authenticated"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "platform_settings_update_admin_only" ON public.platform_settings;
CREATE POLICY "platform_settings_update_admin_only"
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
