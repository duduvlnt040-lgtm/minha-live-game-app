import express from 'express';
import { registerApiRoutes } from '../server/app';

const app = express();
registerApiRoutes(app);

export default app;
