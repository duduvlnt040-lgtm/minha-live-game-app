import React, { useEffect, useRef, useState } from 'react';
import { WatermarkBadge, LoadingScreen } from '../components/BrandMark';
import { apiRequest } from '../services/api';
import type { LiveEventPayload, OverlayConfig } from '../types/platform';

interface OverlayData {
  id: string;
  name: string;
  engine: string;
  isActive: boolean;
  bundleHtml: string;
  overlayConfig: OverlayConfig;
  watermarkText: string;
}

export function OverlayPage({ gameId }: { gameId: string }) {
  const [overlay, setOverlay] = useState<OverlayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastToast, setLastToast] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
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

  useEffect(() => {
    if (!overlay) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByUser = false;

    const dispatchToGame = (event: LiveEventPayload) => {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage({ type: 'MLG:EVENT', event }, '*');
        for (const cmd of event.triggeredCommands || []) {
          win.postMessage({ type: 'MLG:COMMAND', command: cmd }, '*');
        }
      }
      if (overlay.overlayConfig.showEventToast) {
        setLastToast(
          `@${event.senderUsername}: ${event.giftName || event.commentText || event.type}`,
        );
        window.setTimeout(() => setLastToast(null), 3500);
      }
    };

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

    // Same-browser BroadcastChannel fallback
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
      ws?.close();
      channel?.close();
    };
  }, [gameId, overlay?.id, overlay?.overlayConfig.showEventToast]);

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
          srcDoc={overlay.bundleHtml}
          sandbox="allow-scripts"
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
