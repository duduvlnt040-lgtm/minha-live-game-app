import React, { useRef, useState } from 'react';
import { FlaskConical, Plus, Power, Trash2, Zap } from 'lucide-react';
import type {
  EventRule,
  GameItem,
  LiveEventPayload,
  LiveEventType,
  RuleActionType,
  RuleOperator,
} from '../../types/platform';
import { GamePlayer } from '../GamePlayer';

interface LiveEventsSectionProps {
  games: GameItem[];
  rules: EventRule[];
  events: LiveEventPayload[];
  onCreateRule: (payload: Partial<EventRule>) => Promise<EventRule>;
  onUpdateRule: (id: string, payload: Partial<EventRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onSimulateEvent: (payload: {
    gameId: string;
    type: LiveEventType;
    senderUsername: string;
    giftName?: string;
    giftCount?: number;
    commentText?: string;
    likeCount?: number;
    points?: number;
    bonusMultiplier?: number;
  }) => Promise<LiveEventPayload>;
}

const EVENT_TYPE_LABELS: Record<LiveEventType, string> = {
  gift: 'Presente',
  like: 'Curtida',
  comment: 'Comentário',
  follow: 'Novo seguidor',
  share: 'Compartilhamento',
  gift_count: 'Quantidade de presentes',
  keyword: 'Palavra-chave no chat',
  bonus: 'Bônus',
  score: 'Pontuação',
};

const ACTION_TYPE_LABELS: Record<RuleActionType, string> = {
  trigger_animation: 'Executar animação no jogo',
  custom_command: 'Executar comando personalizado',
  add_score: 'Adicionar pontuação',
  spawn_effect: 'Gerar efeito visual',
  play_sound: 'Reproduzir efeito sonoro',
};

export function LiveEventsSection({
  games,
  rules,
  events,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onSimulateEvent,
}: LiveEventsSectionProps) {
  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleGameId, setRuleGameId] = useState('all');
  const [eventType, setEventType] = useState<LiveEventType>('gift');
  const [operator, setOperator] = useState<RuleOperator>('equals');
  const [conditionValue, setConditionValue] = useState('Rosa');
  const [actionType, setActionType] = useState<RuleActionType>('trigger_animation');
  const [actionCommand, setActionCommand] = useState('spawn_gift_burst');
  const [actionPayload, setActionPayload] = useState('{"intensidade": 1}');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  // Simulation state
  const [simGameId, setSimGameId] = useState(games[0]?.id || 'all');
  const [simType, setSimType] = useState<LiveEventType>('gift');
  const [simUser, setSimUser] = useState('espectador_live');
  const [simGiftName, setSimGiftName] = useState('Rosa');
  const [simGiftCount, setSimGiftCount] = useState(1);
  const [simComment, setSimComment] = useState('!turbo');
  const [simLikes, setSimLikes] = useState(15);
  const [simPoints, setSimPoints] = useState(100);
  const [simResultMsg, setSimResultMsg] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const playerRef = useRef<{ sendEvent: (ev: LiveEventPayload) => void; sendCommand: (cmd: unknown) => void }>(null);
  const activePreviewGame = games.find((g) => g.id === simGameId) || games[0] || null;

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleError(null);
    if (!ruleName.trim() || !actionCommand.trim()) {
      setRuleError('Informe o nome da regra e o comando de ação.');
      return;
    }
    setSavingRule(true);
    try {
      await onCreateRule({
        name: ruleName.trim(),
        gameId: ruleGameId,
        eventType,
        operator,
        conditionValue: conditionValue.trim(),
        actionType,
        actionCommand: actionCommand.trim(),
        actionPayload: actionPayload.trim(),
        enabled: true,
      });
      setRuleName('');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'Erro ao salvar regra.');
    } finally {
      setSavingRule(false);
    }
  };

  const handleTriggerSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResultMsg(null);
    try {
      const targetId = simGameId || games[0]?.id || 'all';
      const ev = await onSimulateEvent({
        gameId: targetId,
        type: simType,
        senderUsername: simUser.trim() || 'espectador_teste',
        giftName: simType === 'gift' || simType === 'gift_count' ? simGiftName : undefined,
        giftCount: simType === 'gift' || simType === 'gift_count' ? simGiftCount : undefined,
        commentText: simType === 'comment' || simType === 'keyword' ? simComment : undefined,
        likeCount: simType === 'like' ? simLikes : undefined,
        points: simType === 'score' ? simPoints : undefined,
        bonusMultiplier: simType === 'bonus' ? 2 : undefined,
      });

      playerRef.current?.sendEvent(ev);
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('mlg_events');
        ch.postMessage({ gameId: targetId, event: ev });
        ch.close();
      }
      setSimResultMsg(
        `Evento simulado enviado! ${ev.triggeredCommands.length} regra(s) acionada(s).`,
      );
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Eventos LIVE e Editor de Regras</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure gatilhos automáticos (QUANDO → AÇÃO) e teste tudo no simulador antes de conectar uma live real.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Visual Rule Editor */}
        <form
          onSubmit={handleSaveRule}
          className="xl:col-span-6 rounded-xl border border-white/10 bg-[#11131C] p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="font-display text-lg font-semibold text-white">Nova regra de automação</h2>
          </div>

          {ruleError && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {ruleError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rule-name" className="block text-xs text-slate-300 mb-1">
                Nome da regra
              </label>
              <input
                id="rule-name"
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Ex.: Chuva ao receber Rosa"
                required
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label htmlFor="rule-game" className="block text-xs text-slate-300 mb-1">
                Jogo alvo
              </label>
              <select
                id="rule-game"
                value={ruleGameId}
                onChange={(e) => setRuleGameId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                <option value="all">Todos os jogos ativos</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* QUANDO block */}
          <div className="rounded-lg border border-white/10 bg-[#07080D] p-4 space-y-3">
            <div className="text-xs font-semibold text-[#A78BFA]">QUANDO (Condição do evento)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="rule-event-type" className="block text-xs text-slate-400 mb-1">
                  Tipo de evento
                </label>
                <select
                  id="rule-event-type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as LiveEventType)}
                  className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs text-white"
                >
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rule-operator" className="block text-xs text-slate-400 mb-1">
                  Comparação
                </label>
                <select
                  id="rule-operator"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as RuleOperator)}
                  className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs text-white"
                >
                  <option value="equals">Igual a</option>
                  <option value="contains">Contém</option>
                  <option value="gte">Maior ou igual (&gt;=)</option>
                  <option value="any">Qualquer valor</option>
                </select>
              </div>

              <div>
                <label htmlFor="rule-value" className="block text-xs text-slate-400 mb-1">
                  Valor esperado
                </label>
                <input
                  id="rule-value"
                  type="text"
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  placeholder="Rosa / !turbo / 5"
                  className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* AÇÃO block */}
          <div className="rounded-lg border border-white/10 bg-[#07080D] p-4 space-y-3">
            <div className="text-xs font-semibold text-[#22D3EE]">AÇÃO (Resposta no jogo)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="rule-action-type" className="block text-xs text-slate-400 mb-1">
                  Tipo de ação
                </label>
                <select
                  id="rule-action-type"
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as RuleActionType)}
                  className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs text-white"
                >
                  {Object.entries(ACTION_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rule-command" className="block text-xs text-slate-400 mb-1">
                  Comando enviado ao SDK
                </label>
                <input
                  id="rule-command"
                  type="text"
                  value={actionCommand}
                  onChange={(e) => setActionCommand(e.target.value)}
                  placeholder="spawn_gift_burst"
                  required
                  className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs font-mono text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="rule-payload" className="block text-xs text-slate-400 mb-1">
                Parâmetros (JSON)
              </label>
              <input
                id="rule-payload"
                type="text"
                value={actionPayload}
                onChange={(e) => setActionPayload(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#11131C] px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingRule}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            {savingRule ? 'Salvando regra...' : 'Salvar regra'}
          </button>
        </form>

        {/* Simulation Mode */}
        <form
          onSubmit={handleTriggerSimulation}
          className="xl:col-span-6 rounded-xl border border-amber-500/30 bg-[#11131C] p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <h2 className="font-display text-lg font-semibold text-white">
                Simulador de eventos (MODO SIMULAÇÃO)
              </h2>
            </div>
            <span className="text-xs font-medium text-amber-300">Teste local</span>
          </div>
          <p className="text-xs text-slate-400">
            Dispara eventos simulados pelo servidor WebSocket para validar regras, histórico e overlays em tempo real sem precisar de uma live aberta.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sim-game" className="block text-xs text-slate-300 mb-1">
                Overlay / Jogo de destino
              </label>
              <select
                id="sim-game"
                value={simGameId}
                onChange={(e) => setSimGameId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                <option value="all">Todos os jogos ativos</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sim-type" className="block text-xs text-slate-300 mb-1">
                Evento a simular
              </label>
              <select
                id="sim-type"
                value={simType}
                onChange={(e) => setSimType(e.target.value as LiveEventType)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sim-user" className="block text-xs text-slate-300 mb-1">
                Usuário espectador
              </label>
              <input
                id="sim-user"
                type="text"
                value={simUser}
                onChange={(e) => setSimUser(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
              />
            </div>

            {(simType === 'gift' || simType === 'gift_count') && (
              <>
                <div>
                  <label htmlFor="sim-gift" className="block text-xs text-slate-300 mb-1">
                    Nome do presente
                  </label>
                  <input
                    id="sim-gift"
                    type="text"
                    value={simGiftName}
                    onChange={(e) => setSimGiftName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="sim-gift-count" className="block text-xs text-slate-300 mb-1">
                    Quantidade
                  </label>
                  <input
                    id="sim-gift-count"
                    type="number"
                    min={1}
                    value={simGiftCount}
                    onChange={(e) => setSimGiftCount(Number(e.target.value) || 1)}
                    className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white tabular-nums"
                  />
                </div>
              </>
            )}

            {(simType === 'comment' || simType === 'keyword') && (
              <div>
                <label htmlFor="sim-comment" className="block text-xs text-slate-300 mb-1">
                  Texto do comentário
                </label>
                <input
                  id="sim-comment"
                  type="text"
                  value={simComment}
                  onChange={(e) => setSimComment(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white"
                />
              </div>
            )}

            {simType === 'like' && (
              <div>
                <label htmlFor="sim-likes" className="block text-xs text-slate-300 mb-1">
                  Quantidade de curtidas
                </label>
                <input
                  id="sim-likes"
                  type="number"
                  min={1}
                  value={simLikes}
                  onChange={(e) => setSimLikes(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white tabular-nums"
                />
              </div>
            )}

            {simType === 'score' && (
              <div>
                <label htmlFor="sim-points" className="block text-xs text-slate-300 mb-1">
                  Pontuação
                </label>
                <input
                  id="sim-points"
                  type="number"
                  value={simPoints}
                  onChange={(e) => setSimPoints(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3 py-2 text-sm text-white tabular-nums"
                />
              </div>
            )}
          </div>

          {simResultMsg && (
            <div role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-xs text-cyan-100">
              {simResultMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={simulating}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors"
          >
            {simulating ? 'Disparando...' : 'Disparar evento simulado'}
          </button>
        </form>
      </div>

      {/* Live Preview Player if user has a game */}
      {activePreviewGame && (
        <div className="space-y-2">
          <h2 className="font-display text-base font-semibold text-white">
            Monitor ao vivo do jogo ({activePreviewGame.name})
          </h2>
          <GamePlayer
            ref={playerRef}
            gameId={activePreviewGame.id}
            gameName={activePreviewGame.name}
            bundleHtml={activePreviewGame.bundleHtml}
            active={activePreviewGame.isActive}
            heightClass="h-[340px]"
          />
        </div>
      )}

      {/* Rules List & Event History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
          <h2 className="font-display text-lg font-semibold text-white mb-4">
            Regras configuradas ({rules.length})
          </h2>
          {rules.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma regra configurada ainda.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {rules.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{r.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      QUANDO {EVENT_TYPE_LABELS[r.eventType]} ({r.operator}: {r.conditionValue || '*'}) →{' '}
                      <span className="font-mono text-cyan-300">{r.actionCommand}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onUpdateRule(r.id, { enabled: !r.enabled })}
                      aria-label={r.enabled ? `Desativar regra ${r.name}` : `Ativar regra ${r.name}`}
                      className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10"
                    >
                      <Power className={`w-3.5 h-3.5 ${r.enabled ? 'text-cyan-400' : 'text-slate-500'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteRule(r.id)}
                      aria-label={`Excluir regra ${r.name}`}
                      className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
          <h2 className="font-display text-lg font-semibold text-white mb-4">
            Histórico de eventos ({events.length})
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum evento registrado.</p>
          ) : (
            <div className="max-h-[340px] overflow-y-auto divide-y divide-white/10 pr-1">
              {events.slice(0, 30).map((ev) => (
                <div key={ev.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-slate-200 font-medium truncate">
                      @{ev.senderUsername} · {EVENT_TYPE_LABELS[ev.type]}
                      {ev.giftName ? ` (${ev.giftName} x${ev.giftCount || 1})` : ''}
                      {ev.commentText ? `: "${ev.commentText}"` : ''}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      {ev.isSimulation ? 'MODO SIMULAÇÃO' : 'LIVE REAL'} ·{' '}
                      {ev.triggeredCommands.map((c) => c.command).join(', ') || 'Sem ação correspondente'}
                    </div>
                  </div>
                  <span className="font-mono text-slate-500 tabular-nums shrink-0">
                    {new Date(ev.createdAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
