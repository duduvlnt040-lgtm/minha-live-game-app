const TOKEN_STORAGE_KEY = 'mlg_auth_token';

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
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
