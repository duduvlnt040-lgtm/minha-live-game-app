import type {
  GiftActionKey,
  GiftMapping,
  RuleActionType,
} from '../types/platform.js';
import type { RuleInputEvent } from './ruleEngine.js';

export interface GameActionOption {
  key: GiftActionKey;
  label: string;
  description: string;
  defaultCommand: string;
  actionType: RuleActionType;
  defaultPayload: Record<string, unknown>;
}

export const AVAILABLE_GAME_ACTIONS: GameActionOption[] = [
  {
    key: 'move_walk',
    label: 'Personagem anda / avança',
    description: 'Move o personagem principal para frente ou executa passo no jogo.',
    defaultCommand: 'move_walk',
    actionType: 'trigger_animation',
    defaultPayload: { action: 'walk', steps: 1, intensity: 1 },
  },
  {
    key: 'jump',
    label: 'Personagem pula',
    description: 'Faz o personagem saltar ou desviar de obstáculos.',
    defaultCommand: 'jump',
    actionType: 'trigger_animation',
    defaultPayload: { action: 'jump', force: 1.2 },
  },
  {
    key: 'special_action',
    label: 'Ação especial / poder',
    description: 'Ativa habilidade especial, explosão ou efeito de destaque.',
    defaultCommand: 'special_action',
    actionType: 'spawn_effect',
    defaultPayload: { action: 'special', effect: 'burst', intensity: 2 },
  },
  {
    key: 'boost_speed',
    label: 'Turbo de velocidade',
    description: 'Aumenta temporariamente a velocidade ou ritmo da partida.',
    defaultCommand: 'boost_speed',
    actionType: 'custom_command',
    defaultPayload: { multiplier: 1.5, durationMs: 4000 },
  },
  {
    key: 'dance_celebrate',
    label: 'Comemoração / dança',
    description: 'Dispara animação festiva ou celebração na cena do jogo.',
    defaultCommand: 'dance_celebrate',
    actionType: 'trigger_animation',
    defaultPayload: { action: 'celebrate', durationMs: 3000 },
  },
  {
    key: 'add_score',
    label: 'Adicionar pontos',
    description: 'Soma pontuação direta ao placar do jogador ou equipe.',
    defaultCommand: 'add_score',
    actionType: 'add_score',
    defaultPayload: { points: 50 },
  },
  {
    key: 'spawn_effect',
    label: 'Gerar obstáculo / chuva de itens',
    description: 'Cria elementos extras ou chuva de partículas na tela.',
    defaultCommand: 'spawn_effect',
    actionType: 'spawn_effect',
    defaultPayload: { count: 10 },
  },
  {
    key: 'custom',
    label: 'Comando personalizado do SDK',
    description: 'Envia um nome de comando personalizado para window.MinhaLiveGames.onCommand.',
    defaultCommand: 'custom_action',
    actionType: 'custom_command',
    defaultPayload: {},
  },
];

export interface TikTokGiftPreset {
  name: string;
  suggestedAction: GiftActionKey;
  coinsHint: number;
}

export const TIKTOK_GIFT_PRESETS: TikTokGiftPreset[] = [
  { name: 'Rosa', suggestedAction: 'move_walk', coinsHint: 1 },
  { name: 'Coração', suggestedAction: 'jump', coinsHint: 1 },
  { name: 'TikTok', suggestedAction: 'add_score', coinsHint: 1 },
  { name: 'GG', suggestedAction: 'boost_speed', coinsHint: 1 },
  { name: 'Casquinha', suggestedAction: 'spawn_effect', coinsHint: 1 },
  { name: 'Perfume', suggestedAction: 'dance_celebrate', coinsHint: 20 },
  { name: 'Chapéu', suggestedAction: 'boost_speed', coinsHint: 99 },
  { name: 'Coroa', suggestedAction: 'dance_celebrate', coinsHint: 199 },
  { name: 'Galaxy', suggestedAction: 'special_action', coinsHint: 1000 },
  { name: 'Leão', suggestedAction: 'special_action', coinsHint: 29999 },
  { name: 'Universo', suggestedAction: 'special_action', coinsHint: 34999 },
];

export function getActionOption(key: GiftActionKey): GameActionOption {
  return (
    AVAILABLE_GAME_ACTIONS.find((a) => a.key === key) ||
    AVAILABLE_GAME_ACTIONS[AVAILABLE_GAME_ACTIONS.length - 1]
  );
}

export function evaluateGiftMappings(
  event: RuleInputEvent,
  mappings: GiftMapping[],
): Array<{
  ruleId: string;
  ruleName: string;
  actionType: RuleActionType;
  command: string;
  payload: string;
}> {
  if (event.type !== 'gift' && event.type !== 'gift_count') {
    return [];
  }

  const incomingGift = (event.giftName || '').trim().toLowerCase();
  if (!incomingGift) return [];

  const count = Math.max(1, Number(event.giftCount) || 1);
  const triggered: Array<{
    ruleId: string;
    ruleName: string;
    actionType: RuleActionType;
    command: string;
    payload: string;
  }> = [];

  for (const mapping of mappings) {
    if (!mapping.enabled) continue;
    if (mapping.gameId !== 'all' && event.gameId !== 'all' && mapping.gameId !== event.gameId) {
      continue;
    }

    const expectedGift = mapping.giftName.trim().toLowerCase();
    if (!expectedGift || expectedGift !== incomingGift) continue;
    if (count < Math.max(1, mapping.minCount)) continue;

    const option = getActionOption(mapping.actionKey);
    const enrichedPayload = {
      ...(mapping.actionPayload || {}),
      giftName: event.giftName || mapping.giftName,
      giftCount: count,
      senderUsername: event.senderUsername,
      actionKey: mapping.actionKey,
    };

    triggered.push({
      ruleId: mapping.id,
      ruleName: `Presente: ${mapping.giftName} → ${mapping.actionLabel}`,
      actionType: option.actionType,
      command: mapping.actionCommand || option.defaultCommand,
      payload: JSON.stringify(enrichedPayload),
    });
  }

  return triggered;
}
