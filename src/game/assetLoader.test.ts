import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  BLENDER_CITADEL_KIT,
  BLENDER_DEFAULT_PROP_URL,
  BLENDER_ENEMY_MODELS,
  BLENDER_HERO_MODELS,
  BLENDER_WEAPON_MODELS,
  resolveAnimationClip,
} from './assetLoader';
import { generateBlenderAddonScript, validateGlbHeader } from '../utils/blenderBridge';

function parseGlbJson(filePath: string): {
  animations?: Array<{ name?: string }>;
  skins?: unknown[];
  meshes?: unknown[];
} {
  const buf = fs.readFileSync(filePath);
  const check = validateGlbHeader(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  assert.equal(check.valid, true, `${path.basename(filePath)} failed GLB header check: ${check.reason}`);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonChunkLen = view.getUint32(12, true);
  const jsonText = buf.subarray(20, 20 + jsonChunkLen).toString('utf8');
  return JSON.parse(jsonText);
}

test('resolveAnimationClip maps exact and fuzzy Mixamo/Blender clip names to arena states', () => {
  const exactClips = [
    new THREE.AnimationClip('Idle', 1, []),
    new THREE.AnimationClip('Run', 1, []),
    new THREE.AnimationClip('Attack', 1, []),
    new THREE.AnimationClip('Dash', 1, []),
  ];
  assert.equal(resolveAnimationClip(exactClips, 'idle')?.name, 'Idle');
  assert.equal(resolveAnimationClip(exactClips, 'run')?.name, 'Run');
  assert.equal(resolveAnimationClip(exactClips, 'attack')?.name, 'Attack');
  assert.equal(resolveAnimationClip(exactClips, 'dash')?.name, 'Dash');

  const thirdPartyClips = [
    new THREE.AnimationClip('Armature|Stand_Wait', 1, []),
    new THREE.AnimationClip('Armature|Sprint_Forward', 1, []),
    new THREE.AnimationClip('Armature|Bow_Shoot', 1, []),
    new THREE.AnimationClip('Armature|Evade_Roll', 1, []),
  ];
  assert.equal(resolveAnimationClip(thirdPartyClips, 'idle')?.name, 'Armature|Stand_Wait');
  assert.equal(resolveAnimationClip(thirdPartyClips, 'run')?.name, 'Armature|Sprint_Forward');
  assert.equal(resolveAnimationClip(thirdPartyClips, 'attack')?.name, 'Armature|Bow_Shoot');
  assert.equal(resolveAnimationClip(thirdPartyClips, 'dash')?.name, 'Armature|Evade_Roll');

  assert.equal(resolveAnimationClip([], 'idle'), null);
});

test('all shipped Blender 5.3 hero GLB assets are valid skinned glTF 2.0 binaries with 4 NLA clips', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  for (const [heroId, relUrl] of Object.entries(BLENDER_HERO_MODELS)) {
    const absPath = path.join(publicDir, relUrl.replace(/^\//, ''));
    assert.equal(fs.existsSync(absPath), true, `Missing hero GLB for ${heroId}: ${absPath}`);
    const gltf = parseGlbJson(absPath);
    assert.ok((gltf.meshes?.length ?? 0) >= 1, `${heroId} must contain at least one mesh`);
    assert.ok((gltf.skins?.length ?? 0) >= 1, `${heroId} must contain armature skinning`);
    const names = (gltf.animations ?? []).map((a) => a.name);
    for (const expected of ['Idle', 'Run', 'Attack', 'Dash']) {
      assert.ok(names.includes(expected), `${heroId} missing animation clip "${expected}" (got ${names.join(', ')})`);
    }
  }
});

test('all shipped Blender 5.3 enemy and prop GLB/FBX assets exist and validate cleanly', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  const fbxDir = path.resolve(process.cwd(), 'blender', 'exports');

  for (const [kind, cfg] of Object.entries(BLENDER_ENEMY_MODELS)) {
    const absGlb = path.join(publicDir, cfg.url.replace(/^\//, ''));
    assert.equal(fs.existsSync(absGlb), true, `Missing enemy GLB for ${kind}`);
    const gltf = parseGlbJson(absGlb);
    assert.ok((gltf.skins?.length ?? 0) >= 1, `${kind} enemy must be rigged`);
    const names = (gltf.animations ?? []).map((a) => a.name);
    for (const expected of ['Idle', 'Run', 'Attack']) {
      assert.ok(names.includes(expected), `${kind} missing animation clip "${expected}"`);
    }
    assert.equal(fs.existsSync(path.join(fbxDir, `${kind}.fbx`)), true, `Missing FBX export for ${kind}`);
  }

  const propPath = path.join(publicDir, BLENDER_DEFAULT_PROP_URL.replace(/^\//, ''));
  assert.equal(fs.existsSync(propPath), true, 'Missing shipped citadel_obelisk.glb');
  const propGltf = parseGlbJson(propPath);
  assert.ok((propGltf.meshes?.length ?? 0) >= 1);
  assert.equal(fs.existsSync(path.join(fbxDir, 'citadel_obelisk.fbx')), true);
});

test('all Blender Director FPS weapon and Soulslike Citadel Kit GLB/FBX assets validate cleanly', () => {
  const publicDir = path.resolve(process.cwd(), 'public');
  const fbxDir = path.resolve(process.cwd(), 'blender', 'exports');
  const blendDir = path.resolve(process.cwd(), 'blender', 'sources');

  const expectedWeaponFbx: Record<keyof typeof BLENDER_WEAPON_MODELS, string> = {
    rangerBow: 'SM_Weapon_Shadowbow_A.fbx',
    rangerArrow: 'SM_Weapon_ShadowArrow_A.fbx',
    vanguardGlaive: 'SM_Weapon_RunicGlaive_A.fbx',
    sentinelWarhammer: 'SM_Weapon_CryptWarhammer_A.fbx',
    sentinelShield: 'SM_Weapon_TowerShield_A.fbx',
    roninOdachi: 'SM_Weapon_BloodmoonOdachi_A.fbx',
  };

  for (const [key, relUrl] of Object.entries(BLENDER_WEAPON_MODELS) as Array<
    [keyof typeof BLENDER_WEAPON_MODELS, string]
  >) {
    const absGlb = path.join(publicDir, relUrl.replace(/^\//, ''));
    assert.equal(fs.existsSync(absGlb), true, `Missing FPS weapon GLB: ${absGlb}`);
    const gltf = parseGlbJson(absGlb);
    assert.ok((gltf.meshes?.length ?? 0) >= 1, `${key} weapon GLB must contain geometry`);
    assert.equal(
      fs.existsSync(path.join(fbxDir, expectedWeaponFbx[key])),
      true,
      `Missing weapon FBX export: ${expectedWeaponFbx[key]}`,
    );
  }

  const expectedKitFbx: Record<keyof typeof BLENDER_CITADEL_KIT, string> = {
    brazierPillar: 'SM_Env_GothicBrazierPillar_01.fbx',
    cathedralSpire: 'SM_Env_CathedralSpire_01.fbx',
    nordicWordWall: 'SM_Env_NordicWordWall_01.fbx',
    nordicPine: 'SM_Veg_NordicPine_01.fbx',
  };

  for (const [key, relUrl] of Object.entries(BLENDER_CITADEL_KIT) as Array<
    [keyof typeof BLENDER_CITADEL_KIT, string]
  >) {
    const absGlb = path.join(publicDir, relUrl.replace(/^\//, ''));
    assert.equal(fs.existsSync(absGlb), true, `Missing Citadel Kit GLB: ${absGlb}`);
    const gltf = parseGlbJson(absGlb);
    assert.ok((gltf.meshes?.length ?? 0) >= 1, `${key} citadel GLB must contain geometry`);
    assert.equal(
      fs.existsSync(path.join(fbxDir, expectedKitFbx[key])),
      true,
      `Missing collider-verified FBX export: ${expectedKitFbx[key]}`,
    );
  }

  assert.equal(fs.existsSync(path.join(blendDir, 'Skyforge_FPS_Weapons.blend')), true);
  assert.equal(fs.existsSync(path.join(blendDir, 'Skyforge_Citadel_Kit.blend')), true);
});

test('Live Blender Bridge script preserves armature skinning in Blender 3.6-5.x', () => {
  const script = generateBlenderAddonScript({
    serverUrl: 'http://localhost:3000',
    sessionId: '0123456789abcdef',
    token: 'tok_bridge_test',
  });
  assert.match(script, /has_armature = any\(obj\.type == "ARMATURE"/);
  assert.match(script, /"export_apply": not has_armature/);
  assert.match(script, /"export_skins": True/);
  assert.match(script, /NLA_TRACKS/);
});
