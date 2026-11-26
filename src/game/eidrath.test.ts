import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import { AnimationController } from './animation/AnimationController';
import { CinematicCamera } from './camera/CinematicCamera';

import {
  ATTACKS,
  FROSTHEIM_LANDMARKS,
  validateEidrathContent,
} from '../content/eidrathContent';
import { EIDRATH_ASSET_MANIFEST, isAssetVisualQaApproved, listManifestAssets } from './assets/manifest';
import {
  advanceCombatTimeline,
  canRegisterHitOnTarget,
  classifyHitDirection,
  computeChargedAttackMultiplier,
  computeDamageAmount,
  consumeBufferedInput,
  createCombatInputBuffer,
  createCombatTimeline,
  getMountainWardenDamageTakenMultiplier,
  getMountainWardenPhase,
  getWeaponMovesetTiming,
  queueCombatInput,
  resolveDefenderHit,
  startAttackAction,
  startDodgeAction,
  startGuardAction,
} from './combat/combatRules';
import {
  addInventoryItem,
  applyDialogueChoice,
  buyFromMerchant,
  craftOrUpgradeRecipe,
  dropInventoryItem,
  emitQuestEvent,
  equipInventoryItem,
  getItemQuantity,
  resetAllSkills,
  sellToMerchant,
  unlockSkillNode,
} from './rpg/rpgLogic';
import {
  createDefaultSettings,
  createNewGameSave,
  readSaveSlot,
  validateSaveGame,
  writeSaveSlot,
} from './save/saveSystem';
import {
  getActiveChunkKeys,
  getSurfaceKindAt,
  getTerrainHeight,
  getTerrainSlopeDeg,
  isInsidePlayableBounds,
} from './world/frostheimTerrain';
import { MAX_BRIDGE_GLB_BYTES, validateGlbHeader } from '../utils/blenderBridge';

// Minimal in-memory localStorage mock for Node test runner
function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true });
  return store;
}

test('QA-01/Content: validateEidrathContent passes with zero broken references or skill cycles', () => {
  const result = validateEidrathContent();
  assert.equal(result.valid, true, `Content errors: ${result.errors.join('; ')}`);
  assert.equal(FROSTHEIM_LANDMARKS.length, 8);
});

test('QA-02/QA-04: Frostheim terrain heightfield, landmarks, slopes, natural bounds, and 5x5 chunks', () => {
  const tombY = getTerrainHeight(-145, 145);
  const villageY = getTerrainHeight(-10, 36);
  const keepY = getTerrainHeight(6, -146);

  assert.ok(keepY > villageY + 8, 'Warden Keep must sit visibly elevated above Ravenhold');
  assert.ok(getTerrainSlopeDeg(-10, 36) < 10, 'Ravenhold village basin must be flat and walkable');
  assert.ok(getTerrainSlopeDeg(6, -146) < 10, 'Warden courtyard must be flat and playable');
  assert.equal(isInsidePlayableBounds(0, 0), true);
  assert.equal(isInsidePlayableBounds(240, 240), false);
  assert.ok(tombY > 4, 'Oathgrave highland elevation preserved');

  const chunks = getActiveChunkKeys(-10, 36, 1);
  assert.ok(chunks.length >= 4 && chunks.length <= 9);
});

test('QA-03: Combat state machine, single-hit per attackInstanceId, dodge i-frames, parry, and guard break', () => {
  const tl = createCombatTimeline();
  const start = startAttackAction(tl, 'light_1', 100, 80);
  assert.equal(start.started, true);
  assert.equal(tl.state, 'windup');

  // Advance into active window across two normal clamped simulation steps (160ms total > 150ms windup)
  advanceCombatTimeline(tl, 80);
  assert.equal(tl.state, 'windup');
  advanceCombatTimeline(tl, 80);
  assert.equal(tl.state, 'active');

  // Same attack instance must hit a given enemy ONCE only
  assert.equal(canRegisterHitOnTarget(tl.activeAction, 'enm_1'), true);
  assert.equal(canRegisterHitOnTarget(tl.activeAction, 'enm_1'), false);
  assert.equal(canRegisterHitOnTarget(tl.activeAction, 'enm_2'), true);

  // Advance through recovery back to idle
  advanceCombatTimeline(tl, 100);
  advanceCombatTimeline(tl, 100);
  advanceCombatTimeline(tl, 100);
  advanceCombatTimeline(tl, 100);
  assert.equal(tl.state, 'idle');

  // Dodge i-frames avoid damage completely
  const dodged = startDodgeAction(tl, 100, 18);
  assert.equal(dodged.started, true);
  const evadeOutcome = resolveDefenderHit({
    timeline: tl,
    attack: ATTACKS.warden_slam,
    incomingDamage: 60,
    defenderStamina: 80,
    guardMitigationPct: 0,
  });
  assert.equal(evadeOutcome.result, 'evaded');
  assert.equal(evadeOutcome.hpDamage, 0);

  // Perfect parry within 180ms staggers attacker and takes 0 HP damage
  const guardTl = createCombatTimeline();
  startGuardAction(guardTl, 180);
  const parryOutcome = resolveDefenderHit({
    timeline: guardTl,
    attack: ATTACKS.enm_slash,
    incomingDamage: 25,
    defenderStamina: 60,
    guardMitigationPct: 0,
  });
  assert.equal(parryOutcome.result, 'parried');
  assert.equal(parryOutcome.hpDamage, 0);
  assert.ok(parryOutcome.attackerStaggerMs > 1000);

  // Guard break when stamina insufficient for block
  advanceCombatTimeline(guardTl, 100);
  advanceCombatTimeline(guardTl, 100);
  const breakOutcome = resolveDefenderHit({
    timeline: guardTl,
    attack: ATTACKS.enm_knight_cleave,
    incomingDamage: 30,
    defenderStamina: 5,
    guardMitigationPct: 0,
  });
  assert.equal(breakOutcome.result, 'guard_broken');
  assert.equal(guardTl.state, 'stagger');

  const dmg = computeDamageAmount({
    baseDamage: 18,
    weaponDamage: 30,
    buildMultiplier: 1.2,
    armorValue: 20,
    difficultyMultiplier: 1.0,
    isCrit: true,
  });
  assert.ok(dmg > 30);
});

test('QA-05/QA-06: Quests anti-duplicate rewards, 2H equip rules, skill prereqs, atomic crafting & vendor guards', () => {
  const save = createNewGameSave('slot_1');

  // Equip 1H sword + shield, then equip 2H Oathbreaker -> offhand shield automatically unequipped
  addInventoryItem(save, 'wpn_iron_sword', 1);
  addInventoryItem(save, 'wpn_iron_shield', 1);
  addInventoryItem(save, 'wpn_oathbreaker', 1);
  assert.equal(equipInventoryItem(save, 'wpn_iron_sword').ok, true);
  assert.equal(equipInventoryItem(save, 'wpn_iron_shield').ok, true);
  assert.equal(save.player.equipment.offHand, 'wpn_iron_shield');

  assert.equal(equipInventoryItem(save, 'wpn_oathbreaker').ok, true);
  assert.equal(save.player.equipment.mainHand, 'wpn_oathbreaker');
  assert.equal(save.player.equipment.offHand, undefined);

  // Quest-protected Oathbreaker cannot be discarded or sold
  assert.equal(dropInventoryItem(save, 'wpn_oathbreaker').ok, false);
  assert.equal(sellToMerchant(save, 'wpn_oathbreaker').ok, false);

  // Skill prerequisite enforcement & reset refund
  assert.equal(unlockSkillNode(save, 'war_breaker').ok, false, 'Tier-2 skill blocked before Tier-1');
  assert.equal(unlockSkillNode(save, 'war_iron_edge').ok, true);
  assert.equal(unlockSkillNode(save, 'war_breaker').ok, true);
  const reset = resetAllSkills(save);
  assert.equal(reset.refunded, 2);
  assert.equal(save.player.skillPoints, 2);

  // Atomic crafting rejects insufficient gold/materials without mutating state
  const goldBefore = save.player.gold;
  const craftFail = craftOrUpgradeRecipe(save, 'rcp_upgrade_oathbreaker_1');
  assert.equal(craftFail.ok, false);
  assert.equal(save.player.gold, goldBefore);

  // Provide materials + gold -> craft succeeds atomically (30g + 2 Frost Iron)
  addInventoryItem(save, 'mat_frost_iron', 3);
  save.player.gold = 200;
  const craftOk = craftOrUpgradeRecipe(save, 'rcp_upgrade_oathbreaker_1');
  assert.equal(craftOk.ok, true);
  assert.equal(save.player.gold, 170);
  assert.equal(getItemQuantity(save, 'mat_frost_iron'), 1);

  // Vendor rejects purchase with insufficient gold without mutating state
  save.player.gold = 5;
  const buyFail = buyFromMerchant(save, 'wpn_frost_axe');
  assert.equal(buyFail.ok, false);
  assert.equal(save.player.gold, 5);

  // Complete starter quest q_broken_oath -> grants rewards once and unlocks follow-ups
  emitQuestEvent(save, 'collect', 'wpn_iron_sword');
  applyDialogueChoice(save, 'dlg_lyra_intro', 'ch_lyra_mercy');
  assert.equal(save.companion.activeId, 'lyra');
  assert.ok(save.companion.loyalty > 50);
  emitQuestEvent(save, 'discover', 'lm_ravenhold');
  const goldPreReward = save.player.gold;
  emitQuestEvent(save, 'talk', 'npc_edda');
  assert.equal(save.quests.q_broken_oath.status, 'completed');
  assert.equal(save.quests.q_broken_oath.rewardClaimed, true);
  assert.equal(save.player.gold, goldPreReward + 65);
  assert.ok(save.quests.q_blade_remembered, 'Follow-up quest auto-unlocked');
  assert.ok(save.quests.q_wardens_oath, 'Warden quest auto-unlocked');

  // Re-emitting talk event must NEVER duplicate reward
  emitQuestEvent(save, 'talk', 'npc_edda');
  assert.equal(save.player.gold, goldPreReward + 65);
});

test('QA-07: Mountain Warden 3-phase thresholds and Phase-2 Seal Stone armor mitigation', () => {
  assert.equal(getMountainWardenPhase(900, 900).phase, 1);
  assert.equal(getMountainWardenPhase(540, 900).phase, 2);
  assert.equal(getMountainWardenPhase(225, 900).phase, 3);

  const p2Full = getMountainWardenDamageTakenMultiplier(2, 2);
  const p2One = getMountainWardenDamageTakenMultiplier(2, 1);
  const p2None = getMountainWardenDamageTakenMultiplier(2, 0);
  const p3Cracked = getMountainWardenDamageTakenMultiplier(3, 0);
  assert.ok(p2Full < p2One && p2One < p2None, 'Breaking Seal Stones progressively reduces Warden armor');
  assert.ok(p3Cracked > 1.0, 'Phase 3 cracked armor takes bonus damage');
});

test('QA-08: All 55 Blender 5.3 .glb runtime assets exist with valid glTF v2 headers & scale contracts', () => {
  const allAssets = listManifestAssets();
  assert.equal(allAssets.length, 55);
  assert.ok(EIDRATH_ASSET_MANIFEST.boss_warden.expectedHeightM > 3.5, 'Boss not normalized to hero height');
  assert.ok(EIDRATH_ASSET_MANIFEST.chr_kaelen.expectedHeightM >= 1.85 && EIDRATH_ASSET_MANIFEST.chr_kaelen.expectedHeightM <= 1.95);

  const publicRoot = path.resolve(process.cwd(), 'public');
  let totalBytes = 0;
  for (const asset of allAssets) {
    const absPath = path.join(publicRoot, asset.url.replace(/^\//, ''));
    assert.equal(fs.existsSync(absPath), true, `Missing runtime GLB: ${absPath}`);
    const buf = fs.readFileSync(absPath);
    totalBytes += buf.byteLength;
    assert.ok(buf.byteLength <= MAX_BRIDGE_GLB_BYTES, `${asset.id} exceeds 10MB bridge limit`);
    const check = validateGlbHeader(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    assert.equal(check.valid, true, `Invalid GLB header on ${asset.id}: ${check.reason}`);
  }
  assert.ok(totalBytes < 60 * 1024 * 1024, 'Initial Frostheim realistic PBR asset footprint stays under 60MB target');

  // Verify invalid GLB binary is explicitly rejected
  const corrupt = new TextEncoder().encode('NOT_A_VALID_GLB_BINARY_PAYLOAD');
  assert.equal(validateGlbHeader(corrupt).valid, false);
});

test('QA-09: Versioned SaveGame v1 persistence, corrupt backup recovery, and legacy skyforge preservation', () => {
  const store = installMockLocalStorage();
  const mockStorage = globalThis.localStorage;
  // Seed legacy Skyforge Arena record to prove we never overwrite or delete it
  store.set('skyforge_progress_v1', JSON.stringify({ highestWave: 9, bestScore: 4200 }));

  const save1 = createNewGameSave('slot_1');
  save1.player.gold = 333;
  save1.world.defeatedBosses.push('mountain_warden');
  assert.equal(writeSaveSlot('slot_1', save1, mockStorage).ok, true);

  // Second save rotates first valid save into _backup
  const save2 = { ...save1, revision: 2, player: { ...save1.player, gold: 444 } };
  assert.equal(writeSaveSlot('slot_1', save2, mockStorage).ok, true);

  // Corrupt primary slot_1 JSON -> readSaveSlot must transparently recover backup!
  store.set('eidrath_save_v1_slot_1', '{CORRUPT_JSON!!!');
  const recovered = readSaveSlot('slot_1', mockStorage);
  assert.equal(recovered.recoveredFromBackup, true, 'Corrupt save must recover from valid backup');
  assert.equal(recovered.save?.player.gold, 333);
  assert.ok(recovered.save?.world.defeatedBosses.includes('mountain_warden'));

  // Legacy Skyforge record completely untouched
  assert.equal(store.get('skyforge_progress_v1'), JSON.stringify({ highestWave: 9, bestScore: 4200 }));

  // Invalid schema version rejected
  assert.equal(validateSaveGame({ schemaVersion: 999 }).valid, false);
});

test('QA-10: Overhaul combat input buffering, weapon timing weights, directional hits & surface classification', () => {
  // 240ms combat input buffer
  const buf = createCombatInputBuffer();
  queueCombatInput(buf, 'light_attack', 1000, 240);
  assert.equal(consumeBufferedInput(buf, 1180), 'light_attack');
  assert.equal(consumeBufferedInput(buf, 1190), null, 'Buffer must consume once');

  queueCombatInput(buf, 'dodge', 2000, 200);
  assert.equal(consumeBufferedInput(buf, 2300), null, 'Expired buffer must return null');

  // Heavy weapons feel heavier than daggers/swords
  const dagger = getWeaponMovesetTiming('wpn_nightpiercer');
  const hammer = getWeaponMovesetTiming('wpn_worldshatter');
  assert.ok(dagger.windupMult < 1.0 && hammer.windupMult > 1.2);
  assert.ok(hammer.poiseMult > dagger.poiseMult);

  // Charged heavy scaling
  const uncharged = computeChargedAttackMultiplier(0);
  const fullCharge = computeChargedAttackMultiplier(0.9);
  assert.equal(uncharged.isFullyCharged, false);
  assert.equal(fullCharge.isFullyCharged, true);
  assert.ok(fullCharge.damageMult >= 1.8);

  // Directional hit reaction classification
  assert.equal(classifyHitDirection({ x: 0, z: 5 }, { x: 0, z: 0 }, 0), 'front');
  assert.equal(classifyHitDirection({ x: 0, z: -5 }, { x: 0, z: 0 }, 0), 'back');
  assert.equal(classifyHitDirection({ x: 5, z: 0 }, { x: 0, z: 0 }, 0), 'right');
  assert.equal(classifyHitDirection({ x: -5, z: 0 }, { x: 0, z: 0 }, 0), 'left');

  // Surface material detection for footstep Foley audio
  assert.equal(getSurfaceKindAt(-10, 36), 'stone');
  assert.equal(getSurfaceKindAt(-72, 92), 'wood');
  assert.equal(getSurfaceKindAt(96, -58), 'water');
  assert.equal(getSurfaceKindAt(40, 60), 'snow');

  // Default Settings contract & Visual QA Gate helper
  const defs = createDefaultSettings();
  assert.equal(defs.developerMode, false);
  assert.equal(defs.fov, 56);
  assert.equal(defs.cameraDistance, 3.4);
  assert.equal(isAssetVisualQaApproved({ ...EIDRATH_ASSET_MANIFEST.chr_kaelen, inspectedInGame: false }), false);
  assert.equal(
    isAssetVisualQaApproved({
      ...EIDRATH_ASSET_MANIFEST.chr_kaelen,
      integrationStatus: 'integrated',
      status: 'approved',
      visualQaStatus: 'approved',
      inspectedInGame: true,
    }),
    true,
  );
});

test('Cowork: one-shot animation emits terminal markers once and fallback combo restarts', () => {
  const root = new THREE.Object3D();
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map([['lightattack', new THREE.AnimationClip('LightAttack', 1, [])]]);
  const events: string[] = [];
  const ctrl = new AnimationController(mixer, clips, { onEvent: (event) => events.push(event) });
  ctrl.play('LightAttack', { loop: false, fadeSec: 0 });
  ctrl.update(0.2);
  ctrl.update(0.8);
  ctrl.update(0.1);
  assert.deepEqual(events, ['swing_whoosh', 'hitbox_start', 'hitbox_end']);
  ctrl.play('LightAttack2', { loop: false, fadeSec: 0 });
  ctrl.update(0.7);
  assert.equal(events.filter((e) => e === 'hitbox_start').length, 2);
  ctrl.dispose();
});

test('Cowork: animation switching from a loop to one-shot on same fallback restarts', () => {
  const root = new THREE.Object3D();
  const mixer = new THREE.AnimationMixer(root);
  const idle = new THREE.AnimationClip('Idle', 1, []);
  const ctrl = new AnimationController(mixer, new Map([['idle', idle]]));
  ctrl.play('Idle');
  ctrl.update(0.5);
  ctrl.play('DrawSword', { loop: false, fadeSec: 0 });
  const action = mixer.clipAction(idle);
  assert.equal(action.loop, THREE.LoopOnce);
  assert.equal(action.time, 0);
  ctrl.dispose();
});

test('Cowork: heavy stamina gating uses the actual scaled cost', () => {
  const attack = ATTACKS.heavy_1;
  const scaled = Math.round(attack.staminaCost * 1.25);
  const timeline = createCombatTimeline();
  assert.equal(startAttackAction(timeline, 'heavy_1', scaled - 1, 100, 1.25).started, false);
  const result = startAttackAction(timeline, 'heavy_1', scaled, 100, 1.25);
  assert.equal(result.started, true);
  assert.equal(result.staminaCost, scaled);
});

test('Cowork: invalid save sections are rejected; corrupt primary cannot overwrite good backup', () => {
  const store = installMockLocalStorage();
  const storage = globalThis.localStorage;
  const save = createNewGameSave('slot_1');
  assert.equal(validateSaveGame({ ...save, companion: undefined }).valid, false);
  assert.equal(validateSaveGame({ ...save, world: { ...save.world, openedChests: null } }).valid, false);
  assert.equal(validateSaveGame({ ...save, player: { ...save.player, stamina: undefined } }).valid, false);
  assert.equal(validateSaveGame({ ...save, slotId: 'unknown' }).valid, false);
  save.player.gold = 123;
  assert.equal(writeSaveSlot('slot_1', save, storage).ok, true);
  save.player.gold = 456;
  assert.equal(writeSaveSlot('slot_1', save, storage).ok, true);
  const backup = store.get('eidrath_save_v1_slot_1_backup');
  store.set('eidrath_save_v1_slot_1', '{corrupt');
  save.player.gold = 789;
  assert.equal(writeSaveSlot('slot_1', save, storage).ok, true);
  assert.equal(store.get('eidrath_save_v1_slot_1_backup'), backup);
  store.set('eidrath_save_v1_slot_1', JSON.stringify(createNewGameSave('slot_2')));
  assert.equal(readSaveSlot('slot_1', storage).save?.player.gold, 123);
});

test('Cowork: camera pulls in immediately when a wall intersects the actual shoulder path', () => {
  const camera = new THREE.PerspectiveCamera(56, 1, 0.05, 200);
  const rig = new CinematicCamera({ baseDistance: 3.4, reducedMotion: true });
  rig.yaw = 0;
  rig.pitch = 0;
  const playerPos = new THREE.Vector3(-145, getTerrainHeight(-145, 145), 145);
  const params = { playerPos, playerYaw: 0, inCombat: false, isSprinting: false, isBossFight: false, lockedTargetPos: null, collisionMeshes: [] as THREE.Object3D[] };
  rig.update(camera, 1 / 60, params);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.25), new THREE.MeshBasicMaterial());
  wall.position.set(playerPos.x, playerPos.y + 1.5, playerPos.z + 1.5);
  wall.updateMatrixWorld(true);
  params.collisionMeshes = [wall];
  rig.update(camera, 1 / 60, params);
  assert.ok(camera.position.z < wall.position.z - 0.125, 'Camera must remain in front of the wall');
  wall.geometry.dispose();
  (wall.material as THREE.Material).dispose();
});

test('Cowork: imported runtime assets are not visually approved by default', () => {
  assert.ok(listManifestAssets().every((asset) => !isAssetVisualQaApproved(asset)));
});
