import type { GameItem, UserRole } from '../types/platform';

export type DashboardTab =
  | 'overview'
  | 'my-games'
  | 'library'
  | 'import-game'
  | 'create-game'
  | 'live-events'
  | 'overlays'
  | 'integrations'
  | 'settings'
  | 'subscription'
  | 'account'
  | 'admin';

export const ADMIN_ALLOWED_TABS: DashboardTab[] = [
  'overview',
  'my-games',
  'library',
  'import-game',
  'create-game',
  'live-events',
  'overlays',
  'integrations',
  'settings',
  'subscription',
  'account',
  'admin',
];

export const USER_ALLOWED_TABS: DashboardTab[] = [
  'overview',
  'my-games',
  'library',
  'live-events',
  'integrations',
  'subscription',
  'account',
];

export function canAccessTab(role: UserRole, tab: DashboardTab): boolean {
  if (role === 'admin') return ADMIN_ALLOWED_TABS.includes(tab);
  return USER_ALLOWED_TABS.includes(tab);
}

export function canManageGlobalCatalog(role: UserRole): boolean {
  return role === 'admin';
}

export function filterGamesForRole(games: GameItem[], role: UserRole): GameItem[] {
  if (role === 'admin') return games;
  return games.filter((g) => g.isActive);
}

export function getMyGamesForRole(games: GameItem[], myGameIds: string[], role: UserRole): GameItem[] {
  const visible = filterGamesForRole(games, role);
  const idSet = new Set(myGameIds);
  return visible.filter((g) => idSet.has(g.id));
}
