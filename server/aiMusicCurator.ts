import { GoogleGenAI, Type } from '@google/genai';
import { buildUpcomingQueue } from '../src/lib/smartMusicAi.js';
import type {
  AdminAiMusicRule,
  GameItem,
  GameMusicPreferences,
  MusicSourceMode,
  MusicTrack,
} from '../src/types/platform.js';

export interface AiCuratedMusicResult {
  orderedTrackIds: string[];
  recommendedMood: string;
  rationale: string;
  engine: 'gemini-4-hydrogen' | 'local-smart-engine';
}

export async function curateMusicOrderForGame(input: {
  game: Pick<GameItem, 'id' | 'name' | 'description' | 'category' | 'engine'>;
  tracks: MusicTrack[];
  preferences?: Partial<GameMusicPreferences> | null;
  adminRule?: Partial<AdminAiMusicRule> | null;
  sourceMode?: MusicSourceMode;
  preferredMood?: string;
}): Promise<AiCuratedMusicResult> {
  const effectiveSourceMode: MusicSourceMode =
    input.sourceMode ||
    input.preferences?.sourceMode ||
    input.adminRule?.defaultSourceMode ||
    'mixed';

  const effectiveMood =
    input.preferredMood ||
    input.preferences?.preferredMood ||
    input.adminRule?.preferredEnergy ||
    'auto';

  const localQueue = buildUpcomingQueue({
    tracks: input.tracks,
    game: input.game,
    preferences: {
      ...(input.preferences || {}),
      sourceMode: effectiveSourceMode,
      preferredMood: effectiveMood,
    },
    adminRule: input.adminRule,
    queueLength: Math.min(10, Math.max(1, input.tracks.length)),
  });

  const fallbackOrder = localQueue.map((t) => t.id);
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || localQueue.length === 0) {
    return {
      orderedTrackIds: fallbackOrder,
      recommendedMood: effectiveMood === 'auto' ? localQueue[0]?.mood || 'dinamico' : effectiveMood,
      rationale:
        localQueue.length === 0
          ? 'Nenhuma faixa ativa elegível encontrada para o modo de biblioteca selecionado.'
          : `Curadoria automática por afinidade de categoria (${input.game.category}), energia e alternância anti-repetição.`,
      engine: 'local-smart-engine',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const catalogSnapshot = input.tracks
      .filter((t) => t.isActive && (t.gameId === input.game.id || t.gameId === 'all'))
      .slice(0, 40)
      .map((t) => ({
        id: t.id,
        scope: t.scope,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        mood: t.mood,
        tags: t.aiTags,
      }));

    if (catalogSnapshot.length === 0) {
      return {
        orderedTrackIds: [],
        recommendedMood: effectiveMood,
        rationale: 'Sem faixas ativas no momento para montar a sequência.',
        engine: 'local-smart-engine',
      };
    }

    const prompt = [
      'Você é o diretor musical de rádio contínua para transmissões ao vivo de jogos interativos no TikTok LIVE.',
      `Jogo: ${input.game.name} | Categoria: ${input.game.category} | Engine: ${input.game.engine}`,
      `Descrição do jogo: ${input.game.description || 'Jogo interativo para live'}`,
      `Modo de origem permitido: ${effectiveSourceMode}`,
      `Clima desejado pelo criador: ${effectiveMood}`,
      `Instruções globais do administrador: ${input.adminRule?.aiInstructions || 'Alternar faixas oficiais e pessoais sem repetições.'}`,
      `Catálogo disponível (JSON): ${JSON.stringify(catalogSnapshot)}`,
      'Ordene os IDs das faixas disponíveis criando um fluxo musical contínuo, coerente com o ritmo do jogo e sem repetições consecutivas. Retorne apenas IDs existentes no catálogo.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            orderedTrackIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendedMood: { type: Type.STRING },
            rationale: { type: Type.STRING },
          },
          required: ['orderedTrackIds', 'recommendedMood', 'rationale'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      throw new Error('Resposta vazia do modelo');
    }

    const parsed = JSON.parse(rawText) as {
      orderedTrackIds?: string[];
      recommendedMood?: string;
      rationale?: string;
    };

    const validSet = new Set(catalogSnapshot.map((c) => c.id));
    const curated = Array.from(
      new Set((parsed.orderedTrackIds || []).filter((id) => validSet.has(id))),
    );
    // Append any remaining localQueue IDs not covered
    for (const id of fallbackOrder) {
      if (!curated.includes(id)) curated.push(id);
    }

    return {
      orderedTrackIds: curated,
      recommendedMood: (parsed.recommendedMood || effectiveMood || 'dinamico').slice(0, 40),
      rationale:
        (parsed.rationale || 'Playlist ordenada com inteligência musical para o clima da live.').slice(
          0,
          280,
        ),
      engine: 'gemini-4-hydrogen',
    };
  } catch (err) {
    console.warn('Fallback da curadoria musical IA para motor local:', err);
    return {
      orderedTrackIds: fallbackOrder,
      recommendedMood: effectiveMood === 'auto' ? localQueue[0]?.mood || 'dinamico' : effectiveMood,
      rationale: `Curadoria inteligente aplicada por categoria (${input.game.category}), metadados e variação contínua.`,
      engine: 'local-smart-engine',
    };
  }
}
