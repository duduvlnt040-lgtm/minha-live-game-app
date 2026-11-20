-- ==============================================================================
-- MINHA LIVE GAMES — Migration 002
-- Sistema Completo de Presentes, Biblioteca Musical Global (ADM),
-- Músicas Pessoais (Usuários), Rádio Inteligente com IA, Controles & Overlays
-- Script 100% idempotente: preserva todas as contas, ADM e jogos existentes.
-- ==============================================================================

-- 1. Bucket de Storage permanente para músicas oficiais e pessoais
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mlg-music',
  'mlg-music',
  TRUE,
  52428800,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
    'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies de Storage (mlg-music)
DROP POLICY IF EXISTS "mlg_music_public_read" ON storage.objects;
CREATE POLICY "mlg_music_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mlg-music');

DROP POLICY IF EXISTS "mlg_music_admin_write_official" ON storage.objects;
CREATE POLICY "mlg_music_admin_write_official"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'mlg-music'
    AND (storage.foldername(name))[1] = 'official'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'mlg-music'
    AND (storage.foldername(name))[1] = 'official'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "mlg_music_user_write_personal" ON storage.objects;
CREATE POLICY "mlg_music_user_write_personal"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'mlg-music'
    AND (storage.foldername(name))[1] = 'personal'
    AND ((storage.foldername(name))[2] = auth.uid()::text OR public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'mlg-music'
    AND (storage.foldername(name))[1] = 'personal'
    AND ((storage.foldername(name))[2] = auth.uid()::text OR public.is_admin())
  );

-- 2. Mapeamento personalizado de presentes do TikTok por usuário e por jogo
CREATE TABLE IF NOT EXISTS public.gift_mappings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  gift_name TEXT NOT NULL,
  min_count INTEGER NOT NULL DEFAULT 1,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_command TEXT NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  cooldown_ms INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gift_mappings_user_game_idx ON public.gift_mappings (user_id, game_id);

-- 3. Biblioteca Musical (Oficial do ADM + Pessoal dos Usuários)
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('official', 'personal')),
  owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'all',
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  bpm INTEGER,
  duration_sec INTEGER,
  cover_url TEXT,
  storage_path TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ai_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS music_tracks_scope_game_idx ON public.music_tracks (scope, game_id, is_active);
CREATE INDEX IF NOT EXISTS music_tracks_owner_idx ON public.music_tracks (owner_user_id, scope);

-- 4. Playlists (Oficiais do ADM + Pessoais dos Usuários)
CREATE TABLE IF NOT EXISTS public.music_playlists (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('official', 'personal')),
  owner_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'all',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  track_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS music_playlists_scope_game_idx ON public.music_playlists (scope, game_id);
CREATE INDEX IF NOT EXISTS music_playlists_owner_idx ON public.music_playlists (owner_user_id);

-- 5. Preferências de reprodução automática e rádio IA por usuário e jogo
CREATE TABLE IF NOT EXISTS public.game_music_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  source_mode TEXT NOT NULL DEFAULT 'mixed' CHECK (source_mode IN ('official_only', 'mixed', 'personal_only')),
  autoplay_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ai_dj_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  crossfade_seconds DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  volume INTEGER NOT NULL DEFAULT 75,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_mood TEXT NOT NULL DEFAULT 'auto',
  active_playlist_id TEXT,
  ai_curated_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id)
);

-- 6. Regras globais de reprodução automática controladas pelo ADM
CREATE TABLE IF NOT EXISTS public.admin_ai_music_rules (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL UNIQUE,
  default_source_mode TEXT NOT NULL DEFAULT 'mixed' CHECK (default_source_mode IN ('official_only', 'mixed', 'personal_only')),
  prioritize_official_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  avoid_repeat_window INTEGER NOT NULL DEFAULT 3,
  crossfade_seconds DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  preferred_energy TEXT NOT NULL DEFAULT 'auto',
  ai_instructions TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.admin_ai_music_rules (
  id,
  game_id,
  default_source_mode,
  prioritize_official_ratio,
  avoid_repeat_window,
  crossfade_seconds,
  preferred_energy,
  ai_instructions
)
VALUES (
  'airule_all',
  'all',
  'mixed',
  0.6,
  3,
  2.5,
  'auto',
  'Alternar dinamicamente músicas oficiais e pessoais sem repetir faixas consecutivas, priorizando energia compatível com o jogo.'
)
ON CONFLICT (game_id) DO NOTHING;

-- 7. Overlays personalizados por usuário e jogo (link exclusivo + controles + TikTok)
CREATE TABLE IF NOT EXISTS public.game_overlays (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  tiktok_username TEXT NOT NULL DEFAULT '',
  controls_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  overlay_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS game_overlays_user_idx ON public.game_overlays (user_id);
CREATE INDEX IF NOT EXISTS game_overlays_game_idx ON public.game_overlays (game_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) E PROTEÇÕES DE PERMISSÃO
-- ==============================================================================

ALTER TABLE public.gift_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_music_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_ai_music_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_overlays ENABLE ROW LEVEL SECURITY;

-- Policies: public.gift_mappings
DROP POLICY IF EXISTS "gift_mappings_manage_own" ON public.gift_mappings;
CREATE POLICY "gift_mappings_manage_own"
  ON public.gift_mappings FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

-- Policies: public.music_tracks (Usuário comum NUNCA altera ou apaga músicas oficiais)
DROP POLICY IF EXISTS "music_tracks_select_visible" ON public.music_tracks;
CREATE POLICY "music_tracks_select_visible"
  ON public.music_tracks FOR SELECT
  TO authenticated
  USING (
    (scope = 'official' AND is_active = TRUE)
    OR owner_user_id = auth.uid()::text
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "music_tracks_insert_scoped" ON public.music_tracks;
CREATE POLICY "music_tracks_insert_scoped"
  ON public.music_tracks FOR INSERT
  TO authenticated
  WITH CHECK (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "music_tracks_update_scoped" ON public.music_tracks;
CREATE POLICY "music_tracks_update_scoped"
  ON public.music_tracks FOR UPDATE
  TO authenticated
  USING (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  )
  WITH CHECK (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "music_tracks_delete_scoped" ON public.music_tracks;
CREATE POLICY "music_tracks_delete_scoped"
  ON public.music_tracks FOR DELETE
  TO authenticated
  USING (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  );

-- Policies: public.music_playlists
DROP POLICY IF EXISTS "music_playlists_select_visible" ON public.music_playlists;
CREATE POLICY "music_playlists_select_visible"
  ON public.music_playlists FOR SELECT
  TO authenticated
  USING (
    (scope = 'official' AND is_active = TRUE)
    OR owner_user_id = auth.uid()::text
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "music_playlists_insert_scoped" ON public.music_playlists;
CREATE POLICY "music_playlists_insert_scoped"
  ON public.music_playlists FOR INSERT
  TO authenticated
  WITH CHECK (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "music_playlists_update_scoped" ON public.music_playlists;
CREATE POLICY "music_playlists_update_scoped"
  ON public.music_playlists FOR UPDATE
  TO authenticated
  USING (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  )
  WITH CHECK (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "music_playlists_delete_scoped" ON public.music_playlists;
CREATE POLICY "music_playlists_delete_scoped"
  ON public.music_playlists FOR DELETE
  TO authenticated
  USING (
    (scope = 'official' AND public.is_admin())
    OR (scope = 'personal' AND owner_user_id = auth.uid()::text)
    OR public.is_admin()
  );

-- Policies: public.game_music_preferences
DROP POLICY IF EXISTS "game_music_prefs_manage_own" ON public.game_music_preferences;
CREATE POLICY "game_music_prefs_manage_own"
  ON public.game_music_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

-- Policies: public.admin_ai_music_rules
DROP POLICY IF EXISTS "admin_ai_rules_read_authenticated" ON public.admin_ai_music_rules;
CREATE POLICY "admin_ai_rules_read_authenticated"
  ON public.admin_ai_music_rules FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "admin_ai_rules_write_admin_only" ON public.admin_ai_music_rules;
CREATE POLICY "admin_ai_rules_write_admin_only"
  ON public.admin_ai_music_rules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policies: public.game_overlays
DROP POLICY IF EXISTS "game_overlays_manage_own" ON public.game_overlays;
CREATE POLICY "game_overlays_manage_own"
  ON public.game_overlays FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());
