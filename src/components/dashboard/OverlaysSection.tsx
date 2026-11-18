import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Tv } from 'lucide-react';
import { PLANS } from '../../lib/planLimits';
import type { GameItem, OverlayConfig, PlanTier } from '../../types/platform';

interface OverlaysSectionProps {
  games: GameItem[];
  userPlan: PlanTier;
  onUpdateOverlay: (gameId: string, overlayConfig: OverlayConfig) => Promise<void>;
}

export function OverlaysSection({ games, userPlan, onUpdateOverlay }: OverlaysSectionProps) {
  const [selectedId, setSelectedId] = useState<string>(games[0]?.id || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const selectedGame = games.find((g) => g.id === selectedId) || games[0] || null;
  const allowCustomWatermark = PLANS[userPlan].allowCustomWatermark;

  const handleCopy = async (gameId: string) => {
    const url = `${window.location.origin}/overlay/${gameId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(gameId);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const updateField = async (patch: Partial<OverlayConfig>) => {
    if (!selectedGame) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      await onUpdateOverlay(selectedGame.id, {
        ...selectedGame.overlayConfig,
        ...patch,
      });
      setSavedMsg('Aparência do overlay salva e sincronizada.');
    } finally {
      setSaving(false);
    }
  };

  if (games.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">Overlays</h1>
        <div className="rounded-xl border border-dashed border-white/15 bg-[#11131C]/60 p-10 text-center">
          <Tv className="w-9 h-9 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-300">
            Nenhum jogo cadastrado ainda para gerar links de overlay.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Importe ou crie um jogo primeiro para obter a URL exclusiva <span className="font-mono">/overlay/ID-DO-JOGO</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Overlays para OBS e TikTok LIVE Studio</h1>
        <p className="text-sm text-slate-400 mt-1">
          Cada jogo possui um link exclusivo em tela cheia com atualização em tempo real via WebSocket e marca-d&apos;água MINHA LIVE GAMES.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Links List */}
        <div className="lg:col-span-6 space-y-3">
          {games.map((g) => {
            const url = `${window.location.origin}/overlay/${g.id}`;
            const isSelected = selectedGame?.id === g.id;
            return (
              <div
                key={g.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-[#3B82F6] bg-[#11131C]'
                    : 'border-white/10 bg-[#11131C]/70'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.id)}
                    className="font-display text-base font-semibold text-white hover:text-[#22D3EE] text-left truncate"
                  >
                    {g.name}
                  </button>
                  <span className={`text-xs ${g.isActive ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {g.isActive ? 'Ativo' : 'Desativado'}
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 mb-3">
                  <code className="text-xs font-mono text-slate-300 truncate flex-1">{url}</code>
                  <button
                    type="button"
                    onClick={() => void handleCopy(g.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 shrink-0"
                  >
                    {copiedId === g.id ? <Check className="w-3.5 h-3.5 text-cyan-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === g.id ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.id)}
                    className="text-xs font-medium text-[#22D3EE] hover:underline"
                  >
                    Configurar aparência
                  </button>
                  <a
                    href={`/overlay/${g.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 border border-[#3B82F6]/40 px-3 py-1.5 rounded-lg"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir overlay
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Appearance Customizer */}
        {selectedGame && (
          <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Aparência: {selectedGame.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Alterações são aplicadas em tempo real no overlay conectado.
              </p>
            </div>

            {savedMsg && (
              <div role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-xs text-cyan-100">
                {savedMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ov-bg" className="block text-xs text-slate-300 mb-1.5">
                  Fundo do overlay (OBS / Studio)
                </label>
                <select
                  id="ov-bg"
                  disabled={saving}
                  value={selectedGame.overlayConfig.backgroundMode}
                  onChange={(e) =>
                    void updateField({
                      backgroundMode: e.target.value as OverlayConfig['backgroundMode'],
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="transparent">Transparente (Fonte de Navegador)</option>
                  <option value="obsidian">Escuro (#07080D)</option>
                  <option value="chroma-green">Chroma Key Verde (#00FF00)</option>
                </select>
              </div>

              <div>
                <label htmlFor="ov-pos" className="block text-xs text-slate-300 mb-1.5">
                  Posição da marca-d&apos;água
                </label>
                <select
                  id="ov-pos"
                  disabled={saving}
                  value={selectedGame.overlayConfig.watermarkPosition}
                  onChange={(e) =>
                    void updateField({
                      watermarkPosition: e.target.value as OverlayConfig['watermarkPosition'],
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="bottom-right">Inferior direita</option>
                  <option value="bottom-left">Inferior esquerda</option>
                  <option value="top-right">Superior direita</option>
                  <option value="top-left">Superior esquerda</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ov-opacity" className="block text-xs text-slate-300 mb-1.5">
                  Opacidade da marca-d&apos;água ({Math.round(selectedGame.overlayConfig.watermarkOpacity * 100)}%)
                </label>
                <input
                  id="ov-opacity"
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={selectedGame.overlayConfig.watermarkOpacity}
                  onChange={(e) => void updateField({ watermarkOpacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="ov-scale" className="block text-xs text-slate-300 mb-1.5">
                  Escala do jogo ({Math.round(selectedGame.overlayConfig.scale * 100)}%)
                </label>
                <input
                  id="ov-scale"
                  type="range"
                  min={0.6}
                  max={1.2}
                  step={0.05}
                  value={selectedGame.overlayConfig.scale}
                  onChange={(e) => void updateField({ scale: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
                <span>Exibir notificação visual ao receber eventos</span>
                <input
                  type="checkbox"
                  checked={selectedGame.overlayConfig.showEventToast}
                  onChange={(e) => void updateField({ showEventToast: e.target.checked })}
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
                <span>
                  Exibir marca-d&apos;água MINHA LIVE GAMES{' '}
                  {!allowCustomWatermark && (
                    <span className="text-xs text-slate-500">(Obrigatória até o plano Premium; removível no Pro)</span>
                  )}
                </span>
                <input
                  type="checkbox"
                  disabled={!allowCustomWatermark}
                  checked={selectedGame.overlayConfig.showWatermark}
                  onChange={(e) => void updateField({ showWatermark: e.target.checked })}
                />
              </label>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#07080D] p-4 text-xs text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-200">Como adicionar no OBS Studio / TikTok LIVE Studio:</div>
              <p>1. Adicione uma fonte do tipo &quot;Navegador&quot; (Browser Source).</p>
              <p>2. Cole o link exclusivo <span className="font-mono text-slate-200">/overlay/{selectedGame.id}</span>.</p>
              <p>3. Defina largura e altura conforme sua transmissão (ex.: 1080×1920 para live vertical).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
