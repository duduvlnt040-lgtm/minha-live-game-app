import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseConfig(): { url: string; anonKey: string } {
  const url = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const anonKey = (
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
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
