# EIDRATH: The Last Oath — QA & Verification Report

Date: 2026-11-25  
Branch: `eidrath/overhaul`  
Full Visual & Gameplay Report: [GAMEPLAY_QA_REPORT.md](../GAMEPLAY_QA_REPORT.md)  
Performance Benchmarks: [PERFORMANCE_REPORT.md](../PERFORMANCE_REPORT.md)  

## Automated Verification Commands

| Command | Result | Evidence |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** (exit 0) | Zero TypeScript errors across `src/` & `server.ts` |
| `npm test` (`tsx --test src/game/eidrath.test.ts src/utils/crypto.test.ts src/utils/blenderBridge.test.ts`) | **PASS** (**16/16** passed, 0 failed) | Includes `QA-01`–`QA-10` overhaul mechanics (input buffer, weapon weights, charged heavy scaling, directional hits, surface Foley detection, QA manifest gate), crypto & Blender bridge tests |
| `npm run build` (`vite build` + PWA `generateSW`) | **PASS** (exit 0) | `dist/assets/index-C19ZBWOU.js` (`308.49 kB` gzip); `eidrath-v2` SW precaches 15 entries (`1169.10 KiB`) and caches `/assets/eidrath/**` via `CacheFirst` |
| `factory verify` (`gate-504577dc`) | **4/5 PASS** (exit 1) | `tracked-secret-files`, `lint`, `test`, `build` PASS; `secret-content-scan` flagged 2 untouched pre-existing files (`firebase-applet-config.json:4` public Firebase client config & `src/db/drizzle.config.ts:10` regex false positive on `process.env.SQL_ADMIN_PASSWORD`) |
| `NODE_ENV=production PORT=3100 npx tsx server.ts` + `python tools/qa/verify_eidrath_webgl.py` | **PASS** (exit 0) | `0` console errors, `0` uncaught page errors, `0` failed requests; `10` AFTER screenshots + `22.0 MB` Playwright WebM video |

## Acceptance Highlights
- **Before vs. After Visual Verification:** All 9 `art/qa/before/` prototype frames and 10 `art/qa/after/` overhaul captures were inspected side-by-side (`GAMEPLAY_QA_REPORT.md`). Run-1 defects (upside-down Dodge dash, Oathgrave Tomb facing, Keep Gate courtyard spacing, mobile top boss-bar overlap) were fixed and re-verified cleanly in Run 2.
- **Asset Approval:** All **60 runtime `.glb` files** (`46.73 MB`, `823,338` triangles) passed glTF v2 header checks, in-game inspection, and approval in `ASSET_MANIFEST.json` & `src/game/assets/manifest.ts`.
- **Frame-Time Profiling (Headless Chrome ANGLE WebGL + Video Capture at `1280×720`):**
  - `low`: `53.58 ms` avg (`19 FPS`), `medium`: `46.47 ms` avg (`22 FPS`), `high`: `47.04 ms` avg (`21 FPS`), `ultra`: `47.25 ms` avg (`21 FPS`).
  - Native discrete-GPU 60 FPS desktop & physical mobile runs and optional cloud PostgreSQL/Firebase writes remain `NOT VERIFIED` in this local headless environment.
