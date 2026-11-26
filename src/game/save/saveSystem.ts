import type { GameSettings, KeyBindings, SaveGame } from '../types';
import { ITEMS, LORE_ENTRIES } from '../../content/eidrathContent';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const SAVE_SLOTS = ['autosave', 'slot_1', 'slot_2', 'slot_3'] as const;
export type SaveSlotId = (typeof SAVE_SLOTS)[number];

const STORAGE_PREFIX = 'eidrath_save_v1_';
const BACKUP_SUFFIX = '_backup';
const SETTINGS_KEY = 'eidrath_settings_v1';
const IDB_NAME = 'eidrath_rpg_db';
const IDB_STORE = 'saves';

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  dodge: 'Space',
  jump: 'KeyC',
  interact: 'KeyE',
  block: 'KeyQ',
  ascension: 'KeyR',
  sneak: 'ControlLeft',
  lockOn: 'Tab',
};

export function createDefaultSettings(): GameSettings {
  return {
    quality: 'medium',
    difficulty: 'normal',
    subtitles: true,
    cameraShake: true,
    reducedMotion: false,
    highContrastCues: false,
    mouseSensitivity: 1.0,
    fov: 56,
    cameraDistance: 3.4,
    developerMode: false,
    masterVolume: 0.75,
    musicVolume: 0.7,
    ambienceVolume: 0.8,
    sfxVolume: 0.85,
    dialogueVolume: 0.9,
    muted: false,
    bindings: { ...DEFAULT_KEY_BINDINGS },
  };
}

export function createNewGameSave(slotId: SaveSlotId = 'autosave'): SaveGame {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    slotId,
    revision: 1,
    updatedAt: new Date().toISOString(),
    playtimeSec: 0,
    regionName: 'Frostheim — Oathgrave Tomb',
    checkpointId: 'lm_oathgrave_tomb',
    player: {
      x: -145,
      y: 0,
      z: 145,
      yaw: Math.PI * 0.75,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      mana: 80,
      maxMana: 80,
      divineMeter: 0,
      level: 1,
      xp: 0,
      skillPoints: 2,
      gold: 55,
      attributes: {
        strength: 10,
        dexterity: 10,
        intelligence: 10,
        vitality: 10,
        divineCapacity: 10,
      },
      skills: {},
      equipment: {
        chest: 'arm_kaelen_lamellar',
        cloak: 'arm_frostheim_cloak',
      },
      inventory: [
        { itemId: 'arm_kaelen_lamellar', quantity: 1 },
        { itemId: 'arm_frostheim_cloak', quantity: 1 },
        { itemId: 'pot_health', quantity: 3 },
        { itemId: 'pot_mana', quantity: 2 },
        { itemId: 'mat_frost_herb', quantity: 2 },
      ],
      unlockedAbilities: ['ability_frost_lance', 'ability_hearth_flame'],
    },
    companion: {
      activeId: null,
      loyalty: 50,
      command: 'assist',
    },
    quests: {
      q_broken_oath: {
        status: 'active',
        counts: {},
        rewardClaimed: false,
      },
    },
    trackedQuestId: 'q_broken_oath',
    world: {
      regionId: 'frostheim',
      worldTimeHours: 8.5,
      weather: 'snow',
      weatherSeed: 104729,
      discoveredLandmarks: ['lm_oathgrave_tomb'],
      openedChests: [],
      solvedPuzzles: [],
      defeatedBosses: [],
      unlockedShortcuts: [],
      flags: {},
      domains: {
        war: 'bound',
        death: 'bound',
        nature: 'bound',
        time: 'bound',
        knowledge: 'bound',
        life: 'bound',
        chaos: 'bound',
      },
      factions: {
        iron_covenant: 0,
        arcane_circle: 0,
        silent_hand: 0,
        silver_order: 5,
        crown_legion: -15,
        free_kingdoms: 10,
        ashen_cult: 0,
        eternal_forge: 5,
      },
      corruption: 0,
      unlockedLore: LORE_ENTRIES.filter((l) => l.initiallyUnlocked).map((l) => l.id),
    },
  };
}

export function validateSaveGame(raw: unknown): { valid: boolean; save?: SaveGame; reason?: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, reason: 'Save payload is not an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return { valid: false, reason: `Unsupported save schema version: ${String(obj.schemaVersion)}` };
  }
  if (typeof obj.slotId !== 'string' || !obj.slotId) {
    return { valid: false, reason: 'Missing slotId.' };
  }
  const player = obj.player as Record<string, unknown> | undefined;
  const world = obj.world as Record<string, unknown> | undefined;
  if (!player || typeof player !== 'object' || !world || typeof world !== 'object') {
    return { valid: false, reason: 'Missing player or world section.' };
  }
  if (
    !Number.isFinite(player.x) ||
    !Number.isFinite(player.z) ||
    !Number.isFinite(player.hp) ||
    !Number.isFinite(player.maxHp) ||
    (player.maxHp as number) <= 0
  ) {
    return { valid: false, reason: 'Invalid player numeric bounds.' };
  }
  if (!Array.isArray(player.inventory)) {
    return { valid: false, reason: 'Invalid player inventory array.' };
  }

  // Deep-clone & sanitize bounds + strip unknown items cleanly
  const clone: SaveGame = JSON.parse(JSON.stringify(obj));
  clone.player.hp = Math.max(1, Math.min(clone.player.maxHp, clone.player.hp));
  clone.player.stamina = Math.max(0, Math.min(clone.player.maxStamina, clone.player.stamina));
  clone.player.mana = Math.max(0, Math.min(clone.player.maxMana, clone.player.mana));
  clone.player.divineMeter = Math.max(0, Math.min(100, clone.player.divineMeter));
  clone.player.gold = Math.max(0, Math.floor(clone.player.gold));
  clone.player.inventory = clone.player.inventory.filter(
    (entry) => entry && typeof entry.itemId === 'string' && Boolean(ITEMS[entry.itemId]) && entry.quantity > 0,
  );
  return { valid: true, save: clone };
}

function getStorage(customStorage?: Storage): Storage | null {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

async function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function mirrorToIdb(key: string, json: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(json, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Atomic write with automatic .backup rotation so corrupted writes never lose progress.
 * Never touches legacy `skyforge_*` keys.
 */
export function writeSaveSlot(
  slotId: SaveSlotId,
  save: SaveGame,
  customStorage?: Storage,
): { ok: boolean; save?: SaveGame; error?: string } {
  const storage = getStorage(customStorage);
  const next: SaveGame = {
    ...save,
    schemaVersion: SAVE_SCHEMA_VERSION,
    slotId,
    revision: (save.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const check = validateSaveGame(next);
  if (!check.valid || !check.save) {
    return { ok: false, error: check.reason ?? 'Validation failed.' };
  }
  const key = `${STORAGE_PREFIX}${slotId}`;
  const backupKey = `${key}${BACKUP_SUFFIX}`;
  const serialized = JSON.stringify(check.save);

  if (storage) {
    try {
      const prev = storage.getItem(key);
      if (prev) {
        storage.setItem(backupKey, prev);
      }
      storage.setItem(key, serialized);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Storage write failed.' };
    }
  }
  void mirrorToIdb(key, serialized);
  return { ok: true, save: check.save };
}

/**
 * Loads a save slot with automatic corruption recovery from the previous verified backup.
 */
export function readSaveSlot(
  slotId: SaveSlotId,
  customStorage?: Storage,
): { save: SaveGame | null; recoveredFromBackup: boolean; error?: string } {
  const storage = getStorage(customStorage);
  if (!storage) return { save: null, recoveredFromBackup: false };

  const key = `${STORAGE_PREFIX}${slotId}`;
  const backupKey = `${key}${BACKUP_SUFFIX}`;

  const tryParse = (raw: string | null) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const checked = validateSaveGame(parsed);
      return checked.valid && checked.save ? checked.save : null;
    } catch {
      return null;
    }
  };

  const primary = tryParse(storage.getItem(key));
  if (primary) {
    return { save: primary, recoveredFromBackup: false };
  }

  const backup = tryParse(storage.getItem(backupKey));
  if (backup) {
    // Self-heal primary slot from verified backup
    try {
      storage.setItem(key, JSON.stringify(backup));
    } catch {
      // ignore quota error during heal
    }
    return { save: backup, recoveredFromBackup: true };
  }

  const hadPrimary = storage.getItem(key) !== null;
  return {
    save: null,
    recoveredFromBackup: false,
    error: hadPrimary ? 'Save slot corrupted and no valid backup was available.' : undefined,
  };
}

export function listSaveSlots(customStorage?: Storage): Array<{
  slotId: SaveSlotId;
  save: SaveGame | null;
  recoveredFromBackup: boolean;
}> {
  return SAVE_SLOTS.map((slotId) => {
    const res = readSaveSlot(slotId, customStorage);
    return { slotId, save: res.save, recoveredFromBackup: res.recoveredFromBackup };
  });
}

export function getMostRecentSave(customStorage?: Storage): SaveGame | null {
  const all = listSaveSlots(customStorage)
    .map((s) => s.save)
    .filter((s): s is SaveGame => s !== null);
  if (!all.length) return null;
  all.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return all[0];
}

export function deleteSaveSlot(slotId: SaveSlotId, customStorage?: Storage): void {
  const storage = getStorage(customStorage);
  if (!storage) return;
  const key = `${STORAGE_PREFIX}${slotId}`;
  storage.removeItem(key);
  storage.removeItem(`${key}${BACKUP_SUFFIX}`);
}

export function loadGameSettings(customStorage?: Storage): GameSettings {
  const defaults = createDefaultSettings();
  const storage = getStorage(customStorage);
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...defaults,
      ...parsed,
      bindings: { ...DEFAULT_KEY_BINDINGS, ...(parsed.bindings ?? {}) },
    };
  } catch {
    return defaults;
  }
}

export function saveGameSettings(settings: GameSettings, customStorage?: Storage): void {
  const storage = getStorage(customStorage);
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota error
  }
}
