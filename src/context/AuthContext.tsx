import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ensureBrowserSupabaseClient, getBrowserSupabaseClient } from '../lib/supabase';
import { apiRequest } from '../services/api';
import type { UserProfile, UserSettings } from '../types/platform';

interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: { name?: string; settings?: Partial<UserSettings> }) => Promise<UserProfile>;
  toggleMyGame: (gameId: string, currentlyAdded: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncBrowserSupabaseSession(session?: SessionTokens | null): Promise<void> {
  if (!session?.access_token || !session?.refresh_token) return;
  try {
    const supabase = await ensureBrowserSupabaseClient();
    if (!supabase) return;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch {
    // Backend HttpOnly cookies keep session functional even if storage is blocked
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{
        authenticated: boolean;
        user: UserProfile | null;
        session?: SessionTokens;
      }>('/api/auth/session');

      if (data.session) {
        await syncBrowserSupabaseSession(data.session);
      }
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void ensureBrowserSupabaseClient().then((supabase) => {
      if (!active || !supabase) return;
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          return;
        }
        if (event === 'TOKEN_REFRESHED' && session?.access_token && session?.refresh_token) {
          void apiRequest('/api/auth/sync-session', {
            method: 'POST',
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          }).catch(() => {});
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [refreshUser]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiRequest<{ user: UserProfile; session?: SessionTokens }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    await syncBrowserSupabaseSession(data.session);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (payload: {
      name: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) => {
      const data = await apiRequest<{ user: UserProfile; session?: SessionTokens }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      await syncBrowserSupabaseSession(data.session);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      try {
        await getBrowserSupabaseClient()?.auth.signOut();
      } catch {
        // Ignore browser signout errors
      }
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (payload: { name?: string; settings?: Partial<UserSettings> }) => {
      const data = await apiRequest<{ user: UserProfile }>('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const toggleMyGame = useCallback(async (gameId: string, currentlyAdded: boolean) => {
    const data = await apiRequest<{ myGameIds: string[]; user: UserProfile }>(`/api/my-games/${gameId}`, {
      method: currentlyAdded ? 'DELETE' : 'POST',
    });
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser, updateProfile, toggleMyGame }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return ctx;
}
