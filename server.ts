import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { registerApiRoutes } from './server/app.js';
import { findUserBySessionToken } from './server/store.js';
import type { LiveEventPayload, OverlayConfig } from './src/types/platform.js';

const PORT = Number(process.env.PORT || 3000);

async function startServer(): Promise<void> {
  const app = express();

  // Serve local game engines (Phaser 3 & Three.js) with CORS headers so sandboxed srcDoc iframes work offline
  const vendorRoutes: Array<{ url: string; filePath: string; contentType: string }> = [
    {
      url: '/vendor/phaser.min.js',
      filePath: path.resolve(process.cwd(), 'node_modules/phaser/dist/phaser.min.js'),
      contentType: 'application/javascript; charset=utf-8',
    },
    {
      url: '/vendor/three.module.js',
      filePath: path.resolve(process.cwd(), 'node_modules/three/build/three.module.js'),
      contentType: 'application/javascript; charset=utf-8',
    },
    {
      url: '/vendor/three.core.js',
      filePath: path.resolve(process.cwd(), 'node_modules/three/build/three.core.js'),
      contentType: 'application/javascript; charset=utf-8',
    },
  ];

  for (const route of vendorRoutes) {
    app.get(route.url, (_req, res) => {
      if (!fs.existsSync(route.filePath)) {
        res.status(404).send('Vendor script not found');
        return;
      }
      res.setHeader('Content-Type', route.contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(route.filePath);
    });
  }

  // WebSocket Real-Time Overlay & Dashboard Hub
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const wsSubscribers = new Map<WebSocket, { overlayId?: string; userId?: string }>();

  wss.on('connection', (socket, req) => {
    const reqUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const overlayId = reqUrl.searchParams.get('overlayId') || undefined;
    const token = reqUrl.searchParams.get('token') || undefined;
    const user = findUserBySessionToken(token);

    wsSubscribers.set(socket, {
      overlayId,
      userId: user?.id,
    });

    socket.send(
      JSON.stringify({
        type: 'MLG_WS_CONNECTED',
        overlayId: overlayId ?? null,
        authenticated: Boolean(user),
        timestamp: new Date().toISOString(),
      }),
    );

    socket.on('close', () => {
      wsSubscribers.delete(socket);
    });
  });

  function broadcastLiveEvent(userId: string, gameId: string, event: LiveEventPayload): void {
    const message = JSON.stringify({
      type: 'MLG_LIVE_EVENT',
      gameId,
      event,
    });
    for (const [client, sub] of wsSubscribers.entries()) {
      if (client.readyState !== 1) continue;
      if (sub.overlayId && (sub.overlayId === gameId || gameId === 'all')) {
        client.send(message);
      } else if (sub.userId && sub.userId === userId) {
        client.send(message);
      }
    }
  }

  function broadcastOverlayConfigUpdate(gameId: string, overlayConfig: OverlayConfig): void {
    const message = JSON.stringify({
      type: 'MLG_OVERLAY_CONFIG',
      gameId,
      overlayConfig,
    });
    for (const [client, sub] of wsSubscribers.entries()) {
      if (client.readyState === 1 && sub.overlayId === gameId) {
        client.send(message);
      }
    }
  }

  registerApiRoutes(app, {
    broadcastLiveEvent,
    broadcastOverlayConfigUpdate,
  });

  // Frontend Serving (Vite dev middleware in dev, dist/ in production)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MINHA LIVE GAMES server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MINHA LIVE GAMES server:', err);
  process.exit(1);
});
