# EIDRATH: The Last Oath — Master Design & Architecture Document

**Genre:** Third-Person Open-World Dark-Fantasy Action RPG  
**Vertical Slice Region:** Frostheim (500 m × 500 m continuous alpine open world, 8 landmarks)  
**Target Standard:** Photorealistic Nordic environmental atmosphere paired with weighty, over-the-shoulder, animation-blended third-person combat  
**Stack:** React 19, TypeScript 7, Three.js 0.187, Express Live Blender Bridge, Vite 8 + Workbox PWA (`eidrath-v2`), Blender 5.3.0 headless CLI + MPFB2 v2.0.18

---

## 1. Core Fantasy & Storyline (Preserved Vertical Slice)

Kaelen awakens inside **Oathgrave Tomb** above **Frostheim**, bound by the shattered remnant of the Oathbreaker covenant. Starting unarmed at dawn-frost elevation, Kaelen claims a rusted iron blade, rescues/allies with mage **Lyra** (whose loyalty responds dynamically to Mercy, Pragmatic, and Revenge dialogue choices), crosses **Ashen Span Bridge**, reaches the sanctuary village of **Ravenhold**, unlocks **Borin's Forge** and **Elder Edda's** counsel, investigates **Old Oath-Smithy** and the **Frozen Reach Cavern**, and confronts the 4.07 m corrupted granite **Mountain Warden** inside **Warden's Keep** to unseal the region's Return Shortcut and claim the _Shattering Oath Wave_.

Preserved RPG & progression systems (`src/content/eidrathContent.ts`, `src/game/rpg/rpgLogic.ts`, `src/game/save/saveSystem.ts`):

- **5 Playable Quests:** `q_broken_oath`, `q_blade_remembered`, `q_wardens_oath`, plus Frostheim side quests & Seal Stone objective progression.
- **Branching Narrative:** Moral choices (`Mercy`, `Pragmatic`, `Revenge`) adjust companion loyalty, corruption, faction standings, and post-Warden NPC reactions.
- **Companion System:** Lyra assists in combat, heals/buffs, holds ground, or focuses targets via command actions.
- **7 Skill Trees (21 Nodes):** Prerequisite validation and full skill point respec (`resetAllSkills`).
- **Equipment, Crafting & Economy:** Mainhand, 2-handed weapons (auto-unequipping offhand shields), offhand shield, chest/cloak armor, atomic forge upgrades at Borin's Smithy, quest-item sell/discard protection, and gold merchant transactions.
- **Resilient Persistence:** Versioned `SaveGame` v1 across `autosave`, `slot_1`, `slot_2`, `slot_3` backed by `localStorage` + `_backup` self-healing + IndexedDB mirror. Legacy `skyforge_*` records remain untouched.

---

## 2. Visual, Audio & Mechanical Overhaul Architecture

### 2.1 Asset & Character Pipeline (`tools/blender/`)

All primitive geometric placeholders were replaced with realistic assets generated and verified through reproducible Blender 5.3 scripts:

- **Characters (`build_realistic_characters.py`):** 5 anatomical humans (`chr_kaelen`, `chr_lyra`, `npc_borin`, `npc_edda`, `npc_villager`) built from **MakeHuman MPFB2 v2.0.18** (`game_engine` 53-bone skeleton) with layered armor/cloth shells, anatomical boots & gauntlets, facial scars/hair/beards, PolyHaven CC0 PBR materials, and weapon/head sockets (`hand_r`, `hand_l`, `back_weapon`, `head`).
- **Animation Retargeting (`eidrath_rig_utils.py`):** MIT-licensed Mixamo mocap clips (`Xbot.glb`, `Michelle.glb`) retargeted onto MPFB2 rest bones via parent-to-child bone direction vectors (`chain_dir`) to eliminate shoulder/arm twist. Keyframes trimmed strictly to animated bones; combat dash `Dodge` and idle/walk/run/crouch/attack/block/stagger/death NLA strips baked cleanly.
- **Weapons (`build_realistic_weapons.py`):** 8 grip-pivoted realistic weapons & shields (`wpn_oathbreaker`, `wpn_iron_sword`, `wpn_frost_axe`, `wpn_nightpiercer`, `wpn_iron_shield`, `wpn_oblivion_staff`, `wpn_worldshatter`, `wpn_torment_links`), incorporating PolyHaven CC0 `antique_estoc` and `hatchet`.
- **Enemies & Boss (`build_realistic_enemies_boss.py`):** 6 enemy archetypes (`enm_hollow_swordsman`, `enm_hollow_archer`, `enm_hollow_knight`, `enm_frost_wolf`, `enm_bandit`, `enm_frost_troll`) and **Mountain Warden** (`boss_warden`), a 4.07 m chiseled-granite guardian featuring weathered stone blocks, broken iron chains, recessed glowing blue rune fissures, warmaul, and 4 destructible outer armor plates (`ArmorPlate_Chest`, `ArmorPlate_LeftShoulder`, `ArmorPlate_RightShoulder`, `ArmorPlate_Crown`) shed across Phase 2/3.
- **Frostheim Environment (`build_realistic_frostheim.py`):** 10 modular architectural/terrain kit pieces with hidden `UCX_*` collision hulls (`env_oathgrave_tomb`, `env_ruined_bridge`, `env_nordic_cabin`, `env_borin_forge`, `env_frost_pine`, `env_rock_cliff`, `env_ice_cave_arch`, `env_keep_gate`, `env_keep_wall`, `env_oath_shrine`) and 25 Frostheim props using PolyHaven CC0 models & 1K PBR sets.
- **Optimization (`tools/assets/optimize_glb_textures.py`):** Embedded GLB texture optimization shrunk the 60 runtime GLBs from `209.43 MB` raw to `46.73 MB` (`49,003,516` bytes, `823,338` total triangles; max single GLB `5.71 MB`).

### 2.2 Rendering & Open World (`src/game/rendering/RealisticRenderer.ts`, `src/game/world/frostheimTerrain.ts`)

- **Lighting & Post-Processing:** `RGBELoader` + `PMREMGenerator` HDRI IBL (`snowy_forest`, `winter_evening`, `snowy_hillside`, `forest_cave`), ACES Filmic tone mapping (`exposure: 1.05`), sRGB output, `PCFSoftShadowMap`, exponential distance mist, and `EffectComposer` (`RenderPass` -> `UnrealBloomPass` -> `NordicGradeShader` vignette/contrast/frost grade -> `OutputPass`) scaled across `low`, `medium`, `high`, and `ultra` quality presets.
- **Terrain & Water:** 180×180 Frostheim heightfield textured with PolyHaven `snow_field_aerial` / `snow_01` diffuse + normal + roughness maps, an animated normal-mapped Frozen Reach lake (`ice_003`), distant alpine horizon ring, and `getSurfaceKindAt(x, z)` classifying `'snow' | 'stone' | 'wood' | 'water'`.
- **Instanced Wilderness:** `THREE.InstancedMesh` scatters 360 pines, 130 boulders, 90 stumps, and 140 ferns without individual per-mesh draw-call overhead.

### 2.3 Camera, Animation & Combat (`src/game/camera/CinematicCamera.ts`, `src/game/animation/AnimationController.ts`, `src/game/combat/combatRules.ts`, `src/game/combat/CombatVfx.ts`)

- **Over-the-Shoulder Camera:** `FOV 56°`, `3.4m` follow distance, `V` shoulder swap, raycast & terrain floor collision avoidance, target lock-on framing, dialogue two-shot framing, Oathgrave Tomb opening vista, Warden Keep boss intro pan, and trauma shake.
- **Animation State Machine:** `AnimationController` crossfades `THREE.AnimationMixer` actions, synchronizes playback rate with ground speed to prevent foot sliding, and dispatches normalized clip event markers (`foot_left`, `foot_right`, `swing_whoosh`, `hitbox_start`, `hitbox_end`, `cast_release`).
- **Deliberate Combat:** 240 ms input buffering, weapon-weight timing multipliers (`getWeaponMovesetTiming`), charged heavy scaling (`computeChargedAttackMultiplier`), single-hit `attackInstanceId` deduplication, directional hit reactions (`front | back | left | right`), timed parry vs stamina guard-break, dodge i-frames, blade ribbon trails, metallic spark bursts, and snow dust (replacing legacy flat white slash arcs).

### 2.4 Spatial Audio (`src/game/audio/eidrathAudio.ts`)

- 5 independent Web Audio gain buses (`master`, `music`, `ambience`, `sfx`, `dialogue`).
- Dynamic 2.4 s crossfading orchestral score by **Scott Buckley (CC BY 4.0)** across 6 states (`menu`, `explore`, `village`, `combat`, `boss`, `tomb`).
- Surface-aware footsteps (`snow`, `stone`, `wood`, `water`), combat impacts/whooshes, and HRTF 3D spatialized ambient emitters (Ravenhold fires,Frozen Reach water, alpine wind) normalized via FFmpeg.

### 2.5 Dark-Fantasy UI & Developer Mode (`src/components/`, `src/styles/eidrath-ui.css`)

- Forged dark-iron typography (`Cinzel` / `Inter`), engraved dividers, minimal auto-dimming HUD bars, circular Divine Oath sigil (`EidrathHud.tsx`).
- Interactive 3D rotating Kaelen equipment inspector (`InventoryPreview3D.tsx`).
- Topographic hillshaded Frostheim survey map (`FrostheimTopographicMap.tsx`) with zoom/pan, landmark pins, and fast travel.
- Clean mobile portrait (`390×844`) layout with virtual joystick + combat/interaction controls.
- Blender Bridge drawer (`BlenderDevDrawer.tsx`) and live FPS counters gated strictly behind **Settings -> Developer Mode**.

---

## 3. Controls Reference

| Action                               | Desktop Input                                                 | Notes                                                       |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Move                                 | `W A S D`                                                     | Camera-relative movement; defaults configurable in Settings |
| Sprint / Sneak                       | `Left Shift` / `Left Ctrl`                                    | Crouch-stealth dampens detection radius                     |
| Dodge Dash / Jump                    | `Space` / `C`                                                 | Dodge grants 180 ms invulnerability window                  |
| Light / Heavy Attack                 | `Left Click` / `Hold Shift + Click` (or Right Attack binding) | Supports 240 ms input buffer & charged heavy release        |
| Guard / Timed Parry                  | `Q` (or `Right Click`)                                        | Initial 180 ms window triggers stagger parry                |
| Shoulder Camera Toggle               | `V`                                                           | Swaps over-the-shoulder left/right framing                  |
| Target Lock-On                       | `Tab`                                                         | Locks camera & strafe orientation onto nearest threat       |
| Divine Ascension / Magic             | `R` / `1`–`3`                                                 | Consumes Divine Meter / Mana                                |
| Interact / Talk / Loot               | `E`                                                           | Context prompt at NPCs, Shrine, Seal Stones, Forges         |
| Menus (Map / Inv / Skills / Journal) | `M` / `I` / `K` / `J` / `Esc`                                 | Pauses simulation cleanly                                   |

Mobile viewports render an on-screen thumbstick and touch buttons (`Attack`, `Heavy`, `Guard`, `Dodge`, `Interact`, `Lock-On`, `Skills`).
