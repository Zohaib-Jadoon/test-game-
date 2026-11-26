"""
Build /Game/Eidrath/Maps/Lvl_FrostheimValley inside UE 5.8.4 (Wave 2 Visual & Character Upgrade):
- Imports unified SkeletalMeshes (SKM_Kaelen, SKM_Lyra, SKM_HollowSwordsman, SKM_MountainWarden)
- Replaces default Quinn mannequin on BP_ThirdPersonCharacter with SKM_Kaelen
- Applies M_FrostheimSnow onto SM_FrostheimTerrain with complex collision saved
- Fixes pine/fir foliage alpha retention (TwoSided, OpacityMaskClipValue=0.12, NeverStream)
- Uses terrain_heights.json for exact millimeter grounding across ruins, trees, boulders & actors
"""
import json
import math
import random
from pathlib import Path
import unreal

REPO_ROOT = Path(__file__).resolve().parents[2]
READY_ASSETS = REPO_ROOT / "_asset_cache" / "ue_ready_assets"
AUDIO_WAVS = REPO_ROOT / "_asset_cache" / "ue_audio_wav"
WEAPONS_CACHE = REPO_ROOT / "_asset_cache" / "polyhaven_weapons"


def import_if_missing(file_path: Path, dest_path: str, probe_asset: str | None = None, dest_name: str | None = None):
    if probe_asset and unreal.EditorAssetLibrary.does_asset_exist(probe_asset):
        return []
    if not file_path.exists():
        unreal.log_warning(f"[EidrathValley] Missing file: {file_path}")
        return []
    task = unreal.AssetImportTask()
    task.filename = str(file_path)
    task.destination_path = dest_path
    if dest_name:
        task.destination_name = dest_name
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.imported_object_paths or [])
    unreal.log(f"[EidrathValley] Imported {file_path.name} -> {len(imported)} asset(s)")
    return imported


def find_first_asset(folder: str, cls_filter):
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    for a in reg.get_assets_by_path(folder, recursive=True):
        obj = a.get_asset()
        if isinstance(obj, cls_filter):
            return obj
    return None


def find_all_assets(folder: str, cls_filter):
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    out = []
    for a in reg.get_assets_by_path(folder, recursive=True):
        obj = a.get_asset()
        if isinstance(obj, cls_filter):
            out.append(obj)
    return out


def fix_foliage_materials_and_textures(folder: str):
    fixed_mats = 0
    for mat in find_all_assets(folder, unreal.Material):
        name = mat.get_name().lower()
        if any(k in name for k in ("twig", "needle", "leaf", "branch", "foliage")):
            try:
                mat.set_editor_property("two_sided", True)
                mat.set_editor_property("opacity_mask_clip_value", 0.12)
                unreal.MaterialEditingLibrary.recompile_material(mat)
                unreal.EditorAssetLibrary.save_loaded_asset(mat)
                fixed_mats += 1
            except Exception as exc:
                unreal.log_warning(f"[EidrathValley] Mat foliage tweak skipped {name}: {exc}")

    for mi in find_all_assets(folder, unreal.MaterialInstanceConstant):
        name = mi.get_name().lower()
        if any(k in name for k in ("twig", "needle", "leaf", "branch", "foliage")):
            try:
                bo = mi.get_editor_property("base_property_overrides")
                bo.set_editor_property("override_two_sided", True)
                bo.set_editor_property("two_sided", True)
                bo.set_editor_property("override_opacity_mask_clip_value", True)
                bo.set_editor_property("opacity_mask_clip_value", 0.12)
                mi.set_editor_property("base_property_overrides", bo)
                unreal.EditorAssetLibrary.save_loaded_asset(mi)
                fixed_mats += 1
            except Exception:
                pass

    fixed_tex = 0
    for tex in find_all_assets(folder, unreal.Texture2D):
        name = tex.get_name().lower()
        if any(k in name for k in ("twig", "needle", "branch", "pine", "fir", "ruins", "terrain")):
            try:
                tex.set_editor_property("never_stream", True)
                if any(k in name for k in ("twig", "needle", "branch")):
                    tex.set_editor_property("mip_gen_settings", unreal.TextureMipGenSettings.TMGS_SHARPEN5)
                unreal.EditorAssetLibrary.save_loaded_asset(tex)
                fixed_tex += 1
            except Exception:
                pass

    unreal.log(f"[EidrathValley] Foliage polish: {fixed_mats} materials, {fixed_tex} textures updated")


def replace_player_with_kaelen():
    bp_path = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
    bp = unreal.EditorAssetLibrary.load_asset(bp_path)
    kaelen_skm = find_first_asset("/Game/Eidrath/Characters/Kaelen", unreal.SkeletalMesh)
    kaelen_anims = find_all_assets("/Game/Eidrath/Characters/Kaelen", unreal.AnimSequence)
    kaelen_idle = next((a for a in kaelen_anims if a.get_name().lower().endswith("idle") or "_idle" in a.get_name().lower()), kaelen_anims[0] if kaelen_anims else None)
    if not bp or not kaelen_skm:
        unreal.log_warning(f"[EidrathValley] Missing BP or Kaelen SKM: bp={bool(bp)}, skm={bool(kaelen_skm)}")
        return False

    gen_cls = bp.generated_class()
    cdo = unreal.get_default_object(gen_cls) if gen_cls else None
    updated = False

    # 1. Update CDO mesh component using set_editor_property so SCS/CDO serialization persists
    if cdo:
        try:
            mesh_comp = cdo.get_editor_property("mesh")
            if mesh_comp:
                mesh_comp.set_skinned_asset_and_update(kaelen_skm, True)
                mesh_comp.set_editor_property("relative_location", unreal.Vector(0.0, 0.0, -90.0))
                mesh_comp.set_editor_property("relative_rotation", unreal.Rotator(roll=0.0, pitch=0.0, yaw=-90.0))
                mesh_comp.set_editor_property("anim_class", None)
                if kaelen_idle:
                    mesh_comp.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
                    mesh_comp.override_animation_data(kaelen_idle, is_looping=True, is_playing=True, position=0.0, play_rate=1.0)
                updated = True
        except Exception as exc:
            unreal.log_warning(f"[EidrathValley] CDO mesh update warning: {exc}")

    # 2. Update SubobjectDataBlueprint template so Blueprint recompilation preserves Kaelen upright
    try:
        sub_sys = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sub_sys.k2_gather_subobject_data_for_blueprint(bp)
        for h in handles:
            data = sub_sys.k2_find_subobject_data_from_handle(h)
            obj = unreal.SubobjectDataBlueprintFunctionLibrary.get_object_for_blueprint(data, bp)
            if isinstance(obj, unreal.SkeletalMeshComponent):
                obj.set_skinned_asset_and_update(kaelen_skm, True)
                obj.set_editor_property("relative_location", unreal.Vector(0.0, 0.0, -90.0))
                obj.set_editor_property("relative_rotation", unreal.Rotator(roll=0.0, pitch=0.0, yaw=-90.0))
                obj.set_editor_property("anim_class", None)
                if kaelen_idle:
                    obj.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
                    obj.override_animation_data(kaelen_idle, is_looping=True, is_playing=True, position=0.0, play_rate=1.0)
                updated = True
    except Exception as exc:
        unreal.log_warning(f"[EidrathValley] SubobjectData update warning: {exc}")

    try:
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    except Exception as exc:
        unreal.log_warning(f"[EidrathValley] Blueprint compile note: {exc}")
    unreal.EditorAssetLibrary.save_loaded_asset(bp)
    cdo_after = unreal.get_default_object(bp.generated_class()) if bp.generated_class() else None
    rot_after = cdo_after.get_editor_property("mesh").get_editor_property("relative_rotation") if cdo_after else None
    unreal.log(f"[EidrathValley] Replaced BP_ThirdPersonCharacter mesh with {kaelen_skm.get_name()} (rot_after={rot_after}, updated={updated})")
    return updated


def load_height_sampler():
    hpath = READY_ASSETS / "terrain_heights.json"
    if not hpath.exists():
        return lambda x, y: 0.0
    data = json.loads(hpath.read_text("utf-8"))
    cells = data["cells"]
    n = data["gridN"]
    xmin, dx = data["xmin"], data["dx"]
    ymin, dy = data["ymin"], data["dy"]

    def sample(x: float, y: float) -> float:
        fx = (x - xmin) / dx
        fy = (y - ymin) / dy
        ix0 = max(0, min(n - 2, int(fx)))
        iy0 = max(0, min(n - 2, int(fy)))
        tx = max(0.0, min(1.0, fx - ix0))
        ty = max(0.0, min(1.0, fy - iy0))
        z00 = cells[ix0][iy0]
        z10 = cells[ix0 + 1][iy0]
        z01 = cells[ix0][iy0 + 1]
        z11 = cells[ix0 + 1][iy0 + 1]
        z0 = z00 * (1.0 - tx) + z10 * tx
        z1 = z01 * (1.0 - tx) + z11 * tx
        return z0 * (1.0 - ty) + z1 * ty

    return sample


def spawn_static_mesh(actor_sub, mesh, loc, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0), label=None):
    if not mesh:
        return None
    actor = actor_sub.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(*loc),
        unreal.Rotator(roll=float(rot[0]), pitch=float(rot[1]), yaw=float(rot[2])),
    )
    if actor:
        actor.static_mesh_component.set_static_mesh(mesh)
        actor.set_actor_scale3d(unreal.Vector(*scale))
        if label:
            actor.set_actor_label(label)
    return actor


def spawn_skeletal_actor(actor_sub, folder: str, loc, rot, idle_suffix: str, label: str, scale=(1.0, 1.0, 1.0)):
    skm = find_first_asset(folder, unreal.SkeletalMesh)
    if not skm:
        return None
    anims = find_all_assets(folder, unreal.AnimSequence)
    idle_anim = next((a for a in anims if idle_suffix.lower() in a.get_name().lower()), anims[0] if anims else None)
    sk_actor = actor_sub.spawn_actor_from_class(
        unreal.SkeletalMeshActor,
        unreal.Vector(*loc),
        unreal.Rotator(roll=float(rot[0]), pitch=float(rot[1]), yaw=float(rot[2])),
    )
    if sk_actor:
        comp = sk_actor.skeletal_mesh_component
        comp.set_skinned_asset_and_update(skm, True)
        sk_actor.set_actor_scale3d(unreal.Vector(*scale))
        if idle_anim:
            try:
                comp.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
                comp.override_animation_data(idle_anim, is_looping=True, is_playing=True, position=0.0, play_rate=1.0)
            except Exception:
                pass
        sk_actor.set_actor_label(label)
    return sk_actor


def main():
    unreal.EditorAssetLibrary.make_directory("/Game/Eidrath/Characters")

    # 1. Import unified SkeletalMeshes
    for name, dest in [
        ("SKM_Kaelen.glb", "/Game/Eidrath/Characters/Kaelen"),
        ("SKM_Lyra.glb", "/Game/Eidrath/Characters/Lyra"),
        ("SKM_HollowSwordsman.glb", "/Game/Eidrath/Characters/Hollow"),
        ("SKM_MountainWarden.glb", "/Game/Eidrath/Characters/Warden"),
    ]:
        if not find_first_asset(dest, unreal.SkeletalMesh):
            import_if_missing(READY_ASSETS / name, dest)

    # 2. Replace Quinn mannequin on BP_ThirdPersonCharacter with Kaelen
    replace_player_with_kaelen()

    # 3. Fix pine/fir foliage materials & never-stream mipmaps
    fix_foliage_materials_and_textures("/Game/Eidrath/Valley")

    # 4. Prepare snow terrain material + complex collision
    terrain_mesh = find_first_asset("/Game/Eidrath/Valley/Terrain", unreal.StaticMesh)
    snow_mat = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Materials/M_FrostheimSnow")
    if terrain_mesh:
        try:
            body_setup = terrain_mesh.get_editor_property("body_setup")
            if body_setup:
                body_setup.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
            unreal.EditorAssetLibrary.save_loaded_asset(terrain_mesh)
        except Exception as exc:
            unreal.log_warning(f"[EidrathValley] Terrain collision save warning: {exc}")

    ruin1 = find_first_asset("/Game/Eidrath/Valley/Ruins01", unreal.StaticMesh)
    ruin2 = find_first_asset("/Game/Eidrath/Valley/Ruins02", unreal.StaticMesh)
    ruin3 = find_first_asset("/Game/Eidrath/Valley/Ruins03", unreal.StaticMesh)
    cabin_mesh = find_first_asset("/Game/Eidrath/Env/Cabin", unreal.StaticMesh)
    trees = [m for m in (
        find_first_asset("/Game/Eidrath/Valley/Pine01", unreal.StaticMesh),
        find_first_asset("/Game/Eidrath/Valley/Pine02", unreal.StaticMesh),
        find_first_asset("/Game/Eidrath/Valley/Fir01", unreal.StaticMesh),
    ) if m is not None]
    rocks = [m for m in (
        find_first_asset("/Game/Eidrath/Valley/Rock01", unreal.StaticMesh),
        find_first_asset("/Game/Eidrath/Valley/Rock02", unreal.StaticMesh),
    ) if m is not None]
    dead_tree = find_first_asset("/Game/Eidrath/Valley/DeadTree", unreal.StaticMesh)
    tree_roots = find_first_asset("/Game/Eidrath/Valley/TreeRoots", unreal.StaticMesh)
    estoc_mesh = find_first_asset("/Game/Eidrath/Weapons/Estoc", unreal.StaticMesh)
    hammer_mesh = find_first_asset("/Game/Eidrath/Weapons/Warhammer", unreal.StaticMesh)
    mace_mesh = find_first_asset("/Game/Eidrath/Weapons/Mace", unreal.StaticMesh)
    dagger_mesh = find_first_asset("/Game/Eidrath/Weapons/Dagger", unreal.StaticMesh)

    # 5. Rebuild Lvl_FrostheimValley cleanly with exact height-grid grounding
    level_sub = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    map_path = "/Game/Eidrath/Maps/Lvl_FrostheimValley"
    level_sub.load_level(map_path)
    removed = 0
    for existing in list(actor_sub.get_all_level_actors()):
        if isinstance(existing, (unreal.WorldSettings, unreal.Brush)):
            continue
        try:
            actor_sub.destroy_actor(existing)
            removed += 1
        except Exception:
            pass
    unreal.log(f"[EidrathValley] Cleared {removed} actors in loaded {map_path}")

    ground_z = load_height_sampler()

    # Subfloor well below terrain minimum (-1108cm) as distant horizon safety skirt only
    plane_mesh = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane")
    subfloor = spawn_static_mesh(actor_sub, plane_mesh, (0.0, 0.0, -1120.0), scale=(320.0, 320.0, 1.0), label="FrostheimHorizonSkirt")
    if subfloor and snow_mat:
        subfloor.static_mesh_component.set_material(0, snow_mat)

    if terrain_mesh:
        t_actor = spawn_static_mesh(actor_sub, terrain_mesh, (0.0, 0.0, 0.0), label="FrostheimTerrain")
        if t_actor:
            t_actor.static_mesh_component.set_collision_profile_name("BlockAll")
            if snow_mat:
                t_actor.static_mesh_component.set_material(0, snow_mat)

    # Atmospheric Nordic Winter Lighting & Locked Auto-Exposure (Explicit roll/pitch/yaw!)
    sun = actor_sub.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 1800), unreal.Rotator(roll=0.0, pitch=-26.0, yaw=-42.0))
    if sun:
        lc = sun.light_component
        lc.set_intensity(3.4)
        lc.set_light_color(unreal.LinearColor(1.0, 0.90, 0.78, 1.0))
        lc.set_cast_shadows(True)
        sun.set_actor_label("SunLight_Frostheim")

    sky = actor_sub.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 1400), unreal.Rotator())
    if sky:
        slc = sky.light_component
        slc.set_intensity(1.1)
        try:
            slc.set_editor_property("real_time_capture", True)
        except Exception:
            pass
        sky.set_actor_label("SkyLight_Frostheim")

    actor_sub.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator())
    fog = actor_sub.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 400), unreal.Rotator())
    if fog:
        fc = fog.component
        fc.set_fog_density(0.0055)
        fc.set_fog_inscattering_color(unreal.LinearColor(0.36, 0.46, 0.58, 1.0))
        fog.set_actor_label("HeightFog_Frostheim")

    ppv = actor_sub.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0), unreal.Rotator())
    if ppv:
        ppv.set_editor_property("unbound", True)
        s = ppv.get_editor_property("settings")
        try:
            s.set_editor_property("override_auto_exposure_min_brightness", True)
            s.set_editor_property("auto_exposure_min_brightness", 0.35)
            s.set_editor_property("override_auto_exposure_max_brightness", True)
            s.set_editor_property("auto_exposure_max_brightness", 1.25)
            s.set_editor_property("override_motion_blur_amount", True)
            s.set_editor_property("motion_blur_amount", 0.0)
            ppv.set_editor_property("settings", s)
        except Exception:
            pass
        ppv.set_actor_label("PPV_FrostheimGrade")

    # Playable Kaelen PlayerStart grounded at exact terrain Z + 92cm capsule half-height
    px, py = -2200.0, -180.0
    pz = ground_z(px, py)
    ps = actor_sub.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(px, py, pz + 92.0), unreal.Rotator(roll=0.0, pitch=0.0, yaw=6.0))
    if ps:
        ps.set_actor_label("PlayerStart_Kaelen")

    # Photogrammetry Montaigle Fortress Ruins ahead on ridge (+X)
    ruin_specs = [
        (ruin1, (1650.0, -280.0), (0.0, 0.0, 145.0), "WardenRuins_KeepMain"),
        (ruin2, (2450.0, 760.0),  (0.0, 0.0, 210.0), "WardenRuins_Tower"),
        (ruin3, (1400.0, 1180.0), (0.0, 0.0, 95.0),  "WardenRuins_Gate"),
    ]
    for rmesh, (rx, ry), rrot, rlabel in ruin_specs:
        if rmesh:
            rz = ground_z(rx, ry)
            spawn_static_mesh(actor_sub, rmesh, (rx, ry, rz - 45.0), rot=rrot, label=rlabel)

    # Ravenhold Nordic Cabin anchored cleanly into slope (min corner height - 35cm)
    if cabin_mesh:
        cx, cy = -720.0, 560.0
        cz = min(ground_z(cx + ox, cy + oy) for ox in (-350, 0, 350) for oy in (-350, 0, 350))
        spawn_static_mesh(actor_sub, cabin_mesh, (cx, cy, cz - 35.0), rot=(0.0, 0.0, 145.0), label="RavenholdCabin")

    # Companion Lyra, Hollow Swordsman & Mountain Warden Boss grounded cleanly (Yaw in Z slot!)
    lx, ly = -1680.0, -340.0
    spawn_skeletal_actor(actor_sub, "/Game/Eidrath/Characters/Lyra", (lx, ly, ground_z(lx, ly)), (0.0, 0.0, 22.0), "Idle", "CHR_Lyra")

    hx, hy = -1050.0, 140.0
    spawn_skeletal_actor(actor_sub, "/Game/Eidrath/Characters/Hollow", (hx, hy, ground_z(hx, hy)), (0.0, 0.0, 195.0), "Idle", "ENM_HollowSwordsman")

    wx, wy = 720.0, -160.0
    spawn_skeletal_actor(actor_sub, "/Game/Eidrath/Characters/Warden", (wx, wy, ground_z(wx, wy)), (0.0, 0.0, 172.0), "Idle", "BOSS_MountainWarden")

    # 4 Poly Haven CC0 Realistic Weapons near clearing
    for wmesh, (ax, ay), wlabel in [
        (estoc_mesh, (-1580.0, -240.0), "WPN_AntiqueEstoc"),
        (hammer_mesh, (-1520.0, -220.0), "WPN_OrnateWarHammer"),
        (mace_mesh, (-1460.0, -200.0), "WPN_OrnateMedievalMace"),
        (dagger_mesh, (-1400.0, -180.0), "WPN_OrnateMedievalDagger"),
    ]:
        if wmesh:
            spawn_static_mesh(actor_sub, wmesh, (ax, ay, ground_z(ax, ay) + 52.0), rot=(0.0, 82.0, 0.0), scale=(1.15, 1.15, 1.15), label=wlabel)

    # Dense realistic pine & fir forest flanking a 5.5m-wide trail right from foreground (-1900..3600)
    rng = random.Random(2026)
    if trees:
        placed = 0
        fg_trees = [
            (-1850.0, -680.0), (-1650.0, -780.0), (-1500.0, 560.0), (-1320.0, -620.0),
            (-1050.0, -740.0), (-820.0, 840.0),   (-420.0, -680.0), (-180.0, -960.0),
            (160.0, 680.0),    (420.0, -780.0),   (680.0, 740.0),   (1020.0, -860.0),
        ]
        for tx, ty in fg_trees:
            tz = ground_z(tx, ty)
            # Favor lush FirTree & PineTree_02 in hero foreground
            mesh = trees[(placed + 1) % len(trees)]
            s = rng.uniform(1.05, 1.42)
            spawn_static_mesh(actor_sub, mesh, (tx, ty, tz - 30.0), rot=(0.0, 0.0, rng.uniform(0, 360.0)), scale=(s, s, s), label=f"Pine_FG_{placed}")
            placed += 1

        attempts = 0
        while placed < 76 and attempts < 400:
            attempts += 1
            tx = rng.uniform(-5600.0, 5600.0)
            ty = rng.uniform(-5200.0, 5200.0)
            if -2500.0 <= tx <= 1400.0 and -450.0 <= ty <= 450.0:
                continue
            if math.hypot(tx - 1650.0, ty + 280.0) < 950.0 or math.hypot(tx - 2450.0, ty - 760.0) < 800.0:
                continue
            tz = ground_z(tx, ty)
            mesh = trees[placed % len(trees)]
            s = rng.uniform(0.9, 1.4)
            spawn_static_mesh(actor_sub, mesh, (tx, ty, tz - 30.0), rot=(0.0, 0.0, rng.uniform(0, 360.0)), scale=(s, s, s), label=f"Pine_{placed}")
            placed += 1

    if rocks:
        for i in range(30):
            rx = rng.uniform(-4400.0, 4400.0)
            ry = rng.uniform(-4400.0, 4400.0)
            if math.hypot(rx - px, ry - py) < 350.0:
                continue
            rz = ground_z(rx, ry)
            mesh = rocks[i % len(rocks)]
            s = rng.uniform(2.8, 5.6)
            spawn_static_mesh(actor_sub, mesh, (rx, ry, rz - 22.0), rot=(rng.uniform(-6, 6), rng.uniform(0, 360), rng.uniform(-6, 6)), scale=(s, s, s * 0.85), label=f"MossRock_{i}")

    for i in range(10):
        lx_p = rng.uniform(-3400.0, 3200.0)
        ly_p = rng.uniform(-3200.0, 3200.0)
        if abs(ly_p) < 420.0 and -2400.0 <= lx_p <= 1100.0:
            ly_p = 740.0 if ly_p >= 0 else -740.0
        lz_p = ground_z(lx_p, ly_p)
        if dead_tree and i % 2 == 0:
            spawn_static_mesh(actor_sub, dead_tree, (lx_p, ly_p, lz_p - 12.0), rot=(0.0, rng.uniform(0, 360), 0.0), scale=(1.5, 1.5, 1.5), label=f"DeadLog_{i}")
        elif tree_roots:
            spawn_static_mesh(actor_sub, tree_roots, (lx_p, ly_p, lz_p - 6.0), rot=(0.0, rng.uniform(0, 360), 0.0), scale=(2.0, 2.0, 2.0), label=f"Roots_{i}")

    mus = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Audio/MUS_Frostheim_Explore")
    wind = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Audio/AMB_Alpine_Wind")
    if mus:
        amb_m = actor_sub.spawn_actor_from_class(unreal.AmbientSound, unreal.Vector(px, py, pz + 200.0), unreal.Rotator(0, 0, 0))
        if amb_m:
            amb_m.audio_component.set_sound(mus)
            amb_m.audio_component.set_editor_property("volume_multiplier", 0.55)
            amb_m.set_actor_label("Ambient_FrostheimMusic")
    if wind:
        amb_w = actor_sub.spawn_actor_from_class(unreal.AmbientSound, unreal.Vector(0, 0, 400.0), unreal.Rotator(0, 0, 0))
        if amb_w:
            amb_w.audio_component.set_sound(wind)
            amb_w.audio_component.set_editor_property("volume_multiplier", 0.45)
            amb_w.set_actor_label("Ambient_FrostheimWind")

    level_sub.save_current_level()
    unreal.EditorAssetLibrary.save_directory("/Game/Eidrath/", only_if_is_dirty=False, recursive=True)
    unreal.log(f"[EidrathValley] Wave 2 /Game/Eidrath/Maps/Lvl_FrostheimValley saved cleanly! spawn_ground_z={pz:.1f}")


if __name__ == "__main__":
    main()
