import React, { useCallback, useEffect, useState } from 'react';
import {
  Disc3,
  ListMusic,
  Music,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { uploadAudioTrackFile } from '../../services/musicUpload';
import type {
  AdminAiMusicRule,
  GameItem,
  MusicPlaylist,
  MusicSourceMode,
  MusicTrack,
} from '../../types/platform';

interface AdminMusicSectionProps {
  games: GameItem[];
}

export function AdminMusicSection({ games }: AdminMusicSectionProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [aiRules, setAiRules] = useState<AdminAiMusicRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [targetGameId, setTargetGameId] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);

  // Official Playlist Creation
  const [plName, setPlName] = useState('');
  const [plGameId, setPlGameId] = useState('all');
  const [plTrackIds, setPlTrackIds] = useState<string[]>([]);

  // Global AI Rule Form
  const [ruleGameId, setRuleGameId] = useState('all');
  const [defaultSourceMode, setDefaultSourceMode] = useState<MusicSourceMode>('mixed');
  const [prioritizeOfficialRatio, setPrioritizeOfficialRatio] = useState(0.6);
  const [avoidRepeatWindow, setAvoidRepeatWindow] = useState(3);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(2.5);
  const [preferredEnergy, setPreferredEnergy] = useState('auto');
  const [aiInstructions, setAiInstructions] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback((curr) => (curr === msg ? null : curr)), 3500);
  };

  const loadAdminMusicData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trkRes, plRes, ruleRes] = await Promise.all([
        apiRequest<{ tracks: MusicTrack[] }>('/api/music/tracks'),
        apiRequest<{ playlists: MusicPlaylist[] }>('/api/music/playlists'),
        apiRequest<{ rules: AdminAiMusicRule[] }>('/api/admin/music/ai-rules'),
      ]);
      setTracks(trkRes.tracks.filter((t) => t.scope === 'official'));
      setPlaylists(plRes.playlists.filter((p) => p.scope === 'official'));
      setAiRules(ruleRes.rules);

      const globalRule = ruleRes.rules.find((r) => r.gameId === 'all') || ruleRes.rules[0];
      if (globalRule) {
        setRuleGameId(globalRule.gameId);
        setDefaultSourceMode(globalRule.defaultSourceMode);
        setPrioritizeOfficialRatio(globalRule.prioritizeOfficialRatio);
        setAvoidRepeatWindow(globalRule.avoidRepeatWindow);
        setCrossfadeSeconds(globalRule.crossfadeSeconds);
        setPreferredEnergy(globalRule.preferredEnergy);
        setAiInstructions(globalRule.aiInstructions);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar Biblioteca Musical Global.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminMusicData();
  }, [loadAdminMusicData]);

  useEffect(() => {
    const match = aiRules.find((r) => r.gameId === ruleGameId);
    if (match) {
      setDefaultSourceMode(match.defaultSourceMode);
      setPrioritizeOfficialRatio(match.prioritizeOfficialRatio);
      setAvoidRepeatWindow(match.avoidRepeatWindow);
      setCrossfadeSeconds(match.crossfadeSeconds);
      setPreferredEnergy(match.preferredEnergy);
      setAiInstructions(match.aiInstructions);
    }
  }, [ruleGameId, aiRules]);

  const handleBatchUploadOfficial = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        const created = await uploadAudioTrackFile({
          file,
          scope: 'official',
          gameId: targetGameId,
        });
        setTracks((prev) => [created, ...prev]);
        count += 1;
      }
      showToast(`${count} música(s) oficial(is) enviada(s) e disponível(is) para os usuários!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar áudio oficial.');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceTrackAudio = async (trackId: string, file: File | undefined) => {
    if (!file) return;
    setReplacingTrackId(trackId);
    setError(null);
    try {
      const updated = await uploadAudioTrackFile({
        file,
        scope: 'official',
        gameId: targetGameId,
        replaceTrackId: trackId,
      });
      setTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));
      showToast(`Arquivo de áudio substituído em "${updated.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao substituir áudio.');
    } finally {
      setReplacingTrackId(null);
    }
  };

  const handleUpdateOfficialTrack = async (
    trackId: string,
    patch: Partial<{ gameId: string; isActive: boolean; title: string; genre: string; mood: string }>,
  ) => {
    setError(null);
    try {
      const res = await apiRequest<{ track: MusicTrack }>(`/api/music/tracks/${trackId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setTracks((prev) => prev.map((t) => (t.id === trackId ? res.track : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar música oficial.');
    }
  };

  const handleDeleteOfficialTrack = async (trackId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/music/tracks/${trackId}`, { method: 'DELETE' });
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      showToast('Música oficial excluída.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir música oficial.');
    }
  };

  const handleCreateOfficialPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plName.trim()) return;
    setError(null);
    try {
      const res = await apiRequest<{ playlist: MusicPlaylist }>('/api/music/playlists', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'official',
          gameId: plGameId,
          name: plName.trim(),
          trackIds: plTrackIds,
        }),
      });
      setPlaylists((prev) => [res.playlist, ...prev]);
      setPlName('');
      setPlTrackIds([]);
      showToast(`Playlist oficial "${res.playlist.name}" publicada!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar playlist oficial.');
    }
  };

  const handleDeleteOfficialPlaylist = async (playlistId: string) => {
    try {
      await apiRequest(`/api/music/playlists/${playlistId}`, { method: 'DELETE' });
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover playlist.');
    }
  };

  const handleSaveAiRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRule(true);
    setError(null);
    try {
      const res = await apiRequest<{ rule: AdminAiMusicRule }>(
        `/api/admin/music/ai-rules/${encodeURIComponent(ruleGameId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            defaultSourceMode,
            prioritizeOfficialRatio,
            avoidRepeatWindow,
            crossfadeSeconds,
            preferredEnergy,
            aiInstructions,
          }),
        },
      );
      setAiRules((prev) => {
        const exists = prev.some((r) => r.gameId === res.rule.gameId);
        return exists
          ? prev.map((r) => (r.gameId === res.rule.gameId ? res.rule : r))
          : [res.rule, ...prev];
      });
      showToast('Regras globais de Rádio IA salvas!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar regra global.');
    } finally {
      setSavingRule(false);
    }
  };

  const resolveGameName = (id: string) => {
    if (id === 'all') return 'Todos os jogos';
    return games.find((g) => g.id === id)?.name || id;
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-10 text-center text-sm text-slate-400">
        Carregando Central Musical Global (ADM)...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Músicas Globais & Regras de Rádio IA (ADM)
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Envie e organize músicas oficiais por jogo no Supabase Storage. Todas as faixas ativas ficam automaticamente disponíveis para todos os criadores sem precisar republicar jogos.
        </p>
      </div>

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

      {/* Upload Official Tracks */}
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="adm-target-game" className="block text-xs text-slate-300 mb-1.5">
            Vincular novas músicas oficiais ao jogo
          </label>
          <select
            id="adm-target-game"
            value={targetGameId}
            onChange={(e) => setTargetGameId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
          >
            <option value="all">Todos os jogos (Biblioteca Oficial Universal)</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.category})
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white cursor-pointer">
          <Upload className="w-4 h-4" />
          {uploading ? 'Enviando faixas...' : 'Enviar músicas oficiais (em lote)'}
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
            multiple
            disabled={uploading}
            onChange={(e) => void handleBatchUploadOfficial(e.target.files)}
            className="sr-only"
          />
        </label>
      </div>

      {/* Official Tracks List */}
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <Music className="w-4 h-4 text-[#22D3EE]" />
            Faixas Oficiais ({tracks.length})
          </h2>
        </div>

        {tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
            Nenhuma música oficial enviada ainda. Selecione um jogo acima e envie arquivos MP3, WAV, OGG, M4A ou FLAC.
          </div>
        ) : (
          <div className="space-y-3">
            {tracks.map((trk) => {
              const inPlaylist = plTrackIds.includes(trk.id);
              return (
                <div
                  key={trk.id}
                  className="rounded-xl border border-white/10 bg-[#0B0D14] p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={inPlaylist}
                      onChange={(e) => {
                        if (e.target.checked) setPlTrackIds((prev) => [...prev, trk.id]);
                        else setPlTrackIds((prev) => prev.filter((id) => id !== trk.id));
                      }}
                      aria-label={`Selecionar ${trk.title} para playlist oficial`}
                      className="accent-[#8B5CF6]"
                    />
                    <Disc3 className="w-5 h-5 text-[#A78BFA] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{trk.title}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {trk.artist || 'Oficial'} · {trk.genre} · clima: {trk.mood} · Jogo:{' '}
                        <span className="text-cyan-300">{resolveGameName(trk.gameId)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <audio controls preload="none" src={trk.audioUrl} className="h-8 max-w-[180px]" />

                    <select
                      value={trk.gameId}
                      onChange={(e) =>
                        void handleUpdateOfficialTrack(trk.id, { gameId: e.target.value })
                      }
                      aria-label={`Jogo atribuído para ${trk.title}`}
                      className="rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="all">Todos os jogos</option>
                      {games.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>

                    <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 cursor-pointer">
                      <RefreshCw className="w-3.5 h-3.5" />
                      {replacingTrackId === trk.id ? 'Trocando...' : 'Substituir'}
                      <input
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                        disabled={replacingTrackId === trk.id}
                        onChange={(e) => void handleReplaceTrackAudio(trk.id, e.target.files?.[0])}
                        className="sr-only"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        void handleUpdateOfficialTrack(trk.id, { isActive: !trk.isActive })
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                        trk.isActive
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 border-white/10'
                      }`}
                    >
                      {trk.isActive ? 'Ativa' : 'Desativada'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeleteOfficialTrack(trk.id)}
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
      </div>

      {/* Official Playlists */}
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-5 space-y-4">
        <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#A78BFA]" />
          Playlists Oficiais por Jogo
        </h2>

        <form onSubmit={handleCreateOfficialPlaylist} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={plName}
            onChange={(e) => setPlName(e.target.value)}
            placeholder="Nome da playlist oficial (selecione faixas acima)"
            className="rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
          />
          <select
            value={plGameId}
            onChange={(e) => setPlGameId(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
          >
            <option value="all">Todos os jogos</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB]"
          >
            Publicar Playlist ({plTrackIds.length} faixas)
          </button>
        </form>

        {playlists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className="rounded-lg border border-white/10 bg-[#0B0D14] px-4 py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{pl.name}</div>
                  <div className="text-xs text-slate-400">
                    {resolveGameName(pl.gameId)} · {pl.trackIds.length} faixa(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteOfficialPlaylist(pl.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 border border-white/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global AI Music Rules */}
      <form
        onSubmit={handleSaveAiRule}
        className="rounded-xl border border-[#8B5CF6]/30 bg-[#11131C] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#22D3EE]" />
              Regras Globais de Reprodução Automática por IA
            </h2>
            <p className="text-xs text-slate-400">
              Defina o comportamento padrão de seleção, crossfade, anti-repetição e diretrizes da IA para todos os jogos ou por título específico.
            </p>
          </div>
          <button
            type="submit"
            disabled={savingRule}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {savingRule ? 'Salvando...' : 'Salvar regra IA'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Escopo da regra</label>
            <select
              value={ruleGameId}
              onChange={(e) => setRuleGameId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            >
              <option value="all">Regra Global Padrão (Todos os jogos)</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Modo padrão de origem</label>
            <select
              value={defaultSourceMode}
              onChange={(e) => setDefaultSourceMode(e.target.value as MusicSourceMode)}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            >
              <option value="mixed">Misto (Oficiais + Pessoais)</option>
              <option value="official_only">Priorizar Oficiais</option>
              <option value="personal_only">Somente Pessoais</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Prioridade Oficial ({Math.round(prioritizeOfficialRatio * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={prioritizeOfficialRatio}
              onChange={(e) => setPrioritizeOfficialRatio(Number(e.target.value))}
              className="w-full accent-[#8B5CF6]"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Janela anti-repetição (faixas)
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={avoidRepeatWindow}
              onChange={(e) => setAvoidRepeatWindow(Math.max(1, Number(e.target.value) || 3))}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Crossfade padrão ({crossfadeSeconds}s)
            </label>
            <input
              type="number"
              min={0}
              max={8}
              step={0.5}
              value={crossfadeSeconds}
              onChange={(e) => setCrossfadeSeconds(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Energia recomendada</label>
            <select
              value={preferredEnergy}
              onChange={(e) => setPreferredEnergy(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            >
              <option value="auto">Automático por categoria</option>
              <option value="energetico">Energético</option>
              <option value="festivo">Festivo</option>
              <option value="dinamico">Dinâmico</option>
              <option value="epico">Épico</option>
              <option value="calmo">Calmo</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-300 mb-1">
            Instruções para a Curadoria Musical por IA
          </label>
          <textarea
            rows={2}
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
            placeholder="Ex.: Alternar faixas oficiais e pessoais evitando repetições e priorizando ritmo animado..."
            className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
          />
        </div>
      </form>
    </div>
  );
}
