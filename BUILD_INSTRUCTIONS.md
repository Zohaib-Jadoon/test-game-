# BUILD_INSTRUCTIONS.md — Native Unreal Engine 5.8 & Reference Web Builds

Date: 2026-11-26  
Active Branch: `eidrath/overhaul`  
Verified Hardware Target: Windows 11 Pro, Ryzen 5 5600X, NVIDIA GTX 1650 SUPER (4096 MiB VRAM, DirectX 11 default), 15.92 GiB RAM, `D:\` NVMe SSD (`355.1 GB` free).

---

## 1. Prerequisites (100% Free)
- **Unreal Engine 5.8.4** installed at `D:\game\UE_5.8` (with `Fab`, `Bridge`, `Interchange`, `PythonScriptPlugin`, `EditorScriptingUtilities`, `Niagara`).
- **Blender 5.3.0** (`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`).
- **Visual Studio Build Tools 2022** (`MSVC 14.44.35207`) + **Windows 10 SDK `10.0.26100.0`** + **`.NET Framework 4.8.1 Developer Pack`** (`C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1`) for C++ builds.
- **FFmpeg 8.1+**, **Python 3.14+**, **Node.js 24+**.

---

## 2. Reproduce Assets & Build `native/EidrathUE_Trial` (Blueprint + Interchange)

Because `336+ MB` of imported CC0 binary `.uasset`s (`native/EidrathUE_Trial/Content/Eidrath/`) and `_asset_cache/` stay excluded from Git, run these exact commands from the repository root (`D:\MY Projects\Blender test`):

```powershell
# 1. Fetch CC0 Poly Haven Pine Forest archive & 4 Poly Haven weapons
curl.exe -L --fail --retry 6 -C - -o "_asset_cache/ready-scenes/pine-forest/original.zip" "https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip"
python tools/assets/fetch_ready_scenes.py --id pine-forest
# (Weapons fetched via Poly Haven API into _asset_cache/polyhaven_weapons/)

# 2. Export ground-aligned artist GLBs, unified SkeletalMeshes & terrain height grid
blender --background --disable-autoexec --python "tools/blender/export_pine_forest_for_ue.py"
blender --background --disable-autoexec --python "tools/blender/export_ue_characters_and_heights.py"

# 3. Transcode 48 kHz 16-bit PCM WAVs into _asset_cache/ue_audio_wav/ (via ffmpeg)

# 4. Import assets & build /Game/Eidrath/Maps/Lvl_FrostheimValley inside UE 5.8.4
& "D:\game\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "D:/MY Projects/Blender test/native/EidrathUE_Trial/EidrathUE_Trial.uproject" -ExecutePythonScript="D:/MY Projects/Blender test/tools/ue/setup_frostheim_trial.py" -Unattended -NoPause -NoSplash -NoSound -NullRHI
& "D:\game\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "D:/MY Projects/Blender test/native/EidrathUE_Trial/EidrathUE_Trial.uproject" -ExecutePythonScript="D:/MY Projects/Blender test/tools/ue/build_frostheim_valley.py" -Unattended -NoPause -NoSplash -NoSound -NullRHI
```

---

## 3. Package Standalone Windows `.exe` (`RunUAT.bat`)

Verified command (`ExitCode=0`, elapsed **`104.29 s`**, output size **`981 MB`**):

```powershell
& "D:\game\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun `
  -project="D:\MY Projects\Blender test\native\EidrathUE_Trial\EidrathUE_Trial.uproject" `
  -noP4 -platform=Win64 -clientconfig=Development `
  -cook -allmaps -stage -pak -archive `
  -archivedirectory="D:\MY Projects\Blender test\native\Builds\Win64" `
  -unattended -utf8output
```

### Launch the Packaged Windows Executable
```powershell
& "D:\MY Projects\Blender test\native\Builds\Win64\EidrathUE_Trial.exe" -d3d11 -ResX=1920 -ResY=1080 -windowed
```
*(Validated via 10-second live launch smoke check: `EXE_SMOKE_ALIVE_AT_10S=True`, clean window exit.)*

---

## 4. Compile `native/EidrathUE` (C++ `Variant_Combat` Module)

`native/EidrathUE/EidrathUE.uproject` carries UE 5.8's C++ `TP_ThirdPerson` / `Variant_Combat` combat, AI StateTree, and AnimNotify classes. Ensure **no other `UnrealEditor.exe` instance is open** (otherwise UnrealBuildTool pauses on `Global\LiveCoding_...UnrealEditor.exe`), then compile:

```powershell
& "D:\game\UE_5.8\Engine\Build\BatchFiles\Build.bat" TP_ThirdPersonEditor Win64 Development `
  -Project="D:\MY Projects\Blender test\native\EidrathUE\EidrathUE.uproject" -WaitMutex -FromMsBuild
```

---

## 5. Run Unrecorded 1080p Hardware Benchmarks
```powershell
powershell -ExecutionPolicy Bypass -File "tools\ue\benchmark_frostheim_valley.ps1" -Frames 1800
```

---

## 6. Preserved Three.js Web Reference & Contract Tests
```powershell
npm ci
npm run lint     # tsc --noEmit
npm test         # 25/25 contract, terrain, combat, save & motionMath unit tests
npm run build    # Vite 8 + Workbox PWA reference build
```
