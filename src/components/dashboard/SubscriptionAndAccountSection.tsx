import React, { useEffect, useState } from 'react';
import { CreditCard, LogOut, Shield, UserCheck } from 'lucide-react';
import { PLANS } from '../../lib/planLimits';
import { apiRequest } from '../../services/api';
import type { PlanTier, SubscriptionRecord, UserProfile } from '../../types/platform';

interface SubscriptionData {
  currentPlan: PlanTier;
  usage: { gamesCount: number; rulesCount: number };
  history: SubscriptionRecord[];
  mercadoPago: { ready: boolean; message: string };
}

export function SubscriptionSection({ user }: { user: UserProfile }) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<SubscriptionData>('/api/subscription')
      .then(setData)
      .catch(() => {});
  }, []);

  const currentPlanDef = PLANS[user.plan];
  const gamesUsed = data?.usage.gamesCount ?? 0;
  const rulesUsed = data?.usage.rulesCount ?? 0;

  const handlePreparePlan = async (planId: PlanTier) => {
    try {
      const res = await apiRequest<{ checkout: { message: string } }>('/api/subscription/prepare-checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planId }),
      });
      setNotice(res.checkout.message);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao consultar plano.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Minha assinatura e planos</h1>
        <p className="text-sm text-slate-400 mt-1">
          Acompanhe limites de uso do seu plano atual e a estrutura preparada para comercialização via Mercado Pago.
        </p>
      </div>

      {notice && (
        <div role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-sm text-cyan-100">
          {notice}
        </div>
      )}

      {/* Current Usage */}
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="text-xs text-slate-400">Plano ativo</div>
          <div className="font-display text-2xl font-bold text-white mt-1">{currentPlanDef.name}</div>
          <div className="text-xs text-slate-400 mt-1">{currentPlanDef.audience}</div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-300 mb-2">
            <span>Jogos na biblioteca</span>
            <span className="font-mono tabular-nums">
              {gamesUsed} / {currentPlanDef.maxGames > 1000 ? 'Ilimitado' : currentPlanDef.maxGames}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6]"
              style={{ width: `${Math.min(100, (gamesUsed / Math.max(1, currentPlanDef.maxGames)) * 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-300 mb-2">
            <span>Regras de eventos LIVE</span>
            <span className="font-mono tabular-nums">
              {rulesUsed} / {currentPlanDef.maxRules > 1000 ? 'Ilimitado' : currentPlanDef.maxRules}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#06B6D4]"
              style={{ width: `${Math.min(100, (rulesUsed / Math.max(1, currentPlanDef.maxRules)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Object.values(PLANS).map((plan) => {
          const isCurrent = plan.id === user.plan;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col justify-between bg-[#11131C] ${
                isCurrent ? 'border-[#22D3EE]/60' : 'border-white/10'
              }`}
            >
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="font-display text-xl font-bold text-white">{plan.name}</h2>
                  <span className="font-mono text-base font-semibold text-[#22D3EE] tabular-nums">
                    {plan.priceMonthlyBrl === 0 ? 'Grátis' : `R$ ${plan.priceMonthlyBrl}/mês`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-5">{plan.audience}</p>
                <ul className="space-y-2.5 text-sm text-slate-300 mb-6">
                  {plan.highlights.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => void handlePreparePlan(plan.id)}
                className={`w-full py-2 px-4 rounded-lg text-xs font-semibold border transition-colors ${
                  isCurrent
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 cursor-default'
                    : 'border-white/15 bg-white/5 hover:bg-white/10 text-white'
                }`}
              >
                {isCurrent ? 'Plano atual' : 'Consultar integração Mercado Pago'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Subscription History */}
      <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-[#A78BFA]" />
          <h2 className="font-display text-lg font-semibold text-white">Histórico de assinaturas</h2>
        </div>
        {!data || data.history.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum registro encontrado.</p>
        ) : (
          <div className="divide-y divide-white/10 text-sm">
            {data.history.map((rec) => (
              <div key={rec.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-white">
                    Plano {PLANS[rec.plan].name} · {rec.status}
                  </div>
                  <div className="text-xs text-slate-400">{rec.note}</div>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {new Date(rec.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AccountSection({
  user,
  onLogout,
}: {
  user: UserProfile;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Minha conta</h1>
        <p className="text-sm text-slate-400 mt-1">
          Dados cadastrais, sessão autenticada e controle de acesso.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8B5CF6]/30 to-[#06B6D4]/30 border border-white/10 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-white">{user.name}</div>
            <div className="text-xs text-slate-400">@{user.username} · {user.email}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-400">Nível de permissão</div>
            <div className="font-medium text-white mt-0.5 inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#22D3EE]" />
              {user.role === 'admin' ? 'Administrador autorizado' : 'Usuário padrão'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Cadastro realizado em</div>
            <div className="font-mono text-white mt-0.5 tabular-nums">
              {new Date(user.createdAt).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/30"
          >
            <LogOut className="w-4 h-4" />
            Encerrar sessão
          </button>
        </div>
      </div>
    </div>
  );
}
