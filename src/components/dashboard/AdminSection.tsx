import React, { useEffect, useState } from 'react';
import { Lock, Save, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../../services/api';
import type {
  AdminOverviewStats,
  PlatformSettings,
  PlanTier,
  SubscriptionRecord,
  UserProfile,
} from '../../types/platform';

interface AdminPayload {
  stats: AdminOverviewStats;
  users: UserProfile[];
  games: Array<{
    id: string;
    userId: string;
    name: string;
    category: string;
    engine: string;
    isActive: boolean;
    totalSizeBytes: number;
    createdAt: string;
  }>;
  subscriptions: SubscriptionRecord[];
  platformSettings: PlatformSettings;
}

export function AdminSection({ currentUser }: { currentUser: UserProfile }) {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<PlatformSettings | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const loadAdmin = () => {
    apiRequest<AdminPayload>('/api/admin/overview')
      .then((res) => {
        setData(res);
        setSettingsForm(res.platformSettings);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Acesso negado.');
      });
  };

  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    loadAdmin();
  }, [currentUser.role]);

  if (currentUser.role !== 'admin') {
    return (
      <div
        data-testid="admin-access-denied"
        className="rounded-xl border border-red-500/30 bg-[#11131C] p-8 max-w-lg"
      >
        <div className="flex items-center gap-2 text-red-300 font-display text-lg font-bold mb-2">
          <Lock className="w-5 h-5" />
          Acesso restrito a administradores
        </div>
        <p className="text-sm text-slate-400">
          Esta área é validada pelo servidor e só pode ser acessada por contas com permissão administrativa atribuída no servidor (ADMIN_EMAIL ou promoção por outro administrador).
        </p>
      </div>
    );
  }

  const handleUpdateUser = async (userId: string, patch: { plan?: PlanTier; role?: 'user' | 'admin'; status?: 'active' | 'suspended' }) => {
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      loadAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    }
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setSavedNotice(null);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm),
      });
      setSavedNotice('Configurações globais da plataforma atualizadas.');
      loadAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações globais.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-[#A78BFA]" />
        <h1 className="font-display text-2xl font-bold text-white">Administração da Plataforma</h1>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {savedNotice && (
        <div role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          {savedNotice}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
              <div className="text-xs text-slate-400">Usuários cadastrados</div>
              <div className="font-display text-2xl font-bold text-white tabular-nums mt-1">{data.stats.totalUsers}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
              <div className="text-xs text-slate-400">Jogos na plataforma</div>
              <div className="font-display text-2xl font-bold text-[#22D3EE] tabular-nums mt-1">{data.stats.totalGames}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
              <div className="text-xs text-slate-400">Regras criadas</div>
              <div className="font-display text-2xl font-bold text-[#A78BFA] tabular-nums mt-1">{data.stats.totalRules}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#11131C] p-5">
              <div className="text-xs text-slate-400">Eventos registrados</div>
              <div className="font-display text-2xl font-bold text-white tabular-nums mt-1">{data.stats.totalEvents}</div>
            </div>
          </div>

          {/* Users & Permissions */}
          <div className="rounded-xl border border-white/10 bg-[#11131C] p-6 overflow-x-auto">
            <h2 className="font-display text-lg font-semibold text-white mb-4">Usuários e permissões</h2>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-white/10">
                <tr>
                  <th className="py-2 pr-4">Usuário</th>
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Plano</th>
                  <th className="py-2 pr-4">Permissão</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4 font-medium">{u.name} (@{u.username})</td>
                    <td className="py-3 pr-4 text-slate-400">{u.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Plano de ${u.username}`}
                        value={u.plan}
                        onChange={(e) => void handleUpdateUser(u.id, { plan: e.target.value as PlanTier })}
                        className="rounded border border-white/10 bg-[#07080D] px-2 py-1 text-xs"
                      >
                        <option value="free">Gratuito</option>
                        <option value="premium">Premium</option>
                        <option value="pro">Pro</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Permissão de ${u.username}`}
                        value={u.role}
                        onChange={(e) => void handleUpdateUser(u.id, { role: e.target.value as 'user' | 'admin' })}
                        className="rounded border border-white/10 bg-[#07080D] px-2 py-1 text-xs"
                      >
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Status de ${u.username}`}
                        value={u.status}
                        onChange={(e) => void handleUpdateUser(u.id, { status: e.target.value as 'active' | 'suspended' })}
                        className="rounded border border-white/10 bg-[#07080D] px-2 py-1 text-xs"
                      >
                        <option value="active">Ativo</option>
                        <option value="suspended">Suspenso</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Platform Global Settings */}
          {settingsForm && (
            <form onSubmit={handleSavePlatformSettings} className="rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-4 max-w-xl">
              <h2 className="font-display text-lg font-semibold text-white">Configurações globais</h2>
              <div>
                <label htmlFor="adm-wm" className="block text-xs text-slate-300 mb-1">
                  Texto padrão da marca-d&apos;água
                </label>
                <input
                  id="adm-wm"
                  type="text"
                  value={settingsForm.defaultWatermarkText}
                  onChange={(e) => setSettingsForm({ ...settingsForm, defaultWatermarkText: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                />
              </div>
              <label className="flex items-center justify-between text-sm text-slate-200">
                <span>Permitir novos cadastros públicos</span>
                <input
                  type="checkbox"
                  checked={settingsForm.registrationEnabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, registrationEnabled: e.target.checked })}
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB]"
              >
                <Save className="w-4 h-4" />
                Salvar configurações globais
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
