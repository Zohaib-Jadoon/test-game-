import React, { useState } from 'react';
import type { DifficultyId, GameSettings, QualityPreset, SaveGame } from '../game/types';
import type { SaveSlotId } from '../game/save/saveSystem';

interface EidrathTitleScreenProps {
  latestSave: SaveGame | null;
  allSaves: Array<{ slotId: SaveSlotId; save: SaveGame | null }>;
  settings: GameSettings;
  onContinue: (save: SaveGame) => void;
  onNewGame: (settings: GameSettings) => void;
  onLoadSlot: (save: SaveGame) => void;
  onUpdateSettings: (settings: GameSettings) => void;
  onOpenSettings: () => void;
}

const DIFFICULTIES: Array<{ id: DifficultyId; label: string; desc: string }> = [
  { id: 'story', label: 'Story', desc: 'Forgiving combat damage, extended parry window, full narrative.' },
  { id: 'normal', label: 'Normal', desc: 'Balanced Frostheim action-RPG tuning (Recommended).' },
  { id: 'hard', label: 'Hard', desc: 'Punishing enemies, tighter parries, deliberate resource management.' },
  { id: 'oathsworn', label: 'Oathsworn', desc: 'Unforgiving blades and heavy boss strikes for seasoned warriors.' },
];

export const EidrathTitleScreen: React.FC<EidrathTitleScreenProps> = ({
  latestSave,
  allSaves,
  settings,
  onContinue,
  onNewGame,
  onLoadSlot,
  onUpdateSettings,
  onOpenSettings,
}) => {
  const [subView, setSubView] = useState<'main' | 'new_setup' | 'load' | 'credits'>('main');
  const [draftSettings, setDraftSettings] = useState<GameSettings>(settings);

  const validSlots = allSaves.filter((s): s is { slotId: SaveSlotId; save: SaveGame } => s.save !== null);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-6 sm:p-10 md:p-14 pointer-events-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(19,23,27,0.88) 0%, rgba(19,23,27,0.52) 45%, rgba(19,23,27,0.16) 100%)',
      }}
    >
      {/* Top Crest & Subtitle */}
      <div className="pointer-events-auto max-w-xl">
        <div className="flex items-center gap-4 mb-3">
          <img
            src="/icon.svg"
            alt="EIDRATH Oath Crest"
            className="w-12 h-12 rounded-sm border border-[#9C7848]/60 bg-[#1B2024]/80 p-1"
          />
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#9C7848] font-semibold">
              Act I · Frostheim Vertical Slice
            </p>
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-[0.14em] text-[#D9D1BE]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              EIDRATH
            </h1>
            <p
              className="text-sm sm:text-base tracking-[0.34em] uppercase text-[#9C7848] mt-0.5"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              The Last Oath
            </p>
          </div>
        </div>
        <div className="h-px w-56 bg-gradient-to-r from-[#9C7848] to-transparent my-4" />
        <p className="text-sm text-[#D9D1BE]/80 italic leading-relaxed max-w-md">
          “The gods created mankind to serve them. Now mankind must decide whether the gods deserve to live.”
        </p>
      </div>

      {/* Main Navigation / Sub-panels */}
      <div className="pointer-events-auto my-auto max-w-md w-full">
        {subView === 'main' && (
          <nav aria-label="Main Menu" className="flex flex-col gap-2.5">
            {latestSave && (
              <button
                type="button"
                onClick={() => onContinue(latestSave)}
                className="group text-left px-5 py-3.5 border border-[#9C7848] bg-[#22272B]/90 hover:bg-[#2c3338] transition-colors flex items-center justify-between"
              >
                <div>
                  <span
                    className="block text-base tracking-[0.16em] uppercase text-[#D9D1BE] font-semibold"
                    style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                  >
                    Continue
                  </span>
                  <span className="text-xs text-[#9C7848]">
                    {latestSave.regionName} · Level {latestSave.player.level}
                  </span>
                </div>
                <span className="text-[#9C7848] text-xs tracking-widest">RESUME</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setDraftSettings(settings);
                setSubView('new_setup');
              }}
              className="text-left px-5 py-3 border border-[#68717A]/60 bg-[#1B2024]/85 hover:border-[#9C7848] hover:bg-[#252B30] transition-colors"
            >
              <span
                className="block text-base tracking-[0.16em] uppercase text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                New Game
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('load')}
              disabled={validSlots.length === 0}
              className="text-left px-5 py-3 border border-[#68717A]/50 bg-[#1B2024]/80 hover:border-[#9C7848] hover:bg-[#252B30] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
            >
              <span
                className="text-base tracking-[0.16em] uppercase text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Load Game
              </span>
              <span className="text-xs text-[#68717A]">{validSlots.length} slot(s)</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="text-left px-5 py-3 border border-[#68717A]/50 bg-[#1B2024]/80 hover:border-[#9C7848] hover:bg-[#252B30] transition-colors"
            >
              <span
                className="text-base tracking-[0.16em] uppercase text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Settings
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('credits')}
              className="text-left px-5 py-3 border border-[#68717A]/40 bg-[#1B2024]/75 hover:border-[#9C7848] hover:bg-[#252B30] transition-colors"
            >
              <span
                className="text-base tracking-[0.16em] uppercase text-[#D9D1BE]/90"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Credits
              </span>
            </button>
          </nav>
        )}

        {subView === 'new_setup' && (
          <div className="border border-[#9C7848]/70 bg-[#1B2024]/95 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#68717A]/30 pb-2">
              <h2
                className="text-lg uppercase tracking-[0.16em] text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Begin Your Oath
              </h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#68717A] hover:text-[#D9D1BE]"
              >
                Back
              </button>
            </div>

            <div>
              <p className="text-xs uppercase tracking-widest text-[#9C7848] mb-2">Difficulty</p>
              <div className="grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, difficulty: d.id })}
                    className={`p-2.5 text-left border transition-colors ${
                      draftSettings.difficulty === d.id
                        ? 'border-[#9C7848] bg-[#2a3035] text-[#D9D1BE]'
                        : 'border-[#68717A]/40 bg-[#161a1e] text-[#D9D1BE]/70 hover:border-[#9C7848]/60'
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider">{d.label}</div>
                    <div className="text-[11px] text-[#D9D1BE]/65 mt-0.5 leading-snug">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#9C7848]">Graphics Quality</p>
                <div className="flex gap-1.5 mt-1">
                  {(['low', 'medium', 'high'] as QualityPreset[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDraftSettings({ ...draftSettings, quality: q })}
                      className={`px-3 py-1 text-xs uppercase border ${
                        draftSettings.quality === q
                          ? 'border-[#9C7848] bg-[#2a3035] text-[#D9D1BE]'
                          : 'border-[#68717A]/40 text-[#D9D1BE]/70'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#D9D1BE] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSettings.subtitles}
                  onChange={(e) => setDraftSettings({ ...draftSettings, subtitles: e.target.checked })}
                  className="accent-[#9C7848]"
                />
                Subtitles
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                onUpdateSettings(draftSettings);
                onNewGame(draftSettings);
              }}
              className="w-full py-3 border border-[#9C7848] bg-[#9C7848]/20 hover:bg-[#9C7848]/35 text-[#D9D1BE] uppercase tracking-[0.2em] text-sm font-semibold transition-colors"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Wake in Oathgrave Tomb
            </button>
          </div>
        )}

        {subView === 'load' && (
          <div className="border border-[#9C7848]/70 bg-[#1B2024]/95 p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#68717A]/30 pb-2">
              <h2
                className="text-lg uppercase tracking-[0.16em] text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Load Chronicle
              </h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#68717A] hover:text-[#D9D1BE]"
              >
                Back
              </button>
            </div>
            {validSlots.map(({ slotId, save }) => (
              <button
                key={slotId}
                type="button"
                onClick={() => onLoadSlot(save)}
                className="w-full text-left p-3 border border-[#68717A]/45 hover:border-[#9C7848] bg-[#22272B]/80 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs uppercase tracking-widest text-[#9C7848]">{slotId.replace('_', ' ')}</div>
                  <div className="text-sm text-[#D9D1BE] font-medium">{save.regionName}</div>
                  <div className="text-[11px] text-[#D9D1BE]/65">
                    Level {save.player.level} · {save.player.gold} Gold · {Math.floor(save.playtimeSec / 60)}m played
                  </div>
                </div>
                <span className="text-[11px] text-[#68717A]">
                  {new Date(save.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}

        {subView === 'credits' && (
          <div className="border border-[#9C7848]/70 bg-[#1B2024]/95 p-5 space-y-3 text-sm text-[#D9D1BE]/85">
            <div className="flex items-center justify-between border-b border-[#68717A]/30 pb-2">
              <h2
                className="text-lg uppercase tracking-[0.16em] text-[#D9D1BE]"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                Credits
              </h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#68717A] hover:text-[#D9D1BE]"
              >
                Back
              </button>
            </div>
            <p>
              <strong className="text-[#9C7848]">EIDRATH: The Last Oath</strong> — Original open-world dark-fantasy
              action RPG built on Three.js, React 19, TypeScript, and Blender 5.3 original `.glb` / `.blend` assets.
            </p>
            <p className="text-xs text-[#D9D1BE]/70">
              All 55 Frostheim character, enemy, Mountain Warden boss, weapon, architectural, and prop assets were
              authored through reproducible Blender 5.3 pipelines. Core single-player campaign runs 100% offline.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Status Strip */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#D9D1BE]/65 border-t border-[#68717A]/25 pt-3">
        <span>Offline Single-Player Ready · 55 Original Blender 5.3 Assets</span>
        <span>WASD Move · LMB/RMB Combat · Q Parry/Block · Space Dodge · E Interact · I/K/M/J Menus</span>
      </div>
    </div>
  );
};
