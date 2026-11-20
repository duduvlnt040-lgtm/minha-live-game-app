import { getBrowserSupabaseClient } from '../lib/supabase';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization')) {
    try {
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (accessToken) {
          headers.set('Authorization', `Bearer ${accessToken}`);
        }
      }
    } catch {
      // Fallback gracefully to HttpOnly cookies
    }
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const trimmed = text.trim();
      const looksLikeHtmlOrNotFound =
        trimmed.startsWith('<') || trimmed.includes('NOT_FOUND') || trimmed.includes('The page could not be found');
      data = {
        error: looksLikeHtmlOrNotFound
          ? `Endpoint da API indisponível (${response.status}). Verifique o roteamento /api na hospedagem.`
          : trimmed,
      };
    }
  }

  if (!response.ok) {
    const errObj = data as { error?: string; message?: string };
    throw new Error(errObj.error || errObj.message || `Erro na requisição (${response.status})`);
  }

  return data as T;
}
