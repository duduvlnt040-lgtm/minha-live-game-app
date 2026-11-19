import React, { useState } from 'react';
import JSZip from 'jszip';
import { AlertCircle, CheckCircle2, Download, FileArchive, ImagePlus, Upload } from 'lucide-react';
import { GAME_TEMPLATES } from '../../lib/gameTemplates';
import {
  buildIsolatedHtmlBundle,
  inferMimeType,
  isTextArchiveFile,
  MAX_GAME_FILES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  validateArchiveEntryPath,
} from '../../lib/zipValidator';
import { gameArchiveStorage } from '../../services/storageAdapter';
import type { GameCategory, GameEngine, GameItem } from '../../types/platform';
import { GamePlayer } from '../GamePlayer';

interface ImportGameSectionProps {
  onCreateGame: (payload: {
    name: string;
    description: string;
    category: GameCategory;
    engine: GameEngine;
    entryFile: string;
    coverImage?: string;
    files: Record<string, string>;
  }) => Promise<GameItem>;
  onImported: () => void;
}

const CATEGORIES: GameCategory[] = [
  'Arcade',
  'Ação',
  'Interativo',
  '3D / WebGL',
  'Phaser 2D',
  'Quiz / Chat',
  'Outro',
];

export function ImportGameSection({ onCreateGame, onImported }: ImportGameSectionProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GameCategory>('Interativo');
  const [engine, setEngine] = useState<GameEngine>('html5');
  const [entryFile, setEntryFile] = useState('index.html');
  const [coverImage, setCoverImage] = useState<string | undefined>(undefined);
  const [filesMap, setFilesMap] = useState<Record<string, string>>({});
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [archiveInfo, setArchiveInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rebuildPreview = (files: Record<string, string>, entry: string) => {
    const res = buildIsolatedHtmlBundle(entry, files, window.location.origin);
    if (res.error) {
      setError(res.error);
      setPreviewHtml('');
    } else {
      setError(null);
      setPreviewHtml(res.html);
    }
  };

  const handleGamePackageUpload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setArchiveInfo(null);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        const text = await file.text();
        if (text.length > MAX_TOTAL_UNCOMPRESSED_BYTES) {
          setError('Arquivo HTML excede o limite de 25 MB.');
          return;
        }
        const entry = 'index.html';
        const nextFiles = { [entry]: text };
        setEntryFile(entry);
        setFilesMap(nextFiles);
        if (!name.trim()) setName(file.name.replace(/\.html?$/i, ''));
        setArchiveInfo(`HTML validado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        rebuildPreview(nextFiles, entry);
        return;
      }

      if (lower.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const extracted: Record<string, string> = {};
        let count = 0;
        let totalSize = 0;

        const entries = Object.values(zip.files).filter((z) => {
          if (z.dir) return false;
          const norm = z.name.replace(/\\/g, '/');
          if (
            norm.startsWith('__MACOSX/') ||
            norm.endsWith('/.DS_Store') ||
            norm === '.DS_Store' ||
            norm.endsWith('/Thumbs.db') ||
            norm === 'Thumbs.db'
          ) {
            return false;
          }
          return true;
        });
        if (entries.length === 0) {
          setError('O pacote ZIP está vazio.');
          return;
        }
        if (entries.length > MAX_GAME_FILES) {
          setError(`O pacote ZIP excede o limite de ${MAX_GAME_FILES} arquivos.`);
          return;
        }

        for (const entryObj of entries) {
          const check = validateArchiveEntryPath(entryObj.name);
          if (!check.valid) {
            setError(check.error || 'Arquivo inválido no ZIP.');
            return;
          }
          let content: string;
          if (isTextArchiveFile(entryObj.name)) {
            content = await entryObj.async('string');
          } else {
            const b64 = await entryObj.async('base64');
            const mime = inferMimeType(entryObj.name);
            content = `data:${mime};base64,${b64}`;
          }
          totalSize += content.length;
          if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
            setError('Conteúdo descompactado excede 25 MB.');
            return;
          }
          extracted[entryObj.name] = content;
          count += 1;
        }

        const htmlFiles = Object.keys(extracted).filter((k) => /\.html?$/i.test(k));
        const detectedEntry =
          extracted['index.html'] !== undefined
            ? 'index.html'
            : htmlFiles.find((k) => /(^|\/)index\.html?$/i.test(k)) || htmlFiles[0] || entryFile;

        setEntryFile(detectedEntry);
        setFilesMap(extracted);
        if (!name.trim()) setName(file.name.replace(/\.zip$/i, ''));
        setArchiveInfo(`ZIP validado com ${count} arquivo(s). Principal: ${detectedEntry}`);
        rebuildPreview(extracted, detectedEntry);
        return;
      }

      setError('Formato não suportado. Envie um arquivo .html ou pacote .zip.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
    }
  };

  const handleCoverUpload = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem de capa deve ter no máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCoverImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadSampleHtml = () => {
    const sample = GAME_TEMPLATES[0];
    const blob = new Blob([sample.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arena-presentes-modelo.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome do jogo.');
      return;
    }
    if (Object.keys(filesMap).length === 0) {
      setError('Selecione um arquivo HTML ou pacote ZIP válido antes de salvar.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreateGame({
        name: name.trim(),
        description: description.trim(),
        category,
        engine,
        entryFile,
        coverImage,
        files: filesMap,
      });

      // Save raw archive locally in IndexedDB via StorageAdapter
      try {
        await gameArchiveStorage.saveArchive({
          gameId: created.id,
          files: filesMap,
          totalSizeBytes: created.totalSizeBytes,
          updatedAt: created.updatedAt,
        });
      } catch {
        // IndexedDB optional fallback
      }

      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar jogo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Importar jogo</h1>
          <p className="text-sm text-slate-400 mt-1">
            Envie pacotes HTML ou ZIP (HTML5, Phaser 3 e Three.js) com validação de segurança e execução isolada.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSampleHtml}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-white/10 bg-[#11131C] text-slate-200 hover:bg-white/5 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-[#22D3EE]" />
          Baixar modelo HTML5 com SDK
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {archiveInfo && !error && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-sm text-cyan-100">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
          <span>{archiveInfo}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-5 rounded-xl border border-white/10 bg-[#11131C] p-6">
          <div>
            <label htmlFor="import-file" className="block text-xs font-medium text-slate-300 mb-2">
              Pacote do jogo (.html ou .zip)
            </label>
            <label
              htmlFor="import-file"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-[#07080D] p-6 text-center cursor-pointer hover:border-[#3B82F6] transition-colors"
            >
              <FileArchive className="w-7 h-7 text-[#A78BFA] mb-2" />
              <span className="text-sm font-medium text-white">Clique para selecionar HTML ou ZIP</span>
              <span className="text-xs text-slate-500 mt-1">
                Bloqueio automático de executáveis e caminhos externos
              </span>
              <input
                id="import-file"
                type="file"
                accept=".html,.htm,.zip"
                onChange={(e) => void handleGamePackageUpload(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="import-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome do jogo
              </label>
              <input
                id="import-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Roleta de Presentes"
                required
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label htmlFor="import-entry" className="block text-xs font-medium text-slate-300 mb-1.5">
                Arquivo principal
              </label>
              <input
                id="import-entry"
                type="text"
                value={entryFile}
                onChange={(e) => {
                  setEntryFile(e.target.value);
                  if (Object.keys(filesMap).length > 0) {
                    rebuildPreview(filesMap, e.target.value);
                  }
                }}
                placeholder="index.html"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm font-mono text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="import-category" className="block text-xs font-medium text-slate-300 mb-1.5">
                Categoria
              </label>
              <select
                id="import-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as GameCategory)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="import-engine" className="block text-xs font-medium text-slate-300 mb-1.5">
                Tecnologia / Engine
              </label>
              <select
                id="import-engine"
                value={engine}
                onChange={(e) => setEngine(e.target.value as GameEngine)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                <option value="html5">HTML5 / JS Padrão</option>
                <option value="phaser">Phaser 3</option>
                <option value="threejs">Three.js / WebGL</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="import-desc" className="block text-xs font-medium text-slate-300 mb-1.5">
              Descrição
            </label>
            <textarea
              id="import-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique como o jogo reage aos presentes ou comentários da live..."
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label htmlFor="import-cover" className="block text-xs font-medium text-slate-300 mb-1.5">
              Capa do jogo (opcional, máx. 2 MB)
            </label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="import-cover"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-white/10 bg-[#07080D] text-slate-200 hover:bg-white/5 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4 text-[#22D3EE]" />
                Enviar imagem de capa
              </label>
              <input
                id="import-cover"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleCoverUpload(e.target.files?.[0])}
                className="sr-only"
              />
              {coverImage && <span className="text-xs text-cyan-400">Capa carregada</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {submitting ? 'Salvando na biblioteca...' : 'Importar e salvar jogo'}
          </button>
        </div>

        {/* Live Sandbox Preview */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
            <h2 className="font-display text-base font-semibold text-white mb-1">
              Pré-visualização isolada
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              O jogo é executado em sandbox com o SDK <span className="font-mono text-slate-200">window.MinhaLiveGames</span> injetado automaticamente.
            </p>

            {previewHtml ? (
              <GamePlayer
                gameId="import-preview"
                gameName={name || 'Pré-visualização'}
                bundleHtml={previewHtml}
                heightClass="h-[380px]"
              />
            ) : (
              <div className="h-[380px] rounded-xl border border-dashed border-white/10 bg-[#07080D] flex flex-col items-center justify-center text-center p-6">
                <p className="text-sm text-slate-400">
                  Selecione um arquivo HTML ou ZIP ao lado para visualizar o jogo aqui.
                </p>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
