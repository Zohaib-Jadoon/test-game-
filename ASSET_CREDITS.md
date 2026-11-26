# EIDRATH: The Last Oath — Asset Credits & Licenses

All third-party 3D models, HDRIs, PBR texture sets, animations, sound effects, and orchestral music integrated into **EIDRATH: The Last Oath** use verified permissive licenses (CC0 1.0 Public Domain, MIT, or CC BY 4.0 / CC BY 3.0 with attribution). No copyrighted commercial game rips or paywalled assets were used.

## 1. Photorealistic 3D Models, PBR Textures & HDRIs (CC0 1.0 — Public Domain)
- **Poly Haven** (`https://polyhaven.com/`): HDRIs (`snowy_forest`, `winter_evening`, `snowy_hillside`, `forest_cave`), 16 1K PBR material sets (`snow_01`, `snow_field_aerial`, `cliff_side`, `brown_mud_rocks_01`, `cobblestone_01`, `medieval_blocks_02`, `castle_wall_slates`, `old_stone_wall`, `roof_slates_02`, `weathered_peeling_timber`, `dark_wooden_planks`, `medieval_wood`, `metal_plate`, `rusty_metal`, `brown_leather`, `poly_wool_herringbone`), and 19 3D models (`fir_sapling`, `dead_tree_trunk`, `tree_stump_01`, `fern_02`, `boulder_01`, `coastal_cliff_01`, `rock_face_01`, `rock_moss_set_01`, `modular_fort_01`, `modular_wooden_pier`, `stone_fire_pit`, `Lantern_01`, `Barrel_01`, `Barrel_02`, `brass_candleholders`, `WoodenTable_01`, `gothic_statue`, `antique_estoc`, `hatchet`).
- **ambientCG** (`https://ambientcg.com/`): CC0 1.0 PBR maps (`Ice003` -> `ice_003`, `Snow008A` -> `snow_008a`).

## 2. Characters, Anatomy & Mocap Animations (CC0 / MIT)
- **MakeHuman MPFB2 v2.0.18** (`https://extensions.blender.org/add-ons/mpfb/`): Anatomical base meshes & `game_engine` 53-bone skeleton exported as original CC0 game assets (`chr_kaelen`, `chr_lyra`, `npc_borin`, `npc_edda`, `npc_villager`, `enm_hollow_*`, `enm_bandit`, `enm_frost_troll`).
- **Three.js Official Example Characters** (`https://github.com/mrdoob/three.js`, MIT License): `Xbot.glb`, `Soldier.glb`, `Michelle.glb` motion-capture skeletal animation clips retargeted onto MPFB2 characters.

## 3. Music & Sound Effects (CC BY 4.0 / CC BY 3.0 / CC0)
- **rpg_pack** — rpg_pack by artisticdude (OpenGameArt) — License: `CC0 1.0` (https://opengameart.org/content/rpg-sound-pack)
- **footsteps_surfaces** — footsteps_surfaces by Jute / OpenGameArt contributors — License: `CC BY 3.0` (https://opengameart.org/content/footsteps-on-different-surfaces)
- **wind_loop** — wind_loop by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/wind-loop)
- **sword_swing** — sword_swing by artisticdude (OpenGameArt) — License: `CC0 1.0` (https://opengameart.org/content/swishes-sound-pack)
- **magic_sfx** — magic_sfx by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/spell-sounds-starter-pack)
- **wind** — wind by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/wind1)
- **fire** — fire by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/fireplace-sound-loop)
- **water** — water by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/sea-and-river-wave-sounds)
- **wolf** — wolf by OpenGameArt contributor — License: `CC0 1.0` (https://opengameart.org/content/wolf-monster-sound)
- **music_menu** — Music: 'Katabasis_I' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)
- **music_explore** — Music: 'Anabasis_I' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)
- **music_village** — Music: 'HomeWasYou' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)
- **music_combat** — Music: 'Katabasis_II' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)
- **music_boss** — Music: 'Anabasis_II' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)
- **music_tomb** — Music: 'Unraveling' by Scott Buckley (www.scottbuckley.com.au) — License: `CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)` (https://www.scottbuckley.com.au/library/)

## 4. Sourcing Platforms Skipped Due to Account / Login / Paywall Restrictions
In strict compliance with licensing and authentication rules (no credential bypassing):
- **Sketchfab OAuth API / Pro Models**: Download API requires personal OAuth account token authentication; replaced by unauthenticated CC0 Poly Haven models + MPFB2.
- **Adobe Mixamo Website**: Interactive web downloads require an Adobe account sign-in; replaced with MIT-licensed Mixamo reference mocap binaries from `mrdoob/three.js` + Blender NLA retargeting.
- **Fab / BlenderKit Pro**: Account login / paid tiers skipped cleanly without workarounds.

*Ledger summary: 190 downloaded/cached source files verified; 60 `.glb` runtime files (46.73 MB total, 823,338 triangles).*

## 5. Cowork licensing verification status (2026-11-26)

Previous credits are preserved as the original author's provenance claims, not independent legal verification. In particular, the MIT license of Three.js code is not by itself proof that every third-party example model and embedded animation is MIT-licensed for standalone redistribution. Verify individual author/license metadata for Soldier.glb, Xbot.glb and Michelle.glb and their retargeted derivatives. Adobe Mixamo FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html . Free game use does not automatically permit redistribution of raw source assets. Keep questionable assets out of release/public source distributions until their specific rights are established; prefer CC0 or clearly permissive originals. No new third-party binary assets were added during this shift.
