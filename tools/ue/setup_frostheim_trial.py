"""
UE 5.8.4 Frostheim Evaluation Level Builder
Reuses already-imported /Game/Eidrath assets (or imports if missing),
constructs /Game/Eidrath/Maps/Lvl_FrostheimTrial, and saves all assets.
"""
import math
import random
from pathlib import Path
import unreal

REPO_ROOT = Path(__file__).resolve().parents[2]


def import_if_missing(file_path: Path, dest_path: str, probe_asset: str, dest_name: str | None = None):
    if unreal.EditorAssetLibrary.does_asset_exist(probe_asset):
        return []
    if not file_path.exists():
        unreal.log_warning(f"[EidrathUE] Missing source asset: {file_path}")
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
    return list(task.imported_object_paths or [])


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


def create_snow_material(diff_tex, nor_tex, rough_tex):
    mat_pkg = "/Game/Eidrath/Materials"
    mat_name = "M_FrostheimSnow"
    full_path = f"{mat_pkg}/{mat_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(full_path):
        return unreal.EditorAssetLibrary.load_asset(full_path)

    factory = unreal.MaterialFactoryNew()
    mat = unreal.AssetToolsHelpers.get_asset_tools().create_asset(mat_name, mat_pkg, unreal.Material, factory)
    mel = unreal.MaterialEditingLibrary

    uv_node = mel.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -700, 0)
    uv_node.set_editor_property("u_tiling", 24.0)
    uv_node.set_editor_property("v_tiling", 24.0)

    if diff_tex:
        d_node = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -380, -220)
        d_node.texture = diff_tex
        mel.connect_material_expressions(uv_node, "", d_node, "UVs")
        mel.connect_material_property(d_node, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)

    if nor_tex:
        n_node = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -380, 40)
        n_node.texture = nor_tex
        n_node.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
        mel.connect_material_expressions(uv_node, "", n_node, "UVs")
        mel.connect_material_property(n_node, "RGB", unreal.MaterialProperty.MP_NORMAL)

    if rough_tex:
        r_node = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -380, 280)
        r_node.texture = rough_tex
        mel.connect_material_expressions(uv_node, "", r_node, "UVs")
        mel.connect_material_property(r_node, "R", unreal.MaterialProperty.MP_ROUGHNESS)

    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_asset(full_path)
    return mat


def spawn_static_mesh(actor_sub, mesh, loc, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0), label=None):
    actor = actor_sub.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(*loc),
        unreal.Rotator(*rot),
    )
    if actor:
        actor.static_mesh_component.set_static_mesh(mesh)
        actor.set_actor_scale3d(unreal.Vector(*scale))
        if label:
            actor.set_actor_label(label)
    return actor


def spawn_modular_skeletal_actor(actor_sub, folder: str, loc, rot, idle_suffix: str, prefix: str):
    meshes = find_all_assets(folder, unreal.SkeletalMesh)
    anims = find_all_assets(folder, unreal.AnimSequence)
    idle_anim = next((a for a in anims if idle_suffix.lower() in a.get_name().lower()), None)
    spawned = 0
    for idx, sm in enumerate(meshes):
        sk_actor = actor_sub.spawn_actor_from_class(
            unreal.SkeletalMeshActor,
            unreal.Vector(*loc),
            unreal.Rotator(*rot),
        )
        if sk_actor:
            comp = sk_actor.skeletal_mesh_component
            comp.set_skeletal_mesh(sm)
            if idle_anim:
                try:
                    comp.set_animation_mode(unreal.AnimationMode.ANIMATION_SINGLE_NODE)
                    comp.override_animation_data(idle_anim, is_looping=True, is_playing=True, position=0.0, play_rate=1.0)
                except Exception:
                    pass
            sk_actor.set_actor_label(f"{prefix}_{sm.get_name()}_{idx}")
            spawned += 1
    return spawned


def main():
    unreal.EditorAssetLibrary.make_directory("/Game/Eidrath")
    unreal.EditorAssetLibrary.make_directory("/Game/Eidrath/Maps")
    unreal.EditorAssetLibrary.make_directory("/Game/Eidrath/Materials")

    tex_root = REPO_ROOT / "public" / "assets" / "eidrath" / "textures" / "snow_field_aerial"
    import_if_missing(tex_root / "diff.jpg", "/Game/Eidrath/Textures/Snow", "/Game/Eidrath/Textures/Snow/T_Snow_Diff", "T_Snow_Diff")
    import_if_missing(tex_root / "nor_gl.jpg", "/Game/Eidrath/Textures/Snow", "/Game/Eidrath/Textures/Snow/T_Snow_Normal", "T_Snow_Normal")
    import_if_missing(tex_root / "rough.jpg", "/Game/Eidrath/Textures/Snow", "/Game/Eidrath/Textures/Snow/T_Snow_Rough", "T_Snow_Rough")

    diff_tex = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Textures/Snow/T_Snow_Diff")
    nor_tex = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Textures/Snow/T_Snow_Normal")
    rough_tex = unreal.EditorAssetLibrary.load_asset("/Game/Eidrath/Textures/Snow/T_Snow_Rough")
    snow_mat = create_snow_material(diff_tex, nor_tex, rough_tex)

    import_if_missing(REPO_ROOT / "public" / "assets" / "eidrath" / "world" / "env_frost_pine.glb", "/Game/Eidrath/Env/Pine", "/Game/Eidrath/Env/Pine/env_frost_pine/StaticMeshes/env_frost_pine")
    import_if_missing(REPO_ROOT / "public" / "assets" / "eidrath" / "world" / "env_boulder.glb", "/Game/Eidrath/Env/Boulder", "/Game/Eidrath/Env/Boulder/env_boulder/StaticMeshes/env_boulder")
    import_if_missing(REPO_ROOT / "public" / "assets" / "eidrath" / "world" / "env_nordic_cabin.glb", "/Game/Eidrath/Env/Cabin", "/Game/Eidrath/Env/Cabin/env_nordic_cabin/StaticMeshes/env_nordic_cabin")
    import_if_missing(REPO_ROOT / "_asset_cache" / "polyhaven_weapons" / "antique_estoc" / "antique_estoc.fbx", "/Game/Eidrath/Weapons/Estoc", "/Game/Eidrath/Weapons/Estoc/antique_estoc")
    import_if_missing(REPO_ROOT / "_asset_cache" / "polyhaven_weapons" / "ornate_war_hammer" / "ornate_war_hammer.fbx", "/Game/Eidrath/Weapons/Warhammer", "/Game/Eidrath/Weapons/Warhammer/ornate_war_hammer")
    import_if_missing(REPO_ROOT / "public" / "assets" / "eidrath" / "characters" / "chr_kaelen.glb", "/Game/Eidrath/Actors/Kaelen", "/Game/Eidrath/Actors/Kaelen/chr_kaelen/SkeletalMeshes/chr_kaelen_Body")
    import_if_missing(REPO_ROOT / "public" / "assets" / "eidrath" / "enemies" / "enm_hollow_swordsman.glb", "/Game/Eidrath/Actors/Hollow", "/Game/Eidrath/Actors/Hollow/enm_hollow_swordsman/SkeletalMeshes/enm_hollow_swordsman_Body")

    pine_mesh = find_first_asset("/Game/Eidrath/Env/Pine", unreal.StaticMesh)
    boulder_mesh = find_first_asset("/Game/Eidrath/Env/Boulder", unreal.StaticMesh)
    cabin_mesh = find_first_asset("/Game/Eidrath/Env/Cabin", unreal.StaticMesh)
    estoc_mesh = find_first_asset("/Game/Eidrath/Weapons/Estoc", unreal.StaticMesh)
    hammer_mesh = find_first_asset("/Game/Eidrath/Weapons/Warhammer", unreal.StaticMesh)

    level_sub = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    map_path = "/Game/Eidrath/Maps/Lvl_FrostheimTrial"
    level_sub.new_level(map_path)

    # 140m x 140m snowy floor
    plane_mesh = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane")
    ground = spawn_static_mesh(actor_sub, plane_mesh, (0.0, 0.0, 0.0), scale=(140.0, 140.0, 1.0), label="FrostheimGround")
    if ground and snow_mat:
        ground.static_mesh_component.set_material(0, snow_mat)

    # Winter atmosphere & lighting (Non-Lumen, CSM shadows)
    sun = actor_sub.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 800), unreal.Rotator(-32.0, -48.0, 0.0))
    if sun:
        lc = sun.light_component
        lc.set_intensity(3.4)
        lc.set_light_color(unreal.LinearColor(1.0, 0.91, 0.80, 1.0))
        lc.set_cast_shadows(True)
        sun.set_actor_label("SunLight_Winter")

    sky = actor_sub.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 600), unreal.Rotator(0, 0, 0))
    if sky:
        slc = sky.light_component
        slc.set_intensity(1.1)
        try:
            slc.set_editor_property("real_time_capture", True)
        except Exception:
            pass
        sky.set_actor_label("SkyLight_Winter")

    atmo = actor_sub.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if atmo:
        atmo.set_actor_label("SkyAtmosphere_Winter")

    fog = actor_sub.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 200), unreal.Rotator(0, 0, 0))
    if fog:
        fc = fog.component
        fc.set_fog_density(0.012)
        fc.set_fog_inscattering_color(unreal.LinearColor(0.36, 0.46, 0.58, 1.0))
        fog.set_actor_label("HeightFog_Frostheim")

    # Playable PlayerStart facing down the forest trail (+X)
    ps = actor_sub.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(-1400.0, 0.0, 110.0), unreal.Rotator(0.0, 0.0, 0.0))
    if ps:
        ps.set_actor_label("PlayerStart_Trial")

    # Nordic Cabin along trail (Interchange already imports glTF 1m -> 100 UE cm)
    if cabin_mesh:
        unreal.log(f"[EidrathUE] Bounds Pine={pine_mesh.get_bounding_box() if pine_mesh else None} Cabin={cabin_mesh.get_bounding_box()}")
        spawn_static_mesh(actor_sub, cabin_mesh, (1200.0, 420.0, 0.0), rot=(0.0, 155.0, 0.0), scale=(1.0, 1.0, 1.0), label="RavenholdCabin")

    # Kaelen & Hollow modular characters + Poly Haven FBX weapons (scale 100x if Interchange imported GLB at 1m->1cm, verified visually)
    k_parts = spawn_modular_skeletal_actor(actor_sub, "/Game/Eidrath/Actors/Kaelen", (-900.0, -240.0, 0.0), (0.0, 25.0, 0.0), "Idle", "CHR_Kaelen")
    h_parts = spawn_modular_skeletal_actor(actor_sub, "/Game/Eidrath/Actors/Hollow", (-420.0, 220.0, 0.0), (0.0, 195.0, 0.0), "Idle", "ENM_Hollow")

    if estoc_mesh:
        spawn_static_mesh(actor_sub, estoc_mesh, (-840.0, -130.0, 95.0), rot=(0.0, 0.0, 90.0), scale=(1.1, 1.1, 1.1), label="WPN_AntiqueEstoc")
    if hammer_mesh:
        spawn_static_mesh(actor_sub, hammer_mesh, (-790.0, -130.0, 95.0), rot=(0.0, 25.0, 90.0), scale=(1.1, 1.1, 1.1), label="WPN_OrnateWarHammer")

    # Scatter 48 pines & 22 boulders around clearing
    rng = random.Random(42)
    if pine_mesh:
        for i in range(48):
            angle = rng.uniform(0, math.tau)
            dist = rng.uniform(650.0, 4400.0)
            px = math.cos(angle) * dist
            py = math.sin(angle) * dist
            if -1600.0 <= px <= 1000.0 and abs(py) < 420.0:
                py = 520.0 if py >= 0 else -520.0
            s = rng.uniform(0.85, 1.38)
            spawn_static_mesh(actor_sub, pine_mesh, (px, py, 0.0), rot=(0.0, rng.uniform(0, 360), 0.0), scale=(s, s, s), label=f"Pine_{i}")

    if boulder_mesh:
        for i in range(22):
            bx = rng.uniform(-2800.0, 3200.0)
            by = rng.uniform(-2800.0, 2800.0)
            if -1600.0 <= bx <= 600.0 and abs(by) < 360.0:
                by = 480.0 if by >= 0 else -480.0
            s = rng.uniform(0.7, 1.6)
            spawn_static_mesh(actor_sub, boulder_mesh, (bx, by, -15.0), rot=(rng.uniform(-5, 5), rng.uniform(0, 360), rng.uniform(-5, 5)), scale=(s, s, s * 0.85), label=f"Boulder_{i}")

    level_sub.save_current_level()
    unreal.EditorAssetLibrary.save_directory("/Game/Eidrath/", only_if_is_dirty=False, recursive=True)
    unreal.log(f"[EidrathUE] Level built! pine={bool(pine_mesh)}, boulder={bool(boulder_mesh)}, cabin={bool(cabin_mesh)}, estoc={bool(estoc_mesh)}, hammer={bool(hammer_mesh)}, kaelen_parts={k_parts}, hollow_parts={h_parts}")


if __name__ == "__main__":
    main()
