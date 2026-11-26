# EIDRATH: The Last Oath — Gameplay & Visual QA Report

Date: 2026-11-26  
Branch: `eidrath/overhaul`  
Active Engine: Unreal Engine 5.8.4 (`D:\game\UE_5.8`, DX11 SM5) + Preserved TypeScript/Three.js Reference (`src/`)

---

## 1. Automated & Native Verification Summary

| Check | Command | Result | Details |
|---|---|---|---|
| TypeScript Lint | `npm run lint` (`tsc --noEmit`) | **PASS** | 0 errors across `src/` & `server.ts` after merging `eidrath/native-cowork` (`d65befb`) |
| Reference Contract Suite | `npm test` (`tsx --test`) | **PASS (25/25)** | All `QA-01`–`QA-10`, `Cowork:` regression tests, `Motion:` tests (`501` samples), crypto E2EE & Blender bridge tests pass |
| Reference Production Build | `npm run build` | **PASS** | `dist/assets/index-D-u2vhSA.js` (`315.90 kB` gzip), Workbox `15` entries (`1213.56 KiB`) |
| UE 5.8.4 Asset Import & Valley Build | `UnrealEditor-Cmd.exe ... build_frostheim_valley.py` | **PASS (exit 0)** | Imported 11 Poly Haven Pine Forest GLBs, 4 FBX weapons, 4 unified SkeletalMeshes (`SKM_Kaelen/Lyra/Hollow/Warden`), 6 WAVs; `BP_ThirdPersonCharacter` switched to `SKM_Kaelen` |
| UE 5.8.4 1080p Unrecorded Benchmark | `tools/ue/benchmark_frostheim_valley.ps1` | **PASS (exit 0)** | `1,680` measured frames/preset across `low/med/high/ultra` (`165.9–295.9 FPS`, `2232–2310 MiB` VRAM, `1.58–1.78 GB` avg RAM) |
| Standalone Windows Package | `RunUAT.bat BuildCookRun` | **PASS (exit 0, 104.29s)** | Packaged `native/Builds/Win64/EidrathUE_Trial.exe` (`981 MB` total) |
| Packaged `.exe` Launch Smoke Test | `EidrathUE_Trial.exe -d3d11 -ResX=1280 -ResY=720` | **PASS** | `EXE_SMOKE_ALIVE_AT_10S=True`, clean exit |
| UE 5.8 C++ Target Compile | `Build.bat TP_ThirdPersonEditor` | **BLOCKED (Exit 6 — External Mutex)** | Passed UHT (`84` files, `MSVC 14.44.35207` + `NETFXSDK 4.8.1`), paused only on `Global\LiveCoding_...` because user's open blank `UnrealEditor.exe` (`PID 46804`) is running |

---

## 2. Visual Inspection History (Native Unreal Engine 5.8 Captures)

1. **Initial UE Trial (`art/qa/ue_trial/`):**
   - `dx11_low/medium/high.png` confirmed smooth DX11 execution (~500 MiB VRAM delta) and identified three issues immediately: placeholder Quinn mannequin active, `env_frost_pine.glb` thin branch cards, and DX12 `134 ms` PSO spikes.
2. **Frostheim Valley Wave 1 (`art/qa/ue_frostheim/`):**
   - Replaced prototype terrain/trees with real CC0 Poly Haven **Pine Forest** `SM_FrostheimTerrain`, photogrammetry **Montaigle Ruins**, and 76 realized Pine/Fir trees.
   - Visual inspection caught: `BP_ThirdPersonCharacter` Kaelen pitched `-90°` face-down (`unreal.Rotator(roll, pitch, yaw)` positional argument bug), `Shot` at frame 1 before texture streaming settled + MotionBlur smearing, flat terrain default shader, and uphill `RavenholdCabin` gap.
3. **Frostheim Valley Wave 2 Fix Verification ([valley_dx11_high.png](art/qa/ue_frostheim/valley_dx11_high.png)):**
   - Verified visually via `read_file`: **Kaelen stands 100% upright** grounded on the snowy trail facing forward over-the-shoulder; **Lyra**, **Mountain Warden**, grounded **RavenholdCabin** (warm glowing mullions, stone base anchored in snow), **Montaigle Ruins**, and flanking pine trees all render sharply with zero motion-blur smearing.

---

## 3. Honest Remaining Gaps & `NOT VERIFIED` Scope
- **Full C++ Combat & AnimBlueprint Integration:** `BP_ThirdPersonCharacter` currently plays `SKM_KaelenIdle` while `native/EidrathUE` awaits `PID 46804` closure to compile `Variant_Combat` (`AnimNotify_DoAttackTrace`, StateTree AI) and author multi-clip `ABP_Kaelen` locomotion/attack blending.
- **Audio-Enabled Traversal Video Capture:** 6 real 48 kHz WAVs (`Scott Buckley CC BY 4.0` + `OpenGameArt`) are imported and placed in `Lvl_FrostheimValley`, while full recorded gameplay-with-audio video capture in UE 5.8 remains `NOT VERIFIED` pending interactive combat hookup.
- **Foliage Needle Thickness & Weapon Equips:** `pine_sapling_medium_a/b` trunks & branches are natural, while needle card density at long range can be further enriched with Quixel/Fab conifer cards (`Fab` / `Bridge` mounted cleanly; interactive catalog browsing requires user Epic sign-in).
- **WebGL Browser Post-Merge E2E & Cloud Sync:** `verify_eidrath_webgl.py` was NOT re-run after merging `eidrath/native-cowork` (`d65befb`), and cloud PostgreSQL/Firebase sync remains `NOT VERIFIED` (`DATABASE_URL` unset).
