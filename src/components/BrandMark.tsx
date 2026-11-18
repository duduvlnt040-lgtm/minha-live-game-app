import React from 'react';

export function BrandIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#0B0D14" />
      <rect x="2" y="2" width="60" height="60" rx="12" stroke="url(#mlg_icon_border)" strokeWidth="2.5" />
      <path
        d="M18 44V20L32 33L46 20V44"
        stroke="url(#mlg_icon_stroke)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 44L32 39L37 44"
        stroke="#06B6D4"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="mlg_icon_border" x1="2" y1="2" x2="62" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="mlg_icon_stroke" x1="18" y1="20" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandLogo({ showIcon = true, compact = false }: { showIcon?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      {showIcon && <BrandIcon className={compact ? 'w-7 h-7' : 'w-8 h-8'} />}
      <span className="font-display font-bold tracking-tight text-white text-base sm:text-lg">
        MINHA LIVE <span className="bg-gradient-to-r from-[#A78BFA] via-[#3B82F6] to-[#22D3EE] bg-clip-text text-transparent">GAMES</span>
      </span>
    </span>
  );
}

export function WatermarkBadge({
  text = 'MINHA LIVE GAMES',
  position = 'bottom-right',
  opacity = 0.72,
}: {
  text?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
}) {
  const posClasses: Record<string, string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div
      className={`pointer-events-none fixed z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-[#07080D]/80 px-3 py-1.5 ${posClasses[position] || posClasses['bottom-right']}`}
      style={{ opacity }}
    >
      <BrandIcon className="w-4 h-4" />
      <span className="font-display text-xs font-semibold tracking-wider text-slate-200 whitespace-nowrap">
        {text}
      </span>
    </div>
  );
}

export function LoadingScreen({ label = 'Carregando plataforma...' }: { label?: string }) {
  return (
    <div className="min-h-screen w-full bg-[#07080D] flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-3 rounded-2xl bg-gradient-to-tr from-[#8B5CF6]/25 via-[#3B82F6]/20 to-[#06B6D4]/25 blur-lg" />
          <BrandIcon className="relative w-14 h-14" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-white">
            MINHA LIVE <span className="text-[#22D3EE]">GAMES</span>
          </span>
          <div className="w-44 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#8B5CF6] via-[#3B82F6] to-[#06B6D4] animate-[mlg-load_1.2s_ease-in-out_infinite]" />
          </div>
          <p className="text-xs text-slate-400">{label}</p>
        </div>
      </div>
      <style>{`
        @keyframes mlg-load {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}
