import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Gamepad2,
  LayoutDashboard,
  Library,
  Lock,
  LogOut,
  Menu,
  Music2,
  PlusCircle,
  Radio,
  Settings,
  ShieldAlert,
  Tv,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo, LoadingScreen } from '../components/BrandMark';
import { AdminMusicSection } from '../components/dashboard/AdminMusicSection';
import { AdminSection } from '../components/dashboard/AdminSection';
import { CreateGameSection } from '../components/dashboard/CreateGameSection';
import { GamesLibrarySection } from '../components/dashboard/GamesLibrarySection';
import {
  GameWorkspaceModal,
  type GameWorkspaceTab,
} from '../components/dashboard/GameWorkspaceModal';
import { ImportGameSection } from '../components/dashboard/ImportGameSection';
import { IntegrationsSection } from '../components/dashboard/IntegrationsSection';
import { LiveEventsSection } from '../components/dashboard/LiveEventsSection';
import { OverlaysSection } from '../components/dashboard/OverlaysSection';
import { OverviewSection } from '../components/dashboard/OverviewSection';
import { SettingsSection } from '../components/dashboard/SettingsSection';
import { AccountSection, SubscriptionSection } from '../components/dashboard/SubscriptionAndAccountSection';
import { useAuth } from '../context/AuthContext';
import {
  canAccessTab,
  filterGamesForRole,
  getMyGamesForRole,
  type DashboardTab,
} from '../lib/rbac';
import { apiRequest } from '../services/api';
import type {
  EventRule,
  GameCategory,
  GameEngine,
  GameItem,
  LiveEventPayload,
  LiveEventType,
  OverlayConfig,
  TikTokIntegrationStatus,
} from '../types/platform';

interface DashboardPageProps {
  initialTab?: DashboardTab;
  onNavigate: (path: string) => void;
}

const NAV_ITEMS: Array<{ id: DashboardTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'my-games', label: 'Meus jogos', icon: Gamepad2 },
  { id: 'library', label: 'Biblioteca', icon: Library },
  { id: 'import-game', label: 'Importar jogo', icon: Upload },
  { id: 'create-game', label: 'Criar jogo', icon: PlusCircle },
  { id: 'live-events', label: 'Eventos da LIVE', icon: Zap },
  { id: 'overlays', label: 'Overlay', icon: Tv },
  { id: 'integrations', label: 'Integrações', icon: Radio },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'subscription', label: 'Minha assinatura', icon: CreditCard },
  { id: 'account', label: 'Minha conta', icon: User },
];

export function DashboardPage({ initialTab = 'overview', onNavigate }: DashboardPageProps) {
  const { user, logout, toggleMyGame } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<{
    game: GameItem;
    tab: GameWorkspaceTab;
  } | null>(null);

  const [games, setGames] = useState<GameItem[]>([]);
  const [rules, setRules] = useState<EventRule[]>([]);
  const [events, setEvents] = useState<LiveEventPayload[]>([]);
  const [tiktokStatus, setTiktokStatus] = useState<TikTokIntegrationStatus | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadDashboardData = useCallback(async () => {
    try {
      const [gRes, rRes, eRes, tRes] = await Promise.all([
        apiRequest<{ games: GameItem[] }>('/api/games'),
        apiRequest<{ rules: EventRule[] }>('/api/rules'),
        apiRequest<{ events: LiveEventPayload[] }>('/api/events'),
        apiRequest<{ integration: TikTokIntegrationStatus }>('/api/integrations/tiktok/status'),
      ]);
      setGames(gRes.games);
      setRules(rRes.rules);
      setEvents(eRes.events);
      setTiktokStatus(tRes.integration);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!user) return null;
  if (loadingData) return <LoadingScreen label="Carregando seu painel..." />;

  const isAdmin = user.role === 'admin';
  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessTab(user.role, item.id));
  const hasTabAccess = canAccessTab(user.role, activeTab);
  const libraryGames = filterGamesForRole(games, user.role);
  const myGames = getMyGamesForRole(games, user.myGameIds || [], user.role);

  const handleCreateGame = async (payload: {
    name: string;
    description: string;
    category: GameCategory;
    engine: GameEngine;
    entryFile: string;
    coverImage?: string;
    files: Record<string, string>;
  }) => {
    const res = await apiRequest<{ game: GameItem }>('/api/games', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setGames((prev) => [res.game, ...prev]);
    return res.game;
  };

  const handleUpdateGame = async (id: string, payload: Partial<GameItem>) => {
    const res = await apiRequest<{ game: GameItem }>(`/api/games/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setGames((prev) => prev.map((g) => (g.id === id ? res.game : g)));
  };

  const handleToggleGameActive = async (game: GameItem) => {
    await handleUpdateGame(game.id, { isActive: !game.isActive });
  };

  const handleDeleteGame = async (id: string) => {
    await apiRequest(`/api/games/${id}`, { method: 'DELETE' });
    setGames((prev) => prev.filter((g) => g.id !== id));
    setRules((prev) => prev.filter((r) => r.gameId !== id));
  };

  const handleUpdateOverlay = async (gameId: string, overlayConfig: OverlayConfig) => {
    await handleUpdateGame(gameId, { overlayConfig });
  };

  const handleCreateRule = async (payload: Partial<EventRule>) => {
    const res = await apiRequest<{ rule: EventRule }>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setRules((prev) => [res.rule, ...prev]);
    return res.rule;
  };

  const handleUpdateRule = async (id: string, payload: Partial<EventRule>) => {
    const res = await apiRequest<{ rule: EventRule }>(`/api/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setRules((prev) => prev.map((r) => (r.id === id ? res.rule : r)));
  };

  const handleDeleteRule = async (id: string) => {
    await apiRequest(`/api/rules/${id}`, { method: 'DELETE' });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSimulateEvent = async (payload: {
    gameId: string;
    type: LiveEventType;
    senderUsername: string;
    giftName?: string;
    giftCount?: number;
    commentText?: string;
    likeCount?: number;
    points?: number;
    bonusMultiplier?: number;
  }) => {
    const res = await apiRequest<{ event: LiveEventPayload }>('/api/events/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setEvents((prev) => [res.event, ...prev]);
    return res.event;
  };

  const handleConnectTikTok = async (username: string) => {
    const res = await apiRequest<{ integration: TikTokIntegrationStatus }>('/api/integrations/tiktok/connect', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    setTiktokStatus(res.integration);
  };

  const handleDisconnectTikTok = async () => {
    const res = await apiRequest<{ integration: TikTokIntegrationStatus }>('/api/integrations/tiktok/disconnect', {
      method: 'POST',
    });
    setTiktokStatus(res.integration);
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  const selectTab = (tab: DashboardTab) => {
    if (!canAccessTab(user.role, tab)) return;
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0 });
    if (window.location.pathname !== '/dashboard') {
      onNavigate('/dashboard');
    }
  };

  const activeNavLabel = !hasTabAccess
    ? 'Acesso restrito'
    : activeTab === 'admin'
      ? 'Administração'
      : activeTab === 'admin-music'
        ? 'Músicas Globais (ADM)'
        : visibleNavItems.find((i) => i.id === activeTab)?.label || 'Visão geral';

  return (
    <div className="min-h-screen bg-[#07080D] text-[#F1F5F9] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 border-r border-white/10 bg-[#0B0D14]">
        <div className="px-5 py-5 border-b border-white/10">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
          >
            <BrandLogo compact />
          </a>
        </div>

        <nav aria-label="Menu do painel" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/15 text-white border border-[#3B82F6]/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#22D3EE]' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => selectTab('admin-music')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap mt-4 ${
                  activeTab === 'admin-music'
                    ? 'bg-[#22D3EE]/15 text-white border border-[#22D3EE]/40'
                    : 'text-cyan-300 hover:bg-cyan-500/10 border border-transparent'
                }`}
              >
                <Music2 className="w-4 h-4 shrink-0 text-[#22D3EE]" />
                <span>Músicas Globais (ADM)</span>
              </button>
              <button
                type="button"
                onClick={() => selectTab('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap mt-1 ${
                  activeTab === 'admin'
                    ? 'bg-[#8B5CF6]/20 text-white border border-[#8B5CF6]/40'
                    : 'text-purple-300 hover:bg-purple-500/10 border border-transparent'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 text-[#A78BFA]" />
                <span>Administração</span>
              </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user.name}</div>
            <div className="text-xs text-slate-400 truncate">
              @{user.username} · {isAdmin ? 'ADMIN' : 'USER'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B0D14] border-r border-white/10 flex flex-col h-full z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <BrandLogo compact />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-[#3B82F6]/20 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => selectTab('admin-music')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-cyan-300"
                  >
                    <Music2 className="w-4 h-4 shrink-0" />
                    <span>Músicas Globais (ADM)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectTab('admin')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-300"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Administração</span>
                  </button>
                </>
              )}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-200 border border-white/10"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080D]/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Abrir menu lateral"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-white/10 text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-400 truncate">
              Painel <span className="mx-1.5">/</span>
              <span className="text-white font-medium">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-400">
              Perfil <span className="font-mono text-[#A78BFA] uppercase">{user.role}</span> · Plano{' '}
              <span className="font-mono text-[#22D3EE] uppercase">{user.plan}</span>
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => selectTab('import-game')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white whitespace-nowrap"
              >
                Importar jogo
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {!hasTabAccess ? (
            <div
              data-testid="role-access-denied"
              className="rounded-xl border border-red-500/30 bg-[#11131C] p-8 max-w-lg"
            >
              <div className="flex items-center gap-2 text-red-300 font-display text-lg font-bold mb-2">
                <Lock className="w-5 h-5" />
                Acesso restrito a administradores
              </div>
              <p className="text-sm text-slate-400 mb-5">
                Sua conta possui permissão padrão (USER) e não tem autorização para acessar esta ferramenta administrativa.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  onNavigate('/dashboard');
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB]"
              >
                Voltar para Visão geral
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewSection
                  userRole={user.role}
                  games={libraryGames}
                  myGamesCount={myGames.length}
                  rules={rules}
                  events={events}
                  tiktokStatus={tiktokStatus}
                  onSelectTab={selectTab}
                />
              )}

              {activeTab === 'my-games' && (
                <GamesLibrarySection
                  mode="my-games"
                  userRole={user.role}
                  title="Meus jogos"
                  subtitle="Jogos publicados adicionados à sua lista pessoal para execução rápida e uso em overlay."
                  games={myGames}
                  myGameIds={user.myGameIds || []}
                  onToggleMyGame={toggleMyGame}
                  onToggleActive={handleToggleGameActive}
                  onUpdateGame={handleUpdateGame}
                  onDeleteGame={handleDeleteGame}
                  onSelectTab={selectTab}
                  onOpenWorkspace={(game, tab) => setWorkspaceState({ game, tab })}
                />
              )}

              {activeTab === 'library' && (
                <GamesLibrarySection
                  mode="library"
                  userRole={user.role}
                  title="Biblioteca de jogos"
                  subtitle={
                    isAdmin
                      ? 'Catálogo centralizado da plataforma. Importe, crie, edite e publique jogos para todos os usuários.'
                      : 'Jogos oficiais publicados pelo administrador, prontos para executar e usar em suas lives.'
                  }
                  games={libraryGames}
                  myGameIds={user.myGameIds || []}
                  onToggleMyGame={toggleMyGame}
                  onToggleActive={handleToggleGameActive}
                  onUpdateGame={handleUpdateGame}
                  onDeleteGame={handleDeleteGame}
                  onSelectTab={selectTab}
                  onOpenWorkspace={(game, tab) => setWorkspaceState({ game, tab })}
                />
              )}

              {activeTab === 'import-game' && isAdmin && (
                <ImportGameSection
                  onCreateGame={handleCreateGame}
                  onImported={() => selectTab('library')}
                />
              )}

              {activeTab === 'create-game' && isAdmin && (
                <CreateGameSection
                  onCreateGame={handleCreateGame}
                  onCreated={() => selectTab('library')}
                />
              )}

              {activeTab === 'live-events' && (
                <LiveEventsSection
                  games={libraryGames.filter((g) => g.isActive)}
                  rules={rules}
                  events={events}
                  onCreateRule={handleCreateRule}
                  onUpdateRule={handleUpdateRule}
                  onDeleteRule={handleDeleteRule}
                  onSimulateEvent={handleSimulateEvent}
                />
              )}

              {activeTab === 'overlays' && isAdmin && (
                <OverlaysSection
                  games={games}
                  userPlan={user.plan}
                  onUpdateOverlay={handleUpdateOverlay}
                />
              )}

              {activeTab === 'integrations' && (
                <IntegrationsSection
                  tiktokStatus={tiktokStatus}
                  events={events}
                  onConnectTikTok={handleConnectTikTok}
                  onDisconnectTikTok={handleDisconnectTikTok}
                />
              )}

              {activeTab === 'settings' && isAdmin && <SettingsSection user={user} />}

              {activeTab === 'subscription' && <SubscriptionSection user={user} />}

              {activeTab === 'account' && <AccountSection user={user} onLogout={handleLogout} />}

              {activeTab === 'admin-music' && isAdmin && <AdminMusicSection games={games} />}

              {activeTab === 'admin' && isAdmin && <AdminSection currentUser={user} />}
            </>
          )}
        </main>
      </div>

      {workspaceState && (
        <GameWorkspaceModal
          game={workspaceState.game}
          initialTab={workspaceState.tab}
          userRole={user.role}
          userPlan={user.plan}
          tiktokStatus={tiktokStatus}
          onConnectTikTok={handleConnectTikTok}
          onDisconnectTikTok={handleDisconnectTikTok}
          onSimulateEvent={handleSimulateEvent}
          onClose={() => setWorkspaceState(null)}
        />
      )}
    </div>
  );
}
