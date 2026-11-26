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
      className="fixed inset-0 z-30 flex flex-col justify-between p-6 sm:p-12 md:p-16 pointer-events-none eid-ornate-vignette"
      style={{
        background:
          'linear-gradient(95deg, rgba(10,13,18,0.88) 0%, rgba(12,16,22,0.56) 44%, rgba(12,16,22,0.10) 100%)',
      }}
    >
      {/* Top Engraved Emblem */}
      <div className="pointer-events-auto max-w-xl">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-14 h-14 flex items-center justify-center border border-[#b89552]/65 bg-[#11151b]/85 shadow-lg">
            <img src="/icon.svg" alt="EIDRATH Oath Crest" className="w-10 h-10 object-contain" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.34em] text-[#b89552] font-medium">
              Chronicles of Frostheim
            </p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-[0.16em] text-[#efe4c8] drop-shadow-lg">
              EIDRATH
            </h1>
            <p className="font-display text-sm sm:text-base tracking-[0.38em] uppercase text-[#dfc38a] mt-0.5">
              The Last Oath
            </p>
          </div>
        </div>
        <div className="eid-divider w-64 my-4" />
        <p className="text-sm text-[#e4dcc8]/78 italic leading-relaxed max-w-md">
          “The gods created mankind to serve them. Now mankind must decide whether the gods deserve to live.”
        </p>
      </div>

      {/* Main Navigation & Sub-panels */}
      <div className="pointer-events-auto my-auto max-w-md w-full">
        {subView === 'main' && (
          <nav aria-label="Main Menu" className="flex flex-col gap-2.5">
            {latestSave && (
              <button
                type="button"
                onClick={() => onContinue(latestSave)}
                className="eid-btn-primary text-left px-5 py-3.5 flex items-center justify-between"
              >
                <div>
                  <span className="font-display block text-base tracking-[0.18em] uppercase text-[#efe4c8] font-semibold">
                    Continue
                  </span>
                  <span className="text-xs text-[#dfc38a]/85">
                    {latestSave.regionName} · Level {latestSave.player.level}
                  </span>
                </div>
                <span className="text-[#dfc38a] text-[10px] uppercase tracking-[0.26em]">Resume</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setDraftSettings(settings);
                setSubView('new_setup');
              }}
              className="eid-btn-ghost text-left px-5 py-3"
            >
              <span className="font-display block text-base tracking-[0.18em] uppercase">New Game</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('load')}
              disabled={validSlots.length === 0}
              className="eid-btn-ghost text-left px-5 py-3 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-between"
            >
              <span className="font-display text-base tracking-[0.18em] uppercase">Load Game</span>
              <span className="text-[11px] font-mono-num text-[#b89552]">{validSlots.length} slot(s)</span>
            </button>

            <button type="button" onClick={onOpenSettings} className="eid-btn-ghost text-left px-5 py-3">
              <span className="font-display text-base tracking-[0.18em] uppercase">Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('credits')}
              className="eid-btn-ghost text-left px-5 py-3"
            >
              <span className="font-display text-base tracking-[0.18em] uppercase">Credits</span>
            </button>
          </nav>
        )}

        {subView === 'new_setup' && (
          <div className="eid-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#b89552]/25 pb-2">
              <h2 className="font-display text-lg uppercase tracking-[0.18em] text-[#efe4c8]">Begin Your Oath</h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#b89552] hover:text-[#efe4c8]"
              >
                Back
              </button>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#b89552] mb-2">Difficulty</p>
              <div className="grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, difficulty: d.id })}
                    className={`p-2.5 text-left border transition-colors ${
                      draftSettings.difficulty === d.id
                        ? 'border-[#dfc38a] bg-[#2a2419]/90 text-[#efe4c8]'
                        : 'border-[#b89552]/25 bg-[#0e1217]/80 text-[#e4dcc8]/70 hover:border-[#b89552]/60'
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider">{d.label}</div>
                    <div className="text-[11px] text-[#e4dcc8]/65 mt-0.5 leading-snug">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#b89552]">Graphics Quality</p>
                <div className="flex gap-1.5 mt-1">
                  {(['low', 'medium', 'high', 'ultra'] as QualityPreset[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDraftSettings({ ...draftSettings, quality: q })}
                      className={`px-2.5 py-1 text-[11px] uppercase border ${
                        draftSettings.quality === q
                          ? 'border-[#dfc38a] bg-[#2a2419] text-[#efe4c8]'
                          : 'border-[#b89552]/25 text-[#e4dcc8]/70'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#e4dcc8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSettings.subtitles}
                  onChange={(e) => setDraftSettings({ ...draftSettings, subtitles: e.target.checked })}
                  className="accent-[#b89552]"
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
              className="eid-btn-primary w-full py-3 uppercase tracking-[0.22em] text-sm font-semibold font-display"
            >
              Wake in Oathgrave Tomb
            </button>
          </div>
        )}

        {subView === 'load' && (
          <div className="eid-panel p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#b89552]/25 pb-2">
              <h2 className="font-display text-lg uppercase tracking-[0.18em] text-[#efe4c8]">Load Chronicle</h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#b89552] hover:text-[#efe4c8]"
              >
                Back
              </button>
            </div>
            {validSlots.map(({ slotId, save }) => (
              <button
                key={slotId}
                type="button"
                onClick={() => onLoadSlot(save)}
                className="eid-btn-ghost w-full text-left p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-[#b89552]">{slotId.replace('_', ' ')}</div>
                  <div className="text-sm text-[#efe4c8] font-medium">{save.regionName}</div>
                  <div className="text-[11px] text-[#e4dcc8]/65">
                    Level {save.player.level} · {save.player.gold} Gold · {Math.floor(save.playtimeSec / 60)}m played
                  </div>
                </div>
                <span className="text-[11px] text-[#7fa8c4] font-mono-num">
                  {new Date(save.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}

        {subView === 'credits' && (
          <div className="eid-panel p-6 space-y-3 text-sm text-[#e4dcc8]/85">
            <div className="flex items-center justify-between border-b border-[#b89552]/25 pb-2">
              <h2 className="font-display text-lg uppercase tracking-[0.18em] text-[#efe4c8]">Credits</h2>
              <button
                type="button"
                onClick={() => setSubView('main')}
                className="text-xs uppercase tracking-widest text-[#b89552] hover:text-[#efe4c8]"
              >
                Back
              </button>
            </div>
            <p>
              <strong className="text-[#dfc38a]">EIDRATH: The Last Oath</strong> — Dark-fantasy third-person action
              RPG forged in Frostheim.
            </p>
            <p className="text-xs text-[#e4dcc8]/70 leading-relaxed">
              PBR materials & HDRI lighting from PolyHaven & ambientCG (CC0), human anatomy via MakeHuman/MPFB2,
              animations from Three.js Mixamo rigs (MIT), orchestral scores by Scott Buckley (CC BY 4.0), and audio
              FOLEY normalized from OpenGameArt/LibriVox/procedural synthesis.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Controls Legend */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#e4dcc8]/60 border-t border-[#b89552]/20 pt-3">
        <span className="tracking-wider uppercase text-[#b89552]/80">Frostheim · Single-Player</span>
        <span>WASD Move · LMB/RMB Attack · V Shoulder · Q Parry · Space Dodge · E Interact · I/K/M/J</span>
      </div>
    </div>
  );
};
