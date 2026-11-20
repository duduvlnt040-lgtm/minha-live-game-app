import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isValidPublicSupabaseKey } from './supabaseKeyUtils';

let browserClient: SupabaseClient | null = null;
let runtimeConfigPromise: Promise<{ url: string; anonKey: string }> | null = null;

export function getBrowserSupabaseConfig(): { url: string; anonKey: string } {
  const url = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const rawPublicKey = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  // Never allow a secret key (sb_secret_...) to initialize a browser client
  const anonKey = isValidPublicSupabaseKey(rawPublicKey) ? rawPublicKey : '';
  return { url, anonKey };
}

export function isBrowserSupabaseConfigured(): boolean {
  const { url, anonKey } = getBrowserSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getBrowserSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getBrowserSupabaseConfig();
  if (!url || !anonKey) return browserClient;

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export async function ensureBrowserSupabaseClient(): Promise<SupabaseClient | null> {
  const existing = getBrowserSupabaseClient();
  if (existing) return existing;

  if (typeof window === 'undefined') return null;

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch('/api/public-config', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return { url: '', anonKey: '' };
        const data = (await res.json()) as {
          supabase?: { url?: string; publishableKey?: string } | null;
        };
        const url = String(data?.supabase?.url || '').trim();
        const key = String(data?.supabase?.publishableKey || '').trim();
        return {
          url,
          anonKey: isValidPublicSupabaseKey(key) ? key : '',
        };
      })
      .catch(() => ({ url: '', anonKey: '' }));
  }

  const resolved = await runtimeConfigPromise;
  if (!resolved.url || !resolved.anonKey) return null;

  if (!browserClient) {
    browserClient = createClient(resolved.url, resolved.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
