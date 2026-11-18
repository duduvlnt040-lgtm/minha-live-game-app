import React, { useMemo, useRef, useState } from 'react';
import { Code2, Play, Save, Sparkles } from 'lucide-react';
import { GAME_TEMPLATES } from '../../lib/gameTemplates';
import { buildIsolatedHtmlBundle } from '../../lib/zipValidator';
import type { GameCategory, GameEngine, GameItem } from '../../types/platform';
import { GamePlayer } from '../GamePlayer';

interface CreateGameSectionProps {
  onCreateGame: (payload: {
    name: string;
    description: string;
    category: GameCategory;
    engine: GameEngine;
    entryFile: string;
    files: Record<string, string>;
  }) => Promise<GameItem>;
  onCreated: () => void;
}

export function CreateGameSection({ onCreateGame, onCreated }: CreateGameSectionProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(GAME_TEMPLATES[0].id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GameCategory>('Interativo');
  const [engine, setEngine] = useState<GameEngine>('html5');
  const [code, setCode] = useState(GAME_TEMPLATES[0].html);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<{ sendEvent: (ev: any) => void; sendCommand: (cmd: unknown) => void }>(null);

  const bundled = useMemo(() => {
    return buildIsolatedHtmlBundle('index.html', { 'index.html': code }, window.location.origin);
  }, [code]);

  const handleLoadTemplate = (templateId: string) => {
    const tpl = GAME_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    setEngine(tpl.engine);
    setCode(tpl.html);
  };

  const handleTestBurst = () => {
    playerRef.current?.sendEvent({
      id: 'studio_test',
      userId: 'studio',
      gameId: 'studio-preview',
      type: 'gift',
      senderUsername: 'teste_estudio',
      giftName: 'Rosa',
      giftCount: 3,
      isSimulation: true,
      matchedRuleIds: [],
      triggeredCommands: [],
      createdAt: new Date().toISOString(),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Informe um nome para salvar o jogo na sua biblioteca.');
      return;
    }
    setSaving(true);
    try {
      await onCreateGame({
        name: name.trim(),
        description: description.trim(),
        category,
        engine,
        entryFile: 'index.html',
        files: { 'index.html': code },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar jogo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Criar jogo</h1>
        <p className="text-sm text-slate-400 mt-1">
          Estúdio integrado para desenvolver cenas HTML5, Phaser 3 ou Three.js já conectadas ao SDK da plataforma.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Template Picker */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GAME_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => handleLoadTemplate(tpl.id)}
            className={`text-left rounded-xl border p-4 transition-colors ${
              selectedTemplateId === tpl.id
                ? 'border-[#3B82F6] bg-[#3B82F6]/10'
                : 'border-white/10 bg-[#11131C] hover:bg-white/5'
            }`}
          >
            <div className="font-display text-sm font-semibold text-white">{tpl.label}</div>
            <div className="text-xs text-slate-400 mt-1">{tpl.description}</div>
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 space-y-4 rounded-xl border border-white/10 bg-[#11131C] p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-name" className="block text-xs text-slate-300 mb-1">
                Nome do jogo
              </label>
              <input
                id="create-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Meu Jogo Interativo"
                required
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="create-category" className="block text-xs text-slate-300 mb-1">
                Categoria
              </label>
              <select
                id="create-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as GameCategory)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                <option value="Interativo">Interativo</option>
                <option value="Arcade">Arcade</option>
                <option value="Phaser 2D">Phaser 2D</option>
                <option value="3D / WebGL">3D / WebGL</option>
                <option value="Quiz / Chat">Quiz / Chat</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="create-desc" className="block text-xs text-slate-300 mb-1">
              Descrição
            </label>
            <input
              id="create-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição curta para sua biblioteca"
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="create-code" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Code2 className="w-3.5 h-3.5 text-[#22D3EE]" />
                Código-fonte (index.html)
              </label>
              <span className="text-xs font-mono text-slate-500 uppercase">{engine}</span>
            </div>
            <textarea
              id="create-code"
              rows={14}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-white/10 bg-[#07080D] p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#3B82F6]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar na biblioteca'}
          </button>
        </div>

        <div className="xl:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white inline-flex items-center gap-2">
              <Play className="w-4 h-4 text-[#22D3EE]" />
              Execução ao vivo no estúdio
            </span>
            <button
              type="button"
              onClick={handleTestBurst}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-purple-200 border border-[#8B5CF6]/40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Testar evento de presente
            </button>
          </div>
          <GamePlayer
            ref={playerRef}
            gameId="studio-preview"
            gameName={name || 'Prévia do Estúdio'}
            bundleHtml={bundled.html}
            heightClass="h-[460px]"
          />
        </div>
      </form>
    </div>
  );
}
