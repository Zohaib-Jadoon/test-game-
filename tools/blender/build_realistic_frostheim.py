"""
EIDRATH: The Last Oath — Realistic Frostheim World, Landmarks & Props (Blender 5.3)
Uses downloaded PolyHaven CC0 3D models (fir_sapling, dead_tree_trunk, tree_stump_01,
fern_02, boulder_01, coastal_cliff_01, rock_face_01, modular_fort_01, modular_wooden_pier,
stone_fire_pit, Lantern_01, Barrel_01, brass_candleholders, WoodenTable_01, gothic_statue)
and PolyHaven/ambientCG CC0 PBR textures to replace every low-poly world & prop asset.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, r"C:\Users\CP\.gemini\config\skills\blender-export\scripts")
from eidrath_rig_utils import ROOT, make_pbr_mat
from collision_preflight import collision_report

CACHE_PH = ROOT / "_asset_cache" / "polyhaven_models"
OUT_WORLD = ROOT / "public" / "assets" / "eidrath" / "world"
OUT_PROPS = ROOT / "public" / "assets" / "eidrath" / "props"
OUT_BLEND = ROOT / "art" / "blender" / "world"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_WORLD, OUT_PROPS, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def create_mats(tex_size: int = 256):
    return {
        "stone": make_pbr_mat("MAT_ENV_MedievalBlocks", "medieval_blocks_02", tint=(0.54, 0.56, 0.60), metallic=0.04, roughness=0.86, uv_scale=2.2, tex_size=tex_size),
        "old_stone": make_pbr_mat("MAT_ENV_OldStone", "old_stone_wall", tint=(0.46, 0.48, 0.54), metallic=0.04, roughness=0.88, uv_scale=2.2, tex_size=tex_size),
        "castle": make_pbr_mat("MAT_ENV_CastleSlate", "castle_wall_slates", tint=(0.48, 0.52, 0.58), metallic=0.06, roughness=0.84, uv_scale=2.4, tex_size=tex_size),
        "roof": make_pbr_mat("MAT_ENV_RoofSlate", "roof_slates_02", tint=(0.44, 0.48, 0.54), metallic=0.04, roughness=0.80, uv_scale=2.6, tex_size=tex_size),
        "snow": make_pbr_mat("MAT_ENV_Snow", "snow_01", tint=(0.88, 0.91, 0.95), metallic=0.0, roughness=0.68, uv_scale=3.0, tex_size=tex_size),
        "ice": make_pbr_mat("MAT_ENV_Ice", "ice_003", tint=(0.66, 0.84, 0.94), metallic=0.08, roughness=0.22, uv_scale=2.2, tex_size=tex_size),
        "timber": make_pbr_mat("MAT_ENV_Timber", "weathered_peeling_timber", tint=(0.54, 0.46, 0.38), metallic=0.0, roughness=0.84, uv_scale=2.2, tex_size=tex_size),
        "planks": make_pbr_mat("MAT_ENV_Planks", "dark_wooden_planks", tint=(0.52, 0.42, 0.35), metallic=0.0, roughness=0.80, uv_scale=2.4, tex_size=tex_size),
        "wood": make_pbr_mat("MAT_ENV_MedievalWood", "medieval_wood", tint=(0.56, 0.46, 0.38), metallic=0.0, roughness=0.78, uv_scale=2.4, tex_size=tex_size),
        "cliff": make_pbr_mat("MAT_ENV_Cliff", "cliff_side", tint=(0.52, 0.56, 0.62), metallic=0.04, roughness=0.88, uv_scale=2.2, tex_size=tex_size),
        "iron": make_pbr_mat("MAT_ENV_Iron", "rusty_metal", tint=(0.48, 0.50, 0.54), metallic=0.84, roughness=0.46, uv_scale=2.5, tex_size=tex_size),
        "bronze": make_pbr_mat("MAT_ENV_Bronze", "metal_plate", tint=(0.66, 0.50, 0.30), metallic=0.86, roughness=0.36, uv_scale=2.5, tex_size=tex_size),
        "cloth": make_pbr_mat("MAT_ENV_Cloth", "poly_wool_herringbone", tint=(0.64, 0.60, 0.54), metallic=0.0, roughness=0.88, uv_scale=3.0, tex_size=tex_size),
        "banner": make_pbr_mat("MAT_ENV_Banner", "poly_wool_herringbone", tint=(0.58, 0.18, 0.18), metallic=0.0, roughness=0.86, uv_scale=2.6, tex_size=tex_size),
        "leather": make_pbr_mat("MAT_ENV_Leather", "brown_leather", tint=(0.46, 0.34, 0.24), metallic=0.02, roughness=0.78, uv_scale=3.0, tex_size=tex_size),
        "oath_glow": make_pbr_mat("MAT_ENV_OathGlow", None, tint=(0.35, 0.64, 0.85), metallic=0.05, roughness=0.18, emit_rgb=(0.36, 0.68, 0.92), emit_strength=3.6),
        "hearth": make_pbr_mat("MAT_ENV_Hearth", None, tint=(0.95, 0.60, 0.28), metallic=0.02, roughness=0.22, emit_rgb=(0.96, 0.58, 0.22), emit_strength=3.8),
        "herb": make_pbr_mat("MAT_ENV_Herb", None, tint=(0.34, 0.52, 0.44), metallic=0.0, roughness=0.72),
    }


def import_ph_model(model_id: str, name: str, target_height_m: float | None = None, decimate_ratio: float = 1.0, ground: bool = True):
    mdir = CACHE_PH / model_id
    gltfs = list(mdir.glob("*.gltf")) + list(mdir.glob("*.glb"))
    if not gltfs:
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(gltfs[0]))
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in [x for x in bpy.data.objects if x not in before and x.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Downsize embedded textures to max 512px for browser performance
    for mat in obj.data.materials:
        if mat and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and max(node.image.size[0], node.image.size[1]) > 512:
                    sc_img = 512 / max(node.image.size[0], node.image.size[1])
                    node.image.scale(max(1, int(node.image.size[0] * sc_img)), max(1, int(node.image.size[1] * sc_img)))

    if decimate_ratio < 0.99:
        dec = obj.modifiers.new("Decimate", "DECIMATE")
        dec.ratio = decimate_ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)

    if target_height_m is not None:
        zs = [(obj.matrix_world @ v.co).z for v in obj.data.vertices]
        cur_h = max(0.05, max(zs) - min(zs))
        sc = target_height_m / cur_h
        obj.scale = (sc, sc, sc)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if ground:
        xs = [(obj.matrix_world @ v.co).x for v in obj.data.vertices]
        ys = [(obj.matrix_world @ v.co).y for v in obj.data.vertices]
        zs = [(obj.matrix_world @ v.co).z for v in obj.data.vertices]
        cx = (min(xs) + max(xs)) * 0.5
        cy = (min(ys) + max(ys)) * 0.5
        mz = min(zs)
        for v in obj.data.vertices:
            v.co.x -= cx
            v.co.y -= cy
            v.co.z -= mz
        obj.data.update()

    obj.select_set(False)
    return obj


def build_from_parts(name: str, parts: list[tuple], mats: dict, smooth_deg: float = 36.0):
    bm = bmesh.new()
    used = []
    for key, _ in parts:
        if key not in used:
            used.append(key)
    for key, fn in parts:
        sub = bmesh.new()
        fn(sub)
        bmesh.ops.recalc_face_normals(sub, faces=sub.faces)
        mi = used.index(key)
        for f in sub.faces:
            f.material_index = mi
        me_tmp = bpy.data.meshes.new("_tmp")
        sub.to_mesh(me_tmp)
        sub.free()
        bm.from_mesh(me_tmp)
        bpy.data.meshes.remove(me_tmp)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    for k in used:
        me.materials.append(mats[k])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_deg))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=2.2)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def add_box(sub, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.02):
    m = Matrix.Translation(loc) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
    r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    if bevel > 0:
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)


def add_ucx_boxes(obj, boxes: list[tuple] | None = None):
    """Create invisible UCX_ convex hull colliders and verify via collision_preflight."""
    c_objs = []
    if boxes is None:
        bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        xs, ys, zs = [v.x for v in bbox], [v.y for v in bbox], [v.z for v in bbox]
        boxes = [((max(0.3, max(xs) - min(xs)), max(0.3, max(ys) - min(ys)), max(0.3, max(zs) - min(zs))), ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))]

    for idx, (sz, loc) in enumerate(boxes):
        cname = f"UCX_{obj.name}_{idx:02d}"
        bm = bmesh.new()
        add_box(bm, sz, loc, bevel=0.0)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(cname + "_Mesh")
        bm.to_mesh(me)
        bm.free()
        co = bpy.data.objects.new(cname, me)
        bpy.context.scene.collection.objects.link(co)
        c_objs.append(co)

    rep = collision_report(obj, c_objs)
    if not rep["passed"]:
        raise RuntimeError(f"UCX preflight failed on {obj.name}: {rep}")
    return c_objs


def export_static_glb(objs: list, out_path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_image_format="JPEG",
        export_jpeg_quality=78,
    )


def build_world_assets(mats: dict):
    world_items = []

    # 1. env_frost_pine (PolyHaven fir_sapling scaled to 8.2m tall conifer with frost tint, decimated cleanly)
    reset_scene()
    pine = import_ph_model("fir_sapling", "ENV_Frostheim_Pine", target_height_m=8.2, decimate_ratio=0.14)
    if pine:
        # Subtle winter frost tint on branch/twig materials
        for mat in pine.data.materials:
            if mat and mat.node_tree:
                bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf and "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = 0.78
        ucx = add_ucx_boxes(pine, [((0.9, 0.9, 5.0), (0, 0, 2.5))])
        export_static_glb([pine, *ucx], OUT_WORLD / "env_frost_pine.glb")
        print(f"[WORLD] env_frost_pine tris={len(pine.data.polygons)}")

    # Extra nature scatter GLBs for dense Frostheim forest
    for ph_id, out_name, h, dec in [
        ("dead_tree_trunk", "env_dead_trunk.glb", 2.2, 0.35),
        ("tree_stump_01", "env_tree_stump.glb", 1.15, 0.45),
        ("boulder_01", "env_boulder.glb", 2.4, 0.30),
        ("rock_face_01", "env_rock_face.glb", 3.6, 0.40),
        ("fern_02", "env_fern.glb", 0.65, 0.55),
    ]:
        reset_scene()
        obj = import_ph_model(ph_id, f"ENV_{ph_id}", target_height_m=h, decimate_ratio=dec)
        if obj:
            export_static_glb([obj], OUT_WORLD / out_name)

    # 2. env_rock_cliff (PolyHaven coastal_cliff_01 scaled cleanly to ~9m cliff rock outcrop)
    reset_scene()
    cliff = import_ph_model("coastal_cliff_01", "ENV_Frostheim_RockCliff", target_height_m=4.8, decimate_ratio=0.18)
    if cliff:
        # Clamp horizontal spread so cliffs fit naturally without blocking entire landmarks
        d = cliff.dimensions
        horiz = max(d.x, d.y, 1.0)
        if horiz > 9.0:
            s = 9.0 / horiz
            cliff.scale = (s, s, 1.0)
            bpy.ops.object.select_all(action="DESELECT")
            cliff.select_set(True)
            bpy.context.view_layer.objects.active = cliff
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        ucx = add_ucx_boxes(cliff)
        export_static_glb([cliff, *ucx], OUT_WORLD / "env_rock_cliff.glb")

    # 3. env_oathgrave_tomb (Ancient Skyrim-style vaulted barrow with pitched corbelled roof, stone buttresses & pediment archway)
    reset_scene()
    mats = create_mats(tex_size=512)
    tomb = build_from_parts("ENV_Frostheim_OathgraveTomb", [
        ("stone", lambda s: (
            # Stone flagstone floor 14x16m
            add_box(s, (14.0, 16.0, 0.4), (0, 0, 0.12), bevel=0.04),
            # Left, Right, Back thick masonry walls (Front -Y left open for exit archway!)
            add_box(s, (1.2, 16.0, 5.2), (-6.4, 0, 2.6), bevel=0.05),
            add_box(s, (1.2, 16.0, 5.2), (6.4, 0, 2.6), bevel=0.05),
            add_box(s, (14.0, 1.4, 5.2), (0, 7.3, 2.6), bevel=0.05),
            # Front flanking gate pillars leaving 5.6m entrance opening at -Y
            add_box(s, (4.2, 1.4, 5.2), (-4.9, -7.3, 2.6), bevel=0.05),
            add_box(s, (4.2, 1.4, 5.2), (4.9, -7.3, 2.6), bevel=0.05),
            add_box(s, (6.0, 1.5, 1.2), (0, -7.3, 4.6), bevel=0.05),
            # 6 interior carved stone pillars & vaulted ceiling ribs
            [add_box(s, (0.95, 0.95, 5.0), (sx * 4.5, py, 2.5), bevel=0.04) for sx in (-1, 1) for py in (-4.0, 0.5, 5.0)],
            [add_box(s, (13.6, 0.85, 0.7), (0, py, 5.25), bevel=0.04) for py in (-4.0, 0.5, 5.0)],
            # Vaulted lower ceiling deck leaving central skylight oculus
            add_box(s, (14.4, 5.5, 0.60), (0, 4.8, 5.55), bevel=0.05),
            add_box(s, (14.4, 4.8, 0.60), (0, -5.2, 5.55), bevel=0.05),
            add_box(s, (4.2, 6.0, 0.60), (-5.1, 0, 5.55), bevel=0.05),
            add_box(s, (4.2, 6.0, 0.60), (5.1, 0, 5.55), bevel=0.05),
        )),
        ("castle", lambda s: (
            # Stepped Nordic barrow pitched roof wings & corbelled central ridge around oculus
            add_box(s, (7.6, 16.8, 0.55), (-3.8, 0, 6.55), (0, -0.34, 0), bevel=0.05),
            add_box(s, (7.6, 16.8, 0.55), (3.8, 0, 6.55), (0, 0.34, 0), bevel=0.05),
            add_box(s, (3.2, 4.6, 0.90), (0, 5.6, 7.25), bevel=0.06),
            add_box(s, (3.2, 4.2, 0.90), (0, -5.8, 7.25), bevel=0.06),
            # Heavy battered exterior stone buttresses & broken parapet towers
            [add_box(s, (1.1, 1.3, 5.6), (sx * 7.25, py, 2.7), (0, sx * 0.10, 0), bevel=0.05) for sx in (-1, 1) for py in (-6.0, -2.0, 2.0, 6.0)],
            # Front entrance portico flanking obelisk piers & pitched pediment lintel
            add_box(s, (1.4, 1.6, 6.2), (-3.2, -8.3, 3.1), bevel=0.05),
            add_box(s, (1.4, 1.6, 6.2), (3.2, -8.3, 3.1), bevel=0.05),
            add_box(s, (4.6, 1.8, 0.65), (-1.9, -8.3, 6.65), (0, -0.36, 0), bevel=0.05),
            add_box(s, (4.6, 1.8, 0.65), (1.9, -8.3, 6.65), (0, 0.36, 0), bevel=0.05),
        )),
        ("old_stone", lambda s: (
            # Sarcophagi along left & right burial alcoves + center-back dais
            add_box(s, (1.4, 2.6, 0.95), (-4.5, 2.8, 0.65), bevel=0.05),
            add_box(s, (1.4, 2.6, 0.95), (4.5, 2.8, 0.65), bevel=0.05),
            add_box(s, (1.4, 2.6, 0.95), (-4.5, -1.6, 0.65), bevel=0.05),
            add_box(s, (1.4, 2.6, 0.95), (4.5, -1.6, 0.65), bevel=0.05),
            add_box(s, (4.6, 3.2, 0.55), (0, 4.5, 0.45), bevel=0.04),
        )),
        ("ice", lambda s: (
            # Hanging icicles & frozen floor patches
            [bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.01, radius2=0.14, depth=0.95, matrix=Matrix.Translation((ix, -6.9, 3.6))) for ix in (-1.8, -0.7, 0.9, 2.0)],
            add_box(s, (2.2, 3.5, 0.06), (-2.4, -2.0, 0.34), bevel=0.01),
        )),
        ("snow", lambda s: (
            add_box(s, (7.2, 16.4, 0.22), (-3.85, 0, 6.88), (0, -0.34, 0), bevel=0.05),
            add_box(s, (7.2, 16.4, 0.22), (3.85, 0, 6.88), (0, 0.34, 0), bevel=0.05),
            add_box(s, (4.4, 1.6, 0.18), (-1.95, -8.3, 7.0), (0, -0.36, 0), bevel=0.04),
            add_box(s, (4.4, 1.6, 0.18), (1.95, -8.3, 7.0), (0, 0.36, 0), bevel=0.04),
        )),
        ("oath_glow", lambda s: (
            # Ancient glowing oath rune seals beside the tomb entrance arch
            add_box(s, (0.14, 0.20, 2.4), (-3.2, -9.15, 2.8), bevel=0.01),
            add_box(s, (0.14, 0.20, 2.4), (3.2, -9.15, 2.8), bevel=0.01),
        )),
        ("hearth", lambda s: [bmesh.ops.create_uvsphere(s, u_segments=8, v_segments=6, radius=0.09, matrix=Matrix.Translation((sx * 3.4, py, 1.3))) for sx in (-1, 1) for py in (-3.6, 1.0, 4.5)]),
    ], mats)
    # Add PolyHaven gothic statue at back of tomb if available
    stat = import_ph_model("gothic_statue", "TombStatue", target_height_m=2.6, decimate_ratio=0.35)
    objs = [tomb]
    if stat:
        stat.location = (0, 5.4, 0.72)
        objs.append(stat)
    # Perimeter wall UCX colliders so player walks freely inside tomb!
    ucx = add_ucx_boxes(tomb, [
        ((1.3, 16.0, 5.2), (-6.4, 0, 2.6)),
        ((1.3, 16.0, 5.2), (6.4, 0, 2.6)),
        ((14.0, 1.5, 5.2), (0, 7.3, 2.6)),
        ((4.2, 1.5, 5.2), (-4.9, -7.3, 2.6)),
        ((4.2, 1.5, 5.2), (4.9, -7.3, 2.6)),
    ])
    export_static_glb([*objs, *ucx], OUT_WORLD / "env_oathgrave_tomb.glb")

    # 4. env_nordic_cabin (Detailed timber-framed stone cabin with proper pitched A-frame roof, snow, chimney, mullioned glowing windows)
    reset_scene()
    mats = create_mats(tex_size=512)
    def add_gable(s, y_pos: float):
        # Triangular A-frame gable wall aligned to +-0.58 rad roof slope
        v_l = s.verts.new((-3.1, y_pos, 3.55))
        v_r = s.verts.new((3.1, y_pos, 3.55))
        v_t = s.verts.new((0.0, y_pos, 5.60))
        v_l2 = s.verts.new((-3.1, y_pos - 0.18 if y_pos < 0 else y_pos + 0.18, 3.55))
        v_r2 = s.verts.new((3.1, y_pos - 0.18 if y_pos < 0 else y_pos + 0.18, 3.55))
        v_t2 = s.verts.new((0.0, y_pos - 0.18 if y_pos < 0 else y_pos + 0.18, 5.60))
        s.faces.new((v_l, v_r, v_t))
        s.faces.new((v_t2, v_r2, v_l2))
        s.faces.new((v_l, v_t, v_t2, v_l2))
        s.faces.new((v_t, v_r, v_r2, v_t2))
        s.faces.new((v_r, v_l, v_l2, v_r2))

    cabin = build_from_parts("ENV_Frostheim_NordicCabin", [
        ("stone", lambda s: (
            add_box(s, (6.8, 8.6, 1.1), (0, 0, 0.55), bevel=0.05),
            add_box(s, (1.1, 1.1, 6.4), (2.4, 2.8, 3.2), bevel=0.05),  # Chimney
            add_box(s, (2.6, 1.8, 0.35), (0, -4.8, 0.18), bevel=0.03),  # Porch steps
        )),
        ("planks", lambda s: (
            add_box(s, (6.2, 7.8, 2.6), (0, 0, 2.3), bevel=0.03),
            add_gable(s, -3.82),
            add_gable(s, 3.82),
        )),
        ("timber", lambda s: (
            [add_box(s, (0.28, 0.28, 2.8), (sx * 3.12, sy * 3.92, 2.4), bevel=0.02) for sx in (-1, 1) for sy in (-1, 1)],
            add_box(s, (6.5, 0.26, 0.28), (0, -3.95, 3.5), bevel=0.02),
            add_box(s, (0.34, 9.8, 0.34), (0, -0.3, 5.75), bevel=0.02),  # Ridge beam
            add_box(s, (1.4, 0.22, 2.2), (0, -3.96, 1.85), bevel=0.02),  # Door
            add_box(s, (0.22, 0.22, 2.8), (-1.2, -5.2, 1.4), bevel=0.02),
            add_box(s, (0.22, 0.22, 2.8), (1.2, -5.2, 1.4), bevel=0.02),
            # Timber window frames & cross mullions on front windows
            [add_box(s, (1.1, 0.20, 0.10), (wx, -3.96, wz), bevel=0.01) for wx in (-1.8, 1.8) for wz in (1.66, 2.15, 2.64)],
            [add_box(s, (0.10, 0.20, 1.06), (wx + ox, -3.96, 2.15), bevel=0.01) for wx in (-1.8, 1.8) for ox in (-0.48, 0.0, 0.48)],
        )),
        ("roof", lambda s: (
            # Proper outward-sloping pitched A-frame roof (-0.58 on left -X, +0.58 on right +X)
            add_box(s, (4.5, 9.8, 0.24), (-1.85, -0.3, 4.65), (0, -0.58, 0), bevel=0.03),
            add_box(s, (4.5, 9.8, 0.24), (1.85, -0.3, 4.65), (0, 0.58, 0), bevel=0.03),
        )),
        ("snow", lambda s: (
            add_box(s, (4.3, 9.6, 0.14), (-1.92, -0.3, 4.82), (0, -0.58, 0), bevel=0.04),
            add_box(s, (4.3, 9.6, 0.14), (1.92, -0.3, 4.82), (0, 0.58, 0), bevel=0.04),
        )),
        ("hearth", lambda s: (
            add_box(s, (0.90, 0.14, 0.90), (-1.8, -3.94, 2.15), bevel=0.01),
            add_box(s, (0.90, 0.14, 0.90), (1.8, -3.94, 2.15), bevel=0.01),
            add_box(s, (0.14, 1.05, 0.90), (-3.12, 0.0, 2.15), bevel=0.01),
            add_box(s, (0.14, 1.05, 0.90), (3.12, 0.0, 2.15), bevel=0.01),
        )),
    ], mats)
    ucx = add_ucx_boxes(cabin, [((6.8, 8.6, 5.2), (0, 0, 2.6))])
    export_static_glb([cabin, *ucx], OUT_WORLD / "env_nordic_cabin.glb")

    # 5. env_borin_forge (Stone open-hearth blacksmith forge with chimney & timber roof)
    reset_scene()
    mats = create_mats()
    forge = build_from_parts("ENV_Frostheim_BorinForge", [
        ("stone", lambda s: (
            add_box(s, (6.6, 5.6, 0.55), (0, 0, 0.28), bevel=0.04),
            add_box(s, (2.2, 1.8, 2.4), (-1.9, 1.4, 1.5), bevel=0.05),
            add_box(s, (1.3, 1.3, 3.0), (-1.9, 1.4, 3.6), bevel=0.05),
        )),
        ("timber", lambda s: (
            [add_box(s, (0.28, 0.28, 3.2), (px, py, 1.8), bevel=0.02) for px, py in [(-2.8, -2.3), (2.8, -2.3), (2.8, 2.3), (-2.8, 2.3)]],
        )),
        ("roof", lambda s: add_box(s, (7.4, 6.2, 0.22), (0, 0, 3.55), (0.18, 0, 0), bevel=0.03)),
        ("snow", lambda s: add_box(s, (7.1, 5.9, 0.12), (0, 0, 3.72), (0.18, 0, 0), bevel=0.04)),
        ("hearth", lambda s: add_box(s, (1.1, 0.9, 0.5), (-1.9, 1.1, 1.25), bevel=0.02)),
    ], mats)
    ucx = add_ucx_boxes(forge, [((2.4, 2.0, 4.0), (-1.9, 1.4, 2.0))])
    export_static_glb([forge, *ucx], OUT_WORLD / "env_borin_forge.glb")

    # 6. env_ruined_bridge (PolyHaven modular_wooden_pier + stone abutments)
    reset_scene()
    mats = create_mats()
    pier = import_ph_model("modular_wooden_pier", "BridgeDeck", target_height_m=2.2, decimate_ratio=0.45)
    abut = build_from_parts("ENV_Frostheim_RuinedBridge", [
        ("stone", lambda s: (
            add_box(s, (2.8, 5.2, 2.2), (-6.2, 0, 0.9), bevel=0.05),
            add_box(s, (2.8, 5.2, 2.2), (6.2, 0, 0.9), bevel=0.05),
            add_box(s, (11.5, 4.4, 0.42), (0, 0, 1.85), bevel=0.03),
            [add_box(s, (0.55, 0.55, 1.1), (px, sy * 2.0, 2.4), bevel=0.03) for px in (-4.5, -1.5, 1.5, 4.5) for sy in (-1, 1)],
        )),
        ("planks", lambda s: add_box(s, (11.8, 3.8, 0.14), (0, 0, 2.08), bevel=0.02)),
    ], mats)
    objs = [abut]
    if pier:
        pier.scale = (1.15, 0.85, 0.95)
        pier.location = (0, 0, 0.05)
        objs.append(pier)
    ucx = add_ucx_boxes(abut, [((12.8, 4.6, 1.2), (0, 0, 1.6))])
    export_static_glb([*objs, *ucx], OUT_WORLD / "env_ruined_bridge.glb")

    # 7. env_ice_cave_arch
    reset_scene()
    mats = create_mats()
    arch = build_from_parts("ENV_Frostheim_IceCaveArch", [
        ("cliff", lambda s: (
            add_box(s, (3.2, 4.4, 5.4), (-3.8, 0, 2.7), (0, 0.18, 0), bevel=0.14),
            add_box(s, (3.2, 4.4, 5.4), (3.8, 0, 2.7), (0, -0.18, 0), bevel=0.14),
            add_box(s, (9.2, 4.8, 2.1), (0, 0, 5.2), bevel=0.18),
        )),
        ("ice", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=7, radius1=0.02, radius2=0.26, depth=1.6, matrix=Matrix.Translation((ix, 0.2, 3.6))) for ix in (-1.8, -0.6, 0.8, 1.9)]),
        ("snow", lambda s: add_box(s, (8.6, 4.2, 0.35), (0, 0, 6.2), bevel=0.08)),
    ], mats)
    ucx = add_ucx_boxes(arch, [((3.0, 4.2, 5.0), (-3.8, 0, 2.5)), ((3.0, 4.2, 5.0), (3.8, 0, 2.5))])
    export_static_glb([arch, *ucx], OUT_WORLD / "env_ice_cave_arch.glb")

    # 8. env_keep_gate & env_keep_wall (PolyHaven modular_fort_01 + sculpted medieval blocks)
    reset_scene()
    mats = create_mats()
    fort = import_ph_model("modular_fort_01", "ENV_Frostheim_KeepGate", target_height_m=9.2, decimate_ratio=0.45)
    gate_base = build_from_parts("ENV_KeepGate_Arch", [
        ("castle", lambda s: (
            add_box(s, (3.6, 4.4, 8.8), (-4.4, 0, 4.4), bevel=0.06),
            add_box(s, (3.6, 4.4, 8.8), (4.4, 0, 4.4), bevel=0.06),
            add_box(s, (7.6, 3.8, 2.6), (0, 0, 7.6), bevel=0.06),
        )),
        ("oath_glow", lambda s: add_box(s, (0.35, 0.35, 3.4), (0, -1.9, 7.2), bevel=0.02)),
    ], mats)
    objs = [gate_base]
    if fort:
        fort.scale = (0.75, 0.75, 0.75)
        fort.location = (0, 0.4, 0)
        objs.append(fort)
    ucx = add_ucx_boxes(gate_base, [((3.6, 4.4, 8.8), (-4.4, 0, 4.4)), ((3.6, 4.4, 8.8), (4.4, 0, 4.4))])
    export_static_glb([*objs, *ucx], OUT_WORLD / "env_keep_gate.glb")

    reset_scene()
    mats = create_mats()
    wall = build_from_parts("ENV_Frostheim_KeepWall", [
        ("castle", lambda s: (
            add_box(s, (10.5, 2.2, 5.2), (0, 0, 2.6), bevel=0.06),
            [add_box(s, (1.4, 2.4, 1.1), (bx, 0, 5.6), bevel=0.04) for bx in (-4.0, -1.3, 1.3, 4.0)],
        )),
        ("snow", lambda s: add_box(s, (10.2, 2.0, 0.22), (0, 0, 5.25), bevel=0.04)),
    ], mats)
    ucx = add_ucx_boxes(wall, [((10.5, 2.2, 5.2), (0, 0, 2.6))])
    export_static_glb([wall, *ucx], OUT_WORLD / "env_keep_wall.glb")

    # 9. env_oath_shrine (PolyHaven gothic_statue on ancient carved plinth)
    reset_scene()
    mats = create_mats()
    shrine_base = build_from_parts("ENV_Frostheim_OathShrine", [
        ("stone", lambda s: (
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=2.4, radius2=2.0, depth=0.45, matrix=Matrix.Translation((0, 0, 0.22))),
            add_box(s, (1.8, 1.8, 1.1), (0, 0, 0.9), bevel=0.05),
        )),
        ("oath_glow", lambda s: add_box(s, (1.9, 1.9, 0.14), (0, 0, 1.15), bevel=0.01)),
    ], mats)
    stat = import_ph_model("gothic_statue", "ShrineStatue", target_height_m=3.1, decimate_ratio=0.35)
    objs = [shrine_base]
    if stat:
        stat.location = (0, 0, 1.45)
        objs.append(stat)
    ucx = add_ucx_boxes(shrine_base, [((2.8, 2.8, 4.2), (0, 0, 2.1))])
    export_static_glb([*objs, *ucx], OUT_WORLD / "env_oath_shrine.glb")


def build_props_assets():
    # Direct PolyHaven CC0 prop imports
    ph_props = [
        ("stone_fire_pit", "prop_campfire.glb", "PROP_Campfire", 0.65, 0.35),
        ("Lantern_01", "prop_lantern_post.glb", "PROP_LanternPost", 0.55, 0.45),
        ("Barrel_01", "prop_barrel.glb", "PROP_Barrel", 0.95, 0.55),
        ("WoodenTable_01", "prop_market_stall.glb", "PROP_MarketStall", 0.95, 0.60),
        ("brass_candleholders", "prop_brazier.glb", "PROP_Brazier", 1.15, 0.30),
    ]
    for ph_id, out_fname, mesh_name, h, dec in ph_props:
        reset_scene()
        obj = import_ph_model(ph_id, mesh_name, target_height_m=h, decimate_ratio=dec)
        if obj:
            # Add wooden post under Lantern_01 so it stands 2.6m tall along Frostheim roads
            if ph_id == "Lantern_01":
                mats = create_mats()
                post = build_from_parts("LanternPostWood", [
                    ("timber", lambda s: (
                        add_box(s, (0.16, 0.16, 2.65), (0, 0, 1.32), bevel=0.02),
                        add_box(s, (0.72, 0.12, 0.12), (0.28, 0, 2.52), bevel=0.01),
                    )),
                ], mats)
                obj.location = (0.58, 0, 1.92)
                export_static_glb([post, obj], OUT_PROPS / out_fname)
            else:
                export_static_glb([obj], OUT_PROPS / out_fname)

    # Remaining props textured with real PolyHaven PBR maps
    specs = {
        "prop_chest": ("PROP_Chest", [("wood", lambda s: add_box(s, (1.1, 0.72, 0.68), (0, 0, 0.34), bevel=0.03)), ("iron", lambda s: (add_box(s, (1.14, 0.10, 0.70), (-0.36, 0, 0.35)), add_box(s, (1.14, 0.10, 0.70), (0.36, 0, 0.35)), add_box(s, (0.18, 0.76, 0.22), (0, 0, 0.42))))]),
        "prop_oath_rune_stone": ("PROP_OathRuneStone", [("old_stone", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.52, radius2=0.34, depth=2.2, matrix=Matrix.Translation((0, 0, 1.1)))), ("oath_glow", lambda s: add_box(s, (0.16, 0.78, 1.1), (0, 0, 1.15), bevel=0.01))]),
        "prop_seal_stone": ("PROP_SealStone", [("castle", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.45, radius2=0.22, depth=2.1, matrix=Matrix.Translation((0, 0, 1.05)))), ("oath_glow", lambda s: bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.24, matrix=Matrix.Translation((0, 0, 1.85))))]),
        "prop_anvil": ("PROP_Anvil", [("iron", lambda s: (add_box(s, (0.72, 0.34, 0.26), (0, 0, 0.68), bevel=0.02), add_box(s, (0.38, 0.26, 0.34), (0, 0, 0.38), bevel=0.02))), ("wood", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.28, radius2=0.25, depth=0.36, matrix=Matrix.Translation((0, 0, 0.18))))]),
        "prop_banner": ("PROP_Banner", [("timber", lambda s: (add_box(s, (0.12, 0.12, 3.4), (0, 0, 1.7)), add_box(s, (1.2, 0.08, 0.08), (0, 0, 3.1)))), ("banner", lambda s: add_box(s, (0.95, 0.04, 1.85), (0, 0, 2.15), bevel=0.01))]),
        "prop_ore_vein": ("PROP_OreVein", [("cliff", lambda s: bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.58, matrix=Matrix.Translation((0, 0, 0.45)) @ Matrix.Diagonal((1.2, 0.9, 0.8, 1)))), ("oath_glow", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.22, matrix=Matrix.Translation((0.25, -0.2, 0.62))))]),
        "prop_frost_herb": ("PROP_FrostHerb", [("herb", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=5, radius1=0.06, radius2=0.01, depth=0.45, matrix=Matrix.Translation((0, 0, 0.22)) @ Euler((0.35, 0, a)).to_matrix().to_4x4()) for a in [i * math.pi / 3 for i in range(6)]])]),
        "prop_crate": ("PROP_Crate", [("wood", lambda s: add_box(s, (0.85, 0.85, 0.85), (0, 0, 0.425), bevel=0.02)), ("iron", lambda s: add_box(s, (0.88, 0.88, 0.10), (0, 0, 0.78), bevel=0.01))]),
        "prop_signpost": ("PROP_Signpost", [("timber", lambda s: (add_box(s, (0.14, 0.14, 2.4), (0, 0, 1.2)), add_box(s, (1.0, 0.08, 0.24), (0.38, 0, 2.0), (0, 0, 0.15))))]),
        "prop_tent": ("PROP_Tent", [("cloth", lambda s: (add_box(s, (2.2, 2.6, 0.14), (-0.75, 0, 1.05), (0, 0.72, 0), bevel=0.02), add_box(s, (2.2, 2.6, 0.14), (0.75, 0, 1.05), (0, -0.72, 0), bevel=0.02))), ("timber", lambda s: add_box(s, (0.12, 2.8, 0.12), (0, 0, 1.92)))]),
        "prop_cart": ("PROP_Cart", [("wood", lambda s: add_box(s, (1.3, 2.0, 0.65), (0, 0, 0.72), bevel=0.02)), ("iron", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=14, radius1=0.42, radius2=0.42, depth=0.10, matrix=Matrix.Translation((sx * 0.74, 0, 0.42)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()) for sx in (-1, 1)])]),
        "prop_altar_pedestal": ("PROP_AltarPedestal", [("stone", lambda s: (add_box(s, (1.5, 1.5, 0.28), (0, 0, 0.14), bevel=0.04), add_box(s, (0.95, 0.95, 0.82), (0, 0, 0.68), bevel=0.04), add_box(s, (1.28, 1.28, 0.18), (0, 0, 1.12), bevel=0.03)))]),
        "prop_weapon_rack": ("PROP_WeaponRack", [("timber", lambda s: (add_box(s, (1.5, 0.14, 1.5), (0, 0, 0.75), bevel=0.02), add_box(s, (1.6, 0.55, 0.12), (0, 0, 0.06))))]),
        "prop_bench": ("PROP_Bench", [("planks", lambda s: add_box(s, (1.8, 0.52, 0.10), (0, 0, 0.48), bevel=0.02)), ("timber", lambda s: (add_box(s, (0.14, 0.46, 0.44), (-0.7, 0, 0.22)), add_box(s, (0.14, 0.46, 0.44), (0.7, 0, 0.22))))]),
        "prop_cairn": ("PROP_StoneCairn", [("old_stone", lambda s: [bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.45 - i * 0.08, matrix=Matrix.Translation((0, 0, 0.24 + i * 0.34)) @ Matrix.Diagonal((1.2, 1.0, 0.58, 1))) for i in range(4)])]),
        "prop_fence": ("PROP_WoodFence", [("timber", lambda s: (add_box(s, (0.14, 0.14, 1.2), (-1.1, 0, 0.6)), add_box(s, (0.14, 0.14, 1.2), (1.1, 0, 0.6)), add_box(s, (2.4, 0.08, 0.12), (0, 0, 0.92)), add_box(s, (2.4, 0.08, 0.12), (0, 0, 0.48))))]),
        "prop_stair_block": ("PROP_StoneStairs", [("stone", lambda s: [add_box(s, (3.2, 0.65, 0.26), (0, (i - 2) * 0.6, 0.13 + i * 0.26), bevel=0.02) for i in range(6)])]),
        "prop_bone_pile": ("PROP_BonePile", [("cloth", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.05, radius2=0.04, depth=0.65, matrix=Matrix.Translation((0, 0, 0.1)) @ Euler((1.4, 0.2, i * 0.8)).to_matrix().to_4x4()) for i in range(5)])]),
        "prop_bellows": ("PROP_ForgeBellows", [("leather", lambda s: add_box(s, (0.75, 0.95, 0.45), (0, 0, 0.55), bevel=0.04)), ("wood", lambda s: add_box(s, (0.85, 0.95, 0.12), (0, 0, 0.22)))]),
        "prop_log_pile": ("PROP_LogPile", [("timber", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.14, radius2=0.13, depth=1.35, matrix=Matrix.Translation((x, 0, z)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()) for x, z in [(-0.28, 0.14), (0, 0.14), (0.28, 0.14), (-0.14, 0.36), (0.14, 0.36), (0, 0.58)]])]),
    }
    for pid, (mname, parts) in specs.items():
        reset_scene()
        mats = create_mats()
        obj = build_from_parts(mname, parts, mats)
        export_static_glb([obj], OUT_PROPS / f"{pid}.glb")


def render_qa_sheet():
    reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 850
    scene.view_settings.view_transform = "AgX"

    world = bpy.data.worlds.new("QAWorld")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    hdri_p = ROOT / "public" / "assets" / "eidrath" / "hdri" / "snowy_forest.hdr"
    if hdri_p.exists():
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_p))
        world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.8

    pieces = [
        ("env_frost_pine.glb", (-16, 4, 0)),
        ("env_nordic_cabin.glb", (-7, 2, 0)),
        ("env_oathgrave_tomb.glb", (7, 4, 0)),
        ("env_keep_gate.glb", (22, 4, 0)),
        ("env_oath_shrine.glb", (-12, -10, 0)),
        ("env_rock_cliff.glb", (14, -12, 0)),
    ]
    for fn, pos in pieces:
        p = OUT_WORLD / fn
        if p.exists():
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(p))
            for o in bpy.data.objects:
                if o not in before and o.parent is None and not o.name.startswith("UCX_"):
                    o.location = pos
                elif o not in before and o.name.startswith("UCX_"):
                    o.hide_render = True

    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    bpy.ops.object.light_add(type="SUN", location=(15, -20, 25))
    bpy.context.active_object.data.energy = 3.0
    bpy.context.active_object.rotation_euler = (math.radians(48), 0, math.radians(-20))

    cam_data = bpy.data.cameras.new("WorldQACam")
    cam = bpy.data.objects.new("WorldQACam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (2.0, -34.0, 11.0)
    cam.rotation_euler = (math.radians(74), 0, 0)
    scene.camera = cam

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "eidrath_frostheim_realistic.blend"))
    out_png = OUT_PREVIEW / "realistic_frostheim_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    print(f"[QA FROSTHEIM] {out_png}")


def main():
    mats = create_mats()
    build_world_assets(mats)
    build_props_assets()
    render_qa_sheet()


if __name__ == "__main__":
    main()
