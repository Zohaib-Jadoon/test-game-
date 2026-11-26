# HARDWARE_PROFILE.md — Detected System & Tooling Specification

Detected Date: 2026-11-26  
Host OS: **Microsoft Windows 11 Pro** (`Version 10.0.26200`, Build `26200`, WDDM `3.2`)

---

## 1. Compute, Graphics & Memory (Actual Measured Values)

| Subsystem           | Detected Hardware / Capability                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **CPU**             | **AMD Ryzen 5 5600X 6-Core Processor** (`AuthenticAMD`) — **6 physical cores / 12 logical threads**, `3701 MHz` base clock             |
| **GPU**             | **NVIDIA GeForce GTX 1650 SUPER** (`0x10DE / 0x2187`) — Discrete GPU (`NVIDIA`)                                                        |
| **Dedicated VRAM**  | **4096 MiB (4.0 GB)** reported by `nvidia-smi` (`4,293,918,720` bytes via Win32 CIM; `1398 MiB` free at idle under active desktop/IDE) |
| **Graphics Driver** | NVIDIA **`610.88`** (`32.0.16.1088`)                                                                                                   |
| **DirectX**         | **DirectX 12** (`WDDM 3.2`); hardware `D3D11CreateDevice` confirmed max feature level **`12_1`** (`hr: 0x0`)                           |
| **Vulkan**          | **Vulkan Instance `1.4.341`** / Physical Device conformance **`1.4.3.3`**                                                              |
| **System RAM**      | **15.92 GiB** (`17,097,162,752` bytes total physical memory; ~1.4–4.6 GiB free while Windows 11 + Antigravity IDE run concurrently)    |
| **Storage**         | **`HS-SSD-WAVE(P) 1024G`** (NVMe SSD, `953.9 GB` raw): **`C:`** `493.9 GB` (`44.8 GB` free), **`D:`** `459.0 GB` (`355.1 GB` free)     |

---

## 2. Installed Development Tools & Engines

| Tool / Engine                   | Detected Version                                                                                                                                                                                                   | Location / Verification                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Unreal Engine**               | **5.8.4** (`5.8.4-58902052+++UE5+Release-5.8-Windows`, Changelist `58902052`)                                                                                                                                      | `D:\game\UE_5.8` (`UnrealEditor.exe`, `UnrealEditor-Cmd.exe`, `RunUAT.bat`, `UnrealBuildTool.exe` verified present) |
| **Fab UE Plugin**               | **5.8.0** (`5.8.0-55116800`)                                                                                                                                                                                       | `D:\game\UE_5.8\Engine\Plugins\Fab\Fab.uplugin`                                                                     |
| **Quixel Bridge UE Plugin**     | **5.8.0** (`5.8.0-55116800`)                                                                                                                                                                                       | `D:\game\UE_5.8\Engine\Plugins\Bridge\Bridge.uplugin`                                                               |
| **Key UE 5.8 Modules Present**  | `EnhancedInput`, `IKRig`, `ControlRig`, `MotionWarping`, `GameplayAbilities`, `GameplayStateTree`, `CommonUI`, `Niagara`, `Water`, `Interchange`, `PythonScriptPlugin`, `EditorScriptingUtilities`, `GLTFExporter` | `D:\game\UE_5.8\Engine\Plugins`                                                                                     |
| **Unity Editor**                | **6000.3.9f1** (Unity 6) via Unity Hub                                                                                                                                                                             | `C:\Program Files\Unity\Hub\Editor\6000.3.9f1\Editor\Unity.exe`                                                     |
| **Godot Engine**                | Not installed on disk                                                                                                                                                                                              | Tested for absence across `C:\Program Files`, `D:\`, `$env:LOCALAPPDATA`                                            |
| **Blender**                     | **5.3.0** (build date `2026-11-10`) + MakeHuman **MPFB2 v2.0.18**                                                                                                                                                  | `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`                                                       |
| **Visual Studio C++ Toolchain** | **Visual Studio Build Tools 2022** (`MSVC 14.44.35207`) + **Windows 10 SDK `10.0.26100.0`** + **`.NET Framework 4.8.1 Developer Pack`** | `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`, `C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1` |
| **Runtime & Build CLI Tools**   | Node **`v24.21.0`**, Python **`3.14.5`**, FFmpeg **`8.1.1-full_build`**, Git **`2.54.0.windows.1`**, Git LFS, `.NET SDK` (`dotnet`), GitHub CLI (`gh`)                                                             | Verified in `PATH`                                                                                                  |

---

## 3. Hardware Bottlenecks & Rendering Guardrails

1. **4096 MiB VRAM Ceiling (`GTX 1650 SUPER`):**
   - At ~1398 MiB already free-delta consumed by OS + IDE, a native 1080p game must keep runtime VRAM under ~2.2–2.6 GB to prevent DXGI thrashing or `Out of video memory` crashes.
   - Hardware Ray Tracing, Lumen GI/Reflections, Nanite high-poly micropolygon clusters, Virtual Shadow Maps (VSM), and 4K uncompressed textures exceed 4 GB budgets quickly; native builds MUST default to conventional CSM shadows, screen-space/baked reflections, LOD meshes, `r.Streaming.PoolSize=1200`, and 1K/512px textures.
2. **15.92 GiB RAM Ceiling & Storage Placement:**
   - Because `C:` only has `44.8 GB` free while `D:` has `355.1 GB` free on the same NVMe SSD, all engine projects, Unreal `DerivedDataCache` overrides, and `_asset_cache/` stay on **`D:`** (`D:\MY Projects\Blender test`).
3. **Ryzen 5 5600X (6C/12T):**
   - Strong single-thread and multi-thread performance for C++ compiles (`MSVC 14.44`), physics, AI State Trees, and Blender batch export.
