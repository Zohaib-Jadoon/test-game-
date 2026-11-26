# Artist-authored environment and weapon pipeline

The existing environment geometry is rejected by the owner. No additional procedural boxes or proxy characters are acceptable as final art. This shift adds a working integration path for actual Blender scene files. It does not claim that the scene binaries have already been downloaded, exported or visually approved.

## Selected free source files

- Poly Haven Pine Forest: https://polyhaven.com/collections/pine_forest — entire authored scene ZIP, CC0. Start here for the title/forest environment, not the previous primitive shrine. Download: https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip
- Kless Medieval Village: https://blendswap.com/blend/13382 — CC0 .blend scene, use its detailed architecture as a Ravenhold candidate. Older Blender version; inspect shaders/packed textures and any login requirement. Free account if necessary; no bypass.
- Forest: https://blendswap.com/blend/18922 — CC0 listing, candidate for a river trail; download not verified.
- Poly Haven Ornate War Hammer: https://polyhaven.com/a/ornate_war_hammer — CC0, actual modeled weapon. Other candidates: https://polyhaven.com/a/ornate_medieval_mace and https://polyhaven.com/a/ornate_medieval_dagger.
- All sources are zero-cost candidates, not visually accepted assets. No real character replacement was acquired this shift; use a free artist-made rigged character with individually verified rights and actual sword-combat mocap. The old procedural attack clips still exist until replaced.

## Commands

From project root:
```powershell
python tools/assets/fetch_ready_scenes.py --id pine-forest
python tools/assets/fetch_ready_scenes.py --id medieval-village --local "D:\Downloads\medieval-village.zip"
```
The second command requires an actual manually downloaded file; adjust path. Read receipt.json under _asset_cache/ready-scenes/<id>/ to locate the extracted Blender file and SHA-256.

Open with Blender with auto-execution disabled. In the original scene, duplicate/adapt a collection named EIDRATH_EXPORT: preserve realistic authored geometry, reduce very dense geometry, bake unsupported Cycles/geometry-node materials, pack textures, make a coherent snowy scene and verify scale. Realize procedural vegetation or select only suitable meshes before export. Remove camera-facing branches and objects unrelated to medieval fantasy. Use native Blender and installed skills rather than re-modeling primitives. Select collection contents and position the scene origin intentionally.

```powershell
& $blender --background --disable-autoexec "PATH_TO_ADAPTED.blend" --python tools/blender/export_ready_scene.py -- --source-id pine-forest --id pine-title --collection EIDRATH_EXPORT
```
First run stages only. Inspect the GLB in Blender and the actual game before claiming quality. For the title, configure an actual camera position and target in the same GLB coordinate system; for gameplay configure world-space obstacle circles, matching terrain and omitted env IDs. The user did not authorize blindly replacing quest geometry. Existing terrain height and quest positions remain authoritative; align the adapted scene to them, or implement native terrain/collider support before using a scene with its own ground elevations. Do not import interactive props as part of a replacement zone; retain them separately.

Example **title placement template**, values are illustrative only and not tested:
```json
{"mode":"title","position":[8,2.1,12],"target":[0,1.6,0]}
```
Example **village zone placement template**, values are illustrative only and not tested:
```json
{"mode":"zone","x":-10,"z":36,"yaw":0,"scale":1,"radius":25,"omit":["env_nordic_cabin"],"colliders":[{"x":-16,"z":22,"radius":3.8}]}
```
Author all obstacle circles, verify routes and adjust the numbers. A title scene has no gameplay colliders. Do not activate a sample placement blindly. After configuring:
```powershell
& $blender --background --disable-autoexec "PATH_TO_ADAPTED.blend" --python tools/blender/export_ready_scene.py -- --source-id pine-forest --id pine-title --collection EIDRATH_EXPORT --placement "title-placement.json"
```
The script writes the runtime GLB and edits src/game/assets/ready-scenes.json. Loader loads title or world zones; only successfully loaded zones suppress matching old visual environment objects. Missing/rejected asset keeps original world available and logs warning. Empty config intentionally means no ready scene is installed. Visual acceptance remains pending. Never commit large unoptimized original archives. Credit sources in ASSET_CREDITS.md and include final SHA-256/evidence.

## Acceptance

1. Compare the real artist scene's render and in-game capture against the owner's screenshots.
2. Verify stable movement/camera/weapon collisions across the scene. Check routes to every quest interactable.
3. Verify actual complete locomotion clips, attack phase mapping, dodge, animation sound markers and no foot sliding at 30/60 FPS.
4. Capture continuous video with sound and no debug overlays. Benchmark separately without recording.
5. If the existing renderer cannot handle the artist-authored environment within hardware budgets, prioritize the free Godot native trial rather than replacing the detailed scene with primitives.
