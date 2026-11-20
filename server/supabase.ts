import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  classifySupabaseKey,
  isValidPublicSupabaseKey,
  isValidSecretSupabaseKey,
  type SupabaseKeyKind,
} from '../src/lib/supabaseKeyUtils.js';

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  publicKeyMode: SupabaseKeyKind;
  secretKeyMode: SupabaseKeyKind;
}

export interface SupabasePingResult {
  ok: boolean;
  authConnected: boolean;
  schemaReady: boolean;
  migration001Ready: boolean;
  migration002Ready: boolean;
  storageBucketReady: boolean;
  missingTables: string[];
  usersCountHint: number;
  keyModes: {
    publicKey: SupabaseKeyKind;
    secretKey: SupabaseKeyKind;
  };
}

export function getSupabaseEnvConfig(): SupabaseEnvConfig {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  ).trim();

  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();

  return {
    url,
    anonKey,
    serviceRoleKey,
    publicKeyMode: classifySupabaseKey(anonKey),
    secretKeyMode: classifySupabaseKey(serviceRoleKey),
  };
}

export function getPublicSupabaseConfig(): { url: string; publishableKey: string } | null {
  const { url, anonKey } = getSupabaseEnvConfig();
  if (!url || !isValidPublicSupabaseKey(anonKey)) return null;
  return { url, publishableKey: anonKey };
}

export function getMissingSupabaseEnvVars(): string[] {
  const cfg = getSupabaseEnvConfig();
  const missing: string[] = [];
  if (!cfg.url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!cfg.anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!cfg.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

export function getSupabaseConfigIssues(): string[] {
  const cfg = getSupabaseEnvConfig();
  const issues: string[] = [];
  if (!cfg.url) {
    issues.push('NEXT_PUBLIC_SUPABASE_URL não configurada.');
  }
  if (!cfg.anonKey) {
    issues.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) não configurada.');
  } else if (!isValidPublicSupabaseKey(cfg.anonKey)) {
    issues.push(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY inválida ou insegura (use sb_publishable_... ou chave pública anon, nunca sb_secret_...).',
    );
  }
  if (!cfg.serviceRoleKey) {
    issues.push('SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) não configurada no servidor.');
  } else if (!isValidSecretSupabaseKey(cfg.serviceRoleKey)) {
    issues.push(
      'SUPABASE_SERVICE_ROLE_KEY inválida (use sb_secret_... ou service_role JWT apenas no servidor).',
    );
  }
  return issues;
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseEnvConfig();
  return (
    Boolean(cfg.url) &&
    isValidPublicSupabaseKey(cfg.anonKey) &&
    isValidSecretSupabaseKey(cfg.serviceRoleKey)
  );
}

let cachedAdminKey = '';
let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseEnvConfig();
  if (!url || !isValidSecretSupabaseKey(serviceRoleKey)) {
    const missing = getMissingSupabaseEnvVars().join(', ');
    throw new Error(
      `Supabase não configurado corretamente no servidor. Verifique: ${missing || 'SUPABASE_SERVICE_ROLE_KEY (sb_secret_...)'}.`,
    );
  }

  const cacheKey = `${url}::${serviceRoleKey.slice(-10)}`;
  if (!cachedAdminClient || cachedAdminKey !== cacheKey) {
    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    cachedAdminKey = cacheKey;
  }

  return cachedAdminClient;
}

export function createSupabaseAuthClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseEnvConfig();
  if (!url || !isValidPublicSupabaseKey(anonKey)) {
    const missing = getMissingSupabaseEnvVars().join(', ');
    throw new Error(
      `Supabase Auth não configurado corretamente. Verifique: ${missing || 'NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_...)'}.`,
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function pingSupabase(): Promise<SupabasePingResult> {
  const cfg = getSupabaseEnvConfig();
  const admin = getSupabaseAdmin();

  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (authError) {
    throw new Error(`Falha ao validar Supabase Auth Admin: ${authError.message}`);
  }

  const migration001Tables = [
    'platform_settings',
    'users',
    'games',
    'user_saved_games',
    'event_rules',
    'live_events',
    'subscriptions',
  ];
  const migration002Tables = [
    'gift_mappings',
    'music_tracks',
    'music_playlists',
    'game_music_preferences',
    'admin_ai_music_rules',
    'game_overlays',
  ];

  const allTables = [...migration001Tables, ...migration002Tables];
  const tableChecks = await Promise.all(
    allTables.map(async (tableName) => {
      const probeCol = tableName === 'user_saved_games' ? 'user_id' : 'id';
      const { error } = await admin.from(tableName).select(probeCol).limit(1);
      return { tableName, missing: Boolean(error) };
    }),
  );

  const missingTables = tableChecks.filter((item) => item.missing).map((item) => item.tableName);
  const migration001Ready = migration001Tables.every((t) => !missingTables.includes(t));
  const migration002Ready = migration002Tables.every((t) => !missingTables.includes(t));

  let storageBucketReady = false;
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    storageBucketReady = Array.isArray(buckets) && buckets.some((b) => b.id === 'mlg-music');
  } catch {
    storageBucketReady = false;
  }

  const schemaReady = migration001Ready && migration002Ready && storageBucketReady;

  return {
    ok: schemaReady,
    authConnected: true,
    schemaReady,
    migration001Ready,
    migration002Ready,
    storageBucketReady,
    missingTables,
    usersCountHint: authData.users.length,
    keyModes: {
      publicKey: cfg.publicKeyMode,
      secretKey: cfg.secretKeyMode,
    },
  };
}
