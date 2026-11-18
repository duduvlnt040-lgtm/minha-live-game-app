import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules } from './ruleEngine';
import type { EventRule } from '../types/platform';

const baseRule: EventRule = {
  id: 'rule-1',
  userId: 'u-1',
  gameId: 'all',
  name: 'Explosão Rosa',
  enabled: true,
  eventType: 'gift',
  operator: 'equals',
  conditionValue: 'Rosa',
  actionType: 'trigger_animation',
  actionCommand: 'spawn_gift_burst',
  actionPayload: '{"color":"#EC4899","count":12}',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

test('matches exact gift rule case-insensitively', () => {
  const result = evaluateRules(
    {
      gameId: 'g-1',
      type: 'gift',
      senderUsername: 'joao_live',
      giftName: 'rosa',
      giftCount: 1,
    },
    [baseRule],
  );
  assert.equal(result.matchedRuleIds.length, 1);
  assert.equal(result.triggeredCommands[0].command, 'spawn_gift_burst');
});

test('matches keyword rule on incoming comment event', () => {
  const keywordRule: EventRule = {
    ...baseRule,
    id: 'rule-2',
    eventType: 'keyword',
    operator: 'contains',
    conditionValue: '!turbo',
    actionType: 'custom_command',
    actionCommand: 'activate_turbo',
    actionPayload: '{"duration":5000}',
  };

  const result = evaluateRules(
    {
      gameId: 'g-1',
      type: 'comment',
      senderUsername: 'maria_stream',
      commentText: 'Manda !TURBO agora!',
    },
    [keywordRule],
  );
  assert.deepEqual(result.matchedRuleIds, ['rule-2']);
});

test('skips disabled rules and non-matching gameIds', () => {
  const disabled: EventRule = { ...baseRule, id: 'r-disabled', enabled: false };
  const wrongGame: EventRule = { ...baseRule, id: 'r-other-game', gameId: 'g-99' };

  const result = evaluateRules(
    {
      gameId: 'g-1',
      type: 'gift',
      senderUsername: 'viewer',
      giftName: 'Rosa',
    },
    [disabled, wrongGame],
  );
  assert.equal(result.matchedRuleIds.length, 0);
});

test('matches gift_count threshold with gte operator', () => {
  const countRule: EventRule = {
    ...baseRule,
    id: 'r-count',
    eventType: 'gift_count',
    operator: 'gte',
    conditionValue: '5',
    actionType: 'add_score',
    actionCommand: 'add_points',
    actionPayload: '{"points":500}',
  };

  const fail = evaluateRules(
    { gameId: 'g-1', type: 'gift', senderUsername: 'v', giftName: 'TikTok', giftCount: 3 },
    [countRule],
  );
  assert.equal(fail.matchedRuleIds.length, 0);

  const pass = evaluateRules(
    { gameId: 'g-1', type: 'gift', senderUsername: 'v', giftName: 'TikTok', giftCount: 10 },
    [countRule],
  );
  assert.deepEqual(pass.matchedRuleIds, ['r-count']);
});
