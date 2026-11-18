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
