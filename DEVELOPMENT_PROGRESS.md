# EIDRATH: The Last Oath — Development Progress Log

Repository: `Zohaib-Jadoon/test-game-` (branch `eidrath/overhaul`)  
Baseline Checkpoint Preserved: `checkpoint/pre-eidrath-wip` (`9921bc6`), `main` (`ff3eaed`)

---

## Stage 0 — Baseline Audit & Visual Archival

- Audited existing prototype systems (`EidrathEngine.ts`, `eidrathContent.ts`, `rpgLogic.ts`, `saveSystem.ts`, `server.ts`), Myfactory setup (`factory init`), and Blender 5.3.0 CLI.
- Verified external Blender MCP addon socket status (`Not connected to Blender`) and proceeded via reproducible Blender 5.3.0 headless CLI + Express Live Blender Bridge HTTP pipeline.
- Archived **9 baseline BEFORE screenshots** (`art/qa/before/01_title_screen.png` .. `09_mobile_touch_hud.png`) capturing the original low-poly prototype and UI.
- Configured `.gitignore` to keep raw cached downloads (`_asset_cache/`) out of version control.

## Stage 1 — Asset Sourcing & Realistic Blender 5.3 Production

- **Permissive Asset Acquisition (190 source files in `_asset_cache/asset_download_ledger.json`):**
  - Installed **MakeHuman MPFB2 v2.0.18** into Blender 5.3.0.
  - Downloaded 4 **Poly Haven CC0** 1K HDRIs (`snowy_forest`, `winter_evening`, `snowy_hillside`, `forest_cave`), 16 Poly Haven + 2 **ambientCG CC0** (`ice_003`, `snow_008a`) PBR texture sets, and 19 Poly Haven CC0 3D models.
  - Sourced MIT Mixamo mocap reference rigs (`Xbot.glb`, `Soldier.glb`, `Michelle.glb`) from `mrdoob/three.js`.
  - Acquired 6 **Scott Buckley CC BY 4.0** orchestral tracks and OpenGameArt CC0 / CC BY 3.0 SFX normalized via FFmpeg into MP3 buses (`audio_manifest.json`).
  - Excluded login/paywall platforms (Sketchfab OAuth downloads, Adobe Mixamo web login, Fab, BlenderKit Pro) without bypassing authentication; documented in `ASSET_CREDITS.md`.
- **Blender 5.3 Rebuild & Visual QA Fixes (`tools/blender/`):**
  - _Joint Retargeting Fix:_ Initial `Soldier.glb` retargeting produced rifle poses and backward-twisted arms because glTF Mixamo leaf tails point `+Z`. Switched to `Xbot.glb` and aligned T-pose to MPFB2 A-pose via exact parent-to-child joint vectors (`chain_dir`), trimmed keyframed bones, and replaced somersault `Dodge` with a low grounded athletic combat dash.
  - _Character & Outfit QA Pass (`build_realistic_characters.py`):_ Fixed floating fingertip spheres (hand exclusion threshold `0.26m`/`0.20m`), replaced cone gauntlets/bare feet with `extract_body_shell` anatomical boots and gauntlets on all 5 humanoids, added slim gorget collars, raised `chr_kaelen` chest cuirass (`offset_m=0.026`), darkened/lowered hair caps, and offset `back_weapon` outside the cloak. Verified via `art/blender/previews/realistic_characters_qa.png`.
  - _Weapons QA Pass (`build_realistic_weapons.py`):_ Built 8 grip-pivoted metallic/wooden/runed weapons & shields. Verified via `art/blender/previews/realistic_weapons_qa.png`.
  - _Architecture & Environment QA Pass (`build_realistic_frostheim.py`):_ Fixed inverted V-roof angles on `env_nordic_cabin` (`-0.58` / `+0.58` rad), added triangular gables & warm mullioned windows, and rebuilt `env_oathgrave_tomb` with a corbelled barrow roof, stone buttresses, and carved pediment archway alongside 10 world kit pieces and 25 props. Verified via `art/blender/previews/realistic_frostheim_qa.png`.
  - _Enemies & Mountain Warden Boss QA Pass (`build_realistic_enemies_boss.py`):_ Replaced disconnected blocks on `boss_warden` with sculpted overlapping granite blocks, glowing recessed rune channels, broken iron chains, warmaul, and 4 destructible outer armor plates (`ArmorPlate_Chest/LeftShoulder/RightShoulder/Crown`); rebuilt `enm_hollow_knight` dark steel helm and `enm_frost_troll` fur mantle. Verified via `art/blender/previews/realistic_enemies_boss_qa.png`.
- **GLB Footprint Optimization (`tools/assets/optimize_glb_textures.py`):** Resized and JPEG-compressed embedded textures inside all 60 GLBs from `209.43 MB` -> `46.73 MB` (`49,003,516` bytes, max `5.71 MB` per file) while preserving valid glTF v2 headers.

## Stage 2 — Engine, Rendering, Audio, Camera & Combat Systems

- **Rendering (`RealisticRenderer.ts`, `frostheimTerrain.ts`):** Added Poly Haven HDRI `PMREMGenerator` IBL, ACES Filmic tone mapping, sRGB color space, `EffectComposer` + `UnrealBloomPass` + `NordicGradeShader`, normal-mapped Frostheim terrain & animated `ice_003` lake, `getSurfaceKindAt()`, and `THREE.InstancedMesh` scatter (360 pines, 130 boulders, 90 stumps, 140 ferns).
- **Animation & Camera (`AnimationController.ts`, `CinematicCamera.ts`):** Replaced programmatic bone tilting with `THREE.AnimationMixer` crossfade state machine + normalized clip event triggers; built over-the-shoulder camera (`FOV 56°`, `3.4 m`, `V` toggle, collision pullback, lock-on, dialogue two-shot, Tomb vista, Warden boss pan, trauma shake).
- **Combat & VFX (`combatRules.ts`, `CombatVfx.ts`):** Removed large white slash arc meshes; implemented blade ribbon trails, spark bursts, snow dust, 240 ms input buffering, weapon timing weights, charged heavy scaling, directional hit reactions, and Mountain Warden Phase 2/3 outer armor plate destruction.
- **Spatial Audio (`eidrathAudio.ts`):** Implemented 5-bus Web Audio mixer, dynamic 2.4 s music crossfading, surface-matched footsteps, and HRTF 3D spatial ambient emitters.

## Stage 3 & 4 — Dark-Fantasy UI Overhaul & PWA Caching

- Built engraved dark-iron & frost UI styling (`src/styles/eidrath-ui.css`), atmospheric title screen (`EidrathTitleScreen.tsx`), auto-dimming minimal HUD (`EidrathHud.tsx`), rotating 3D equipment inspector (`InventoryPreview3D.tsx`), Canvas hillshaded topographic map (`FrostheimTopographicMap.tsx`), and gated Developer Mode telemetry + `BlenderDevDrawer`.
- Updated `vite.config.ts` (`cacheId: 'eidrath-v2'`) to keep bulky `/assets/eidrath/**` `.glb`/`.hdr`/`.mp3` files out of app-shell precache via `CacheFirst` runtime caching.

## Stage 5 — Automated Tests & Live Chrome WebGL Visual QA

- Expanded `src/game/eidrath.test.ts` with `QA-10` covering combat input buffering, weapon weights, charged scaling, directional hit reactions, surface classification, default settings, and the Visual QA Gate helper (`16/16` tests passing).
- Ran `tools/qa/verify_eidrath_webgl.py` against production build (`NODE_ENV=production PORT=3100 npx tsx server.ts`).
- **Run-1 Live Visual QA Catches & Immediate Fixes:**
  1. `03_combat_action.png`: Kaelen rotated upside-down during `Dodge` clip -> fixed `Dodge` keyframes in `eidrath_rig_utils.py` & rebuilt `chr_kaelen.glb`.
  2. `02_oathgrave_gameplay.png`: Tomb faced away from vista -> rotated `env_oathgrave_tomb` (`Math.PI * 0.75`) so stone archway opens cleanly onto the altar and Frostheim valley.
  3. `08_mountain_warden_boss.png`: Keep Gate pinched courtyard right flank -> repositioned Keep Gate (`x=6, z=-118, scale=1.45`) and Warden QA spawn (`z=-138`).
  4. `09_mobile_touch_hud.png`: Boss bar overlapped top mobile badges -> adjusted mobile responsive spacing in `EidrathHud.tsx`.
  5. Fixed Playwright `str(page.video.path())` JSON serialization in `verify_eidrath_webgl.py`.
- **Run-2 Live Visual QA Verified (`exit 0`):** Zero console errors, zero page errors, zero failed requests; all 10 `art/qa/after/` screenshots visually inspected and approved, along with 22.0 MB Playwright WebM gameplay capture.

## Stage 6 — Final Sign-Off, Reports & Verification

- Approved all 60 visually inspected GLB assets in `ASSET_MANIFEST.json` (`--approve-inspected`) and `src/game/assets/manifest.ts`.
- Authored master design, progress, performance, QA, credits, and synchronized `docs/` documentation.
- Completed final `npm run lint`, `npm test`, `npm run build`, and `factory verify` gate.
