"""
EIDRATH: The Last Oath — Realistic MPFB2 Characters & NPCs (Blender 5.3)
Builds 5 anatomically realistic, PBR-textured, Mixamo-mocap-retargeted humanoids:
  - CHR_Kaelen   (1.90m) -> public/assets/eidrath/characters/chr_kaelen.glb
  - CHR_Lyra     (1.76m) -> public/assets/eidrath/characters/chr_lyra.glb
  - NPC_Borin    (1.56m) -> public/assets/eidrath/characters/npc_borin.glb
  - NPC_Edda     (1.78m) -> public/assets/eidrath/characters/npc_edda.glb
  - NPC_Villager (1.74m) -> public/assets/eidrath/characters/npc_villager.glb

Also renders a high-resolution Cycles/EEVEE inspection sheet:
  art/blender/previews/realistic_characters_qa.png
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eidrath_rig_utils import (
    ROOT,
    add_procedural_nla_clips,
    apply_standard_mocap_and_clips,
    attach_mesh_to_rig,
    create_realistic_mpfb_human,
    export_rigged_glb,
    make_pbr_mat,
)

OUT_GLB = ROOT / "public" / "assets" / "eidrath" / "characters"
OUT_BLEND = ROOT / "art" / "blender" / "characters"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_GLB, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def extract_body_shell(body_obj, name: str, z_min: float, z_max: float, offset_m: float = 0.012, thickness_m: float = 0.010, x_abs_max: float | None = None, exclude_points: list[tuple[Vector, float]] | None = None, include_points: list[tuple[Vector, float]] | None = None, decimate_ratio: float = 0.55, mat=None):
    """Duplicate faces from anatomical MPFB2 body within [z_min, z_max] to create fitted clothing/armor."""
    bpy.ops.object.select_all(action="DESELECT")
    body_obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    dup = body_obj.copy()
    dup.data = body_obj.data.copy()
    dup.name = name
    bpy.context.scene.collection.objects.link(dup)

    dup.modifiers.clear()
    dup.data.materials.clear()

    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.faces.ensure_lookup_table()
    to_del = []
    for f in bm.faces:
        c = dup.matrix_world @ f.calc_center_median()
        keep = (z_min <= c.z <= z_max)
        if keep and x_abs_max is not None and abs(c.x) > x_abs_max:
            keep = False
        if keep and include_points:
            keep = any((c - pt).length <= rad for pt, rad in include_points)
        if keep and exclude_points:
            for pt, rad in exclude_points:
                if (c - pt).length < rad:
                    keep = False
                    break
        if not keep:
            to_del.append(f)
    bmesh.ops.delete(bm, geom=to_del, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for v in bm.verts:
        v.co += v.normal * offset_m
    bm.to_mesh(dup.data)
    bm.free()

    if len(dup.data.polygons) == 0:
        bpy.data.objects.remove(dup, do_unlink=True)
        return None

    sol = dup.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = thickness_m
    sol.offset = 1.0
    bpy.ops.object.select_all(action="DESELECT")
    dup.select_set(True)
    bpy.context.view_layer.objects.active = dup
    bpy.ops.object.modifier_apply(modifier=sol.name)

    sm = dup.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.35
    sm.iterations = 2
    bpy.ops.object.modifier_apply(modifier=sm.name)

    if decimate_ratio < 0.99 and len(dup.data.polygons) > 300:
        dec = dup.modifiers.new("Decimate", "DECIMATE")
        dec.ratio = decimate_ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth()
    if mat:
        dup.data.materials.append(mat)
    dup.select_set(False)
    return dup


def build_eyes_and_brows(cid: str, rig, hair_mat, iris_rgb=(0.24, 0.34, 0.44)):
    """Place realistic glossy eyeballs, irises, and sculpted brows inside MPFB2 eye sockets."""
    eye_l = Vector(rig["eidrath_landmarks_eye_l"])
    eye_r = Vector(rig["eidrath_landmarks_eye_r"])

    sclera_mat = make_pbr_mat(f"MAT_{cid}_Sclera", None, tint=(0.92, 0.90, 0.88), metallic=0.0, roughness=0.14)
    iris_mat = make_pbr_mat(f"MAT_{cid}_Iris", None, tint=iris_rgb, metallic=0.0, roughness=0.10)
    pupil_mat = make_pbr_mat(f"MAT_{cid}_Pupil", None, tint=(0.02, 0.02, 0.02), metallic=0.0, roughness=0.08)

    bm = bmesh.new()
    for eye_c in (eye_l, eye_r):
        # Sclera sphere (1.2cm radius)
        r_s = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.0125, matrix=Matrix.Translation(eye_c))
        for f in {f for v in r_s["verts"] for f in v.link_faces}:
            f.material_index = 0
        # Iris cap slightly forward (-Y)
        r_i = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=0.0068, matrix=Matrix.Translation(eye_c + Vector((0, -0.0085, 0))) @ Matrix.Diagonal((1.0, 0.45, 1.0, 1.0)))
        for f in {f for v in r_i["verts"] for f in v.link_faces}:
            f.material_index = 1
        # Pupil center
        r_p = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.0032, matrix=Matrix.Translation(eye_c + Vector((0, -0.0112, 0))) @ Matrix.Diagonal((1.0, 0.45, 1.0, 1.0)))
        for f in {f for v in r_p["verts"] for f in v.link_faces}:
            f.material_index = 2
        # Sculpted eyebrow arch above eye
        r_b = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(eye_c + Vector((0, -0.016, 0.018))) @ Matrix.Diagonal((0.034, 0.010, 0.006, 1.0)))
        for f in {f for v in r_b["verts"] for f in v.link_faces}:
            f.material_index = 3

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"{cid}_Eyes_Mesh")
    bm.to_mesh(me)
    bm.free()
    for m in (sclera_mat, iris_mat, pupil_mat, hair_mat):
        me.materials.append(m)
    obj = bpy.data.objects.new(f"{cid}_Eyes", me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    attach_mesh_to_rig(obj, rig, bone_weights={"head": 1.0})
    return obj


def build_hair_and_beard(body_obj, rig, name: str, hair_mat, style: str = "kaelen_short", beard: bool = True):
    """Sculpt fitted skull hair cap + natural tapered strands/locks and jawline beard."""
    # Extract exact skull scalp shell directly from MPFB2 body 'scalp' vertex group!
    scalp_vg = body_obj.vertex_groups.get("scalp")
    zs = [(body_obj.matrix_world @ v.co).z for v in body_obj.data.vertices]
    h_top = max(zs)
    eye_l = Vector(rig["eidrath_landmarks_eye_l"])
    jaw = Vector(rig["eidrath_landmarks_jaw"])
    head_z = eye_l.z + 0.03

    bm = bmesh.new()

    def add_strand(pts: list[tuple], radii: list[float]):
        rings = []
        for p, rad in zip(pts, radii):
            ring = []
            for k in range(8):
                ang = (k / 8.0) * math.pi * 2.0
                ring.append(bm.verts.new((p[0] + math.cos(ang) * rad, p[1] + math.sin(ang) * rad * 0.65, p[2])))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for k in range(8):
                kn = (k + 1) % 8
                try:
                    bm.faces.new((rings[i][k], rings[i][kn], rings[i + 1][kn], rings[i + 1][k]))
                except ValueError:
                    pass
        try:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        except ValueError:
            pass

    # Lower fitted skull cap so hairline wraps naturally above brows
    cap_c = Vector((0.0, eye_l.y + 0.088, head_z + 0.010))
    r_cap = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(cap_c) @ Matrix.Diagonal((0.086, 0.102, 0.090, 1.0)), verts=r_cap["verts"])
    # Trim lower front of skull cap so face stays completely clear!
    for f in list(bm.faces):
        fc = f.calc_center_median()
        if fc.y < eye_l.y + 0.026 and fc.z < eye_l.z + 0.044:
            bm.faces.remove(f)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")

    if style == "kaelen_short":
        # Full textured warrior swept hair across crown, temples & nape
        for i in range(-5, 6):
            x = i * 0.016
            add_strand([(x, eye_l.y + 0.046, h_top - 0.018), (x * 1.04, eye_l.y + 0.012, eye_l.z + 0.056), (x * 1.08, eye_l.y - 0.008, eye_l.z + 0.036)], [0.022, 0.018, 0.006])
        for i in range(-4, 5):
            x = i * 0.020
            add_strand([(x, cap_c.y + 0.072, head_z + 0.02), (x * 1.04, cap_c.y + 0.095, head_z - 0.065), (x * 1.02, cap_c.y + 0.088, head_z - 0.145)], [0.024, 0.020, 0.008])
    elif style == "lyra_long":
        # Flowing long silver locks framing shoulders & down back
        for side in (-1, 1):
            for k in range(3):
                ox = side * (0.072 + k * 0.012)
                oy = eye_l.y + 0.03 + k * 0.028
                add_strand([(ox, oy, head_z + 0.04), (ox * 1.16, oy + 0.02, head_z - 0.12), (ox * 1.24, oy + 0.04, head_z - 0.28)], [0.022, 0.018, 0.006])
        for i in range(-4, 5):
            x = i * 0.020
            add_strand([(x, cap_c.y + 0.088, head_z + 0.02), (x * 1.1, cap_c.y + 0.11, head_z - 0.14), (x * 1.2, cap_c.y + 0.12, head_z - 0.30)], [0.022, 0.018, 0.006])
    elif style == "edda_braid":
        for i in range(5):
            r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.026 - i * 0.003, matrix=Matrix.Translation((0.0, cap_c.y + 0.105 + i * 0.010, head_z - 0.01 - i * 0.048)))
    else:
        for i in range(-3, 4):
            x = i * 0.022
            add_strand([(x, cap_c.y + 0.082, head_z + 0.01), (x, cap_c.y + 0.098, head_z - 0.06)], [0.020, 0.008])

    if beard:
        # Close-sculpted Nordic beard wrapping jaw & chin
        for i in range(-4, 5):
            t = i / 4.0
            bx = t * 0.056
            by = jaw.y + 0.012 + abs(t) * 0.042
            bz = jaw.z + 0.010 + abs(t) * 0.024
            drop = 0.065 if style == "borin_beard" else 0.026
            add_strand([(bx, by, bz + 0.018), (bx * 0.88, by - 0.006, bz - drop * 0.5), (bx * 0.65, by - 0.002, bz - drop)], [0.016, 0.014, 0.005])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(hair_mat)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth()
    return obj


def build_layered_armor_accents(name: str, height_m: float, steel_mat, bronze_mat, leather_mat, rig, body_obj):
    """Build sculpted medieval pauldrons, belt/baldrics, gauntlets, and winter boots around rig bones."""
    parts = []
    # Find bone world positions for exact anatomical fit
    bones = rig.data.bones
    def b_mid(bname):
        b = bones.get(bname)
        if not b:
            return Vector((0, 0, height_m * 0.5))
        return rig.matrix_world @ ((b.head_local + b.tail_local) * 0.5)

    def b_head(bname):
        b = bones.get(bname)
        return (rig.matrix_world @ b.head_local) if b else Vector((0, 0, height_m * 0.5))

    def make_sculpted_part(pname, mat, bone_name, fn):
        bm = bmesh.new()
        fn(bm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(pname + "_Mesh")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        obj = bpy.data.objects.new(pname, me)
        bpy.context.scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()
        attach_mesh_to_rig(obj, rig, bone_weights={bone_name: 1.0})
        parts.append(obj)

    # Pauldrons (layered steel shoulder plates hugged tight to deltoids)
    for side, sx in (("l", 1.0), ("r", -1.0)):
        sh = b_head(f"upperarm_{side}")
        def pauldron_fn(bm, sh=sh, sx=sx):
            for tier, dz, sc in ((0, 0.022, 0.94), (1, -0.024, 0.82)):
                r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.078 * sc)
                m = Matrix.Translation(sh + Vector((sx * 0.018, 0.0, dz))) @ Euler((0.0, sx * 0.42, 0.0), "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((1.02, 1.15, 0.52, 1.0))
                bmesh.ops.transform(bm, matrix=m, verts=r["verts"])
        make_sculpted_part(f"{name}_Pauldron_{side}", steel_mat, f"upperarm_{side}", pauldron_fn)

    # Slim sculpted gorget collar covering tunic neckline seam
    nk = b_head("neck_01") - Vector((0, 0, 0.025))
    def collar_fn(bm, nk=nk):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=0.132, radius2=0.105, depth=0.040, matrix=Matrix.Translation(nk) @ Matrix.Diagonal((1.02, 0.88, 1.0, 1.0)))
    make_sculpted_part(f"{name}_Collar", leather_mat, "spine_03", collar_fn)

    # Belt & bronze buckle
    pel = b_head("pelvis") + Vector((0, 0, 0.06))
    def belt_fn(bm, pel=pel):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.175, radius2=0.168, depth=0.075, matrix=Matrix.Translation(pel) @ Matrix.Diagonal((1.08, 0.82, 1.0, 1.0)))
    make_sculpted_part(f"{name}_Belt", leather_mat, "pelvis", belt_fn)

    def buckle_fn(bm, pel=pel):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(pel + Vector((0, -0.145, 0))) @ Matrix.Diagonal((0.08, 0.025, 0.075, 1.0)))
    make_sculpted_part(f"{name}_Buckle", bronze_mat, "pelvis", buckle_fn)

    # Chest baldric strap
    sp2 = b_mid("spine_02")
    def baldric_fn(bm, sp2=sp2):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.185, radius2=0.185, depth=0.05, matrix=Matrix.Translation(sp2 + Vector((0, 0.005, 0.02))) @ Euler((0.0, 0.62, 0.0), "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((1.12, 0.84, 1.0, 1.0)))
    make_sculpted_part(f"{name}_Baldric", leather_mat, "spine_02", baldric_fn)

    return parts


def build_cloak(name: str, rig, cloak_mat, top_z: float, bottom_z: float, width_top: float = 0.24, width_bot: float = 0.44):
    """Build a multi-row weighted flowing cloth cloak skinned to Cloak_1..Cloak_3."""
    bm = bmesh.new()
    rows = 8
    cols = 7
    grid = []
    for r in range(rows):
        t = r / (rows - 1)
        z = top_z - t * (top_z - bottom_z)
        w = width_top + (width_bot - width_top) * (t ** 0.85)
        y_back = 0.14 + t * 0.14 + math.sin(t * math.pi) * 0.04
        row_v = []
        for c in range(cols):
            u = (c / (cols - 1)) * 2.0 - 1.0
            x = u * w
            y = y_back - (1.0 - u * u) * 0.04
            row_v.append(bm.verts.new((x, y, z)))
        grid.append(row_v)

    for r in range(rows - 1):
        for c in range(cols - 1):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(cloak_mat)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)

    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.010
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth()

    # Smooth gradient skinning across spine_03 -> Cloak_1 -> Cloak_2 -> Cloak_3
    for bn in ("spine_03", "Cloak_1", "Cloak_2", "Cloak_3"):
        obj.vertex_groups.new(name=bn)
    for vi, v in enumerate(obj.data.vertices):
        t = max(0.0, min(1.0, (top_z - v.co.z) / max(0.1, top_z - bottom_z)))
        if t < 0.2:
            obj.vertex_groups["spine_03"].add([vi], 1.0 - t * 3, "REPLACE")
            obj.vertex_groups["Cloak_1"].add([vi], t * 3, "REPLACE")
        elif t < 0.55:
            u = (t - 0.2) / 0.35
            obj.vertex_groups["Cloak_1"].add([vi], 1.0 - u, "REPLACE")
            obj.vertex_groups["Cloak_2"].add([vi], u, "REPLACE")
        else:
            u = (t - 0.55) / 0.45
            obj.vertex_groups["Cloak_2"].add([vi], 1.0 - u, "REPLACE")
            obj.vertex_groups["Cloak_3"].add([vi], u, "REPLACE")

    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    arm_mod = obj.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = rig
    arm_mod.use_vertex_groups = True
    return obj


def build_character(spec: dict):
    clear_scene()
    cid = spec["id"]
    h = spec["height"]

    rig, body = create_realistic_mpfb_human(
        char_id=cid,
        target_height_m=h,
        macro_detail=spec["macro"],
        skin_rgb=spec["skin_rgb"],
        scar=spec.get("scar", False),
        stubble=spec.get("stubble", False),
    )

    mats = {
        "armor": make_pbr_mat(f"MAT_{cid}_Armor", spec["armor_tex"], tint=spec["armor_tint"], metallic=spec["armor_metal"], roughness=spec["armor_rough"], uv_scale=3.0, tex_size=512 if spec.get("full_hero") else 256),
        "cloth": make_pbr_mat(f"MAT_{cid}_Cloth", spec["cloth_tex"], tint=spec["cloth_tint"], metallic=0.0, roughness=0.86, uv_scale=3.2, tex_size=512 if spec.get("full_hero") else 256),
        "leather": make_pbr_mat(f"MAT_{cid}_Leather", "brown_leather", tint=spec["leather_tint"], metallic=0.05, roughness=0.72, uv_scale=3.0, tex_size=256),
        "bronze": make_pbr_mat(f"MAT_{cid}_Bronze", "metal_plate", tint=(0.68, 0.52, 0.30), metallic=0.86, roughness=0.36, uv_scale=2.5, tex_size=256),
        "hair": make_pbr_mat(f"MAT_{cid}_Hair", None, tint=spec["hair_tint"], metallic=0.0, roughness=0.68),
    }

    meshes = [body]

    # Realistic eyeballs + brows inside eye sockets
    eyes = build_eyes_and_brows(cid, rig, mats["hair"], iris_rgb=spec.get("iris_rgb", (0.24, 0.36, 0.48)))
    meshes.append(eyes)

    # Keep hands completely bare (wide 26cm exclusion around hand heads & 20cm around tails so fingertips never clip)
    hand_l_pt = rig.matrix_world @ rig.data.bones["hand_l"].head_local
    hand_r_pt = rig.matrix_world @ rig.data.bones["hand_r"].head_local
    hand_l_tail = rig.matrix_world @ rig.data.bones["hand_l"].tail_local
    hand_r_tail = rig.matrix_world @ rig.data.bones["hand_r"].tail_local
    hand_excl = [(hand_l_pt, 0.26), (hand_r_pt, 0.26), (hand_l_tail, 0.20), (hand_r_tail, 0.20)]

    # Fitted anatomical garments extracted from MPFB2 body shell
    tunic = extract_body_shell(body, f"{cid}_Tunic", z_min=h * 0.44, z_max=h * 0.835, offset_m=0.011, thickness_m=0.011, exclude_points=hand_excl, mat=mats["cloth"])
    if tunic:
        attach_mesh_to_rig(tunic, rig, transfer_from=body)
        meshes.append(tunic)

    cuirass = extract_body_shell(body, f"{cid}_Cuirass", z_min=h * 0.53, z_max=h * 0.815, offset_m=0.026, thickness_m=0.013, x_abs_max=0.22, mat=mats["armor"])
    if cuirass:
        attach_mesh_to_rig(cuirass, rig, transfer_from=body)
        meshes.append(cuirass)

    trousers = extract_body_shell(body, f"{cid}_Trousers", z_min=h * 0.09, z_max=h * 0.51, offset_m=0.010, thickness_m=0.010, mat=mats["leather"])
    if trousers:
        attach_mesh_to_rig(trousers, rig, transfer_from=body)
        meshes.append(trousers)

    # Fitted anatomical winter boots for ALL characters (nobody barefoot in snow!)
    boots = extract_body_shell(body, f"{cid}_Boots", z_min=-0.02, z_max=h * 0.24, offset_m=0.015, thickness_m=0.012, decimate_ratio=0.50, mat=mats["leather"])
    if boots:
        attach_mesh_to_rig(boots, rig, transfer_from=body)
        meshes.append(boots)

    # Fitted forearm gauntlets for armored heroes & guards
    if spec.get("armor_accents", True):
        fa_l = rig.matrix_world @ ((rig.data.bones["lowerarm_l"].head_local + rig.data.bones["lowerarm_l"].tail_local) * 0.5)
        fa_r = rig.matrix_world @ ((rig.data.bones["lowerarm_r"].head_local + rig.data.bones["lowerarm_r"].tail_local) * 0.5)
        gauntlets = extract_body_shell(body, f"{cid}_Gauntlets", z_min=h * 0.25, z_max=h * 0.85, offset_m=0.016, thickness_m=0.012, include_points=[(fa_l, 0.16), (fa_r, 0.16)], exclude_points=[(hand_l_pt, 0.11), (hand_r_pt, 0.11)], decimate_ratio=0.55, mat=mats["armor"])
        if gauntlets:
            attach_mesh_to_rig(gauntlets, rig, transfer_from=body)
            meshes.append(gauntlets)

    # Hair & Beard
    hair = build_hair_and_beard(body, rig, f"{cid}_Hair", mats["hair"], style=spec["hair_style"], beard=spec.get("beard", False))
    attach_mesh_to_rig(hair, rig, bone_weights={"head": 1.0})
    meshes.append(hair)

    # Sculpted pauldrons, gauntlets, boots, belt, baldric
    if spec.get("armor_accents", True):
        accents = build_layered_armor_accents(cid, h, mats["armor"], mats["bronze"], mats["leather"], rig, body)
        meshes.extend(accents)

    # Flowing rigged cloak
    if spec.get("cloak", False):
        cloak = build_cloak(f"{cid}_Cloak", rig, mats["cloth"], top_z=h * 0.80, bottom_z=h * 0.24)
        meshes.append(cloak)

    # Retarget Mixamo mocap + author combat/movement NLA tracks
    apply_standard_mocap_and_clips(rig, full_hero=spec.get("full_hero", False))

    blend_path = OUT_BLEND / f"{cid}.blend"
    glb_path = OUT_GLB / f"{cid}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    export_rigged_glb(rig, meshes, glb_path)
    print(f"[EXPORT] {cid} -> {glb_path.name} ({glb_path.stat().st_size // 1024} KB), meshes={len(meshes)}, clips={len(rig.animation_data.nla_tracks)}")


SPECS = [
    {
        "id": "chr_kaelen",
        "height": 1.90,
        "macro": {"gender": 1.0, "age": 0.62, "muscle": 0.86, "weight": 0.52, "proportions": 0.68, "height": 0.86, "cupsize": 0.0, "firmness": 0.72, "race": {"asian": 0.10, "caucasian": 0.85, "african": 0.05}},
        "skin_rgb": (196, 152, 128),
        "scar": True,
        "stubble": True,
        "armor_tex": "metal_plate",
        "armor_tint": (0.58, 0.62, 0.66),
        "armor_metal": 0.82,
        "armor_rough": 0.42,
        "cloth_tex": "poly_wool_herringbone",
        "cloth_tint": (0.28, 0.36, 0.45),
        "leather_tint": (0.42, 0.30, 0.22),
        "hair_tint": (0.03, 0.03, 0.04),
        "hair_style": "kaelen_short",
        "beard": True,
        "cloak": True,
        "full_hero": True,
    },
    {
        "id": "chr_lyra",
        "height": 1.76,
        "macro": {"gender": 0.0, "age": 0.42, "muscle": 0.38, "weight": 0.38, "proportions": 0.55, "height": 0.58, "cupsize": 0.45, "firmness": 0.65, "race": {"asian": 0.12, "caucasian": 0.83, "african": 0.05}},
        "skin_rgb": (212, 174, 154),
        "scar": False,
        "stubble": False,
        "armor_tex": "poly_wool_herringbone",
        "armor_tint": (0.34, 0.50, 0.62),
        "armor_metal": 0.12,
        "armor_rough": 0.68,
        "cloth_tex": "poly_wool_herringbone",
        "cloth_tint": (0.24, 0.34, 0.44),
        "leather_tint": (0.38, 0.28, 0.24),
        "hair_tint": (0.78, 0.82, 0.88),
        "hair_style": "lyra_long",
        "beard": False,
        "cloak": True,
        "full_hero": False,
    },
    {
        "id": "npc_borin",
        "height": 1.56,
        "macro": {"gender": 1.0, "age": 0.78, "muscle": 0.92, "weight": 0.84, "proportions": 0.72, "height": 0.18, "cupsize": 0.0, "firmness": 0.65, "race": {"asian": 0.05, "caucasian": 0.90, "african": 0.05}},
        "skin_rgb": (184, 138, 114),
        "scar": False,
        "stubble": True,
        "armor_tex": "brown_leather",
        "armor_tint": (0.48, 0.34, 0.22),
        "armor_metal": 0.08,
        "armor_rough": 0.76,
        "cloth_tex": "poly_wool_herringbone",
        "cloth_tint": (0.45, 0.36, 0.28),
        "leather_tint": (0.35, 0.24, 0.18),
        "hair_tint": (0.16, 0.08, 0.04),
        "hair_style": "borin_beard",
        "beard": True,
        "cloak": False,
        "full_hero": False,
    },
    {
        "id": "npc_edda",
        "height": 1.78,
        "macro": {"gender": 0.08, "age": 0.64, "muscle": 0.68, "weight": 0.50, "proportions": 0.60, "height": 0.64, "cupsize": 0.42, "firmness": 0.65, "race": {"asian": 0.05, "caucasian": 0.90, "african": 0.05}},
        "skin_rgb": (198, 158, 136),
        "scar": True,
        "stubble": False,
        "armor_tex": "rusty_metal",
        "armor_tint": (0.55, 0.56, 0.60),
        "armor_metal": 0.78,
        "armor_rough": 0.46,
        "cloth_tex": "poly_wool_herringbone",
        "cloth_tint": (0.52, 0.24, 0.22),
        "leather_tint": (0.34, 0.26, 0.20),
        "hair_tint": (0.64, 0.56, 0.44),
        "hair_style": "edda_braid",
        "beard": False,
        "cloak": True,
        "full_hero": False,
    },
    {
        "id": "npc_villager",
        "height": 1.74,
        "macro": {"gender": 0.85, "age": 0.58, "muscle": 0.52, "weight": 0.58, "proportions": 0.52, "height": 0.52, "cupsize": 0.0, "firmness": 0.55, "race": {"asian": 0.15, "caucasian": 0.75, "african": 0.10}},
        "skin_rgb": (188, 148, 126),
        "scar": False,
        "stubble": True,
        "armor_tex": "poly_wool_herringbone",
        "armor_tint": (0.48, 0.44, 0.36),
        "armor_metal": 0.0,
        "armor_rough": 0.88,
        "cloth_tex": "poly_wool_herringbone",
        "cloth_tint": (0.38, 0.42, 0.36),
        "leather_tint": (0.44, 0.34, 0.26),
        "hair_tint": (0.22, 0.18, 0.15),
        "hair_style": "villager_short",
        "beard": True,
        "cloak": False,
        "armor_accents": False,
        "full_hero": False,
    },
]


def render_qa_sheet():
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 780
    scene.view_settings.view_transform = "AgX"

    # Load all 5 exported GLBs side by side
    xs = [-2.2, -1.1, 0.0, 1.1, 2.2]
    for spec, x in zip(SPECS, xs):
        before = set(bpy.data.objects)
        before_acts = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=str(OUT_GLB / f"{spec['id']}.glb"))
        idle_act = next((a for a in bpy.data.actions if a not in before_acts and a.name.lower().startswith("idle")), None)
        for o in bpy.data.objects:
            if o not in before and o.parent is None:
                o.location.x = x
                if o.type == "ARMATURE":
                    o.animation_data_create()
                    o.animation_data.action = idle_act
    bpy.context.scene.frame_set(1)

    # Ground plane & HDRI + studio 3-point lighting
    world = bpy.data.worlds.new("QAWorld")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    hdri_p = ROOT / "public" / "assets" / "eidrath" / "hdri" / "snowy_forest.hdr"
    if hdri_p.exists():
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_p))
        world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.75

    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, 0))
    bpy.ops.object.light_add(type="SUN", location=(4, -6, 7))
    bpy.context.active_object.data.energy = 3.2
    bpy.context.active_object.rotation_euler = (math.radians(48), 0, math.radians(-22))
    bpy.ops.object.light_add(type="AREA", location=(-4, -4, 3))
    bpy.context.active_object.data.energy = 110
    bpy.context.active_object.data.color = (0.72, 0.84, 1.0)

    cam_data = bpy.data.cameras.new("QACam")
    cam = bpy.data.objects.new("QACam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -7.2, 1.2)
    cam.rotation_euler = (math.radians(86), 0, 0)
    scene.camera = cam

    out_png = OUT_PREVIEW / "realistic_characters_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    print(f"[QA RENDER] {out_png}")


def main():
    for sp in SPECS:
        build_character(sp)
    render_qa_sheet()


if __name__ == "__main__":
    main()
