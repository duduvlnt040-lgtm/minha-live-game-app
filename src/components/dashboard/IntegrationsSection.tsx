import React, { useState } from 'react';
import { AlertCircle, Link2, Radio, Unplug } from 'lucide-react';
import type { LiveEventPayload, TikTokIntegrationStatus } from '../../types/platform';

interface IntegrationsSectionProps {
  tiktokStatus: TikTokIntegrationStatus | null;
  events: LiveEventPayload[];
  onConnectTikTok: (username: string) => Promise<void>;
  onDisconnectTikTok: () => Promise<void>;
}

export function IntegrationsSection({
  tiktokStatus,
  events,
  onConnectTikTok,
  onDisconnectTikTok,
}: IntegrationsSectionProps) {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConnectTikTok(handle);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await onDisconnectTikTok();
    } finally {
      setBusy(false);
    }
  };

  const isConnected = tiktokStatus?.status === 'connected';
  const realEvents = events.filter((e) => !e.isSimulation);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Integrações e Conectores</h1>
        <p className="text-sm text-slate-400 mt-1">
          Arquitetura modular separando captura de transmissões ao vivo, banco remoto e gateway comercial.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* TikTok LIVE Provider */}
        <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                TikTok LIVE (Adaptador desacoplado)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Suporte estrutural para comentários, presentes, curtidas, seguidores e compartilhamentos.
              </p>
            </div>
            <span
              data-testid="tiktok-connection-status"
              className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                isConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : tiktokStatus?.status === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-white/15 bg-white/5 text-slate-300'
              }`}
            >
              {isConnected
                ? `Conectado: @${tiktokStatus?.connectedUsername}`
                : tiktokStatus?.status === 'error'
                  ? 'Erro na conexão'
                  : 'Desconectado'}
            </span>
          </div>

          {tiktokStatus?.lastError && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{tiktokStatus.lastError}</span>
            </div>
          )}

          <form onSubmit={handleConnect} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="tiktok-handle" className="block text-xs text-slate-300 mb-1.5">
                Perfil do TikTok (@usuário da live)
              </label>
              <input
                id="tiktok-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@seuperfil"
                disabled={isConnected || busy}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2 text-sm text-white"
              />
            </div>

            {isConnected ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDisconnect()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40"
              >
                <Unplug className="w-4 h-4" />
                Desconectar
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60"
              >
                <Radio className="w-4 h-4" />
                {busy ? 'Conectando...' : 'Conectar transmissão'}
              </button>
            )}
          </form>

          <div className="rounded-lg border border-white/10 bg-[#07080D] p-4 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-200">Transparência técnica e limitações</div>
            <p>{tiktokStatus?.documentationNote}</p>
            <p>
              Para ativar a captura real de sala em servidor Node.js dedicado, instale a dependência comunitária{' '}
              <code className="font-mono text-slate-200">npm install tiktok-live-connector</code> e inicie a transmissão antes de conectar.
            </p>
          </div>
        </div>

        {/* Received Live Events & External Modules */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
            <h2 className="font-display text-lg font-semibold text-white mb-2">
              Eventos recebidos da LIVE real
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Sessão atual: <span className="font-mono text-white tabular-nums">{tiktokStatus?.eventsReceivedSession ?? 0}</span> evento(s)
            </p>
            {realEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-slate-400">
                Nenhum evento de transmissão real recebido. Enquanto estiver desconectado, utilize o Modo Simulação na aba Eventos LIVE.
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto text-xs">
                {realEvents.slice(0, 15).map((ev) => (
                  <div key={ev.id} className="flex justify-between gap-2 py-1.5 border-b border-white/10">
                    <span className="text-slate-200 truncate">@{ev.senderUsername} · {ev.type}</span>
                    <span className="font-mono text-slate-500">{new Date(ev.createdAt).toLocaleTimeString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <Link2 className="w-4 h-4 text-[#22D3EE]" />
              Conectores preparados para produção
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/10">
              <span>Firebase Auth &amp; Firestore</span>
              <span className="text-slate-400">Configurável via .env (ver README)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Mercado Pago Checkout</span>
              <span className="text-slate-400">Preparado (sem cobrança ativa)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
