import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameItem } from '../types/platform.js';
import {
  ADMIN_ALLOWED_TABS,
  canAccessTab,
  canManageGlobalCatalog,
  filterGamesForRole,
  getMyGamesForRole,
  USER_ALLOWED_TABS,
} from './rbac.js';

const sampleGames: GameItem[] = [
  {
    id: 'g1',
    userId: 'admin1',
    name: 'Publicado 1',
    description: '',
    category: 'Arcade',
    engine: 'html5',
    entryFile: 'index.html',
    isActive: true,
    bundleHtml: '<html></html>',
    fileList: ['index.html'],
    totalSizeBytes: 100,
    overlayConfig: {
      showWatermark: true,
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
      backgroundMode: 'transparent',
      accentColor: '#8B5CF6',
      showEventToast: true,
      borderRadius: 12,
      scale: 1,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'g2',
    userId: 'admin1',
    name: 'Rascunho Despublicado',
    description: '',
    category: 'Arcade',
    engine: 'html5',
    entryFile: 'index.html',
    isActive: false,
    bundleHtml: '<html></html>',
    fileList: ['index.html'],
    totalSizeBytes: 100,
    overlayConfig: {
      showWatermark: true,
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
      backgroundMode: 'transparent',
      accentColor: '#8B5CF6',
      showEventToast: true,
      borderRadius: 12,
      scale: 1,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

test('USER cannot access import, create, overlay config, settings, or admin tabs', () => {
  assert.equal(canAccessTab('user', 'import-game'), false);
  assert.equal(canAccessTab('user', 'create-game'), false);
  assert.equal(canAccessTab('user', 'overlays'), false);
  assert.equal(canAccessTab('user', 'settings'), false);
  assert.equal(canAccessTab('user', 'admin'), false);
  assert.equal(USER_ALLOWED_TABS.length, 7);
});

test('ADMIN can access all 11 dashboard tabs plus admin', () => {
  for (const tab of ADMIN_ALLOWED_TABS) {
    assert.equal(canAccessTab('admin', tab), true);
  }
  assert.equal(canManageGlobalCatalog('admin'), true);
  assert.equal(canManageGlobalCatalog('user'), false);
});

test('USER only sees published games in global catalog and my-games', () => {
  const libUser = filterGamesForRole(sampleGames, 'user');
  assert.deepEqual(libUser.map((g) => g.id), ['g1']);

  const libAdmin = filterGamesForRole(sampleGames, 'admin');
  assert.deepEqual(libAdmin.map((g) => g.id), ['g1', 'g2']);

  // Even if user previously saved g2, unpublishing hides it from Meus jogos
  const myUser = getMyGamesForRole(sampleGames, ['g1', 'g2'], 'user');
  assert.deepEqual(myUser.map((g) => g.id), ['g1']);
});
