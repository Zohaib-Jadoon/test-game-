import React from 'react';
import type { HudSnapshot } from '../game/SkyforgeEngine';
import type { Translations } from '../utils/i18n';

interface StatusModalsProps {
  hud: HudSnapshot;
  bestScore: number;
  t: Translations;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
  onOpenHub: (tab?: 'leaderboard' | 'ai' | 'cloud') => void;
}

export const StatusModals: React.FC<StatusModalsProps> = ({
  hud,
  bestScore,
  t,
  onResume,
  onRestart,
  onTitle,
  onOpenHub,
}) => {
  if (hud.phase === 'playing' || hud.phase === 'title') return null;

  const isPaused = hud.phase === 'paused';
  const isVictory = hud.phase === 'victory';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#0b1019]/78 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isPaused ? t.paused : isVictory ? t.victory : t.defeat}
    >
      <div className="w-full max-w-md rounded-xl border-2 border-[#c9933c]/70 bg-[#151e2e] p-6 text-[#f4ede2] shadow-2xl">
        <div className="text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-wider text-[#f4d38c]">
            {isPaused ? t.paused : isVictory ? t.victory : t.defeat}
          </h2>
          {hud.winnerLabel && !isPaused && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[#67e8f9]">
              {hud.winnerLabel}
            </p>
          )}
        </div>

        {/* 3 crisp tabular-nums stat tiles */}
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-[#c9933c]/35 bg-[#0f1624] p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
              {t.score}
            </div>
            <div className="mt-0.5 font-mono-num text-xl font-bold text-[#f8fafc]">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-[#c9933c]/35 bg-[#0f1624] p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
              {t.best}
            </div>
            <div className="mt-0.5 font-mono-num text-xl font-bold text-[#f4d38c]">
              {Math.max(bestScore, hud.score).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-[#c9933c]/35 bg-[#0f1624] p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
              {t.wave} / {t.kills}
            </div>
            <div className="mt-0.5 font-mono-num text-xl font-bold text-[#67e8f9]">
              {hud.wave} · {hud.kills}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="font-display w-full rounded-lg border border-[#f7d894] bg-[#c9933c] py-3 text-sm font-extrabold tracking-wider text-[#111622] hover:bg-[#dfb058]"
            >
              {t.resume}
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="font-display w-full rounded-lg border border-[#f7d894] bg-[#c9933c] py-3 text-sm font-extrabold tracking-wider text-[#111622] hover:bg-[#dfb058]"
            >
              {isVictory ? t.playAgain : t.tryAgain}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPaused ? (
              <button
                type="button"
                onClick={onRestart}
                className="rounded-lg border border-[#c9933c]/45 bg-[#1e2a40] py-2.5 text-xs font-semibold text-[#f4ede2] hover:bg-[#273652]"
              >
                {t.restart}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenHub('ai')}
                className="rounded-lg border border-[#67e8f9]/45 bg-[#1e2a40] py-2.5 text-xs font-semibold text-[#bae6fd] hover:bg-[#273652]"
              >
                {t.tabAi}
              </button>
            )}
            <button
              type="button"
              onClick={onTitle}
              className="rounded-lg border border-slate-600 bg-[#101724] py-2.5 text-xs font-semibold text-slate-300 hover:bg-[#1b263b]"
            >
              {t.returnTitle}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
