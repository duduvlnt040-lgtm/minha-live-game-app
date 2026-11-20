import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySupabaseKey,
  isSupabaseApiKeyToken,
  isValidPublicSupabaseKey,
  isValidSecretSupabaseKey,
} from './supabaseKeyUtils.js';

test('classifySupabaseKey recognizes sb_publishable_, sb_secret_, and legacy JWT keys', () => {
  assert.equal(classifySupabaseKey('sb_publishable_test_123'), 'publishable');
  assert.equal(classifySupabaseKey('sb_secret_test_123'), 'secret');
  assert.equal(classifySupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig'), 'legacy_jwt');
  assert.equal(classifySupabaseKey(''), 'unknown');
  assert.equal(classifySupabaseKey('random_invalid_string'), 'unknown');
});

test('isValidPublicSupabaseKey accepts sb_publishable_ and legacy JWT while rejecting sb_secret_', () => {
  assert.equal(isValidPublicSupabaseKey('sb_publishable_abc'), true);
  assert.equal(isValidPublicSupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig'), true);
  assert.equal(isValidPublicSupabaseKey('sb_secret_abc'), false);
  assert.equal(isValidPublicSupabaseKey(''), false);
});

test('isValidSecretSupabaseKey accepts sb_secret_ and legacy JWT while rejecting sb_publishable_', () => {
  assert.equal(isValidSecretSupabaseKey('sb_secret_abc'), true);
  assert.equal(isValidSecretSupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'), true);
  assert.equal(isValidSecretSupabaseKey('sb_publishable_abc'), false);
  assert.equal(isValidSecretSupabaseKey(''), false);
});

test('isSupabaseApiKeyToken prevents API keys from being treated as user session JWTs', () => {
  assert.equal(isSupabaseApiKeyToken('sb_publishable_abc123'), true);
  assert.equal(isSupabaseApiKeyToken('sb_secret_abc123'), true);
  assert.equal(isSupabaseApiKeyToken('sb_temp_abc123'), true);
  assert.equal(isSupabaseApiKeyToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig'), false);
});
