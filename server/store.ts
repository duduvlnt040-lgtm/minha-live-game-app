import crypto from 'node:crypto';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type {
  AdminAiMusicRule,
  AdminOverviewStats,
  EventRule,
  GameCategory,
  GameControlsConfig,
  GameEngine,
  GameItem,
  GameMusicPreferences,
  GameOverlayProfile,
  GiftActionKey,
  GiftMapping,
  LiveEventPayload,
  LiveEventType,
  MusicPlaylist,
  MusicScope,
  MusicSourceMode,
  MusicTrack,
  OverlayConfig,
  PlatformSettings,
  PlanTier,
  RuleActionType,
  RuleOperator,
  SubscriptionRecord,
  UserProfile,
  UserRole,
  UserSettings,
} from '../src/types/platform.js';
import { getActionOption } from '../src/lib/giftActions.js';
import { filterEligibleTracks, inferTrackMetadataFromFilename } from '../src/lib/smartMusicAi.js';
import { isSupabaseApiKeyToken } from '../src/lib/supabaseKeyUtils.js';
import { createSupabaseAuthClient, getSupabaseAdmin } from './supabase.js';

export type StoredUser = UserProfile;

export interface AuthSessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export const PRIMARY_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'duduvlnt040@gmail.com')
  .trim()
  .toLowerCase();

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

function mergeUserSettings(raw: unknown): UserSettings {
  const defaults = createDefaultUserSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Partial<UserSettings>;
  return {
    ...defaults,
    ...obj,
    defaultOverlay: {
      ...defaults.defaultOverlay,
      ...(obj.defaultOverlay && typeof obj.defaultOverlay === 'object' ? obj.defaultOverlay : {}),
    },
  };
}

function mergeOverlayConfig(raw: unknown): OverlayConfig {
  const defaults = createDefaultOverlayConfig();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    ...defaults,
    ...(raw as Partial<OverlayConfig>),
  };
}

export function sanitizeUser(user: StoredUser): UserProfile {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    plan: user.plan,
    status: user.status,
    avatarUrl: user.avatarUrl,
    myGameIds: Array.isArray(user.myGameIds) ? user.myGameIds : [],
    createdAt: user.createdAt,
    settings: mergeUserSettings(user.settings),
  };
}

export function isPrimaryAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

export function resolveInitialRole(email: string): UserRole {
  return isPrimaryAdminEmail(email) ? 'admin' : 'user';
}

interface DbUserRow {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  status: 'active' | 'suspended';
  avatar_url: string | null;
  settings: UserSettings | null;
  created_at: string;
  updated_at: string;
}

interface DbGameRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: GameCategory;
  engine: GameEngine;
  entry_file: string;
  cover_image: string | null;
  is_active: boolean;
  bundle_html: string;
  file_list: string[] | null;
  total_size_bytes: number;
  overlay_config: OverlayConfig | null;
  created_at: string;
  updated_at: string;
}

interface DbRuleRow {
  id: string;
  user_id: string;
  game_id: string;
  name: string;
  enabled: boolean;
  event_type: LiveEventType;
  operator: RuleOperator;
  condition_value: string;
  action_type: RuleActionType;
  action_command: string;
  action_payload: string;
  created_at: string;
  updated_at: string;
}

interface DbEventRow {
  id: string;
  user_id: string;
  game_id: string;
  type: LiveEventType;
  sender_username: string;
  gift_name: string | null;
  gift_count: number | null;
  comment_text: string | null;
  like_count: number | null;
  points: number | null;
  bonus_multiplier: number | null;
  is_simulation: boolean;
  matched_rule_ids: string[] | null;
  triggered_commands: LiveEventPayload['triggeredCommands'] | null;
  created_at: string;
}

interface DbSubscriptionRow {
  id: string;
  user_id: string;
  plan: PlanTier;
  status: 'active' | 'scheduled' | 'cancelled';
  provider: 'local-tier' | 'mercadopago-pending';
  note: string;
  created_at: string;
}

interface DbPlatformSettingsRow {
  id: number;
  registration_enabled: boolean;
  maintenance_mode: boolean;
  default_watermark_text: string;
  max_upload_size_mb: number;
}

function mapUserRow(row: DbUserRow, myGameIds: string[]): StoredUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: isPrimaryAdminEmail(row.email) ? 'admin' : row.role,
    plan: row.plan,
    status: row.status,
    avatarUrl: row.avatar_url ?? undefined,
    myGameIds,
    createdAt: new Date(row.created_at).toISOString(),
    settings: mergeUserSettings(row.settings),
  };
}

function mapGameRow(row: DbGameRow): GameItem {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    category: row.category,
    engine: row.engine,
    entryFile: row.entry_file,
    coverImage: row.cover_image ?? undefined,
    isActive: row.is_active,
    bundleHtml: row.bundle_html,
    fileList: Array.isArray(row.file_list) ? row.file_list : [],
    totalSizeBytes: row.total_size_bytes,
    overlayConfig: mergeOverlayConfig(row.overlay_config),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapRuleRow(row: DbRuleRow): EventRule {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    name: row.name,
    enabled: row.enabled,
    eventType: row.event_type,
    operator: row.operator,
    conditionValue: row.condition_value,
    actionType: row.action_type,
    actionCommand: row.action_command,
    actionPayload: row.action_payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapEventRow(row: DbEventRow): LiveEventPayload {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    type: row.type,
    senderUsername: row.sender_username,
    giftName: row.gift_name ?? undefined,
    giftCount: row.gift_count ?? undefined,
    commentText: row.comment_text ?? undefined,
    likeCount: row.like_count ?? undefined,
    points: row.points ?? undefined,
    bonusMultiplier: row.bonus_multiplier ?? undefined,
    isSimulation: row.is_simulation,
    matchedRuleIds: Array.isArray(row.matched_rule_ids) ? row.matched_rule_ids : [],
    triggeredCommands: Array.isArray(row.triggered_commands) ? row.triggered_commands : [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapSubscriptionRow(row: DbSubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    status: row.status,
    provider: row.provider,
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeUsernameCandidate(raw: string, fallbackSeed: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 24);
  }
  const suffix = fallbackSeed.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase() || 'user';
  return `${cleaned || 'user'}_${suffix}`.slice(0, 24);
}

async function getUserSavedGameIds(userId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('user_saved_games')
    .select('game_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao consultar jogos salvos: ${error.message}`);
  }
  return (data || []).map((row) => String((row as { game_id: string }).game_id));
}

async function ensureInitialFreeSubscription(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const subId = `sub_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || crypto.randomUUID().slice(0, 12)}`;
  const { error } = await admin.from('subscriptions').upsert(
    {
      id: subId,
      user_id: userId,
      plan: 'free',
      status: 'active',
      provider: 'local-tier',
      note: 'Plano inicial gratuito ativado no cadastro.',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('Aviso ao garantir assinatura inicial gratuita:', error.message);
  }
}

export async function ensureProfileForAuthUser(
  authUser: SupabaseAuthUser,
  fallbackMeta?: { name?: string; username?: string },
): Promise<StoredUser> {
  const admin = getSupabaseAdmin();
  const cleanEmail = (authUser.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Usuário autenticado no Supabase sem e-mail vinculado.');
  }

  // 1. Try lookup by exact Supabase Auth UUID
  const { data: byId, error: byIdError } = await admin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle<DbUserRow>();

  if (byIdError) {
    throw new Error(`Falha ao consultar perfil do usuário no Supabase: ${byIdError.message}`);
  }

  if (byId) {
    // Preserve existing 'admin' role permanently; auto-promote PRIMARY_ADMIN_EMAIL if needed
    if (isPrimaryAdminEmail(byId.email)) {
      if (byId.role !== 'admin') {
        const { error: promoteErr } = await admin
          .from('users')
          .update({ role: 'admin', updated_at: new Date().toISOString() })
          .eq('id', byId.id);
        if (!promoteErr) {
          byId.role = 'admin';
        }
      }
      if (authUser.app_metadata?.role !== 'admin') {
        await admin.auth.admin
          .updateUserById(authUser.id, { app_metadata: { ...(authUser.app_metadata || {}), role: 'admin' } })
          .catch(() => {});
      }
    }

    const myGameIds = await getUserSavedGameIds(byId.id);
    return mapUserRow(byId, myGameIds);
  }

  // 2. Fallback lookup by email (preserves any existing ADM/user row without overwriting role)
  const { data: byEmail, error: byEmailError } = await admin
    .from('users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle<DbUserRow>();

  if (byEmailError) {
    throw new Error(`Falha ao consultar perfil por e-mail no Supabase: ${byEmailError.message}`);
  }

  if (byEmail) {
    if (isPrimaryAdminEmail(byEmail.email)) {
      if (byEmail.role !== 'admin') {
        await admin
          .from('users')
          .update({ role: 'admin', updated_at: new Date().toISOString() })
          .eq('id', byEmail.id);
        byEmail.role = 'admin';
      }
      if (authUser.app_metadata?.role !== 'admin') {
        await admin.auth.admin
          .updateUserById(authUser.id, { app_metadata: { ...(authUser.app_metadata || {}), role: 'admin' } })
          .catch(() => {});
      }
    }
    const myGameIds = await getUserSavedGameIds(byEmail.id);
    return mapUserRow(byEmail, myGameIds);
  }

  // 3. Create permanent profile row linked 1:1 with Supabase Auth user.id
  const metaName =
    fallbackMeta?.name ||
    (typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : '') ||
    cleanEmail.split('@')[0] ||
    'Criador';

  const baseUsername = normalizeUsernameCandidate(
    fallbackMeta?.username ||
      (typeof authUser.user_metadata?.username === 'string' ? authUser.user_metadata.username : '') ||
      cleanEmail.split('@')[0] ||
      'criador',
    authUser.id,
  );

  let finalUsername = baseUsername;
  const { data: existingUsername } = await admin
    .from('users')
    .select('id')
    .ilike('username', finalUsername)
    .maybeSingle();

  if (existingUsername) {
    const suffix = authUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toLowerCase();
    finalUsername = `${baseUsername.slice(0, 19)}_${suffix}`;
  }

  const role = resolveInitialRole(cleanEmail);
  const settings = createDefaultUserSettings();
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from('users')
    .upsert(
      {
        id: authUser.id,
        name: metaName.trim().slice(0, 80),
        username: finalUsername,
        email: cleanEmail,
        role,
        plan: 'free',
        status: 'active',
        settings,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle<DbUserRow>();

  if (insertError) {
    throw new Error(`Falha ao gravar perfil do usuário no Supabase: ${insertError.message}`);
  }

  await ensureInitialFreeSubscription(authUser.id);

  if (inserted) {
    const myGameIds = await getUserSavedGameIds(inserted.id);
    return mapUserRow(inserted, myGameIds);
  }

  // Re-read in case concurrent trigger inserted the row
  const { data: reloaded, error: reloadErr } = await admin
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single<DbUserRow>();

  if (reloadErr || !reloaded) {
    throw new Error('Perfil criado no Supabase, mas não foi possível recarregar os dados.');
  }

  const myGameIds = await getUserSavedGameIds(reloaded.id);
  return mapUserRow(reloaded, myGameIds);
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle<DbPlatformSettingsRow>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return {
        registrationEnabled: data.registration_enabled,
        maintenanceMode: data.maintenance_mode,
        defaultWatermarkText: data.default_watermark_text,
        maxUploadSizeMb: data.max_upload_size_mb,
      };
    }

    await admin.from('platform_settings').upsert(
      {
        id: 1,
        registration_enabled: true,
        maintenance_mode: false,
        default_watermark_text: 'MINHA LIVE GAMES',
        max_upload_size_mb: 25,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

    return {
      registrationEnabled: true,
      maintenanceMode: false,
      defaultWatermarkText: 'MINHA LIVE GAMES',
      maxUploadSizeMb: 25,
    };
  } catch (err) {
    console.error('Erro ao consultar configurações da plataforma no Supabase:', err);
    throw new Error('Falha ao acessar configurações no Supabase.', { cause: err });
  }
}

export async function updatePlatformSettings(
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  try {
    const admin = getSupabaseAdmin();
    const current = await getPlatformSettings();
    const next: PlatformSettings = {
      ...current,
      ...patch,
    };

    const { error } = await admin.from('platform_settings').upsert(
      {
        id: 1,
        registration_enabled: next.registrationEnabled,
        maintenance_mode: next.maintenanceMode,
        default_watermark_text: next.defaultWatermarkText,
        max_upload_size_mb: next.maxUploadSizeMb,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (error) {
      throw new Error(error.message);
    }

    return next;
  } catch (err) {
    console.error('Erro ao atualizar configurações da plataforma no Supabase:', err);
    throw new Error('Falha ao atualizar configurações no Supabase.', { cause: err });
  }
}

export async function checkUserExists(
  email: string,
  username: string,
): Promise<{
  emailExists: boolean;
  usernameExists: boolean;
}> {
  try {
    const admin = getSupabaseAdmin();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    const [{ data: emailRow, error: emailErr }, { data: usernameRow, error: userErr }] =
      await Promise.all([
        admin.from('users').select('id').ilike('email', cleanEmail).limit(1).maybeSingle(),
        admin.from('users').select('id').ilike('username', cleanUsername).limit(1).maybeSingle(),
      ]);

    if (emailErr || userErr) {
      throw new Error((emailErr || userErr)?.message || 'Erro de consulta');
    }

    return {
      emailExists: Boolean(emailRow),
      usernameExists: Boolean(usernameRow),
    };
  } catch (err) {
    console.error('Erro ao verificar duplicidade de cadastro no Supabase:', err);
    throw new Error('Falha ao validar disponibilidade da conta no Supabase.', { cause: err });
  }
}

export async function registerUserWithSupabase(input: {
  name: string;
  username: string;
  email: string;
  password: string;
}): Promise<{
  user?: StoredUser;
  session?: AuthSessionTokens;
  conflictEmail?: boolean;
  error?: string;
}> {
  const admin = getSupabaseAdmin();
  const authClient = createSupabaseAuthClient();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanUsername = input.username.trim().toLowerCase();
  const cleanName = input.name.trim().slice(0, 80);
  const initialRole = resolveInitialRole(cleanEmail);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: cleanName,
      username: cleanUsername,
    },
    app_metadata: {
      role: initialRole,
    },
  });

  if (createError || !created.user) {
    const msg = (createError?.message || '').toLowerCase();
    if (
      msg.includes('already been registered') ||
      msg.includes('already exists') ||
      msg.includes('duplicate')
    ) {
      return { conflictEmail: true, error: 'Já existe uma conta cadastrada com este e-mail.' };
    }
    throw new Error(`Falha ao criar usuário no Supabase Auth: ${createError?.message || 'erro desconhecido'}`);
  }

  const nowIso = new Date().toISOString();
  const defaultSettings = createDefaultUserSettings();

  // Upsert ensures exact name/username/role/settings even if trigger already inserted defaults
  const { error: upsertErr } = await admin.from('users').upsert(
    {
      id: created.user.id,
      name: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      role: initialRole,
      plan: 'free',
      status: 'active',
      settings: defaultSettings,
      created_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'id' },
  );

  if (upsertErr) {
    // Cleanup orphan auth user if public.users insert failed due to unique username race
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    if (upsertErr.message.toLowerCase().includes('username')) {
      return { error: 'Este nome de usuário já está em uso.' };
    }
    throw new Error(`Falha ao gravar perfil no PostgreSQL do Supabase: ${upsertErr.message}`);
  }

  await ensureInitialFreeSubscription(created.user.id);

  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: cleanEmail,
    password: input.password,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Conta criada, mas falhou ao iniciar sessão no Supabase: ${signInError?.message}`);
  }

  const profile = await ensureProfileForAuthUser(created.user, {
    name: cleanName,
    username: cleanUsername,
  });

  return {
    user: profile,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
    },
  };
}

export async function loginUserWithSupabase(
  identifier: string,
  password: string,
): Promise<{
  user?: StoredUser;
  session?: AuthSessionTokens;
  suspended?: boolean;
  error?: string;
}> {
  const admin = getSupabaseAdmin();
  const authClient = createSupabaseAuthClient();
  const cleanId = identifier.trim().toLowerCase();

  let loginEmail = cleanId;
  if (!cleanId.includes('@')) {
    const { data: userByUsername, error: lookupError } = await admin
      .from('users')
      .select('email')
      .ilike('username', cleanId)
      .limit(1)
      .maybeSingle<{ email: string }>();

    if (lookupError) {
      throw new Error(`Falha ao localizar usuário no Supabase: ${lookupError.message}`);
    }
    if (!userByUsername?.email) {
      return { error: 'Credenciais inválidas. Verifique seu e-mail e senha.' };
    }
    loginEmail = userByUsername.email.trim().toLowerCase();
  }

  const { data, error } = await authClient.auth.signInWithPassword({
    email: loginEmail,
    password,
  });

  if (error || !data.user || !data.session) {
    const lowerMsg = (error?.message || '').toLowerCase();
    if (lowerMsg.includes('email not confirmed')) {
      return {
        error:
          'E-mail ainda não confirmado no Supabase. Confirme o cadastro ou habilite o usuário no painel Authentication.',
      };
    }
    return { error: 'Credenciais inválidas. Verifique seu e-mail e senha.' };
  }

  const profile = await ensureProfileForAuthUser(data.user);
  if (profile.status !== 'active') {
    await authClient.auth.signOut().catch(() => {});
    return {
      suspended: true,
      error: 'Esta conta está suspensa. Contate o suporte.',
    };
  }

  return {
    user: profile,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  };
}

export async function findUserByAccessToken(
  accessToken: string | undefined,
  refreshToken?: string | undefined,
): Promise<{
  user: StoredUser;
  refreshedSession?: AuthSessionTokens;
} | null> {
  const usableAccessToken =
    accessToken && !isSupabaseApiKeyToken(accessToken) ? accessToken : undefined;
  const usableRefreshToken =
    refreshToken && !isSupabaseApiKeyToken(refreshToken) ? refreshToken : undefined;

  if (!usableAccessToken && !usableRefreshToken) return null;

  try {
    const admin = getSupabaseAdmin();

    if (usableAccessToken) {
      const { data, error } = await admin.auth.getUser(usableAccessToken);
      if (!error && data.user) {
        const profile = await ensureProfileForAuthUser(data.user);
        if (profile.status !== 'active') return null;
        return { user: profile };
      }
    }

    if (usableRefreshToken) {
      const authClient = createSupabaseAuthClient();
      const { data, error } = await authClient.auth.refreshSession({
        refresh_token: usableRefreshToken,
      });
      if (!error && data.user && data.session) {
        const profile = await ensureProfileForAuthUser(data.user);
        if (profile.status !== 'active') return null;
        return {
          user: profile,
          refreshedSession: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Erro ao validar token Supabase:', err);
    throw err;
  }
}

export async function logoutSupabaseToken(accessToken: string | undefined): Promise<void> {
  if (!accessToken) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.auth.admin.signOut(accessToken, 'local');
  } catch (err) {
    console.warn('Aviso ao encerrar sessão no Supabase Auth:', err);
  }
}

export async function sendSupabasePasswordRecovery(
  email: string,
  redirectTo: string,
): Promise<void> {
  const authClient = createSupabaseAuthClient();
  const cleanEmail = email.trim().toLowerCase();
  const { error } = await authClient.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo,
  });
  if (error) {
    console.warn('Aviso ao solicitar redefinição via Supabase Auth:', error.message);
  }
}

export async function updateSupabaseUserPassword(
  userId: string,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const authClient = createSupabaseAuthClient();
  const admin = getSupabaseAdmin();

  const { error: verifyErr } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: currentPassword,
  });

  if (verifyErr) {
    return { ok: false, error: 'Senha atual incorreta.' };
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateErr) {
    return { ok: false, error: `Não foi possível atualizar a senha: ${updateErr.message}` };
  }

  return { ok: true };
}

export async function updateUserProfileAndSettings(
  userId: string,
  patch: { name?: string; settings?: UserSettings },
): Promise<StoredUser> {
  try {
    const admin = getSupabaseAdmin();
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.settings !== undefined) updatePayload.settings = patch.settings;

    const { data, error } = await admin
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('*')
      .single<DbUserRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Usuário não encontrado.');
    }

    const myGameIds = await getUserSavedGameIds(userId);
    return mapUserRow(data, myGameIds);
  } catch (err) {
    console.error('Erro ao atualizar perfil no Supabase:', err);
    throw new Error('Falha ao atualizar perfil no banco de dados.', { cause: err });
  }
}

export async function listGamesForRole(isAdmin: boolean): Promise<GameItem[]> {
  try {
    const admin = getSupabaseAdmin();
    let query = admin.from('games').select('*').order('created_at', { ascending: false });
    if (!isAdmin) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return ((data || []) as DbGameRow[]).map(mapGameRow);
  } catch (err) {
    console.error('Erro ao listar jogos no Supabase:', err);
    throw new Error('Falha ao consultar jogos no banco de dados.', { cause: err });
  }
}

export async function findGameById(gameId: string): Promise<GameItem | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle<DbGameRow>();

    if (error) {
      throw new Error(error.message);
    }
    return data ? mapGameRow(data) : null;
  } catch (err) {
    console.error('Erro ao buscar jogo no Supabase:', err);
    throw new Error('Falha ao consultar jogo no banco de dados.', { cause: err });
  }
}

export async function createGameRecord(input: {
  userId: string;
  name: string;
  description: string;
  category: GameCategory;
  engine: GameEngine;
  entryFile: string;
  coverImage?: string;
  isActive: boolean;
  bundleHtml: string;
  fileList: string[];
  totalSizeBytes: number;
  overlayConfig: OverlayConfig;
}): Promise<GameItem> {
  try {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from('games')
      .insert({
        id: `gm_${crypto.randomUUID().slice(0, 10)}`,
        user_id: input.userId,
        name: input.name,
        description: input.description,
        category: input.category,
        engine: input.engine,
        entry_file: input.entryFile,
        cover_image: input.coverImage ?? null,
        is_active: input.isActive,
        bundle_html: input.bundleHtml,
        file_list: input.fileList,
        total_size_bytes: input.totalSizeBytes,
        overlay_config: input.overlayConfig,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single<DbGameRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Erro ao inserir jogo');
    }
    return mapGameRow(data);
  } catch (err) {
    console.error('Erro ao salvar jogo no Supabase:', err);
    throw new Error('Falha ao cadastrar jogo no banco de dados.', { cause: err });
  }
}

export async function updateGameRecord(
  gameId: string,
  patch: Partial<{
    name: string;
    description: string;
    category: GameCategory;
    engine: GameEngine;
    isActive: boolean;
    coverImage: string;
    bundleHtml: string;
    totalSizeBytes: number;
    overlayConfig: OverlayConfig;
  }>,
): Promise<GameItem | null> {
  try {
    const admin = getSupabaseAdmin();
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.category !== undefined) updatePayload.category = patch.category;
    if (patch.engine !== undefined) updatePayload.engine = patch.engine;
    if (patch.isActive !== undefined) updatePayload.is_active = patch.isActive;
    if (patch.coverImage !== undefined) updatePayload.cover_image = patch.coverImage;
    if (patch.bundleHtml !== undefined) updatePayload.bundle_html = patch.bundleHtml;
    if (patch.totalSizeBytes !== undefined) updatePayload.total_size_bytes = patch.totalSizeBytes;
    if (patch.overlayConfig !== undefined) updatePayload.overlay_config = patch.overlayConfig;

    const { data, error } = await admin
      .from('games')
      .update(updatePayload)
      .eq('id', gameId)
      .select('*')
      .maybeSingle<DbGameRow>();

    if (error) {
      throw new Error(error.message);
    }
    return data ? mapGameRow(data) : null;
  } catch (err) {
    console.error('Erro ao atualizar jogo no Supabase:', err);
    throw new Error('Falha ao atualizar jogo no banco de dados.', { cause: err });
  }
}

export async function deleteGameRecord(gameId: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data: existing, error: findErr } = await admin
      .from('games')
      .select('id')
      .eq('id', gameId)
      .maybeSingle();

    if (findErr) {
      throw new Error(findErr.message);
    }
    if (!existing) return false;

    await admin.from('event_rules').delete().eq('game_id', gameId);
    const { error: delErr } = await admin.from('games').delete().eq('id', gameId);
    if (delErr) {
      throw new Error(delErr.message);
    }
    return true;
  } catch (err) {
    console.error('Erro ao excluir jogo no Supabase:', err);
    throw new Error('Falha ao excluir jogo no banco de dados.', { cause: err });
  }
}

export async function addUserSavedGame(
  userId: string,
  gameId: string,
): Promise<{ myGameIds: string[]; user: UserProfile } | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data: activeGame, error: gameErr } = await admin
      .from('games')
      .select('id')
      .eq('id', gameId)
      .eq('is_active', true)
      .maybeSingle();

    if (gameErr) {
      throw new Error(gameErr.message);
    }
    if (!activeGame) return null;

    const { error: upsertErr } = await admin
      .from('user_saved_games')
      .upsert(
        { user_id: userId, game_id: gameId, created_at: new Date().toISOString() },
        { onConflict: 'user_id,game_id', ignoreDuplicates: true },
      );

    if (upsertErr) {
      throw new Error(upsertErr.message);
    }

    const { data: userRow, error: userErr } = await admin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<DbUserRow>();

    if (userErr || !userRow) {
      throw new Error(userErr?.message || 'Usuário não encontrado.');
    }

    const myGameIds = await getUserSavedGameIds(userId);
    return { myGameIds, user: sanitizeUser(mapUserRow(userRow, myGameIds)) };
  } catch (err) {
    console.error('Erro ao adicionar jogo em Meus Jogos:', err);
    throw new Error('Falha ao salvar jogo na lista pessoal.', { cause: err });
  }
}

export async function removeUserSavedGame(
  userId: string,
  gameId: string,
): Promise<{ myGameIds: string[]; user: UserProfile }> {
  try {
    const admin = getSupabaseAdmin();
    const { error: delErr } = await admin
      .from('user_saved_games')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId);

    if (delErr) {
      throw new Error(delErr.message);
    }

    const { data: userRow, error: userErr } = await admin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<DbUserRow>();

    if (userErr || !userRow) {
      throw new Error(userErr?.message || 'Usuário não encontrado.');
    }

    const myGameIds = await getUserSavedGameIds(userId);
    return { myGameIds, user: sanitizeUser(mapUserRow(userRow, myGameIds)) };
  } catch (err) {
    console.error('Erro ao remover jogo de Meus Jogos:', err);
    throw new Error('Falha ao remover jogo da lista pessoal.', { cause: err });
  }
}

export async function listRulesForUser(userId: string): Promise<EventRule[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('event_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }
    return ((data || []) as DbRuleRow[]).map(mapRuleRow);
  } catch (err) {
    console.error('Erro ao listar regras no Supabase:', err);
    throw new Error('Falha ao consultar regras no banco de dados.', { cause: err });
  }
}

export async function countRulesForUser(userId: string): Promise<number> {
  try {
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
      .from('event_rules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
    return count ?? 0;
  } catch (err) {
    console.error('Erro ao contar regras no Supabase:', err);
    throw new Error('Falha ao contar regras no banco de dados.', { cause: err });
  }
}

export async function createRuleRecord(input: {
  userId: string;
  gameId: string;
  name: string;
  enabled: boolean;
  eventType: LiveEventType;
  operator: RuleOperator;
  conditionValue: string;
  actionType: RuleActionType;
  actionCommand: string;
  actionPayload: string;
}): Promise<EventRule> {
  try {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from('event_rules')
      .insert({
        id: `rl_${crypto.randomUUID().slice(0, 10)}`,
        user_id: input.userId,
        game_id: input.gameId,
        name: input.name,
        enabled: input.enabled,
        event_type: input.eventType,
        operator: input.operator,
        condition_value: input.conditionValue,
        action_type: input.actionType,
        action_command: input.actionCommand,
        action_payload: input.actionPayload,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single<DbRuleRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Erro ao criar regra');
    }
    return mapRuleRow(data);
  } catch (err) {
    console.error('Erro ao criar regra no Supabase:', err);
    throw new Error('Falha ao salvar regra no banco de dados.', { cause: err });
  }
}

export async function updateRuleRecord(
  ruleId: string,
  userId: string,
  patch: Partial<{
    name: string;
    gameId: string;
    enabled: boolean;
    eventType: LiveEventType;
    operator: RuleOperator;
    conditionValue: string;
    actionType: RuleActionType;
    actionCommand: string;
    actionPayload: string;
  }>,
): Promise<EventRule | null> {
  try {
    const admin = getSupabaseAdmin();
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.gameId !== undefined) updatePayload.game_id = patch.gameId;
    if (patch.enabled !== undefined) updatePayload.enabled = patch.enabled;
    if (patch.eventType !== undefined) updatePayload.event_type = patch.eventType;
    if (patch.operator !== undefined) updatePayload.operator = patch.operator;
    if (patch.conditionValue !== undefined) updatePayload.condition_value = patch.conditionValue;
    if (patch.actionType !== undefined) updatePayload.action_type = patch.actionType;
    if (patch.actionCommand !== undefined) updatePayload.action_command = patch.actionCommand;
    if (patch.actionPayload !== undefined) updatePayload.action_payload = patch.actionPayload;

    const { data, error } = await admin
      .from('event_rules')
      .update(updatePayload)
      .eq('id', ruleId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle<DbRuleRow>();

    if (error) {
      throw new Error(error.message);
    }
    return data ? mapRuleRow(data) : null;
  } catch (err) {
    console.error('Erro ao atualizar regra no Supabase:', err);
    throw new Error('Falha ao atualizar regra no banco de dados.', { cause: err });
  }
}

export async function deleteRuleRecord(ruleId: string, userId: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('event_rules')
      .delete()
      .eq('id', ruleId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      throw new Error(error.message);
    }
    return (data || []).length > 0;
  } catch (err) {
    console.error('Erro ao excluir regra no Supabase:', err);
    throw new Error('Falha ao excluir regra no banco de dados.', { cause: err });
  }
}

export async function listEventsForUser(userId: string, limit = 100): Promise<LiveEventPayload[]> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('live_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }
    return ((data || []) as DbEventRow[]).map(mapEventRow);
  } catch (err) {
    console.error('Erro ao listar eventos no Supabase:', err);
    throw new Error('Falha ao consultar eventos no banco de dados.', { cause: err });
  }
}

export async function recordLiveEvent(input: {
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
  matchedRuleIds: string[];
  triggeredCommands: LiveEventPayload['triggeredCommands'];
}): Promise<LiveEventPayload> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('live_events')
      .insert({
        id: `evt_${crypto.randomUUID().slice(0, 10)}`,
        user_id: input.userId,
        game_id: input.gameId,
        type: input.type,
        sender_username: input.senderUsername,
        gift_name: input.giftName ?? null,
        gift_count: input.giftCount ?? null,
        comment_text: input.commentText ?? null,
        like_count: input.likeCount ?? null,
        points: input.points ?? null,
        bonus_multiplier: input.bonusMultiplier ?? null,
        is_simulation: input.isSimulation,
        matched_rule_ids: input.matchedRuleIds,
        triggered_commands: input.triggeredCommands,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single<DbEventRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Erro ao registrar evento');
    }
    return mapEventRow(data);
  } catch (err) {
    console.error('Erro ao gravar evento no Supabase:', err);
    throw new Error('Falha ao registrar evento no banco de dados.', { cause: err });
  }
}

export async function listOverlayEventsSince(
  gameId: string,
  sinceMs: number,
  userId?: string,
): Promise<LiveEventPayload[]> {
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) return [];
  try {
    const admin = getSupabaseAdmin();
    const sinceIso = new Date(sinceMs).toISOString();
    const safeGameId = gameId.replace(/"/g, '');
    let query = admin
      .from('live_events')
      .select('*')
      .or(`game_id.eq."${safeGameId}",game_id.eq.all`)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(30);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }
    return ((data || []) as DbEventRow[]).map(mapEventRow);
  } catch (err) {
    console.error('Erro ao consultar eventos do overlay no Supabase:', err);
    throw new Error('Falha ao consultar eventos do overlay.', { cause: err });
  }
}

export async function getSubscriptionSummaryForUser(user: StoredUser): Promise<{
  history: SubscriptionRecord[];
  gamesCount: number;
  rulesCount: number;
}> {
  try {
    const admin = getSupabaseAdmin();
    const [subRes, totalGamesRes, activeGamesRes, rulesCount] = await Promise.all([
      admin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      admin.from('games').select('id', { count: 'exact', head: true }),
      admin.from('games').select('id').eq('is_active', true),
      countRulesForUser(user.id),
    ]);

    if (subRes.error) throw new Error(subRes.error.message);
    if (totalGamesRes.error) throw new Error(totalGamesRes.error.message);
    if (activeGamesRes.error) throw new Error(activeGamesRes.error.message);

    const activeIds = new Set(
      ((activeGamesRes.data || []) as Array<{ id: string }>).map((g) => g.id),
    );
    const gamesCount =
      user.role === 'admin'
        ? totalGamesRes.count ?? 0
        : (user.myGameIds || []).filter((id) => activeIds.has(id)).length;

    return {
      history: ((subRes.data || []) as DbSubscriptionRow[]).map(mapSubscriptionRow),
      gamesCount,
      rulesCount,
    };
  } catch (err) {
    console.error('Erro ao consultar assinaturas no Supabase:', err);
    throw new Error('Falha ao consultar assinatura no banco de dados.', { cause: err });
  }
}

export async function getAdminOverviewData(): Promise<{
  stats: AdminOverviewStats;
  users: UserProfile[];
  games: Array<{
    id: string;
    userId: string;
    name: string;
    category: GameCategory;
    engine: GameEngine;
    isActive: boolean;
    totalSizeBytes: number;
    createdAt: string;
  }>;
  subscriptions: SubscriptionRecord[];
  platformSettings: PlatformSettings;
}> {
  try {
    const admin = getSupabaseAdmin();
    const [
      usersRes,
      savedRes,
      gamesRes,
      subsRes,
      eventsCountRes,
      rulesCountRes,
      settings,
    ] = await Promise.all([
      admin.from('users').select('*').order('created_at', { ascending: false }),
      admin.from('user_saved_games').select('user_id, game_id'),
      admin
        .from('games')
        .select('id, user_id, name, category, engine, is_active, total_size_bytes, created_at')
        .order('created_at', { ascending: false }),
      admin.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(50),
      admin.from('live_events').select('id', { count: 'exact', head: true }),
      admin.from('event_rules').select('id', { count: 'exact', head: true }),
      getPlatformSettings(),
    ]);

    if (usersRes.error) throw new Error(usersRes.error.message);
    if (savedRes.error) throw new Error(savedRes.error.message);
    if (gamesRes.error) throw new Error(gamesRes.error.message);
    if (subsRes.error) throw new Error(subsRes.error.message);
    if (eventsCountRes.error) throw new Error(eventsCountRes.error.message);
    if (rulesCountRes.error) throw new Error(rulesCountRes.error.message);

    const savedByUser = new Map<string, string[]>();
    for (const link of (savedRes.data || []) as Array<{ user_id: string; game_id: string }>) {
      const list = savedByUser.get(link.user_id) || [];
      list.push(link.game_id);
      savedByUser.set(link.user_id, list);
    }

    const mappedUsers = ((usersRes.data || []) as DbUserRow[]).map((u) =>
      sanitizeUser(mapUserRow(u, savedByUser.get(u.id) || [])),
    );

    const rawGames = (gamesRes.data || []) as Array<{
      id: string;
      user_id: string;
      name: string;
      category: GameCategory;
      engine: GameEngine;
      is_active: boolean;
      total_size_bytes: number;
      created_at: string;
    }>;

    const stats: AdminOverviewStats = {
      totalUsers: mappedUsers.length,
      activeUsers: mappedUsers.filter((u) => u.status === 'active').length,
      totalGames: rawGames.length,
      activeGames: rawGames.filter((g) => g.is_active).length,
      totalEvents: eventsCountRes.count ?? 0,
      totalRules: rulesCountRes.count ?? 0,
      planDistribution: {
        free: mappedUsers.filter((u) => u.plan === 'free').length,
        premium: mappedUsers.filter((u) => u.plan === 'premium').length,
        pro: mappedUsers.filter((u) => u.plan === 'pro').length,
      },
    };

    return {
      stats,
      users: mappedUsers,
      games: rawGames.map((g) => ({
        id: g.id,
        userId: g.user_id,
        name: g.name,
        category: g.category,
        engine: g.engine,
        isActive: g.is_active,
        totalSizeBytes: g.total_size_bytes,
        createdAt: new Date(g.created_at).toISOString(),
      })),
      subscriptions: ((subsRes.data || []) as DbSubscriptionRow[]).map(mapSubscriptionRow),
      platformSettings: settings,
    };
  } catch (err) {
    console.error('Erro ao montar painel administrativo no Supabase:', err);
    throw new Error('Falha ao carregar dados administrativos do banco.', { cause: err });
  }
}

export async function adminUpdateUser(
  targetUserId: string,
  currentAdminId: string,
  patch: {
    role?: UserRole;
    plan?: PlanTier;
    status?: 'active' | 'suspended';
  },
): Promise<{ user?: UserProfile; error?: string; statusCode?: number }> {
  try {
    const admin = getSupabaseAdmin();
    const { data: target, error: findErr } = await admin
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle<DbUserRow>();

    if (findErr) {
      throw new Error(findErr.message);
    }
    if (!target) {
      return { error: 'Usuário não encontrado.', statusCode: 404 };
    }

    const updateSet: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    let addPlanSub = false;

    if (patch.role && (patch.role === 'user' || patch.role === 'admin')) {
      if ((target.id === currentAdminId || isPrimaryAdminEmail(target.email)) && patch.role !== 'admin') {
        return {
          error: 'Não é possível remover a permissão do administrador principal.',
          statusCode: 400,
        };
      }
      updateSet.role = patch.role;
    }

    if (patch.plan) {
      updateSet.plan = patch.plan;
      addPlanSub = true;
    }

    if (patch.status && (patch.status === 'active' || patch.status === 'suspended')) {
      updateSet.status = patch.status;
    }

    const { data: refreshed, error: updateErr } = await admin
      .from('users')
      .update(updateSet)
      .eq('id', targetUserId)
      .select('*')
      .single<DbUserRow>();

    if (updateErr || !refreshed) {
      throw new Error(updateErr?.message || 'Erro ao atualizar usuário');
    }

    if (patch.role) {
      await admin.auth.admin
        .updateUserById(targetUserId, { app_metadata: { role: refreshed.role } })
        .catch(() => {});
    }

    if (addPlanSub && patch.plan) {
      await admin.from('subscriptions').insert({
        id: `sub_${crypto.randomUUID().slice(0, 12)}`,
        user_id: targetUserId,
        plan: patch.plan,
        status: 'active',
        provider: 'local-tier',
        note: 'Plano atualizado pela administração.',
        created_at: new Date().toISOString(),
      });
    }

    const myGameIds = await getUserSavedGameIds(targetUserId);
    return { user: sanitizeUser(mapUserRow(refreshed, myGameIds)) };
  } catch (err) {
    console.error('Erro ao atualizar usuário pelo admin no Supabase:', err);
    throw new Error('Falha ao atualizar usuário no banco de dados.', { cause: err });
  }
}

// =============================================================================
// Presentes Personalizados, Biblioteca Musical (ADM + Pessoal), Rádio IA e Overlays
// =============================================================================

export const MUSIC_BUCKET_NAME = 'mlg-music';
const MAX_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_AUDIO_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

export function createDefaultControlsConfig(): GameControlsConfig {
  return {
    speedMultiplier: 1,
    actionIntensity: 1,
    globalCooldownMs: 0,
    enableKeyboardControls: true,
    autoTriggerOnGift: true,
    showGiftFeedInOverlay: true,
    showMusicWidgetInOverlay: true,
  };
}

function mergeControlsConfig(raw: unknown): GameControlsConfig {
  const defaults = createDefaultControlsConfig();
  if (!raw || typeof raw !== 'object') return defaults;
  return { ...defaults, ...(raw as Partial<GameControlsConfig>) };
}

interface DbGiftMappingRow {
  id: string;
  user_id: string;
  game_id: string;
  gift_name: string;
  min_count: number;
  action_key: GiftActionKey;
  action_label: string;
  action_command: string;
  action_payload: Record<string, unknown> | null;
  cooldown_ms: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface DbMusicTrackRow {
  id: string;
  scope: MusicScope;
  owner_user_id: string;
  game_id: string;
  title: string;
  artist: string;
  genre: string;
  mood: string;
  bpm: number | null;
  duration_sec: number | null;
  cover_url: string | null;
  storage_path: string;
  audio_url: string;
  mime_type: string;
  file_size_bytes: number;
  is_active: boolean;
  sort_order: number;
  ai_tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface DbMusicPlaylistRow {
  id: string;
  scope: MusicScope;
  owner_user_id: string;
  game_id: string;
  name: string;
  description: string;
  track_ids: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DbGameMusicPrefsRow {
  id: string;
  user_id: string;
  game_id: string;
  source_mode: MusicSourceMode;
  autoplay_enabled: boolean;
  ai_dj_enabled: boolean;
  crossfade_seconds: number;
  volume: number;
  muted: boolean;
  preferred_mood: string;
  active_playlist_id: string | null;
  ai_curated_order: string[] | null;
  updated_at: string;
}

interface DbAdminAiRuleRow {
  id: string;
  game_id: string;
  default_source_mode: MusicSourceMode;
  prioritize_official_ratio: number;
  avoid_repeat_window: number;
  crossfade_seconds: number;
  preferred_energy: string;
  ai_instructions: string;
  updated_at: string;
}

interface DbGameOverlayRow {
  id: string;
  user_id: string;
  game_id: string;
  label: string;
  tiktok_username: string;
  controls_config: GameControlsConfig | null;
  overlay_config: OverlayConfig | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapGiftMappingRow(row: DbGiftMappingRow): GiftMapping {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    giftName: row.gift_name,
    minCount: row.min_count,
    actionKey: row.action_key,
    actionLabel: row.action_label,
    actionCommand: row.action_command,
    actionPayload:
      row.action_payload && typeof row.action_payload === 'object' ? row.action_payload : {},
    cooldownMs: row.cooldown_ms,
    enabled: row.enabled,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapMusicTrackRow(row: DbMusicTrackRow): MusicTrack {
  return {
    id: row.id,
    scope: row.scope,
    ownerUserId: row.owner_user_id,
    gameId: row.game_id,
    title: row.title,
    artist: row.artist,
    genre: row.genre,
    mood: row.mood,
    bpm: row.bpm ?? undefined,
    durationSec: row.duration_sec ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    storagePath: row.storage_path,
    audioUrl: row.audio_url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    aiTags: Array.isArray(row.ai_tags) ? row.ai_tags : [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapMusicPlaylistRow(row: DbMusicPlaylistRow): MusicPlaylist {
  return {
    id: row.id,
    scope: row.scope,
    ownerUserId: row.owner_user_id,
    gameId: row.game_id,
    name: row.name,
    description: row.description,
    trackIds: Array.isArray(row.track_ids) ? row.track_ids : [],
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapMusicPrefsRow(row: DbGameMusicPrefsRow): GameMusicPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    sourceMode: row.source_mode,
    autoplayEnabled: row.autoplay_enabled,
    aiDjEnabled: row.ai_dj_enabled,
    crossfadeSeconds: Number(row.crossfade_seconds ?? 2.5),
    volume: Number(row.volume ?? 75),
    muted: Boolean(row.muted),
    preferredMood: row.preferred_mood || 'auto',
    activePlaylistId: row.active_playlist_id ?? undefined,
    aiCuratedOrder: Array.isArray(row.ai_curated_order) ? row.ai_curated_order : [],
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapAdminAiRuleRow(row: DbAdminAiRuleRow): AdminAiMusicRule {
  return {
    id: row.id,
    gameId: row.game_id,
    defaultSourceMode: row.default_source_mode,
    prioritizeOfficialRatio: Number(row.prioritize_official_ratio ?? 0.6),
    avoidRepeatWindow: Number(row.avoid_repeat_window ?? 3),
    crossfadeSeconds: Number(row.crossfade_seconds ?? 2.5),
    preferredEnergy: row.preferred_energy || 'auto',
    aiInstructions: row.ai_instructions || '',
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapGameOverlayRow(row: DbGameOverlayRow): GameOverlayProfile {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    label: row.label,
    tiktokUsername: row.tiktok_username,
    controlsConfig: mergeControlsConfig(row.controls_config),
    overlayConfig: mergeOverlayConfig(row.overlay_config),
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// --- Gift Mappings CRUD ---

export async function listGiftMappingsForUser(
  userId: string,
  gameId?: string,
): Promise<GiftMapping[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('gift_mappings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (gameId && gameId !== 'all') {
    query = query.eq('game_id', gameId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao consultar presentes configurados: ${error.message}`);
  }
  return ((data || []) as DbGiftMappingRow[]).map(mapGiftMappingRow);
}

export async function createGiftMappingRecord(input: {
  userId: string;
  gameId: string;
  giftName: string;
  minCount?: number;
  actionKey: GiftActionKey;
  actionLabel?: string;
  actionCommand?: string;
  actionPayload?: Record<string, unknown>;
  cooldownMs?: number;
  enabled?: boolean;
}): Promise<GiftMapping> {
  const admin = getSupabaseAdmin();
  const option = getActionOption(input.actionKey);
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('gift_mappings')
    .insert({
      id: `gmap_${crypto.randomUUID().slice(0, 10)}`,
      user_id: input.userId,
      game_id: input.gameId,
      gift_name: input.giftName.trim().slice(0, 80),
      min_count: Math.max(1, Number(input.minCount) || 1),
      action_key: input.actionKey,
      action_label: (input.actionLabel || option.label).trim().slice(0, 100),
      action_command: (input.actionCommand || option.defaultCommand).trim().slice(0, 80),
      action_payload:
        input.actionPayload && typeof input.actionPayload === 'object'
          ? input.actionPayload
          : option.defaultPayload,
      cooldown_ms: Math.max(0, Number(input.cooldownMs) || 0),
      enabled: input.enabled !== false,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single<DbGiftMappingRow>();

  if (error || !data) {
    throw new Error(`Falha ao salvar mapeamento de presente: ${error?.message || 'erro interno'}`);
  }
  return mapGiftMappingRow(data);
}

export async function updateGiftMappingRecord(
  mappingId: string,
  userId: string,
  patch: Partial<{
    giftName: string;
    minCount: number;
    actionKey: GiftActionKey;
    actionLabel: string;
    actionCommand: string;
    actionPayload: Record<string, unknown>;
    cooldownMs: number;
    enabled: boolean;
  }>,
): Promise<GiftMapping | null> {
  const admin = getSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.giftName === 'string' && patch.giftName.trim()) {
    updatePayload.gift_name = patch.giftName.trim().slice(0, 80);
  }
  if (typeof patch.minCount === 'number') {
    updatePayload.min_count = Math.max(1, patch.minCount);
  }
  if (patch.actionKey) {
    const option = getActionOption(patch.actionKey);
    updatePayload.action_key = patch.actionKey;
    updatePayload.action_label = (patch.actionLabel || option.label).trim().slice(0, 100);
    if (!patch.actionCommand) {
      updatePayload.action_command = option.defaultCommand;
    }
  }
  if (typeof patch.actionLabel === 'string' && patch.actionLabel.trim()) {
    updatePayload.action_label = patch.actionLabel.trim().slice(0, 100);
  }
  if (typeof patch.actionCommand === 'string' && patch.actionCommand.trim()) {
    updatePayload.action_command = patch.actionCommand.trim().slice(0, 80);
  }
  if (patch.actionPayload && typeof patch.actionPayload === 'object') {
    updatePayload.action_payload = patch.actionPayload;
  }
  if (typeof patch.cooldownMs === 'number') {
    updatePayload.cooldown_ms = Math.max(0, patch.cooldownMs);
  }
  if (typeof patch.enabled === 'boolean') {
    updatePayload.enabled = patch.enabled;
  }

  const { data, error } = await admin
    .from('gift_mappings')
    .update(updatePayload)
    .eq('id', mappingId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle<DbGiftMappingRow>();

  if (error) {
    throw new Error(`Falha ao atualizar presente: ${error.message}`);
  }
  return data ? mapGiftMappingRow(data) : null;
}

export async function deleteGiftMappingRecord(mappingId: string, userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('gift_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    throw new Error(`Falha ao excluir presente: ${error.message}`);
  }
  return (data || []).length > 0;
}

// --- Supabase Storage Signed Audio Upload Helpers ---

export async function createMusicSignedUploadUrl(params: {
  userId: string;
  scope: MusicScope;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<{
  signedUrl: string;
  token: string;
  storagePath: string;
  audioUrl: string;
  mimeType: string;
}> {
  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error('O arquivo de áudio deve ter entre 1 byte e 50 MB.');
  }

  const cleanFileName = params.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  const extMatch = cleanFileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] || '';
  const resolvedMime =
    ALLOWED_AUDIO_MIME_MAP[ext] ||
    (params.mimeType && params.mimeType.startsWith('audio/') ? params.mimeType : '');

  if (!resolvedMime) {
    throw new Error('Formato de áudio inválido. Use MP3, WAV, OGG, M4A, AAC, FLAC ou WEBM.');
  }

  const prefix = params.scope === 'official' ? 'official/global' : `personal/${params.userId}`;
  const storagePath = `${prefix}/${crypto.randomUUID().slice(0, 12)}_${cleanFileName.slice(0, 80)}`;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(MUSIC_BUCKET_NAME)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(
      `Falha ao gerar URL de upload no Supabase Storage (${MUSIC_BUCKET_NAME}): ${error?.message || 'verifique a migration 002'}`,
    );
  }

  const { data: pub } = admin.storage.from(MUSIC_BUCKET_NAME).getPublicUrl(storagePath);

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    audioUrl: pub.publicUrl,
    mimeType: resolvedMime,
  };
}

export async function deleteMusicFileFromStorage(storagePath: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('http')) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.storage.from(MUSIC_BUCKET_NAME).remove([storagePath]);
  } catch (err) {
    console.warn('Aviso ao remover arquivo de áudio do Supabase Storage:', err);
  }
}

// --- Music Tracks CRUD (Official & Personal) ---

export async function listMusicTracksVisible(options: {
  userId: string;
  isAdmin: boolean;
  gameId?: string;
}): Promise<MusicTrack[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('music_tracks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar músicas no Supabase: ${error.message}`);
  }

  const allTracks = ((data || []) as DbMusicTrackRow[]).map(mapMusicTrackRow);

  return allTracks.filter((t) => {
    const gameMatches = !options.gameId || options.gameId === 'all' || t.gameId === options.gameId || t.gameId === 'all';
    if (!gameMatches) return false;
    if (options.isAdmin) return t.scope === 'official' || t.ownerUserId === options.userId;
    return (t.scope === 'official' && t.isActive) || t.ownerUserId === options.userId;
  });
}

export async function findMusicTrackById(trackId: string): Promise<MusicTrack | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('music_tracks')
    .select('*')
    .eq('id', trackId)
    .maybeSingle<DbMusicTrackRow>();

  if (error) {
    throw new Error(`Falha ao buscar música: ${error.message}`);
  }
  return data ? mapMusicTrackRow(data) : null;
}

export async function createMusicTrackRecord(input: {
  scope: MusicScope;
  ownerUserId: string;
  gameId: string;
  title?: string;
  artist?: string;
  genre?: string;
  mood?: string;
  bpm?: number;
  durationSec?: number;
  coverUrl?: string;
  storagePath: string;
  audioUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  isActive?: boolean;
  sortOrder?: number;
  aiTags?: string[];
  originalFileName?: string;
}): Promise<MusicTrack> {
  const admin = getSupabaseAdmin();
  const inferred = inferTrackMetadataFromFilename(input.originalFileName || input.title || 'Faixa.mp3');
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('music_tracks')
    .insert({
      id: `trk_${crypto.randomUUID().slice(0, 10)}`,
      scope: input.scope,
      owner_user_id: input.ownerUserId,
      game_id: input.gameId || 'all',
      title: (input.title || inferred.title).trim().slice(0, 120),
      artist: (input.artist ?? inferred.artist).trim().slice(0, 100),
      genre: (input.genre || inferred.genre).trim().slice(0, 60),
      mood: (input.mood || inferred.mood).trim().slice(0, 40),
      bpm: typeof input.bpm === 'number' && input.bpm > 0 ? Math.round(input.bpm) : null,
      duration_sec:
        typeof input.durationSec === 'number' && input.durationSec > 0
          ? Math.round(input.durationSec)
          : null,
      cover_url: input.coverUrl ?? null,
      storage_path: input.storagePath,
      audio_url: input.audioUrl,
      mime_type: input.mimeType || 'audio/mpeg',
      file_size_bytes: Math.max(0, Number(input.fileSizeBytes) || 0),
      is_active: input.isActive !== false,
      sort_order: Number(input.sortOrder) || 0,
      ai_tags:
        Array.isArray(input.aiTags) && input.aiTags.length > 0 ? input.aiTags : inferred.aiTags,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single<DbMusicTrackRow>();

  if (error || !data) {
    throw new Error(`Falha ao cadastrar música no Supabase: ${error?.message || 'erro interno'}`);
  }
  return mapMusicTrackRow(data);
}

export async function updateMusicTrackRecord(
  trackId: string,
  patch: Partial<{
    gameId: string;
    title: string;
    artist: string;
    genre: string;
    mood: string;
    bpm: number;
    durationSec: number;
    storagePath: string;
    audioUrl: string;
    mimeType: string;
    fileSizeBytes: number;
    isActive: boolean;
    sortOrder: number;
    aiTags: string[];
  }>,
): Promise<MusicTrack | null> {
  const admin = getSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.gameId === 'string') updatePayload.game_id = patch.gameId;
  if (typeof patch.title === 'string' && patch.title.trim()) {
    updatePayload.title = patch.title.trim().slice(0, 120);
  }
  if (typeof patch.artist === 'string') updatePayload.artist = patch.artist.trim().slice(0, 100);
  if (typeof patch.genre === 'string') updatePayload.genre = patch.genre.trim().slice(0, 60);
  if (typeof patch.mood === 'string') updatePayload.mood = patch.mood.trim().slice(0, 40);
  if (typeof patch.bpm === 'number') updatePayload.bpm = Math.round(patch.bpm);
  if (typeof patch.durationSec === 'number') updatePayload.duration_sec = Math.round(patch.durationSec);
  if (typeof patch.storagePath === 'string') updatePayload.storage_path = patch.storagePath;
  if (typeof patch.audioUrl === 'string') updatePayload.audio_url = patch.audioUrl;
  if (typeof patch.mimeType === 'string') updatePayload.mime_type = patch.mimeType;
  if (typeof patch.fileSizeBytes === 'number') updatePayload.file_size_bytes = patch.fileSizeBytes;
  if (typeof patch.isActive === 'boolean') updatePayload.is_active = patch.isActive;
  if (typeof patch.sortOrder === 'number') updatePayload.sort_order = patch.sortOrder;
  if (Array.isArray(patch.aiTags)) updatePayload.ai_tags = patch.aiTags;

  const { data, error } = await admin
    .from('music_tracks')
    .update(updatePayload)
    .eq('id', trackId)
    .select('*')
    .maybeSingle<DbMusicTrackRow>();

  if (error) {
    throw new Error(`Falha ao atualizar faixa musical: ${error.message}`);
  }
  return data ? mapMusicTrackRow(data) : null;
}

export async function deleteMusicTrackRecord(trackId: string): Promise<MusicTrack | null> {
  const existing = await findMusicTrackById(trackId);
  if (!existing) return null;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from('music_tracks').delete().eq('id', trackId);
  if (error) {
    throw new Error(`Falha ao excluir música: ${error.message}`);
  }
  await deleteMusicFileFromStorage(existing.storagePath);
  return existing;
}

// --- Music Playlists CRUD ---

export async function listMusicPlaylistsVisible(options: {
  userId: string;
  isAdmin: boolean;
  gameId?: string;
}): Promise<MusicPlaylist[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('music_playlists')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar playlists musicais: ${error.message}`);
  }

  return ((data || []) as DbMusicPlaylistRow[])
    .map(mapMusicPlaylistRow)
    .filter((pl) => {
      const gameMatches = !options.gameId || options.gameId === 'all' || pl.gameId === options.gameId || pl.gameId === 'all';
      if (!gameMatches) return false;
      if (options.isAdmin) return pl.scope === 'official' || pl.ownerUserId === options.userId;
      return (pl.scope === 'official' && pl.isActive) || pl.ownerUserId === options.userId;
    });
}

export async function findMusicPlaylistById(playlistId: string): Promise<MusicPlaylist | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('music_playlists')
    .select('*')
    .eq('id', playlistId)
    .maybeSingle<DbMusicPlaylistRow>();

  if (error) {
    throw new Error(`Falha ao buscar playlist: ${error.message}`);
  }
  return data ? mapMusicPlaylistRow(data) : null;
}

export async function createMusicPlaylistRecord(input: {
  scope: MusicScope;
  ownerUserId: string;
  gameId: string;
  name: string;
  description?: string;
  trackIds?: string[];
  isActive?: boolean;
}): Promise<MusicPlaylist> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('music_playlists')
    .insert({
      id: `pl_${crypto.randomUUID().slice(0, 10)}`,
      scope: input.scope,
      owner_user_id: input.ownerUserId,
      game_id: input.gameId || 'all',
      name: input.name.trim().slice(0, 100),
      description: String(input.description || '').trim().slice(0, 300),
      track_ids: Array.isArray(input.trackIds) ? input.trackIds : [],
      is_active: input.isActive !== false,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single<DbMusicPlaylistRow>();

  if (error || !data) {
    throw new Error(`Falha ao criar playlist: ${error?.message || 'erro interno'}`);
  }
  return mapMusicPlaylistRow(data);
}

export async function updateMusicPlaylistRecord(
  playlistId: string,
  patch: Partial<{
    name: string;
    description: string;
    gameId: string;
    trackIds: string[];
    isActive: boolean;
  }>,
): Promise<MusicPlaylist | null> {
  const admin = getSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.name === 'string' && patch.name.trim()) {
    updatePayload.name = patch.name.trim().slice(0, 100);
  }
  if (typeof patch.description === 'string') {
    updatePayload.description = patch.description.trim().slice(0, 300);
  }
  if (typeof patch.gameId === 'string') updatePayload.game_id = patch.gameId;
  if (Array.isArray(patch.trackIds)) updatePayload.track_ids = patch.trackIds;
  if (typeof patch.isActive === 'boolean') updatePayload.is_active = patch.isActive;

  const { data, error } = await admin
    .from('music_playlists')
    .update(updatePayload)
    .eq('id', playlistId)
    .select('*')
    .maybeSingle<DbMusicPlaylistRow>();

  if (error) {
    throw new Error(`Falha ao atualizar playlist: ${error.message}`);
  }
  return data ? mapMusicPlaylistRow(data) : null;
}

export async function deleteMusicPlaylistRecord(playlistId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('music_playlists')
    .delete()
    .eq('id', playlistId)
    .select('id');

  if (error) {
    throw new Error(`Falha ao excluir playlist: ${error.message}`);
  }
  return (data || []).length > 0;
}

// --- Game Music Preferences & Admin AI Music Rules ---

export function createDefaultGameMusicPreferences(
  userId: string,
  gameId: string,
): GameMusicPreferences {
  return {
    id: `gmp_default_${gameId}`,
    userId,
    gameId,
    sourceMode: 'mixed',
    autoplayEnabled: true,
    aiDjEnabled: true,
    crossfadeSeconds: 2.5,
    volume: 75,
    muted: false,
    preferredMood: 'auto',
    activePlaylistId: undefined,
    aiCuratedOrder: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getGameMusicPreferencesRecord(
  userId: string,
  gameId: string,
): Promise<GameMusicPreferences> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('game_music_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle<DbGameMusicPrefsRow>();

  if (error) {
    throw new Error(`Falha ao carregar preferências musicais: ${error.message}`);
  }
  return data ? mapMusicPrefsRow(data) : createDefaultGameMusicPreferences(userId, gameId);
}

export async function upsertGameMusicPreferencesRecord(
  userId: string,
  gameId: string,
  patch: Partial<{
    sourceMode: MusicSourceMode;
    autoplayEnabled: boolean;
    aiDjEnabled: boolean;
    crossfadeSeconds: number;
    volume: number;
    muted: boolean;
    preferredMood: string;
    activePlaylistId: string | null;
    aiCuratedOrder: string[];
  }>,
): Promise<GameMusicPreferences> {
  const admin = getSupabaseAdmin();
  const current = await getGameMusicPreferencesRecord(userId, gameId);
  const nowIso = new Date().toISOString();

  const nextId = current.id.startsWith('gmp_default_')
    ? `gmp_${crypto.randomUUID().slice(0, 10)}`
    : current.id;

  const payload = {
    id: nextId,
    user_id: userId,
    game_id: gameId,
    source_mode: patch.sourceMode ?? current.sourceMode,
    autoplay_enabled: patch.autoplayEnabled ?? current.autoplayEnabled,
    ai_dj_enabled: patch.aiDjEnabled ?? current.aiDjEnabled,
    crossfade_seconds:
      typeof patch.crossfadeSeconds === 'number'
        ? Math.max(0, Math.min(8, patch.crossfadeSeconds))
        : current.crossfadeSeconds,
    volume:
      typeof patch.volume === 'number'
        ? Math.max(0, Math.min(100, Math.round(patch.volume)))
        : current.volume,
    muted: patch.muted ?? current.muted,
    preferred_mood: patch.preferredMood ?? current.preferredMood,
    active_playlist_id:
      patch.activePlaylistId === null
        ? null
        : patch.activePlaylistId ?? current.activePlaylistId ?? null,
    ai_curated_order: patch.aiCuratedOrder ?? current.aiCuratedOrder,
    updated_at: nowIso,
  };

  const { data, error } = await admin
    .from('game_music_preferences')
    .upsert(payload, { onConflict: 'user_id,game_id' })
    .select('*')
    .single<DbGameMusicPrefsRow>();

  if (error || !data) {
    throw new Error(`Falha ao salvar preferências musicais: ${error?.message || 'erro interno'}`);
  }
  return mapMusicPrefsRow(data);
}

export async function listAdminAiMusicRules(): Promise<AdminAiMusicRule[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('admin_ai_music_rules')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao consultar regras globais de IA musical: ${error.message}`);
  }
  return ((data || []) as DbAdminAiRuleRow[]).map(mapAdminAiRuleRow);
}

export async function getEffectiveAdminAiRule(gameId: string): Promise<AdminAiMusicRule> {
  const rules = await listAdminAiMusicRules();
  const specific = rules.find((r) => r.gameId === gameId);
  if (specific) return specific;
  const globalRule = rules.find((r) => r.gameId === 'all');
  if (globalRule) return globalRule;
  return {
    id: 'airule_all',
    gameId: 'all',
    defaultSourceMode: 'mixed',
    prioritizeOfficialRatio: 0.6,
    avoidRepeatWindow: 3,
    crossfadeSeconds: 2.5,
    preferredEnergy: 'auto',
    aiInstructions:
      'Alternar dinamicamente músicas oficiais e pessoais sem repetir faixas consecutivas.',
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertAdminAiMusicRule(
  gameId: string,
  patch: Partial<{
    defaultSourceMode: MusicSourceMode;
    prioritizeOfficialRatio: number;
    avoidRepeatWindow: number;
    crossfadeSeconds: number;
    preferredEnergy: string;
    aiInstructions: string;
  }>,
): Promise<AdminAiMusicRule> {
  const admin = getSupabaseAdmin();
  const existing = await getEffectiveAdminAiRule(gameId);
  const nowIso = new Date().toISOString();

  const rowId =
    existing.gameId === gameId
      ? existing.id
      : gameId === 'all'
        ? 'airule_all'
        : `airule_${crypto.randomUUID().slice(0, 10)}`;

  const { data, error } = await admin
    .from('admin_ai_music_rules')
    .upsert(
      {
        id: rowId,
        game_id: gameId,
        default_source_mode: patch.defaultSourceMode ?? existing.defaultSourceMode,
        prioritize_official_ratio:
          typeof patch.prioritizeOfficialRatio === 'number'
            ? Math.max(0, Math.min(1, patch.prioritizeOfficialRatio))
            : existing.prioritizeOfficialRatio,
        avoid_repeat_window:
          typeof patch.avoidRepeatWindow === 'number'
            ? Math.max(1, Math.min(20, Math.round(patch.avoidRepeatWindow)))
            : existing.avoidRepeatWindow,
        crossfade_seconds:
          typeof patch.crossfadeSeconds === 'number'
            ? Math.max(0, Math.min(8, patch.crossfadeSeconds))
            : existing.crossfadeSeconds,
        preferred_energy: patch.preferredEnergy ?? existing.preferredEnergy,
        ai_instructions: String(patch.aiInstructions ?? existing.aiInstructions).slice(0, 600),
        updated_at: nowIso,
      },
      { onConflict: 'game_id' },
    )
    .select('*')
    .single<DbAdminAiRuleRow>();

  if (error || !data) {
    throw new Error(`Falha ao salvar regra global de IA musical: ${error?.message || 'erro interno'}`);
  }
  return mapAdminAiRuleRow(data);
}

// --- Custom Per-User, Per-Game Overlay Profiles (ov_...) ---

export async function listUserOverlayProfiles(userId: string): Promise<GameOverlayProfile[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('game_overlays')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar links de overlay: ${error.message}`);
  }
  return ((data || []) as DbGameOverlayRow[]).map(mapGameOverlayRow);
}

export async function findOverlayProfileById(overlayId: string): Promise<GameOverlayProfile | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('game_overlays')
    .select('*')
    .eq('id', overlayId)
    .maybeSingle<DbGameOverlayRow>();

  if (error) {
    throw new Error(`Falha ao buscar overlay: ${error.message}`);
  }
  return data ? mapGameOverlayRow(data) : null;
}

export async function findOverlayIdsForUserAndGame(
  userId: string,
  gameId: string,
): Promise<string[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from('game_overlays').select('id').eq('user_id', userId);
  if (gameId && gameId !== 'all') {
    query = query.eq('game_id', gameId);
  }
  const { data, error } = await query;
  if (error) return [];
  return ((data || []) as Array<{ id: string }>).map((r) => r.id);
}

export async function getOrCreateGameOverlayProfile(
  userId: string,
  gameId: string,
  patch?: Partial<{
    label: string;
    tiktokUsername: string;
    controlsConfig: Partial<GameControlsConfig>;
    overlayConfig: Partial<OverlayConfig>;
    isActive: boolean;
  }>,
): Promise<GameOverlayProfile | null> {
  const game = await findGameById(gameId);
  if (!game) return null;

  const admin = getSupabaseAdmin();
  const { data: existing, error: fetchErr } = await admin
    .from('game_overlays')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle<DbGameOverlayRow>();

  if (fetchErr) {
    throw new Error(`Falha ao consultar overlay do jogo: ${fetchErr.message}`);
  }

  const nowIso = new Date().toISOString();
  if (existing && !patch) {
    return mapGameOverlayRow(existing);
  }

  const currentMapped = existing ? mapGameOverlayRow(existing) : null;
  const nextControls: GameControlsConfig = {
    ...(currentMapped?.controlsConfig || createDefaultControlsConfig()),
    ...(patch?.controlsConfig || {}),
  };
  const nextOverlayConfig: OverlayConfig = {
    ...(currentMapped?.overlayConfig || game.overlayConfig || createDefaultOverlayConfig()),
    ...(patch?.overlayConfig || {}),
  };

  const payload = {
    id: currentMapped?.id || `ov_${crypto.randomUUID().slice(0, 12)}`,
    user_id: userId,
    game_id: gameId,
    label: (patch?.label ?? currentMapped?.label ?? `${game.name} Overlay`).slice(0, 100),
    tiktok_username: (patch?.tiktokUsername ?? currentMapped?.tiktokUsername ?? '')
      .trim()
      .replace(/^@+/, '')
      .slice(0, 40),
    controls_config: nextControls,
    overlay_config: nextOverlayConfig,
    is_active: patch?.isActive ?? currentMapped?.isActive ?? true,
    created_at: currentMapped?.createdAt || nowIso,
    updated_at: nowIso,
  };

  const { data: saved, error: saveErr } = await admin
    .from('game_overlays')
    .upsert(payload, { onConflict: 'user_id,game_id' })
    .select('*')
    .single<DbGameOverlayRow>();

  if (saveErr || !saved) {
    throw new Error(`Falha ao salvar overlay personalizado: ${saveErr?.message || 'erro interno'}`);
  }

  return mapGameOverlayRow(saved);
}

export async function regenerateGameOverlayProfileId(
  userId: string,
  gameId: string,
): Promise<GameOverlayProfile | null> {
  const existing = await getOrCreateGameOverlayProfile(userId, gameId);
  if (!existing) return null;

  const admin = getSupabaseAdmin();
  const nextId = `ov_${crypto.randomUUID().slice(0, 12)}`;
  const { data, error } = await admin
    .from('game_overlays')
    .update({ id: nextId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .select('*')
    .single<DbGameOverlayRow>();

  if (error || !data) {
    throw new Error(`Falha ao regenerar link de overlay: ${error?.message || 'erro interno'}`);
  }
  return mapGameOverlayRow(data);
}

export async function resolveOverlayTargetForEvents(id: string): Promise<{
  overlayId: string;
  gameId: string;
  userId?: string;
  isActive: boolean;
  overlayConfig: OverlayConfig;
} | null> {
  if (id.startsWith('ov_')) {
    const profile = await findOverlayProfileById(id);
    if (!profile) return null;
    const game = await findGameById(profile.gameId);
    if (!game) return null;
    return {
      overlayId: profile.id,
      gameId: game.id,
      userId: profile.userId,
      isActive: game.isActive && profile.isActive,
      overlayConfig: profile.overlayConfig,
    };
  }

  const game = await findGameById(id);
  if (!game) return null;
  return {
    overlayId: game.id,
    gameId: game.id,
    isActive: game.isActive,
    overlayConfig: game.overlayConfig,
  };
}

export async function resolvePublicOverlayBundle(id: string): Promise<{
  overlayId: string;
  game: GameItem;
  isActive: boolean;
  overlayConfig: OverlayConfig;
  controlsConfig: GameControlsConfig;
  tiktokUsername: string;
  watermarkText: string;
  giftMappings: Array<{
    id: string;
    giftName: string;
    minCount: number;
    actionKey: GiftActionKey;
    actionLabel: string;
    actionCommand: string;
  }>;
  music: {
    preferences: GameMusicPreferences;
    adminRule: AdminAiMusicRule;
    tracks: MusicTrack[];
    playlists: MusicPlaylist[];
  };
} | null> {
  const settings = await getPlatformSettings();

  if (id.startsWith('ov_')) {
    const profile = await findOverlayProfileById(id);
    if (!profile) return null;
    const game = await findGameById(profile.gameId);
    if (!game) return null;

    const [giftMappings, allTracks, allPlaylists, preferences, adminRule] = await Promise.all([
      listGiftMappingsForUser(profile.userId, game.id),
      listMusicTracksVisible({ userId: profile.userId, isAdmin: false, gameId: game.id }),
      listMusicPlaylistsVisible({ userId: profile.userId, isAdmin: false, gameId: game.id }),
      getGameMusicPreferencesRecord(profile.userId, game.id),
      getEffectiveAdminAiRule(game.id),
    ]);

    const activePlaylist = preferences.activePlaylistId
      ? allPlaylists.find((p) => p.id === preferences.activePlaylistId && p.isActive)
      : undefined;

    const eligibleTracks = filterEligibleTracks(
      allTracks,
      preferences.sourceMode || adminRule.defaultSourceMode,
      game.id,
      activePlaylist?.trackIds,
    );

    return {
      overlayId: profile.id,
      game,
      isActive: game.isActive && profile.isActive,
      overlayConfig: profile.overlayConfig,
      controlsConfig: profile.controlsConfig,
      tiktokUsername: profile.tiktokUsername,
      watermarkText: settings.defaultWatermarkText || 'MINHA LIVE GAMES',
      giftMappings: giftMappings
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.id,
          giftName: m.giftName,
          minCount: m.minCount,
          actionKey: m.actionKey,
          actionLabel: m.actionLabel,
          actionCommand: m.actionCommand,
        })),
      music: {
        preferences,
        adminRule,
        tracks: eligibleTracks.length > 0 ? eligibleTracks : allTracks.filter((t) => t.isActive),
        playlists: allPlaylists,
      },
    };
  }

  // Legacy /overlay/gm_... support — 100% preserved and enriched with official music
  const game = await findGameById(id);
  if (!game) return null;

  let officialTracks: MusicTrack[] = [];
  let officialPlaylists: MusicPlaylist[] = [];
  let adminRule = await getEffectiveAdminAiRule(game.id).catch(() => ({
    id: 'airule_all',
    gameId: 'all',
    defaultSourceMode: 'official_only' as MusicSourceMode,
    prioritizeOfficialRatio: 1,
    avoidRepeatWindow: 3,
    crossfadeSeconds: 2.5,
    preferredEnergy: 'auto',
    aiInstructions: '',
    updatedAt: new Date().toISOString(),
  }));

  try {
    const admin = getSupabaseAdmin();
    const [trkRes, plRes] = await Promise.all([
      admin
        .from('music_tracks')
        .select('*')
        .eq('scope', 'official')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      admin
        .from('music_playlists')
        .select('*')
        .eq('scope', 'official')
        .eq('is_active', true),
    ]);
    officialTracks = ((trkRes.data || []) as DbMusicTrackRow[])
      .map(mapMusicTrackRow)
      .filter((t) => t.gameId === game.id || t.gameId === 'all');
    officialPlaylists = ((plRes.data || []) as DbMusicPlaylistRow[])
      .map(mapMusicPlaylistRow)
      .filter((p) => p.gameId === game.id || p.gameId === 'all');
  } catch {
    // Non-fatal if migration 002 tables are not yet applied on an older DB
  }

  return {
    overlayId: game.id,
    game,
    isActive: game.isActive,
    overlayConfig: game.overlayConfig,
    controlsConfig: createDefaultControlsConfig(),
    tiktokUsername: '',
    watermarkText: settings.defaultWatermarkText || 'MINHA LIVE GAMES',
    giftMappings: [],
    music: {
      preferences: {
        ...createDefaultGameMusicPreferences(game.userId, game.id),
        sourceMode: 'official_only',
        crossfadeSeconds: adminRule.crossfadeSeconds,
      },
      adminRule,
      tracks: officialTracks,
      playlists: officialPlaylists,
    },
  };
}
