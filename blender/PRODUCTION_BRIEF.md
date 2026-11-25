# Skyforge Arena — Blender Director Production Brief

**Orchestrator:** `blender-director` + `blender-pro-workflow`
**Target Engine:** Three.js WebGL2 (GLB runtime + FBX archive, 1 Blender unit = 1 meter, `+Y` Up)
**Art Direction:** `genre-soulslike` + `dark-gritty-mood` + `fantasy-worlds` (Dark Fantasy Eclipse Citadel)
**Color Management:** AgX (lookdev/QA renders), Linear PBR roughness/metallic calibrated for Three.js ACESFilmic + UnrealBloomPass.

---

## Asset Pack 1: First-Person Hero Weapons (`blender/build_fps_weapons.py`)

- **Type:** Hero Hard Surface Props (First-Person Viewmodels)
- **Pipeline:** `blender-director` → `hard-surface` → `genre-soulslike` / `dark-gritty-mood` → `uv-workflow` → `materials` → `asset-optimization` → `export-pipeline` → `qa-review`
- **Poly Budget:** 1,000–4,500 tris per weapon (Web/Mobile FPS viewmodel tier, sized for offline PWA precaching)
- **Material Budget:** 3–4 shared `MAT_` PBR masters per weapon (dedicated `MAT_Emissive_*` slots; never animate emission on structural hull)
- **Pivot:** Grip hand-contact center `(0, 0, 0)`, forward along Blender `+Y` (Three.js `-Z`), up along Blender `+Z` (Three.js `+Y`)
- **Deliverables:**
  - `SM_Weapon_Shadowbow_A` → `public/models/weapons/ranger_bow.glb` + `blender/exports/SM_Weapon_Shadowbow_A.fbx`
  - `SM_Weapon_ShadowArrow_A` → `public/models/weapons/ranger_arrow.glb` + `blender/exports/SM_Weapon_ShadowArrow_A.fbx`
  - `SM_Weapon_RunicGlaive_A` → `public/models/weapons/vanguard_glaive.glb` + `blender/exports/SM_Weapon_RunicGlaive_A.fbx`
  - `SM_Weapon_CryptWarhammer_A` → `public/models/weapons/sentinel_warhammer.glb` + `blender/exports/SM_Weapon_CryptWarhammer_A.fbx`
  - `SM_Weapon_TowerShield_A` → `public/models/weapons/sentinel_shield.glb` + `blender/exports/SM_Weapon_TowerShield_A.fbx`
  - `SM_Weapon_BloodmoonOdachi_A` → `public/models/weapons/ronin_odachi.glb` + `blender/exports/SM_Weapon_BloodmoonOdachi_A.fbx`
  - QA Contact Sheet: `blender/previews/weapons_qa_sheet.png`

---

## Asset Pack 2: Soulslike Citadel Modular Architecture (`blender/build_citadel_kit.py`)

- **Type:** Monumental Environment Modular Kit + Verified Convex Collision Proxies
- **Pipeline:** `blender-director` → `genre-soulslike` → `dark-gritty-mood` → `fantasy-worlds` → `environment-artist` → `materials` → `collision-proxy` (`cc-blender-skill/blender-export/scripts/collision_preflight.py`) → `asset-optimization` → `export-pipeline` → `qa-review`
- **Poly Budget:** 2,500–6,500 tris per hero architectural landmark (instanced 4× each in arena)
- **Material Budget:** 3–4 shared `MAT_` PBR masters (`MAT_Stone_ObsidianBasalt`, `MAT_Metal_WroughtIron`, `MAT_Metal_GildedBronze`, `MAT_Emissive_*`)
- **Pivot:** Floor center `(0, 0, 0)` grounded at `Z = 0`
- **Collision Validation:** `UCX_` convex hulls verified via `collision_preflight.validate_collider` and `collision_report` prior to FBX export.
- **Deliverables:**
  - `SM_Env_GothicBrazierPillar_01` + `UCX_SM_Env_GothicBrazierPillar_01` → `public/models/props/gothic_brazier_pillar.glb` + `blender/exports/SM_Env_GothicBrazierPillar_01.fbx`
  - `SM_Env_CathedralSpire_01` + `UCX_SM_Env_CathedralSpire_01` → `public/models/props/cathedral_spire.glb` + `blender/exports/SM_Env_CathedralSpire_01.fbx`
  - QA Contact Sheet (with 1.8m human scale reference): `blender/previews/citadel_kit_qa_sheet.png`

---

## Pipeline Validation Gates

- [x] Production brief authored before modeling
- [x] Blockout, panel breaks, selective bevels, and weighted/sharp normals built in Blender 5.3
- [x] Smart UV unwraps + `MAT_` PBR materials assigned (zero unused slots)
- [x] `asset-optimization` audit passed (poly budget, welded verts, outward normals, scale 1,1,1, naming)
- [x] `collision_preflight.py` passed for all `UCX_` environment colliders
- [x] Multi-angle EEVEE QA renders inspected visually (`SHIP` verdict)
- [x] Integrated into Three.js runtime (`FirstPersonViewmodel`, `worldGraphics`, `assetLoader`) and verified with `lint` / `test` / `build`

---

## Optimization & QA Review Report

| Asset | Tris | Budget | Materials | GLB | FBX | `UCX_` Preflight | QA Verdict |
|---|---:|---:|---:|---:|---:|---|---|
| `SM_Weapon_Shadowbow_A` | 1,024 | 4,500 | 6 | 58.4 KB | 50.0 KB | N/A | **SHIP** |
| `SM_Weapon_ShadowArrow_A` | 148 | 4,500 | 4 | 13.5 KB | 22.0 KB | N/A | **SHIP** |
| `SM_Weapon_RunicGlaive_A` | 546 | 4,500 | 5 | 34.3 KB | 35.1 KB | N/A | **SHIP** |
| `SM_Weapon_CryptWarhammer_A` | 656 | 4,500 | 5 | 45.1 KB | 37.0 KB | N/A | **SHIP** |
| `SM_Weapon_TowerShield_A` | 350 | 4,500 | 4 | 27.9 KB | 28.0 KB | N/A | **SHIP** |
| `SM_Weapon_BloodmoonOdachi_A` | 546 | 4,500 | 5 | 33.0 KB | 34.9 KB | N/A | **SHIP** |
| `SM_Env_GothicBrazierPillar_01` | 2,124 | 6,500 | 5 | 159.3 KB | 79.7 KB | **PASS** | **SHIP** |
| `SM_Env_CathedralSpire_01` | 1,168 | 6,500 | 5 | 84.8 KB | 53.8 KB | **PASS** | **SHIP** |

### QA Defects Found & Resolved Before Ship
1. **Blocker (`UCX_` Non-Manifold)**: Initial `bmesh.ops.convex_hull` on pre-faced frustum created overlapping faces (`collision_preflight.py` rejected). Fixed by triangulating pure closed frustum hull -> `passed: true`.
2. **Major (Grip Wrap Offset)**: Glaive and Warhammer leather grip rings deviated off the tilted haft centerline on initial render. Unified under a single coaxial `axis_m` matrix and re-verified.
3. **Minor (Buttress Pinnacles & Framing)**: Seated `SM_Env_CathedralSpire_01` buttress pinnacle caps onto upper buttress ribs and widened both QA render cameras to verify full silhouettes and human scale reference.

---

## Asset Pack 3: Skyrim Nordic Sanctuary Overhaul (`build_skyrim_world_kit.py` + `build_skyrim_weapons.py` + `build_enemies.py`)

- **Active Skills:** `blender-director` → `genre-rpg` + `genre-open-world-sandbox` + `biome-worlds` (Arctic Alpine) + `fantasy-worlds` (Medieval Nordic) + `vegetation-artist` + `environment-artist` + `hard-surface` + `materials` + `collision-proxy` (`collision_preflight.py`) + `asset-optimization` + `export-pipeline` + `qa-review`
- **QA Sheets Verified (`SHIP`):**
  - `blender/previews/skyrim_kit_qa_sheet.png`: `SM_Env_NordicWordWall_01` (`2,176 tris`, `152.6 KB` GLB, `UCX_` PASS), `SM_Veg_NordicPine_01` (`476 tris`, `28.6 KB` GLB), `SM_Env_GothicBrazierPillar_01` Nordic Cairn (`1,148 tris`, `86.4 KB` GLB, `UCX_` PASS), `SM_Env_CathedralSpire_01` Nordic Barrow Watchtower (`1,176 tris`, `84.0 KB` GLB, `UCX_` PASS).
  - `blender/previews/skyrim_weapons_qa_sheet.png`: Nordic Ironwood & Horn Bow (`980 tris`), Steel Arrow (`148 tris`), Ancient Nordic Bearded Battleaxe (`488 tris`), Nordic Steel & Bronze Warhammer (`544 tris`), Banded Iron & Oak Round Shield (`720 tris`), Blades Akaviri Dragonbane Katana (`546 tris`).
  - `blender/previews/enemies_lineup.png`: Draugr Deathlord Charger, Dragon Priest Frost Shade Kiter, Ice Wraith Stalker Swarmer (rigged armatures + 3 NLA clips preserved).


