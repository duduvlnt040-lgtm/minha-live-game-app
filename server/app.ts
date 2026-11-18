import crypto from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { canCreateRule, PLANS } from '../src/lib/planLimits';
import { evaluateRules } from '../src/lib/ruleEngine';
import { isValidHexColor, validateRegistrationInput } from '../src/lib/validation';
import { buildIsolatedHtmlBundle } from '../src/lib/zipValidator';
import type {
  AdminOverviewStats,
  EventRule,
  GameCategory,
  GameEngine,
  GameItem,
  LiveEventPayload,
  LiveEventType,
  OverlayConfig,
  PlanTier,
} from '../src/types/platform';
import { prepareMercadoPagoCheckout } from './paymentAdapter';
import {
  addSubscriptionRecord,
  createDefaultOverlayConfig,
  createDefaultUserSettings,
  createSession,
  findUserBySessionToken,
  flushDb,
  getDb,
  hashPassword,
  hydrateDb,
  isPrimaryAdminEmail,
  isRemoteStorageConfigured,
  resolveInitialRole,
  revokeSessionToken,
  sanitizeUser,
  syncPrimaryAdminRole,
  type StoredUser,
  verifyPassword,
} from './store';
import { tiktokProvider } from './tiktokAdapter';

const SESSION_COOKIE_NAME = 'mlg_session';

export interface AuthenticatedRequest extends Request {
  user?: StoredUser;
  sessionToken?: string;
}

export interface BroadcastHooks {
  broadcastLiveEvent?: (userId: string, gameId: string, event: LiveEventPayload) => void;
  broadcastOverlayConfigUpdate?: (gameId: string, overlayConfig: OverlayConfig) => void;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME];
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase();
  return req.secure || proto.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secureFlag}`,
  );
}

function clearSessionCookie(req: Request, res: Response): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
  );
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const user = findUserBySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
    return;
  }
  next();
}

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function registerApiRoutes(app: Express, hooks: BroadcastHooks = {}): void {
  const broadcastLiveEvent = hooks.broadcastLiveEvent || (() => {});
  const broadcastOverlayConfigUpdate = hooks.broadcastOverlayConfigUpdate || (() => {});

  app.use(express.json({ limit: '30mb' }));

  // Ensure DB is hydrated from Vercel KV / Upstash (when configured) on every API request
  app.use(
    '/api',
    asyncHandler(async (_req, _res, next) => {
      await hydrateDb();
      next();
    }),
  );

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'minha-live-games',
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
      persistentStorage: isRemoteStorageConfigured() ? 'kv-upstash' : 'local-file',
      timestamp: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // Auth Endpoints (Real scrypt hashing + HMAC-signed sessions)
  // ---------------------------------------------------------------------------
  app.post(
    '/api/auth/register',
    asyncHandler(async (req, res) => {
      const db = getDb();
      if (!db.platformSettings.registrationEnabled) {
        res.status(403).json({ error: 'Novos cadastros estão temporariamente desabilitados.' });
        return;
      }

      const { name, username, email, password, confirmPassword } = req.body ?? {};
      const validationErr = validateRegistrationInput({
        name: String(name || ''),
        username: String(username || ''),
        email: String(email || ''),
        password: String(password || ''),
        confirmPassword: String(confirmPassword || ''),
      });
      if (validationErr) {
        res.status(400).json({ error: validationErr });
        return;
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanUsername = String(username).trim().toLowerCase();

      if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
        return;
      }
      if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
        res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
        return;
      }

      const newUser: StoredUser = {
        id: `usr_${crypto.randomUUID().slice(0, 12)}`,
        name: String(name).trim(),
        username: cleanUsername,
        email: cleanEmail,
        role: resolveInitialRole(cleanEmail), // Strictly server-resolved; never trusts client role
        plan: 'free',
        status: 'active',
        passwordHash: hashPassword(String(password)),
        createdAt: new Date().toISOString(),
        settings: createDefaultUserSettings(),
        myGameIds: [],
      };

      db.users.push(newUser);
      addSubscriptionRecord(newUser.id, 'free', 'active', 'Plano inicial gratuito ativado no cadastro.');
      const session = createSession(newUser.id);
      await flushDb();

      setSessionCookie(req, res, session.token);
      res.status(201).json({
        user: sanitizeUser(newUser),
        token: session.token,
      });
    }),
  );

  app.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      const { identifier, password } = req.body ?? {};
      const cleanId = String(identifier || '').trim().toLowerCase();
      const rawPass = String(password || '');

      if (!cleanId || !rawPass) {
        res.status(400).json({ error: 'Informe e-mail/usuário e senha.' });
        return;
      }

      const db = getDb();
      const user = db.users.find(
        (u) => u.email.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId,
      );
      if (!user || !verifyPassword(rawPass, user.passwordHash)) {
        res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
        return;
      }
      if (user.status !== 'active') {
        res.status(403).json({ error: 'Esta conta está suspensa. Contate o suporte.' });
        return;
      }

      syncPrimaryAdminRole(user);

      const session = createSession(user.id);
      await flushDb();
      setSessionCookie(req, res, session.token);
      res.json({
        user: sanitizeUser(user),
        token: session.token,
      });
    }),
  );

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const token = extractToken(req);
      if (token) {
        revokeSessionToken(token);
        await flushDb();
      }
      clearSessionCookie(req, res);
      res.json({ ok: true });
    }),
  );

  app.get('/api/auth/session', (req: AuthenticatedRequest, res) => {
    const token = extractToken(req);
    const user = findUserBySessionToken(token);
    if (!user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({
      authenticated: true,
      user: sanitizeUser(user),
      token,
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({
      user: sanitizeUser(req.user!),
      token: req.sessionToken,
    });
  });

  app.post(
    '/api/auth/recover',
    asyncHandler(async (req, res) => {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      if (!cleanEmail) {
        res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
        return;
      }
      const db = getDb();
      const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
      const resendKey = (process.env.RESEND_API_KEY || '').trim();

      if (user) {
        const token = crypto.randomBytes(16).toString('hex');
        db.resetTokens.push({
          token,
          userId: user.id,
          email: user.email,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          used: false,
        });
        await flushDb();

        if (resendKey) {
          const origin =
            process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
          const resetUrl = `${origin.replace(/\/+$/, '')}/redefinir-senha?token=${encodeURIComponent(token)}`;
          const emailFrom = (process.env.EMAIL_FROM || 'MINHA LIVE GAMES <onboarding@resend.dev>').trim();
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: emailFrom,
              to: [user.email],
              subject: 'Recuperação de senha — MINHA LIVE GAMES',
              html: `<p>Olá, ${user.name}.</p><p>Clique no link abaixo para redefinir sua senha (válido por 15 minutos):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
            }),
          }).catch((err) => {
            console.warn('Falha ao enviar e-mail via Resend:', err);
          });
        }
      }

      res.json({
        ok: true,
        emailConfigured: Boolean(resendKey),
        message: resendKey
          ? 'Se o e-mail estiver cadastrado, enviamos as instruções de redefinição para sua caixa de entrada.'
          : 'Se o e-mail estiver cadastrado, o pedido de recuperação foi registrado no servidor. Para envio automático de e-mails em produção, configure RESEND_API_KEY nas variáveis de ambiente da Vercel.',
      });
    }),
  );

  app.post(
    '/api/auth/reset-password',
    asyncHandler(async (req, res) => {
      const { token, newPassword, confirmPassword } = req.body ?? {};
      if (!token || String(newPassword || '').length < 8 || newPassword !== confirmPassword) {
        res.status(400).json({ error: 'Token inválido ou senhas não conferem (mínimo 8 caracteres).' });
        return;
      }
      const db = getDb();
      const record = db.resetTokens.find(
        (r) => r.token === token && !r.used && new Date(r.expiresAt).getTime() > Date.now(),
      );
      if (!record) {
        res.status(400).json({ error: 'Token de recuperação expirado ou inválido.' });
        return;
      }
      const user = db.users.find((u) => u.id === record.userId);
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }
      user.passwordHash = hashPassword(String(newPassword));
      record.used = true;
      await flushDb();
      res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
    }),
  );

  // ---------------------------------------------------------------------------
  // Account & Settings Endpoints
  // ---------------------------------------------------------------------------
  app.patch(
    '/api/account/profile',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const { name, settings } = req.body ?? {};

      if (typeof name === 'string' && name.trim().length >= 2) {
        user.name = name.trim().slice(0, 80);
      }

      if (settings && typeof settings === 'object') {
        const merged = {
          ...user.settings,
          ...settings,
          defaultOverlay: {
            ...user.settings.defaultOverlay,
            ...(settings.defaultOverlay || {}),
          },
        };
        if (merged.defaultOverlay.accentColor && !isValidHexColor(merged.defaultOverlay.accentColor)) {
          merged.defaultOverlay.accentColor = '#8B5CF6';
        }
        if (!PLANS[user.plan].allowCustomWatermark) {
          merged.defaultOverlay.showWatermark = true;
        }
        user.settings = merged;
      }

      await flushDb();
      res.json({ user: sanitizeUser(user) });
    }),
  );

  app.patch(
    '/api/account/password',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
      if (!verifyPassword(String(currentPassword || ''), user.passwordHash)) {
        res.status(400).json({ error: 'Senha atual incorreta.' });
        return;
      }
      if (String(newPassword || '').length < 8 || newPassword !== confirmPassword) {
        res.status(400).json({ error: 'Nova senha inválida (mínimo 8 caracteres) ou confirmação diferente.' });
        return;
      }
      user.passwordHash = hashPassword(String(newPassword));
      await flushDb();
      res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
    }),
  );

  // ---------------------------------------------------------------------------
  // Centralized Global Games Library & User "Meus Jogos" Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/games', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const visibleGames =
      req.user!.role === 'admin'
        ? db.games
        : db.games.filter((g) => g.isActive);
    res.json({ games: visibleGames });
  });

  app.post(
    '/api/games',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const db = getDb();

      const {
        name,
        description,
        category,
        engine,
        entryFile,
        coverImage,
        files,
        rawHtml,
        isActive,
      } = req.body ?? {};

      if (!name || String(name).trim().length < 2) {
        res.status(400).json({ error: 'Informe um nome para o jogo (mínimo 2 caracteres).' });
        return;
      }

      const cleanEntry = String(entryFile || 'index.html').trim() || 'index.html';
      const fileMap: Record<string, string> =
        files && typeof files === 'object' && Object.keys(files).length > 0
          ? files
          : typeof rawHtml === 'string' && rawHtml.trim().length > 0
            ? { [cleanEntry]: rawHtml }
            : {};

      if (Object.keys(fileMap).length === 0) {
        res.status(400).json({ error: 'Envie um arquivo HTML ou pacote ZIP válido.' });
        return;
      }

      const origin = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
      const bundled = buildIsolatedHtmlBundle(cleanEntry, fileMap, origin);
      if (bundled.error || !bundled.html) {
        res.status(400).json({ error: bundled.error || 'Falha ao validar arquivos do jogo.' });
        return;
      }

      const totalSizeBytes = Object.values(fileMap).reduce(
        (acc, content) => acc + Buffer.byteLength(String(content), 'utf8'),
        0,
      );

      const safeCover =
        typeof coverImage === 'string' && coverImage.startsWith('data:image/') && coverImage.length <= 2_500_000
          ? coverImage
          : undefined;

      const now = new Date().toISOString();
      const game: GameItem = {
        id: `gm_${crypto.randomUUID().slice(0, 10)}`,
        userId: user.id,
        name: String(name).trim().slice(0, 80),
        description: String(description || '').trim().slice(0, 400),
        category: (category || 'Interativo') as GameCategory,
        engine: (engine || 'html5') as GameEngine,
        entryFile: cleanEntry,
        coverImage: safeCover,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        bundleHtml: bundled.html,
        fileList: bundled.fileList,
        totalSizeBytes,
        overlayConfig: {
          ...createDefaultOverlayConfig(),
          ...user.settings.defaultOverlay,
          showWatermark: PLANS[user.plan].allowCustomWatermark
            ? user.settings.defaultOverlay.showWatermark
            : true,
        },
        createdAt: now,
        updatedAt: now,
      };

      db.games.unshift(game);
      await flushDb();
      res.status(201).json({ game });
    }),
  );

  app.patch(
    '/api/games/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const game = db.games.find((g) => g.id === req.params.id);
      if (!game) {
        res.status(404).json({ error: 'Jogo não encontrado.' });
        return;
      }

      const { name, description, category, engine, isActive, overlayConfig, coverImage, rawHtml } = req.body ?? {};
      if (typeof name === 'string' && name.trim().length >= 2) game.name = name.trim().slice(0, 80);
      if (typeof description === 'string') game.description = description.trim().slice(0, 400);
      if (category) game.category = category as GameCategory;
      if (engine) game.engine = engine as GameEngine;
      if (typeof isActive === 'boolean') game.isActive = isActive;
      if (typeof coverImage === 'string' && coverImage.startsWith('data:image/')) {
        game.coverImage = coverImage;
      }
      if (typeof rawHtml === 'string' && rawHtml.trim().length > 0) {
        const origin = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
        const rebuilt = buildIsolatedHtmlBundle(game.entryFile, { [game.entryFile]: rawHtml }, origin);
        if (rebuilt.error) {
          res.status(400).json({ error: rebuilt.error });
          return;
        }
        game.bundleHtml = rebuilt.html;
        game.totalSizeBytes = Buffer.byteLength(rawHtml, 'utf8');
      }
      if (overlayConfig && typeof overlayConfig === 'object') {
        const nextOverlay: OverlayConfig = {
          ...game.overlayConfig,
          ...overlayConfig,
        };
        if (!PLANS[req.user!.plan].allowCustomWatermark) {
          nextOverlay.showWatermark = true;
        }
        game.overlayConfig = nextOverlay;
        broadcastOverlayConfigUpdate(game.id, nextOverlay);
      }

      game.updatedAt = new Date().toISOString();
      await flushDb();
      res.json({ game });
    }),
  );

  app.delete(
    '/api/games/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const exists = db.games.some((g) => g.id === req.params.id);
      if (!exists) {
        res.status(404).json({ error: 'Jogo não encontrado.' });
        return;
      }
      db.games = db.games.filter((g) => g.id !== req.params.id);
      db.rules = db.rules.filter((r) => r.gameId !== req.params.id);
      for (const u of db.users) {
        u.myGameIds = (u.myGameIds || []).filter((id) => id !== req.params.id);
      }
      await flushDb();
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/my-games/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.user!;
      const game = db.games.find((g) => g.id === req.params.gameId && g.isActive);
      if (!game) {
        res.status(404).json({ error: 'Jogo publicado não encontrado na biblioteca.' });
        return;
      }
      const list = Array.isArray(user.myGameIds) ? user.myGameIds : [];
      if (!list.includes(game.id)) {
        user.myGameIds = [game.id, ...list];
        await flushDb();
      }
      res.json({ myGameIds: user.myGameIds, user: sanitizeUser(user) });
    }),
  );

  app.delete(
    '/api/my-games/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const list = Array.isArray(user.myGameIds) ? user.myGameIds : [];
      user.myGameIds = list.filter((id) => id !== req.params.gameId);
      await flushDb();
      res.json({ myGameIds: user.myGameIds, user: sanitizeUser(user) });
    }),
  );

  // Public standalone Overlay endpoint (safe: never returns user PII)
  app.get('/api/overlay/:id', (req, res) => {
    const db = getDb();
    const game = db.games.find((g) => g.id === req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Overlay não encontrado.' });
      return;
    }
    res.json({
      overlay: {
        id: game.id,
        name: game.name,
        engine: game.engine,
        isActive: game.isActive,
        bundleHtml: game.isActive ? game.bundleHtml : '',
        overlayConfig: game.overlayConfig,
        watermarkText: db.platformSettings.defaultWatermarkText || 'MINHA LIVE GAMES',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Event Rules & Simulation / Real-Time Events Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/rules', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    res.json({ rules: db.rules.filter((r) => r.userId === req.user!.id) });
  });

  app.post(
    '/api/rules',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const db = getDb();
      const userRules = db.rules.filter((r) => r.userId === user.id);

      const quota = canCreateRule(user.plan, userRules.length);
      if (!quota.allowed) {
        res.status(403).json({ error: quota.reason });
        return;
      }

      const {
        name,
        gameId,
        eventType,
        operator,
        conditionValue,
        actionType,
        actionCommand,
        actionPayload,
        enabled,
      } = req.body ?? {};

      if (!name || String(name).trim().length < 2) {
        res.status(400).json({ error: 'Informe um nome para a regra.' });
        return;
      }
      if (!actionCommand || String(actionCommand).trim().length < 2) {
        res.status(400).json({ error: 'Informe o comando de ação para o jogo.' });
        return;
      }

      const now = new Date().toISOString();
      const rule: EventRule = {
        id: `rl_${crypto.randomUUID().slice(0, 10)}`,
        userId: user.id,
        gameId: String(gameId || 'all'),
        name: String(name).trim().slice(0, 80),
        enabled: enabled !== false,
        eventType: (eventType || 'gift') as LiveEventType,
        operator: operator || 'equals',
        conditionValue: String(conditionValue || ''),
        actionType: actionType || 'trigger_animation',
        actionCommand: String(actionCommand).trim().slice(0, 80),
        actionPayload: String(actionPayload || '{}').slice(0, 500),
        createdAt: now,
        updatedAt: now,
      };

      db.rules.unshift(rule);
      await flushDb();
      res.status(201).json({ rule });
    }),
  );

  app.patch(
    '/api/rules/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rule = db.rules.find((r) => r.id === req.params.id && r.userId === req.user!.id);
      if (!rule) {
        res.status(404).json({ error: 'Regra não encontrada.' });
        return;
      }
      const fields = req.body ?? {};
      if (typeof fields.name === 'string' && fields.name.trim().length >= 2) rule.name = fields.name.trim().slice(0, 80);
      if (typeof fields.gameId === 'string') rule.gameId = fields.gameId;
      if (typeof fields.enabled === 'boolean') rule.enabled = fields.enabled;
      if (fields.eventType) rule.eventType = fields.eventType;
      if (fields.operator) rule.operator = fields.operator;
      if (typeof fields.conditionValue === 'string') rule.conditionValue = fields.conditionValue;
      if (fields.actionType) rule.actionType = fields.actionType;
      if (typeof fields.actionCommand === 'string') rule.actionCommand = fields.actionCommand.trim().slice(0, 80);
      if (typeof fields.actionPayload === 'string') rule.actionPayload = fields.actionPayload.slice(0, 500);
      rule.updatedAt = new Date().toISOString();
      await flushDb();
      res.json({ rule });
    }),
  );

  app.delete(
    '/api/rules/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const before = db.rules.length;
      db.rules = db.rules.filter((r) => !(r.id === req.params.id && r.userId === req.user!.id));
      if (db.rules.length === before) {
        res.status(404).json({ error: 'Regra não encontrada.' });
        return;
      }
      await flushDb();
      res.json({ ok: true });
    }),
  );

  app.get('/api/events', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userEvents = db.events.filter((e) => e.userId === req.user!.id).slice(0, 100);
    res.json({ events: userEvents });
  });

  app.post(
    '/api/events/simulate',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const db = getDb();
      const {
        gameId,
        type,
        senderUsername,
        giftName,
        giftCount,
        commentText,
        likeCount,
        points,
        bonusMultiplier,
      } = req.body ?? {};

      const targetGameId = String(gameId || 'all');
      const userRules = db.rules.filter((r) => r.userId === user.id);
      const evaluation = evaluateRules(
        {
          gameId: targetGameId,
          type: (type || 'gift') as LiveEventType,
          senderUsername: String(senderUsername || 'espectador_teste').trim(),
          giftName: giftName ? String(giftName) : undefined,
          giftCount: giftCount !== undefined ? Number(giftCount) : undefined,
          commentText: commentText ? String(commentText) : undefined,
          likeCount: likeCount !== undefined ? Number(likeCount) : undefined,
          points: points !== undefined ? Number(points) : undefined,
          bonusMultiplier: bonusMultiplier !== undefined ? Number(bonusMultiplier) : undefined,
        },
        userRules,
      );

      const eventRecord: LiveEventPayload = {
        id: `evt_${crypto.randomUUID().slice(0, 10)}`,
        userId: user.id,
        gameId: targetGameId,
        type: (type || 'gift') as LiveEventType,
        senderUsername: String(senderUsername || 'espectador_teste').trim(),
        giftName: giftName ? String(giftName) : undefined,
        giftCount: giftCount !== undefined ? Number(giftCount) : undefined,
        commentText: commentText ? String(commentText) : undefined,
        likeCount: likeCount !== undefined ? Number(likeCount) : undefined,
        points: points !== undefined ? Number(points) : undefined,
        bonusMultiplier: bonusMultiplier !== undefined ? Number(bonusMultiplier) : undefined,
        isSimulation: true,
        matchedRuleIds: evaluation.matchedRuleIds,
        triggeredCommands: evaluation.triggeredCommands,
        createdAt: new Date().toISOString(),
      };

      db.events.unshift(eventRecord);
      if (db.events.length > 500) {
        db.events = db.events.slice(0, 500);
      }
      await flushDb();

      if (targetGameId === 'all') {
        const activeGames = db.games.filter((g) => g.isActive);
        for (const g of activeGames) {
          broadcastLiveEvent(user.id, g.id, eventRecord);
        }
        broadcastLiveEvent(user.id, 'all', eventRecord);
      } else {
        broadcastLiveEvent(user.id, targetGameId, eventRecord);
      }

      res.status(201).json({ event: eventRecord });
    }),
  );

  // ---------------------------------------------------------------------------
  // TikTok LIVE Integration Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/integrations/tiktok/status', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ integration: tiktokProvider.getStatus(req.user!.id) });
  });

  app.post(
    '/api/integrations/tiktok/connect',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const username = String(req.body?.username || '');
      const status = await tiktokProvider.connect(req.user!.id, username);
      res.json({ integration: status });
    }),
  );

  app.post(
    '/api/integrations/tiktok/disconnect',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const status = await tiktokProvider.disconnect(req.user!.id);
      res.json({ integration: status });
    }),
  );

  // ---------------------------------------------------------------------------
  // Subscriptions & Plans Endpoints
  // ---------------------------------------------------------------------------
  app.get('/api/subscription', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.user!;
    const history = db.subscriptions.filter((s) => s.userId === user.id);
    const gamesCount =
      user.role === 'admin'
        ? db.games.length
        : (user.myGameIds || []).filter((id) => db.games.some((g) => g.id === id && g.isActive)).length;
    const rulesCount = db.rules.filter((r) => r.userId === user.id).length;
    res.json({
      currentPlan: user.plan,
      plans: PLANS,
      usage: {
        gamesCount,
        rulesCount,
      },
      history,
      mercadoPago: prepareMercadoPagoCheckout(user.plan),
    });
  });

  app.post('/api/subscription/prepare-checkout', requireAuth, (req: AuthenticatedRequest, res) => {
    const requestedPlan = String(req.body?.plan || 'free') as PlanTier;
    if (!PLANS[requestedPlan]) {
      res.status(400).json({ error: 'Plano inválido.' });
      return;
    }
    const checkout = prepareMercadoPagoCheckout(requestedPlan);
    res.json({ checkout });
  });

  // ---------------------------------------------------------------------------
  // Admin Endpoints (Strictly server-RBAC guarded)
  // ---------------------------------------------------------------------------
  app.get('/api/admin/overview', requireAuth, requireAdmin, (_req, res) => {
    const db = getDb();
    const stats: AdminOverviewStats = {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.status === 'active').length,
      totalGames: db.games.length,
      activeGames: db.games.filter((g) => g.isActive).length,
      totalEvents: db.events.length,
      totalRules: db.rules.length,
      planDistribution: {
        free: db.users.filter((u) => u.plan === 'free').length,
        premium: db.users.filter((u) => u.plan === 'premium').length,
        pro: db.users.filter((u) => u.plan === 'pro').length,
      },
    };
    res.json({
      stats,
      users: db.users.map(sanitizeUser),
      games: db.games.map((g) => ({
        id: g.id,
        userId: g.userId,
        name: g.name,
        category: g.category,
        engine: g.engine,
        isActive: g.isActive,
        totalSizeBytes: g.totalSizeBytes,
        createdAt: g.createdAt,
      })),
      subscriptions: db.subscriptions.slice(0, 50),
      platformSettings: db.platformSettings,
    });
  });

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const target = db.users.find((u) => u.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }
      const { role, plan, status } = req.body ?? {};
      if (role && (role === 'user' || role === 'admin')) {
        if ((target.id === req.user!.id || isPrimaryAdminEmail(target.email)) && role !== 'admin') {
          res.status(400).json({ error: 'Não é possível remover a permissão do administrador principal.' });
          return;
        }
        target.role = role;
      }
      if (plan && PLANS[plan as PlanTier]) {
        target.plan = plan as PlanTier;
        addSubscriptionRecord(target.id, target.plan, 'active', 'Plano atualizado pela administração.');
      }
      if (status && (status === 'active' || status === 'suspended')) {
        target.status = status;
      }
      await flushDb();
      res.json({ user: sanitizeUser(target) });
    }),
  );

  app.patch(
    '/api/admin/settings',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const db = getDb();
      const body = req.body ?? {};
      db.platformSettings = {
        ...db.platformSettings,
        ...(typeof body.registrationEnabled === 'boolean' ? { registrationEnabled: body.registrationEnabled } : {}),
        ...(typeof body.maintenanceMode === 'boolean' ? { maintenanceMode: body.maintenanceMode } : {}),
        ...(typeof body.defaultWatermarkText === 'string' && body.defaultWatermarkText.trim()
          ? { defaultWatermarkText: body.defaultWatermarkText.trim().slice(0, 40) }
          : {}),
        ...(typeof body.maxUploadSizeMb === 'number' && body.maxUploadSizeMb >= 1 && body.maxUploadSizeMb <= 100
          ? { maxUploadSizeMb: body.maxUploadSizeMb }
          : {}),
      };
      await flushDb();
      res.json({ platformSettings: db.platformSettings });
    }),
  );

  // Global JSON error handler for API routes
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Erro na API MINHA LIVE GAMES:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
    }
  });
}
