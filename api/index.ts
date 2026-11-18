import express from 'express';
import { registerApiRoutes } from '../server/app.js';

function normalizeApiRequestUrl(req: express.Request): void {
  const rawUrl = req.url || '/api';
  const parsed = new URL(rawUrl, 'http://localhost');
  const rewrittenPath = parsed.searchParams.get('__mlg_path');

  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__mlg_path');
    const cleanSubPath = rewrittenPath.replace(/^\/+/, '');
    const targetPath = `/api${cleanSubPath ? `/${cleanSubPath}` : ''}`;
    const remainingQuery = parsed.searchParams.toString();
    req.url = remainingQuery ? `${targetPath}?${remainingQuery}` : targetPath;
    return;
  }

  if (!parsed.pathname.startsWith('/api')) {
    const normalizedPath = `/api${parsed.pathname.startsWith('/') ? '' : '/'}${parsed.pathname}`;
    req.url = parsed.search ? `${normalizedPath}${parsed.search}` : normalizedPath;
  }
}

const app = express();

app.use((req, _res, next) => {
  normalizeApiRequestUrl(req);
  next();
});

registerApiRoutes(app);

export default app;
