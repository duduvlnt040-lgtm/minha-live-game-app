import React, { useState } from 'react';
import { ArrowRight, ChevronDown, Code2, Layers, Radio, ShieldCheck, Sliders, Tv } from 'lucide-react';
import { BrandLogo } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { PLANS } from '../lib/planLimits';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

const FAQ_ITEMS = [
  {
    q: 'A biblioteca vem com jogos prontos ou começa vazia?',
    a: 'Sua biblioteca começa 100% vazia para que você tenha controle total. Você pode importar seus próprios arquivos HTML ou pacotes ZIP (incluindo Phaser e Three.js) ou criar um jogo do zero no estúdio integrado.',
  },
  {
    q: 'Como funciona o overlay no OBS Studio e TikTok LIVE Studio?',
    a: 'Cada jogo cadastrado gera um link exclusivo (/overlay/ID-DO-JOGO). Basta adicionar esse endereço como Fonte de Navegador (Browser Source) no OBS ou no TikTok LIVE Studio para exibir o jogo em tela cheia com fundo configurável.',
  },
  {
    q: 'Posso testar as regras de presentes e comentários antes de abrir uma live real?',
    a: 'Sim. A aba Eventos LIVE inclui um Simulador de Eventos claramente identificado como Modo Simulação, permitindo disparar presentes, curtidas, comentários, palavras-chave e pontuação para validar suas regras antes de transmitir.',
  },
  {
    q: 'Como funciona a segurança dos jogos importados?',
    a: 'Todos os arquivos HTML e ZIP passam por validação contra travessia de diretórios e extensões perigosas, e são executados dentro de um sandbox isolado (iframe sem acesso à sessão ou credenciais da sua conta).',
  },
  {
    q: 'Como configuro o Firebase e publico na Vercel?',
    a: 'O projeto inclui .env.example, vercel.json e um guia passo a passo no README.md para configurar suas variáveis de ambiente e publicar diretamente na Vercel sem cobrança obrigatória.',
  },
];

export function LandingPage({ onNavigate }: LandingPageProps) {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [featureImgFailed, setFeatureImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#07080D] text-[#F1F5F9]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07080D]/90 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2 sm:gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="whitespace-nowrap shrink-0"
          >
            <BrandLogo />
          </a>

          <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#recursos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Como funciona
            </a>
            <a href="#planos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Planos
            </a>
            <a href="#duvidas" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] via-[#3B82F6] to-[#06B6D4] text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
              >
                Abrir painel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/cadastro')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
                >
                  Criar conta
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="max-w-[1280px] mx-auto px-6 pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium tracking-wider uppercase text-[#22D3EE] mb-4">
                Plataforma para criadores · TikTok LIVE &amp; OBS Studio
              </p>
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.08] mb-6"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Administre, importe e execute jogos interativos em tempo real nas suas lives.
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-[60ch] mb-8">
                A MINHA LIVE GAMES reúne biblioteca isolada para jogos HTML5, Phaser e Three.js, editor visual de regras para presentes e comentários, e links exclusivos de overlay prontos para OBS e TikTok LIVE Studio.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/dashboard' : '/cadastro')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] via-[#3B82F6] to-[#06B6D4] text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
                >
                  {user ? 'Ir para o painel' : 'Começar gratuitamente'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                {user ? (
                  <a
                    href="#planos"
                    className="px-5 py-3 rounded-lg text-sm font-medium border border-white/15 text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                  >
                    Ver planos
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="px-5 py-3 rounded-lg text-sm font-medium border border-white/15 text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                  >
                    Já tenho conta
                  </button>
                )}
              </div>

              <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-6">
                <div>
                  <div className="font-display text-lg font-bold text-white">HTML5 · ZIP</div>
                  <div className="text-xs text-slate-400 mt-1">Importação validada e isolada</div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-white">Phaser &amp; Three.js</div>
                  <div className="text-xs text-slate-400 mt-1">Compatibilidade 2D e WebGL 3D</div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-white">/overlay/ID</div>
                  <div className="text-xs text-slate-400 mt-1">WebSocket em tempo real</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full rounded-2xl border border-white/10 bg-[#11131C] overflow-hidden min-h-[320px]">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_live_studio_1795021412603.jpg"
                    alt="Estúdio de transmissão ao vivo executando jogo interativo em tela ultrawide"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#11131C] to-[#1A1F33] p-8">
                    <Tv className="w-12 h-12 text-[#3B82F6]" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080D]/80 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-200">
                    <span className="font-semibold text-white">Execução isolada em tempo real</span>
                    <span className="mx-2 text-slate-500">·</span>
                    <span>OBS Browser Source &amp; TikTok LIVE Studio</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Recursos (Bento Grid) */}
        <section id="recursos" className="border-t border-white/10 bg-[#0B0D14]/60 py-20">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
                Infraestrutura completa para jogos interativos ao vivo
              </h2>
              <p className="text-slate-300 text-base">
                Cada módulo foi estruturado para separar o painel administrativo, o armazenamento seguro dos arquivos e a exibição limpa no overlay da transmissão.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#11131C] overflow-hidden flex flex-col">
                <div className="aspect-[16/9] w-full bg-[#07080D] overflow-hidden">
                  {!featureImgFailed ? (
                    <img
                      src="/src/assets/images/feature_overlay_preview_1795021413901.jpg"
                      alt="Pré-visualização de overlay interativo em smartphone e monitor de transmissão"
                      referrerPolicy="no-referrer"
                      onError={() => setFeatureImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#11131C]">
                      <Radio className="w-10 h-10 text-[#22D3EE]" />
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl font-semibold text-white mb-2">
                    Overlay independente com link exclusivo
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Abra <span className="font-mono text-cyan-300">/overlay/ID-DO-JOGO</span> fora do painel administrativo. Configure transparência de fundo, escala, notificações visuais e posição da marca-d&apos;água MINHA LIVE GAMES diretamente pelo dashboard.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-1 gap-6">
                <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                  <Code2 className="w-5 h-5 text-[#A78BFA] mb-3" />
                  <h3 className="font-display text-lg font-semibold text-white mb-2">
                    Biblioteca vazia sob seu controle
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Importe arquivos HTML individuais ou pacotes ZIP completos com validação de caminhos, bloqueio de executáveis e injeção automática do SDK <span className="font-mono text-xs text-slate-200">window.MinhaLiveGames</span>.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                  <Sliders className="w-5 h-5 text-[#3B82F6] mb-3" />
                  <h3 className="font-display text-lg font-semibold text-white mb-2">
                    Editor visual de regras e eventos LIVE
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Associe presentes, curtidas, comentários, palavras-chave, seguidores, compartilhamentos e bônus a animações ou comandos customizados dentro do jogo, com histórico persistente e modo de simulação.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                  <ShieldCheck className="w-5 h-5 text-[#22D3EE] mb-3" />
                  <h3 className="font-display text-lg font-semibold text-white mb-2">
                    Execução em sandbox e arquitetura desacoplada
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Jogos rodam isolados sem acesso às credenciais da sua conta, enquanto o provedor TikTok LIVE fica separado em adaptador próprio para troca futura sem retrabalho.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="py-20 border-t border-white/10">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
                Fluxo direto do upload até a transmissão ao vivo
              </h2>
              <p className="text-slate-300 text-base">
                Três etapas objetivas para colocar um jogo interativo no ar com segurança e previsibilidade.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                <div className="text-xs font-mono text-[#A78BFA] mb-3">01. Importação ou criação</div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  Suba seu HTML/ZIP ou crie no estúdio
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Envie jogos HTML5, Phaser 3 ou Three.js com capa e categoria, ou utilize o editor integrado para construir sua primeira cena interativa.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                <div className="text-xs font-mono text-[#3B82F6] mb-3">02. Regras e simulação</div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  Defina gatilhos e valide no simulador
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Crie condições como presente específico, quantidade mínima ou palavra-chave no chat e dispare eventos simulados para confirmar a reação do jogo.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#11131C] p-6">
                <div className="text-xs font-mono text-[#22D3EE] mb-3">03. Transmissão ao vivo</div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  Cole o link de overlay no OBS
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Copie a URL exclusiva do jogo e adicione no OBS Studio ou TikTok LIVE Studio. O canal WebSocket entrega cada evento sem recarregar a página.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefícios + Creator Spotlight */}
        <section className="py-20 border-t border-white/10 bg-[#0B0D14]/60">
          <div className="max-w-[1280px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-[#11131C] p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#181B26] border border-white/10 shrink-0">
                    {!avatarImgFailed ? (
                      <img
                        src="/src/assets/images/avatar_creator_studio_1795021413853.jpg"
                        alt="Criadora de conteúdo em estúdio de live"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarImgFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Layers className="w-6 h-6 text-[#A78BFA]" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-display font-semibold text-white">Controle total para criadores e devs</div>
                    <div className="text-xs text-slate-400 mt-0.5">Painel único · Sem dependência de scripts soltos</div>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Em vez de editar arquivos HTML manualmente antes de cada live, centralize seus jogos, acompanhe eventos em tempo real e ajuste áudio, overlay e regras em segundos.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="border-t border-white/10 pt-4">
                <h3 className="font-display font-semibold text-white mb-1.5">Player padronizado</h3>
                <p className="text-sm text-slate-400">
                  Controles de iniciar, pausar, reiniciar, áudio e tela cheia sincronizados com o jogo via postMessage.
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <h3 className="font-display font-semibold text-white mb-1.5">Armazenamento local prioritário</h3>
                <p className="text-sm text-slate-400">
                  Pacotes mantidos localmente sem exigir serviços pagos na primeira versão, com interface pronta para storage remoto.
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <h3 className="font-display font-semibold text-white mb-1.5">Transparência na integração</h3>
                <p className="text-sm text-slate-400">
                  Status real de conexão TikTok LIVE sem simular conexões inexistentes e documentação clara de provedores.
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <h3 className="font-display font-semibold text-white mb-1.5">Pronto para publicar na Vercel</h3>
                <p className="text-sm text-slate-400">
                  Estrutura modular em React, TypeScript, Tailwind CSS e Node.js com .env.example e README completo.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Planos */}
        <section id="planos" className="py-20 border-t border-white/10">
          <div className="max-w-[1280px] mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
                Planos estruturados por escala de transmissão
              </h2>
              <p className="text-slate-300 text-base">
                Comece no plano gratuito sem cartão de crédito. Os planos pagos ficam preparados para a etapa comercial com Mercado Pago.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.values(PLANS).map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-6 flex flex-col justify-between bg-[#11131C] ${
                    plan.id === 'premium' ? 'border-[#3B82F6]/60' : 'border-white/10'
                  }`}
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                      <span className="font-mono text-lg font-semibold text-[#22D3EE] tabular-nums">
                        {plan.priceMonthlyBrl === 0 ? 'R$ 0/mês' : `R$ ${plan.priceMonthlyBrl}/mês`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-6">{plan.audience}</p>
                    <ul className="space-y-3 text-sm text-slate-300 mb-8">
                      {plan.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2">
                          <span className="text-[#22D3EE] mt-0.5" aria-hidden="true">·</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate(user ? '/dashboard' : '/cadastro')}
                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                      plan.id === 'premium'
                        ? 'bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95'
                        : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                    }`}
                  >
                    {plan.id === 'free' ? 'Criar conta gratuita' : 'Selecionar na conta'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Perguntas frequentes */}
        <section id="duvidas" className="py-20 border-t border-white/10 bg-[#0B0D14]/60">
          <div className="max-w-[900px] mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-8">
              Perguntas frequentes
            </h2>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q} className="py-4">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 text-left py-1 text-base font-medium text-white hover:text-[#22D3EE] transition-colors"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm text-slate-300 leading-relaxed pr-8">
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-10">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <BrandLogo compact />
          <p>MINHA LIVE GAMES — Plataforma profissional para jogos interativos em transmissões ao vivo.</p>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => onNavigate('/login')} className="hover:text-white transition-colors">
              Login
            </button>
            <button type="button" onClick={() => onNavigate('/cadastro')} className="hover:text-white transition-colors">
              Cadastro
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
