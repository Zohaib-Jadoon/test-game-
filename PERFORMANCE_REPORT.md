# EIDRATH: The Last Oath — Performance & Optimization Report

Date: 2026-11-26  
Branch: `eidrath/overhaul`  
Hardware Target: AMD Ryzen 5 5600X (6C/12T), NVIDIA GeForce GTX 1650 SUPER (`4096 MiB` VRAM, Driver `610.88`), `15.92 GiB` RAM, Windows 11 Pro (`1920×1080`)

---

## 1. Native Unreal Engine 5.8.4 — 1080p Unrecorded Hardware Benchmarks

Measured cleanly **without video recording** via `tools/ue/benchmark_frostheim_valley.ps1` (`1,800` frames/run, first `120` warmup frames skipped -> `1,680` sustained frames, `-csvGpuStats`) + `500 ms` `nvidia-smi` GPU/VRAM polling (`_asset_cache/ue_frostheim_metrics.json`) on the artist-authored `/Game/Eidrath/Maps/Lvl_FrostheimValley`:

| Preset (1080p) | RHI | Scalability | Avg FPS | 1% Low FPS | Avg Frame (ms) | p95 Frame (ms) | Max Hitch (ms) | Avg GPU % | Peak Total VRAM (MiB) | Avg RAM (MB) | Peak RAM (MB) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `valley_dx11_low` | **DX11** | `0` | **295.9** | **195.2** | `3.38` | `4.48` | `29.57` | `37.2%` | `2286` | `1585.6` | `2290.6` |
| `valley_dx11_medium` | **DX11** | `1` | **196.5** | **145.8** | `5.09` | `6.34` | `8.89` | `51.9%` | `2232` | `1733.1` | `2311.1` |
| `valley_dx11_high` | **DX11** | `2` | **173.0** | **118.1** | `5.78` | `7.29` | `24.73` | `50.9%` | `2280` | `1708.8` | `2315.2` |
| `valley_dx11_ultra` | **DX11** | `3` | **165.9** | **126.3** | `6.03` | `7.27` | `10.70` | `53.6%` | `2310` | `1775.7` | `2299.1` |

### Early Trial DX11 vs. DX12 Comparison (`Lvl_FrostheimTrial`, `390` Measured Frames)
From `_asset_cache/ue_trial_metrics.json` (idle OS+IDE VRAM baseline before launch: `1951 MiB`):

| Config | RHI | Avg FPS | 1% Low FPS | Max Hitch (ms) | Peak Total VRAM (MiB) | Notes |
|---|---|---:|---:|---:|---:|---|
| `dx11_medium` | **DX11** | **199.1** | **145.7** | `7.83` | `2459` | Smooth frame pacing; default selected |
| `dx12_medium` | DX12 | `129.7` | **15.0** | **`134.09`** | `2653` (+194 MiB) | SM6 PSO compilation spikes on 4 GB VRAM |

**Key Hardware Takeaway:** Disabling Hardware Ray Tracing, Lumen GI, Nanite, and Virtual Shadow Maps while locking DirectX 11 + `r.Streaming.PoolSize=1000..1200` + `r.MotionBlurQuality=0` holds **165–295 FPS avg (118–195 FPS 1% low)** at 1080p on a 4 GB GTX 1650 SUPER, staying ~1.7–1.8 GB RAM and ~2.23–2.31 GB system-total VRAM (~300–400 MiB above OS idle) with wide headroom for combat AI, UI, and open-world streaming.

---

## 2. Native Asset & Packaging Footprint

- **Artist Pine Forest GLB Optimization (`_asset_cache/ue_ready_assets/`):** Embedded 4K textures resized cleanly to 1024px (`PNG` preserved for foliage alpha, `JPEG q=82` for opaque/normal), reducing the 11 extracted Poly Haven scene assets from **`176 MB` -> `67 MB`** before Unreal `Interchange` import.
- **Packaged Windows Build (`native/Builds/Win64/EidrathUE_Trial.exe`):** Cooked & archived via `RunUAT.bat BuildCookRun` in **`104.29 s`** (`733` input packages -> `981 MB` standalone Win64 distribution).

---

## 3. Preserved Three.js Web Reference Baseline (Historical Pre-Native Comparison)

Captured earlier via headless Chromium ANGLE WebGL with concurrent VP8 WebM recording (`_asset_cache/qa_metrics.json`) on `1280×720` (`60` optimized GLBs = `46.73 MB` / `823,338` tris, Vite production bundle `dist/assets/index-D-u2vhSA.js` `1,183.65 kB` / `315.90 kB` gzip, `15` PWA precache entries `1213.56 KiB`):
- Headless Chrome ANGLE + WebM capture measured `19–22 FPS` (`46.47–53.58 ms` avg), underscoring why migrating to native Unreal Engine 5.8.4 (DX11) delivers an ~8–10× frame-rate and frame-pacing improvement on this GTX 1650 SUPER hardware.
- *Pending native test:* Unrecorded live audio-enabled 60-second combat traversal capture with combat Montages active (scheduled for Phase 6/8 once C++ `Variant_Combat` compiles cleanly after PID `46804` closes).
