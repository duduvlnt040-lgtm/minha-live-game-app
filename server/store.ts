import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  EventRule,
  GameItem,
  LiveEventPayload,
  OverlayConfig,
  PlatformSettings,
  PlanTier,
  SubscriptionRecord,
  UserProfile,
  UserRole,
  UserSettings,
} from '../src/types/platform';

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
  used: boolean;
}

export interface DatabaseSchema {
  users: StoredUser[];
  sessions: SessionRecord[];
  revokedSessionIds: string[];
  resetTokens: PasswordResetToken[];
  games: GameItem[];
  rules: EventRule[];
  events: LiveEventPayload[];
  subscriptions: SubscriptionRecord[];
  platformSettings: PlatformSettings;
}

export interface SignedTokenPayload {
  sid: string;
  uid: string;
  email: string;
  username: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
  exp: number;
}

export function createDefaultOverlayConfig(): OverlayConfig {
  return {
    showWatermark: true,
    watermarkPosition: 'bottom-right',
    watermarkOpacity: 0.72,
    backgroundMode: 'transparent',
    accentColor: '#8B5CF6',
    showEventToast: true,
    borderRadius: 12,
    scale: 1,
  };
}

export function createDefaultUserSettings(): UserSettings {
  return {
    language: 'pt-BR',
    masterVolume: 80,
    muteAllAudio: false,
    themeAccent: 'violet',
    reduceMotion: false,
    defaultEngine: 'html5',
    autoPauseOnHide: false,
    defaultOverlay: createDefaultOverlayConfig(),
    tiktokUsername: '',
    autoReconnectRelay: false,
    twoFactorHint: false,
  };
}

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless
  ? path.join('/tmp', 'minha-live-games-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const REMOTE_KV_KEY = 'mlg:db:v1';

const EMPTY_DB: DatabaseSchema = {
  users: [],
  sessions: [],
  revokedSessionIds: [],
  resetTokens: [],
  games: [],
  rules: [],
  events: [],
  subscriptions: [],
  platformSettings: {
    registrationEnabled: true,
    maintenanceMode: false,
    defaultWatermarkText: 'MINHA LIVE GAMES',
    maxUploadSizeMb: 25,
  },
};

export const PRIMARY_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'duduvlnt040@gmail.com')
  .trim()
  .toLowerCase();

function getSessionSecret(): string {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret && envSecret !== 'troque-esta-chave-em-producao') {
    return envSecret;
  }
  // Stable fallback secret derived from project/admin identifiers so tokens stay verifiable
  // across serverless instances even before SESSION_SECRET is customized, while recommending
  // setting SESSION_SECRET in production.
  const seed = `${PRIMARY_ADMIN_EMAIL}:${process.env.VERCEL_PROJECT_ID || 'minha-live-games-local'}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function getRemoteKvConfig(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isRemoteStorageConfigured(): boolean {
  return getRemoteKvConfig() !== null;
}

function normalizeDbSchema(parsed: Partial<DatabaseSchema>): DatabaseSchema {
  const users = Array.isArray(parsed.users)
    ? parsed.users.map((u) => {
        const emailLower = (u.email || '').trim().toLowerCase();
        return {
          ...u,
          role: emailLower === PRIMARY_ADMIN_EMAIL ? ('admin' as UserRole) : u.role || 'user',
          myGameIds: Array.isArray(u.myGameIds) ? u.myGameIds : [],
        };
      })
    : [];
  return {
    users,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    revokedSessionIds: Array.isArray(parsed.revokedSessionIds) ? parsed.revokedSessionIds.slice(-500) : [],
    resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens : [],
    games: Array.isArray(parsed.games) ? parsed.games : [],
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    events: Array.isArray(parsed.events) ? parsed.events : [],
    subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    platformSettings: {
      ...EMPTY_DB.platformSettings,
      ...(parsed.platformSettings || {}),
    },
  };
}

function ensureLocalDbLoaded(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
      return structuredClone(EMPTY_DB);
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return normalizeDbSchema(JSON.parse(raw) as Partial<DatabaseSchema>);
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

let dbCache: DatabaseSchema = ensureLocalDbLoaded();
let lastRemoteHydrateMs = 0;

export async function hydrateDb(): Promise<DatabaseSchema> {
  const kv = getRemoteKvConfig();
  if (!kv) {
    if (!isServerless && !fs.existsSync(DB_FILE)) {
      dbCache = ensureLocalDbLoaded();
    }
    return dbCache;
  }

  // Always hydrate on serverless cold start or if stale > 1s
  if (Date.now() - lastRemoteHydrateMs < 1000) {
    return dbCache;
  }

  try {
    const res = await fetch(`${kv.url}/get/${encodeURIComponent(REMOTE_KV_KEY)}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { result?: string | null };
      if (typeof json.result === 'string' && json.result.trim()) {
        dbCache = normalizeDbSchema(JSON.parse(json.result) as Partial<DatabaseSchema>);
      }
      lastRemoteHydrateMs = Date.now();
    }
  } catch (err) {
    console.warn('Falha ao hidratar banco remoto KV/Upstash, mantendo cache local:', err);
  }

  return dbCache;
}

export function getDb(): DatabaseSchema {
  return dbCache;
}

export function saveDb(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    if (!isServerless) {
      console.warn('Falha ao salvar store local:', err);
    }
  }
}

export async function flushDb(): Promise<void> {
  saveDb();
  const kv = getRemoteKvConfig();
  if (!kv) return;
  try {
    await fetch(kv.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', REMOTE_KV_KEY, JSON.stringify(dbCache)]),
    });
    lastRemoteHydrateMs = Date.now();
  } catch (err) {
    console.warn('Falha ao persistir estado no KV/Upstash:', err);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function sanitizeUser(user: StoredUser): UserProfile {
  const { passwordHash: _ignored, ...safe } = user;
  return {
    ...safe,
    myGameIds: Array.isArray(safe.myGameIds) ? safe.myGameIds : [],
  };
}

export function isPrimaryAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

export function resolveInitialRole(email: string): UserRole {
  return isPrimaryAdminEmail(email) ? 'admin' : 'user';
}

export function syncPrimaryAdminRole(user: StoredUser): void {
  if (isPrimaryAdminEmail(user.email) && user.role !== 'admin') {
    user.role = 'admin';
    saveDb();
  }
}

function signSessionToken(payload: SignedTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `mlg1.${encoded}.${sig}`;
}

export function verifySignedSessionToken(token: string | undefined): SignedTokenPayload | null {
  if (!token || !token.startsWith('mlg1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (!payload.uid || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createSession(userId: string): SessionRecord {
  const user = dbCache.users.find((u) => u.id === userId);
  const now = new Date();
  const expiresMs = now.getTime() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const sid = crypto.randomBytes(16).toString('hex');

  const token = user
    ? signSessionToken({
        sid,
        uid: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: resolveInitialRole(user.email) === 'admin' ? 'admin' : user.role,
        plan: user.plan,
        exp: expiresMs,
      })
    : crypto.randomBytes(32).toString('hex');

  const record: SessionRecord = {
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
  };
  dbCache.sessions = dbCache.sessions.filter(
    (s) => new Date(s.expiresAt).getTime() > Date.now(),
  );
  dbCache.sessions.push(record);
  saveDb();
  return record;
}

export function revokeSessionToken(token: string | undefined): void {
  if (!token) return;
  const signed = verifySignedSessionToken(token);
  if (signed?.sid && !dbCache.revokedSessionIds.includes(signed.sid)) {
    dbCache.revokedSessionIds.push(signed.sid);
    if (dbCache.revokedSessionIds.length > 500) {
      dbCache.revokedSessionIds = dbCache.revokedSessionIds.slice(-500);
    }
  }
  dbCache.sessions = dbCache.sessions.filter((s) => s.token !== token);
  saveDb();
}

export function findUserBySessionToken(token: string | undefined): StoredUser | null {
  if (!token) return null;

  // 1. Check cryptographically signed mlg1.* token (works across serverless instances)
  const signed = verifySignedSessionToken(token);
  if (signed) {
    if (dbCache.revokedSessionIds.includes(signed.sid)) {
      return null;
    }
    const existing = dbCache.users.find((u) => u.id === signed.uid);
    if (existing) {
      if (existing.status !== 'active') return null;
      syncPrimaryAdminRole(existing);
      return existing;
    }
    // If running in ephemeral serverless memory without KV configured and the cold instance
    // hasn't seen this user yet, materialize session user from verified HMAC claims.
    if (isServerless && !isRemoteStorageConfigured()) {
      const hydratedUser: StoredUser = {
        id: signed.uid,
        name: signed.name,
        username: signed.username,
        email: signed.email,
        role: isPrimaryAdminEmail(signed.email) ? 'admin' : signed.role === 'admin' ? 'admin' : 'user',
        plan: signed.plan || 'free',
        status: 'active',
        passwordHash: '',
        createdAt: new Date().toISOString(),
        settings: createDefaultUserSettings(),
        myGameIds: [],
      };
      dbCache.users.push(hydratedUser);
      saveDb();
      return hydratedUser;
    }
    return null;
  }

  // 2. Fallback for legacy opaque session tokens in local store
  const session = dbCache.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    dbCache.sessions = dbCache.sessions.filter((s) => s.token !== token);
    saveDb();
    return null;
  }
  const user = dbCache.users.find((u) => u.id === session.userId);
  if (!user || user.status !== 'active') return null;
  syncPrimaryAdminRole(user);
  return user;
}

export function addSubscriptionRecord(
  userId: string,
  plan: PlanTier,
  status: SubscriptionRecord['status'],
  note: string,
): SubscriptionRecord {
  const rec: SubscriptionRecord = {
    id: `sub_${crypto.randomUUID().slice(0, 12)}`,
    userId,
    plan,
    status,
    provider: 'local-tier',
    note,
    createdAt: new Date().toISOString(),
  };
  dbCache.subscriptions.unshift(rec);
  saveDb();
  return rec;
}
