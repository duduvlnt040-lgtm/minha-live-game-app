import express from 'express';
import { registerApiRoutes } from '../server/app';

const app = express();

app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  next();
});

registerApiRoutes(app);

export default app;
