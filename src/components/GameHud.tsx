import React, { useRef, useState } from 'react';
import type { HudSnapshot } from '../game/SkyforgeEngine';
import type { Translations } from '../utils/i18n';

interface GameHudProps {
  hud: HudSnapshot;
  t: Translations;
  muted: boolean;
  isOnline: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenHub: () => void;
  onTouchMove: (x: number, z: number) => void;
  onTouchAction: (action: 'attack' | 'dash' | 'nova') => void;
}

const VitalitySocket: React.FC<{ filled: boolean; critical?: boolean }> = ({
  filled,
  critical,
}) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true">
    <path
      d="M12 2 L20 7 L18 18 L12 22 L6 18 L4 7 Z"
      fill={filled ? (critical ? '#ef4444' : '#be123c') : '#1a1226'}
      stroke={filled ? '#e8c684' : '#645475'}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {filled && (
      <polygon points="12,5 16,9 12,17 8,9" fill="#fda4af" opacity="0.5" />
    )}
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  t,
  muted,
  isOnline,
  onToggleMute,
  onPause,
  onOpenHub,
  onTouchMove,
  onTouchAction,
}) => {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const joyPointerId = useRef<number | null>(null);

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    joyPointerId.current = e.pointerId;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    joyPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onTouchMove(0, 0);
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxR);
    const nx = dist > 2 ? (dx / dist) * (clampedDist / maxR) : 0;
    const ny = dist > 2 ? (dy / dist) * (clampedDist / maxR) : 0;
    setKnobOffset({ x: nx * maxR, y: ny * maxR });
    onTouchMove(nx, ny);
  };

  const lowHp = hud.p1Hp <= 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Subtle critical-health peripheral edge vignette */}
      {lowHp && (
        <div
          className="pointer-events-none fixed inset-0 border-[6px] border-red-500/45"
          aria-hidden="true"
        />
      )}

      {/* Top Perimeter Clusters (>= 85% center viewport stays completely clear) */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-2">
          {/* Top-Left: P1 Vitality Sockets + Energy Bar (+ P2 in 2P mode) */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="rounded-lg border border-[#c8a96e]/50 bg-[#171024]/92 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e8c684]">
                  P1
                </span>
                <div
                  className="flex items-center gap-0.5 sm:gap-1"
                  aria-label={`Player 1 Health ${hud.p1Hp} of ${hud.p1MaxHp}`}
                >
                  {Array.from({ length: hud.p1MaxHp }).map((_, idx) => (
                    <VitalitySocket key={idx} filled={idx < hud.p1Hp} critical={lowHp} />
                  ))}
                </div>
              </div>
              {/* Nova Energy Meter */}
              <div className="mt-1 flex items-center gap-1.5 sm:gap-2">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#c4b5d6]">
                  NOVA
                </span>
                <div className="h-2 w-20 sm:w-36 overflow-hidden rounded-sm bg-[#0d0816] border border-[#4c3763]">
                  <div
                    className="h-full transition-all duration-150"
                    style={{
                      width: `${hud.p1Energy}%`,
                      backgroundColor: hud.p1Energy >= 45 ? '#c084fc' : '#e11d48',
                    }}
                  />
                </div>
                <span className="font-mono-num text-[10px] text-[#f3e8ff]">{hud.p1Energy}%</span>
              </div>
            </div>

            {hud.p2Active && (
              <div className="rounded-lg border border-orange-400/55 bg-[#1e1518]/92 px-2.5 py-1.5 shadow-lg">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orange-300">
                    P2
                  </span>
                  <div
                    className="flex items-center gap-0.5 sm:gap-1"
                    aria-label={`Player 2 Health ${hud.p2Hp} of ${hud.p2MaxHp}`}
                  >
                    {Array.from({ length: hud.p2MaxHp }).map((_, idx) => (
                      <VitalitySocket key={idx} filled={idx < hud.p2Hp} critical={hud.p2Hp <= 1} />
                    ))}
                  </div>
                  {hud.mode === 'duel2p' && (
                    <span className="ml-1 font-mono-num text-xs font-bold text-orange-200">
                      {hud.p2Score} KO
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Top-Center (Desktop): Score / Wave / Combo Hero Numerals */}
          <div className="hidden sm:flex flex-col items-center">
            <div className="flex items-center gap-5 rounded-lg border border-[#c9933c]/45 bg-[#141c2b]/92 px-4 py-1.5 shadow-lg">
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#cbd5e1]">
                  {hud.mode === 'duel2p' ? 'DUEL' : t.wave}
                </div>
                <div className="font-mono-num text-2xl font-bold text-[#f4d38c] leading-tight">
                  {hud.mode === 'duel2p' ? `${hud.kills}` : `${hud.wave}/${hud.maxWaves}`}
                </div>
              </div>
              <div className="h-7 w-px bg-[#c9933c]/30" />
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#cbd5e1]">
                  {t.score}
                </div>
                <div
                  className="font-mono-num text-2xl font-bold text-[#f8fafc] leading-tight"
                  data-testid="hud-score"
                >
                  {hud.score.toLocaleString()}
                </div>
              </div>
              {hud.combo > 1 && (
                <>
                  <div className="h-7 w-px bg-[#c9933c]/30" />
                  <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                      {t.combo}
                    </div>
                    <div className="font-mono-num text-2xl font-bold text-amber-400 leading-tight">
                      x{hud.combo}
                    </div>
                  </div>
                </>
              )}
            </div>

            {hud.bannerText && (
              <div className="mt-2 rounded-md border border-[#f4d38c]/60 bg-[#141c2b]/95 px-4 py-1 font-display text-sm font-bold tracking-widest text-[#f4d38c] shadow-lg">
                {hud.bannerText}
              </div>
            )}
          </div>

          {/* Top-Right: Compact Square Utility Controls (always visible on mobile & desktop) */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {!isOnline && (
              <span className="hidden md:inline-block rounded border border-amber-400/50 bg-amber-950/90 px-2 py-1 text-[11px] font-semibold text-amber-200">
                OFFLINE
              </span>
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title="Mute [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-[#c9933c]/50 bg-[#141c2b]/92 text-[#f4ede2] hover:bg-[#223048]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {muted ? (
                  <path d="M22 9l-6 6M16 9l6 6" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open Citadel Hub"
              title="Citadel Hub"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenHub();
              }}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-[#67e8f9]/45 bg-[#141c2b]/92 text-[#bae6fd] hover:bg-[#223048]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game"
              title="Pause [P]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-[#c9933c]/50 bg-[#141c2b]/92 text-[#f4d38c] hover:bg-[#223048]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Compact Mobile Wave & Score Strip (never clips utility buttons!) */}
        <div className="flex sm:hidden items-center justify-between rounded-lg border border-[#c9933c]/40 bg-[#141c2b]/90 px-3 py-1 shadow-md">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">{t.wave}</span>
            <span className="font-mono-num font-bold text-[#f4d38c]">
              {hud.wave}/{hud.maxWaves}
            </span>
          </div>
          {hud.bannerText && (
            <span className="font-display text-[11px] font-bold tracking-wider text-[#f4d38c]">
              {hud.bannerText}
            </span>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-[#cbd5e1]">{t.score}</span>
            <span className="font-mono-num font-bold text-[#f8fafc]">
              {hud.score.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Perimeter: Mobile Virtual Thumbstick & Action Pads (visible on mobile/tablet) */}
      <div className="flex items-end justify-between pb-1 md:hidden">
        <div
          ref={joyBaseRef}
          onPointerDown={handleJoyDown}
          onPointerMove={handleJoyMove}
          onPointerUp={handleJoyUp}
          onPointerCancel={handleJoyUp}
          className="pointer-events-auto relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#c9933c]/60 bg-[#141c2b]/75 touch-none"
          aria-label="Virtual Movement Stick"
        >
          <div
            className="h-11 w-11 rounded-full border-2 border-[#f4d38c] bg-[#c9933c]/85 shadow-md"
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>

        <div className="pointer-events-auto flex items-end gap-2.5">
          <button
            type="button"
            onPointerDown={() => onTouchAction('dash')}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#c084fc]/70 bg-[#171024]/90 text-xs font-bold uppercase text-[#f3e8ff] active:scale-95"
          >
            Dash
          </button>
          <button
            type="button"
            onPointerDown={() => onTouchAction('nova')}
            disabled={hud.p1Energy < 45}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-bold uppercase active:scale-95 ${
              hud.p1Energy >= 45
                ? 'border-[#e8c684] bg-purple-700/95 text-[#fff7ed]'
                : 'border-slate-600 bg-[#171024]/70 text-slate-400'
            }`}
          >
            Nova
          </button>
          <button
            type="button"
            onPointerDown={() => onTouchAction('attack')}
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#e8c684] bg-[#9f1d3f] text-xs font-extrabold uppercase text-[#fff7ed] shadow-lg active:scale-95"
          >
            Volley
          </button>
        </div>
      </div>
    </div>
  );
};
