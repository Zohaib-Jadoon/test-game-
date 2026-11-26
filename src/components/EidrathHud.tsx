import React, { useRef, useState } from 'react';
import type { CompanionCommand, GameSettings, HudSnapshot } from '../game/types';

interface EidrathHudProps {
  hud: HudSnapshot;
  settings: GameSettings;
  onOpenMenu: (tab: 'inventory' | 'skills' | 'map' | 'journal' | 'settings') => void;
  onResume: () => void;
  onReturnToTitle: () => void;
  onRespawn: () => void;
  onCompanionCommand: (cmd: CompanionCommand) => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchAction: (
    action:
      | 'light'
      | 'heavy'
      | 'dodge'
      | 'block'
      | 'release_block'
      | 'interact'
      | 'lock'
      | 'ability1'
      | 'ability2'
      | 'ability3'
      | 'potion'
      | 'ascension',
  ) => void;
}

function normalizeAngleDiff(rad: number): number {
  let d = ((rad + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const EidrathHud: React.FC<EidrathHudProps> = ({
  hud,
  settings,
  onOpenMenu,
  onResume,
  onReturnToTitle,
  onRespawn,
  onCompanionCommand,
  onTouchMove,
  onTouchLook,
  onTouchAction,
}) => {
  const [showTouchPad, setShowTouchPad] = useState(
    () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );
  const joyRef = useRef<HTMLDivElement | null>(null);
  const lookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const cardinals: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: Math.PI / 2 },
    { label: 'S', angle: Math.PI },
    { label: 'W', angle: -Math.PI / 2 },
  ];

  const handleJoyMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = joyRef.current?.getBoundingClientRect();
    const t = e.touches[0];
    if (!rect || !t) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.max(-1, Math.min(1, (t.clientX - cx) / (rect.width * 0.42)));
    const dy = Math.max(-1, Math.min(1, (cy - t.clientY) / (rect.height * 0.42)));
    onTouchMove(dx, dy);
  };

  // Subtle auto-dimming during peaceful wilderness traversal for maximum immersion
  const vitalsOpacity = hud.inCombat || hud.boss ? 'opacity-100' : 'opacity-82 hover:opacity-100 transition-opacity';

  const oathPct = hud.ascensionRemainingSec > 0 ? (hud.ascensionRemainingSec / 12) * 100 : hud.divineMeter;
  const oathStroke = 2 * Math.PI * 18;
  const oathOffset = oathStroke * (1 - Math.max(0, Math.min(100, oathPct)) / 100);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Subtle Parry / Damage Screen Vignettes */}
      {hud.damageFlashSec > 0 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 110px rgba(143,45,41,0.75)',
            opacity: Math.min(1, hud.damageFlashSec * 3),
          }}
        />
      )}
      {hud.parryFlashSec > 0 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 85px rgba(127,168,196,0.72)',
            opacity: Math.min(1, hud.parryFlashSec * 2.5),
          }}
        />
      )}

      {/* Minimal Skyrim-Inspired Top Engraved Compass + Combat Cues */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 w-[min(90vw,410px)]">
        <div className="relative w-full h-7 border-y border-[#b89552]/55 bg-gradient-to-r from-transparent via-[#10141a]/88 to-transparent overflow-hidden flex items-center justify-center">
          {cardinals.map((c) => {
            const diff = normalizeAngleDiff(c.angle - hud.cameraHeadingRad);
            if (Math.abs(diff) > 1.35) return null;
            const leftPct = 50 + (diff / 1.35) * 46;
            return (
              <span
                key={c.label}
                className="font-display absolute text-xs font-bold tracking-widest text-[#e4dcc8]"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              >
                {c.label}
              </span>
            );
          })}

          {hud.waypointBearingRad !== null &&
            (() => {
              const diff = normalizeAngleDiff(hud.waypointBearingRad - hud.cameraHeadingRad);
              const clamped = Math.max(-1.3, Math.min(1.3, diff));
              const leftPct = 50 + (clamped / 1.35) * 46;
              return (
                <div
                  className="absolute flex items-center gap-1 text-[#7fa8c4]"
                  style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
                  title={hud.waypointLabel ?? 'Objective'}
                >
                  <span className="inline-block w-2.5 h-2.5 rotate-45 bg-[#dfc38a] border border-[#11151b]" />
                  {hud.waypointDistanceM !== null && (
                    <span className="text-[10px] font-mono-num text-[#efe4c8] bg-[#0e1217]/85 px-1">
                      {hud.waypointDistanceM}m
                    </span>
                  )}
                </div>
              );
            })()}

          {hud.enemyBlips.map((blip) => {
            const diff = normalizeAngleDiff(blip.bearingRad - hud.cameraHeadingRad);
            if (Math.abs(diff) > 1.35) return null;
            const leftPct = 50 + (diff / 1.35) * 46;
            return (
              <span
                key={blip.id}
                className={`absolute bottom-1 rounded-full ${
                  blip.isBoss
                    ? 'w-2.5 h-2.5 bg-[#dfc38a] border border-[#11151b]'
                    : blip.alerted
                      ? 'w-2 h-2 bg-[#c24b45]'
                      : 'w-1.5 h-1.5 bg-[#7b8694]'
                }`}
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              />
            );
          })}
        </div>

        {hud.stealthEyePct > 5 && !hud.boss && (
          <div className="px-3 py-0.5 text-[10px] uppercase tracking-[0.22em] border border-[#b89552]/35 bg-[#10141a]/82 text-[#e4dcc8]">
            {hud.stealthState === 'detected'
              ? '▲ DETECTED'
              : hud.stealthState === 'caution'
                ? `◈ CAUTION (${hud.stealthEyePct}%)`
                : '◇ HIDDEN'}
          </div>
        )}

        {hud.incomingCue !== 'none' && (
          <div
            className={`mt-14 sm:mt-0 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.18em] border ${
              hud.incomingCue === 'parryable'
                ? settings.highContrastCues
                  ? 'border-[#FFD466] bg-[#0d1014] text-[#FFD466]'
                  : 'border-[#b89552] bg-[#141920]/95 text-[#dfc38a]'
                : settings.highContrastCues
                  ? 'border-[#FF5555] bg-[#0d1014] text-[#FF5555]'
                  : 'border-[#8f2d29] bg-[#241112]/95 text-[#f0b4ae]'
            }`}
          >
            {hud.incomingCue === 'parryable'
              ? '◆ PARRYABLE STRIKE [Q]'
              : '✖ UNBLOCKABLE — DODGE [SPACE]'}
          </div>
        )}
      </div>

      {/* Top-Left Minimal Region & Menu Triggers */}
      <div className={`absolute top-12 sm:top-3 left-3 flex flex-col gap-1.5 pointer-events-auto ${vitalsOpacity}`}>
        <div className="px-3 py-1.5 border-l-2 border-[#b89552] bg-gradient-to-r from-[#11151b]/88 to-transparent text-xs text-[#efe4c8]">
          <div className="font-display font-semibold tracking-wider text-xs">{hud.regionLabel}</div>
          <div className="text-[10px] text-[#dfc38a] flex items-center gap-2 mt-0.5 font-mono-num">
            <span>Lv.{hud.level}</span>
            <span>·</span>
            <span>{hud.gold}g</span>
            {settings.developerMode && (
              <>
                <span>·</span>
                <span className="text-[#7fa8c4]">
                  {hud.fps} FPS · {hud.drawCalls} DC
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onOpenMenu('inventory')}
            className="eid-btn-ghost px-2 py-0.5 text-[10px] uppercase tracking-wider"
          >
            [I] Gear
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('skills')}
            className="hidden sm:inline-block eid-btn-ghost px-2 py-0.5 text-[10px] uppercase tracking-wider"
          >
            [K] Skills{hud.skillPoints > 0 ? ` (${hud.skillPoints})` : ''}
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('map')}
            className="hidden sm:inline-block eid-btn-ghost px-2 py-0.5 text-[10px] uppercase tracking-wider"
          >
            [M] Map
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('journal')}
            className="hidden sm:inline-block eid-btn-ghost px-2 py-0.5 text-[10px] uppercase tracking-wider"
          >
            [J] Quests
          </button>
          <button
            type="button"
            onClick={() => setShowTouchPad((v) => !v)}
            className="eid-btn-ghost px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#dfc38a]"
          >
            {showTouchPad ? 'Hide Touch' : 'Touch'}
          </button>
        </div>
      </div>

      {/* Top-Right Minimal Active Objective */}
      {hud.trackedQuestTitle && (
        <div
          className={`hidden sm:block absolute top-3 right-3 max-w-xs border-r-2 border-[#b89552] bg-gradient-to-l from-[#11151b]/88 to-transparent px-3.5 py-2 text-right ${vitalsOpacity}`}
        >
          <div className="font-display text-xs uppercase tracking-[0.16em] text-[#dfc38a] font-semibold">
            {hud.trackedQuestTitle}
          </div>
          {hud.trackedObjectiveText && (
            <div className="text-xs text-[#e4dcc8]/88 mt-0.5 leading-snug">{hud.trackedObjectiveText}</div>
          )}
        </div>
      )}

      {/* Mountain Warden Boss Bar — Engraved Iron & Phase Crack Markers */}
      {hud.boss && (
        <div className="eid-panel absolute top-32 sm:top-20 left-1/2 -translate-x-1/2 w-[min(92vw,540px)] px-4 py-2.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <div>
              <span className="font-display text-sm sm:text-base font-bold uppercase tracking-[0.2em] text-[#efe4c8]">
                {hud.boss.name}
              </span>
              <span className="ml-2 text-xs text-[#dfc38a]">
                Phase {hud.boss.phase} · {hud.boss.subtitle}
              </span>
            </div>
            <span className="text-xs font-mono-num text-[#e4dcc8]/80">
              {hud.boss.hp} / {hud.boss.maxHp}
            </span>
          </div>
          <div className="eid-meter-track h-3 w-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#6c211e] via-[#9e332e] to-[#c44d47] transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (hud.boss.hp / hud.boss.maxHp) * 100))}%` }}
            />
            <span className="absolute top-0 bottom-0 left-[33%] w-px bg-[#b89552]/80" />
            <span className="absolute top-0 bottom-0 left-[66%] w-px bg-[#b89552]/80" />
          </div>
          {hud.boss.phase === 2 && (
            <div className="text-[11px] text-[#7fa8c4] mt-1.5 flex items-center justify-between">
              <span>Seal Stones Protecting Armor: {hud.boss.sealStonesRemaining} / 2</span>
              <span>Shatter courtyard Seal Stones to break armor</span>
            </div>
          )}
        </div>
      )}

      {/* Lock-On Target Frame */}
      {hud.lockedTargetName && !hud.boss && (
        <div className="eid-panel absolute top-16 left-1/2 -translate-x-1/2 w-56 px-3 py-1.5">
          <div className="flex justify-between text-xs text-[#efe4c8]">
            <span>{hud.lockedTargetName}</span>
            <span className="text-[#dfc38a] font-mono-num">{hud.lockedTargetHpPct}%</span>
          </div>
          <div className="eid-meter-track h-1.5 mt-1">
            <div className="h-full bg-[#9e332e]" style={{ width: `${hud.lockedTargetHpPct}%` }} />
          </div>
          <div className="eid-meter-track h-1 mt-0.5">
            <div className="h-full bg-[#b89552]" style={{ width: `${hud.lockedTargetPoisePct}%` }} />
          </div>
        </div>
      )}

      {/* Region Discovery Banner & Notification Toast */}
      {hud.landmarkBanner && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 text-center px-8 py-2 bg-gradient-to-r from-transparent via-[#0f141a]/92 to-transparent">
          <div className="font-display text-lg sm:text-2xl tracking-[0.24em] uppercase text-[#efe4c8] drop-shadow">
            {hud.landmarkBanner}
          </div>
          <div className="eid-divider w-44 mx-auto mt-1" />
        </div>
      )}

      {hud.notificationText && (
        <div className="eid-panel absolute top-44 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs sm:text-sm text-[#efe4c8]">
          {hud.notificationText}
        </div>
      )}

      {/* Contextual Interact Prompt */}
      {hud.interactPrompt && hud.mode === 'playing' && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={() => onTouchAction('interact')}
            className="eid-panel flex items-center gap-3 px-4 py-2 text-left hover:border-[#dfc38a]"
          >
            <span className="px-2 py-0.5 bg-[#b89552] text-[#0c0f13] font-mono-num text-xs font-bold">
              {settings.bindings.interact.replace('Key', '')}
            </span>
            <div>
              <div className="text-xs sm:text-sm text-[#efe4c8] font-semibold">{hud.interactPrompt.label}</div>
              {hud.interactPrompt.sublabel && (
                <div className="text-[11px] text-[#e4dcc8]/65">{hud.interactPrompt.sublabel}</div>
              )}
            </div>
          </button>
        </div>
      )}

      {hud.subtitleText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-xl px-5 py-1.5 bg-[#0c0f14]/88 border-y border-[#b89552]/30 text-center text-xs sm:text-sm text-[#efe4c8]">
          {hud.subtitleText}
        </div>
      )}

      {/* Bottom-Left Engraved Vitals + Circular Divine Oath Sigil + Companion */}
      <div className={`absolute bottom-3 left-3 w-52 sm:w-80 space-y-1.5 pointer-events-auto ${vitalsOpacity}`}>
        {hud.companionName && (
          <div className="border-l-2 border-[#7fa8c4] bg-[#10141a]/82 px-2.5 py-1.5 mb-1">
            <div className="flex items-center justify-between text-[11px] text-[#e4dcc8]">
              <span className="text-[#bdd8ea] font-semibold">Companion: {hud.companionName}</span>
              <span className="uppercase text-[10px] text-[#dfc38a]">{hud.companionCommand}</span>
            </div>
            <div className="flex gap-1 mt-1">
              {(['assist', 'attack', 'regroup', 'wait'] as CompanionCommand[]).map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => onCompanionCommand(cmd)}
                  className={`flex-1 py-0.5 text-[10px] uppercase border ${
                    hud.companionCommand === cmd
                      ? 'border-[#7fa8c4] bg-[#7fa8c4]/20 text-[#efe4c8]'
                      : 'border-[#b89552]/25 text-[#e4dcc8]/65 hover:border-[#dfc38a]'
                  }`}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="eid-panel p-2.5 flex items-center gap-3">
          {/* Circular Divine Oath Sigil */}
          <button
            type="button"
            onClick={() => onTouchAction('ascension')}
            title="Divine Oath [R]"
            className="relative w-11 h-11 shrink-0 flex items-center justify-center"
          >
            <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="#0d1117" stroke="rgba(184,149,82,0.28)" strokeWidth="3" />
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke={hud.divineMeter >= 100 || hud.ascensionRemainingSec > 0 ? '#dfc38a' : '#7fa8c4'}
                strokeWidth="3"
                strokeDasharray={oathStroke}
                strokeDashoffset={oathOffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute font-mono-num text-[10px] font-bold text-[#efe4c8]">
              {hud.ascensionRemainingSec > 0 ? `${Math.ceil(hud.ascensionRemainingSec)}` : `${hud.divineMeter}%`}
            </span>
          </button>

          {/* Tapered Crimson / Emerald / Cobalt Bars */}
          <div className="flex-1 space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#e4dcc8]/80">
                <span>Health</span>
                <span className="font-mono-num">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
              <div className="eid-meter-track h-2 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#6d201d] to-[#b5453f] transition-all duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#e4dcc8]/80">
                <span>Stamina</span>
                <span className="font-mono-num">
                  {hud.stamina}/{hud.maxStamina}
                </span>
              </div>
              <div className="eid-meter-track h-1.5 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#2c5b41] to-[#4e9970] transition-all duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.stamina / Math.max(1, hud.maxStamina)) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#e4dcc8]/80">
                <span>Mana</span>
                <span className="font-mono-num">
                  {hud.mana}/{hud.maxMana}
                </span>
              </div>
              <div className="eid-meter-track h-1.5 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#345978] to-[#7fa8c4] transition-all duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, (hud.mana / Math.max(1, hud.maxMana)) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-Right Equipped Weapon & Runic Quick Slots */}
      <div className={`absolute bottom-4 right-4 pointer-events-auto hidden sm:flex flex-col items-end gap-1.5 ${vitalsOpacity}`}>
        <div className="px-3 py-1 border-r-2 border-[#b89552] bg-gradient-to-l from-[#10141a]/88 to-transparent text-xs text-[#efe4c8]">
          <span className="text-[#b89552] mr-1.5">Weapon:</span>
          {hud.equippedWeaponName}
        </div>
        <div className="flex gap-1.5">
          {[
            { act: 'ability1' as const, key: '[1]', label: 'Rime', cd: hud.abilityCooldowns[0] },
            { act: 'ability2' as const, key: '[2]', label: 'Cinder', cd: hud.abilityCooldowns[1] },
            { act: 'ability3' as const, key: '[3]', label: 'OathWave', cd: hud.abilityCooldowns[2] },
          ].map((ab) => (
            <button
              key={ab.act}
              type="button"
              onClick={() => onTouchAction(ab.act)}
              className="eid-btn-ghost w-16 p-1.5 text-center"
            >
              <div className="text-[10px] text-[#dfc38a] font-mono-num">{ab.key}</div>
              <div className="text-[10px] text-[#efe4c8] truncate">{ab.label}</div>
              {ab.cd > 0 && <div className="text-[10px] text-[#7fa8c4] font-mono-num">{ab.cd}s</div>}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTouchAction('potion')}
            className="eid-btn-ghost w-16 p-1.5 text-center border-[#8f2d29]/80"
          >
            <div className="text-[10px] text-[#dfc38a] font-mono-num">[4]</div>
            <div className="text-[10px] text-[#efe4c8]">Heal ×{hud.potionCount}</div>
          </button>
        </div>
        {!hud.pointerLocked && hud.mode === 'playing' && (
          <div className="text-[10px] text-[#e4dcc8]/65 bg-[#0e1217]/80 px-2 py-0.5 border border-[#b89552]/25">
            Click viewport to lock mouse · Right-drag look · [V] Shoulder · [Esc] Pause
          </div>
        )}
      </div>

      {/* Responsive Mobile / Touch Controls */}
      {showTouchPad && hud.mode === 'playing' && (
        <>
          <div
            ref={joyRef}
            onTouchStart={handleJoyMove}
            onTouchMove={handleJoyMove}
            onTouchEnd={() => onTouchMove(0, 0)}
            className="pointer-events-auto fixed bottom-60 left-4 w-24 h-24 rounded-full border-2 border-[#b89552]/70 bg-[#11151b]/70 flex items-center justify-center touch-none"
          >
            <div className="w-9 h-9 rounded-full border border-[#dfc38a]/70 bg-[#b89552]/40" />
          </div>

          <div
            onTouchStart={(e) => {
              const t = e.changedTouches[0];
              if (t) lookTouchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              const cur = lookTouchRef.current;
              if (!cur) return;
              for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === cur.id) {
                  onTouchLook(t.clientX - cur.x, t.clientY - cur.y);
                  cur.x = t.clientX;
                  cur.y = t.clientY;
                }
              }
            }}
            onTouchEnd={() => {
              lookTouchRef.current = null;
            }}
            className="pointer-events-auto fixed top-36 right-0 w-1/2 h-1/3 touch-none"
          />

          <div className="pointer-events-auto fixed bottom-5 right-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onTouchStart={() => onTouchAction('light')}
              onClick={() => onTouchAction('light')}
              className="w-13 h-13 rounded-full border border-[#b89552] bg-[#131820]/90 text-[10px] text-[#efe4c8] font-bold"
            >
              ATK
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('heavy')}
              onClick={() => onTouchAction('heavy')}
              className="w-13 h-13 rounded-full border border-[#8f2d29] bg-[#131820]/90 text-[10px] text-[#efe4c8] font-bold"
            >
              HEAVY
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('block')}
              onTouchEnd={() => onTouchAction('release_block')}
              onClick={() => onTouchAction('block')}
              className="w-13 h-13 rounded-full border border-[#7fa8c4] bg-[#131820]/90 text-[10px] text-[#efe4c8]"
            >
              PARRY
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('dodge')}
              onClick={() => onTouchAction('dodge')}
              className="w-13 h-13 rounded-full border border-[#b89552]/50 bg-[#131820]/90 text-[10px] text-[#efe4c8]"
            >
              DODGE
            </button>
          </div>
        </>
      )}

      {/* Pause Overlay */}
      {hud.mode === 'paused' && (
        <div className="fixed inset-0 z-40 pointer-events-auto bg-[#090c10]/80 flex items-center justify-center p-4">
          <div className="eid-panel w-full max-w-sm p-6 space-y-3 text-center">
            <h2 className="font-display text-2xl uppercase tracking-[0.22em] text-[#efe4c8]">Paused</h2>
            <p className="text-xs text-[#dfc38a]">{hud.regionLabel}</p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={onResume}
                className="eid-btn-primary w-full py-2.5 text-sm uppercase tracking-widest"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => onOpenMenu('inventory')}
                className="eid-btn-ghost w-full py-2 text-xs uppercase tracking-widest"
              >
                Character & Codex
              </button>
              <button
                type="button"
                onClick={() => onOpenMenu('settings')}
                className="eid-btn-ghost w-full py-2 text-xs uppercase tracking-widest"
              >
                Save & Settings
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full py-2 border border-[#8f2d29]/80 hover:bg-[#8f2d29]/25 text-xs uppercase tracking-widest text-[#e4dcc8]"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Death Overlay */}
      {hud.mode === 'dead' && (
        <div className="fixed inset-0 z-40 pointer-events-auto bg-[#12090a]/88 flex items-center justify-center p-4">
          <div className="eid-panel w-full max-w-md border-[#8f2d29] p-7 text-center space-y-4">
            <h2 className="font-display text-3xl uppercase tracking-[0.26em] text-[#c4534c]">Oath Broken</h2>
            <p className="text-sm text-[#e4dcc8]/80">
              Kaelen falls in the snow, yet the Forgotten One’s mark pulls him back to the last safe hearth. Quest
              progress is preserved.
            </p>
            <button
              type="button"
              onClick={onRespawn}
              className="eid-btn-primary w-full py-3 text-sm uppercase tracking-[0.22em] font-display"
            >
              Rise at Last Checkpoint
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
