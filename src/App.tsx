import React, { useCallback, useEffect, useRef, useState } from 'react';
import { validateEidrathContent } from './content/eidrathContent';
import { DialogueOverlay } from './components/DialogueOverlay';
import { EidrathHud } from './components/EidrathHud';
import { EidrathTitleScreen } from './components/EidrathTitleScreen';
import { RpgMenus, type RpgMenuTab } from './components/RpgMenus';
import { BlenderDevDrawer } from './components/dev/BlenderDevDrawer';
import { EidrathEngine } from './game/core/EidrathEngine';
import {
  createDefaultSettings,
  createNewGameSave,
  getMostRecentSave,
  listSaveSlots,
  loadGameSettings,
  saveGameSettings,
  type SaveSlotId,
} from './game/save/saveSystem';
import type { GameSettings, HudSnapshot, SaveGame } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  mode: 'title',
  regionLabel: 'Frostheim — Oathgrave Tomb',
  landmarkBanner: '',
  notificationText: '',
  subtitleText: '',
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  mana: 80,
  maxMana: 80,
  divineMeter: 0,
  ascensionRemainingSec: 0,
  actionState: 'idle',
  inCombat: false,
  stealthState: 'hidden',
  stealthEyePct: 0,
  lockedTargetName: null,
  lockedTargetHpPct: 0,
  lockedTargetPoisePct: 0,
  incomingCue: 'none',
  parryFlashSec: 0,
  damageFlashSec: 0,
  cameraHeadingRad: 0,
  waypointBearingRad: null,
  waypointDistanceM: null,
  waypointLabel: null,
  enemyBlips: [],
  interactPrompt: null,
  trackedQuestTitle: null,
  trackedObjectiveText: null,
  boss: null,
  companionName: null,
  companionCommand: 'assist',
  companionHpPct: 100,
  equippedWeaponName: 'Unarmed',
  potionCount: 3,
  manaPotionCount: 2,
  abilityCooldowns: [0, 0, 0, 0],
  worldTimeHours: 8.5,
  weather: 'snow',
  playerX: -145,
  playerZ: 145,
  level: 1,
  xp: 0,
  nextLevelXp: 120,
  gold: 55,
  skillPoints: 2,
  pointerLocked: false,
  fps: 60,
  drawCalls: 0,
};

export function App() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EidrathEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      return loadGameSettings();
    } catch {
      return createDefaultSettings();
    }
  });
  const [save, setSave] = useState<SaveGame>(() => getMostRecentSave() ?? createNewGameSave('autosave'));
  const [allSaves, setAllSaves] = useState<Array<{ slotId: SaveSlotId; save: SaveGame | null }>>(() =>
    listSaveSlots(),
  );
  const [dialogueNodeId, setDialogueNodeId] = useState<string | null>(null);
  const [menuTab, setMenuTab] = useState<RpgMenuTab | null>(null);
  const [devBlenderOpen, setDevBlenderOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const refreshSlots = useCallback(() => {
    setAllSaves(listSaveSlots());
  }, []);

  useEffect(() => {
    const check = validateEidrathContent();
    if (!check.valid) {
      setBootError(`Content validation failed: ${check.errors.join('; ')}`);
      return;
    }

    const container = viewportRef.current;
    if (!container) return;

    try {
      const engine = new EidrathEngine(
        container,
        {
          onHudUpdate: (snap) => setHud(snap),
          onDialogueOpen: (nodeId) => setDialogueNodeId(nodeId),
          onSaveChanged: (updated) => {
            setSave(updated);
            refreshSlots();
          },
          onOpenSpecialUi: (ui) => {
            setMenuTab(ui);
          },
        },
        settings,
      );
      engineRef.current = engine;
      return () => {
        engine.dispose();
        engineRef.current = null;
      };
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'WebGL initialization failed.');
    }
  }, []);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveGameSettings(next);
    engineRef.current?.setSettings(next);
  }, []);

  const openMenu = useCallback((tab: RpgMenuTab) => {
    setMenuTab(tab);
    if (engineRef.current && hud.mode !== 'title') {
      engineRef.current.setPaused(true, true);
    }
  }, [hud.mode]);

  const closeMenu = useCallback(() => {
    setMenuTab(null);
    if (engineRef.current && hud.mode !== 'title') {
      engineRef.current.setPaused(false, false);
    }
  }, [hud.mode]);

  // Global menu hotkeys (I / K / M / J / Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (devBlenderOpen) return;

      if (e.code === 'Escape') {
        if (menuTab) {
          e.preventDefault();
          closeMenu();
        } else if (hud.mode === 'playing') {
          e.preventDefault();
          engineRef.current?.setPaused(true, false);
        } else if (hud.mode === 'paused') {
          e.preventDefault();
          engineRef.current?.setPaused(false, false);
        }
        return;
      }

      if (hud.mode === 'title' || hud.mode === 'dead' || dialogueNodeId) return;

      const mapCode: Record<string, RpgMenuTab> = {
        KeyI: 'inventory',
        KeyK: 'skills',
        KeyM: 'map',
        KeyJ: 'journal',
      };
      const targetTab = mapCode[e.code];
      if (targetTab) {
        e.preventDefault();
        if (menuTab === targetTab) {
          closeMenu();
        } else {
          openMenu(targetTab);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hud.mode, menuTab, dialogueNodeId, devBlenderOpen, openMenu, closeMenu]);

  useEffect(() => {
    document.body.dataset.state = hud.mode;
  }, [hud.mode]);

  const latestSave = allSaves.find((s) => s.save !== null)?.save ?? null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#171B1E] text-[#D9D1BE]">
      {/* Live 3D Three.js Frostheim / Oath Shrine Viewport */}
      <div ref={viewportRef} className="absolute inset-0 w-full h-full" />

      {bootError && (
        <div className="fixed inset-0 z-50 bg-[#171B1E]/95 flex items-center justify-center p-6">
          <div className="max-w-lg border border-[#7D3834] bg-[#22272B] p-6 space-y-2">
            <h1 className="text-lg uppercase tracking-widest text-[#D47A74]">EIDRATH Boot Error</h1>
            <p className="text-sm text-[#D9D1BE]/85">{bootError}</p>
          </div>
        </div>
      )}

      {/* Title Screen */}
      {hud.mode === 'title' && !menuTab && (
        <EidrathTitleScreen
          latestSave={latestSave}
          allSaves={allSaves}
          settings={settings}
          onContinue={(s) => void engineRef.current?.loadSave(s)}
          onNewGame={(nextSettings) => {
            handleUpdateSettings(nextSettings);
            void engineRef.current?.startNewGame('autosave');
          }}
          onLoadSlot={(s) => void engineRef.current?.loadSave(s)}
          onUpdateSettings={handleUpdateSettings}
          onOpenSettings={() => setMenuTab('settings')}
        />
      )}

      {/* Gameplay HUD, Pause Overlay & Death Screen */}
      {hud.mode !== 'title' && (
        <EidrathHud
          hud={hud}
          settings={settings}
          onOpenMenu={(tab) => openMenu(tab)}
          onResume={() => engineRef.current?.setPaused(false, false)}
          onReturnToTitle={() => {
            setMenuTab(null);
            engineRef.current?.returnToTitle();
            refreshSlots();
          }}
          onRespawn={() => engineRef.current?.respawnAtCheckpoint()}
          onCompanionCommand={(cmd) => engineRef.current?.setCompanionCommand(cmd)}
          onTouchMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onTouchLook={(dx, dy) => engineRef.current?.addTouchLook(dx, dy)}
          onTouchAction={(act) => engineRef.current?.triggerTouchAction(act)}
        />
      )}

      {/* Authored Branching Dialogue Overlay */}
      {dialogueNodeId && hud.mode === 'dialogue' && (
        <DialogueOverlay
          nodeId={dialogueNodeId}
          save={save}
          onChoose={(choiceId) => engineRef.current?.executeDialogueChoice(choiceId)}
          onClose={() => engineRef.current?.closeDialogue()}
        />
      )}

      {/* Tabbed RPG Menus (Inventory, Skills, World Map, Journal, Forge, Merchant, Settings) */}
      {menuTab && (
        <RpgMenus
          activeTab={menuTab}
          inGame={hud.mode !== 'title'}
          save={save}
          allSaves={allSaves}
          settings={settings}
          onChangeTab={(tab) => setMenuTab(tab)}
          onClose={closeMenu}
          onEquipItem={(id) => engineRef.current?.equipItem(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onUseItem={(id) => engineRef.current?.useItem(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onDropItem={(id) => engineRef.current?.dropItem(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onUnlockSkill={(id) => engineRef.current?.unlockSkill(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onResetSkills={() => engineRef.current?.resetSkills() ?? { ok: false, refunded: 0 }}
          onCraftRecipe={(id) => engineRef.current?.craftRecipe(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onBuyItem={(id) => engineRef.current?.buyItem(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onSellItem={(id) => engineRef.current?.sellItem(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onTrackQuest={(id) => engineRef.current?.trackQuest(id)}
          onFastTravel={(id) => engineRef.current?.fastTravelTo(id) ?? { ok: false, message: 'Engine unavailable.' }}
          onManualSave={(slot) => engineRef.current?.manualSave(slot) ?? { ok: false, message: 'Engine unavailable.' }}
          onLoadSlot={(s) => {
            setMenuTab(null);
            void engineRef.current?.loadSave(s);
          }}
          onUpdateSettings={handleUpdateSettings}
          onOpenDevBlender={() => setDevBlenderOpen(true)}
        />
      )}

      {/* Developer-Only Blender Asset Forge Drawer */}
      {devBlenderOpen && (
        <BlenderDevDrawer
          onClose={() => setDevBlenderOpen(false)}
          onPreviewGlb={async (id, buf, cat) => {
            if (engineRef.current) {
              await engineRef.current.previewDevGlb(id, buf, cat);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
