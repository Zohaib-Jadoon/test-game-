export type AssetCategory =
  | 'hero'
  | 'companion'
  | 'npc'
  | 'enemy'
  | 'boss'
  | 'weapon'
  | 'world'
  | 'prop';

export interface AssetDefinition {
  id: string;
  meshName: string;
  category: AssetCategory;
  url: string;
  blendSource: string;
  expectedHeightM: number;
  pivot: 'feet' | 'grip' | 'base';
  animations: string[];
  sockets?: string[];
  hasCollider?: boolean;
  provenance: string;
  status: 'approved' | 'pending';
}

export type DamageType =
  | 'physical'
  | 'frost'
  | 'fire'
  | 'lightning'
  | 'poison'
  | 'arcane'
  | 'divine';

export type ItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythical'
  | 'divine';

export type EquipSlot =
  | 'mainHand'
  | 'offHand'
  | 'head'
  | 'chest'
  | 'arms'
  | 'legs'
  | 'cloak'
  | 'amulet';

export type ItemType = 'weapon' | 'shield' | 'armor' | 'consumable' | 'material' | 'quest';

export type WeaponMoveset = 'sword' | 'greatsword' | 'axe' | 'hammer' | 'bow' | 'staff' | 'links';

export interface ItemStats {
  damage?: number;
  armor?: number;
  poise?: number;
  critChance?: number;
  manaBonus?: number;
  staminaBonus?: number;
  hpBonus?: number;
  healHp?: number;
  restoreMana?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  slot?: EquipSlot;
  twoHanded?: boolean;
  moveset?: WeaponMoveset;
  damageType?: DamageType;
  meshAssetId?: string;
  levelReq: number;
  stats: ItemStats;
  weight: number;
  price: number;
  stackable: boolean;
  questProtected?: boolean;
  lore: string;
}

export interface InventoryEntry {
  itemId: string;
  quantity: number;
  upgradeLevel?: number;
}

export interface AttackDefinition {
  id: string;
  name: string;
  animation: string;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  staminaCost: number;
  manaCost?: number;
  damage: number;
  damageType: DamageType;
  hitShape: 'arc' | 'thrust' | 'slam' | 'projectile' | 'nova';
  range: number;
  arcRad: number;
  poiseDamage: number;
  blockable: boolean;
  parryable: boolean;
  cancelAfterRecoveryMs?: number;
  vfxId: string;
  sfxId: string;
}

export type SkillTreeId =
  | 'warrior'
  | 'guardian'
  | 'assassin'
  | 'mage'
  | 'summoner'
  | 'divinity'
  | 'crafting';

export interface SkillNode {
  id: string;
  tree: SkillTreeId;
  name: string;
  description: string;
  cost: number;
  maxRank: number;
  prerequisites: string[];
  effects: {
    maxHp?: number;
    maxStamina?: number;
    maxMana?: number;
    meleeDamagePct?: number;
    heavyStaggerPct?: number;
    parryWindowMs?: number;
    guardMitigationPct?: number;
    stealthCritPct?: number;
    rangedDamagePct?: number;
    spellDamagePct?: number;
    companionDamagePct?: number;
    divineGainPct?: number;
    craftBonusPct?: number;
  };
}

export type QuestObjectiveType =
  | 'discover'
  | 'talk'
  | 'collect'
  | 'investigate'
  | 'defeat'
  | 'rescue'
  | 'craft'
  | 'activate'
  | 'choose'
  | 'return';

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  targetId: string;
  description: string;
  requiredCount: number;
  optional?: boolean;
  waypoint?: { x: number; z: number; label: string };
}

export interface QuestDefinition {
  id: string;
  title: string;
  category: 'main' | 'side';
  regionId: string;
  summary: string;
  prerequisites: string[];
  objectives: QuestObjective[];
  rewards: {
    xp: number;
    gold: number;
    items?: Array<{ itemId: string; quantity: number }>;
    divineDomain?: DomainId;
    worldFlag?: string;
    factionRep?: Partial<Record<FactionId, number>>;
  };
}

export interface DialogueChoice {
  id: string;
  text: string;
  tone: 'mercy' | 'pragmatic' | 'revenge' | 'neutral';
  nextNodeId: string | null;
  requiresFlag?: string;
  effects?: {
    setFlag?: string;
    lyraLoyalty?: number;
    corruption?: number;
    factionRep?: Partial<Record<FactionId, number>>;
    startQuestId?: string;
    triggerEvent?: { type: QuestObjectiveType; targetId: string };
    openUi?: 'crafting' | 'merchant';
    grantItem?: { itemId: string; quantity: number };
  };
}

export interface DialogueNode {
  id: string;
  speaker: string;
  speakerRole: string;
  line: string;
  choices: DialogueChoice[];
}

export interface CraftingRecipe {
  id: string;
  name: string;
  category: 'forge' | 'upgrade' | 'alchemy' | 'enchant';
  description: string;
  goldCost: number;
  ingredients: Array<{ itemId: string; quantity: number }>;
  outputItemId?: string;
  outputQuantity?: number;
  upgradeTargetItemId?: string;
  maxUpgradeLevel?: number;
  requiresFlag?: string;
}

export interface LoreEntry {
  id: string;
  title: string;
  category: 'covenant' | 'frostheim' | 'characters' | 'gods';
  excerpt: string;
  body: string;
  initiallyUnlocked?: boolean;
}

export type DomainId =
  | 'war'
  | 'death'
  | 'nature'
  | 'time'
  | 'knowledge'
  | 'life'
  | 'chaos';

export type DomainState = 'bound' | 'slain' | 'redeemed' | 'restored';

export type FactionId =
  | 'iron_covenant'
  | 'arcane_circle'
  | 'silent_hand'
  | 'silver_order'
  | 'crown_legion'
  | 'free_kingdoms'
  | 'ashen_cult'
  | 'eternal_forge';

export type EnemyArchetypeId =
  | 'hollow_swordsman'
  | 'hollow_archer'
  | 'hollow_knight'
  | 'frost_wolf'
  | 'bandit'
  | 'frost_troll'
  | 'mountain_warden';

export interface EnemyArchetypeDef {
  id: EnemyArchetypeId;
  name: string;
  assetId: string;
  maxHp: number;
  poise: number;
  moveSpeed: number;
  chaseSpeed: number;
  detectionRange: number;
  attackRange: number;
  preferredRange: number;
  radius: number;
  height: number;
  xpReward: number;
  goldReward: number;
  lootTable: Array<{ itemId: string; chance: number; quantity: number }>;
  attacks: string[];
  hasShield?: boolean;
  isBoss?: boolean;
}

export interface BossPhaseDef {
  phase: 1 | 2 | 3;
  hpThresholdPct: number;
  title: string;
  attackIds: string[];
  maxAdds: number;
  armorMultiplier: number;
  transitionBanner: string;
}

export interface LandmarkDef {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  discoverRadius: number;
  kind: 'tomb' | 'village' | 'forest' | 'cave' | 'keep' | 'shrine' | 'ruin';
  fastTravel?: boolean;
  safeZone?: boolean;
}

export type DifficultyId = 'story' | 'normal' | 'hard' | 'oathsworn';
export type QualityPreset = 'low' | 'medium' | 'high';
export type CompanionCommand = 'assist' | 'attack' | 'regroup' | 'wait';

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  sprint: string;
  dodge: string;
  jump: string;
  interact: string;
  block: string;
  ascension: string;
  sneak: string;
  lockOn: string;
}

export interface GameSettings {
  quality: QualityPreset;
  difficulty: DifficultyId;
  subtitles: boolean;
  cameraShake: boolean;
  reducedMotion: boolean;
  highContrastCues: boolean;
  mouseSensitivity: number;
  masterVolume: number;
  muted: boolean;
  bindings: KeyBindings;
}

export interface AttributesState {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  divineCapacity: number;
}

export interface QuestProgressState {
  status: 'active' | 'completed' | 'failed';
  counts: Record<string, number>;
  rewardClaimed: boolean;
}

export interface WorldState {
  regionId: string;
  worldTimeHours: number; // 0..24
  weather: 'clear' | 'snow' | 'blizzard';
  weatherSeed: number;
  discoveredLandmarks: string[];
  openedChests: string[];
  solvedPuzzles: string[];
  defeatedBosses: string[];
  unlockedShortcuts: string[];
  flags: Record<string, boolean>;
  domains: Record<DomainId, DomainState>;
  factions: Record<FactionId, number>;
  corruption: number;
  unlockedLore: string[];
}

export interface SaveGame {
  schemaVersion: 1;
  slotId: string;
  revision: number;
  updatedAt: string;
  playtimeSec: number;
  regionName: string;
  checkpointId: string;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    mana: number;
    maxMana: number;
    divineMeter: number;
    level: number;
    xp: number;
    skillPoints: number;
    gold: number;
    attributes: AttributesState;
    skills: Record<string, number>;
    equipment: Partial<Record<EquipSlot, string>>;
    inventory: InventoryEntry[];
    unlockedAbilities: string[];
  };
  companion: {
    activeId: 'lyra' | null;
    loyalty: number;
    command: CompanionCommand;
  };
  quests: Record<string, QuestProgressState>;
  trackedQuestId: string | null;
  world: WorldState;
}

export type ActorActionState =
  | 'idle'
  | 'locomotion'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'guard'
  | 'dodge'
  | 'stagger'
  | 'dead'
  | 'interact';

export interface ActiveInteractPrompt {
  id: string;
  kind: 'npc' | 'chest' | 'puzzle' | 'shrine' | 'pickup' | 'shortcut' | 'forge';
  label: string;
  sublabel?: string;
}

export interface BossHudInfo {
  id: string;
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  sealStonesRemaining: number;
  telegraph: 'none' | 'parryable' | 'unblockable';
}

export interface EnemyRadarBlip {
  id: string;
  bearingRad: number;
  isBoss: boolean;
  alerted: boolean;
}

export interface HudSnapshot {
  mode: 'title' | 'playing' | 'paused' | 'dialogue' | 'menu' | 'dead';
  regionLabel: string;
  landmarkBanner: string;
  notificationText: string;
  subtitleText: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  divineMeter: number;
  ascensionRemainingSec: number;
  actionState: ActorActionState;
  inCombat: boolean;
  stealthState: 'hidden' | 'caution' | 'detected';
  stealthEyePct: number;
  lockedTargetName: string | null;
  lockedTargetHpPct: number;
  lockedTargetPoisePct: number;
  incomingCue: 'none' | 'parryable' | 'unblockable';
  parryFlashSec: number;
  damageFlashSec: number;
  cameraHeadingRad: number;
  waypointBearingRad: number | null;
  waypointDistanceM: number | null;
  waypointLabel: string | null;
  enemyBlips: EnemyRadarBlip[];
  interactPrompt: ActiveInteractPrompt | null;
  trackedQuestTitle: string | null;
  trackedObjectiveText: string | null;
  boss: BossHudInfo | null;
  companionName: string | null;
  companionCommand: CompanionCommand;
  companionHpPct: number;
  equippedWeaponName: string;
  potionCount: number;
  manaPotionCount: number;
  abilityCooldowns: [number, number, number, number];
  worldTimeHours: number;
  weather: 'clear' | 'snow' | 'blizzard';
  playerX: number;
  playerZ: number;
  level: number;
  xp: number;
  nextLevelXp: number;
  gold: number;
  skillPoints: number;
  pointerLocked: boolean;
  fps: number;
  drawCalls: number;
}
