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

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Subtle Parry / Damage Vignette Cues */}
      {hud.damageFlashSec > 0 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity"
          style={{
            boxShadow: 'inset 0 0 90px rgba(125,56,52,0.72)',
            opacity: Math.min(1, hud.damageFlashSec * 3),
          }}
        />
      )}
      {hud.parryFlashSec > 0 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity"
          style={{
            boxShadow: 'inset 0 0 70px rgba(109,156,182,0.65)',
            opacity: Math.min(1, hud.parryFlashSec * 2.5),
          }}
        />
      )}

      {/* Top Compass Strip & Stealth Eye */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-[min(90vw,390px)]">
        <div className="relative w-full h-7 sm:h-8 border border-[#9C7848]/60 bg-[#1B2024]/82 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#9C7848]/70 to-transparent" />
          {cardinals.map((c) => {
            const diff = normalizeAngleDiff(c.angle - hud.cameraHeadingRad);
            if (Math.abs(diff) > 1.35) return null;
            const leftPct = 50 + (diff / 1.35) * 46;
            return (
              <span
                key={c.label}
                className="absolute text-xs font-bold tracking-widest text-[#D9D1BE]"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)', fontFamily: "'Cinzel', Georgia, serif" }}
              >
                {c.label}
              </span>
            );
          })}

          {hud.waypointBearingRad !== null && (
            (() => {
              const diff = normalizeAngleDiff(hud.waypointBearingRad - hud.cameraHeadingRad);
              const clamped = Math.max(-1.3, Math.min(1.3, diff));
              const leftPct = 50 + (clamped / 1.35) * 46;
              return (
                <div
                  className="absolute flex items-center gap-1 text-[#6D9CB6]"
                  style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
                  title={hud.waypointLabel ?? 'Objective'}
                >
                  <span className="inline-block w-2.5 h-2.5 rotate-45 bg-[#6D9CB6] border border-[#D9D1BE]" />
                  {hud.waypointDistanceM !== null && (
                    <span className="text-[10px] font-mono text-[#D9D1BE] bg-[#1B2024]/90 px-1">
                      {hud.waypointDistanceM}m
                    </span>
                  )}
                </div>
              );
            })()
          )}

          {hud.enemyBlips.map((blip) => {
            const diff = normalizeAngleDiff(blip.bearingRad - hud.cameraHeadingRad);
            if (Math.abs(diff) > 1.35) return null;
            const leftPct = 50 + (diff / 1.35) * 46;
            return (
              <span
                key={blip.id}
                className={`absolute bottom-1 rounded-full ${
                  blip.isBoss
                    ? 'w-2.5 h-2.5 bg-[#9C7848] border border-[#D9D1BE]'
                    : blip.alerted
                      ? 'w-2 h-2 bg-[#B84A42]'
                      : 'w-1.5 h-1.5 bg-[#68717A]'
                }`}
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              />
            );
          })}
        </div>

        {/* Stealth Awareness Indicator */}
        {hud.stealthEyePct > 5 && !hud.boss && (
          <div className="px-3 py-0.5 text-[11px] uppercase tracking-widest border border-[#68717A]/50 bg-[#1B2024]/85 text-[#D9D1BE]">
            {hud.stealthState === 'detected'
              ? '▲ DETECTED'
              : hud.stealthState === 'caution'
                ? `◈ CAUTION (${hud.stealthEyePct}%)`
                : '◇ HIDDEN'}
          </div>
        )}

        {/* Incoming Combat Cue (Color + Shape Independent) */}
        {hud.incomingCue !== 'none' && (
          <div
            className={`px-3.5 py-1 text-xs font-bold uppercase tracking-[0.18em] border-2 ${
              hud.incomingCue === 'parryable'
                ? settings.highContrastCues
                  ? 'border-[#FFD466] bg-[#1B2024] text-[#FFD466]'
                  : 'border-[#9C7848] bg-[#22272B]/95 text-[#E8C98A]'
                : settings.highContrastCues
                  ? 'border-[#FF5555] bg-[#1B2024] text-[#FF5555]'
                  : 'border-[#A63D37] bg-[#2E1918]/95 text-[#F2B8B5]'
            }`}
          >
            {hud.incomingCue === 'parryable'
              ? '◆ PARRYABLE STRIKE [Q]'
              : '✖ UNBLOCKABLE — DODGE [SPACE]'}
          </div>
        )}
      </div>

      {/* Top-Left Region + Controls Toggle (stacked cleanly below compass on narrow mobile viewports) */}
      <div className="absolute top-12 sm:top-3 left-3 flex flex-col gap-1 pointer-events-auto">
        <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 border border-[#68717A]/40 bg-[#1B2024]/82 text-[11px] sm:text-xs text-[#D9D1BE]">
          <div className="font-semibold tracking-wider" style={{ fontFamily: "'Cinzel', Georgia, serif" }}>
            {hud.regionLabel}
          </div>
          <div className="text-[10px] text-[#9C7848] flex items-center gap-2 mt-0.5 font-mono">
            <span>Lv.{hud.level}</span>
            <span>·</span>
            <span>{hud.gold}g</span>
            <span>·</span>
            <span>{hud.fps} FPS</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onOpenMenu('inventory')}
            className="px-2 py-1 text-[10px] uppercase tracking-wider border border-[#68717A]/40 bg-[#1B2024]/85 text-[#D9D1BE] hover:border-[#9C7848]"
          >
            [I] Gear
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('skills')}
            className="hidden sm:inline-block px-2 py-1 text-[10px] uppercase tracking-wider border border-[#68717A]/40 bg-[#1B2024]/85 text-[#D9D1BE] hover:border-[#9C7848]"
          >
            [K] Skills{hud.skillPoints > 0 ? ` (${hud.skillPoints})` : ''}
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('map')}
            className="hidden sm:inline-block px-2 py-1 text-[10px] uppercase tracking-wider border border-[#68717A]/40 bg-[#1B2024]/85 text-[#D9D1BE] hover:border-[#9C7848]"
          >
            [M] Map
          </button>
          <button
            type="button"
            onClick={() => onOpenMenu('journal')}
            className="hidden sm:inline-block px-2 py-1 text-[10px] uppercase tracking-wider border border-[#68717A]/40 bg-[#1B2024]/85 text-[#D9D1BE] hover:border-[#9C7848]"
          >
            [J] Quests
          </button>
          <button
            type="button"
            onClick={() => setShowTouchPad((v) => !v)}
            className="px-2 py-1 text-[10px] uppercase tracking-wider border border-[#68717A]/40 bg-[#1B2024]/85 text-[#9C7848] hover:border-[#9C7848]"
          >
            {showTouchPad ? 'Hide Touch' : 'Touch'}
          </button>
        </div>
      </div>

      {/* Top-Right Active Quest Tracker */}
      {hud.trackedQuestTitle && (
        <div className="hidden sm:block absolute top-3 right-3 max-w-xs border-r-2 border-[#9C7848] bg-[#1B2024]/82 px-3.5 py-2 text-right">
          <div
            className="text-xs uppercase tracking-[0.16em] text-[#9C7848] font-semibold"
            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
          >
            {hud.trackedQuestTitle}
          </div>
          {hud.trackedObjectiveText && (
            <div className="text-xs text-[#D9D1BE]/90 mt-0.5 leading-snug">{hud.trackedObjectiveText}</div>
          )}
        </div>
      )}

      {/* Boss Bar — The Mountain Warden */}
      {hud.boss && (
        <div className="absolute top-32 sm:top-20 left-1/2 -translate-x-1/2 w-[min(92vw,520px)] border border-[#9C7848]/80 bg-[#181C20]/90 px-3.5 sm:px-4 py-2">
          <div className="flex items-baseline justify-between mb-1">
            <div>
              <span
                className="text-sm sm:text-base font-bold uppercase tracking-[0.18em] text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                {hud.boss.name}
              </span>
              <span className="ml-2 text-xs text-[#9C7848]">
                Phase {hud.boss.phase} · {hud.boss.subtitle}
              </span>
            </div>
            <span className="text-xs font-mono text-[#D9D1BE]/80">
              {hud.boss.hp} / {hud.boss.maxHp}
            </span>
          </div>
          <div className="h-3 w-full bg-[#2B3036] border border-[#68717A]/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#7D3834] to-[#B04B44] transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (hud.boss.hp / hud.boss.maxHp) * 100))}%` }}
            />
          </div>
          {hud.boss.phase === 2 && (
            <div className="text-[11px] text-[#6D9CB6] mt-1 flex items-center justify-between">
              <span>Seal Stones Protecting Armor: {hud.boss.sealStonesRemaining} / 2</span>
              <span>Shatter courtyard Seal Stones to break armor</span>
            </div>
          )}
        </div>
      )}

      {/* Target Lock-On Indicator */}
      {hud.lockedTargetName && !hud.boss && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-56 border border-[#68717A]/70 bg-[#1B2024]/88 px-3 py-1.5">
          <div className="flex justify-between text-xs text-[#D9D1BE]">
            <span>{hud.lockedTargetName}</span>
            <span className="text-[#9C7848]">{hud.lockedTargetHpPct}%</span>
          </div>
          <div className="h-2 bg-[#2B3036] mt-1">
            <div className="h-full bg-[#7D3834]" style={{ width: `${hud.lockedTargetHpPct}%` }} />
          </div>
          <div className="h-1 bg-[#2B3036] mt-0.5">
            <div className="h-full bg-[#9C7848]" style={{ width: `${hud.lockedTargetPoisePct}%` }} />
          </div>
        </div>
      )}

      {/* Discovery Banner & Notification Toast */}
      {hud.landmarkBanner && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 text-center px-6 py-2 bg-gradient-to-r from-transparent via-[#1B2024]/92 to-transparent">
          <div
            className="text-lg sm:text-2xl tracking-[0.22em] uppercase text-[#D9D1BE]"
            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
          >
            {hud.landmarkBanner}
          </div>
          <div className="h-px w-40 mx-auto bg-gradient-to-r from-transparent via-[#9C7848] to-transparent mt-1" />
        </div>
      )}

      {hud.notificationText && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 px-4 py-1.5 border border-[#9C7848]/60 bg-[#1B2024]/92 text-xs sm:text-sm text-[#D9D1BE]">
          {hud.notificationText}
        </div>
      )}

      {/* Contextual Interaction Prompt */}
      {hud.interactPrompt && hud.mode === 'playing' && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={() => onTouchAction('interact')}
            className="flex items-center gap-3 px-4 py-2 border border-[#9C7848] bg-[#1B2024]/92 hover:bg-[#272E34] text-left"
          >
            <span className="px-2 py-0.5 bg-[#9C7848] text-[#171B1E] font-mono text-xs font-bold">
              {settings.bindings.interact.replace('Key', '')}
            </span>
            <div>
              <div className="text-xs sm:text-sm text-[#D9D1BE] font-semibold">{hud.interactPrompt.label}</div>
              {hud.interactPrompt.sublabel && (
                <div className="text-[11px] text-[#D9D1BE]/65">{hud.interactPrompt.sublabel}</div>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Subtitles */}
      {hud.subtitleText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-xl px-4 py-1.5 bg-[#14171A]/88 border border-[#68717A]/35 text-center text-xs sm:text-sm text-[#D9D1BE]">
          {hud.subtitleText}
        </div>
      )}

      {/* Bottom-Left: Health / Stamina / Mana / Divine Ascension + Companion */}
      <div className="absolute bottom-3 left-3 w-48 sm:w-72 space-y-1.5 pointer-events-auto">
        {hud.companionName && (
          <div className="border border-[#68717A]/50 bg-[#1B2024]/82 px-2.5 py-1.5 mb-2">
            <div className="flex items-center justify-between text-[11px] text-[#D9D1BE]">
              <span className="text-[#6D9CB6] font-semibold">Companion: {hud.companionName}</span>
              <span className="uppercase text-[10px] text-[#9C7848]">{hud.companionCommand}</span>
            </div>
            <div className="flex gap-1 mt-1">
              {(['assist', 'attack', 'regroup', 'wait'] as CompanionCommand[]).map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => onCompanionCommand(cmd)}
                  className={`flex-1 py-0.5 text-[10px] uppercase border ${
                    hud.companionCommand === cmd
                      ? 'border-[#6D9CB6] bg-[#6D9CB6]/25 text-[#D9D1BE]'
                      : 'border-[#68717A]/35 text-[#D9D1BE]/65 hover:border-[#9C7848]'
                  }`}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border border-[#68717A]/55 bg-[#1B2024]/86 p-2.5 space-y-1.5">
          {/* Health */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#D9D1BE]/80">
              <span>Health</span>
              <span className="font-mono">
                {hud.hp}/{hud.maxHp}
              </span>
            </div>
            <div className="h-2.5 bg-[#2A2F35] overflow-hidden mt-0.5">
              <div
                className="h-full bg-[#7D3834] transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100))}%` }}
              />
            </div>
          </div>

          {/* Stamina */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#D9D1BE]/80">
              <span>Stamina</span>
              <span className="font-mono">
                {hud.stamina}/{hud.maxStamina}
              </span>
            </div>
            <div className="h-2 bg-[#2A2F35] overflow-hidden mt-0.5">
              <div
                className="h-full bg-[#9C7848] transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, (hud.stamina / Math.max(1, hud.maxStamina)) * 100))}%` }}
              />
            </div>
          </div>

          {/* Mana */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#D9D1BE]/80">
              <span>Mana</span>
              <span className="font-mono">
                {hud.mana}/{hud.maxMana}
              </span>
            </div>
            <div className="h-2 bg-[#2A2F35] overflow-hidden mt-0.5">
              <div
                className="h-full bg-[#6D9CB6] transition-all duration-75"
                style={{ width: `${Math.max(0, Math.min(100, (hud.mana / Math.max(1, hud.maxMana)) * 100))}%` }}
              />
            </div>
          </div>

          {/* Divine Ascension */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#D9D1BE]/85">
              <span>{hud.ascensionRemainingSec > 0 ? `Ascension (${hud.ascensionRemainingSec}s)` : 'Divine Oath [R]'}</span>
              <span className="font-mono">{hud.divineMeter}%</span>
            </div>
            <div className="h-1.5 bg-[#2A2F35] overflow-hidden mt-0.5">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.divineMeter >= 100 || hud.ascensionRemainingSec > 0 ? 'bg-[#D9D1BE]' : 'bg-[#6D9CB6]/75'
                }`}
                style={{ width: `${hud.ascensionRemainingSec > 0 ? (hud.ascensionRemainingSec / 12) * 100 : hud.divineMeter}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-Right: Equipped Weapon, Abilities & Quick Potions */}
      <div className="absolute bottom-4 right-4 pointer-events-auto hidden sm:flex flex-col items-end gap-1.5">
        <div className="px-3 py-1 border border-[#68717A]/50 bg-[#1B2024]/85 text-xs text-[#D9D1BE]">
          <span className="text-[#9C7848] mr-1.5">Weapon:</span>
          {hud.equippedWeaponName}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onTouchAction('ability1')}
            className="w-16 p-1.5 border border-[#68717A]/55 bg-[#1B2024]/88 text-center hover:border-[#6D9CB6]"
          >
            <div className="text-[10px] text-[#9C7848] font-mono">[1]</div>
            <div className="text-[10px] text-[#D9D1BE] truncate">Rime</div>
            {hud.abilityCooldowns[0] > 0 && (
              <div className="text-[10px] text-[#6D9CB6] font-mono">{hud.abilityCooldowns[0]}s</div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onTouchAction('ability2')}
            className="w-16 p-1.5 border border-[#68717A]/55 bg-[#1B2024]/88 text-center hover:border-[#9C7848]"
          >
            <div className="text-[10px] text-[#9C7848] font-mono">[2]</div>
            <div className="text-[10px] text-[#D9D1BE] truncate">Cinder</div>
            {hud.abilityCooldowns[1] > 0 && (
              <div className="text-[10px] text-[#9C7848] font-mono">{hud.abilityCooldowns[1]}s</div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onTouchAction('ability3')}
            className="w-16 p-1.5 border border-[#68717A]/55 bg-[#1B2024]/88 text-center hover:border-[#6D9CB6]"
          >
            <div className="text-[10px] text-[#9C7848] font-mono">[3]</div>
            <div className="text-[10px] text-[#D9D1BE] truncate">OathWave</div>
            {hud.abilityCooldowns[2] > 0 && (
              <div className="text-[10px] text-[#6D9CB6] font-mono">{hud.abilityCooldowns[2]}s</div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onTouchAction('potion')}
            className="w-16 p-1.5 border border-[#7D3834]/80 bg-[#1B2024]/88 text-center hover:border-[#D9D1BE]"
          >
            <div className="text-[10px] text-[#9C7848] font-mono">[4]</div>
            <div className="text-[10px] text-[#D9D1BE]">Heal ×{hud.potionCount}</div>
          </button>
        </div>
        {!hud.pointerLocked && hud.mode === 'playing' && (
          <div className="text-[10px] text-[#D9D1BE]/65 bg-[#1B2024]/80 px-2 py-0.5 border border-[#68717A]/30">
            Click viewport to lock mouse · Right-drag to look · Esc to pause
          </div>
        )}
      </div>

      {/* Responsive Mobile / Touch Controls (strictly non-overlapping safe zones above vitals) */}
      {showTouchPad && hud.mode === 'playing' && (
        <>
          <div
            ref={joyRef}
            onTouchStart={handleJoyMove}
            onTouchMove={handleJoyMove}
            onTouchEnd={() => onTouchMove(0, 0)}
            className="pointer-events-auto fixed bottom-60 left-4 w-24 h-24 rounded-full border-2 border-[#9C7848]/70 bg-[#1B2024]/65 flex items-center justify-center touch-none"
          >
            <div className="w-9 h-9 rounded-full border border-[#D9D1BE]/70 bg-[#9C7848]/45" />
          </div>

          {/* Right half invisible touch-look surface */}
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
              className="w-13 h-13 rounded-full border border-[#9C7848] bg-[#22272B]/90 text-[10px] text-[#D9D1BE] font-bold"
            >
              ATK
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('heavy')}
              onClick={() => onTouchAction('heavy')}
              className="w-13 h-13 rounded-full border border-[#7D3834] bg-[#22272B]/90 text-[10px] text-[#D9D1BE] font-bold"
            >
              HEAVY
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('block')}
              onTouchEnd={() => onTouchAction('release_block')}
              onClick={() => onTouchAction('block')}
              className="w-13 h-13 rounded-full border border-[#6D9CB6] bg-[#22272B]/90 text-[10px] text-[#D9D1BE]"
            >
              PARRY
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchAction('dodge')}
              onClick={() => onTouchAction('dodge')}
              className="w-13 h-13 rounded-full border border-[#68717A] bg-[#22272B]/90 text-[10px] text-[#D9D1BE]"
            >
              DODGE
            </button>
          </div>
        </>
      )}

      {/* Pause Overlay */}
      {hud.mode === 'paused' && (
        <div className="fixed inset-0 z-40 pointer-events-auto bg-[#121619]/78 flex items-center justify-center p-4">
          <div className="w-full max-w-sm border border-[#9C7848] bg-[#1B2024] p-6 space-y-3 text-center">
            <h2
              className="text-2xl uppercase tracking-[0.2em] text-[#D9D1BE]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Paused
            </h2>
            <p className="text-xs text-[#9C7848]">{hud.regionLabel}</p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={onResume}
                className="w-full py-2.5 border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 text-sm uppercase tracking-widest text-[#D9D1BE]"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => onOpenMenu('inventory')}
                className="w-full py-2 border border-[#68717A]/60 hover:border-[#9C7848] text-xs uppercase tracking-widest text-[#D9D1BE]"
              >
                Character & Codex
              </button>
              <button
                type="button"
                onClick={() => onOpenMenu('settings')}
                className="w-full py-2 border border-[#68717A]/60 hover:border-[#9C7848] text-xs uppercase tracking-widest text-[#D9D1BE]"
              >
                Save & Settings
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full py-2 border border-[#7D3834]/70 hover:bg-[#7D3834]/30 text-xs uppercase tracking-widest text-[#D9D1BE]"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Death / Checkpoint Respawn Overlay */}
      {hud.mode === 'dead' && (
        <div className="fixed inset-0 z-40 pointer-events-auto bg-[#160D0D]/86 flex items-center justify-center p-4">
          <div className="w-full max-w-md border border-[#7D3834] bg-[#1B1819] p-7 text-center space-y-4">
            <h2
              className="text-3xl uppercase tracking-[0.25em] text-[#B84A42]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Oath Broken
            </h2>
            <p className="text-sm text-[#D9D1BE]/80">
              Kaelen falls in the snow, yet the Forgotten One’s mark pulls him back to the last safe hearth. Quest
              progress is preserved.
            </p>
            <button
              type="button"
              onClick={onRespawn}
              className="w-full py-3 border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 text-sm uppercase tracking-[0.2em] text-[#D9D1BE]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Rise at Last Checkpoint
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
