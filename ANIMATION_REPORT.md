# ANIMATION_REPORT.md — Rigging, Retargeting & Locomotion Report

Date: 2026-11-26  
Rigging Pipeline: Blender 5.3.0 + MakeHuman **MPFB2 v2.0.18** (`game_engine` 53-bone armature) + UE 5.8.4 `Interchange`, `IKRig`, `ControlRig`, `MotionWarping`

---

## 1. Web Reference Motion & Retargeting Fixes Verified (`eidrath/native-cowork` + `eidrath/overhaul`)

Merged and verified all **25/25 unit & motion tests** (`npm test`), including ChatGPT's locomotion & retargeter improvements (`src/game/animation/AnimationController.ts`, `src/game/animation/motionMath.ts`, `tools/blender/eidrath_rig_utils.py`):
- **T-Pose to A-Pose Joint-Vector Retargeting (`chain_dir`):** Corrected Mixamo glTF leaf bone tail artifacts (`+Z = 2927`) by aligning parent-to-child joint vectors onto MPFB2 rest bones cleanly.
- **Quaternion Hemisphere Continuity & Full Cycles:** Preserved complete mocap cycles and prevented 180° quaternion flips in Blender NLA baking.
- **Gait Hysteresis, Bounded Substeps & Phase Preservation:** `motionMath.ts` tests verified frame-rate-independent exponential damping, bounded substeps down to 10 FPS (`501` monotonic checks), gait threshold hysteresis, and attack pose boundary synchronization across windup -> active -> recovery.
- **One-Shot Animation Terminal Markers & Restarts:** Verified fallback combo/repeated attack transitions restart cleanly without getting stuck in bind pose.

---

## 2. Native Unreal Engine 5.8 Skeletal Assets (`/Game/Eidrath/Characters/`)

To avoid Unreal splitting character armor/clothing into 15 independent SkeletalMesh components, `tools/blender/export_ue_characters_and_heights.py` unified each rigged character into a single skinned mesh keeping all vertex groups, materials, and NLA animation tracks intact before `Interchange` import:

| UE Asset Folder | Unified Skinned Mesh | Polygon Count | Imported AnimSequences | Player / NPC Assignment |
|---|---|---:|---:|---|
| `/Game/Eidrath/Characters/Kaelen` | `SKM_Kaelen` | `26,522` | **31+** (`Idle`, `Walk`, `Run`, `Sprint`, `Dodge`, `Block`, `Parry`, `LightAttack*`, `HeavyAttack`, `Cast`, `Stagger`, `Death`, etc.) | Assigned to `BP_ThirdPersonCharacter` (`Mesh`, `rot=(0, 0, -90)`, `loc=(0, 0, -90)`, upright verified in `art/qa/ue_frostheim/valley_dx11_high.png`) |
| `/Game/Eidrath/Characters/Lyra` | `SKM_Lyra` | `26,502` | **16+** (`Idle`, `Walk`, `Run`, `Talk`, `Cast`, etc.) | Spawned upright & grounded beside clearing (`CHR_Lyra`) |
| `/Game/Eidrath/Characters/Hollow` | `SKM_HollowSwordsman` | `24,665` | **14+** (`Idle`, `Walk`, `Run`, `Telegraph`, `Attack`, `Stagger`, `Death`, etc.) | Spawned upright on trail (`ENM_HollowSwordsman`) |
| `/Game/Eidrath/Characters/Warden` | `SKM_MountainWarden` | `360` (sculpted monolith rig) | **12+** (`Idle`, `Walk`, `Sweep`, `Slam`, `Fissure`, `Stagger`, `Death`, etc.) | Spawned under Montaigle arch (`BOSS_MountainWarden`) |

---

## 3. Defects Caught & Corrected in Visual Testing
1. **Prone `BP_ThirdPersonCharacter` Orientation:** Initial `set_relative_rotation(Rotator(0, -90, 0))` pitched Kaelen `-90°` face-down because `unreal.Rotator` positional arguments are `(roll, pitch, yaw)`. Fixed via `set_editor_property("relative_rotation", unreal.Rotator(roll=0.0, pitch=0.0, yaw=-90.0))` and verified upright in `valley_dx11_high.png`.
2. **Legacy `TP_ThirdPerson` Quinn Mannequin Replaced:** Removed Quinn visual assignment on `BP_ThirdPersonCharacter`.

---

## 4. Remaining Animation Work (Next Milestone & Licensing)
- **Unreal `AnimBlueprint` + `IKRig` BlendSpace:** Currently `BP_ThirdPersonCharacter` uses `ANIMATION_SINGLE_NODE` (`SKM_KaelenIdle`) so Kaelen renders cleanly without T-posing; next step is authoring `ABP_Kaelen` (`BlendSpace 2D` Idle/Walk/Run/Sprint + Combat UpperBody Slot + `IKRig` foot-locking to `SM_FrostheimTerrain` + `AnimNotify_DoAttackTrace` + `AnimNotify_FootstepSnow`).
- **Rig / Clip Licensing Audit (Preserved from `cowork.md`):** Raw `Xbot.glb` / `Michelle.glb` source provenance from `mrdoob/three.js` still needs explicit standalone redistribution confirmation or clean replacement with verified CC0 / Mixamo / UE-licensed animations before public release.
