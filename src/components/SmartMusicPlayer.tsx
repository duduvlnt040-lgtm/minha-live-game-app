import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Disc3,
  Music2,
  Pause,
  Play,
  Radio,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  buildUpcomingQueue,
  filterEligibleTracks,
  selectNextTrackWithAi,
  type AiTrackGameContext,
} from '../lib/smartMusicAi';
import type {
  AdminAiMusicRule,
  GameMusicPreferences,
  MusicTrack,
} from '../types/platform';

interface SmartMusicPlayerProps {
  game: AiTrackGameContext;
  tracks: MusicTrack[];
  preferences?: Partial<GameMusicPreferences> | null;
  adminRule?: Partial<AdminAiMusicRule> | null;
  activePlaylistTrackIds?: string[];
  variant?: 'studio' | 'overlay';
  onVolumeChange?: (volume: number, muted: boolean) => void;
}

interface PersistedPlaybackState {
  trackId: string;
  currentTime: number;
  recentIds: string[];
  pausedByUser: boolean;
}

export function SmartMusicPlayer({
  game,
  tracks,
  preferences,
  adminRule,
  activePlaylistTrackIds,
  variant = 'studio',
  onVolumeChange,
}: SmartMusicPlayerProps) {
  const sourceMode = preferences?.sourceMode || adminRule?.defaultSourceMode || 'mixed';
  const autoplayEnabled = preferences?.autoplayEnabled ?? true;
  const crossfadeSeconds = Math.max(
    0,
    Math.min(6, preferences?.crossfadeSeconds ?? adminRule?.crossfadeSeconds ?? 2.5),
  );

  const eligibleTracks = useMemo(
    () => filterEligibleTracks(tracks, sourceMode, game.id, activePlaylistTrackIds),
    [tracks, sourceMode, game.id, activePlaylistTrackIds],
  );

  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [recentTrackIds, setRecentTrackIds] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [volume, setVolume] = useState<number>(preferences?.volume ?? 75);
  const [muted, setMuted] = useState<boolean>(preferences?.muted ?? false);
  const [progressSec, setProgressSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const fadeIntervalRef = useRef<number | null>(null);
  const crossfadeStartedForIdRef = useRef<string | null>(null);
  const pausedByUserRef = useRef(false);

  const storageKey = `mlg_radio_${game.id}`;

  useEffect(() => {
    if (typeof preferences?.volume === 'number') setVolume(preferences.volume);
    if (typeof preferences?.muted === 'boolean') setMuted(preferences.muted);
  }, [preferences?.volume, preferences?.muted]);

  const targetGain = muted ? 0 : Math.max(0, Math.min(1, volume / 100));

  const getActiveAudio = () =>
    activeSlotRef.current === 'A' ? audioARef.current : audioBRef.current;
  const getStandbyAudio = () =>
    activeSlotRef.current === 'A' ? audioBRef.current : audioARef.current;

  const stopFade = () => {
    if (fadeIntervalRef.current !== null) {
      window.clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  // Sync live volume changes to active audio element
  useEffect(() => {
    const active = getActiveAudio();
    if (active && fadeIntervalRef.current === null) {
      active.volume = targetGain;
    }
  }, [targetGain]);

  const startTrackInSlot = useCallback(
    async (
      track: MusicTrack,
      options: { startAt?: number; useCrossfade?: boolean; autoStart?: boolean } = {},
    ) => {
      const incoming = options.useCrossfade ? getStandbyAudio() : getActiveAudio();
      const outgoing = options.useCrossfade ? getActiveAudio() : null;
      if (!incoming) return;

      stopFade();
      crossfadeStartedForIdRef.current = null;

      incoming.src = track.audioUrl;
      incoming.crossOrigin = 'anonymous';
      incoming.preload = 'auto';

      const applySeek = () => {
        if (options.startAt && options.startAt > 1 && Number.isFinite(incoming.duration)) {
          if (options.startAt < incoming.duration - 2) {
            incoming.currentTime = options.startAt;
          }
        }
      };

      if (incoming.readyState >= 1) {
        applySeek();
      } else {
        incoming.addEventListener('loadedmetadata', applySeek, { once: true });
      }

      if (options.useCrossfade) {
        activeSlotRef.current = activeSlotRef.current === 'A' ? 'B' : 'A';
        incoming.volume = 0;
      } else {
        incoming.volume = targetGain;
      }

      setCurrentTrack(track);
      setRecentTrackIds((prev) => {
        const next = [...prev.filter((id) => id !== track.id), track.id].slice(-10);
        return next;
      });

      if (options.autoStart === false) {
        setIsPlaying(false);
        return;
      }

      try {
        await incoming.play();
        setIsPlaying(true);
        setAutoplayBlocked(false);

        if (options.useCrossfade && outgoing && crossfadeSeconds > 0.2) {
          const steps = 20;
          const stepMs = (crossfadeSeconds * 1000) / steps;
          let currentStep = 0;
          const initialOutVol = outgoing.volume;

          fadeIntervalRef.current = window.setInterval(() => {
            currentStep += 1;
            const ratio = Math.min(1, currentStep / steps);
            incoming.volume = targetGain * ratio;
            outgoing.volume = Math.max(0, initialOutVol * (1 - ratio));
            if (ratio >= 1) {
              stopFade();
              outgoing.pause();
              outgoing.currentTime = 0;
            }
          }, stepMs);
        } else if (outgoing) {
          outgoing.pause();
          outgoing.currentTime = 0;
        }
      } catch (err) {
        const isNotAllowed =
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'AbortError');
        if (isNotAllowed) {
          setAutoplayBlocked(true);
          setIsPlaying(false);
        }
      }
    },
    [crossfadeSeconds, targetGain],
  );

  const playNextTrack = useCallback(
    (useCrossfade = true) => {
      if (eligibleTracks.length === 0) return;
      const next = selectNextTrackWithAi({
        tracks: eligibleTracks,
        game,
        preferences,
        adminRule,
        currentTrackId: currentTrack?.id || null,
        recentTrackIds,
        activePlaylistTrackIds,
        jitterSeed: Date.now() % 17,
      });
      if (!next) return;
      pausedByUserRef.current = false;
      void startTrackInSlot(next, {
        useCrossfade: useCrossfade && eligibleTracks.length > 1,
        autoStart: true,
      });
    },
    [
      activePlaylistTrackIds,
      adminRule,
      currentTrack?.id,
      eligibleTracks,
      game,
      preferences,
      recentTrackIds,
      startTrackInSlot,
    ],
  );

  // Initialize / recover playback when eligible tracks become available
  useEffect(() => {
    if (eligibleTracks.length === 0) {
      getActiveAudio()?.pause();
      getStandbyAudio()?.pause();
      setCurrentTrack(null);
      setIsPlaying(false);
      return;
    }

    const stillEligible = currentTrack && eligibleTracks.some((t) => t.id === currentTrack.id);
    if (stillEligible) return;

    let saved: PersistedPlaybackState | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as PersistedPlaybackState;
    } catch {
      saved = null;
    }

    const recoveredTrack = saved?.trackId
      ? eligibleTracks.find((t) => t.id === saved?.trackId)
      : undefined;

    if (recoveredTrack) {
      pausedByUserRef.current = Boolean(saved?.pausedByUser);
      setRecentTrackIds(Array.isArray(saved?.recentIds) ? saved.recentIds : [recoveredTrack.id]);
      void startTrackInSlot(recoveredTrack, {
        startAt: saved?.currentTime || 0,
        useCrossfade: false,
        autoStart: autoplayEnabled && !saved?.pausedByUser,
      });
      return;
    }

    const initialTrack = selectNextTrackWithAi({
      tracks: eligibleTracks,
      game,
      preferences,
      adminRule,
      activePlaylistTrackIds,
    });

    if (initialTrack) {
      void startTrackInSlot(initialTrack, {
        useCrossfade: false,
        autoStart: autoplayEnabled && !pausedByUserRef.current,
      });
    }
  }, [
    activePlaylistTrackIds,
    adminRule,
    autoplayEnabled,
    currentTrack,
    eligibleTracks,
    game,
    preferences,
    startTrackInSlot,
    storageKey,
  ]);

  // Persist progress & trigger seamless crossfade near track end
  useEffect(() => {
    const timer = window.setInterval(() => {
      const active = getActiveAudio();
      if (!active || !currentTrack) return;

      const cur = Number.isFinite(active.currentTime) ? active.currentTime : 0;
      const dur = Number.isFinite(active.duration) ? active.duration : 0;
      setProgressSec(cur);
      setDurationSec(dur);

      try {
        const snapshot: PersistedPlaybackState = {
          trackId: currentTrack.id,
          currentTime: cur,
          recentIds: recentTrackIds,
          pausedByUser: pausedByUserRef.current,
        };
        sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
      } catch {
        // Ignore storage errors inside restricted contexts
      }

      if (
        autoplayEnabled &&
        !pausedByUserRef.current &&
        isPlaying &&
        dur > crossfadeSeconds + 3 &&
        dur - cur <= crossfadeSeconds &&
        crossfadeStartedForIdRef.current !== currentTrack.id
      ) {
        crossfadeStartedForIdRef.current = currentTrack.id;
        playNextTrack(true);
      }
    }, 450);

    return () => window.clearInterval(timer);
  }, [
    autoplayEnabled,
    crossfadeSeconds,
    currentTrack,
    isPlaying,
    playNextTrack,
    recentTrackIds,
    storageKey,
  ]);

  // Auto-unlock audio on first user interaction if browser blocked initial autoplay
  useEffect(() => {
    if (!autoplayBlocked || !currentTrack) return;
    const unlock = () => {
      const active = getActiveAudio();
      if (!active) return;
      active
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [autoplayBlocked, currentTrack]);

  useEffect(() => {
    return () => {
      stopFade();
      audioARef.current?.pause();
      audioBRef.current?.pause();
    };
  }, []);

  const handleTogglePlay = async () => {
    const active = getActiveAudio();
    if (!active || !currentTrack) {
      playNextTrack(false);
      return;
    }
    if (isPlaying) {
      pausedByUserRef.current = true;
      active.pause();
      setIsPlaying(false);
    } else {
      pausedByUserRef.current = false;
      try {
        await active.play();
        setIsPlaying(true);
        setAutoplayBlocked(false);
      } catch {
        setAutoplayBlocked(true);
      }
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    onVolumeChange?.(volume, nextMuted);
  };

  const handleVolumeSlider = (val: number) => {
    setVolume(val);
    if (muted && val > 0) setMuted(false);
    onVolumeChange?.(val, val === 0);
  };

  const upcomingQueue = useMemo(
    () =>
      buildUpcomingQueue({
        tracks: eligibleTracks,
        game,
        preferences,
        adminRule,
        currentTrackId: currentTrack?.id || null,
        recentTrackIds,
        activePlaylistTrackIds,
        queueLength: 3,
      }),
    [
      activePlaylistTrackIds,
      adminRule,
      currentTrack?.id,
      eligibleTracks,
      game,
      preferences,
      recentTrackIds,
    ],
  );

  const handleTrackEnded = () => {
    if (!currentTrack || pausedByUserRef.current) return;
    if (crossfadeStartedForIdRef.current === currentTrack.id) return;
    if (eligibleTracks.length === 1) {
      const active = getActiveAudio();
      if (active) {
        active.currentTime = 0;
        void active.play().catch(() => {});
      }
      return;
    }
    playNextTrack(false);
  };

  if (eligibleTracks.length === 0) {
    if (variant === 'overlay') return null;
    return (
      <div className="rounded-xl border border-white/10 bg-[#0B0D14] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-slate-400 text-xs">
          <Radio className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Nenhuma música ativa para este jogo ainda. Adicione faixas pessoais ou aguarde a Biblioteca Oficial do administrador.
          </span>
        </div>
      </div>
    );
  }

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const audioElements = (
    <>
      <audio
        ref={audioARef}
        onEnded={() => {
          if (activeSlotRef.current === 'A') handleTrackEnded();
        }}
        className="hidden"
      />
      <audio
        ref={audioBRef}
        onEnded={() => {
          if (activeSlotRef.current === 'B') handleTrackEnded();
        }}
        className="hidden"
      />
    </>
  );

  if (variant === 'overlay') {
    return (
      <div
        data-testid="overlay-smart-music-widget"
        className="fixed bottom-4 left-4 z-40 max-w-xs rounded-xl border border-white/15 bg-[#07080D]/85 backdrop-blur-md px-3.5 py-2.5 text-white shadow-xl"
      >
        {audioElements}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8B5CF6]/40 to-[#22D3EE]/30 border border-white/10 flex items-center justify-center shrink-0">
            <Disc3 className={`w-4 h-4 text-[#22D3EE] ${isPlaying ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">
              {currentTrack?.title || 'Rádio IA pronta'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {currentTrack?.scope === 'official' ? 'Biblioteca Oficial' : 'Minha Biblioteca'}
              {currentTrack?.artist ? ` · ${currentTrack.artist}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleTogglePlay()}
              aria-label={isPlaying ? 'Pausar música' : 'Tocar música'}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => playNextTrack(true)}
              aria-label="Próxima música"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Ativar áudio' : 'Silenciar'}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-amber-300" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-300" />}
            </button>
          </div>
        </div>
        {autoplayBlocked && (
          <button
            type="button"
            onClick={() => void handleTogglePlay()}
            className="mt-2 w-full rounded-lg bg-[#8B5CF6]/30 border border-[#8B5CF6]/50 px-2.5 py-1 text-[11px] font-semibold text-purple-100 hover:bg-[#8B5CF6]/45"
          >
            Clique aqui para liberar o áudio no navegador
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="smart-music-player"
      className="rounded-xl border border-white/10 bg-[#0B0D14] p-4 space-y-3"
    >
      {audioElements}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8B5CF6]/30 to-[#3B82F6]/30 border border-white/10 flex items-center justify-center shrink-0">
            <Music2 className={`w-5 h-5 text-[#22D3EE] ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">
                {currentTrack?.title || 'Selecionando faixa...'}
              </span>
              {currentTrack && (
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded border shrink-0 ${
                    currentTrack.scope === 'official'
                      ? 'bg-[#8B5CF6]/15 text-purple-200 border-[#8B5CF6]/30'
                      : 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
                  }`}
                >
                  {currentTrack.scope === 'official' ? 'Biblioteca Oficial' : 'Minha Biblioteca'}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">
              {currentTrack?.artist || 'Trilha da live'} · {currentTrack?.genre || 'Automático'} ·{' '}
              <span className="font-mono tabular-nums">
                {formatTime(progressSec)} / {formatTime(durationSec)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleTogglePlay()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pausar Rádio' : 'Tocar Rádio'}
          </button>

          <button
            type="button"
            onClick={() => playNextTrack(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Próxima
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Ativar áudio' : 'Silenciar'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"
          >
            {muted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeSlider(Number(e.target.value))}
            aria-label="Volume da rádio musical"
            className="w-20 accent-[#8B5CF6]"
          />
        </div>
      </div>

      {autoplayBlocked && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-3 text-xs text-amber-200">
          <span>O navegador bloqueou o autoplay inicial. Clique para iniciar a trilha contínua.</span>
          <button
            type="button"
            onClick={() => void handleTogglePlay()}
            className="px-2.5 py-1 rounded bg-amber-400/20 hover:bg-amber-400/30 font-semibold text-white shrink-0"
          >
            Liberar áudio
          </button>
        </div>
      )}

      {upcomingQueue.length > 0 && (
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 text-[#22D3EE] font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            Próximas da Rádio IA:
          </span>
          {upcomingQueue.map((item, idx) => (
            <span
              key={`${item.id}-${idx}`}
              className="rounded border border-white/10 bg-[#11131C] px-2 py-0.5 text-slate-300 truncate max-w-[180px]"
            >
              {idx + 1}. {item.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
