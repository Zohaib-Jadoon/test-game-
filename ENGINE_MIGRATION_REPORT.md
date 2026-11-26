# ENGINE_MIGRATION_REPORT.md — EIDRATH Native Unreal Engine 5.8 Migration Report

Date: 2026-11-26  
Reference Implementation Preserved: `src/` (`TypeScript` + `Three.js` + `25/25` unit tests)  
Native Target Projects: `native/EidrathUE_Trial/` (Blueprint + Interchange + packaged Win64) and `native/EidrathUE/` (C++ `Variant_Combat` foundation)

---

## 1. Migration Strategy & Data Preservation

The Three.js browser implementation (`src/content/eidrathContent.ts`, `src/game/types.ts`, `src/game/rpg/rpgLogic.ts`, `src/game/save/saveSystem.ts`, `src/game/combat/combatRules.ts`) remains intact on `eidrath/overhaul` as the authoritative contract reference until native UE 5.8 reaches full Frostheim gameplay parity.

| Web Reference Module | Canonical Domain Contract | Unreal Engine 5.8 Migration Path | Current Native Status |
|---|---|---|---|
| `src/game/types.ts` & `src/content/eidrathContent.ts` | 8 Frostheim landmarks, 5 quests, 20 items, 7 skill trees (21 nodes), 6 enemy archetypes + Mountain Warden 3-phase boss, 7-kingdom campaign identifiers | Export/bind into UE `UDataTable` / `UPrimaryDataAsset` structs (`EidrathContentRows.json` / C++ `FTableRowBase`) | Schema mapped; DataTable import ready for C++ Phase 10 |
| `src/game/combat/combatRules.ts` | 240 ms input buffering, weapon timing weights, windup/active/recovery timelines, single-hit `attackInstanceId`, dodge i-frames, timed parry vs guard break, Mountain Warden armor phases | `native/EidrathUE/Source/TP_ThirdPerson/Variant_Combat/` (`CombatCharacter`, `CombatAttacker`, `CombatDamageable`, `AnimNotify_DoAttackTrace`, `AnimNotify_CheckCombo`, `AnimNotify_CheckChargedAttack`) | C++ source staged & UHT passed (`84` files); awaits closing user's open blank UE Project Browser (`PID 46804`) to compile editor/game DLLs |
| `src/game/save/saveSystem.ts` | Versioned `SaveGame` v1 JSON schema (`autosave`, `slot_1..3`), `_backup` self-healing, legacy `skyforge_*` isolation | UE `USaveGame` wrapper (`UEidrathSaveGame`) + JSON import/export serializer preserving `schemaVersion: 1` fields and `skyforge_*` exclusion | Contract defined; Blueprint/C++ serializer scoped for Phase 10 |
| `src/game/world/frostheimTerrain.ts` | 500 m × 500 m Frostheim valley heightfield, snow/ice surfaces, Ravenhold, Oathgrave Tomb, Warden's Keep | `/Game/Eidrath/Maps/Lvl_FrostheimValley` using Poly Haven CC0 `SM_FrostheimTerrain` (`203 m × 200 m`), `M_FrostheimSnow` PBR material, Montaigle photogrammetry fortress ruins, 76 realized pine/fir trees, Ravenhold Cabin, Lyra, Hollow Swordsman, Mountain Warden, 4 Poly Haven weapons | **BUILT, GROUNDED & BENCHMARKED AT 165–295 FPS** (`1080p` DX11) |
| `src/game/assets/manifest.ts` | Rigged Kaelen, Lyra, NPCs, Enemies, Warden, Weapons, Frostheim modular architecture | Imported via UE 5.8 `Interchange` into `/Game/Eidrath/Characters/`, `/Game/Eidrath/Valley/`, `/Game/Eidrath/Weapons/`. Default Quinn mannequin replaced on `BP_ThirdPersonCharacter` with `SKM_Kaelen` | **MIGRATED & VERIFIED IN SCREENSHOTS** |
| `src/game/audio/eidrathAudio.ts` | Scott Buckley CC BY 4.0 score + OpenGameArt footsteps/combat/wind/fire | Transcoded to 48 kHz 16-bit PCM WAV (`_asset_cache/ue_audio_wav/`) and imported into `/Game/Eidrath/Audio/` + spatial `AmbientSound` actors in `Lvl_FrostheimValley` | **IMPORTED & WIRED** (`6` core tracks); combat anim-notify SoundCues pending AnimBP wiring |

---

## 2. Key Architectural Corrections Applied During Migration

1. **DX11 over DX12 for GTX 1650 SUPER (4 GB VRAM):** DirectX 12 suffered `134.09 ms` PSO/shader compilation hitches (`15.0 FPS` 1% low) and +194 MiB VRAM overhead, whereas DirectX 11 SM5 with `r.DynamicGlobalIlluminationMethod=0`, `r.Nanite.ProjectEnabled=False`, `r.Shadow.Virtual.Enable=0`, and `r.Streaming.PoolSize=1000..1200` achieved **165.9–295.9 FPS avg** with **118.1–195.2 FPS 1% low**.
2. **Coordinate & Rotator Alignment:** Verified UE Interchange maps glTF `1 m -> 100 cm` (`+Y up -> +Z up`), and fixed `unreal.Rotator(roll, pitch, yaw)` positional-argument trap on `BP_ThirdPersonCharacter` via `set_editor_property("relative_rotation", unreal.Rotator(roll=0, pitch=0, yaw=-90))`.
3. **Zero Motion-Blur & Grounded Slope Anchoring:** Disabled default UE Motion Blur (`r.MotionBlurQuality=0`) that smeared post-warmup frames and grounded `RavenholdCabin` (`min_corner_z - 35 cm`) + all 76 trees via `terrain_heights.json`.

---

## 3. Open Migration Items
- Compile `native/EidrathUE/` C++ `TP_ThirdPersonEditor` once `UnrealEditor.exe` (`PID 46804`) is closed cleanly, then copy `/Game/Eidrath/` assets over to combine C++ `Variant_Combat` (`AnimNotify_DoAttackTrace`, StateTree AI) with `Lvl_FrostheimValley`.
- Port `src/content/eidrathContent.ts` quests, crafting recipes, 7 skill trees, and branching dialogues into UE DataTables and CommonUI menus.
- Complete Oathgrave Tomb interior, Ravenhold Village interiors/NPCs, and Mountain Warden 3-phase boss encounter inside UE 5.8.
