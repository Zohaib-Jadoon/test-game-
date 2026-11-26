# ENGINE_DECISION.md — Native Engine Evaluation & Final Selection

Date: 2026-11-26  
Host Hardware: AMD Ryzen 5 5600X (6C/12T), NVIDIA GeForce GTX 1650 SUPER (4096 MiB VRAM, Driver `610.88`, DirectX 12 / D3D Feature Level `12_1`, Vulkan `1.4.341`), `15.92 GiB` RAM, NVMe SSD (`D:` `355.1 GB` free). See [HARDWARE_PROFILE.md](HARDWARE_PROFILE.md).

---

## 1. Final Selection

**Selected Engine:** **Unreal Engine 5.8.4** (`D:\game\UE_5.8`)  
**Required Runtime Render Profile:** **DirectX 11 (`-d3d11`, SM5)** default, Lumen GI & Hardware Ray Tracing disabled (`r.DynamicGlobalIlluminationMethod=0`), Screen-Space Reflections (`r.ReflectionMethod=2`), Nanite disabled (`r.Nanite.ProjectEnabled=False`), conventional Cascaded Shadow Maps (`r.Shadow.Virtual.Enable=0`), volumetric clouds/fog disabled, TAA (`r.AntiAliasingMethod=2`), VRAM-bounded streaming pool (`r.Streaming.PoolSize=1000..1200`, `r.Streaming.LimitPoolSizeToVRAM=1`).

---

## 2. Measured Hardware Benchmark Evidence (`Lvl_FrostheimTrial`, 1080p Unrecorded)

Measured cleanly via `tools/ue/benchmark_ue_trial.ps1` using Unreal Engine 5.8.4 native `CsvProfile` (`450` frames, `60` warmup frames skipped, `-csvGpuStats`) + `nvidia-smi` + process working set sampling at **1920×1080** without concurrent video recording (`_asset_cache/ue_trial_metrics.json`):

| Trial Config  | RHI      | Scalability |   Avg FPS | 1% Low FPS | Avg Frame (ms) | p95 Frame (ms) | Max Hitch (ms) | Avg GPU % |  Peak Total VRAM (MiB) | Avg RAM (MB) | Verdict                        |
| ------------- | -------- | ----------: | --------: | ---------: | -------------: | -------------: | -------------: | --------: | ---------------------: | -----------: | ------------------------------ |
| `dx11_low`    | **DX11** |         `0` | **276.6** |  **185.5** |         `3.62` |         `4.65` |         `9.13` |   `19.4%` | `2441` (~`+490` delta) |     `1432.7` | **PASS**                       |
| `dx11_medium` | **DX11** |         `1` | **199.1** |  **145.7** |         `5.02` |         `6.39` |         `7.83` |   `23.4%` | `2459` (~`+508` delta) |     `1407.8` | **PASS (Default)**             |
| `dx11_high`   | **DX11** |         `2` | **176.9** |  **110.7** |         `5.65` |         `7.23` |        `11.97` |   `18.6%` | `2493` (~`+542` delta) |     `1452.7` | **PASS**                       |
| `dx12_medium` | DX12     |         `1` |   `129.7` |   **15.0** |         `7.71` |         `8.42` |   **`134.09`** |   `19.6%` |                 `2653` |     `1840.9` | Rejected for 4 GB VRAM default |

_Note: Idle Windows 11 + Antigravity IDE baseline before launching UE was `1951 MiB` VRAM (`nvidia-smi`). DX12 exhibited 134 ms SM6 PSO/shader compilation hitches (`15.0 FPS` 1% low) and +194 MiB higher peak VRAM than DX11 Medium._

### 2.1 Sustained Wave 2 Validation on Full Artist-Authored `Lvl_FrostheimValley` (1,680 Measured Frames / Preset)
Updated `Lvl_FrostheimValley` contains Poly Haven `SM_FrostheimTerrain` (`203 m × 200 m`), 3 photogrammetry `SM_MontaigleRuins`, 76 realized Pine/Fir trees, 30 mossy boulders, `RavenholdCabin`, 4 Poly Haven weapons, `Kaelen` player character, `Lyra`, `HollowSwordsman`, `MountainWarden`, and WAV spatial audio (`_asset_cache/ue_frostheim_metrics.json`):

| Valley Preset (1080p DX11) | Avg FPS | 1% Low FPS | Avg Frame (ms) | p95 Frame (ms) | Max Hitch (ms) | Avg GPU % | Peak Total VRAM (MiB) | Avg RAM (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `valley_dx11_low` (`sg=0`) | **295.9** | **195.2** | `3.38` | `4.48` | `29.57` | `37.2%` | `2286` | `1585.6` |
| `valley_dx11_medium` (`sg=1`) | **196.5** | **145.8** | `5.09` | `6.34` | `8.89` | `51.9%` | `2232` | `1733.1` |
| `valley_dx11_high` (`sg=2`) | **173.0** | **118.1** | `5.78` | `7.29` | `24.73` | `50.9%` | `2280` | `1708.8` |
| `valley_dx11_ultra` (`sg=3`) | **165.9** | **126.3** | `6.03` | `7.27` | `10.70` | `53.6%` | `2310` | `1775.7` |

---

## 3. Candidate Engine Comparison & Rationale

| Candidate                                       | Hardware Fit (GTX 1650 SUPER 4 GB)                                                              | Native RPG / Combat / Animation Tooling                                                                                                                                      | Free Asset Ecosystem                                                                                            | Budget / Commercial Licensing                                                                                                              | Decision                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Unreal Engine 5.8.4 (DX11 Non-Lumen/Nanite)** | **Strong with calibrated settings:** 176–276 FPS avg, ~500 MiB VRAM overhead, zero DX11 hitches | **Best-in-class built-in:** `IKRig`, `ControlRig`, `MotionWarping`, `GameplayStateTree`, `EnhancedInput`, `Variant_Combat` C++, `Niagara`, `CommonUI`, `Interchange` GLB/FBX | **Fab `0.0.23` + Quixel Bridge** installed directly in `D:\game\UE_5.8` (plus Blender + Poly Haven + ambientCG) | **PKR 0 upfront.** Standard Epic EULA: 0% up to `$1,000,000 USD` gross revenue/title; `5%` royalty above `$1M` (`3.5%` if launched on EGS) | **SELECTED**                                                                                         |
| **Godot 4 stable**                              | Light VRAM (~1 GB)                                                                              | Capable `AnimationTree`, needs custom third-person combat/retarg/IK setup; **not installed**                                                                                 | Godot AssetLib + Poly Haven                                                                                     | **PKR 0, MIT 0% royalty forever**                                                                                                          | **Fallback** if strict zero-royalty clause above $1M is required                                     |
| **Unity 6000.3.9f1 (URP)**                      | Light VRAM (~1.2–1.6 GB)                                                                        | Requires extra packages/setup compared to UE `Variant_Combat` + `MotionWarping`; installed (`6000.3.9f1`)                                                                    | Unity Asset Store free packs (check license per item)                                                           | Free Personal tier under `$200,000 USD`/yr                                                                                                 | **Not selected** (UE 5.8 already exceeded 175+ FPS on DX11 with superior animation/retarg/Fab tools) |
| **Three.js + WebGL (Preserved Reference)**      | Browser ANGLE overhead (~20–22 FPS under capture)                                               | Custom JS `AnimationMixer` & circle collision                                                                                                                                | Custom Blender GLBs                                                                                             | MIT / CC0                                                                                                                                  | **Preserved in `src/`** as migration reference & automated RPG regression suite                      |

---

## 4. Plugins Verified & Current Toolchain Status

- **Verified Loaded in UE 5.8.4 (`_asset_cache/ue_setup.log`):** `Fab` (`0.0.23`), `Bridge` (`MegascansPlugin`), `Interchange` (GLB/FBX skeletal/static/animation import verified), `ModelingToolsEditorMode`, `GameplayStateTree`, `Niagara`, `PythonScriptPlugin`, `EditorScriptingUtilities`.
- **Interactive Fab / Quixel Bridge Store:** Mounted cleanly in engine; interactive cloud catalog downloads require Epic Games account authentication inside the GUI without login bypass. Direct CC0 Poly Haven scenes/models + ambientCG PBR sets + MakeHuman MPFB2 are imported offline via UE `Interchange`.
- **C++ Build Status (`native/EidrathUE/`):** Installed free `Microsoft .NET Framework 4.8.1 Developer Pack` (`C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1`). `TP_ThirdPersonEditor` C++ target passed UHT (`84` generated files via `MSVC 14.44.35207` + Windows SDK `10.0.26100.0`) and paused only on `Global\LiveCoding_D++game+UE_5.8+Engine+Binaries+Win64+UnrealEditor.exe` because the user's open `UnrealEditor.exe` (PID `46804`) holds the global Live Coding mutex. Blueprint/Interchange production proceeds immediately in `native/EidrathUE_Trial/`.
