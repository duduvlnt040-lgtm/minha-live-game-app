import React from 'react';
import { ArrowRight, Gamepad2, Library, PlusCircle, Radio, Upload } from 'lucide-react';
import type { DashboardTab } from '../../lib/rbac';
import type {
  EventRule,
  GameItem,
  LiveEventPayload,
  TikTokIntegrationStatus,
  UserRole,
} from '../../types/platform';

export type { DashboardTab };

interface OverviewSectionProps {
  userRole: UserRole;
  games: GameItem[];
  myGamesCount: number;
  rules: EventRule[];
  events: LiveEventPayload[];
  tiktokStatus: TikTokIntegrationStatus | null;
  onSelectTab: (tab: DashboardTab) => void;
}

export function OverviewSection({
  userRole,
  games,
  myGamesCount,
  rules,
  events,
  tiktokStatus,
  onSelectTab,
}: OverviewSectionProps) {
  const isAdmin = userRole === 'admin';
  const activeGames = games.filter((g) => g.isActive);
  const recentEvents = events.slice(0, 6);

  const integrationLabel =
    tiktokStatus?.status === 'connected'
      ? `Conectado (@${tiktokStatus.connectedUsername})`
      : tiktokStatus?.status === 'error'
        ? 'Desconectado (erro na última tentativa)'
        : 'Desconectado';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Visão geral</h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAdmin
              ? 'Resumo administrativo da plataforma, catálogo global de jogos e eventos em tempo real.'
              : 'Resumo da sua conta, jogos disponíveis na biblioteca e eventos em tempo real.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => onSelectTab('import-game')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 transition-opacity whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                Importar jogo
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('create-game')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-white/10 bg-[#11131C] text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                <PlusCircle className="w-4 h-4" />
                Criar jogo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSelectTab('library')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 transition-opacity whitespace-nowrap"
              >
                <Library className="w-4 h-4" />
                Explorar biblioteca
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('my-games')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-white/10 bg-[#11131C] text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                <Gamepad2 className="w-4 h-4" />
                Meus jogos
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real numeric KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
          <div className="text-xs text-slate-400">
            {isAdmin ? 'Jogos no catálogo' : 'Biblioteca disponível'}
          </div>
          <div className="font-display text-3xl font-bold text-white tabular-nums mt-2" data-testid="stat-total-games">
            {games.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isAdmin ? 'Catálogo global centralizado' : 'Jogos publicados para uso'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
          <div className="text-xs text-slate-400">
            {isAdmin ? 'Jogos publicados' : 'Em Meus jogos'}
          </div>
          <div className="font-display text-3xl font-bold text-[#22D3EE] tabular-nums mt-2" data-testid="stat-active-games">
            {isAdmin ? activeGames.length : myGamesCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isAdmin ? 'Visíveis para todos os usuários' : 'Adicionados à sua lista pessoal'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
          <div className="text-xs text-slate-400">Regras de eventos</div>
          <div className="font-display text-3xl font-bold text-[#A78BFA] tabular-nums mt-2">
            {rules.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {rules.filter((r) => r.enabled).length} ativas no momento
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
          <div className="text-xs text-slate-400">Eventos registrados</div>
          <div className="font-display text-3xl font-bold text-white tabular-nums mt-2">
            {events.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Histórico da conta</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Events */}
        <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#11131C] p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="font-display text-lg font-semibold text-white">Últimos eventos</h2>
            <button
              type="button"
              onClick={() => onSelectTab('live-events')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#22D3EE] hover:underline"
            >
              Abrir simulador e regras
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentEvents.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-white/10 rounded-lg">
              <p className="text-sm text-slate-300">Nenhum evento recebido ou simulado até agora.</p>
              <p className="text-xs text-slate-500 mt-1">
                Use o Modo Simulação em Eventos da LIVE para testar presentes e comentários.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {recentEvents.map((ev) => (
                <div key={ev.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">
                      @{ev.senderUsername} · {ev.type}
                      {ev.giftName ? ` (${ev.giftName})` : ''}
                      {ev.commentText ? `: "${ev.commentText}"` : ''}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {ev.isSimulation ? 'Modo Simulação' : 'Transmissão Real'} ·{' '}
                      {ev.triggeredCommands.length} ação(ões) disparada(s)
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                    {new Date(ev.createdAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status das integrações e atividades recentes */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-white">Status das integrações</h2>
              <Radio className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-slate-300">TikTok LIVE</span>
                <span
                  className={
                    tiktokStatus?.status === 'connected'
                      ? 'text-emerald-400 font-medium'
                      : 'text-slate-400'
                  }
                >
                  {integrationLabel}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-slate-300">Canal WebSocket Overlays</span>
                <span className="text-cyan-400 font-medium">Operacional</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-300">Armazenamento local</span>
                <span className="text-slate-200 font-medium">Ativo</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectTab('integrations')}
              className="mt-5 w-full py-2 px-3 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors"
            >
              Gerenciar integrações
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
            <h2 className="font-display text-lg font-semibold text-white mb-3">Atividades recentes</h2>
            {games.length === 0 && events.length === 0 ? (
              <p className="text-sm text-slate-400">
                {isAdmin
                  ? 'O catálogo global começou vazio. Importe um jogo HTML/ZIP ou crie uma cena no estúdio para publicar aos usuários.'
                  : 'Nenhum jogo publicado na biblioteca ou evento registrado ainda. Assim que o administrador publicar jogos, eles aparecerão na Biblioteca.'}
              </p>
            ) : (
              <ul className="space-y-2.5 text-xs text-slate-300">
                {games.slice(0, 3).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {g.isActive ? 'Jogo publicado:' : 'Rascunho:'} {g.name}
                    </span>
                    <span className="font-mono text-slate-500 shrink-0">
                      {new Date(g.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </li>
                ))}
                {rules.slice(0, 2).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">Regra: {r.name}</span>
                    <span className="font-mono text-slate-500 shrink-0">
                      {r.enabled ? 'Ativa' : 'Inativa'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
