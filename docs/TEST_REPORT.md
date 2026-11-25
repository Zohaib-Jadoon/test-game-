# EIDRATH: The Last Oath — QA & Verification Report

Date: 2026-11-25  
Branch: `eidrath/overhaul`  
Environment: Windows (PowerShell), Node `v24.21.0`, npm `11.19.0`, Blender `5.3.0`, Google Chrome (Playwright `1.65.1`, ANGLE WebGL, `1280×720` desktop & `390×844` mobile viewports, `Medium` quality preset).

## Automated Commands Executed

| Command | Result | Evidence |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** (exit 0) | Zero TypeScript diagnostics across `src/` and `server.ts` |
| `npm test` (`tsx --test src/game/eidrath.test.ts src/utils/crypto.test.ts src/utils/blenderBridge.test.ts`) | **PASS** (15/15 passed, 0 failed, 387ms) | Covers content integrity, terrain, combat rules, quests, RPG transactions, Mountain Warden phases, 55 GLB headers, SaveGame v1 corruption recovery, crypto E2EE, and Blender bridge utilities |
| `npm run build` (`vite build` + PWA `generateSW`) | **PASS** (exit 0) | Built `dist/` in 378ms; PWA precached `70` entries (`4211.71 KiB`, including all 55 `.glb` models) |
| `NODE_ENV=production npm start` + `GET /api/health` | **PASS** (HTTP 200) | Returned `{"ok":true,"service":"eidrath-the-last-oath","dbConfigured":false,"geminiConfigured":false}` |
| Live Blender Bridge HTTP push (`POST /sessions`, `POST /:id/push`, `GET /:id/status`) | **PASS** | Valid `chr_kaelen.glb` (`335,180` bytes) accepted (`version: 1`); invalid non-GLB payload rejected with `HTTP 400` |
| `python tools/qa/verify_eidrath_webgl.py` (Live Chrome WebGL E2E) | **PASS** (exit 0) | All assertions passed; `0` console errors, `0` uncaught page errors, `0` failed network requests; 9 screenshots captured in `art/qa/` |

## Acceptance Matrix (`game.md` Section 19)

| Test ID | Criteria | Status | Evidence & Notes |
|---|---|---|---|
| **QA-01** Launch / rebrand | Title screen, New Game, Continue, Load, Settings, Credits; zero Skyforge player branding or dead menus | **PASS** | `art/qa/01_title_screen.png`; Playwright verified `"EIDRATH"` + `"THE LAST OATH"` present and `"SKYFORGE"` absent; all legacy Skyforge UI files removed |
| **QA-02** Locomotion | Third-person over-the-shoulder camera, camera-relative WASD/sprint/jump/dodge, slope limits, natural bounds, pause on blur | **PASS** | `art/qa/02_oathgrave_gameplay.png`, `src/game/eidrath.test.ts`; fixed camera `camYaw = yaw + Math.PI` after first visual inspection |
| **QA-03** Combat | Light/heavy/block/parry/dodge/ranged/spells/Ascension, single-hit per `attackInstanceId`, clamped delta timing | **PASS** | `src/game/eidrath.test.ts` + `art/qa/03_combat_action.png`; caught and fixed `ATTACKS.enm_arrow` key mismatch during testing |
| **QA-04** World | Continuous 500m × 500m Frostheim terrain (Oathgrave -> Bridge -> Ravenhold -> Forest -> Frozen Reach -> Keep), visible Keep silhouette, chunk streaming | **PASS** | `art/qa/02_oathgrave_gameplay.png`, `art/qa/05_world_map.png`, `art/qa/07_ravenhold_village.png` |
| **QA-05** NPC / quest | 5 starter/side quests, branching Mercy/Pragmatic/Revenge choices, companion Lyra join, anti-duplicate reward claim | **PASS** | `src/game/eidrath.test.ts`; caught and fixed `'lyra_joined'` flag alignment in `rpgLogic.ts` |
| **QA-06** RPG | Equip/compare, 2H unequipping offhand shield, quest-item drop/sell guard, 7 skill trees + prereqs/reset, atomic Borin forge & merchant | **PASS** | `src/game/eidrath.test.ts`, `art/qa/04_inventory_menu.png`; Playwright verified skill point spend `2 -> 1` |
| **QA-07** Enemy / boss | 6 distinct Frostheim enemies + 3-phase Mountain Warden boss (900 HP, Seal Stones, adds cap, fissures, retry reset, shortcut) | **PASS** | `src/game/eidrath.test.ts`, `art/qa/08_mountain_warden_boss.png` (live boss HUD + Lyra combat damage verified) |
| **QA-08** Blender | Reproducible Blender 5.3 scripts, `.blend` masters, 55 `.glb` assets, `UCX_` colliders, visual QA sheets, Live Bridge push & invalid GLB rejection | **PASS** | `art/blender/previews/eidrath_*_qa.png` (re-verified after fixing arm/silhouette defects), `art/qa/06_dev_blender_forge.png` (`55 / 55`), live HTTP bridge test |
| **QA-09** Save / offline | Versioned `SaveGame` v1 slots, reload Continue persistence, `_backup` corruption self-heal, legacy `skyforge_*` preservation, PWA offline cache | **PASS** (Local/Offline) / **NOT VERIFIED** (Cloud DB) | Local slots, backup recovery, and reload verified (`eidrath.test.ts` + Playwright). Cloud PostgreSQL/Firebase writes require external credentials not set in `.env` |
| **QA-10** UI / accessibility | Desktop `1280×720` + mobile `390×844` touch joystick & buttons, remappable keys, subtitles, high-contrast cues, reduced motion | **PASS** | `art/qa/09_mobile_touch_hud.png` re-verified after fixing mobile HUD overlaps and hiding stealth badge during boss encounters |
| **QA-11** Performance | Real browser frame-time profiling (avg/p95/worst ms) & asset footprint | **PASS** | Chrome `1280×720` Medium preset: **77 FPS**, **13.07 ms avg**, **13.4 ms p95**, **13.4 ms worst** (well under 16.7 ms desktop budget). Total 55 GLB footprint: **~3.1 MB** (< 30 MB budget). |
| **QA-12** Build / deployment | Typecheck, tests, production bundle, `NODE_ENV=production npm start`, zero uncaught runtime errors, secrets isolated server-side | **PASS** | All checks exit 0; `0` console/page/network errors in Chrome E2E |

## Visual Evidence Inventory
- Blender EEVEE QA Sheets:
  - `art/blender/previews/eidrath_characters_qa.png`
  - `art/blender/previews/eidrath_enemies_boss_qa.png`
  - `art/blender/previews/eidrath_weapons_qa.png`
  - `art/blender/previews/eidrath_frostheim_qa.png`
- Live Chrome WebGL Gameplay Screenshots:
  - `art/qa/01_title_screen.png`
  - `art/qa/02_oathgrave_gameplay.png`
  - `art/qa/03_combat_action.png`
  - `art/qa/04_inventory_menu.png`
  - `art/qa/05_world_map.png`
  - `art/qa/06_dev_blender_forge.png`
  - `art/qa/07_ravenhold_village.png`
  - `art/qa/08_mountain_warden_boss.png`
  - `art/qa/09_mobile_touch_hud.png`
