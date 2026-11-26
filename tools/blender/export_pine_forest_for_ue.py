"""
Export real artist-authored CC0 assets from Poly Haven's polyhaven_pine_fir_forest.blend
into Unreal-ready GLBs under _asset_cache/ue_ready_assets/, grounded at min_z=0 with packed
textures and safe budgets for 1080p GTX 1650 SUPER rendering.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = REPO_ROOT / "_asset_cache" / "ready-scenes" / "pine-forest" / "source-9d08c4883a0b" / "polyhaven_pine_fir_forest.blend"
OUT_DIR = REPO_ROOT / "_asset_cache" / "ue_ready_assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def clear_selection():
    bpy.ops.object.select_all(action="DESELECT")


def count_tris(obj) -> int:
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def make_single_user_mesh_from_geonodes(src_name: str, out_name: str, target_max_tris: int):
    src = bpy.data.objects.get(src_name)
    if not src:
        print(f"[EXPORT] Missing source object: {src_name}")
        return None

    src_col = src.users_collection[0] if src.users_collection else None
    if src_col:
        src_col.hide_viewport = False
        src_col.hide_render = False
    src.hide_set(False)
    src.hide_viewport = False

    depsgraph = bpy.context.evaluated_depsgraph_get()
    temp_objs = []

    clear_selection()
    dup = src.copy()
    if src.data:
        dup.data = src.data.copy()
    bpy.context.scene.collection.objects.link(dup)
    dup.location = (0.0, 0.0, 0.0)
    dup.rotation_euler = (0.0, 0.0, 0.0)
    dup.scale = (1.0, 1.0, 1.0)
    dup.hide_set(False)
    dup.hide_viewport = False

    bpy.context.view_layer.objects.active = dup
    dup.select_set(True)

    try:
        bpy.ops.object.convert(target="MESH", keep_original=False)
    except Exception as exc:
        print(f"[EXPORT] convert fallback on {src_name}: {exc}")

    if dup.type != "MESH" or len(dup.data.polygons) == 0:
        bpy.ops.object.duplicates_make_real(use_base_parent=False, use_hierarchy=False)
        for o in list(bpy.context.selected_objects):
            if o.type == "MESH":
                temp_objs.append(o)
    else:
        temp_objs.append(dup)

    if not temp_objs:
        ev = src.evaluated_get(depsgraph)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=depsgraph)
        if len(me.polygons) > 0:
            nm = bpy.data.objects.new(out_name, me)
            bpy.context.scene.collection.objects.link(nm)
            temp_objs.append(nm)

    if not temp_objs:
        print(f"[EXPORT] No geometry extracted for {src_name}")
        return None

    clear_selection()
    for o in temp_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = temp_objs[0]
    if len(temp_objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = out_name

    if "Terrain" not in out_name:
        bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        cx = 0.5 * (min(v.x for v in bbox) + max(v.x for v in bbox))
        cy = 0.5 * (min(v.y for v in bbox) + max(v.y for v in bbox))
        min_z = min(v.z for v in bbox)
        obj.location.x -= cx
        obj.location.y -= cy
        obj.location.z -= min_z
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    else:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    tris = count_tris(obj)
    if target_max_tris > 0 and tris > target_max_tris:
        ratio = max(0.15, target_max_tris / float(tris))
        dec = obj.modifiers.new("DecimateUE", "DECIMATE")
        dec.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)
        tris = count_tris(obj)

    print(f"[EXPORT] Built {out_name}: {tris} tris, dims={tuple(round(x, 2) for x in obj.dimensions)}, mats={[m.name if m else None for m in obj.data.materials]}")
    return obj


def export_glb(obj, filename: str):
    if not obj:
        return None
    clear_selection()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    out_file = OUT_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(out_file),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=82,
    )
    print(f"[EXPORT] Wrote {out_file.name} ({out_file.stat().st_size / 1048576:.2f} MB)")
    return out_file


def render_qa_sheet_from_glbs():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = str(OUT_DIR / "pine_forest_exports_qa.png")

    preview_glbs = [
        ("SM_MontaigleRuins_01.glb", -14.0, 0.0, 0.5),
        ("SM_PineTree_01.glb",       -1.0,  0.0, 1.0),
        ("SM_PineTree_02.glb",        7.0,  0.0, 1.0),
        ("SM_FirTree_01.glb",        14.0,  0.0, 1.0),
        ("SM_MossRock_01.glb",        2.5, -5.0, 2.5),
        ("SM_DeadTree.glb",          10.5, -5.0, 1.4),
    ]
    for gname, gx, gy, gscale in preview_glbs:
        gp = OUT_DIR / gname
        if not gp.exists():
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(gp))
        imported = [o for o in bpy.data.objects if o not in before]
        for o in imported:
            if o.parent is None:
                o.location = (gx, gy, 0.0)
                o.scale = (gscale, gscale, gscale)

    sun_data = bpy.data.lights.new("QA_Sun", "SUN")
    sun_data.energy = 3.2
    sun_obj = bpy.data.objects.new("QA_Sun", sun_data)
    sun_obj.rotation_euler = (math.radians(48), 0.0, math.radians(-35))
    scene.collection.objects.link(sun_obj)

    world = bpy.data.worlds.new("QA_World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.18, 0.23, 0.30, 1.0)
        bg.inputs[1].default_value = 1.0

    cam_data = bpy.data.cameras.new("QA_Cam")
    cam_obj = bpy.data.objects.new("QA_Cam", cam_data)
    cam_obj.location = (1.5, -28.0, 8.5)
    direction = Vector((1.5, 0.0, 4.5)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    bpy.ops.render.render(write_still=True)
    print(f"[EXPORT] Rendered QA sheet: {scene.render.filepath}")


def main():
    targets = [
        ("terrain_main", "SM_FrostheimTerrain", 65000, "SM_FrostheimTerrain.glb"),
        ("montaigle_ruins_01", "SM_MontaigleRuins_01", 32000, "SM_MontaigleRuins_01.glb"),
        ("montaigle_ruins_02", "SM_MontaigleRuins_02", 28000, "SM_MontaigleRuins_02.glb"),
        ("montaigle_ruins_03", "SM_MontaigleRuins_03", 32000, "SM_MontaigleRuins_03.glb"),
        ("pine_sapling_medium_a", "SM_PineTree_01", 35000, "SM_PineTree_01.glb"),
        ("pine_sapling_medium_b", "SM_PineTree_02", 35000, "SM_PineTree_02.glb"),
        ("fir_sapling_medium_a", "SM_FirTree_01", 35000, "SM_FirTree_01.glb"),
        ("rock_moss_hand_placed_01", "SM_MossRock_01", 6000, "SM_MossRock_01.glb"),
        ("rock_moss_hand_placed_02", "SM_MossRock_02", 6000, "SM_MossRock_02.glb"),
        ("dead_tree_lod0", "SM_DeadTree", 8000, "SM_DeadTree.glb"),
        ("tree_roots_a_lod0", "SM_TreeRoots", 6000, "SM_TreeRoots.glb"),
    ]

    missing = [t for t in targets if not (OUT_DIR / t[3]).exists()]
    if missing:
        bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
        try:
            bpy.ops.file.pack_all()
        except Exception as exc:
            print(f"[EXPORT] pack_all warning: {exc}")

        for src_name, out_name, max_tris, glb_name in missing:
            obj = make_single_user_mesh_from_geonodes(src_name, out_name, max_tris)
            if obj:
                export_glb(obj, glb_name)
                bpy.data.objects.remove(obj, do_unlink=True)

    render_qa_sheet_from_glbs()


if __name__ == "__main__":
    main()
