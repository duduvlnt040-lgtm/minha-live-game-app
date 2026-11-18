import React, { useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../services/api';
import type { GameEngine, OverlayConfig, UserProfile } from '../../types/platform';

interface SettingsSectionProps {
  user: UserProfile;
}

type SettingsTab =
  | 'perfil'
  | 'conta'
  | 'preferencias'
  | 'audio'
  | 'aparencia'
  | 'jogos'
  | 'overlay'
  | 'integracoes'
  | 'seguranca';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'conta', label: 'Conta' },
  { id: 'preferencias', label: 'Preferências' },
  { id: 'audio', label: 'Áudio' },
  { id: 'aparencia', label: 'Aparência' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'seguranca', label: 'Segurança' },
];

export function SettingsSection({ user }: SettingsSectionProps) {
  const { updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('perfil');
  const [name, setName] = useState(user.name);
  const [settings, setSettings] = useState(user.settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      await updateProfile({ name: name.trim(), settings });
      setFeedback('Configurações salvas com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/account/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-slate-400 mt-1">
          Personalize sua conta, áudio padrão, aparência, comportamento dos jogos e overlay.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveTab(t.id);
              setFeedback(null);
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[#3B82F6]/20 text-cyan-300 border border-[#3B82F6]/40'
                : 'text-slate-400 hover:text-white bg-[#11131C] border border-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {activeTab === 'seguranca' ? (
        <form onSubmit={handlePasswordChange} className="max-w-lg rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-white">Alterar senha</h2>
          <div>
            <label htmlFor="sec-cur" className="block text-xs text-slate-300 mb-1">
              Senha atual
            </label>
            <input
              id="sec-cur"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="sec-new" className="block text-xs text-slate-300 mb-1">
              Nova senha (mínimo 8 caracteres)
            </label>
            <input
              id="sec-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="sec-conf" className="block text-xs text-slate-300 mb-1">
              Confirmar nova senha
            </label>
            <input
              id="sec-conf"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB]"
          >
            <Save className="w-4 h-4" />
            Atualizar senha
          </button>
        </form>
      ) : (
        <form onSubmit={handleSaveSettings} className="max-w-2xl rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-5">
          {activeTab === 'perfil' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Perfil do criador</h2>
              <div>
                <label htmlFor="cfg-name" className="block text-xs text-slate-300 mb-1.5">
                  Nome completo
                </label>
                <input
                  id="cfg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="cfg-username" className="block text-xs text-slate-300 mb-1.5">
                  Nome de usuário
                </label>
                <input
                  id="cfg-username"
                  type="text"
                  value={user.username}
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-[#07080D]/60 px-3 py-2 text-sm text-slate-400"
                />
              </div>
            </div>
          )}

          {activeTab === 'conta' && (
            <div className="space-y-3 text-sm">
              <h2 className="font-display text-lg font-semibold text-white">Informações da conta</h2>
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-slate-400">E-mail cadastrado</span>
                <span className="text-white">{user.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-slate-400">Plano atual</span>
                <span className="text-cyan-400 uppercase font-mono">{user.plan}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Permissão</span>
                <span className="text-white uppercase font-mono">{user.role}</span>
              </div>
            </div>
          )}

          {activeTab === 'preferencias' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Preferências gerais</h2>
              <div>
                <label htmlFor="cfg-lang" className="block text-xs text-slate-300 mb-1.5">
                  Idioma da interface
                </label>
                <select
                  id="cfg-lang"
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value as 'pt-BR' | 'en-US' })}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Áudio dos jogos</h2>
              <div>
                <label htmlFor="cfg-vol" className="block text-xs text-slate-300 mb-1.5">
                  Volume padrão ({settings.masterVolume}%)
                </label>
                <input
                  id="cfg-vol"
                  type="range"
                  min={0}
                  max={100}
                  value={settings.masterVolume}
                  onChange={(e) => setSettings({ ...settings, masterVolume: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <label className="flex items-center justify-between text-sm text-slate-200">
                <span>Silenciar áudio automaticamente ao abrir player</span>
                <input
                  type="checkbox"
                  checked={settings.muteAllAudio}
                  onChange={(e) => setSettings({ ...settings, muteAllAudio: e.target.checked })}
                />
              </label>
            </div>
          )}

          {activeTab === 'aparencia' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Aparência do painel</h2>
              <div>
                <label htmlFor="cfg-accent" className="block text-xs text-slate-300 mb-1.5">
                  Destaque visual preferido
                </label>
                <select
                  id="cfg-accent"
                  value={settings.themeAccent}
                  onChange={(e) =>
                    setSettings({ ...settings, themeAccent: e.target.value as 'violet' | 'blue' | 'cyan' })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="violet">Roxo Neon</option>
                  <option value="blue">Azul Elétrico</option>
                  <option value="cyan">Ciano</option>
                </select>
              </div>
              <label className="flex items-center justify-between text-sm text-slate-200">
                <span>Reduzir animações da interface</span>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => setSettings({ ...settings, reduceMotion: e.target.checked })}
                />
              </label>
            </div>
          )}

          {activeTab === 'jogos' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Configurações padrão dos jogos</h2>
              <div>
                <label htmlFor="cfg-engine" className="block text-xs text-slate-300 mb-1.5">
                  Engine padrão na importação
                </label>
                <select
                  id="cfg-engine"
                  value={settings.defaultEngine}
                  onChange={(e) => setSettings({ ...settings, defaultEngine: e.target.value as GameEngine })}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="html5">HTML5</option>
                  <option value="phaser">Phaser 3</option>
                  <option value="threejs">Three.js</option>
                </select>
              </div>
              <label className="flex items-center justify-between text-sm text-slate-200">
                <span>Pausar execução quando aba estiver oculta</span>
                <input
                  type="checkbox"
                  checked={settings.autoPauseOnHide}
                  onChange={(e) => setSettings({ ...settings, autoPauseOnHide: e.target.checked })}
                />
              </label>
            </div>
          )}

          {activeTab === 'overlay' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Padrão para novos overlays</h2>
              <div>
                <label htmlFor="cfg-ov-bg" className="block text-xs text-slate-300 mb-1.5">
                  Fundo padrão
                </label>
                <select
                  id="cfg-ov-bg"
                  value={settings.defaultOverlay.backgroundMode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultOverlay: {
                        ...settings.defaultOverlay,
                        backgroundMode: e.target.value as OverlayConfig['backgroundMode'],
                      },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                >
                  <option value="transparent">Transparente</option>
                  <option value="obsidian">Escuro (#07080D)</option>
                  <option value="chroma-green">Chroma Key Verde</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'integracoes' && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">Preferências de integração</h2>
              <div>
                <label htmlFor="cfg-tt" className="block text-xs text-slate-300 mb-1.5">
                  Usuário TikTok padrão
                </label>
                <input
                  id="cfg-tt"
                  type="text"
                  value={settings.tiktokUsername}
                  onChange={(e) => setSettings({ ...settings, tiktokUsername: e.target.value })}
                  placeholder="@seu_usuario"
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                />
              </div>
              <label className="flex items-center justify-between text-sm text-slate-200">
                <span>Tentar reconexão automática no relay quando configurado</span>
                <input
                  type="checkbox"
                  checked={settings.autoReconnectRelay}
                  onChange={(e) => setSettings({ ...settings, autoReconnectRelay: e.target.checked })}
                />
              </label>
            </div>
          )}

          {activeTab !== 'conta' && (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
