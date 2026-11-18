import React, { useCallback, useEffect, useState } from 'react';
import { LoadingScreen } from './components/BrandMark';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { DashboardTab } from './lib/rbac';
import { AuthPages } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { OverlayPage } from './pages/OverlayPage';

const PATH_TO_TAB: Record<string, DashboardTab> = {
  '/dashboard': 'overview',
  '/dashboard/visao-geral': 'overview',
  '/dashboard/meus-jogos': 'my-games',
  '/dashboard/biblioteca': 'library',
  '/importar-jogo': 'import-game',
  '/dashboard/importar-jogo': 'import-game',
  '/criar-jogo': 'create-game',
  '/dashboard/criar-jogo': 'create-game',
  '/dashboard/eventos': 'live-events',
  '/dashboard/overlay': 'overlays',
  '/dashboard/overlays': 'overlays',
  '/dashboard/integracoes': 'integrations',
  '/dashboard/configuracoes': 'settings',
  '/dashboard/assinatura': 'subscription',
  '/dashboard/conta': 'account',
  '/admin': 'admin',
  '/dashboard/admin': 'admin',
};

function normalizePathname(raw: string): string {
  const pathOnly = raw.split('?')[0].split('#')[0] || '/';
  return pathOnly.length > 1 && pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
}

function resolveDashboardTab(pathname: string): DashboardTab | null {
  const normalized = normalizePathname(pathname);
  if (PATH_TO_TAB[normalized]) return PATH_TO_TAB[normalized];
  if (normalized.startsWith('/dashboard/')) return 'overview';
  return null;
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(normalizePathname(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    const cleanNext = normalizePathname(nextPath);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPathname(cleanNext);
    window.scrollTo({ top: 0 });
  }, []);

  // Standalone Overlay route (/overlay/ID-DO-JOGO) — works independently of dashboard/auth
  if (pathname.startsWith('/overlay/')) {
    const gameId = decodeURIComponent(pathname.slice('/overlay/'.length).split('/')[0] || '');
    return <OverlayPage gameId={gameId} />;
  }

  if (loading) {
    return <LoadingScreen label="Verificando sessão..." />;
  }

  if (pathname === '/login') {
    if (user) {
      return <DashboardPage onNavigate={navigate} />;
    }
    return <AuthPages mode="login" onNavigate={navigate} />;
  }

  if (pathname === '/cadastro') {
    if (user) {
      return <DashboardPage onNavigate={navigate} />;
    }
    return <AuthPages mode="register" onNavigate={navigate} />;
  }

  if (pathname === '/recuperar-senha') {
    return <AuthPages mode="recover" onNavigate={navigate} />;
  }

  if (pathname === '/redefinir-senha') {
    return <AuthPages mode="reset" onNavigate={navigate} />;
  }

  const dashboardTab = resolveDashboardTab(pathname);
  if (dashboardTab) {
    if (!user) {
      return <AuthPages mode="login" onNavigate={navigate} />;
    }
    return <DashboardPage initialTab={dashboardTab} onNavigate={navigate} />;
  }

  return <LandingPage onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
