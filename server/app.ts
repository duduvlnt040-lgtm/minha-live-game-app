import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { canCreateRule, PLANS } from '../src/lib/planLimits.js';
import { evaluateRules } from '../src/lib/ruleEngine.js';
import { isValidHexColor, validateRegistrationInput } from '../src/lib/validation.js';
import { buildIsolatedHtmlBundle, preparePlayableHtml } from '../src/lib/zipValidator.js';
import type {
  GameCategory,
  GameEngine,
  LiveEventPayload,
  LiveEventType,
  OverlayConfig,
  PlanTier,
} from '../src/types/platform.js';
import { prepareMercadoPagoCheckout } from './paymentAdapter.js';
import {
  addUserSavedGame,
  adminUpdateUser,
  type AuthSessionTokens,
  checkUserExists,
  countRulesForUser,
  createGameRecord,
  createRuleRecord,
  deleteGameRecord,
  deleteRuleRecord,
  findGameById,
  findUserByAccessToken,
  getAdminOverviewData,
  getPlatformSettings,
  getSubscriptionSummaryForUser,
  listEventsForUser,
  listGamesForRole,
  listOverlayEventsSince,
  listRulesForUser,
  loginUserWithSupabase,
  logoutSupabaseToken,
  recordLiveEvent,
  registerUserWithSupabase,
  removeUserSavedGame,
  sanitizeUser,
  sendSupabasePasswordRecovery,
  type StoredUser,
  updateGameRecord,
  updatePlatformSettings,
  updateRuleRecord,
  updateSupabaseUserPassword,
  updateUserProfileAndSettings,
} from './store.js';
import {
  getMissingSupabaseEnvVars,
  isSupabaseConfigured,
  pingSupabase,
} from './supabase.js';
import { tiktokProvider } from './tiktokAdapter.js';

export const ACCESS_COOKIE_NAME = 'mlg_access_token';
export const REFRESH_COOKIE_NAME = 'mlg_refresh_token';
export const LEGACY_SESSION_COOKIE_NAME = 'mlg_session';

export interface AuthenticatedRequest extends Request {
  user?: StoredUser;
  accessToken?: string;
}

export interface BroadcastHooks {
  broadcastLiveEvent?: (userId: string, gameId: string, event: LiveEventPayload) => void;
  broadcastOverlayConfigUpdate?: (gameId: string, overlayConfig: OverlayConfig) => void;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      result[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      result[key] = part.slice(idx + 1).trim();
    }
  }
  return result;
}

export function extractAuthTokens(req: Request): {
  accessToken?: string;
  refreshToken?: string;
} {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  let bearerToken: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const candidate = authHeader.slice(7).trim();
    if (candidate) bearerToken = candidate;
  }

  return {
    accessToken: bearerToken || cookies[ACCESS_COOKIE_NAME] || undefined,
    refreshToken: cookies[REFRESH_COOKIE_NAME] || undefined,
  };
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase();
  return req.secure || proto.includes('https');
}

function setAuthCookies(req: Request, res: Response, session: AuthSessionTokens): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  const maxAge = 60 * 60 * 24 * 30; // 30 dias para persistência entre reinícios
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`,
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`,
  ]);
}

function clearAuthCookies(req: Request, res: Response): void {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
    `${REFRESH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
    `${LEGACY_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`,
  ]);
}

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const requireAuth = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { accessToken, refreshToken } = extractAuthTokens(req);
  const resolved = await findUserByAccessToken(accessToken, refreshToken);
  if (!resolved) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }
  if (resolved.refreshedSession) {
    setAuthCookies(req, res, resolved.refreshedSession);
  }
  req.user = resolved.user;
  req.accessToken = resolved.refreshedSession?.access_token || accessToken;
  next();
});

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
    return;
  }
  next();
}

export function registerApiRoutes(app: Express, hooks: BroadcastHooks = {}): void {
  const broadcastLiveEvent = hooks.broadcastLiveEvent || (() => {});
  const broadcastOverlayConfigUpdate = hooks.broadcastOverlayConfigUpdate || (() => {});

  app.use(express.json({ limit: '30mb' }));

  // Health endpoint (optionally checks live Supabase Auth + Postgres connectivity when ?check=db)
  app.get(
    '/api/health',
    asyncHandler(async (req, res) => {
      const configured = isSupabaseConfigured();
      const missingEnvVars = getMissingSupabaseEnvVars();

      if (req.query.check === 'db') {
        if (!configured) {
          res.status(503).json({
            ok: false,
            service: 'minha-live-games',
            database: 'unconfigured',
            missingEnvVars,
            error: `Variáveis do Supabase não configuradas: ${missingEnvVars.join(', ')}.`,
          });
          return;
        }
        try {
          await pingSupabase();
          res.json({
            ok: true,
            service: 'minha-live-games',
            runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
            database: 'supabase-postgres',
            auth: 'supabase-auth',
            connected: true,
            timestamp: new Date().toISOString(),
          });
          return;
        } catch (err) {
          res.status(503).json({
            ok: false,
            service: 'minha-live-games',
            database: 'supabase-postgres',
            connected: false,
            error:
              err instanceof Error
                ? err.message
                : 'Não foi possível conectar ao Supabase.',
          });
          return;
        }
      }

      res.json({
        ok: true,
        service: 'minha-live-games',
        runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
        database: configured ? 'supabase-postgres' : 'unconfigured',
        auth: configured ? 'supabase-auth' : 'unconfigured',
        missingEnvVars,
        timestamp: new Date().toISOString(),
      });
    }),
  );

  // Guard auth/data API calls with clear 503 if Supabase env vars are missing
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      next();
      return;
    }
    if (!isSupabaseConfigured()) {
      const missing = getMissingSupabaseEnvVars();
      res.status(503).json({
        error: `Supabase não configurado. Defina as variáveis de ambiente: ${missing.join(', ')}.`,
      });
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Auth Endpoints (Supabase Authentication + PostgreSQL RBAC + HttpOnly cookies)
  // ---------------------------------------------------------------------------
  app.post(
    '/api/auth/register',
    asyncHandler(async (req, res) => {
      const settings = await getPlatformSettings();
      if (!settings.registrationEnabled) {
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

      const dup = await checkUserExists(cleanEmail, cleanUsername);
      if (dup.emailExists) {
        res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
        return;
      }
      if (dup.usernameExists) {
        res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
        return;
      }

      const result = await registerUserWithSupabase({
        name: String(name).trim(),
        username: cleanUsername,
        email: cleanEmail,
        password: String(password),
      });

      if (result.conflictEmail) {
        res.status(409).json({ error: result.error });
        return;
      }
      if (result.error || !result.user || !result.session) {
        res.status(400).json({ error: result.error || 'Não foi possível concluir o cadastro.' });
        return;
      }

      setAuthCookies(req, res, result.session);
      res.status(201).json({
        user: sanitizeUser(result.user),
        session: result.session,
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

      const result = await loginUserWithSupabase(cleanId, rawPass);
      if (result.suspended) {
        res.status(403).json({ error: result.error });
        return;
      }
      if (result.error || !result.user || !result.session) {
        res.status(401).json({ error: result.error || 'Credenciais inválidas. Verifique seu e-mail e senha.' });
        return;
      }

      setAuthCookies(req, res, result.session);
      res.json({
        user: sanitizeUser(result.user),
        session: result.session,
      });
    }),
  );

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { accessToken } = extractAuthTokens(req);
      if (accessToken) {
        await logoutSupabaseToken(accessToken);
      }
      clearAuthCookies(req, res);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/auth/session',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { accessToken, refreshToken } = extractAuthTokens(req);
      const resolved = await findUserByAccessToken(accessToken, refreshToken);
      if (!resolved) {
        res.json({ authenticated: false, user: null });
        return;
      }
      if (resolved.refreshedSession) {
        setAuthCookies(req, res, resolved.refreshedSession);
      }
      res.json({
        authenticated: true,
        user: sanitizeUser(resolved.user),
        ...(resolved.refreshedSession ? { session: resolved.refreshedSession } : {}),
      });
    }),
  );

  // Sync Supabase client-side session (e.g. after recovery link) into HttpOnly cookies
  app.post(
    '/api/auth/sync-session',
    asyncHandler(async (req, res) => {
      const accessToken = String(req.body?.access_token || '').trim();
      const refreshToken = String(req.body?.refresh_token || '').trim();
      if (!accessToken) {
        res.status(400).json({ error: 'Token de sessão ausente.' });
        return;
      }
      const resolved = await findUserByAccessToken(accessToken, refreshToken || undefined);
      if (!resolved) {
        res.status(401).json({ error: 'Sessão Supabase inválida ou expirada.' });
        return;
      }
      if (refreshToken) {
        setAuthCookies(req, res, {
          access_token: resolved.refreshedSession?.access_token || accessToken,
          refresh_token: resolved.refreshedSession?.refresh_token || refreshToken,
          expires_at: resolved.refreshedSession?.expires_at,
        });
      }
      res.json({
        authenticated: true,
        user: sanitizeUser(resolved.user),
      });
    }),
  );

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({
      user: sanitizeUser(req.user!),
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

      const origin =
        process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const redirectTo = `${origin.replace(/\/+$/, '')}/redefinir-senha`;
      await sendSupabasePasswordRecovery(cleanEmail, redirectTo);

      res.json({
        ok: true,
        emailConfigured: true,
        message:
          'Se o e-mail estiver cadastrado no Supabase, enviamos um link de redefinição de senha para sua caixa de entrada.',
      });
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

      const nextName =
        typeof name === 'string' && name.trim().length >= 2 ? name.trim().slice(0, 80) : undefined;

      let nextSettings = user.settings;
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
        nextSettings = merged;
      }

      const updated = await updateUserProfileAndSettings(user.id, {
        ...(nextName ? { name: nextName } : {}),
        ...(settings && typeof settings === 'object' ? { settings: nextSettings } : {}),
      });

      res.json({ user: sanitizeUser(updated) });
    }),
  );

  app.patch(
    '/api/account/password',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
      if (!currentPassword) {
        res.status(400).json({ error: 'Informe sua senha atual.' });
        return;
      }
      if (String(newPassword || '').length < 8 || newPassword !== confirmPassword) {
        res.status(400).json({ error: 'Nova senha inválida (mínimo 8 caracteres) ou confirmação diferente.' });
        return;
      }

      const result = await updateSupabaseUserPassword(
        user.id,
        user.email,
        String(currentPassword),
        String(newPassword),
      );
      if (!result.ok) {
        res.status(400).json({ error: result.error || 'Não foi possível atualizar a senha.' });
        return;
      }

      res.json({ ok: true, message: 'Senha atualizada com sucesso no Supabase Auth.' });
    }),
  );

  // ---------------------------------------------------------------------------
  // Centralized Global Games Library & User "Meus Jogos" Endpoints
  // ---------------------------------------------------------------------------
  app.get(
    '/api/games',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const gamesList = await listGamesForRole(req.user!.role === 'admin');
      res.json({ games: gamesList });
    }),
  );

  app.post(
    '/api/games',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
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

      const game = await createGameRecord({
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
          showWatermark: PLANS[user.plan].allowCustomWatermark
            ? user.settings.defaultOverlay.showWatermark
            : true,
          watermarkPosition: user.settings.defaultOverlay.watermarkPosition,
          watermarkOpacity: user.settings.defaultOverlay.watermarkOpacity,
          backgroundMode: user.settings.defaultOverlay.backgroundMode,
          accentColor: user.settings.defaultOverlay.accentColor,
          showEventToast: user.settings.defaultOverlay.showEventToast,
          borderRadius: user.settings.defaultOverlay.borderRadius,
          scale: user.settings.defaultOverlay.scale,
        },
      });

      res.status(201).json({ game });
    }),
  );

  app.patch(
    '/api/games/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const existing = await findGameById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Jogo não encontrado.' });
        return;
      }

      const { name, description, category, engine, isActive, overlayConfig, coverImage, rawHtml } = req.body ?? {};
      const patch: Parameters<typeof updateGameRecord>[1] = {};

      if (typeof name === 'string' && name.trim().length >= 2) patch.name = name.trim().slice(0, 80);
      if (typeof description === 'string') patch.description = description.trim().slice(0, 400);
      if (category) patch.category = category as GameCategory;
      if (engine) patch.engine = engine as GameEngine;
      if (typeof isActive === 'boolean') patch.isActive = isActive;
      if (typeof coverImage === 'string' && coverImage.startsWith('data:image/')) {
        patch.coverImage = coverImage;
      }
      if (typeof rawHtml === 'string' && rawHtml.trim().length > 0) {
        const origin = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
        const rebuilt = buildIsolatedHtmlBundle(existing.entryFile, { [existing.entryFile]: rawHtml }, origin);
        if (rebuilt.error) {
          res.status(400).json({ error: rebuilt.error });
          return;
        }
        patch.bundleHtml = rebuilt.html;
        patch.totalSizeBytes = Buffer.byteLength(rawHtml, 'utf8');
      }
      if (overlayConfig && typeof overlayConfig === 'object') {
        const nextOverlay: OverlayConfig = {
          ...existing.overlayConfig,
          ...overlayConfig,
        };
        if (!PLANS[req.user!.plan].allowCustomWatermark) {
          nextOverlay.showWatermark = true;
        }
        patch.overlayConfig = nextOverlay;
      }

      const updated = await updateGameRecord(existing.id, patch);
      if (updated && patch.overlayConfig) {
        broadcastOverlayConfigUpdate(updated.id, patch.overlayConfig);
      }

      res.json({ game: updated });
    }),
  );

  app.delete(
    '/api/games/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const removed = await deleteGameRecord(req.params.id);
      if (!removed) {
        res.status(404).json({ error: 'Jogo não encontrado.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/my-games/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const saved = await addUserSavedGame(req.user!.id, req.params.gameId);
      if (!saved) {
        res.status(404).json({ error: 'Jogo publicado não encontrado na biblioteca.' });
        return;
      }
      res.json(saved);
    }),
  );

  app.delete(
    '/api/my-games/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const removed = await removeUserSavedGame(req.user!.id, req.params.gameId);
      res.json(removed);
    }),
  );

  // Public standalone Overlay endpoint (safe: never returns user PII) — PRESERVED UNCHANGED
  app.get(
    '/api/overlay/:id',
    asyncHandler(async (req, res) => {
      const [game, settings] = await Promise.all([
        findGameById(req.params.id),
        getPlatformSettings(),
      ]);
      if (!game) {
        res.status(404).json({ error: 'Overlay não encontrado.' });
        return;
      }
      const origin = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
      const playableHtml = game.isActive ? preparePlayableHtml(game.bundleHtml, origin) : '';
      res.json({
        overlay: {
          id: game.id,
          name: game.name,
          engine: game.engine,
          isActive: game.isActive,
          bundleHtml: playableHtml,
          overlayConfig: game.overlayConfig,
          watermarkText: settings.defaultWatermarkText || 'MINHA LIVE GAMES',
          capabilities: {
            websocket: !process.env.VERCEL,
            pollingIntervalMs: 1200,
          },
        },
      });
    }),
  );

  // Public Overlay real-time polling endpoint (Vercel Serverless fallback for WebSocket /ws) — PRESERVED UNCHANGED
  app.get(
    '/api/overlay/:id/events',
    asyncHandler(async (req, res) => {
      const game = await findGameById(req.params.id);
      if (!game) {
        res.status(404).json({ error: 'Overlay não encontrado.' });
        return;
      }

      const rawSince = String(req.query.since || '').trim();
      const sinceMs = rawSince
        ? /^\d+$/.test(rawSince)
          ? Number(rawSince)
          : Date.parse(rawSince)
        : 0;

      const matching = await listOverlayEventsSince(game.id, sinceMs);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        events: matching,
        isActive: game.isActive,
        overlayConfig: game.overlayConfig,
        serverTime: new Date().toISOString(),
      });
    }),
  );

  // ---------------------------------------------------------------------------
  // Event Rules & Simulation / Real-Time Events Endpoints
  // ---------------------------------------------------------------------------
  app.get(
    '/api/rules',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const rulesList = await listRulesForUser(req.user!.id);
      res.json({ rules: rulesList });
    }),
  );

  app.post(
    '/api/rules',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const existingCount = await countRulesForUser(user.id);
      const quota = canCreateRule(user.plan, existingCount);
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

      const rule = await createRuleRecord({
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
      });

      res.status(201).json({ rule });
    }),
  );

  app.patch(
    '/api/rules/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const fields = req.body ?? {};
      const patch: Parameters<typeof updateRuleRecord>[2] = {};

      if (typeof fields.name === 'string' && fields.name.trim().length >= 2) {
        patch.name = fields.name.trim().slice(0, 80);
      }
      if (typeof fields.gameId === 'string') patch.gameId = fields.gameId;
      if (typeof fields.enabled === 'boolean') patch.enabled = fields.enabled;
      if (fields.eventType) patch.eventType = fields.eventType;
      if (fields.operator) patch.operator = fields.operator;
      if (typeof fields.conditionValue === 'string') patch.conditionValue = fields.conditionValue;
      if (fields.actionType) patch.actionType = fields.actionType;
      if (typeof fields.actionCommand === 'string') patch.actionCommand = fields.actionCommand.trim().slice(0, 80);
      if (typeof fields.actionPayload === 'string') patch.actionPayload = fields.actionPayload.slice(0, 500);

      const rule = await updateRuleRecord(req.params.id, req.user!.id, patch);
      if (!rule) {
        res.status(404).json({ error: 'Regra não encontrada.' });
        return;
      }
      res.json({ rule });
    }),
  );

  app.delete(
    '/api/rules/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const deleted = await deleteRuleRecord(req.params.id, req.user!.id);
      if (!deleted) {
        res.status(404).json({ error: 'Regra não encontrada.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/events',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const userEvents = await listEventsForUser(req.user!.id, 100);
      res.json({ events: userEvents });
    }),
  );

  app.post(
    '/api/events/simulate',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
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
      const userRules = await listRulesForUser(user.id);
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

      const eventRecord = await recordLiveEvent({
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
      });

      if (targetGameId === 'all') {
        const activeGames = await listGamesForRole(false);
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
  app.get(
    '/api/subscription',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const summary = await getSubscriptionSummaryForUser(user);
      res.json({
        currentPlan: user.plan,
        plans: PLANS,
        usage: {
          gamesCount: summary.gamesCount,
          rulesCount: summary.rulesCount,
        },
        history: summary.history,
        mercadoPago: prepareMercadoPagoCheckout(user.plan),
      });
    }),
  );

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
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const overview = await getAdminOverviewData();
      res.json(overview);
    }),
  );

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { role, plan, status } = req.body ?? {};
      const validPlan = plan && PLANS[plan as PlanTier] ? (plan as PlanTier) : undefined;
      const result = await adminUpdateUser(req.params.id, req.user!.id, {
        role,
        plan: validPlan,
        status,
      });

      if (result.error) {
        res.status(result.statusCode || 400).json({ error: result.error });
        return;
      }

      res.json({ user: result.user });
    }),
  );

  app.patch(
    '/api/admin/settings',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const next = await updatePlatformSettings({
        ...(typeof body.registrationEnabled === 'boolean'
          ? { registrationEnabled: body.registrationEnabled }
          : {}),
        ...(typeof body.maintenanceMode === 'boolean' ? { maintenanceMode: body.maintenanceMode } : {}),
        ...(typeof body.defaultWatermarkText === 'string' && body.defaultWatermarkText.trim()
          ? { defaultWatermarkText: body.defaultWatermarkText.trim().slice(0, 40) }
          : {}),
        ...(typeof body.maxUploadSizeMb === 'number' &&
        body.maxUploadSizeMb >= 1 &&
        body.maxUploadSizeMb <= 100
          ? { maxUploadSizeMb: body.maxUploadSizeMb }
          : {}),
      });
      res.json({ platformSettings: next });
    }),
  );

  // JSON 404 handler for unmatched API routes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint da API não encontrado.' });
  });

  // Global JSON error handler for API routes
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Erro na API MINHA LIVE GAMES:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
    }
  });
}
