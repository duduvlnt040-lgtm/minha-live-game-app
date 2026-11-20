import type {
  AdminAiMusicRule,
  GameCategory,
  GameEngine,
  GameMusicPreferences,
  MusicSourceMode,
  MusicTrack,
} from '../types/platform.js';

export interface AiTrackGameContext {
  id: string;
  name: string;
  category: GameCategory | string;
  engine: GameEngine | string;
}

export interface InferredTrackMeta {
  title: string;
  artist: string;
  genre: string;
  mood: string;
  aiTags: string[];
}

const GENRE_KEYWORDS: Array<{ pattern: RegExp; genre: string; mood: string; tags: string[] }> = [
  { pattern: /\b(rock|metal|punk|guitar)\b/i, genre: 'Rock / Energia', mood: 'energetico', tags: ['rock', 'acao', 'energia'] },
  { pattern: /\b(edm|electro|techno|house|synth|cyber|trance|bass|phonk|remix)\b/i, genre: 'Eletrônica', mood: 'energetico', tags: ['eletronica', '3d', 'arcade', 'turbo'] },
  { pattern: /\b(funk|baile|samba|festa|party|casamento|carnaval|forro|forró|sertanejo|pagode)\b/i, genre: 'Festa / Brasil', mood: 'festivo', tags: ['festa', 'animado', 'casamento', 'comedia'] },
  { pattern: /\b(lofi|lo-fi|chill|ambient|relax|study|piano|jazz)\b/i, genre: 'Lo-Fi / Chill', mood: 'calmo', tags: ['chill', 'quiz', 'chat', 'calmo'] },
  { pattern: /\b(8bit|8-bit|chiptune|retro|arcade|pixel|game|boss)\b/i, genre: 'Arcade / Retro', mood: 'dinamico', tags: ['arcade', 'phaser', 'retro', 'acao'] },
  { pattern: /\b(epic|orchestral|cinematic|hero|battle|war)\b/i, genre: 'Épico / Trilha', mood: 'epico', tags: ['epico', 'especial', '3d'] },
  { pattern: /\b(hiphop|hip-hop|trap|rap|beat)\b/i, genre: 'Hip-Hop / Trap', mood: 'dinamico', tags: ['beat', 'ritmo', 'urbano'] },
];

export function inferTrackMetadataFromFilename(fileName: string): InferredTrackMeta {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').trim();
  const clean = withoutExt.replace(/\s+/g, ' ');

  let artist = '';
  let title = clean || 'Faixa sem título';

  if (clean.includes(' - ')) {
    const [left, ...rest] = clean.split(' - ');
    if (left.trim() && rest.join(' - ').trim()) {
      artist = left.trim().slice(0, 80);
      title = rest.join(' - ').trim().slice(0, 100);
    }
  }

  let genre = 'Trilha Geral';
  let mood = 'dinamico';
  const tags = new Set<string>();

  for (const rule of GENRE_KEYWORDS) {
    if (rule.pattern.test(clean)) {
      genre = rule.genre;
      mood = rule.mood;
      for (const t of rule.tags) tags.add(t);
    }
  }

  for (const word of clean.toLowerCase().split(/[^a-z0-9à-ú]+/i)) {
    if (word.length >= 3) tags.add(word);
  }

  return {
    title,
    artist,
    genre,
    mood,
    aiTags: Array.from(tags).slice(0, 12),
  };
}

export function filterEligibleTracks(
  tracks: MusicTrack[],
  sourceMode: MusicSourceMode,
  gameId: string,
  activePlaylistTrackIds?: string[],
): MusicTrack[] {
  const active = tracks.filter(
    (t) => t.isActive && (t.gameId === gameId || t.gameId === 'all'),
  );

  const byScope = active.filter((t) => {
    if (sourceMode === 'official_only') return t.scope === 'official';
    if (sourceMode === 'personal_only') return t.scope === 'personal';
    return true;
  });

  if (activePlaylistTrackIds && activePlaylistTrackIds.length > 0) {
    const idSet = new Set(activePlaylistTrackIds);
    const playlistSubset = byScope.filter((t) => idSet.has(t.id));
    if (playlistSubset.length > 0) return playlistSubset;
  }

  return byScope;
}

const CATEGORY_AFFINITY: Record<string, string[]> = {
  '3D / WebGL': ['eletronica', '3d', 'epico', 'festa', 'dinamico', 'energetico'],
  'Ação': ['rock', 'acao', 'eletronica', 'epico', 'energetico', 'turbo'],
  Arcade: ['arcade', 'retro', 'phaser', 'dinamico', 'eletronica'],
  'Phaser 2D': ['arcade', 'retro', 'phaser', 'dinamico'],
  Interativo: ['festa', 'animado', 'dinamico', 'eletronica', 'pop'],
  'Quiz / Chat': ['chill', 'calmo', 'quiz', 'chat', 'dinamico'],
  Outro: ['dinamico', 'festa', 'eletronica'],
};

export function scoreTrackForGameContext(
  track: MusicTrack,
  context: AiTrackGameContext,
  options: {
    preferredMood?: string;
    aiCuratedOrder?: string[];
    recentTrackIds?: string[];
    prioritizeOfficialRatio?: number;
    recentOfficialShare?: number;
  } = {},
): number {
  let score = 50;

  // 1. Game-specific assignment beats generic 'all'
  if (track.gameId === context.id) {
    score += 18;
  }

  // 2. Category & engine affinity against track genre/mood/tags/title
  const haystack = [
    track.title,
    track.artist,
    track.genre,
    track.mood,
    ...(track.aiTags || []),
  ]
    .join(' ')
    .toLowerCase();

  const affinities = CATEGORY_AFFINITY[context.category] || CATEGORY_AFFINITY.Outro;
  for (const kw of affinities) {
    if (haystack.includes(kw)) score += 9;
  }

  // Match keywords from game name itself (e.g. "Casamento", "Baratas", "Corrida")
  const gameWords = context.name
    .toLowerCase()
    .split(/[^a-z0-9à-ú]+/i)
    .filter((w) => w.length >= 4);
  for (const w of gameWords) {
    if (haystack.includes(w)) score += 12;
  }

  // 3. Preferred mood filter boost
  const mood = (options.preferredMood || 'auto').toLowerCase();
  if (mood !== 'auto') {
    if (track.mood.toLowerCase() === mood || haystack.includes(mood)) {
      score += 22;
    }
  }

  // 4. Gemini AI / Curated order bonus
  if (options.aiCuratedOrder && options.aiCuratedOrder.length > 0) {
    const idx = options.aiCuratedOrder.indexOf(track.id);
    if (idx >= 0) {
      score += Math.max(4, 20 - idx * 2);
    }
  }

  // 5. Official vs personal balance in mixed mode
  const targetRatio = options.prioritizeOfficialRatio ?? 0.6;
  const currentRatio = options.recentOfficialShare ?? targetRatio;
  if (currentRatio < targetRatio && track.scope === 'official') {
    score += 10;
  } else if (currentRatio > targetRatio && track.scope === 'personal') {
    score += 10;
  }

  // 6. Anti-repeat penalty
  const recent = options.recentTrackIds || [];
  const lastIndex = recent.lastIndexOf(track.id);
  if (lastIndex >= 0) {
    const distanceFromEnd = recent.length - 1 - lastIndex;
    if (distanceFromEnd === 0) {
      score -= 1000; // Never repeat immediately if another track exists
    } else {
      score -= Math.max(15, 65 - distanceFromEnd * 18);
    }
  }

  return score;
}

export function selectNextTrackWithAi(input: {
  tracks: MusicTrack[];
  game: AiTrackGameContext;
  preferences?: Partial<GameMusicPreferences> | null;
  adminRule?: Partial<AdminAiMusicRule> | null;
  currentTrackId?: string | null;
  recentTrackIds?: string[];
  activePlaylistTrackIds?: string[];
  jitterSeed?: number;
}): MusicTrack | null {
  const sourceMode: MusicSourceMode =
    input.preferences?.sourceMode ||
    input.adminRule?.defaultSourceMode ||
    'mixed';

  const eligible = filterEligibleTracks(
    input.tracks,
    sourceMode,
    input.game.id,
    input.activePlaylistTrackIds,
  );

  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  const avoidWindow = Math.max(1, input.adminRule?.avoidRepeatWindow ?? 3);
  const rawRecent = [...(input.recentTrackIds || [])];
  if (input.currentTrackId && rawRecent[rawRecent.length - 1] !== input.currentTrackId) {
    rawRecent.push(input.currentTrackId);
  }
  const recentWindow = rawRecent.slice(-avoidWindow);

  // Strictly exclude currentTrackId when more than 1 track is available
  const candidates = input.currentTrackId
    ? eligible.filter((t) => t.id !== input.currentTrackId)
    : eligible;
  const pool = candidates.length > 0 ? candidates : eligible;

  const recentTracks = recentWindow
    .map((id) => eligible.find((t) => t.id === id))
    .filter((t): t is MusicTrack => Boolean(t));
  const recentOfficialShare =
    recentTracks.length > 0
      ? recentTracks.filter((t) => t.scope === 'official').length / recentTracks.length
      : undefined;

  let bestTrack = pool[0];
  let bestScore = -Infinity;

  pool.forEach((track, idx) => {
    const baseScore = scoreTrackForGameContext(track, input.game, {
      preferredMood: input.preferences?.preferredMood || input.adminRule?.preferredEnergy || 'auto',
      aiCuratedOrder: input.preferences?.aiCuratedOrder,
      recentTrackIds: recentWindow,
      prioritizeOfficialRatio: input.adminRule?.prioritizeOfficialRatio ?? 0.6,
      recentOfficialShare,
    });

    // Small deterministic tie-breaker / rotation variation
    const seed = input.jitterSeed ?? 0;
    const variation = ((track.title.length * 7 + idx * 13 + seed) % 11) * 0.6;
    const finalScore = baseScore + variation;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestTrack = track;
    }
  });

  return bestTrack;
}

export function buildUpcomingQueue(input: {
  tracks: MusicTrack[];
  game: AiTrackGameContext;
  preferences?: Partial<GameMusicPreferences> | null;
  adminRule?: Partial<AdminAiMusicRule> | null;
  currentTrackId?: string | null;
  recentTrackIds?: string[];
  activePlaylistTrackIds?: string[];
  queueLength?: number;
}): MusicTrack[] {
  const count = Math.max(1, Math.min(10, input.queueLength ?? 5));
  const queue: MusicTrack[] = [];
  let cursorId = input.currentTrackId ?? null;
  const simulatedRecent = [...(input.recentTrackIds || [])];
  if (cursorId && simulatedRecent[simulatedRecent.length - 1] !== cursorId) {
    simulatedRecent.push(cursorId);
  }

  for (let i = 0; i < count; i++) {
    const next = selectNextTrackWithAi({
      tracks: input.tracks,
      game: input.game,
      preferences: input.preferences,
      adminRule: input.adminRule,
      currentTrackId: cursorId,
      recentTrackIds: simulatedRecent,
      activePlaylistTrackIds: input.activePlaylistTrackIds,
      jitterSeed: i + 1,
    });
    if (!next) break;
    queue.push(next);
    cursorId = next.id;
    simulatedRecent.push(next.id);
  }

  return queue;
}
