export type UserRole = 'user' | 'admin';
export type PlanTier = 'free' | 'premium' | 'pro';
export type GameEngine = 'html5' | 'phaser' | 'threejs';

export type GameCategory =
  | 'Arcade'
  | 'Ação'
  | 'Interativo'
  | '3D / WebGL'
  | 'Phaser 2D'
  | 'Quiz / Chat'
  | 'Outro';

export type LiveEventType =
  | 'gift'
  | 'like'
  | 'comment'
  | 'follow'
  | 'share'
  | 'gift_count'
  | 'keyword'
  | 'bonus'
  | 'score';

export type RuleOperator = 'equals' | 'contains' | 'gte' | 'any';

export type RuleActionType =
  | 'trigger_animation'
  | 'custom_command'
  | 'add_score'
  | 'spawn_effect'
  | 'play_sound';

export interface OverlayConfig {
  showWatermark: boolean;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkOpacity: number;
  backgroundMode: 'transparent' | 'obsidian' | 'chroma-green';
  accentColor: string;
  showEventToast: boolean;
  borderRadius: number;
  scale: number;
}

export interface UserSettings {
  language: 'pt-BR' | 'en-US';
  masterVolume: number;
  muteAllAudio: boolean;
  themeAccent: 'violet' | 'blue' | 'cyan';
  reduceMotion: boolean;
  defaultEngine: GameEngine;
  autoPauseOnHide: boolean;
  defaultOverlay: OverlayConfig;
  tiktokUsername: string;
  autoReconnectRelay: boolean;
  twoFactorHint: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  status: 'active' | 'suspended';
  myGameIds: string[];
  avatarUrl?: string;
  createdAt: string;
  settings: UserSettings;
}

export interface GameItem {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface EventRule {
  id: string;
  userId: string;
  gameId: string; // 'all' or specific game ID
  name: string;
  enabled: boolean;
  eventType: LiveEventType;
  operator: RuleOperator;
  conditionValue: string;
  actionType: RuleActionType;
  actionCommand: string;
  actionPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveEventPayload {
  id: string;
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
  triggeredCommands: Array<{
    ruleId: string;
    ruleName: string;
    actionType: RuleActionType;
    command: string;
    payload: string;
  }>;
  createdAt: string;
}

export interface TikTokIntegrationStatus {
  providerName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectedUsername: string | null;
  lastError: string | null;
  requiresExternalConnector: boolean;
  documentationNote: string;
  eventsReceivedSession: number;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  plan: PlanTier;
  status: 'active' | 'scheduled' | 'cancelled';
  provider: 'local-tier' | 'mercadopago-pending';
  note: string;
  createdAt: string;
}

export interface PlatformSettings {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  defaultWatermarkText: string;
  maxUploadSizeMb: number;
}

export interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalGames: number;
  activeGames: number;
  totalEvents: number;
  totalRules: number;
  planDistribution: Record<PlanTier, number>;
}

// =============================================================================
// Presentes Personalizados, Controles, Músicas Oficiais/Pessoais e Rádio IA
// =============================================================================

export type GiftActionKey =
  | 'move_walk'
  | 'jump'
  | 'special_action'
  | 'boost_speed'
  | 'spawn_effect'
  | 'add_score'
  | 'dance_celebrate'
  | 'custom';

export interface GiftMapping {
  id: string;
  userId: string;
  gameId: string;
  giftName: string;
  minCount: number;
  actionKey: GiftActionKey;
  actionLabel: string;
  actionCommand: string;
  actionPayload: Record<string, unknown>;
  cooldownMs: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MusicScope = 'official' | 'personal';
export type MusicSourceMode = 'official_only' | 'mixed' | 'personal_only';

export interface MusicTrack {
  id: string;
  scope: MusicScope;
  ownerUserId: string;
  gameId: string; // 'all' or specific game ID
  title: string;
  artist: string;
  genre: string;
  mood: string;
  bpm?: number;
  durationSec?: number;
  coverUrl?: string;
  storagePath: string;
  audioUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  isActive: boolean;
  sortOrder: number;
  aiTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MusicPlaylist {
  id: string;
  scope: MusicScope;
  ownerUserId: string;
  gameId: string;
  name: string;
  description: string;
  trackIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameMusicPreferences {
  id: string;
  userId: string;
  gameId: string;
  sourceMode: MusicSourceMode;
  autoplayEnabled: boolean;
  aiDjEnabled: boolean;
  crossfadeSeconds: number;
  volume: number;
  muted: boolean;
  preferredMood: string;
  activePlaylistId?: string;
  aiCuratedOrder: string[];
  updatedAt: string;
}

export interface AdminAiMusicRule {
  id: string;
  gameId: string; // 'all' or specific game ID
  defaultSourceMode: MusicSourceMode;
  prioritizeOfficialRatio: number;
  avoidRepeatWindow: number;
  crossfadeSeconds: number;
  preferredEnergy: string;
  aiInstructions: string;
  updatedAt: string;
}

export interface GameControlsConfig {
  speedMultiplier: number;
  actionIntensity: number;
  globalCooldownMs: number;
  enableKeyboardControls: boolean;
  autoTriggerOnGift: boolean;
  showGiftFeedInOverlay: boolean;
  showMusicWidgetInOverlay: boolean;
}

export interface GameOverlayProfile {
  id: string; // ov_...
  userId: string;
  gameId: string;
  label: string;
  tiktokUsername: string;
  controlsConfig: GameControlsConfig;
  overlayConfig: OverlayConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
