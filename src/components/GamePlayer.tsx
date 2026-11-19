import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { preparePlayableHtml } from '../lib/zipValidator';
import type { LiveEventPayload } from '../types/platform';

interface GamePlayerProps {
  gameId: string;
  gameName: string;
  bundleHtml: string;
  active?: boolean;
  mutedDefault?: boolean;
  onExternalEvent?: (event: LiveEventPayload) => void;
  heightClass?: string;
}

export const GamePlayer = React.forwardRef<
  { sendEvent: (ev: LiveEventPayload) => void; sendCommand: (cmd: unknown) => void },
  GamePlayerProps
>(function GamePlayer(
  { gameId, gameName, bundleHtml, active = true, mutedDefault = false, heightClass = 'h-[480px]' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameReadyRef = useRef(false);
  const pendingMessagesRef = useRef<Array<Record<string, unknown>>>([]);

  const [isRunning, setIsRunning] = useState(true);
  const [isMuted, setIsMuted] = useState(mutedDefault);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [score, setScore] = useState<number>(0);
  const [sdkReady, setSdkReady] = useState(false);

  const playableHtml = useMemo(() => {
    if (!bundleHtml) return '';
    return preparePlayableHtml(bundleHtml, window.location.origin);
  }, [bundleHtml]);

  const flushPending = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    frameReadyRef.current = true;
    while (pendingMessagesRef.current.length > 0) {
      const next = pendingMessagesRef.current.shift();
      if (next) win.postMessage(next, '*');
    }
  }, []);

  const postToGame = useCallback((message: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (win && frameReadyRef.current) {
      win.postMessage(message, '*');
      return;
    }
    if (pendingMessagesRef.current.length < 50) {
      pendingMessagesRef.current.push(message);
    }
  }, []);

  React.useImperativeHandle(ref, () => ({
    sendEvent: (ev: LiveEventPayload) => {
      postToGame({ type: 'MLG:EVENT', event: ev });
      for (const cmd of ev.triggeredCommands || []) {
        postToGame({ type: 'MLG:COMMAND', command: cmd });
      }
    },
    sendCommand: (cmd: unknown) => {
      postToGame({ type: 'MLG:COMMAND', command: cmd });
    },
  }));

  useEffect(() => {
    frameReadyRef.current = false;
    pendingMessagesRef.current = [];
    setSdkReady(false);
  }, [playableHtml, iframeKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'MLG:READY') {
        setSdkReady(true);
        flushPending();
      } else if (data.type === 'MLG:SCORE_UPDATE') {
        setScore(Number(data.score) || 0);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [flushPending]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleTogglePlay = () => {
    if (isRunning) {
      postToGame({ type: 'MLG:PAUSE' });
      setIsRunning(false);
    } else {
      postToGame({ type: 'MLG:START' });
      setIsRunning(true);
    }
  };

  const handleRestart = () => {
    postToGame({ type: 'MLG:RESTART' });
    frameReadyRef.current = false;
    pendingMessagesRef.current = [];
    setSdkReady(false);
    setScore(0);
    setIsRunning(true);
    setIframeKey((k) => k + 1);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    postToGame({ type: 'MLG:AUDIO', muted: nextMuted, volume: nextMuted ? 0 : 1 });
  };

  const handleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen blocked
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col rounded-xl border border-white/10 bg-[#0B0D14] overflow-hidden"
      data-testid={`game-player-${gameId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-[#11131C]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-white truncate">{gameName}</span>
          <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
            Pontos: {score}
          </span>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {sdkReady ? 'Bridge SDK pronto' : 'Inicializando'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap"
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? 'Pausar' : 'Iniciar'}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Ativar áudio do jogo' : 'Silenciar áudio do jogo'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors whitespace-nowrap"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
            {isMuted ? 'Mudo' : 'Áudio'}
          </button>

          <button
            type="button"
            onClick={() => void handleFullscreen()}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 text-blue-200 border border-[#3B82F6]/30 transition-colors whitespace-nowrap"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            Tela cheia
          </button>
        </div>
      </div>

      <div className={`relative w-full bg-[#05060A] ${isFullscreen ? 'flex-1 h-full' : heightClass}`}>
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <p className="text-sm font-medium text-slate-300">Este jogo está desativado no momento.</p>
            <p className="text-xs text-slate-500 mt-1">Ative o jogo na biblioteca para executá-lo no player e no overlay.</p>
          </div>
        ) : (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            title={`Player ${gameName}`}
            srcDoc={playableHtml}
            sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals"
            allow="autoplay; fullscreen; gamepad; clipboard-write"
            onLoad={() => {
              setSdkReady(true);
              flushPending();
            }}
            className="w-full h-full border-0"
          />
        )}
      </div>
    </div>
  );
});
