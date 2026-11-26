# EIDRATH: The Last Oath — Development Progress Log

Repository: `Zohaib-Jadoon/test-game-` (branch `eidrath/overhaul`)  
Baseline Checkpoints: `checkpoint/pre-eidrath-wip` (`9921bc6`), `main` (`ff3eaed`)

---

## Prior Baseline (2026-11-25 & Cowork Merges)
- Completed realistic Three.js WebGL overhaul (`bcad71b`, `fa829cf`): MPFB2 characters, Mixamo MIT retargeting, Poly Haven HDRIs/PBR, Scott Buckley score, dark-iron UI, `SaveGame` v1, and 60 optimized GLBs.
- Fast-forward merged ChatGPT's `origin/eidrath/native-cowork` (`d65befb` -> `30` files): animation phase/rate smoothing (`motionMath.ts`), gait hysteresis, camera shoulder collision fix, save integrity hardening, `readyScenes.ts` artist scene pipeline, and `NATIVE_ENGINE_TRIAL.md` specification.
- Verified `npm run lint` (0 errors), `npm test` (**25/25 passing**), and `npm run build`.

---

## Native Engine Overhaul (2026-11-26 Antigravity Shift)

### Phase 1 — Synchronization, Hardware Detection & Tooling
- Detected exact machine hardware in [HARDWARE_PROFILE.md](HARDWARE_PROFILE.md): **AMD Ryzen 5 5600X** (`6C/12T`), **NVIDIA GeForce GTX 1650 SUPER** (`4096 MiB` VRAM, Driver `610.88`, D3D Feature Level `12_1`, Vulkan `1.4.341`), `15.92 GiB` RAM, `HS-SSD-WAVE(P) 1024G` NVMe (`D:` `355.1 GB` free), **Unreal Engine 5.8.4** (`D:\game\UE_5.8` with `Fab 0.0.23` & `Quixel Bridge 5.8.0`), **Unity `6000.3.9f1`**, **Blender `5.3.0`**, **VS 2022 Build Tools `14.44.35207`**.
- Installed free **Microsoft `.NET Framework 4.8.1 Developer Pack`** via `winget` (`NETFXSDK\4.8.1`) so UnrealBuildTool resolves `SwarmInterface`.

### Phase 2 — Engine Evaluation (`ENGINE_DECISION.md`)
- Evaluated UE 5.8.4 across `dx11_low/medium/high` and `dx12_medium` at `1080p` unrecorded (`CsvProfile` + `nvidia-smi`).
- Locked **Unreal Engine 5.8.4 (DirectX 11 SM5, non-Lumen, non-Nanite, CSM shadows, TAA, `r.Streaming.PoolSize=1000..1200`)** — delivering **176.9–276.6 FPS avg** (`110.7–185.5 FPS 1% low`) vs DX12's `134 ms` PSO spikes (`15.0 FPS` 1% low). Documented Godot 4 MIT as royalty-free fallback.

### Phase 3–8 — Artist Scene Acquisition, Native Valley & Packaging
- Acquired **Poly Haven CC0 Pine Forest** (`pine_forest.zip`, `2.62 GB`, SHA-256 `9d08c488...`) via `fetch_ready_scenes.py` and 4 **Poly Haven CC0 1K FBX weapons** (`ornate_war_hammer`, `ornate_medieval_mace`, `ornate_medieval_dagger`, `antique_estoc`).
- Authored `tools/blender/export_pine_forest_for_ue.py` & `export_ue_characters_and_heights.py`: exported 11 artist meshes (`SM_FrostheimTerrain`, 3 photogrammetry `SM_MontaigleRuins`, realized `SM_PineTree_01/02`, `SM_FirTree_01`, `SM_MossRock_01/02`, `SM_DeadTree`, `SM_TreeRoots`), optimized GLB textures (`176 MB -> 67 MB`), exported unified single-mesh `SKM_Kaelen/Lyra/HollowSwordsman/MountainWarden`, and generated exact `terrain_heights.json` lookup grid.
- Transcoded 6 real 48 kHz 16-bit PCM WAV files (`MUS_Frostheim_Explore`, `MUS_Warden_Boss`, `AMB_Alpine_Wind`, `AMB_Campfire`, `SFX_Sword_Swing`, `SFX_Footstep_Snow`) via FFmpeg.
- Built `/Game/Eidrath/Maps/Lvl_FrostheimValley` via `tools/ue/build_frostheim_valley.py`, replaced UE Quinn mannequin on `BP_ThirdPersonCharacter` with `SKM_Kaelen`, fixed `Rotator(roll, pitch, yaw)` orientation bug so Kaelen stands upright, disabled Motion Blur, and anchored `RavenholdCabin` into terrain slope.
- Benchmarked `Lvl_FrostheimValley` (`1,680` measured frames/preset): **165.9–295.9 FPS avg (118.1–195.2 FPS 1% low)** across DX11 `Low/Medium/High/Ultra` using `2232–2310 MiB` system-total VRAM.
- Packaged standalone Windows build via `RunUAT.bat BuildCookRun` (`104.29 s`, **`native/Builds/Win64/EidrathUE_Trial.exe`**, `981 MB` total) and passed 10-second live launch verification (`EXE_SMOKE_ALIVE_AT_10S=True`).
