# EIDRATH: The Last Oath — Gameplay & Visual QA Report

Date: 2026-11-25  
Branch: `eidrath/overhaul`  
Test Target: `NODE_ENV=production PORT=3100 npx tsx server.ts`  
Browser: Google Chrome (Playwright `1.65.1`, ANGLE WebGL), `1280×720` Desktop & `390×844` Mobile Touch

---

## 1. Automated Verification Summary

| Check | Command | Result | Details |
|---|---|---|---|
| TypeScript Check | `npm run lint` (`tsc --noEmit`) | **PASS (exit 0)** | 0 compiler errors across `src/` & `server.ts` |
| Unit & Asset Suite | `npm test` (`tsx --test`) | **PASS (16/16)** | `QA-01`–`QA-10`, `crypto.test.ts`, `blenderBridge.test.ts` |
| Production Build | `npm run build` (`vite build`) | **PASS (exit 0)** | `dist/assets/index-C19ZBWOU.js` (`1,138.13 kB` / `308.49 kB` gzip) + Workbox `dist/sw.js` (`15` precache entries, `1169.10 KiB`) |
| Factory Verify Gate | `factory verify` (`gate-504577dc`) | **4/5 PASS (exit 1)** | `tracked-secret-files`, `lint`, `test`, `build` PASS; `secret-content-scan` flagged 2 untouched pre-existing upstream files (`firebase-applet-config.json:4` client config & `src/db/drizzle.config.ts:10` `process.env` regex false positive) |
| Live Chrome E2E & Visual QA | `python tools/qa/verify_eidrath_webgl.py` | **PASS (exit 0)** | `0` console errors, `0` uncaught page errors, `0` failed HTTP requests |
| Asset Manifest Approval | `generate_asset_manifest.py --approve-inspected` | **PASS** | `60 / 60` runtime GLBs (`46.73 MB`, `823,338` tris) approved post-inspection |

### Live E2E Playwright Assertions (`_asset_cache/qa_metrics.json`)
- `title_ok: true` — Title screen loads with atmospheric HDRI scene, "EIDRATH: THE LAST OATH" typography, zero legacy Skyforge player UI.
- `save_reload_ok: true` — Gameplay state persists across reload (`Continue` available from `SaveGame` v1).
- `ravenhold_village_ok: true` — Ravenhold sanctuary village, Edda/Borin NPCs, warm cabins, campfire, and lantern lighting active.
- `boss_courtyard_ok: true` — Warden's Keep courtyard encounter transitions properly into 3-phase Mountain Warden boss bar & combat.
- `mobile_touch_ok: true` — Mobile portrait `390×844` renders clean touch joystick & combat buttons without HUD overlap.
- Gameplay video recording captured (`22,030,492` bytes): `art/qa/recordings/page@7810bca7f0f27507052701794be1a404.webm`.

---

## 2. Before vs. After Visual Comparison Evidence

Baseline prototype screenshots are preserved untouched in `art/qa/before/`, and final realistic overhaul captures live in `art/qa/after/`.

| Scene / View | BEFORE (Low-Poly Prototype) | AFTER (Realistic Overhaul) | Visual Changes Verified |
|---|---|---|---|
| Title Screen | `art/qa/before/01_title_screen.png` | `art/qa/after/01_title_screen.png` | PolyHaven HDRI lighting, realistic snowy pines/mountains, dark engraved Cinzel title menu |
| Oathgrave Spawn | `art/qa/before/02_oathgrave_gameplay.png` | `art/qa/after/02_oathgrave_gameplay.png` | Corbelled stone Tomb archway looking NE toward altar, candles & snowy valley; MPFB2 Kaelen over-the-shoulder |
| Combat & Dodge | `art/qa/before/03_combat_action.png` | `art/qa/after/03_combat_action.png` | Grounded athletic dodge dash with billowing cloak, real sword sparks & ribbon trail (white slash arcs removed) |
| Inventory & 3D Preview | `art/qa/before/04_inventory_menu.png` | `art/qa/after/04_inventory_menu.png` | Dark-iron engraved RPG inventory panel with live rotating 3D `InventoryPreview3D` Kaelen |
| World Map | `art/qa/before/05_world_map.png` | `art/qa/after/05_world_map.png` | Real Canvas hillshaded Frostheim topographic relief (`FrostheimTopographicMap`) with zoom/pan/pins/fast-travel |
| Dev Blender Forge | `art/qa/before/06_dev_blender_forge.png` | `art/qa/after/06_dev_blender_forge.png` | Gated behind Developer Mode toggle; verifies `55 / 55` registered manifest assets |
| Ravenhold Village | `art/qa/before/07_ravenhold_village.png` | `art/qa/after/07_ravenhold_village.png` | A-frame Nordic cabins with gabled roofs & glowing mullions, stone fire pit, lantern posts, Edda & Borin's anvil |
| Mountain Warden Boss | `art/qa/before/08_mountain_warden_boss.png` | `art/qa/after/08_mountain_warden_boss.png` | 4.07 m chiseled granite boss with glowing blue rune fissures, chains, warmaul & dark-iron boss phase bar |
| Mobile Touch HUD | `art/qa/before/09_mobile_touch_hud.png` | `art/qa/after/09_mobile_touch_hud.png` | `390×844` clean touch joystick, action buttons, and non-overlapping top boss bar |
| Forest Wilderness | *(New check)* | `art/qa/after/10_forest_wilderness.png` | Instanced `THREE.InstancedMesh` dense snowy fir pines, boulders, stumps, ferns & misty horizon |

### Blender EEVEE Offline Asset QA Lineups (`art/blender/previews/`)
- `art/blender/previews/realistic_characters_qa.png` (`chr_kaelen`, `chr_lyra`, `npc_borin`, `npc_edda`, `npc_villager`)
- `art/blender/previews/realistic_weapons_qa.png` (8 realistic weapons & shields)
- `art/blender/previews/realistic_frostheim_qa.png` (Frostheim architecture & 25 props)
- `art/blender/previews/realistic_enemies_boss_qa.png` (6 enemies + Mountain Warden colossus)

---

## 3. Defects Caught & Fixed During Visual QA

1. **Blender Arm-Twist & Invisible Rifle Pose:** Early Mixamo (`Soldier.glb`) retargeting pointed arms backward due to glTF `+Z` leaf bone tails. Fixed in `tools/blender/eidrath_rig_utils.py` by using `Xbot.glb` and computing parent-to-child joint direction (`chain_dir`).
2. **Character Silhouettes & Cabin Roofs:** Fixed floating fingertip spheres (`0.26m`/`0.20m` exclusion), added anatomical `extract_body_shell` boots/gauntlets/cuirass, corrected `env_nordic_cabin` roof slope Euler signs (`±0.58` rad), and upgraded `env_oathgrave_tomb` with a corbelled pitched roof & pediment archway.
3. **Run-1 Chrome WebGL Findings (Fixed & Re-verified in Run 2):**
   - `Dodge` clip flipped Kaelen upside-down -> rebuilt low athletic dash clip in `eidrath_rig_utils.py` & re-exported `chr_kaelen.glb`.
   - `env_oathgrave_tomb` faced away from the road -> rotated to `Math.PI * 0.75` in `EidrathEngine.ts`.
   - `env_keep_gate` pinched the Warden boss courtyard -> adjusted placement `(6, -118, scale 1.45)` and boss spawn `(6, -138)`.
   - Mobile `390×844` top boss bar overlapped status badges -> adjusted mobile responsive spacing in `EidrathHud.tsx`.
   - Fixed Playwright `str(page.video.path())` JSON serialization in `tools/qa/verify_eidrath_webgl.py`.

---

## 4. Honest Unverified Scope (`NOT VERIFIED`)
- **Cloud PostgreSQL & Firebase Writes:** `DATABASE_URL` and live Firebase admin credentials are absent in `.env`, so cloud sync writes are marked `NOT VERIFIED`; local `SaveGame` v1 slots, corruption `_backup` recovery, and offline gameplay passed completely.
- **Physical Discrete GPU & Mobile Hardware FPS:** Live Chrome WebGL checks ran headless under ANGLE with Playwright WebM encoding enabled (~19–22 FPS compositor cap); unrecorded native discrete-GPU 60 FPS and physical smartphone touch tests remain `NOT VERIFIED`.
- **Interactive Blender GUI MCP Socket:** Live Blender addon socket was disconnected (`Not connected to Blender`); asset builds ran via headless Blender 5.3.0 CLI and HTTP Express Live Blender Bridge.
