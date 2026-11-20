import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Gamepad2,
  Gift,
  Library,
  ListMusic,
  Music,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { AVAILABLE_GAME_ACTIONS, TIKTOK_GIFT_PRESETS } from '../../lib/giftActions';
import { apiRequest } from '../../services/api';
import { uploadAudioTrackFile } from '../../services/musicUpload';
import type {
  AdminAiMusicRule,
  GameControlsConfig,
  GameItem,
  GameMusicPreferences,
  GameOverlayProfile,
  GiftActionKey,
  GiftMapping,
  LiveEventPayload,
  LiveEventType,
  MusicPlaylist,
  MusicSourceMode,
  MusicTrack,
  OverlayConfig,
  PlanTier,
  TikTokIntegrationStatus,
  UserRole,
} from '../../types/platform';
import { PLANS } from '../../lib/planLimits';
import { SmartMusicPlayer } from '../SmartMusicPlayer';

export type GameWorkspaceTab =
  | 'gifts'
  | 'music'
  | 'personal-music'
  | 'ai-radio'
  | 'tiktok'
  | 'overlay';

interface GameWorkspaceModalProps {
  game: GameItem;
  initialTab: GameWorkspaceTab;
  userRole: UserRole;
  userPlan: PlanTier;
  tiktokStatus: TikTokIntegrationStatus | null;
  onConnectTikTok: (username: string) => Promise<void>;
  onDisconnectTikTok: () => Promise<void>;
  onSimulateEvent: (payload: {
    gameId: string;
    type: LiveEventType;
    senderUsername: string;
    giftName?: string;
    giftCount?: number;
  }) => Promise<LiveEventPayload>;
  onClose: () => void;
}

const STUDIO_TABS: Array<{
  id: GameWorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'gifts', label: 'Presentes', icon: Gift },
  { id: 'music', label: 'Biblioteca Oficial', icon: Library },
  { id: 'personal-music', label: 'Minhas Músicas', icon: Music },
  { id: 'ai-radio', label: 'Rádio IA e Controles', icon: Sliders },
  { id: 'tiktok', label: 'Conectar TikTok', icon: Radio },
  { id: 'overlay', label: 'Gerar Overlay', icon: ExternalLink },
];

export function GameWorkspaceModal({
  game,
  initialTab,
  userRole,
  userPlan,
  tiktokStatus,
  onConnectTikTok,
  onDisconnectTikTok,
  onSimulateEvent,
  onClose,
}: GameWorkspaceModalProps) {
  const [activeTab, setActiveTab] = useState<GameWorkspaceTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [mappings, setMappings] = useState<GiftMapping[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [preferences, setPreferences] = useState<GameMusicPreferences | null>(null);
  const [adminRule, setAdminRule] = useState<AdminAiMusicRule | null>(null);
  const [overlayProfile, setOverlayProfile] = useState<GameOverlayProfile | null>(null);

  // Gift form state
  const [giftName, setGiftName] = useState('Rosa');
  const [minCount, setMinCount] = useState(1);
  const [actionKey, setActionKey] = useState<GiftActionKey>('move_walk');
  const [customCommand, setCustomCommand] = useState('');
  const [savingGift, setSavingGift] = useState(false);

  // Personal upload & playlist state
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedTrackIdsForPl, setSelectedTrackIdsForPl] = useState<string[]>([]);

  // AI & Controls & Overlay state
  const [curatingAi, setCuratingAi] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [savingOverlay, setSavingOverlay] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);

  // TikTok state
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [connectingTikTok, setConnectingTikTok] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mapRes, trkRes, plRes, prefRes, ovRes] = await Promise.all([
        apiRequest<{ mappings: GiftMapping[] }>(
          `/api/gift-mappings?gameId=${encodeURIComponent(game.id)}`,
        ),
        apiRequest<{ tracks: MusicTrack[] }>(
          `/api/music/tracks?gameId=${encodeURIComponent(game.id)}`,
        ),
        apiRequest<{ playlists: MusicPlaylist[] }>(
          `/api/music/playlists?gameId=${encodeURIComponent(game.id)}`,
        ),
        apiRequest<{ preferences: GameMusicPreferences; adminRule: AdminAiMusicRule }>(
          `/api/music/preferences/${encodeURIComponent(game.id)}`,
        ),
        apiRequest<{ profile: GameOverlayProfile }>(
          `/api/overlays/profile/${encodeURIComponent(game.id)}`,
        ),
      ]);
      setMappings(mapRes.mappings);
      setTracks(trkRes.tracks);
      setPlaylists(plRes.playlists);
      setPreferences(prefRes.preferences);
      setAdminRule(prefRes.adminRule);
      setOverlayProfile(ovRes.profile);
      setTiktokHandle(ovRes.profile.tiktokUsername || tiktokStatus?.connectedUsername || '');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar configurações deste jogo.',
      );
    } finally {
      setLoading(false);
    }
  }, [game.id, tiktokStatus?.connectedUsername]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback((curr) => (curr === msg ? null : curr)), 3500);
  };

  // --- Gift Mapping Actions ---
  const handleCreateGiftMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGift(true);
    setError(null);
    try {
      const option = AVAILABLE_GAME_ACTIONS.find((a) => a.key === actionKey);
      const res = await apiRequest<{ mapping: GiftMapping }>('/api/gift-mappings', {
        method: 'POST',
        body: JSON.stringify({
          gameId: game.id,
          giftName: giftName.trim(),
          minCount,
          actionKey,
          actionLabel: option?.label,
          actionCommand:
            actionKey === 'custom' && customCommand.trim()
              ? customCommand.trim()
              : option?.defaultCommand,
          actionPayload: option?.defaultPayload || {},
          enabled: true,
        }),
      });
      setMappings((prev) => [res.mapping, ...prev]);
      showToast(`Presente "${res.mapping.giftName}" vinculado ao jogo!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar presente.');
    } finally {
      setSavingGift(false);
    }
  };

  const handleToggleGiftEnabled = async (m: GiftMapping) => {
    try {
      const res = await apiRequest<{ mapping: GiftMapping }>(`/api/gift-mappings/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !m.enabled }),
      });
      setMappings((prev) => prev.map((item) => (item.id === m.id ? res.mapping : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar presente.');
    }
  };

  const handleDeleteGift = async (id: string) => {
    try {
      await apiRequest(`/api/gift-mappings/${id}`, { method: 'DELETE' });
      setMappings((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover presente.');
    }
  };

  const handleTestGiftTrigger = async (m: GiftMapping) => {
    setError(null);
    try {
      await onSimulateEvent({
        gameId: game.id,
        type: 'gift',
        senderUsername: 'espectador_teste',
        giftName: m.giftName,
        giftCount: m.minCount,
      });
      showToast(`Evento de presente "${m.giftName}" enviado para o jogo e overlay!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao disparar presente de teste.');
    }
  };

  // --- Personal Music Actions ---
  const handleUploadPersonalMusic = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    setError(null);
    let uploadedCount = 0;
    try {
      for (const file of Array.from(files)) {
        const created = await uploadAudioTrackFile({
          file,
          scope: 'personal',
          gameId: game.id,
        });
        setTracks((prev) => [created, ...prev]);
        uploadedCount += 1;
      }
      showToast(`${uploadedCount} faixa(s) enviada(s) para sua biblioteca pessoal!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo de áudio.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleTogglePersonalTrackActive = async (track: MusicTrack) => {
    try {
      const res = await apiRequest<{ track: MusicTrack }>(`/api/music/tracks/${track.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !track.isActive }),
      });
      setTracks((prev) => prev.map((t) => (t.id === track.id ? res.track : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar estado da música.');
    }
  };

  const handleDeletePersonalTrack = async (trackId: string) => {
    try {
      await apiRequest(`/api/music/tracks/${trackId}`, { method: 'DELETE' });
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      showToast('Música pessoal removida.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover música.');
    }
  };

  const handleCreatePersonalPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setError(null);
    try {
      const res = await apiRequest<{ playlist: MusicPlaylist }>('/api/music/playlists', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'personal',
          gameId: game.id,
          name: newPlaylistName.trim(),
          trackIds: selectedTrackIdsForPl,
        }),
      });
      setPlaylists((prev) => [res.playlist, ...prev]);
      setNewPlaylistName('');
      setSelectedTrackIdsForPl([]);
      showToast(`Playlist "${res.playlist.name}" criada!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar playlist.');
    }
  };

  const handleDeletePersonalPlaylist = async (id: string) => {
    try {
      await apiRequest(`/api/music/playlists/${id}`, { method: 'DELETE' });
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover playlist.');
    }
  };

  // --- Preferences, AI Curation & Controls ---
  const savePreferencesPatch = async (
    patch: Partial<Omit<GameMusicPreferences, 'activePlaylistId'>> & {
      activePlaylistId?: string | null;
    },
  ) => {
    if (!preferences) return;
    setError(null);
    try {
      const res = await apiRequest<{ preferences: GameMusicPreferences }>(
        `/api/music/preferences/${encodeURIComponent(game.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        },
      );
      setPreferences(res.preferences);
      showToast('Preferências musicais salvas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar preferências.');
    }
  };

  const handleCurateWithAi = async () => {
    setCuratingAi(true);
    setError(null);
    try {
      const res = await apiRequest<{
        curation: { orderedTrackIds: string[]; recommendedMood: string; rationale: string; engine: string };
        preferences: GameMusicPreferences;
      }>(`/api/music/ai-curate/${encodeURIComponent(game.id)}`, {
        method: 'POST',
        body: JSON.stringify({
          sourceMode: preferences?.sourceMode,
          preferredMood: preferences?.preferredMood,
        }),
      });
      setPreferences(res.preferences);
      setAiRationale(`${res.curation.rationale} (Motor: ${res.curation.engine})`);
      showToast('Fila da Rádio IA reorganizada!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao organizar fila com IA.');
    } finally {
      setCuratingAi(false);
    }
  };

  const saveOverlayProfilePatch = async (patch: {
    label?: string;
    tiktokUsername?: string;
    controlsConfig?: GameControlsConfig;
    overlayConfig?: OverlayConfig;
    isActive?: boolean;
  }) => {
    setSavingOverlay(true);
    setError(null);
    try {
      const res = await apiRequest<{ profile: GameOverlayProfile }>(
        `/api/overlays/profile/${encodeURIComponent(game.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(patch),
        },
      );
      setOverlayProfile(res.profile);
      showToast('Configurações do jogo e overlay salvas!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar overlay.');
    } finally {
      setSavingOverlay(false);
    }
  };

  const handleRegenerateOverlayLink = async () => {
    setSavingOverlay(true);
    setError(null);
    try {
      const res = await apiRequest<{ profile: GameOverlayProfile }>(
        `/api/overlays/profile/${encodeURIComponent(game.id)}/regenerate`,
        { method: 'POST' },
      );
      setOverlayProfile(res.profile);
      showToast('Novo link exclusivo de overlay gerado!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao regenerar link.');
    } finally {
      setSavingOverlay(false);
    }
  };

  const handleConnectTikTokFromStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectingTikTok(true);
    setError(null);
    try {
      const clean = tiktokHandle.trim().replace(/^@+/, '');
      if (overlayProfile) {
        await saveOverlayProfilePatch({ tiktokUsername: clean });
      }
      await onConnectTikTok(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar TikTok LIVE.');
    } finally {
      setConnectingTikTok(false);
    }
  };

  const officialTracks = tracks.filter((t) => t.scope === 'official');
  const personalTracks = tracks.filter((t) => t.scope === 'personal');
  const officialPlaylists = playlists.filter((p) => p.scope === 'official');
  const personalPlaylists = playlists.filter((p) => p.scope === 'personal');
  const activePlaylist = preferences?.activePlaylistId
    ? playlists.find((p) => p.id === preferences.activePlaylistId)
    : undefined;

  const customOverlayUrl = overlayProfile
    ? `${window.location.origin}/overlay/${overlayProfile.id}`
    : `${window.location.origin}/overlay/${game.id}`;

  const allowWatermarkCustomization = PLANS[userPlan]?.allowCustomWatermark ?? false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Estúdio de configuração de ${game.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-[#0B0D14] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#11131C] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center shrink-0">
              <Gamepad2 className="w-5 h-5 text-[#22D3EE]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-white truncate">
                Estúdio do Jogo: {game.name}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {game.category} · {game.engine.toUpperCase()} · Presentes, Músicas, IA e Overlay exclusivo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar estúdio do jogo"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2.5 border-b border-white/10 bg-[#07080D] flex items-center gap-1.5 overflow-x-auto">
          {STUDIO_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-[#8B5CF6]/25 to-[#3B82F6]/20 text-white border border-[#3B82F6]/40'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#22D3EE]' : 'text-slate-500'}`} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        {(error || feedback) && (
          <div className="px-6 pt-3">
            {error && (
              <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            )}
            {feedback && (
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
                {feedback}
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Carregando configurações do jogo...
            </div>
          ) : (
            <>
              {/* TAB 1: GIFTS */}
              {activeTab === 'gifts' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-display text-base font-semibold text-white">
                      Sistema de Presentes Personalizados
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Vincule presentes reais do TikTok LIVE a ações executadas automaticamente dentro deste jogo.
                    </p>
                  </div>

                  {/* Presets */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 mr-1">Sugestões rápidas:</span>
                    {TIKTOK_GIFT_PRESETS.slice(0, 6).map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setGiftName(preset.name);
                          setActionKey(preset.suggestedAction);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-white/10 bg-[#11131C] hover:bg-white/10 text-xs text-slate-200"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={handleCreateGiftMapping}
                    className="rounded-xl border border-white/10 bg-[#11131C] p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                  >
                    <div>
                      <label htmlFor="gift-name-input" className="block text-xs text-slate-300 mb-1">
                        Presente do TikTok
                      </label>
                      <input
                        id="gift-name-input"
                        type="text"
                        value={giftName}
                        onChange={(e) => setGiftName(e.target.value)}
                        placeholder="Ex.: Rosa, Coração, Galaxy"
                        required
                        className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="gift-action-select" className="block text-xs text-slate-300 mb-1">
                        Ação no jogo
                      </label>
                      <select
                        id="gift-action-select"
                        value={actionKey}
                        onChange={(e) => setActionKey(e.target.value as GiftActionKey)}
                        className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                      >
                        {AVAILABLE_GAME_ACTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="gift-min-count" className="block text-xs text-slate-300 mb-1">
                        Qtd. mínima
                      </label>
                      <input
                        id="gift-min-count"
                        type="number"
                        min={1}
                        max={999}
                        value={minCount}
                        onChange={(e) => setMinCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingGift}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white disabled:opacity-60"
                    >
                      <Plus className="w-4 h-4" />
                      {savingGift ? 'Salvando...' : 'Adicionar presente'}
                    </button>

                    {actionKey === 'custom' && (
                      <div className="md:col-span-4">
                        <label htmlFor="gift-custom-cmd" className="block text-xs text-slate-300 mb-1">
                          Nome do comando SDK (window.MinhaLiveGames.onCommand)
                        </label>
                        <input
                          id="gift-custom-cmd"
                          type="text"
                          value={customCommand}
                          onChange={(e) => setCustomCommand(e.target.value)}
                          placeholder="Ex.: spawn_boss"
                          className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                        />
                      </div>
                    )}
                  </form>

                  {/* Configured Mappings List */}
                  <div className="space-y-2.5">
                    {mappings.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                        Nenhum presente configurado ainda para {game.name}. Adicione um acima (ex.: Rosa → Personagem anda).
                      </div>
                    ) : (
                      mappings.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-white/10 bg-[#11131C] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{m.giftName}</span>
                              <span className="text-xs text-slate-400">
                                (mín. {m.minCount}x) →{' '}
                                <span className="text-cyan-300 font-medium">{m.actionLabel}</span>
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              comando: {m.actionCommand}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleTestGiftTrigger(m)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 text-blue-200 border border-[#3B82F6]/30"
                            >
                              <Play className="w-3 h-3" />
                              Testar presente
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleGiftEnabled(m)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                                m.enabled
                                  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                                  : 'bg-white/5 text-slate-400 border-white/10'
                              }`}
                            >
                              {m.enabled ? 'Ativo' : 'Pausado'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteGift(m.id)}
                              aria-label={`Remover presente ${m.giftName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: OFFICIAL MUSIC LIBRARY (READ-ONLY FOR USERS) */}
              {activeTab === 'music' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        Biblioteca Musical Oficial do Administrador
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Faixas e playlists gerenciadas pelo ADM e sincronizadas automaticamente para todos os usuários.
                        {userRole !== 'admin' && ' (Somente leitura — gerenciada pelo administrador)'}
                      </p>
                    </div>
                  </div>

                  {officialPlaylists.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {officialPlaylists.map((pl) => (
                        <div
                          key={pl.id}
                          className="rounded-xl border border-[#8B5CF6]/30 bg-[#11131C] p-3.5 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-sm font-semibold text-white">{pl.name}</div>
                            <div className="text-xs text-slate-400">
                              Playlist Oficial · {pl.trackIds.length} faixa(s)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void savePreferencesPatch({ activePlaylistId: pl.id })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                              preferences?.activePlaylistId === pl.id
                                ? 'bg-[#8B5CF6]/30 text-white border-[#8B5CF6]'
                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {preferences?.activePlaylistId === pl.id ? 'Em uso' : 'Usar no jogo'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {officialTracks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
                      O administrador ainda não publicou faixas oficiais para este jogo. Você pode adicionar suas próprias músicas na aba "Minhas Músicas".
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {officialTracks.map((trk) => (
                        <div
                          key={trk.id}
                          className="rounded-xl border border-white/10 bg-[#11131C] p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {trk.title}
                            </div>
                            <div className="text-xs text-slate-400">
                              {trk.artist || 'Trilha Oficial'} · {trk.genre} · clima: {trk.mood}
                            </div>
                          </div>
                          <audio controls preload="none" src={trk.audioUrl} className="h-8 max-w-[260px]" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PERSONAL USER MUSIC */}
              {activeTab === 'personal-music' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        Minhas Músicas Pessoais ({game.name})
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Envie suas próprias músicas (MP3, WAV, OGG, M4A, FLAC) armazenadas no Supabase Storage para tocar só nas suas lives.
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white cursor-pointer">
                      <Upload className="w-4 h-4" />
                      {uploadingFiles ? 'Enviando...' : 'Enviar músicas'}
                      <input
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                        multiple
                        disabled={uploadingFiles}
                        onChange={(e) => void handleUploadPersonalMusic(e.target.files)}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* Personal Tracks */}
                  {personalTracks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
                      Você ainda não enviou nenhuma música pessoal para este jogo.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {personalTracks.map((trk) => {
                        const checkedForPl = selectedTrackIdsForPl.includes(trk.id);
                        return (
                          <div
                            key={trk.id}
                            className="rounded-xl border border-white/10 bg-[#11131C] p-3.5 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={checkedForPl}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTrackIdsForPl((prev) => [...prev, trk.id]);
                                  } else {
                                    setSelectedTrackIdsForPl((prev) =>
                                      prev.filter((id) => id !== trk.id),
                                    );
                                  }
                                }}
                                aria-label={`Selecionar ${trk.title} para playlist`}
                                className="accent-[#8B5CF6]"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate">
                                  {trk.title}
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                  {trk.artist || 'Minha faixa'} · {trk.genre} ·{' '}
                                  {(trk.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <audio controls preload="none" src={trk.audioUrl} className="h-8 max-w-[200px]" />
                              <button
                                type="button"
                                onClick={() => void handleTogglePersonalTrackActive(trk)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                                  trk.isActive
                                    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                                    : 'bg-white/5 text-slate-400 border-white/10'
                                }`}
                              >
                                {trk.isActive ? 'Ativa' : 'Inativa'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeletePersonalTrack(trk.id)}
                                aria-label={`Excluir ${trk.title}`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Personal Playlists */}
                  <div className="rounded-xl border border-white/10 bg-[#11131C] p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <ListMusic className="w-4 h-4 text-[#22D3EE]" />
                      Minhas Playlists Pessoais
                    </div>

                    <form onSubmit={handleCreatePersonalPlaylist} className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="Nome da playlist (marque as faixas acima)"
                        className="flex-1 min-w-[220px] rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB]"
                      >
                        Criar playlist ({selectedTrackIdsForPl.length} faixas)
                      </button>
                    </form>

                    {personalPlaylists.length > 0 && (
                      <div className="space-y-2">
                        {personalPlaylists.map((pl) => (
                          <div
                            key={pl.id}
                            className="rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="text-xs text-slate-200">
                              <span className="font-semibold text-white">{pl.name}</span> ·{' '}
                              {pl.trackIds.length} faixa(s)
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void savePreferencesPatch({
                                    activePlaylistId:
                                      preferences?.activePlaylistId === pl.id ? null : pl.id,
                                  })
                                }
                                className="px-2.5 py-1 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white"
                              >
                                {preferences?.activePlaylistId === pl.id ? 'Desativar' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeletePersonalPlaylist(pl.id)}
                                className="p-1 text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: SMART AI RADIO & GAME CONTROLS */}
              {activeTab === 'ai-radio' && preferences && overlayProfile && (
                <div className="space-y-6">
                  <SmartMusicPlayer
                    game={game}
                    tracks={tracks}
                    preferences={preferences}
                    adminRule={adminRule}
                    activePlaylistTrackIds={activePlaylist?.trackIds}
                    variant="studio"
                    onVolumeChange={(vol, isMuted) =>
                      void savePreferencesPatch({ volume: vol, muted: isMuted })
                    }
                  />

                  {/* AI Music Settings */}
                  <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-sm font-semibold text-white">
                          Reprodução Automática e Inteligência Musical
                        </h3>
                        <p className="text-xs text-slate-400">
                          Escolha de onde vêm as músicas e como a IA alterna faixas sem repetições.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={curatingAi}
                        onClick={() => void handleCurateWithAi()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white disabled:opacity-60"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {curatingAi ? 'Analisando...' : 'Gerar fila com IA'}
                      </button>
                    </div>

                    {aiRationale && (
                      <div className="rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 p-3 text-xs text-purple-100">
                        {aiRationale}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="music-source-mode" className="block text-xs text-slate-300 mb-1">
                          Origem das músicas
                        </label>
                        <select
                          id="music-source-mode"
                          value={preferences.sourceMode}
                          onChange={(e) =>
                            void savePreferencesPatch({
                              sourceMode: e.target.value as MusicSourceMode,
                            })
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                        >
                          <option value="mixed">Músicas do ADM + Minhas Músicas</option>
                          <option value="official_only">Somente Biblioteca Oficial do ADM</option>
                          <option value="personal_only">Somente Minhas Músicas</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="music-mood" className="block text-xs text-slate-300 mb-1">
                          Clima / Energia do jogo
                        </label>
                        <select
                          id="music-mood"
                          value={preferences.preferredMood}
                          onChange={(e) =>
                            void savePreferencesPatch({ preferredMood: e.target.value })
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                        >
                          <option value="auto">Automático (por categoria do jogo)</option>
                          <option value="energetico">Energético / Turbo</option>
                          <option value="festivo">Festivo / Live animada</option>
                          <option value="dinamico">Dinâmico / Arcade</option>
                          <option value="epico">Épico / Batalha</option>
                          <option value="calmo">Calmo / Lo-Fi</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="music-crossfade" className="block text-xs text-slate-300 mb-1">
                          Crossfade entre faixas: {preferences.crossfadeSeconds}s
                        </label>
                        <input
                          id="music-crossfade"
                          type="range"
                          min={0}
                          max={6}
                          step={0.5}
                          value={preferences.crossfadeSeconds}
                          onChange={(e) =>
                            void savePreferencesPatch({ crossfadeSeconds: Number(e.target.value) })
                          }
                          className="w-full accent-[#22D3EE]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-5 pt-2">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.autoplayEnabled}
                          onChange={(e) =>
                            void savePreferencesPatch({ autoplayEnabled: e.target.checked })
                          }
                          className="accent-[#8B5CF6]"
                        />
                        Iniciar rádio automaticamente ao abrir o jogo e overlay
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.aiDjEnabled}
                          onChange={(e) =>
                            void savePreferencesPatch({ aiDjEnabled: e.target.checked })
                          }
                          className="accent-[#8B5CF6]"
                        />
                        IA DJ contínua sem repetir faixas consecutivas
                      </label>
                    </div>
                  </div>

                  {/* Per-Game Controls & Gameplay Options */}
                  <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-sm font-semibold text-white">
                          Controles e Ações do Jogo
                        </h3>
                        <p className="text-xs text-slate-400">
                          Ajuste intensidade, velocidade e exibição de widgets no overlay deste jogo.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={savingOverlay}
                        onClick={() =>
                          void saveOverlayProfilePatch({
                            controlsConfig: overlayProfile.controlsConfig,
                          })
                        }
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-60"
                      >
                        {savingOverlay ? 'Salvando...' : 'Salvar controles'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Velocidade do jogo ({overlayProfile.controlsConfig.speedMultiplier}x)
                        </label>
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.1}
                          value={overlayProfile.controlsConfig.speedMultiplier}
                          onChange={(e) =>
                            setOverlayProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    controlsConfig: {
                                      ...prev.controlsConfig,
                                      speedMultiplier: Number(e.target.value),
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="w-full accent-[#8B5CF6]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Intensidade das ações ({overlayProfile.controlsConfig.actionIntensity}x)
                        </label>
                        <input
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.25}
                          value={overlayProfile.controlsConfig.actionIntensity}
                          onChange={(e) =>
                            setOverlayProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    controlsConfig: {
                                      ...prev.controlsConfig,
                                      actionIntensity: Number(e.target.value),
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="w-full accent-[#22D3EE]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          Cooldown entre ações (ms)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          step={100}
                          value={overlayProfile.controlsConfig.globalCooldownMs}
                          onChange={(e) =>
                            setOverlayProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    controlsConfig: {
                                      ...prev.controlsConfig,
                                      globalCooldownMs: Math.max(0, Number(e.target.value) || 0),
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-1.5 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-5 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overlayProfile.controlsConfig.autoTriggerOnGift}
                          onChange={(e) =>
                            setOverlayProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    controlsConfig: {
                                      ...prev.controlsConfig,
                                      autoTriggerOnGift: e.target.checked,
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="accent-[#8B5CF6]"
                        />
                        Disparar ações automaticamente com presentes da live
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overlayProfile.controlsConfig.showMusicWidgetInOverlay}
                          onChange={(e) =>
                            setOverlayProfile((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    controlsConfig: {
                                      ...prev.controlsConfig,
                                      showMusicWidgetInOverlay: e.target.checked,
                                    },
                                  }
                                : prev,
                            )
                          }
                          className="accent-[#8B5CF6]"
                        />
                        Exibir mini player musical discreto no overlay
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: CONNECT TIKTOK LIVE */}
              {activeTab === 'tiktok' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-display text-base font-semibold text-white">
                          Conexão com a Live do TikTok
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Informe seu @ do TikTok para receber presentes, comentários, curtidas e seguidores em tempo real neste jogo.
                        </p>
                      </div>

                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          tiktokStatus?.status === 'connected'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-slate-300 border-white/10'
                        }`}
                      >
                        {tiktokStatus?.status === 'connected' ? (
                          <>
                            <Wifi className="w-3.5 h-3.5" />
                            Conectado: @{tiktokStatus.connectedUsername}
                          </>
                        ) : (
                          <>
                            <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                            Desconectado
                          </>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleConnectTikTokFromStudio} className="flex flex-wrap gap-3">
                      <input
                        type="text"
                        value={tiktokHandle}
                        onChange={(e) => setTiktokHandle(e.target.value)}
                        placeholder="@seu_usuario_tiktok"
                        aria-label="Usuário do TikTok"
                        className="flex-1 min-w-[240px] rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white"
                      />
                      <button
                        type="submit"
                        disabled={connectingTikTok}
                        className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white disabled:opacity-60"
                      >
                        {connectingTikTok ? 'Conectando...' : 'Conectar TikTok'}
                      </button>
                      {tiktokStatus?.status === 'connected' && (
                        <button
                          type="button"
                          onClick={() => void onDisconnectTikTok()}
                          className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 text-red-200 border border-red-500/30"
                        >
                          Desconectar
                        </button>
                      )}
                    </form>

                    {tiktokStatus?.lastError && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                        {tiktokStatus.lastError}
                      </div>
                    )}
                    {tiktokStatus?.documentationNote && (
                      <p className="text-xs text-slate-400">{tiktokStatus.documentationNote}</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: CUSTOM GENERATED OVERLAY LINK */}
              {activeTab === 'overlay' && overlayProfile && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-[#3B82F6]/30 bg-[#11131C] p-5 space-y-4">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        Link Exclusivo de Overlay ({game.name})
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Este link combina seu jogo, seus presentes personalizados, controles, músicas do ADM + suas músicas e a Rádio IA para uso no OBS Studio ou TikTok LIVE Studio.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={customOverlayUrl}
                        aria-label="URL exclusiva do overlay"
                        className="flex-1 min-w-[260px] rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-xs font-mono text-cyan-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(customOverlayUrl);
                          setCopiedOverlay(true);
                          window.setTimeout(() => setCopiedOverlay(false), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10"
                      >
                        {copiedOverlay ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copiedOverlay ? 'Copiado!' : 'Copiar link'}
                      </button>
                      <a
                        href={customOverlayUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Abrir overlay
                      </a>
                      <button
                        type="button"
                        disabled={savingOverlay}
                        onClick={() => void handleRegenerateOverlayLink()}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerar link
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Fundo no OBS / LIVE Studio</label>
                        <select
                          value={overlayProfile.overlayConfig.backgroundMode}
                          onChange={(e) =>
                            void saveOverlayProfilePatch({
                              overlayConfig: {
                                ...overlayProfile.overlayConfig,
                                backgroundMode: e.target.value as OverlayConfig['backgroundMode'],
                              },
                            })
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                        >
                          <option value="transparent">Transparente (OBS Browser Source)</option>
                          <option value="obsidian">Escuro Obsidian</option>
                          <option value="chroma-green">Chroma Key Verde</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            checked={overlayProfile.overlayConfig.showEventToast}
                            onChange={(e) =>
                              void saveOverlayProfilePatch({
                                overlayConfig: {
                                  ...overlayProfile.overlayConfig,
                                  showEventToast: e.target.checked,
                                },
                              })
                            }
                            className="accent-[#8B5CF6]"
                          />
                          Mostrar alertas de presentes no overlay
                        </label>
                      </div>

                      <div className="flex items-end">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            disabled={!allowWatermarkCustomization}
                            checked={overlayProfile.overlayConfig.showWatermark}
                            onChange={(e) =>
                              void saveOverlayProfilePatch({
                                overlayConfig: {
                                  ...overlayProfile.overlayConfig,
                                  showWatermark: e.target.checked,
                                },
                              })
                            }
                            className="accent-[#8B5CF6]"
                          />
                          Exibir marca d&apos;água {!allowWatermarkCustomization && '(Pro)'}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
