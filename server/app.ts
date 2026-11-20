import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { evaluateGiftMappings } from '../src/lib/giftActions.js';
import { canCreateRule, PLANS } from '../src/lib/planLimits.js';
import { evaluateRules } from '../src/lib/ruleEngine.js';
import { isValidHexColor, validateRegistrationInput } from '../src/lib/validation.js';
import { buildIsolatedHtmlBundle, preparePlayableHtml } from '../src/lib/zipValidator.js';
import type {
  GameCategory,
  GameEngine,
  GiftActionKey,
  LiveEventPayload,
  LiveEventType,
  MusicScope,
  MusicSourceMode,
  OverlayConfig,
  PlanTier,
} from '../src/types/platform.js';
import { curateMusicOrderForGame } from './aiMusicCurator.js';
import { prepareMercadoPagoCheckout } from './paymentAdapter.js';
import {
  addUserSavedGame,
  adminUpdateUser,
  type AuthSessionTokens,
  checkUserExists,
  countRulesForUser,
  createGameRecord,
  createGiftMappingRecord,
  createMusicPlaylistRecord,
  createMusicSignedUploadUrl,
  createMusicTrackRecord,
  createRuleRecord,
  deleteGameRecord,
  deleteGiftMappingRecord,
  deleteMusicPlaylistRecord,
  deleteMusicTrackRecord,
  deleteRuleRecord,
  findGameById,
  findMusicPlaylistById,
  findMusicTrackById,
  findOverlayIdsForUserAndGame,
  findUserByAccessToken,
  getAdminOverviewData,
  getEffectiveAdminAiRule,
  getGameMusicPreferencesRecord,
  getOrCreateGameOverlayProfile,
  getPlatformSettings,
  getSubscriptionSummaryForUser,
  listAdminAiMusicRules,
  listEventsForUser,
  listGamesForRole,
  listGiftMappingsForUser,
  listMusicPlaylistsVisible,
  listMusicTracksVisible,
  listOverlayEventsSince,
  listRulesForUser,
  listUserOverlayProfiles,
  loginUserWithSupabase,
  logoutSupabaseToken,
  recordLiveEvent,
  regenerateGameOverlayProfileId,
  registerUserWithSupabase,
  removeUserSavedGame,
  resolveOverlayTargetForEvents,
  resolvePublicOverlayBundle,
  sanitizeUser,
  sendSupabasePasswordRecovery,
  type StoredUser,
  updateGameRecord,
  updateGiftMappingRecord,
  updateMusicPlaylistRecord,
  updateMusicTrackRecord,
  updatePlatformSettings,
  updateRuleRecord,
  updateSupabaseUserPassword,
  updateUserProfileAndSettings,
  upsertAdminAiMusicRule,
  upsertGameMusicPreferencesRecord,
} from './store.js';
import {
  getMissingSupabaseEnvVars,
  getSupabaseConfigIssues,
  getSupabaseEnvConfig,
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

  const processAndDispatchLiveEvent = async (input: {
    userId: string;
    gameId: string;
    type: LiveEventType;
    senderUsername: string;
    giftName?: string;
    giftCount?: number;
    commentText?: string;
    likeCount?: number;
    points?: number;
    bonusMultiplier?: number;
    isSimulation: boolean;
  }): Promise<LiveEventPayload> => {
    const targetGameId = String(input.gameId || 'all');
    const [userRules, giftMappings] = await Promise.all([
      listRulesForUser(input.userId),
      listGiftMappingsForUser(input.userId),
    ]);

    const ruleEval = evaluateRules(
      {
        gameId: targetGameId,
        type: input.type,
        senderUsername: input.senderUsername,
        giftName: input.giftName,
        giftCount: input.giftCount,
        commentText: input.commentText,
        likeCount: input.likeCount,
        points: input.points,
        bonusMultiplier: input.bonusMultiplier,
      },
      userRules,
    );

    const giftEval = evaluateGiftMappings(
      {
        gameId: targetGameId,
        type: input.type,
        senderUsername: input.senderUsername,
        giftName: input.giftName,
        giftCount: input.giftCount,
      },
      giftMappings,
    );

    const matchedRuleIds = Array.from(
      new Set([...ruleEval.matchedRuleIds, ...giftEval.map((g) => g.ruleId)]),
    );
    const triggeredCommands = [...ruleEval.triggeredCommands, ...giftEval];

    const eventRecord = await recordLiveEvent({
      userId: input.userId,
      gameId: targetGameId,
      type: input.type,
      senderUsername: input.senderUsername,
      giftName: input.giftName,
      giftCount: input.giftCount,
      commentText: input.commentText,
      likeCount: input.likeCount,
      points: input.points,
      bonusMultiplier: input.bonusMultiplier,
      isSimulation: input.isSimulation,
      matchedRuleIds,
      triggeredCommands,
    });

    if (targetGameId === 'all') {
      const [activeGames, userOverlays] = await Promise.all([
        listGamesForRole(false),
        findOverlayIdsForUserAndGame(input.userId, 'all'),
      ]);
      for (const g of activeGames) {
        broadcastLiveEvent(input.userId, g.id, eventRecord);
      }
      for (const ovId of userOverlays) {
        broadcastLiveEvent(input.userId, ovId, eventRecord);
      }
      broadcastLiveEvent(input.userId, 'all', eventRecord);
    } else {
      broadcastLiveEvent(input.userId, targetGameId, eventRecord);
      const userOverlays = await findOverlayIdsForUserAndGame(input.userId, targetGameId);
      for (const ovId of userOverlays) {
        broadcastLiveEvent(input.userId, ovId, eventRecord);
      }
    }

    return eventRecord;
  };

  tiktokProvider.setEventCallback(async (userId, incoming) => {
    await processAndDispatchLiveEvent({
      userId,
      gameId: 'all',
      type: incoming.type,
      senderUsername: incoming.senderUsername,
      giftName: incoming.giftName,
      giftCount: incoming.giftCount,
      commentText: incoming.commentText,
      likeCount: incoming.likeCount,
      isSimulation: false,
    });
  });

  app.use(express.json({ limit: '30mb' }));

  // Health endpoint (optionally checks live Supabase Auth + Postgres connectivity when ?check=db)
  app.get(
    '/api/health',
    asyncHandler(async (req, res) => {
      const configured = isSupabaseConfigured();
      const missingEnvVars = getMissingSupabaseEnvVars();
      const configIssues = getSupabaseConfigIssues();
      const envCfg = getSupabaseEnvConfig();

      if (req.query.check === 'db') {
        if (!configured) {
          res.status(503).json({
            ok: false,
            service: 'minha-live-games',
            database: 'unconfigured',
            missingEnvVars,
            configIssues,
            error:
              configIssues.join(' ') ||
              `Variáveis do Supabase não configuradas: ${missingEnvVars.join(', ')}.`,
          });
          return;
        }
        try {
          const ping = await pingSupabase();
          if (!ping.schemaReady) {
            res.status(503).json({
              ok: false,
              service: 'minha-live-games',
              runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
              database: 'supabase-postgres',
              auth: 'supabase-auth',
              connected: true,
              authConnected: ping.authConnected,
              schemaReady: false,
              migration001Ready: ping.migration001Ready,
              migration002Ready: ping.migration002Ready,
              storageBucketReady: ping.storageBucketReady,
              missingTables: ping.missingTables,
              keyModes: ping.keyModes,
              error: `Conexão com Supabase Auth confirmada, porém faltam estruturas no PostgreSQL/Storage (${ping.missingTables.join(', ')}${ping.storageBucketReady ? '' : ', bucket mlg-music'}). Execute as migrations 001 e 002 no SQL Editor do Supabase.`,
              timestamp: new Date().toISOString(),
            });
            return;
          }
          res.json({
            ok: true,
            service: 'minha-live-games',
            runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
            database: 'supabase-postgres',
            auth: 'supabase-auth',
            connected: true,
            authConnected: ping.authConnected,
            schemaReady: true,
            migration001Ready: ping.migration001Ready,
            migration002Ready: ping.migration002Ready,
            storageBucketReady: ping.storageBucketReady,
            keyModes: ping.keyModes,
            timestamp: new Date().toISOString(),
          });
          return;
        } catch (err) {
          res.status(503).json({
            ok: false,
            service: 'minha-live-games',
            database: 'supabase-postgres',
            connected: false,
            keyModes: {
              publicKey: envCfg.publicKeyMode,
              secretKey: envCfg.secretKeyMode,
            },
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
        keyModes: {
          publicKey: envCfg.publicKeyMode,
          secretKey: envCfg.secretKeyMode,
        },
        missingEnvVars,
        configIssues,
        timestamp: new Date().toISOString(),
      });
    }),
  );

  // Guard auth/data API calls with clear 503 if Supabase env vars are missing or invalid
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      next();
      return;
    }
    if (!isSupabaseConfigured()) {
      const missing = getMissingSupabaseEnvVars();
      const issues = getSupabaseConfigIssues();
      res.status(503).json({
        error:
          issues.join(' ') ||
          `Supabase não configurado. Defina as variáveis de ambiente: ${missing.join(', ')}.`,
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

  // Public standalone Overlay endpoint (supports both legacy /overlay/gm_... and custom /overlay/ov_...)
  app.get(
    '/api/overlay/:id',
    asyncHandler(async (req, res) => {
      const resolved = await resolvePublicOverlayBundle(req.params.id);
      if (!resolved) {
        res.status(404).json({ error: 'Overlay não encontrado.' });
        return;
      }
      const origin = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
      const playableHtml = resolved.isActive
        ? preparePlayableHtml(resolved.game.bundleHtml, origin)
        : '';

      res.json({
        overlay: {
          id: resolved.overlayId,
          gameId: resolved.game.id,
          name: resolved.game.name,
          category: resolved.game.category,
          engine: resolved.game.engine,
          isActive: resolved.isActive,
          bundleHtml: playableHtml,
          overlayConfig: resolved.overlayConfig,
          controlsConfig: resolved.controlsConfig,
          tiktokUsername: resolved.tiktokUsername,
          watermarkText: resolved.watermarkText,
          giftMappings: resolved.giftMappings,
          music: resolved.music,
          capabilities: {
            websocket: !process.env.VERCEL,
            pollingIntervalMs: 1200,
          },
        },
      });
    }),
  );

  // Public Overlay real-time polling endpoint (Vercel Serverless fallback for WebSocket /ws)
  app.get(
    '/api/overlay/:id/events',
    asyncHandler(async (req, res) => {
      const target = await resolveOverlayTargetForEvents(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Overlay não encontrado.' });
        return;
      }

      const rawSince = String(req.query.since || '').trim();
      const sinceMs = rawSince
        ? /^\d+$/.test(rawSince)
          ? Number(rawSince)
          : Date.parse(rawSince)
        : 0;

      const matching = await listOverlayEventsSince(target.gameId, sinceMs, target.userId);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        events: matching,
        isActive: target.isActive,
        overlayConfig: target.overlayConfig,
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

      const eventRecord = await processAndDispatchLiveEvent({
        userId: user.id,
        gameId: String(gameId || 'all'),
        type: (type || 'gift') as LiveEventType,
        senderUsername: String(senderUsername || 'espectador_teste').trim(),
        giftName: giftName ? String(giftName) : undefined,
        giftCount: giftCount !== undefined ? Number(giftCount) : undefined,
        commentText: commentText ? String(commentText) : undefined,
        likeCount: likeCount !== undefined ? Number(likeCount) : undefined,
        points: points !== undefined ? Number(points) : undefined,
        bonusMultiplier: bonusMultiplier !== undefined ? Number(bonusMultiplier) : undefined,
        isSimulation: true,
      });

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

  // ---------------------------------------------------------------------------
  // Custom Gift Mappings (Per-User, Per-Game)
  // ---------------------------------------------------------------------------
  app.get(
    '/api/gift-mappings',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
      const mappings = await listGiftMappingsForUser(req.user!.id, gameId);
      res.json({ mappings });
    }),
  );

  app.post(
    '/api/gift-mappings',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const gameId = String(body.gameId || '').trim();
      const giftName = String(body.giftName || '').trim();
      const actionKey = String(body.actionKey || 'move_walk') as GiftActionKey;

      if (!gameId || gameId === 'all') {
        res.status(400).json({ error: 'Selecione o jogo para vincular o presente.' });
        return;
      }
      if (giftName.length < 2) {
        res.status(400).json({ error: 'Informe o nome do presente do TikTok (ex.: Rosa, Coração).' });
        return;
      }

      const mapping = await createGiftMappingRecord({
        userId: req.user!.id,
        gameId,
        giftName,
        minCount: body.minCount !== undefined ? Number(body.minCount) : 1,
        actionKey,
        actionLabel: typeof body.actionLabel === 'string' ? body.actionLabel : undefined,
        actionCommand: typeof body.actionCommand === 'string' ? body.actionCommand : undefined,
        actionPayload:
          body.actionPayload && typeof body.actionPayload === 'object' ? body.actionPayload : undefined,
        cooldownMs: body.cooldownMs !== undefined ? Number(body.cooldownMs) : 0,
        enabled: body.enabled !== false,
      });

      res.status(201).json({ mapping });
    }),
  );

  app.patch(
    '/api/gift-mappings/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const updated = await updateGiftMappingRecord(req.params.id, req.user!.id, {
        ...(typeof body.giftName === 'string' ? { giftName: body.giftName } : {}),
        ...(typeof body.minCount === 'number' ? { minCount: body.minCount } : {}),
        ...(body.actionKey ? { actionKey: body.actionKey as GiftActionKey } : {}),
        ...(typeof body.actionLabel === 'string' ? { actionLabel: body.actionLabel } : {}),
        ...(typeof body.actionCommand === 'string' ? { actionCommand: body.actionCommand } : {}),
        ...(body.actionPayload && typeof body.actionPayload === 'object'
          ? { actionPayload: body.actionPayload }
          : {}),
        ...(typeof body.cooldownMs === 'number' ? { cooldownMs: body.cooldownMs } : {}),
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      });

      if (!updated) {
        res.status(404).json({ error: 'Configuração de presente não encontrada.' });
        return;
      }
      res.json({ mapping: updated });
    }),
  );

  app.delete(
    '/api/gift-mappings/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const removed = await deleteGiftMappingRecord(req.params.id, req.user!.id);
      if (!removed) {
        res.status(404).json({ error: 'Configuração de presente não encontrada.' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  // ---------------------------------------------------------------------------
  // Music Library (ADM Global Official + User Personal) & Smart AI Radio
  // ---------------------------------------------------------------------------
  app.post(
    '/api/music/upload-url',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const requestedScope = (body.scope === 'official' ? 'official' : 'personal') as MusicScope;

      if (requestedScope === 'official' && req.user!.role !== 'admin') {
        res.status(403).json({
          error: 'Somente administradores podem enviar músicas para a Biblioteca Oficial global.',
        });
        return;
      }

      const fileName = String(body.fileName || '').trim();
      const mimeType = String(body.mimeType || 'audio/mpeg').trim();
      const fileSizeBytes = Number(body.fileSizeBytes || 0);

      if (!fileName) {
        res.status(400).json({ error: 'Nome do arquivo de áudio obrigatório.' });
        return;
      }

      const signed = await createMusicSignedUploadUrl({
        userId: req.user!.id,
        scope: requestedScope,
        fileName,
        mimeType,
        fileSizeBytes,
      });

      res.json(signed);
    }),
  );

  app.get(
    '/api/music/tracks',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
      const tracks = await listMusicTracksVisible({
        userId: req.user!.id,
        isAdmin: req.user!.role === 'admin',
        gameId,
      });
      res.json({ tracks });
    }),
  );

  app.post(
    '/api/music/tracks',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const scope = (body.scope === 'official' ? 'official' : 'personal') as MusicScope;

      if (scope === 'official' && req.user!.role !== 'admin') {
        res.status(403).json({
          error: 'Somente administradores podem cadastrar músicas oficiais na plataforma.',
        });
        return;
      }

      const storagePath = String(body.storagePath || '').trim();
      const audioUrl = String(body.audioUrl || '').trim();
      if (!storagePath || !audioUrl) {
        res.status(400).json({ error: 'Envie o arquivo de áudio antes de salvar a faixa.' });
        return;
      }

      // Enforce path prefix matches scope and user
      if (scope === 'official' && !storagePath.startsWith('official/')) {
        res.status(403).json({ error: 'Caminho de arquivo oficial inválido.' });
        return;
      }
      if (scope === 'personal' && !storagePath.startsWith(`personal/${req.user!.id}/`)) {
        res.status(403).json({ error: 'Caminho de arquivo pessoal inválido.' });
        return;
      }

      const track = await createMusicTrackRecord({
        scope,
        ownerUserId: req.user!.id,
        gameId: String(body.gameId || 'all'),
        title: typeof body.title === 'string' ? body.title : undefined,
        artist: typeof body.artist === 'string' ? body.artist : undefined,
        genre: typeof body.genre === 'string' ? body.genre : undefined,
        mood: typeof body.mood === 'string' ? body.mood : undefined,
        bpm: typeof body.bpm === 'number' ? body.bpm : undefined,
        durationSec: typeof body.durationSec === 'number' ? body.durationSec : undefined,
        storagePath,
        audioUrl,
        mimeType: String(body.mimeType || 'audio/mpeg'),
        fileSizeBytes: Number(body.fileSizeBytes || 0),
        isActive: body.isActive !== false,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        aiTags: Array.isArray(body.aiTags) ? body.aiTags.map(String) : undefined,
        originalFileName: typeof body.originalFileName === 'string' ? body.originalFileName : undefined,
      });

      res.status(201).json({ track });
    }),
  );

  app.patch(
    '/api/music/tracks/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const existing = await findMusicTrackById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Faixa musical não encontrada.' });
        return;
      }

      const isAdmin = req.user!.role === 'admin';
      if (existing.scope === 'official' && !isAdmin) {
        res.status(403).json({
          error: 'Músicas oficiais globais só podem ser alteradas pelo administrador.',
        });
        return;
      }
      if (existing.scope === 'personal' && existing.ownerUserId !== req.user!.id && !isAdmin) {
        res.status(403).json({ error: 'Você não tem permissão para alterar esta faixa.' });
        return;
      }

      const body = req.body ?? {};
      const updated = await updateMusicTrackRecord(existing.id, {
        ...(typeof body.gameId === 'string' ? { gameId: body.gameId } : {}),
        ...(typeof body.title === 'string' ? { title: body.title } : {}),
        ...(typeof body.artist === 'string' ? { artist: body.artist } : {}),
        ...(typeof body.genre === 'string' ? { genre: body.genre } : {}),
        ...(typeof body.mood === 'string' ? { mood: body.mood } : {}),
        ...(typeof body.bpm === 'number' ? { bpm: body.bpm } : {}),
        ...(typeof body.durationSec === 'number' ? { durationSec: body.durationSec } : {}),
        ...(typeof body.storagePath === 'string' ? { storagePath: body.storagePath } : {}),
        ...(typeof body.audioUrl === 'string' ? { audioUrl: body.audioUrl } : {}),
        ...(typeof body.mimeType === 'string' ? { mimeType: body.mimeType } : {}),
        ...(typeof body.fileSizeBytes === 'number' ? { fileSizeBytes: body.fileSizeBytes } : {}),
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
        ...(typeof body.sortOrder === 'number' ? { sortOrder: body.sortOrder } : {}),
        ...(Array.isArray(body.aiTags) ? { aiTags: body.aiTags.map(String) } : {}),
      });

      res.json({ track: updated });
    }),
  );

  app.delete(
    '/api/music/tracks/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const existing = await findMusicTrackById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Faixa musical não encontrada.' });
        return;
      }

      const isAdmin = req.user!.role === 'admin';
      if (existing.scope === 'official' && !isAdmin) {
        res.status(403).json({
          error: 'Usuários não podem excluir músicas da Biblioteca Oficial do administrador.',
        });
        return;
      }
      if (existing.scope === 'personal' && existing.ownerUserId !== req.user!.id && !isAdmin) {
        res.status(403).json({ error: 'Você só pode excluir suas próprias músicas.' });
        return;
      }

      await deleteMusicTrackRecord(existing.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/music/playlists',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
      const playlists = await listMusicPlaylistsVisible({
        userId: req.user!.id,
        isAdmin: req.user!.role === 'admin',
        gameId,
      });
      res.json({ playlists });
    }),
  );

  app.post(
    '/api/music/playlists',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const scope = (body.scope === 'official' ? 'official' : 'personal') as MusicScope;
      if (scope === 'official' && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Somente administradores criam playlists oficiais globais.' });
        return;
      }
      const name = String(body.name || '').trim();
      if (name.length < 2) {
        res.status(400).json({ error: 'Informe um nome para a playlist (mínimo 2 caracteres).' });
        return;
      }

      const playlist = await createMusicPlaylistRecord({
        scope,
        ownerUserId: req.user!.id,
        gameId: String(body.gameId || 'all'),
        name,
        description: typeof body.description === 'string' ? body.description : '',
        trackIds: Array.isArray(body.trackIds) ? body.trackIds.map(String) : [],
        isActive: body.isActive !== false,
      });
      res.status(201).json({ playlist });
    }),
  );

  app.patch(
    '/api/music/playlists/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const existing = await findMusicPlaylistById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
      }
      const isAdmin = req.user!.role === 'admin';
      if (existing.scope === 'official' && !isAdmin) {
        res.status(403).json({ error: 'Playlists oficiais só podem ser editadas pelo administrador.' });
        return;
      }
      if (existing.scope === 'personal' && existing.ownerUserId !== req.user!.id && !isAdmin) {
        res.status(403).json({ error: 'Sem permissão para alterar esta playlist.' });
        return;
      }

      const body = req.body ?? {};
      const updated = await updateMusicPlaylistRecord(existing.id, {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
        ...(typeof body.gameId === 'string' ? { gameId: body.gameId } : {}),
        ...(Array.isArray(body.trackIds) ? { trackIds: body.trackIds.map(String) } : {}),
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      });
      res.json({ playlist: updated });
    }),
  );

  app.delete(
    '/api/music/playlists/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const existing = await findMusicPlaylistById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Playlist não encontrada.' });
        return;
      }
      const isAdmin = req.user!.role === 'admin';
      if (existing.scope === 'official' && !isAdmin) {
        res.status(403).json({ error: 'Playlists oficiais só podem ser removidas pelo administrador.' });
        return;
      }
      if (existing.scope === 'personal' && existing.ownerUserId !== req.user!.id && !isAdmin) {
        res.status(403).json({ error: 'Sem permissão para remover esta playlist.' });
        return;
      }
      await deleteMusicPlaylistRecord(existing.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/music/preferences/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const [preferences, adminRule] = await Promise.all([
        getGameMusicPreferencesRecord(req.user!.id, req.params.gameId),
        getEffectiveAdminAiRule(req.params.gameId),
      ]);
      res.json({ preferences, adminRule });
    }),
  );

  app.put(
    '/api/music/preferences/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const validModes: MusicSourceMode[] = ['official_only', 'mixed', 'personal_only'];
      const sourceMode = validModes.includes(body.sourceMode) ? body.sourceMode : undefined;

      const preferences = await upsertGameMusicPreferencesRecord(
        req.user!.id,
        req.params.gameId,
        {
          ...(sourceMode ? { sourceMode } : {}),
          ...(typeof body.autoplayEnabled === 'boolean'
            ? { autoplayEnabled: body.autoplayEnabled }
            : {}),
          ...(typeof body.aiDjEnabled === 'boolean' ? { aiDjEnabled: body.aiDjEnabled } : {}),
          ...(typeof body.crossfadeSeconds === 'number'
            ? { crossfadeSeconds: body.crossfadeSeconds }
            : {}),
          ...(typeof body.volume === 'number' ? { volume: body.volume } : {}),
          ...(typeof body.muted === 'boolean' ? { muted: body.muted } : {}),
          ...(typeof body.preferredMood === 'string'
            ? { preferredMood: body.preferredMood }
            : {}),
          ...(body.activePlaylistId === null || typeof body.activePlaylistId === 'string'
            ? { activePlaylistId: body.activePlaylistId }
            : {}),
          ...(Array.isArray(body.aiCuratedOrder)
            ? { aiCuratedOrder: body.aiCuratedOrder.map(String) }
            : {}),
        },
      );
      res.json({ preferences });
    }),
  );

  app.post(
    '/api/music/ai-curate/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const game = await findGameById(req.params.gameId);
      if (!game) {
        res.status(404).json({ error: 'Jogo não encontrado para curadoria musical.' });
        return;
      }

      const [tracks, preferences, adminRule] = await Promise.all([
        listMusicTracksVisible({
          userId: req.user!.id,
          isAdmin: req.user!.role === 'admin',
          gameId: game.id,
        }),
        getGameMusicPreferencesRecord(req.user!.id, game.id),
        getEffectiveAdminAiRule(game.id),
      ]);

      const sourceMode = req.body?.sourceMode as MusicSourceMode | undefined;
      const preferredMood =
        typeof req.body?.preferredMood === 'string' ? req.body.preferredMood : undefined;

      const curated = await curateMusicOrderForGame({
        game,
        tracks,
        preferences,
        adminRule,
        sourceMode,
        preferredMood,
      });

      const updatedPrefs = await upsertGameMusicPreferencesRecord(req.user!.id, game.id, {
        ...(sourceMode ? { sourceMode } : {}),
        ...(preferredMood ? { preferredMood } : {}),
        aiCuratedOrder: curated.orderedTrackIds,
      });

      res.json({
        curation: curated,
        preferences: updatedPrefs,
      });
    }),
  );

  // Admin AI Global Music Rules
  app.get(
    '/api/admin/music/ai-rules',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const rules = await listAdminAiMusicRules();
      res.json({ rules });
    }),
  );

  app.put(
    '/api/admin/music/ai-rules/:gameId',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const validModes: MusicSourceMode[] = ['official_only', 'mixed', 'personal_only'];
      const defaultSourceMode = validModes.includes(body.defaultSourceMode)
        ? body.defaultSourceMode
        : undefined;

      const rule = await upsertAdminAiMusicRule(req.params.gameId || 'all', {
        ...(defaultSourceMode ? { defaultSourceMode } : {}),
        ...(typeof body.prioritizeOfficialRatio === 'number'
          ? { prioritizeOfficialRatio: body.prioritizeOfficialRatio }
          : {}),
        ...(typeof body.avoidRepeatWindow === 'number'
          ? { avoidRepeatWindow: body.avoidRepeatWindow }
          : {}),
        ...(typeof body.crossfadeSeconds === 'number'
          ? { crossfadeSeconds: body.crossfadeSeconds }
          : {}),
        ...(typeof body.preferredEnergy === 'string'
          ? { preferredEnergy: body.preferredEnergy }
          : {}),
        ...(typeof body.aiInstructions === 'string'
          ? { aiInstructions: body.aiInstructions }
          : {}),
      });
      res.json({ rule });
    }),
  );

  // ---------------------------------------------------------------------------
  // Custom Per-User, Per-Game Overlay Links (/overlay/ov_...) & Controls
  // ---------------------------------------------------------------------------
  app.get(
    '/api/overlays/profiles',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const profiles = await listUserOverlayProfiles(req.user!.id);
      res.json({ profiles });
    }),
  );

  app.get(
    '/api/overlays/profile/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const profile = await getOrCreateGameOverlayProfile(req.user!.id, req.params.gameId);
      if (!profile) {
        res.status(404).json({ error: 'Jogo não encontrado para gerar overlay.' });
        return;
      }
      res.json({ profile });
    }),
  );

  app.put(
    '/api/overlays/profile/:gameId',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = req.body ?? {};
      const profile = await getOrCreateGameOverlayProfile(req.user!.id, req.params.gameId, {
        ...(typeof body.label === 'string' ? { label: body.label } : {}),
        ...(typeof body.tiktokUsername === 'string' ? { tiktokUsername: body.tiktokUsername } : {}),
        ...(body.controlsConfig && typeof body.controlsConfig === 'object'
          ? { controlsConfig: body.controlsConfig }
          : {}),
        ...(body.overlayConfig && typeof body.overlayConfig === 'object'
          ? { overlayConfig: body.overlayConfig }
          : {}),
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      });

      if (!profile) {
        res.status(404).json({ error: 'Jogo não encontrado para atualizar overlay.' });
        return;
      }

      broadcastOverlayConfigUpdate(profile.id, profile.overlayConfig);
      res.json({ profile });
    }),
  );

  app.post(
    '/api/overlays/profile/:gameId/regenerate',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const profile = await regenerateGameOverlayProfileId(req.user!.id, req.params.gameId);
      if (!profile) {
        res.status(404).json({ error: 'Jogo não encontrado para regenerar link.' });
        return;
      }
      res.json({ profile });
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
      const msg = err instanceof Error ? err.message : '';
      const causeMsg =
        err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
      const combined = `${msg} ${causeMsg}`;
      if (
        combined.includes('PGRST205') ||
        combined.includes('Could not find the table') ||
        combined.includes('schema cache') ||
        combined.includes('does not exist')
      ) {
        res.status(503).json({
          error:
            'Supabase conectado, mas as tabelas SQL ainda não foram criadas. Execute os scripts 001_minha_live_games_supabase.sql e 002_interactive_music_gifts_overlays.sql no SQL Editor do Supabase.',
        });
        return;
      }
      res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
    }
  });
}
