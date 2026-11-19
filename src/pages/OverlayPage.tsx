import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WatermarkBadge, LoadingScreen } from '../components/BrandMark';
import { preparePlayableHtml } from '../lib/zipValidator';
import { apiRequest } from '../services/api';
import type { LiveEventPayload, OverlayConfig } from '../types/platform';

interface OverlayCapabilities {
  websocket: boolean;
  pollingIntervalMs?: number;
}

interface OverlayData {
  id: string;
  name: string;
  engine: string;
  isActive: boolean;
  bundleHtml: string;
  overlayConfig: OverlayConfig;
  watermarkText: string;
  capabilities?: OverlayCapabilities;
}

interface OverlayEventsPollResponse {
  events: LiveEventPayload[];
  isActive: boolean;
  overlayConfig: OverlayConfig;
  serverTime: string;
}

export function OverlayPage({ gameId }: { gameId: string }) {
  const [overlay, setOverlay] = useState<OverlayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastToast, setLastToast] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameReadyRef = useRef(false);
  const pendingMessagesRef = useRef<Array<Record<string, unknown>>>([]);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | undefined>(undefined);
  const sinceCursorRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    frameReadyRef.current = false;
    pendingMessagesRef.current = [];
    seenEventIdsRef.current.clear();
    sinceCursorRef.current = new Date().toISOString();

    apiRequest<{ overlay: OverlayData }>(`/api/overlay/${encodeURIComponent(gameId)}`)
      .then((res) => {
        if (!cancelled) setOverlay(res.overlay);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Overlay não encontrado.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const playableHtml = useMemo(() => {
    if (!overlay?.bundleHtml) return '';
    return preparePlayableHtml(overlay.bundleHtml, window.location.origin);
  }, [overlay?.bundleHtml]);

  const postOrQueueToGame = useCallback((message: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (win && frameReadyRef.current) {
      win.postMessage(message, '*');
      return;
    }
    if (pendingMessagesRef.current.length < 50) {
      pendingMessagesRef.current.push(message);
    }
  }, []);

  const flushPendingToGame = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    frameReadyRef.current = true;
    while (pendingMessagesRef.current.length > 0) {
      const next = pendingMessagesRef.current.shift();
      if (next) win.postMessage(next, '*');
    }
  }, []);

  useEffect(() => {
    const onFrameMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data && typeof ev.data === 'object' && ev.data.type === 'MLG:READY') {
        flushPendingToGame();
      }
    };
    window.addEventListener('message', onFrameMessage);
    return () => window.removeEventListener('message', onFrameMessage);
  }, [flushPendingToGame]);

  const showToastEnabled = overlay?.overlayConfig.showEventToast ?? true;
  const wsSupported = overlay?.capabilities?.websocket ?? false;
  const pollingIntervalMs = overlay?.capabilities?.pollingIntervalMs ?? 1200;

  useEffect(() => {
    if (!overlay) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;
    let closedByUser = false;

    const dispatchToGame = (event: LiveEventPayload) => {
      if (event.id) {
        if (seenEventIdsRef.current.has(event.id)) return;
        seenEventIdsRef.current.add(event.id);
        if (seenEventIdsRef.current.size > 300) {
          const oldest = seenEventIdsRef.current.values().next().value;
          if (oldest) seenEventIdsRef.current.delete(oldest);
        }
      }

      postOrQueueToGame({ type: 'MLG:EVENT', event });
      for (const cmd of event.triggeredCommands || []) {
        postOrQueueToGame({ type: 'MLG:COMMAND', command: cmd });
      }

      if (showToastEnabled) {
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        setLastToast(
          `@${event.senderUsername}: ${event.giftName || event.commentText || event.type}`,
        );
        toastTimerRef.current = window.setTimeout(() => setLastToast(null), 3500);
      }
    };

    if (wsSupported) {
      let failedAttempts = 0;
      let openedOnce = false;

      const connectWs = () => {
        if (closedByUser) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws?overlayId=${encodeURIComponent(gameId)}`;
        ws = new WebSocket(url);

        ws.onopen = () => {
          openedOnce = true;
          failedAttempts = 0;
        };

        ws.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed.type === 'MLG_LIVE_EVENT' && parsed.event) {
              dispatchToGame(parsed.event as LiveEventPayload);
            } else if (parsed.type === 'MLG_OVERLAY_CONFIG' && parsed.overlayConfig) {
              setOverlay((prev) => (prev ? { ...prev, overlayConfig: parsed.overlayConfig } : prev));
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (closedByUser) return;
          failedAttempts += 1;
          if (!openedOnce && failedAttempts >= 3) {
            return;
          }
          const delay = Math.min(15000, 2000 * failedAttempts);
          reconnectTimer = window.setTimeout(connectWs, delay);
        };
      };

      connectWs();
    } else {
      // Serverless runtime (e.g. Vercel): poll real-time event sync endpoint
      const pollEvents = async () => {
        if (closedByUser) return;
        try {
          const data = await apiRequest<OverlayEventsPollResponse>(
            `/api/overlay/${encodeURIComponent(gameId)}/events?since=${encodeURIComponent(sinceCursorRef.current)}`,
          );
          if (closedByUser) return;

          if (Array.isArray(data.events) && data.events.length > 0) {
            for (const ev of data.events) {
              dispatchToGame(ev);
              if (ev.createdAt) {
                sinceCursorRef.current = ev.createdAt;
              }
            }
          } else if (data.serverTime) {
            sinceCursorRef.current = data.serverTime;
          }

          setOverlay((prev) => {
            if (!prev) return prev;
            const changedActive = prev.isActive !== data.isActive;
            const changedCfg =
              JSON.stringify(prev.overlayConfig) !== JSON.stringify(data.overlayConfig);
            if (!changedActive && !changedCfg) return prev;
            return {
              ...prev,
              isActive: data.isActive,
              overlayConfig: data.overlayConfig,
            };
          });
        } catch {
          // Retry gracefully on next interval
        } finally {
          if (!closedByUser) {
            pollTimer = window.setTimeout(() => void pollEvents(), pollingIntervalMs);
          }
        }
      };

      pollTimer = window.setTimeout(() => void pollEvents(), pollingIntervalMs);
    }

    // Instant same-browser BroadcastChannel fallback
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mlg_events') : null;
    if (channel) {
      channel.onmessage = (ev) => {
        const data = ev.data;
        if (data?.gameId === gameId || data?.gameId === 'all') {
          if (data.event) dispatchToGame(data.event as LiveEventPayload);
        }
      };
    }

    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pollTimer) window.clearTimeout(pollTimer);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      ws?.close();
      channel?.close();
    };
  }, [gameId, overlay?.id, pollingIntervalMs, postOrQueueToGame, showToastEnabled, wsSupported]);

  if (loading) {
    return <LoadingScreen label="Conectando overlay em tempo real..." />;
  }

  if (error || !overlay) {
    return (
      <div className="min-h-screen w-full bg-[#07080D] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-white/10 bg-[#11131C] p-6 text-center">
          <h1 className="font-display text-lg font-bold text-white mb-2">Overlay indisponível</h1>
          <p className="text-sm text-slate-400">{error || 'Jogo não encontrado.'}</p>
        </div>
      </div>
    );
  }

  if (!overlay.isActive) {
    return (
      <div className="min-h-screen w-full bg-transparent flex items-center justify-center p-6">
        <div className="rounded-xl border border-white/15 bg-[#07080D]/90 px-5 py-4 text-center">
          <p className="text-sm font-medium text-white">{overlay.name}</p>
          <p className="text-xs text-slate-400 mt-1">Jogo desativado no painel MINHA LIVE GAMES.</p>
        </div>
      </div>
    );
  }

  const bgClass =
    overlay.overlayConfig.backgroundMode === 'chroma-green'
      ? 'bg-[#00FF00]'
      : overlay.overlayConfig.backgroundMode === 'obsidian'
        ? 'bg-[#07080D]'
        : 'bg-transparent';

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden ${bgClass}`}
      data-testid={`overlay-root-${overlay.id}`}
    >
      <div
        className="w-full h-full overflow-hidden"
        style={{
          borderRadius: `${overlay.overlayConfig.borderRadius || 0}px`,
          transform: `scale(${overlay.overlayConfig.scale || 1})`,
          transformOrigin: 'center center',
        }}
      >
        <iframe
          ref={iframeRef}
          title={`Overlay ${overlay.name}`}
          srcDoc={playableHtml}
          sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals"
          allow="autoplay; fullscreen; gamepad; clipboard-write"
          onLoad={flushPendingToGame}
          className="w-full h-full border-0 bg-transparent"
        />
      </div>

      {lastToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 rounded-lg border border-white/15 bg-[#07080D]/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {lastToast}
        </div>
      )}

      {overlay.overlayConfig.showWatermark && (
        <WatermarkBadge
          text={overlay.watermarkText}
          position={overlay.overlayConfig.watermarkPosition}
          opacity={overlay.overlayConfig.watermarkOpacity}
        />
      )}
    </div>
  );
}
