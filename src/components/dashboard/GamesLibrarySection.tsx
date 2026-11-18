import React, { useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  Library,
  Play,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DashboardTab } from '../../lib/rbac';
import type { GameCategory, GameItem, UserRole } from '../../types/platform';
import { GamePlayer } from '../GamePlayer';

interface GamesLibrarySectionProps {
  mode: 'library' | 'my-games';
  userRole: UserRole;
  title: string;
  subtitle: string;
  games: GameItem[];
  myGameIds: string[];
  onToggleMyGame: (gameId: string, currentlyAdded: boolean) => Promise<void>;
  onToggleActive: (game: GameItem) => Promise<void>;
  onUpdateGame: (id: string, payload: Partial<GameItem>) => Promise<void>;
  onDeleteGame: (id: string) => Promise<void>;
  onSelectTab: (tab: DashboardTab) => void;
}

const CATEGORIES: Array<'Todas' | GameCategory> = [
  'Todas',
  'Arcade',
  'Ação',
  'Interativo',
  '3D / WebGL',
  'Phaser 2D',
  'Quiz / Chat',
  'Outro',
];

export function GamesLibrarySection({
  mode,
  userRole,
  title,
  subtitle,
  games,
  myGameIds,
  onToggleMyGame,
  onToggleActive,
  onUpdateGame,
  onDeleteGame,
  onSelectTab,
}: GamesLibrarySectionProps) {
  const isAdmin = userRole === 'admin';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Todas' | GameCategory>('Todas');
  const [previewGameId, setPreviewGameId] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<GameItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<GameCategory>('Interativo');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = games.filter((g) => {
    const matchCategory = categoryFilter === 'Todas' || g.category === categoryFilter;
    const q = search.trim().toLowerCase();
    const matchText =
      !q ||
      g.name.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.engine.toLowerCase().includes(q);
    return matchCategory && matchText;
  });

  const previewGame = games.find((g) => g.id === previewGameId) || null;
  const savedIdSet = new Set(myGameIds);

  const startEdit = (game: GameItem) => {
    if (!isAdmin) return;
    setEditingGame(game);
    setEditName(game.name);
    setEditDesc(game.description);
    setEditCategory(game.category);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGame || !isAdmin) return;
    setSaving(true);
    setActionError(null);
    try {
      await onUpdateGame(editingGame.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        category: editCategory,
      });
      setEditingGame(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar jogo.');
    } finally {
      setSaving(false);
    }
  };

  const handleMyGameToggle = async (game: GameItem) => {
    const currentlyAdded = savedIdSet.has(game.id);
    setBusyGameId(game.id);
    setActionError(null);
    try {
      await onToggleMyGame(game.id, currentlyAdded);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar Meus jogos.');
    } finally {
      setBusyGameId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onSelectTab('import-game')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            Importar jogo
          </button>
        )}
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jogo por nome, descrição ou engine..."
            aria-label="Buscar jogos"
            className="w-full rounded-lg border border-white/10 bg-[#11131C] pl-9 pr-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-[#3B82F6]/20 text-cyan-300 border border-[#3B82F6]/40'
                  : 'bg-[#11131C] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Embedded Player Preview */}
      {previewGame && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-cyan-300">
              Executando no Player: {previewGame.name}
            </span>
            <button
              type="button"
              onClick={() => setPreviewGameId(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar player
            </button>
          </div>
          <GamePlayer
            gameId={previewGame.id}
            gameName={previewGame.name}
            bundleHtml={previewGame.bundleHtml}
            active={previewGame.isActive}
          />
        </div>
      )}

      {/* Admin-only Edit Form */}
      {isAdmin && editingGame && (
        <form
          onSubmit={handleSaveEdit}
          className="rounded-xl border border-[#3B82F6]/40 bg-[#11131C] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">
              Editar jogo: {editingGame.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingGame(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-game-name" className="block text-xs text-slate-300 mb-1">
                Nome do jogo
              </label>
              <input
                id="edit-game-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="edit-game-cat" className="block text-xs text-slate-300 mb-1">
                Categoria
              </label>
              <select
                id="edit-game-cat"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as GameCategory)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                {CATEGORIES.filter((c) => c !== 'Todas').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="edit-game-desc" className="block text-xs text-slate-300 mb-1">
              Descrição
            </label>
            <textarea
              id="edit-game-desc"
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      )}

      {/* Empty State or Games Grid */}
      {games.length === 0 ? (
        <div
          data-testid="empty-library-state"
          className="rounded-xl border border-dashed border-white/15 bg-[#11131C]/60 p-12 text-center"
        >
          <Gamepad2 className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          {isAdmin ? (
            <>
              <h2 className="font-display text-lg font-semibold text-white mb-1">
                {mode === 'my-games'
                  ? 'Nenhum jogo adicionado aos seus jogos'
                  : 'Nenhum jogo cadastrado no catálogo'}
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                {mode === 'my-games'
                  ? 'Adicione jogos publicados da Biblioteca para acesso rápido nas suas transmissões.'
                  : 'O catálogo global começa vazio. Importe um arquivo HTML ou pacote ZIP (HTML5, Phaser ou Three.js) ou crie um novo jogo no estúdio.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {mode === 'my-games' ? (
                  <button
                    type="button"
                    onClick={() => onSelectTab('library')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white"
                  >
                    <Library className="w-4 h-4" />
                    Abrir Biblioteca
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectTab('import-game')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white"
                    >
                      <Upload className="w-4 h-4" />
                      Importar primeiro jogo
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTab('create-game')}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    >
                      Criar no estúdio
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-lg font-semibold text-white mb-1">
                {mode === 'my-games'
                  ? 'Sua lista Meus jogos está vazia'
                  : 'Nenhum jogo publicado na biblioteca ainda'}
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                {mode === 'my-games'
                  ? 'Explore a Biblioteca para adicionar jogos publicados à sua lista e usar nos overlays da sua live.'
                  : 'Assim que o administrador publicar jogos no catálogo central, eles ficarão disponíveis automaticamente aqui.'}
              </p>
              {mode === 'my-games' && (
                <button
                  type="button"
                  onClick={() => onSelectTab('library')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white"
                >
                  <Library className="w-4 h-4" />
                  Explorar Biblioteca
                </button>
              )}
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#11131C] p-8 text-center text-sm text-slate-400">
          Nenhum jogo corresponde aos filtros selecionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((game) => {
            const isSaved = savedIdSet.has(game.id);
            return (
              <div
                key={game.id}
                data-testid={`game-card-${game.id}`}
                className="rounded-xl border border-white/10 bg-[#11131C] overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[16/9] w-full bg-[#07080D] border-b border-white/10 overflow-hidden flex items-center justify-center">
                    {game.coverImage ? (
                      <img
                        src={game.coverImage}
                        alt={`Capa de ${game.name}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <Gamepad2 className="w-8 h-8" />
                        <span className="text-xs font-mono uppercase">{game.engine}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="font-display text-base font-semibold text-white truncate">
                        {game.name}
                      </h3>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          game.isActive ? 'text-cyan-400' : 'text-amber-300'
                        }`}
                      >
                        {game.isActive ? 'Publicado' : 'Despublicado'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mb-3">
                      {game.category} · {game.engine.toUpperCase()} ·{' '}
                      <span className="font-mono tabular-nums">
                        {(game.totalSizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>

                    <p className="text-sm text-slate-300 line-clamp-2 min-h-[2.5rem]">
                      {game.description || 'Sem descrição informada.'}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-white/10 bg-[#0B0D14] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewGameId(game.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 text-blue-200 border border-[#3B82F6]/30 whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Executar
                    </button>
                    <a
                      href={`/overlay/${game.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Overlay
                    </a>
                    {game.isActive && (
                      <button
                        type="button"
                        disabled={busyGameId === game.id}
                        onClick={() => void handleMyGameToggle(game)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
                          isSaved
                            ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25'
                            : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            Remover de Meus jogos
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3.5 h-3.5" />
                            Adicionar a Meus jogos
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void onToggleActive(game)}
                        aria-label={game.isActive ? `Despublicar ${game.name}` : `Publicar ${game.name}`}
                        title={game.isActive ? 'Despublicar' : 'Publicar'}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 border border-white/10 whitespace-nowrap"
                      >
                        {game.isActive ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                            Despublicar
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                            Publicar
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(game)}
                        aria-label={`Editar ${game.name}`}
                        title="Editar"
                        className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 border border-white/10"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === game.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            void onDeleteGame(game.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(game.id)}
                          aria-label={`Excluir ${game.name}`}
                          title="Excluir"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
