# EIDRATH: The Last Oath

> *The gods created mankind to serve them. Now mankind must decide whether the gods deserve to live.*

**EIDRATH: The Last Oath** is an original third-person, open-world dark-fantasy action RPG built with **Three.js**, **React 19**, **TypeScript**, **Vite**, **Express**, and **55 original Blender 5.3 `.glb` / `.blend` assets**.

This repository delivers the verified **Act I: Frostheim Vertical Slice** (Phases 0–7 of `game.md`), replacing the prior Skyforge Arena application completely while preserving its Express Live Blender Bridge and optional cloud/security infrastructure.

## Playable Frostheim Vertical Slice Features
- **Open-World Frostheim (500m × 500m, 5×5 chunk activation)**: Continuous snowy terrain with natural mountain boundaries (no invisible arena wall), Oathgrave Tomb, Ashen Span Bridge, Ravenhold Sanctuary Village, Old Oath-Smithy, Whispering Pine Hunter Camp, Frozen Reach Lake & Cavern (Three-Rune Rotating Oath-Stone Puzzle), Silent Oath Shrine, and Warden's Keep (elevated silhouette visible from Ravenhold).
- **Deliberate Third-Person Combat**: Over-the-shoulder camera with target lock-on (`Tab` / Middle-Click) and boss pull-back; Light 3-hit combo (`LMB`), Heavy Guard-Break Cleave (`RMB`), Block & 180ms+ Perfect Parry (`Q`), Dodge Roll with 180ms i-frames (`Space`), Stealth (`Ctrl`), Spells (`1` Rime Lance, `2` Cinder Arc, `3` Shattering Oath Wave), Potions (`4`/`5`), and Divine Ascension (`R`).
- **5 Playable Quests & Authored Branching Dialogue**: *The Broken Oath*, *A Blade Remembered*, *The Missing Hunter*, *Voices Beneath Ice*, and *The Warden's Oath*, featuring Mercy / Pragmatic / Revenge choices, faction standings, corruption tracking, and active companion **Lyra** with Command Wheel (`Assist`, `Attack`, `Regroup`, `Wait`).
- **Full RPG Systems**: 20 items & signature weapons (including two-handed *Oathbreaker*, *Nightpiercer*, *Worldshatter*, *Staff of Oblivion*, *Torment Links*), 7 Skill Trees (21 nodes with prerequisites and refund reset), Borin's Forge crafting & weapon tempering, Ravenhold Merchant buy/sell, Interactive Frostheim World Map with Fog-of-War & Fast Travel, and Lore Codex.
- **3-Phase Boss Encounter — The Mountain Warden**: 4.07m rigged slate-and-iron guardian (900 HP) in the Warden's Keep Courtyard with Phase-2 destructible Seal Stones, capped Hollow adds, ground fissure warnings, safe approach checkpoint, one-time Oath-Seal reward, Return Shortcut to Ravenhold, and post-victory village dialogue.
- **Offline-First Saves & Accessibility**: Versioned `SaveGame` v1 slots (`autosave`, `slot_1`–`slot_3`) with atomic `_backup` corruption self-healing, IndexedDB mirror, remappable keybindings, difficulty & graphics presets, subtitles, reduced motion, high-contrast combat cues, and responsive mobile touch controls.
- **Developer-Only Blender Asset Forge**: Isolated under **Settings → Developer Tools → Open Forge** (outside player navigation), providing live Blender Bridge sessions and inspection of all 55 registered Blender 5.3 assets.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Core single-player gameplay works **100% offline** with no login or external API keys required.

## Verification & Production Commands

```bash
npm run lint                      # TypeScript strict check (tsc --noEmit)
npm test                          # Unit, RPG, combat, save, crypto, bridge & 55-GLB asset tests
npm run build                     # Production Vite + PWA bundle (dist/)
NODE_ENV=production npm start     # Production Express server (tsx server.ts)
python tools/qa/verify_eidrath_webgl.py  # Live Chrome WebGL E2E QA & screenshot capture
```

## Regenerating Original Blender 5.3 Assets

All 55 `.glb` runtime files (`public/assets/eidrath/`) and `.blend` masters (`art/blender/`) are reproducible via headless Blender 5.3 scripts:

```bash
blender --background --python tools/blender/build_eidrath_characters.py
blender --background --python tools/blender/build_eidrath_enemies_boss.py
blender --background --python tools/blender/build_eidrath_weapons.py
blender --background --python tools/blender/build_eidrath_frostheim.py
```

## Save Migration & Rollback Notes
- **Legacy Preservation**: EIDRATH stores saves exclusively under `eidrath_save_v1_<slot>` and `eidrath_settings_v1`. Legacy `skyforge_*` localStorage records and existing Drizzle `cloud_saves` tables are **never overwritten or migrated destructively**.
- **Rollback**: The pre-overhaul repository snapshot is preserved on branch `checkpoint/pre-eidrath-wip` (`9921bc6`), and original `main` remains untouched at `ff3eaed`.

## Documentation & Scope
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md) — Phase 0–7 verification & Phase 8–10 remaining campaign roadmap (remaining 6 kingdoms, Seven Gods, 5 endings)
- [Asset Manifest](docs/ASSET_MANIFEST.md) — All 55 Blender 5.3 assets, triangle budgets, heights, and visual QA sheet references
- [Test Report](docs/TEST_REPORT.md) — Full `QA-01`–`QA-12` results, Chrome WebGL frame-time metrics, and screenshot inventory
