import type { EventRule, LiveEventPayload } from '../types/platform';

export interface RuleInputEvent {
  gameId: string;
  type: LiveEventPayload['type'];
  senderUsername: string;
  giftName?: string;
  giftCount?: number;
  commentText?: string;
  likeCount?: number;
  points?: number;
  bonusMultiplier?: number;
}

export interface RuleEvaluationResult {
  matchedRuleIds: string[];
  triggeredCommands: Array<{
    ruleId: string;
    ruleName: string;
    actionType: EventRule['actionType'];
    command: string;
    payload: string;
  }>;
}

function getNumericMetric(event: RuleInputEvent): number {
  switch (event.type) {
    case 'gift':
    case 'gift_count':
      return event.giftCount ?? 1;
    case 'like':
      return event.likeCount ?? 1;
    case 'score':
      return event.points ?? 0;
    case 'bonus':
      return event.bonusMultiplier ?? 1;
    default:
      return 1;
  }
}

function getTextTarget(event: RuleInputEvent): string {
  switch (event.type) {
    case 'gift':
    case 'gift_count':
      return event.giftName ?? '';
    case 'comment':
    case 'keyword':
      return event.commentText ?? '';
    case 'follow':
    case 'share':
      return event.senderUsername ?? '';
    default:
      return event.commentText ?? event.giftName ?? '';
  }
}

export function doesRuleMatchEvent(rule: EventRule, event: RuleInputEvent): boolean {
  if (!rule.enabled) return false;
  if (rule.gameId !== 'all' && rule.gameId !== event.gameId) return false;

  // Allow keyword rules to also match incoming comment events, and gift_count to match gift events
  const typeMatches =
    rule.eventType === event.type ||
    (rule.eventType === 'keyword' && event.type === 'comment') ||
    (rule.eventType === 'gift_count' && event.type === 'gift');

  if (!typeMatches) return false;

  if (rule.operator === 'any') return true;

  const expected = rule.conditionValue.trim();
  if (!expected) return true;

  if (rule.operator === 'gte') {
    const threshold = Number(expected);
    if (!Number.isFinite(threshold)) return false;
    return getNumericMetric(event) >= threshold;
  }

  const target = getTextTarget(event).trim().toLowerCase();
  const normalizedExpected = expected.toLowerCase();

  if (rule.operator === 'equals') {
    return target === normalizedExpected;
  }

  if (rule.operator === 'contains') {
    return target.includes(normalizedExpected);
  }

  return false;
}

export function evaluateRules(event: RuleInputEvent, rules: EventRule[]): RuleEvaluationResult {
  const matchedRuleIds: string[] = [];
  const triggeredCommands: RuleEvaluationResult['triggeredCommands'] = [];

  for (const rule of rules) {
    if (doesRuleMatchEvent(rule, event)) {
      matchedRuleIds.push(rule.id);
      triggeredCommands.push({
        ruleId: rule.id,
        ruleName: rule.name,
        actionType: rule.actionType,
        command: rule.actionCommand,
        payload: rule.actionPayload,
      });
    }
  }

  return { matchedRuleIds, triggeredCommands };
}
