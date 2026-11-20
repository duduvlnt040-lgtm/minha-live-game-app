import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
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
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return { url, anonKey, serviceRoleKey };
}

export function getMissingSupabaseEnvVars(): string[] {
  const cfg = getSupabaseEnvConfig();
  const missing: string[] = [];
  if (!cfg.url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!cfg.anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!cfg.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

export function isSupabaseConfigured(): boolean {
  return getMissingSupabaseEnvVars().length === 0;
}

let cachedAdminKey = '';
let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseEnvConfig();
  if (!url || !serviceRoleKey) {
    const missing = getMissingSupabaseEnvVars().join(', ');
    throw new Error(
      `Supabase não configurado no servidor. Variáveis ausentes: ${missing || 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'}.`,
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
  if (!url || !anonKey) {
    const missing = getMissingSupabaseEnvVars().join(', ');
    throw new Error(
      `Supabase Auth não configurado no servidor. Variáveis ausentes: ${missing || 'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY'}.`,
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function pingSupabase(): Promise<{ ok: true; usersCountHint: number }> {
  const admin = getSupabaseAdmin();

  const { error: dbError } = await admin.from('platform_settings').select('id').limit(1);
  if (dbError) {
    throw new Error(`Falha ao consultar tabela platform_settings no Supabase: ${dbError.message}`);
  }

  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (authError) {
    throw new Error(`Falha ao validar Supabase Auth Admin: ${authError.message}`);
  }

  return {
    ok: true,
    usersCountHint: authData.users.length,
  };
}
