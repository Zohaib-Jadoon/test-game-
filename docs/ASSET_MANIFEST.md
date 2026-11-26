# EIDRATH: The Last Oath — Asset Manifest Summary

Last Updated: 2026-11-25  
Machine-Readable Manifest: [ASSET_MANIFEST.json](../ASSET_MANIFEST.json)  
Full Attributions & Licenses: [ASSET_CREDITS.md](../ASSET_CREDITS.md)  

Pipeline: Blender 5.3.0 headless CLI + MakeHuman **MPFB2 v2.0.18** (`game_engine` 53-bone skeleton) + Three.js MIT Mixamo mocap retargeting (`chain_dir`) + **Poly Haven** CC0 3D models, HDRIs & 1K PBR sets + **ambientCG** CC0 snow/ice maps + **Scott Buckley** CC BY 4.0 orchestral music + **OpenGameArt** CC0 / CC BY 3.0 SFX + `tools/assets/optimize_glb_textures.py`.  
Units & Axes: `1 Blender unit = 1.0 meter`, glTF 2.0 `+Y Up`, actors grounded at `Y = 0`, weapons at grip pivot, modular world kit pieces equipped with hidden `UCX_*` convex colliders.

## Visual QA Evidence Sheets
- Blender EEVEE Lineups:
  - `art/blender/previews/realistic_characters_qa.png` (`chr_kaelen`, `chr_lyra`, `npc_borin`, `npc_edda`, `npc_villager`)
  - `art/blender/previews/realistic_weapons_qa.png` (8 realistic weapons & shields)
  - `art/blender/previews/realistic_frostheim_qa.png` (Frostheim modular architecture & 25 props)
  - `art/blender/previews/realistic_enemies_boss_qa.png` (6 enemies + `boss_warden` granite colossus)
- Live In-Game Chrome WebGL Captures: `art/qa/after/01_title_screen.png` .. `art/qa/after/10_forest_wilderness.png`

## Runtime Footprint & Approval Status

| Category | Runtime Files | Total Footprint | Inspection & Approval |
|---|---:|---:|---|
| Characters (`chr_*`, `npc_*`) | 5 `.glb` | Embedded in `ASSET_MANIFEST.json` | `integrated` / **`approved`** (`inspectedInGame: true`) |
| Enemies & Boss (`enm_*`, `boss_warden`) | 7 `.glb` | Includes destructible `ArmorPlate_*` boss meshes | `integrated` / **`approved`** (`inspectedInGame: true`) |
| Weapons & Shields (`wpn_*`) | 8 `.glb` | Grip-pivoted, metallic/runed PBR | `integrated` / **`approved`** (`inspectedInGame: true`) |
| Frostheim World Structures (`env_*`) | 10 `.glb` | Hidden `UCX_*` collision hulls | `integrated` / **`approved`** (`inspectedInGame: true`) |
| Frostheim Props & Instanced Scatter (`prop_*`, `env_boulder`, `env_dead_trunk`, `env_fern`, `env_rock_face`, `env_tree_stump`) | 30 `.glb` | Terrain clutter + 720 instanced foliage/rocks | `integrated` / **`approved`** (`inspectedInGame: true`) |
| **Total 3D GLB Runtime Payload** | **60 `.glb` files** | **`46.73 MB`** (`49,003,516` bytes, **`823,338` tris**, raw pre-opt `209.43 MB`, max single GLB `5.71 MB`) | **60 / 60 APPROVED** |

## Environment HDRIs, PBR Texture Sets & Audio
- **4 HDRIs (`public/assets/eidrath/hdri/`):** `snowy_forest.hdr`, `winter_evening.hdr`, `snowy_hillside.hdr`, `forest_cave.hdr` (Poly Haven CC0).
- **18 PBR Texture Sets (`public/assets/eidrath/textures/`):** 16 Poly Haven CC0 1K sets + 2 ambientCG CC0 sets (`ice_003`, `snow_008a`).
- **Audio (`public/assets/eidrath/audio/audio_manifest.json`):** 6 Scott Buckley CC BY 4.0 tracks + FFmpeg-normalized Foley/combat/env/UI MP3s.

See [ASSET_MANIFEST.json](../ASSET_MANIFEST.json) for per-asset triangle counts, vertex counts, embedded texture counts, animation clip counts, byte sizes, creators, source URLs, and licenses.
