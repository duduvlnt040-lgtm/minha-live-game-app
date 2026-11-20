import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isValidPublicSupabaseKey } from './supabaseKeyUtils';

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseConfig(): { url: string; anonKey: string } {
  const url = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const rawPublicKey = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
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
  if (!url || !anonKey) return null;

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
