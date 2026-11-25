# EIDRATH: The Last Oath — Asset Manifest

Last Updated: 2026-11-25  
Pipeline: Blender 5.3.0 headless CLI (`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`) + `cc-blender-skill` `collision_preflight.py` + AgX EEVEE QA renders + Express Live Blender Bridge verification.  
Units & Axes: `1 Blender unit = 1.0 meter`, glTF 2.0 `+Y Up`, actor origins grounded at `Z = 0` (`min_z = 0.0`), weapons at grip pivot, world pieces with `UCX_*` convex colliders.  
License / Provenance: 100% original procedural/authored Blender 5.3 assets generated specifically for EIDRATH: The Last Oath. All third-party-named legacy files (`public/assets/aistudio/sylvanas*`) were removed in Phase 1.

## QA Visual Render Evidence
- Characters lineup (post-QA joint & facial sculpt pass): `art/blender/previews/eidrath_characters_qa.png`
- Enemies & Mountain Warden boss lineup (post-QA silhouette & joint pass): `art/blender/previews/eidrath_enemies_boss_qa.png`
- Weapons & shield lineup: `art/blender/previews/eidrath_weapons_qa.png`
- Frostheim modular architecture & foliage kit: `art/blender/previews/eidrath_frostheim_qa.png`

## Characters (5 Rigged & NLA-Animated)

| Asset ID | Mesh Name | Height (m) | Tris | Clips | GLB Size | Source `.blend` | Runtime `.glb` | Status |
|---|---|---:|---:|---:|---:|---|---|---|
| `chr_kaelen` | `CHR_Kaelen` | 1.912 | 3,568 | 11 | 327.3 KB | `art/blender/characters/chr_kaelen.blend` | `public/assets/eidrath/characters/chr_kaelen.glb` | APPROVED |
| `chr_lyra` | `CHR_Lyra` | 1.826 | 3,144 | 5 | 246.0 KB | `art/blender/characters/chr_lyra.blend` | `public/assets/eidrath/characters/chr_lyra.glb` | APPROVED |
| `npc_borin` | `NPC_Borin` | 1.549 | 3,004 | 5 | 234.5 KB | `art/blender/characters/npc_borin.blend` | `public/assets/eidrath/characters/npc_borin.glb` | APPROVED |
| `npc_edda` | `NPC_Edda` | 1.802 | 3,792 | 5 | 272.2 KB | `art/blender/characters/npc_edda.blend` | `public/assets/eidrath/characters/npc_edda.glb` | APPROVED |
| `npc_villager` | `NPC_Villager` | 1.742 | 2,976 | 5 | 236.5 KB | `art/blender/characters/npc_villager.blend` | `public/assets/eidrath/characters/npc_villager.glb` | APPROVED |

## Enemies & Boss (7 Rigged & NLA-Animated)

| Asset ID | Mesh Name | Height (m) | Tris | Clips | GLB Size | Source `.blend` | Runtime `.glb` | Status |
|---|---|---:|---:|---:|---:|---|---|---|
| `enm_hollow_swordsman` | `ENM_HollowSwordsman` | 1.848 | 1,292 | 7 | 160.9 KB | `art/blender/enemies/enm_hollow_swordsman.blend` | `public/assets/eidrath/enemies/enm_hollow_swordsman.glb` | APPROVED |
| `enm_hollow_archer` | `ENM_HollowArcher` | 1.800 | 1,284 | 7 | 159.2 KB | `art/blender/enemies/enm_hollow_archer.blend` | `public/assets/eidrath/enemies/enm_hollow_archer.glb` | APPROVED |
| `enm_hollow_knight` | `ENM_HollowKnight` | 2.276 | 1,368 | 8 | 172.8 KB | `art/blender/enemies/enm_hollow_knight.blend` | `public/assets/eidrath/enemies/enm_hollow_knight.glb` | APPROVED |
| `enm_frost_wolf` | `ENM_FrostWolf` | 1.025 | 976 | 5 | 99.1 KB | `art/blender/enemies/enm_frost_wolf.blend` | `public/assets/eidrath/enemies/enm_frost_wolf.glb` | APPROVED |
| `enm_bandit` | `ENM_Bandit` | 1.886 | 1,276 | 7 | 140.8 KB | `art/blender/enemies/enm_bandit.blend` | `public/assets/eidrath/enemies/enm_bandit.glb` | APPROVED |
| `enm_frost_troll` | `ENM_FrostTroll` | 2.859 | 1,812 | 7 | 242.1 KB | `art/blender/enemies/enm_frost_troll.blend` | `public/assets/eidrath/enemies/enm_frost_troll.glb` | APPROVED |
| `boss_warden` | `BOSS_Warden` | 4.072 | 2,096 | 8 | 274.1 KB | `art/blender/enemies/boss_warden.blend` | `public/assets/eidrath/bosses/boss_warden.glb` | APPROVED |

## Weapons & Shields (8 Grip-Pivoted Meshes)

| Asset ID | Mesh Name | Tris | GLB Size | Source `.blend` | Runtime `.glb` | Status |
|---|---|---:|---:|---|---|---|
| `wpn_oathbreaker` | `WPN_Oathbreaker` | 264 | 20.4 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_oathbreaker.glb` | APPROVED |
| `wpn_iron_sword` | `WPN_IronSword` | 88 | 9.7 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_iron_sword.glb` | APPROVED |
| `wpn_frost_axe` | `WPN_FrostAxe` | 112 | 11.6 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_frost_axe.glb` | APPROVED |
| `wpn_nightpiercer` | `WPN_Nightpiercer` | 140 | 11.9 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_nightpiercer.glb` | APPROVED |
| `wpn_iron_shield` | `WPN_IronShield` | 360 | 29.0 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_iron_shield.glb` | APPROVED |
| `wpn_oblivion_staff` | `WPN_StaffOfOblivion` | 124 | 12.6 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_oblivion_staff.glb` | APPROVED |
| `wpn_worldshatter` | `WPN_Worldshatter` | 164 | 15.6 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_worldshatter.glb` | APPROVED |
| `wpn_torment_links` | `WPN_TormentLinks` | 180 | 14.6 KB | `art/blender/weapons/eidrath_weapons.blend` | `public/assets/eidrath/weapons/wpn_torment_links.glb` | APPROVED |

## Frostheim Modular World Kit (10 Pieces with Verified `UCX_` Colliders)

| Asset ID | Mesh Name | Tris | GLB Size | Collider Preflight | Source `.blend` | Runtime `.glb` | Status |
|---|---|---:|---:|---|---|---|---|
| `env_oathgrave_tomb` | `ENV_Frostheim_OathgraveTomb` | 332 | 28.6 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_oathgrave_tomb.glb` | APPROVED |
| `env_ruined_bridge` | `ENV_Frostheim_RuinedBridge` | 396 | 31.8 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_ruined_bridge.glb` | APPROVED |
| `env_nordic_cabin` | `ENV_Frostheim_NordicCabin` | 376 | 31.6 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_nordic_cabin.glb` | APPROVED |
| `env_borin_forge` | `ENV_Frostheim_BorinForge` | 236 | 21.4 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_borin_forge.glb` | APPROVED |
| `env_frost_pine` | `ENV_Frostheim_Pine` | 304 | 20.1 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_frost_pine.glb` | APPROVED |
| `env_rock_cliff` | `ENV_Frostheim_RockCliff` | 88 | 7.2 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_rock_cliff.glb` | APPROVED |
| `env_ice_cave_arch` | `ENV_Frostheim_IceCaveArch` | 224 | 19.2 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_ice_cave_arch.glb` | APPROVED |
| `env_keep_gate` | `ENV_Frostheim_KeepGate` | 400 | 32.4 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_keep_gate.glb` | APPROVED |
| `env_keep_wall` | `ENV_Frostheim_KeepWall` | 220 | 18.4 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_keep_wall.glb` | APPROVED |
| `env_oath_shrine` | `ENV_Frostheim_OathShrine` | 256 | 16.9 KB | PASS | `art/blender/world/eidrath_frostheim_kit.blend` | `public/assets/eidrath/world/env_oath_shrine.glb` | APPROVED |

## Frostheim Props (25 Individual `.glb` Files, Total 192.9 KB)
All 25 props generated from `tools/blender/build_eidrath_frostheim.py` (`art/blender/world/eidrath_frostheim_kit.blend`), `APPROVED`:
`prop_chest`, `prop_oath_rune_stone`, `prop_seal_stone`, `prop_lantern_post`, `prop_campfire`, `prop_anvil`, `prop_banner`, `prop_ore_vein`, `prop_frost_herb`, `prop_barrel`, `prop_crate`, `prop_signpost`, `prop_tent`, `prop_cart`, `prop_brazier`, `prop_altar_pedestal`, `prop_weapon_rack`, `prop_bench`, `prop_cairn`, `prop_fence`, `prop_stair_block`, `prop_market_stall`, `prop_bone_pile`, `prop_bellows`, `prop_log_pile`.

## Total Runtime Footprint (Frostheim Vertical Slice)
- **55 `.glb` assets** totaling **~3.1 MB** uncompressed (far under the 30 MB vertical-slice budget and 10 MB per-file bridge cap).
- **Reproducible scripts**: `tools/blender/build_eidrath_characters.py`, `tools/blender/build_eidrath_enemies_boss.py`, `tools/blender/build_eidrath_weapons.py`, `tools/blender/build_eidrath_frostheim.py`.
