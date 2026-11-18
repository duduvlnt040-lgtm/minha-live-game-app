import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateGame, canCreateRule, canCustomizeWatermark } from './planLimits';

test('free plan limits games to 2', () => {
  assert.equal(canCreateGame('free', 0).allowed, true);
  assert.equal(canCreateGame('free', 1).allowed, true);
  assert.equal(canCreateGame('free', 2).allowed, false);
});

test('premium plan allows up to 15 games and 40 rules', () => {
  assert.equal(canCreateGame('premium', 14).allowed, true);
  assert.equal(canCreateGame('premium', 15).allowed, false);
  assert.equal(canCreateRule('premium', 39).allowed, true);
  assert.equal(canCreateRule('premium', 40).allowed, false);
});

test('only pro plan allows full watermark removal customization', () => {
  assert.equal(canCustomizeWatermark('free'), false);
  assert.equal(canCustomizeWatermark('premium'), false);
  assert.equal(canCustomizeWatermark('pro'), true);
});
