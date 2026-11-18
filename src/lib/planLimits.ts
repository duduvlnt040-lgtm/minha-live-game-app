import type { PlanTier } from '../types/platform.js';

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  audience: string;
  priceMonthlyBrl: number;
  maxGames: number;
  maxRules: number;
  maxBundleSizeMb: number;
  allowCustomWatermark: boolean;
  allowPhaserAndThree: boolean;
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Gratuito',
    audience: 'Para criadores iniciando suas primeiras lives interativas',
    priceMonthlyBrl: 0,
    maxGames: 2,
    maxRules: 5,
    maxBundleSizeMb: 5,
    allowCustomWatermark: false,
    allowPhaserAndThree: true,
    highlights: [
      'Até 2 jogos na biblioteca',
      'Até 5 regras de eventos LIVE',
      'Overlays com marca-d\'água padrão',
      'Simulador de eventos em tempo real',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    audience: 'Para streamers ativos com múltiplos formatos de live',
    priceMonthlyBrl: 49,
    maxGames: 15,
    maxRules: 40,
    maxBundleSizeMb: 15,
    allowCustomWatermark: false,
    allowPhaserAndThree: true,
    highlights: [
      'Até 15 jogos na biblioteca',
      'Até 40 regras de eventos personalizadas',
      'Posição e opacidade da marca-d\'água ajustáveis',
      'Prioridade no relay de eventos WebSocket',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    audience: 'Para estúdios, agências e criadores em alta escala',
    priceMonthlyBrl: 119,
    maxGames: 9999,
    maxRules: 9999,
    maxBundleSizeMb: 50,
    allowCustomWatermark: true,
    allowPhaserAndThree: true,
    highlights: [
      'Jogos ilimitados na biblioteca',
      'Regras ilimitadas e comandos customizados',
      'Controle completo da marca-d\'água no overlay',
      'Suporte avançado a pacotes Phaser e Three.js',
    ],
  },
};

export function canCreateGame(plan: PlanTier, currentGamesCount: number): { allowed: boolean; reason?: string } {
  const def = PLANS[plan];
  if (currentGamesCount >= def.maxGames) {
    return {
      allowed: false,
      reason: `Limite do plano ${def.name} atingido (${def.maxGames} jogos). Remova um jogo ou faça upgrade de plano.`,
    };
  }
  return { allowed: true };
}

export function canCreateRule(plan: PlanTier, currentRulesCount: number): { allowed: boolean; reason?: string } {
  const def = PLANS[plan];
  if (currentRulesCount >= def.maxRules) {
    return {
      allowed: false,
      reason: `Limite do plano ${def.name} atingido (${def.maxRules} regras). Desative ou remova regras antigas.`,
    };
  }
  return { allowed: true };
}

export function canCustomizeWatermark(plan: PlanTier): boolean {
  return PLANS[plan].allowCustomWatermark;
}
