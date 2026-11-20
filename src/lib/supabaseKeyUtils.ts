export type SupabaseKeyKind = 'publishable' | 'secret' | 'legacy_jwt' | 'unknown';

export function classifySupabaseKey(rawKey: string | undefined | null): SupabaseKeyKind {
  const key = (rawKey || '').trim();
  if (!key) return 'unknown';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('eyJ') && key.split('.').length === 3) return 'legacy_jwt';
  return 'unknown';
}

export function isValidPublicSupabaseKey(rawKey: string | undefined | null): boolean {
  const key = (rawKey || '').trim();
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return false;
  const kind = classifySupabaseKey(key);
  return kind === 'publishable' || kind === 'legacy_jwt';
}

export function isValidSecretSupabaseKey(rawKey: string | undefined | null): boolean {
  const key = (rawKey || '').trim();
  if (!key) return false;
  if (key.startsWith('sb_publishable_')) return false;
  const kind = classifySupabaseKey(key);
  return kind === 'secret' || kind === 'legacy_jwt';
}

export function isSupabaseApiKeyToken(rawToken: string | undefined | null): boolean {
  const token = (rawToken || '').trim();
  if (!token) return false;
  return (
    token.startsWith('sb_publishable_') ||
    token.startsWith('sb_secret_') ||
    token.startsWith('sb_temp_')
  );
}
