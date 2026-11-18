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
  resetTokens: PasswordResetToken[];
  games: GameItem[];
  rules: EventRule[];
  events: LiveEventPayload[];
  subscriptions: SubscriptionRecord[];
  platformSettings: PlatformSettings;
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

const EMPTY_DB: DatabaseSchema = {
  users: [],
  sessions: [],
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

function ensureDbLoaded(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
    return structuredClone(EMPTY_DB);
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
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
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

let dbCache: DatabaseSchema = ensureDbLoaded();

export function getDb(): DatabaseSchema {
  return dbCache;
}

export function saveDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
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

export function createSession(userId: string): SessionRecord {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days
  const record: SessionRecord = {
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  dbCache.sessions = dbCache.sessions.filter(
    (s) => new Date(s.expiresAt).getTime() > Date.now(),
  );
  dbCache.sessions.push(record);
  saveDb();
  return record;
}

export function findUserBySessionToken(token: string | undefined): StoredUser | null {
  if (!token) return null;
  const session = dbCache.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    dbCache.sessions = dbCache.sessions.filter((s) => s.token !== token);
    saveDb();
    return null;
  }
  const user = dbCache.users.find((u) => u.id === session.userId);
  if (!user || user.status !== 'active') return null;
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
