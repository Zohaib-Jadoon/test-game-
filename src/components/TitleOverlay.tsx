import React from 'react';
import type { GameMode } from '../game/rules';
import type { Translations } from '../utils/i18n';

interface TitleOverlayProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onStart: () => void;
  onOpenHub: (tab?: 'leaderboard' | 'forge' | 'social' | 'cloud' | 'ai' | 'docs') => void;
  t: Translations;
  bestScore: number;
  activeRigLabel: string;
  isOnline: boolean;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  mode,
  onModeChange,
  onStart,
  onOpenHub,
  t,
  bestScore,
  activeRigLabel,
  isOnline,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8 md:p-10">
      {/* Upper-left Title Lockup placed cleanly in sky negative space */}
      <div className="flex flex-col items-start gap-4 max-w-lg">
        <div className="pointer-events-auto">
          <svg
            viewBox="0 0 460 112"
            className="w-[290px] sm:w-[390px] md:w-[440px] h-auto drop-shadow-[0_6px_16px_rgba(12,18,30,0.65)]"
            role="img"
            aria-label="Skyforge Arena"
          >
            <defs>
              <linearGradient id="sfGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8e7c5" />
                <stop offset="50%" stopColor="#d4af72" />
                <stop offset="100%" stopColor="#8f6234" />
              </linearGradient>
              <linearGradient id="sfCrimson" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#881337" />
              </linearGradient>
            </defs>
            {/* Dark-Fantasy Gothic Ranger Crest */}
            <path
              d="M36 12 L64 26 L58 68 L36 90 L14 68 L8 26 Z"
              fill="#191024"
              stroke="url(#sfGold)"
              strokeWidth="3.5"
            />
            <polygon points="36,22 50,48 36,74 22,48" fill="#9f1239" opacity="0.45" />
            <polygon
              points="36,26 46,48 36,70 26,48"
              fill="none"
              stroke="#e879f9"
              strokeWidth="2.2"
            />
            <polygon points="36,36 42,48 36,60 30,48" fill="url(#sfCrimson)" />
            {/* Bespoke Display Lockup */}
            <text
              x="82"
              y="55"
              fill="url(#sfGold)"
              stroke="#120b1c"
              strokeWidth="5"
              paintOrder="stroke fill"
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="800"
              fontSize="44"
              letterSpacing="3"
            >
              SKYFORGE
            </text>
            <text
              x="84"
              y="88"
              fill="#f4e8f2"
              stroke="#120b1c"
              strokeWidth="4"
              paintOrder="stroke fill"
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="700"
              fontSize="24"
              letterSpacing="9"
            >
              ARENA
            </text>
            <line x1="84" y1="98" x2="364" y2="98" stroke="url(#sfCrimson)" strokeWidth="2.5" opacity="0.85" />
          </svg>
        </div>

        {/* Mode Selector (3 crisp gothic obsidian tabs) */}
        <div
          className="pointer-events-auto inline-flex flex-wrap gap-1.5 rounded-lg border border-[#c8a96e]/45 bg-[#171024]/92 p-1.5 shadow-xl"
          role="radiogroup"
          aria-label="Game Mode"
        >
          {(
            [
              { id: 'solo', label: t.soloMode },
              { id: 'coop2p', label: t.coopMode },
              { id: 'duel2p', label: t.duelMode },
            ] as const
          ).map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onModeChange(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[#9f1d3f] text-[#fef2f2] border border-[#f4d38c]/45'
                    : 'text-[#e5d9e8] hover:bg-[#2a1d3d]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Primary CTA + Secondary Forge/Hub Actions */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="font-display rounded-lg border-2 border-[#e8c684] bg-[#9f1d3f] px-7 py-3 text-base sm:text-lg font-extrabold tracking-wider text-[#fff7ed] shadow-[0_6px_22px_rgba(12,6,20,0.75)] transition-transform hover:scale-[1.02] hover:bg-[#b8254c] active:scale-[0.98]"
          >
            {t.startBattle}
          </button>

          <button
            type="button"
            onClick={() => onOpenHub('forge')}
            className="rounded-lg border border-[#c8a96e]/55 bg-[#171024]/92 px-4 py-3 text-xs sm:text-sm font-semibold text-[#f5e9dc] shadow-lg transition-colors hover:bg-[#2a1c3f]"
          >
            {t.blenderForge}
          </button>

          <button
            type="button"
            onClick={() => onOpenHub('leaderboard')}
            className="rounded-lg border border-[#c084fc]/45 bg-[#171024]/92 px-4 py-3 text-xs sm:text-sm font-semibold text-[#f3e8ff] shadow-lg transition-colors hover:bg-[#2a1c3f]"
          >
            {t.openHub}
          </button>
        </div>

        {/* Compact Static Pilot Summary Line */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 text-xs font-medium text-[#f4e8f2]/92">
          <span className="rounded border border-[#c8a96e]/40 bg-[#171024]/88 px-2.5 py-1 font-mono-num">
            {t.best}: {bestScore.toLocaleString()}
          </span>
          <span className="rounded border border-[#c084fc]/35 bg-[#171024]/88 px-2.5 py-1">
            Rig: {activeRigLabel}
          </span>
          {!isOnline && (
            <span className="rounded border border-amber-400/60 bg-amber-950/90 px-2.5 py-1 text-amber-200">
              Offline Ready
            </span>
          )}
        </div>
      </div>

      {/* Single flat, borderless control-hint line in bottom safe margin */}
      <div className="w-full text-center pb-1">
        <p className="text-xs sm:text-sm font-medium tracking-wide text-[#f8eff6] drop-shadow-[0_2px_6px_rgba(10,6,18,0.95)]">
          {mode === 'solo' ? t.controlsHintSolo : t.controlsHint2P}
        </p>
      </div>
    </div>
  );
};
