import React, { useRef, useState } from 'react';
import type { HudSnapshot } from '../game/SkyforgeEngine';
import type { Translations } from '../utils/i18n';

interface GameHudProps {
  hud: HudSnapshot;
  t: Translations;
  muted: boolean;
  isOnline: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onPause: () => void;
  onOpenHub: () => void;
  onTouchMove: (x: number, z: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onTouchAction: (action: 'attack' | 'dash' | 'nova' | 'jump') => void;
}

const COMPASS_POINTS: Array<{ label: string; rad: number; major: boolean }> = [
  { label: 'N', rad: 0, major: true },
  { label: 'NE', rad: Math.PI * 0.25, major: false },
  { label: 'E', rad: Math.PI * 0.5, major: true },
  { label: 'SE', rad: Math.PI * 0.75, major: false },
  { label: 'S', rad: Math.PI, major: true },
  { label: 'SW', rad: -Math.PI * 0.75, major: false },
  { label: 'W', rad: -Math.PI * 0.5, major: true },
  { label: 'NW', rad: -Math.PI * 0.25, major: false },
];

function wrapBearing(angle: number): number {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const SkyrimCompass: React.FC<{
  headingRad: number;
  wordWallBearingRad: number;
  enemyBearingsRad: number[];
}> = ({ headingRad, wordWallBearingRad, enemyBearingsRad }) => {
  // +/- 70 degrees visible across the translucent Nordic compass strip
  const halfFov = (70 * Math.PI) / 180;
  const toPercent = (relRad: number) => 50 + (relRad / halfFov) * 50;

  return (
    <div
      className="relative h-7 w-64 sm:w-80 overflow-hidden rounded-sm border-y border-[#c7bea6]/45 bg-gradient-to-r from-transparent via-[#0f1620]/80 to-transparent"
      aria-label="Nordic Compass"
    >
      {/* Center heading notch */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-[#e8dfca]" />

      {/* Cardinal letters & ticks */}
      {COMPASS_POINTS.map((pt) => {
        const rel = wrapBearing(pt.rad - headingRad);
        if (Math.abs(rel) > halfFov) return null;
        const left = toPercent(rel);
        return (
          <span
            key={pt.label}
            style={{ left: `${left}%` }}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-display tracking-widest ${
              pt.major
                ? 'text-xs font-bold text-[#f1ead8]'
                : 'text-[10px] font-medium text-[#b8c4d0]/80'
            }`}
          >
            {pt.label}
          </span>
        );
      })}

      {/* Nordic Word Wall Landmark Icon */}
      {Math.abs(wordWallBearingRad) <= halfFov && (
        <span
          style={{ left: `${toPercent(wordWallBearingRad)}%` }}
          title="Nordic Word Wall"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#67e8f9] drop-shadow-[0_0_5px_rgba(103,232,249,0.9)]"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 1 L13 6 L11 14 L5 14 L3 6 Z" />
          </svg>
        </span>
      )}

      {/* Live Draugr Enemy Radar Pips */}
      {enemyBearingsRad.map((rel, idx) => {
        const clamped = Math.max(-halfFov * 0.96, Math.min(halfFov * 0.96, rel));
        return (
          <span
            key={idx}
            style={{ left: `${toPercent(clamped)}%` }}
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.95)]"
          />
        );
      })}
    </div>
  );
};

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
  onToggleCamera,
  onPause,
  onOpenHub,
  onTouchMove,
  onLookDelta,
  onTouchAction,
}) => {
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const joyPointerId = useRef<number | null>(null);
  const lookPointerId = useRef<number | null>(null);
  const lastLookPos = useRef({ x: 0, y: 0 });

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
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

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerId.current = e.pointerId;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lastLookPos.current.x;
    const dy = e.clientY - lastLookPos.current.y;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    lookPointerId.current = null;
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
  const isFps = hud.cameraMode === 'fps' && hud.mode === 'solo';
  const reticleSpread = Math.round(
    5 + Math.min(12, hud.speed * 0.85) + (hud.grounded ? 0 : 7),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Subtle critical-health peripheral edge vignette */}
      {lowHp && (
        <div
          className="pointer-events-none fixed inset-0 border-[6px] border-red-500/45"
          aria-hidden="true"
        />
      )}

      {/* Mobile/Tablet Right-Half Multi-Touch FPS Look Surface */}
      {isFps && (
        <div
          onPointerDown={handleLookDown}
          onPointerMove={handleLookMove}
          onPointerUp={handleLookUp}
          onPointerCancel={handleLookUp}
          className="pointer-events-auto fixed right-0 top-20 bottom-36 w-1/2 touch-none md:hidden"
          aria-label="Touch Look Pad"
        />
      )}

      {/* Skyrim Minimalist Ivory-Silver Reticle & Hitmarker */}
      {isFps && (
        <div
          className="pointer-events-none fixed inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="relative h-14 w-14 flex items-center justify-center">
            <span className="h-1.5 w-1.5 rotate-45 bg-[#f4f1e6] shadow-[0_0_6px_rgba(241,245,249,0.9)]" />
            <span
              className="absolute h-2.5 w-0.5 bg-[#e6dec8]/85 shadow"
              style={{ transform: `translateY(-${reticleSpread + 5}px)` }}
            />
            <span
              className="absolute h-2.5 w-0.5 bg-[#e6dec8]/85 shadow"
              style={{ transform: `translateY(${reticleSpread + 5}px)` }}
            />
            <span
              className="absolute h-0.5 w-2.5 bg-[#e6dec8]/85 shadow"
              style={{ transform: `translateX(-${reticleSpread + 5}px)` }}
            />
            <span
              className="absolute h-0.5 w-2.5 bg-[#e6dec8]/85 shadow"
              style={{ transform: `translateX(${reticleSpread + 5}px)` }}
            />

            {hud.hitmarker !== 'none' && (
              <svg
                viewBox="0 0 36 36"
                className="absolute h-9 w-9"
                stroke={hud.hitmarker === 'kill' ? '#f87171' : '#f1ead8'}
                strokeWidth="2.6"
                strokeLinecap="round"
              >
                <line x1="6" y1="6" x2="13" y2="13" />
                <line x1="30" y1="6" x2="23" y2="13" />
                <line x1="6" y1="30" x2="13" y2="23" />
                <line x1="30" y1="30" x2="23" y2="23" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Top Perimeter Clusters (>= 85% center viewport stays clear) */}
      <div className="relative z-10 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-2">
          {/* Top-Left: Dragonborn Vitality & Shout Bar (+ P2 in 2P mode) */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="rounded-md border border-[#c7bea6]/45 bg-[#101722]/88 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#e6dec8]">
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
              <div className="mt-1 flex items-center gap-1.5 sm:gap-2">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#93c5fd]">
                  SHOUT
                </span>
                <div className="h-2 w-20 sm:w-36 overflow-hidden rounded-sm bg-[#0a1018] border border-[#64748b]/60">
                  <div
                    className="h-full transition-all duration-150"
                    style={{
                      width: `${hud.p1Energy}%`,
                      backgroundColor: hud.p1Energy >= 45 ? '#38bdf8' : '#94a3b8',
                    }}
                  />
                </div>
                <span className="font-mono-num text-[10px] text-[#e0f2fe]">{hud.p1Energy}%</span>
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

          {/* Top-Center (Desktop): Skyrim Rotating Nordic Compass + Score/Wave Strip */}
          <div className="hidden sm:flex flex-col items-center gap-1.5">
            {isFps && (
              <SkyrimCompass
                headingRad={hud.cameraHeadingRad}
                wordWallBearingRad={hud.wordWallBearingRad}
                enemyBearingsRad={hud.enemyBearingsRad}
              />
            )}
            <div className="flex items-center gap-5 rounded-md border border-[#c7bea6]/40 bg-[#101722]/85 px-4 py-1 shadow-lg">
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#cbd5e1]">
                  {hud.mode === 'duel2p' ? 'DUEL' : t.wave}
                </div>
                <div className="font-mono-num text-xl font-bold text-[#e6dec8] leading-tight">
                  {hud.mode === 'duel2p' ? `${hud.kills}` : `${hud.wave}/${hud.maxWaves}`}
                </div>
              </div>
              <div className="h-6 w-px bg-[#c7bea6]/30" />
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#cbd5e1]">
                  {t.score}
                </div>
                <div
                  className="font-mono-num text-xl font-bold text-[#f8fafc] leading-tight"
                  data-testid="hud-score"
                >
                  {hud.score.toLocaleString()}
                </div>
              </div>
              {hud.combo > 1 && (
                <>
                  <div className="h-6 w-px bg-[#c7bea6]/30" />
                  <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-sky-300">
                      {t.combo}
                    </div>
                    <div className="font-mono-num text-xl font-bold text-sky-300 leading-tight">
                      x{hud.combo}
                    </div>
                  </div>
                </>
              )}
            </div>

            {hud.bannerText && (
              <div className="mt-1 rounded-sm border-y border-[#e6dec8]/65 bg-[#0e1520]/90 px-5 py-1 font-display text-sm font-bold tracking-[0.22em] text-[#f1ead8] shadow-lg">
                {hud.bannerText}
              </div>
            )}
          </div>

          {/* Top-Right: Camera Toggle + Utility Controls */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {!isOnline && (
              <span className="hidden md:inline-block rounded border border-amber-400/50 bg-amber-950/90 px-2 py-1 text-[11px] font-semibold text-amber-200">
                OFFLINE
              </span>
            )}
            {hud.mode === 'solo' && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Toggle First-Person or Third-Person Camera"
                title="Camera View [V]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleCamera();
                }}
                className="flex h-9 px-2 sm:h-10 sm:px-2.5 items-center justify-center rounded-lg border border-[#c084fc]/55 bg-[#141c2b]/92 font-mono-num text-xs font-extrabold text-[#e9d5ff] hover:bg-[#223048]"
              >
                {hud.cameraMode === 'fps' ? '1P' : '3P'}
              </button>
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

        {/* Compact Mobile Wave & Score Strip */}
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

      {/* Desktop FPS Mouse-Look Hint (disappears automatically when pointer-locked) */}
      {isFps && !hud.pointerLocked && (
        <div className="hidden md:flex justify-center pb-1">
          <div className="rounded-sm border border-[#c7bea6]/40 bg-[#0e1520]/82 px-3.5 py-1 text-[11px] font-medium tracking-wide text-[#e8e3d6]/90">
            Click arena for Mouse Look · WASD Walk · Shift Sprint · Space Jump · Right-Click / E Dodge · Q/K Unrelenting Force · V Camera
          </div>
        </div>
      )}

      {/* Bottom Perimeter: Mobile Virtual Thumbstick & Action Pads (including Jump!) */}
      <div className="relative z-10 flex items-end justify-between pb-1 md:hidden">
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

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onPointerDown={() => onTouchAction('jump')}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#67e8f9]/70 bg-[#171024]/90 text-[10px] font-bold uppercase text-[#e0f2fe] active:scale-95"
            >
              Jump
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchAction('dash')}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#c084fc]/70 bg-[#171024]/90 text-[10px] font-bold uppercase text-[#f3e8ff] active:scale-95"
            >
              Dash
            </button>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onPointerDown={() => onTouchAction('nova')}
              disabled={hud.p1Energy < 45}
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-bold uppercase active:scale-95 ${
                hud.p1Energy >= 45
                  ? 'border-[#bae6fd] bg-sky-700/95 text-[#f0f9ff]'
                  : 'border-slate-600 bg-[#101722]/70 text-slate-400'
              }`}
            >
              Shout
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
    </div>
  );
};
