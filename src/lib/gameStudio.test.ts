import test from 'node:test';
import assert from 'node:assert/strict';
import type { GiftMapping, MusicTrack } from '../types/platform.js';
import { AVAILABLE_GAME_ACTIONS, evaluateGiftMappings } from './giftActions.js';
import {
  buildUpcomingQueue,
  filterEligibleTracks,
  inferTrackMetadataFromFilename,
  selectNextTrackWithAi,
} from './smartMusicAi.js';

const sampleMappings: GiftMapping[] = [
  {
    id: 'gm_map_rosa',
    userId: 'u1',
    gameId: 'game_1',
    giftName: 'Rosa',
    minCount: 1,
    actionKey: 'move_walk',
    actionLabel: 'Personagem anda / avança',
    actionCommand: 'move_walk',
    actionPayload: { action: 'walk', steps: 1 },
    cooldownMs: 0,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'gm_map_coracao',
    userId: 'u1',
    gameId: 'game_1',
    giftName: 'Coração',
    minCount: 1,
    actionKey: 'jump',
    actionLabel: 'Personagem pula',
    actionCommand: 'jump',
    actionPayload: { action: 'jump', force: 1.4 },
    cooldownMs: 0,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'gm_map_galaxy',
    userId: 'u1',
    gameId: 'game_1',
    giftName: 'Galaxy',
    minCount: 2,
    actionKey: 'special_action',
    actionLabel: 'Ação especial / poder',
    actionCommand: 'special_action',
    actionPayload: { effect: 'supernova' },
    cooldownMs: 0,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'gm_map_disabled',
    userId: 'u1',
    gameId: 'game_1',
    giftName: 'Perfume',
    minCount: 1,
    actionKey: 'dance_celebrate',
    actionLabel: 'Comemoração / dança',
    actionCommand: 'dance_celebrate',
    actionPayload: {},
    cooldownMs: 0,
    enabled: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const sampleTracks: MusicTrack[] = [
  {
    id: 'trk_off_1',
    scope: 'official',
    ownerUserId: 'adm',
    gameId: 'game_1',
    title: 'Neon Cyber Run',
    artist: 'DJ Arcade',
    genre: 'Eletrônica',
    mood: 'energetico',
    storagePath: 'official/all/neon.mp3',
    audioUrl: 'https://cdn.example/neon.mp3',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 1200000,
    isActive: true,
    sortOrder: 0,
    aiTags: ['eletronica', 'arcade', 'energia'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'trk_off_2',
    scope: 'official',
    ownerUserId: 'adm',
    gameId: 'all',
    title: 'Retro Pixel Dash',
    artist: 'Chiptune Lab',
    genre: 'Arcade / Retro',
    mood: 'dinamico',
    storagePath: 'official/all/retro.mp3',
    audioUrl: 'https://cdn.example/retro.mp3',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 980000,
    isActive: true,
    sortOrder: 1,
    aiTags: ['arcade', 'retro'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'trk_pers_1',
    scope: 'personal',
    ownerUserId: 'u1',
    gameId: 'game_1',
    title: 'Baile da Live',
    artist: 'Streamer Mix',
    genre: 'Festa / Brasil',
    mood: 'festivo',
    storagePath: 'personal/u1/baile.mp3',
    audioUrl: 'https://cdn.example/baile.mp3',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 1500000,
    isActive: true,
    sortOrder: 0,
    aiTags: ['festa', 'animado'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'trk_inactive',
    scope: 'personal',
    ownerUserId: 'u1',
    gameId: 'game_1',
    title: 'Faixa Pausada',
    artist: 'Offline',
    genre: 'Lo-Fi / Chill',
    mood: 'calmo',
    storagePath: 'personal/u1/off.mp3',
    audioUrl: 'https://cdn.example/off.mp3',
    mimeType: 'audio/mpeg',
    fileSizeBytes: 500000,
    isActive: false,
    sortOrder: 2,
    aiTags: ['chill'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

test('AVAILABLE_GAME_ACTIONS covers standard TikTok LIVE interactive actions', () => {
  const keys = AVAILABLE_GAME_ACTIONS.map((a) => a.key);
  assert.ok(keys.includes('move_walk'));
  assert.ok(keys.includes('jump'));
  assert.ok(keys.includes('special_action'));
  assert.ok(keys.includes('boost_speed'));
  assert.ok(keys.includes('dance_celebrate'));
});

test('evaluateGiftMappings matches Rosa, Coração, enforces minCount and skips disabled mappings', () => {
  const rosaTriggered = evaluateGiftMappings(
    { gameId: 'game_1', type: 'gift', senderUsername: 'ana', giftName: 'rosa', giftCount: 1 },
    sampleMappings,
  );
  assert.equal(rosaTriggered.length, 1);
  assert.equal(rosaTriggered[0].command, 'move_walk');

  const coracaoTriggered = evaluateGiftMappings(
    { gameId: 'game_1', type: 'gift', senderUsername: 'pedro', giftName: 'Coração', giftCount: 1 },
    sampleMappings,
  );
  assert.equal(coracaoTriggered.length, 1);
  assert.equal(coracaoTriggered[0].command, 'jump');

  const galaxyOne = evaluateGiftMappings(
    { gameId: 'game_1', type: 'gift', senderUsername: 'vip', giftName: 'Galaxy', giftCount: 1 },
    sampleMappings,
  );
  assert.equal(galaxyOne.length, 0);

  const galaxyTwo = evaluateGiftMappings(
    { gameId: 'game_1', type: 'gift', senderUsername: 'vip', giftName: 'Galaxy', giftCount: 2 },
    sampleMappings,
  );
  assert.equal(galaxyTwo.length, 1);
  assert.equal(galaxyTwo[0].command, 'special_action');

  const disabledPerfume = evaluateGiftMappings(
    { gameId: 'game_1', type: 'gift', senderUsername: 'maria', giftName: 'Perfume', giftCount: 5 },
    sampleMappings,
  );
  assert.equal(disabledPerfume.length, 0);
});

test('inferTrackMetadataFromFilename parses artist, title, genre and mood', () => {
  const meta = inferTrackMetadataFromFilename('Alok_Remix - Electro_Bass_Live.mp3');
  assert.equal(meta.artist, 'Alok Remix');
  assert.equal(meta.title, 'Electro Bass Live');
  assert.equal(meta.genre, 'Eletrônica');
  assert.equal(meta.mood, 'energetico');
  assert.ok(meta.aiTags.includes('eletronica'));
});

test('filterEligibleTracks respects active flag and sourceMode (official_only, personal_only, mixed)', () => {
  const official = filterEligibleTracks(sampleTracks, 'official_only', 'game_1');
  assert.deepEqual(
    official.map((t) => t.id),
    ['trk_off_1', 'trk_off_2'],
  );

  const personal = filterEligibleTracks(sampleTracks, 'personal_only', 'game_1');
  assert.deepEqual(
    personal.map((t) => t.id),
    ['trk_pers_1'],
  );

  const mixed = filterEligibleTracks(sampleTracks, 'mixed', 'game_1');
  assert.equal(mixed.length, 3);
  assert.ok(!mixed.some((t) => t.id === 'trk_inactive'));
});

test('selectNextTrackWithAi avoids consecutive repeats and builds upcoming queue', () => {
  const gameCtx = { id: 'game_1', name: 'Corrida Arcade', category: 'Arcade', engine: 'phaser' };

  const first = selectNextTrackWithAi({
    tracks: sampleTracks,
    game: gameCtx,
    preferences: { sourceMode: 'mixed', preferredMood: 'auto' },
    currentTrackId: 'trk_off_1',
    recentTrackIds: ['trk_off_1'],
  });
  assert.ok(first);
  assert.notEqual(first.id, 'trk_off_1');

  const queue = buildUpcomingQueue({
    tracks: sampleTracks,
    game: gameCtx,
    preferences: { sourceMode: 'mixed' },
    currentTrackId: 'trk_off_1',
    queueLength: 4,
  });
  assert.equal(queue.length, 4);
  for (let i = 1; i < queue.length; i++) {
    assert.notEqual(queue[i].id, queue[i - 1].id);
  }
});
