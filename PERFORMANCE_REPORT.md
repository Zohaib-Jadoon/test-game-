# EIDRATH: The Last Oath — Performance & Optimization Report

Date: 2026-11-25  
Branch: `eidrath/overhaul`  
Build Target: Frostheim Vertical Slice (`http://127.0.0.1:3100`, `NODE_ENV=production npx tsx server.ts`)

---

## 1. Live Chrome WebGL Quality Preset Benchmarks

Measured by `tools/qa/verify_eidrath_webgl.py` (`_asset_cache/qa_metrics.json`) using Playwright `1.65.1` driving headless Google Chrome (ANGLE WebGL) at `1280×720` with concurrent VP8 WebM video recording enabled across 4 quality tiers:

| Preset | Resolution DPR Cap | Shadow Map | Post-Processing (`EffectComposer`) | Snow Particles | Env IBL Intensity | Avg Frame (ms) | p95 Frame (ms) | Worst Frame (ms) | Measured FPS |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| `low` | 1.0× | 1024 px | Disabled (direct render) | 160 | 0.55 | **53.58** | **66.7** | **66.8** | **19** |
| `medium` | 1.25× | 2048 px | Enabled (Bloom `0.22` + Nordic Grade) | 300 | 0.72 | **46.47** | **53.5** | **53.6** | **22** |
| `high` | 1.5× | 2048 px | Enabled (Bloom `0.28` + Nordic Grade) | 440 | 0.85 | **47.04** | **53.6** | **66.6** | **21** |
| `ultra` | 2.0× | 4096 px | Enabled (Bloom `0.34` + Nordic Grade) | 620 | 0.96 | **47.25** | **53.6** | **53.7** | **21** |

### Honest Hardware & Headless Environment Note
- These benchmarks reflect **headless Chromium under ANGLE WebGL + real-time Playwright `.webm` frame capture**, which bounds compositor frame pacing near ~20–22 FPS (~46–53 ms/frame). Notice `medium`, `high`, and `ultra` remain nearly flat (~46.5–47.3 ms), indicating ANGLE/video compositor overhead rather than shader or triangle starvation.
- **Native discrete-GPU desktop 60 FPS (`<= 16.6 ms`) and physical mobile device frame pacing:** `NOT VERIFIED` in this headless environment (requires interactive user desktop/mobile GPU run).

---

## 2. 3D Asset & Texture Footprint Optimization

Pipeline: `tools/assets/optimize_glb_textures.py` + `tools/assets/generate_asset_manifest.py`

| Metric | Raw Blender Export | Optimized Runtime (`public/assets/eidrath/`) | Reduction / Status |
|---|---:|---:|---|
| Runtime GLB Count | 60 `.glb` files | **60 `.glb` files** (`55` manifest + `5` scatter) | 100% glTF v2 valid |
| Total GLB Payload | `209.43 MB` | **`46.73 MB`** (`49,003,516` bytes) | **-77.7% payload reduction** |
| Largest Single GLB | > 15 MB raw | **`5.71 MB`** | Well under 10 MB Bridge limit |
| Total Triangle Count | — | **`823,338` tris** across all 60 GLBs | Budgeted for instanced world |
| Embedded PBR Maps | Uncapped 1K/2K PNG/JPEG | Max **512 px** diffuse / **256 px** normal & ORM JPEG | Eliminated redundant VRAM bloat |

---

## 3. Scene Draw-Call & Memory Optimizations

1. **Wilderness GPU Instancing (`EidrathEngine.ts`):**
   - Converted Frostheim wilderness props into 4 `THREE.InstancedMesh` batches: **360 frost pines**, **130 boulders**, **90 stumps**, and **140 ferns** (`720` placed props in 4 instanced groups instead of 720 separate scene-graph nodes/draw calls).
2. **PBR Terrain & Shared Resources:**
   - Single 180×180 terrain heightfield (`frostheimTerrain.ts`) with tiled Poly Haven `snow_field_aerial` / `snow_01` diffuse + normal + roughness maps and radial alpha-blended snow sprite particles (`RealisticRenderer.ts`).
   - `PMREMGenerator` HDRI IBL cubemaps cached per key (`hdriCache`) and reused across scene transitions.
   - `AnimationMixer` skeletons cloned cleanly via `SkeletonUtils.clone` while sharing cached parsed `GLTF` scenes (`assetCache` in `src/game/assets/manifest.ts`).
3. **Hidden Convex Colliders (`UCX_*`):**
   - Modular kit colliders (`env_*`) use low-poly invisible `UCX_*` hulls (`mesh.visible = false`), separating physics/raycast containment from visual mesh complexity.

---

## 4. Production Bundle & PWA Workbox Caching (`vite.config.ts`)

- **Latest Verified Production Build (`npm run build`, 997 ms):**
  - `dist/index.html`: `2.12 kB` (`0.91 kB` gzip)
  - `dist/assets/index-CXVe_teg.css`: `42.34 kB` (`8.38 kB` gzip)
  - `dist/assets/index-C19ZBWOU.js`: `1,138.13 kB` (`308.49 kB` gzip)
- **Service Worker Cache Strategy (`eidrath-v2`):**
  - App shell (`**/*.{js,css,html,ico,png,svg,woff,woff2}`) precaches **15 entries (`1169.10 KiB`)** via Workbox (`dist/sw.js`).
  - Large runtime 3D/audio/HDRI assets matching `/assets/eidrath/.*\.(glb|gltf|hdr|jpg|jpeg|png|mp3|json)$/i` are intentionally excluded from install-time precache and served via **`CacheFirst` runtime caching** (`eidrath-runtime-assets`, `maxEntries: 220`, 30-day expiration), preventing slow PWA install stalls while preserving offline replay after first visit.
- **Audio Compression (FFmpeg):**
  - All 6 Scott Buckley CC BY 4.0 orchestral tracks and 30+ OpenGameArt SFX normalized and transcoded cleanly to MP3 via FFmpeg (`public/assets/eidrath/audio/audio_manifest.json`).
