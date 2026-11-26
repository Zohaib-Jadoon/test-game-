"""
EIDRATH: The Last Oath — Realistic Enemies & Mountain Warden Boss (Blender 5.3)
Replaces all 6 enemy archetypes (MPFB2 gaunt undead draugrs, fur-clad bandit,
anatomical quadruped Frost Wolf, hulking Frost Troll) and the Mountain Warden boss
(sculpted granite colossus with separate destructible ArmorPlate_* meshes,
broken iron chains, glowing oath-blue rune cracks, and rune warmaul).
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eidrath_rig_utils import (
    MOCAP_DIR,
    ROOT,
    add_procedural_nla_clips,
    attach_mesh_to_rig,
    create_realistic_mpfb_human,
    export_rigged_glb,
    make_pbr_mat,
    retarget_mixamo_action,
)
from build_realistic_characters import build_eyes_and_brows, build_hair_and_beard, extract_body_shell

OUT_ENM = ROOT / "public" / "assets" / "eidrath" / "enemies"
OUT_BOSS = ROOT / "public" / "assets" / "eidrath" / "bosses"
OUT_BLEND = ROOT / "art" / "blender" / "enemies"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_ENM, OUT_BOSS, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def enemy_nla_clips():
    return {
        "Telegraph": [
            (1, {"spine_01": (-8, -18, 0), "spine_02": (-10, -20, 0), "upperarm_r": (-110, 0, -24), "lowerarm_r": (-35, 0, 0)}, {"pelvis": (0, 0.03, 0)}),
            (14, {"spine_01": (-12, -24, 0), "spine_02": (-14, -26, 0), "upperarm_r": (-128, 0, -26), "lowerarm_r": (-42, 0, 0)}, {"pelvis": (0, 0.04, 0)}),
        ],
        "Attack": [
            (1, {"spine_01": (-10, -20, 0), "upperarm_r": (-120, 0, -24), "lowerarm_r": (-38, 0, 0)}, {"pelvis": (0, 0.03, 0)}),
            (7, {"spine_01": (18, 28, 0), "spine_02": (22, 34, 0), "upperarm_r": (-34, 22, 42), "lowerarm_r": (-12, 0, 0), "thigh_r": (26, 0, 0)}, {"pelvis": (0, -0.10, -0.06)}),
            (18, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Block": [
            (1, {"spine_01": (8, -10, 0), "upperarm_l": (-56, -16, -18), "lowerarm_l": (-72, 0, 0), "upperarm_r": (-44, 10, 18)}, {"pelvis": (0, -0.06, 0)}),
            (20, {"spine_01": (8, -10, 0), "upperarm_l": (-58, -16, -18), "lowerarm_l": (-74, 0, 0), "upperarm_r": (-44, 10, 18)}, {"pelvis": (0, -0.06, 0)}),
        ],
        "Stagger": [
            (1, {"spine_01": (-18, -12, 0), "spine_02": (-18, -12, 0), "head": (-14, 0, 0), "upperarm_r": (-28, 0, -34), "upperarm_l": (-28, 0, 34)}, {"pelvis": (0, -0.04, 0.07)}),
            (16, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Death": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (10, {"spine_01": (-20, 0, 0), "thigh_r": (34, 0, 0), "calf_r": (48, 0, 0)}, {"pelvis": (0, -0.22, 0.05)}),
            (24, {"pelvis": (-86, 0, 0), "upperarm_r": (-18, 0, -52), "upperarm_l": (-18, 0, 52)}, {"pelvis": (0, -0.84, 0.24)}),
        ],
    }


def build_humanoid_enemy(cfg: dict):
    clear_scene()
    eid = cfg["id"]
    h = cfg["height"]
    rig, body = create_realistic_mpfb_human(
        char_id=eid,
        target_height_m=h,
        macro_detail=cfg["macro"],
        skin_rgb=cfg["skin_rgb"],
        scar=True,
        stubble=cfg.get("stubble", False),
    )

    rust = make_pbr_mat(f"MAT_{eid}_Rust", "rusty_metal", tint=cfg["metal_tint"], metallic=0.84, roughness=0.48, uv_scale=3.0)
    cloth = make_pbr_mat(f"MAT_{eid}_Cloth", cfg["cloth_tex"], tint=cfg["cloth_tint"], metallic=0.02, roughness=0.86, uv_scale=3.0)
    leather = make_pbr_mat(f"MAT_{eid}_Leather", "brown_leather", tint=(0.34, 0.26, 0.22), metallic=0.04, roughness=0.78, uv_scale=3.0)
    hair_m = make_pbr_mat(f"MAT_{eid}_Hair", None, tint=cfg["hair_tint"], metallic=0.0, roughness=0.72)

    meshes = [body]
    eyes = build_eyes_and_brows(eid, rig, hair_m, iris_rgb=cfg["iris_rgb"])
    meshes.append(eyes)

    hand_l_pt = rig.matrix_world @ rig.data.bones["hand_l"].head_local
    hand_r_pt = rig.matrix_world @ rig.data.bones["hand_r"].head_local
    hand_l_tail = rig.matrix_world @ rig.data.bones["hand_l"].tail_local
    hand_r_tail = rig.matrix_world @ rig.data.bones["hand_r"].tail_local
    hand_excl = [(hand_l_pt, 0.26), (hand_r_pt, 0.26), (hand_l_tail, 0.20), (hand_r_tail, 0.20)]

    tunic = extract_body_shell(body, f"{eid}_Tunic", z_min=h * 0.42, z_max=h * 0.835, offset_m=0.011, thickness_m=0.012, exclude_points=hand_excl, mat=cloth)
    if tunic:
        attach_mesh_to_rig(tunic, rig, transfer_from=body)
        meshes.append(tunic)

    plate = extract_body_shell(body, f"{eid}_Plate", z_min=h * 0.54, z_max=h * 0.815, offset_m=0.026, thickness_m=0.014, x_abs_max=0.23, mat=rust)
    if plate:
        attach_mesh_to_rig(plate, rig, transfer_from=body)
        meshes.append(plate)

    greaves = extract_body_shell(body, f"{eid}_Greaves", z_min=h * 0.08, z_max=h * 0.50, offset_m=0.010, thickness_m=0.010, mat=leather)
    if greaves:
        attach_mesh_to_rig(greaves, rig, transfer_from=body)
        meshes.append(greaves)

    boots = extract_body_shell(body, f"{eid}_Boots", z_min=-0.02, z_max=h * 0.24, offset_m=0.015, thickness_m=0.012, decimate_ratio=0.50, mat=leather)
    if boots:
        attach_mesh_to_rig(boots, rig, transfer_from=body)
        meshes.append(boots)

    if eid == "enm_hollow_knight":
        helm_pt = rig.matrix_world @ rig.data.bones["head"].head_local
        bm_h = bmesh.new()
        bmesh.ops.create_cone(bm_h, cap_ends=True, segments=16, radius1=0.145, radius2=0.110, depth=0.26, matrix=Matrix.Translation(helm_pt + Vector((0, 0.01, 0.14))))
        bmesh.ops.create_cube(bm_h, size=1.0, matrix=Matrix.Translation(helm_pt + Vector((0, -0.11, 0.14))) @ Matrix.Diagonal((0.032, 0.04, 0.14, 1.0)))
        bmesh.ops.recalc_face_normals(bm_h, faces=bm_h.faces)
        me_h = bpy.data.meshes.new(f"{eid}_Helm_Mesh")
        bm_h.to_mesh(me_h)
        bm_h.free()
        helm_mat = make_pbr_mat(f"MAT_{eid}_Helm", "metal_plate", tint=(0.24, 0.26, 0.30), metallic=0.84, roughness=0.42, uv_scale=2.5)
        me_h.materials.append(helm_mat)
        helm = bpy.data.objects.new(f"{eid}_Helm", me_h)
        bpy.context.scene.collection.objects.link(helm)
        bpy.ops.object.select_all(action="DESELECT")
        helm.select_set(True)
        bpy.context.view_layer.objects.active = helm
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()
        attach_mesh_to_rig(helm, rig, bone_weights={"head": 1.0})
        meshes.append(helm)

    if cfg.get("hair_style"):
        hair = build_hair_and_beard(body, rig, f"{eid}_Hair", hair_m, style=cfg["hair_style"], beard=cfg.get("beard", False))
        attach_mesh_to_rig(hair, rig, bone_weights={"head": 1.0})
        meshes.append(hair)

    # Retarget Idle/Walk/Run from unarmed Xbot.glb + add enemy combat NLA clips
    xbot = MOCAP_DIR / "Xbot.glb"
    retarget_mixamo_action(rig, xbot, "idle", "Idle", step=2, max_frames=50)
    retarget_mixamo_action(rig, xbot, "walk", "Walk", step=1, max_frames=24)
    retarget_mixamo_action(rig, xbot, "run", "Run", step=1, max_frames=18)
    add_procedural_nla_clips(rig, enemy_nla_clips())

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / f"{eid}.blend"))
    export_rigged_glb(rig, meshes, OUT_ENM / f"{eid}.glb")
    print(f"[ENEMY] {eid} -> {(OUT_ENM / f'{eid}.glb').stat().st_size // 1024} KB")


def build_organic_rigged_mesh(name: str, parts: list[tuple], mats: dict, bones_spec: list[tuple]):
    """Helper for quadruped Frost Wolf, Frost Troll, and Mountain Warden sculpted rigs."""
    arm_data = bpy.data.armatures.new(name + "_Arm")
    arm_obj = bpy.data.objects.new(name + "_Arm", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for bname, h, t, parent in bones_spec:
        b = eb.new(bname)
        b.head = Vector(h)
        b.tail = Vector(t)
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    objs = []
    for part_name, mat_key, fn, weights, subsurf_lvl in parts:
        bm = bmesh.new()
        fn(bm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(part_name + "_Mesh")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mats[mat_key])
        obj = bpy.data.objects.new(part_name, me)
        bpy.context.scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if subsurf_lvl > 0:
            sub = obj.modifiers.new("Subsurf", "SUBSURF")
            sub.levels = subsurf_lvl
            sub.render_levels = subsurf_lvl
            bpy.ops.object.modifier_apply(modifier=sub.name)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()
        attach_mesh_to_rig(obj, arm_obj, bone_weights=weights)
        objs.append(obj)
    return arm_obj, objs


def build_frost_wolf():
    clear_scene()
    mats = {
        "fur": make_pbr_mat("MAT_Wolf_Fur", "poly_wool_herringbone", tint=(0.68, 0.72, 0.76), metallic=0.0, roughness=0.86, uv_scale=4.0),
        "mane": make_pbr_mat("MAT_Wolf_Mane", "poly_wool_herringbone", tint=(0.38, 0.42, 0.48), metallic=0.0, roughness=0.90, uv_scale=4.0),
        "fang": make_pbr_mat("MAT_Wolf_Fang", None, tint=(0.88, 0.84, 0.76), metallic=0.0, roughness=0.35),
        "eye": make_pbr_mat("MAT_Wolf_Eye", None, tint=(0.82, 0.56, 0.22), metallic=0.0, roughness=0.14, emit_rgb=(0.85, 0.52, 0.16), emit_strength=1.4),
    }
    bones = [
        ("Root", (0, 0, 0), (0, 0, 0.15), None),
        ("Pelvis", (0, 0.34, 0.62), (0, 0.16, 0.64), "Root"),
        ("Spine", (0, 0.16, 0.64), (0, -0.16, 0.68), "Pelvis"),
        ("Chest", (0, -0.16, 0.68), (0, -0.44, 0.74), "Spine"),
        ("Neck", (0, -0.44, 0.74), (0, -0.64, 0.88), "Chest"),
        ("Head", (0, -0.64, 0.88), (0, -0.86, 0.86), "Neck"),
        ("Tail_1", (0, 0.38, 0.62), (0, 0.68, 0.52), "Pelvis"),
        ("Leg_FL", (0.14, -0.34, 0.66), (0.14, -0.34, 0.04), "Chest"),
        ("Leg_FR", (-0.14, -0.34, 0.66), (-0.14, -0.34, 0.04), "Chest"),
        ("Leg_BL", (0.14, 0.32, 0.60), (0.14, 0.36, 0.04), "Pelvis"),
        ("Leg_BR", (-0.14, 0.32, 0.60), (-0.14, 0.36, 0.04), "Pelvis"),
    ]

    def sphere(bm, loc, scale, rot=(0, 0, 0)):
        r = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
        m = Matrix.Translation(loc) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.transform(bm, matrix=m, verts=r["verts"])

    parts = [
        ("Wolf_Torso", "fur", lambda bm: (sphere(bm, (0, 0.24, 0.62), (0.18, 0.24, 0.19)), sphere(bm, (0, -0.04, 0.66), (0.20, 0.24, 0.21)), sphere(bm, (0, -0.32, 0.70), (0.22, 0.24, 0.24))), {"Spine": 0.5, "Chest": 0.5}, 1),
        ("Wolf_Mane", "mane", lambda bm: sphere(bm, (0, -0.44, 0.78), (0.24, 0.22, 0.24)), {"Chest": 0.6, "Neck": 0.4}, 1),
        ("Wolf_Head", "fur", lambda bm: (sphere(bm, (0, -0.68, 0.88), (0.13, 0.16, 0.13)), sphere(bm, (0, -0.84, 0.84), (0.07, 0.14, 0.06)), sphere(bm, (0.08, -0.64, 1.02), (0.03, 0.04, 0.08), (0.2, 0.2, 0)), sphere(bm, (-0.08, -0.64, 1.02), (0.03, 0.04, 0.08), (0.2, -0.2, 0))), {"Head": 1.0}, 1),
        ("Wolf_Eyes", "eye", lambda bm: (sphere(bm, (0.055, -0.78, 0.91), (0.014, 0.014, 0.014)), sphere(bm, (-0.055, -0.78, 0.91), (0.014, 0.014, 0.014))), {"Head": 1.0}, 0),
        ("Wolf_Tail", "mane", lambda bm: sphere(bm, (0, 0.60, 0.54), (0.08, 0.24, 0.08), (-0.35, 0, 0)), {"Tail_1": 1.0}, 1),
        ("Wolf_Leg_FL", "fur", lambda bm: (sphere(bm, (0.14, -0.34, 0.44), (0.065, 0.075, 0.22)), sphere(bm, (0.14, -0.34, 0.16), (0.048, 0.055, 0.16)), sphere(bm, (0.14, -0.38, 0.04), (0.055, 0.075, 0.04))), {"Leg_FL": 1.0}, 1),
        ("Wolf_Leg_FR", "fur", lambda bm: (sphere(bm, (-0.14, -0.34, 0.44), (0.065, 0.075, 0.22)), sphere(bm, (-0.14, -0.34, 0.16), (0.048, 0.055, 0.16)), sphere(bm, (-0.14, -0.38, 0.04), (0.055, 0.075, 0.04))), {"Leg_FR": 1.0}, 1),
        ("Wolf_Leg_BL", "fur", lambda bm: (sphere(bm, (0.14, 0.34, 0.42), (0.072, 0.09, 0.22)), sphere(bm, (0.14, 0.38, 0.16), (0.048, 0.055, 0.16)), sphere(bm, (0.14, 0.34, 0.04), (0.055, 0.075, 0.04))), {"Leg_BL": 1.0}, 1),
        ("Wolf_Leg_BR", "fur", lambda bm: (sphere(bm, (-0.14, 0.34, 0.42), (0.072, 0.09, 0.22)), sphere(bm, (-0.14, 0.38, 0.16), (0.048, 0.055, 0.16)), sphere(bm, (-0.14, 0.34, 0.04), (0.055, 0.075, 0.04))), {"Leg_BR": 1.0}, 1),
    ]
    rig, objs = build_organic_rigged_mesh("ENM_FrostWolf", parts, mats, bones)
    add_procedural_nla_clips(rig, {
        "Idle": [(1, {"Head": (0, 0, 0), "Tail_1": (0, 0, 0)}, {}), (24, {"Head": (-5, 0, 6), "Tail_1": (6, 0, 8)}, {}), (48, {"Head": (0, 0, 0), "Tail_1": (0, 0, 0)}, {})],
        "Run": [(1, {"Spine": (10, 0, 0), "Leg_FL": (38, 0, 0), "Leg_FR": (30, 0, 0), "Leg_BL": (-36, 0, 0), "Leg_BR": (-28, 0, 0)}, {}), (7, {"Spine": (-12, 0, 0), "Leg_FL": (-34, 0, 0), "Leg_FR": (-28, 0, 0), "Leg_BL": (36, 0, 0), "Leg_BR": (32, 0, 0)}, {}), (14, {"Spine": (10, 0, 0), "Leg_FL": (38, 0, 0), "Leg_FR": (30, 0, 0), "Leg_BL": (-36, 0, 0), "Leg_BR": (-28, 0, 0)}, {})],
        "Telegraph": [(1, {"Chest": (-12, 0, 0), "Leg_FL": (-20, 0, 0), "Leg_FR": (-20, 0, 0)}, {}), (12, {"Chest": (-18, 0, 0), "Head": (-14, 0, 0)}, {})],
        "Attack": [(1, {"Chest": (-18, 0, 0)}, {}), (6, {"Spine": (18, 0, 0), "Head": (24, 0, 0), "Leg_FL": (48, 0, 0), "Leg_FR": (48, 0, 0)}, {}), (16, {}, {})],
        "Death": [(1, {}, {}), (18, {"Root": (0, 88, 0)}, {})],
    })
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "enm_frost_wolf.blend"))
    export_rigged_glb(rig, objs, OUT_ENM / "enm_frost_wolf.glb")
    print(f"[WOLF] -> {(OUT_ENM / 'enm_frost_wolf.glb').stat().st_size // 1024} KB")


def build_frost_troll():
    clear_scene()
    rig, body = create_realistic_mpfb_human(
        char_id="enm_frost_troll",
        target_height_m=2.86,
        macro_detail={"gender": 1.0, "age": 0.90, "muscle": 1.0, "weight": 0.95, "proportions": 0.95, "height": 1.0, "cupsize": 0.0, "firmness": 0.6, "race": {"asian": 0.1, "caucasian": 0.8, "african": 0.1}},
        skin_rgb=(86, 108, 126),
        scar=True,
        stubble=False,
    )
    hide_m = make_pbr_mat("MAT_Troll_Hide", "cliff_side", tint=(0.38, 0.48, 0.56), metallic=0.04, roughness=0.84, uv_scale=3.0)
    mane_m = make_pbr_mat("MAT_Troll_Mane", "poly_wool_herringbone", tint=(0.68, 0.76, 0.84), metallic=0.0, roughness=0.90, uv_scale=3.5)
    belt_m = make_pbr_mat("MAT_Troll_Leather", "brown_leather", tint=(0.28, 0.22, 0.18), metallic=0.02, roughness=0.84, uv_scale=3.0)
    body.data.materials.clear()
    body.data.materials.append(hide_m)

    meshes = [body]
    eyes = build_eyes_and_brows("enm_frost_troll", rig, mane_m, iris_rgb=(0.86, 0.36, 0.18))
    meshes.append(eyes)
    # Shoulder/upper-chest frost fur mantle (keep muscular arms & chest exposed)
    pelt = extract_body_shell(body, "Troll_Mane", z_min=1.92, z_max=2.44, offset_m=0.032, thickness_m=0.030, x_abs_max=0.42, mat=mane_m)
    if pelt:
        attach_mesh_to_rig(pelt, rig, transfer_from=body)
        meshes.append(pelt)
    loin = extract_body_shell(body, "Troll_Loincloth", z_min=1.08, z_max=1.54, offset_m=0.022, thickness_m=0.018, x_abs_max=0.34, mat=belt_m)
    if loin:
        attach_mesh_to_rig(loin, rig, transfer_from=body)
        meshes.append(loin)

    xbot = MOCAP_DIR / "Xbot.glb"
    retarget_mixamo_action(rig, xbot, "idle", "Idle", step=2, max_frames=50)
    retarget_mixamo_action(rig, xbot, "walk", "Walk", step=1, max_frames=24)
    retarget_mixamo_action(rig, xbot, "run", "Run", step=1, max_frames=18)
    add_procedural_nla_clips(rig, enemy_nla_clips())
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "enm_frost_troll.blend"))
    export_rigged_glb(rig, meshes, OUT_ENM / "enm_frost_troll.glb")
    print(f"[TROLL] -> {(OUT_ENM / 'enm_frost_troll.glb').stat().st_size // 1024} KB")


def build_mountain_warden_boss():
    """Sculpted 4.15m cohesive ancient stone colossus with chiseled granite anatomy, destructible ArmorPlate_* meshes, iron chains & glowing rune channels."""
    clear_scene()
    mats = {
        "granite": make_pbr_mat("MAT_Warden_Granite", "cliff_side", tint=(0.34, 0.38, 0.44), metallic=0.06, roughness=0.88, uv_scale=2.5, tex_size=512),
        "dark_stone": make_pbr_mat("MAT_Warden_CoreStone", "castle_wall_slates", tint=(0.24, 0.28, 0.34), metallic=0.08, roughness=0.82, uv_scale=2.6, tex_size=256),
        "bronze": make_pbr_mat("MAT_Warden_EngravedBronze", "metal_plate", tint=(0.56, 0.42, 0.24), metallic=0.88, roughness=0.38, uv_scale=2.8, tex_size=256),
        "iron": make_pbr_mat("MAT_Warden_Chains", "rusty_metal", tint=(0.32, 0.34, 0.38), metallic=0.86, roughness=0.52, uv_scale=3.0, tex_size=256),
        "rune": make_pbr_mat("MAT_Warden_OathRunes", None, tint=(0.28, 0.66, 0.96), metallic=0.05, roughness=0.20, emit_rgb=(0.28, 0.68, 1.0), emit_strength=3.6),
    }
    bones = [
        ("Root", (0, 0, 0), (0, 0, 0.3), None),
        ("Pelvis", (0, 0, 1.75), (0, 0, 2.20), "Root"),
        ("Spine", (0, 0, 2.20), (0, 0, 2.85), "Pelvis"),
        ("Chest", (0, 0, 2.85), (0, 0, 3.45), "Spine"),
        ("Head", (0, -0.08, 3.45), (0, -0.14, 4.10), "Chest"),
        ("UpperArm_L", (0.76, 0, 3.25), (1.02, 0, 2.42), "Chest"),
        ("LowerArm_L", (1.02, 0, 2.42), (1.10, -0.18, 1.56), "UpperArm_L"),
        ("UpperArm_R", (-0.76, 0, 3.25), (-1.02, 0, 2.42), "Chest"),
        ("LowerArm_R", (-1.02, 0, 2.42), (-1.10, -0.22, 1.56), "UpperArm_R"),
        ("Thigh_L", (0.36, 0, 1.80), (0.38, 0, 0.92), "Pelvis"),
        ("Shin_L", (0.38, 0, 0.92), (0.40, 0, 0.14), "Thigh_L"),
        ("Thigh_R", (-0.36, 0, 1.80), (-0.38, 0, 0.92), "Pelvis"),
        ("Shin_R", (-0.38, 0, 0.92), (-0.40, 0, 0.14), "Thigh_R"),
    ]

    def chiseled_block(bm, loc, r_bot, r_top, height, segs=8, rot=(0, 0, 0), sx=1.0, sy=0.75):
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r_bot, radius2=r_top, depth=height)
        for v in r["verts"]:
            n = math.sin(v.co.x * 6.0 + loc[2]) * math.cos(v.co.y * 5.0)
            v.co.x = v.co.x * sx * (1.0 + 0.08 * n)
            v.co.y = v.co.y * sy * (1.0 + 0.08 * n)
        m = Matrix.Translation(loc) @ Euler(rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=m, verts=r["verts"])

    def chain_links(bm, start, count, step_v):
        for i in range(count):
            p = Vector(start) + Vector(step_v) * i
            bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=0.075, radius2=0.075, depth=0.14, matrix=Matrix.Translation(p) @ Euler((0, 0.45 * (i % 2), 0), "XYZ").to_matrix().to_4x4())

    parts = [
        ("Warden_Torso", "granite", lambda bm: (
            chiseled_block(bm, (0, 0, 2.00), 0.56, 0.46, 0.68, segs=8, sy=0.72),
            chiseled_block(bm, (0, 0, 2.58), 0.48, 0.72, 0.80, segs=8, sy=0.68),
            chiseled_block(bm, (0, -0.02, 3.16), 0.74, 0.86, 0.66, segs=10, sy=0.64),
            chiseled_block(bm, (0, -0.04, 3.48), 0.36, 0.28, 0.26, segs=8, sy=0.80),
        ), {"Spine": 0.5, "Chest": 0.5}, 0),
        ("Warden_Head", "dark_stone", lambda bm: (
            chiseled_block(bm, (0, -0.10, 3.80), 0.25, 0.27, 0.48, segs=8, sy=0.92),
            chiseled_block(bm, (0, -0.24, 3.90), 0.26, 0.24, 0.12, segs=6, sy=0.55),
            chiseled_block(bm, (0, -0.22, 3.60), 0.19, 0.22, 0.16, segs=6, sy=0.65),
        ), {"Head": 1.0}, 0),
        ("Warden_RuneCracks", "rune", lambda bm: (
            # Recessed glowing chest hearth core & narrow oath rune seams embedded in granite
            bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.15, radius2=0.11, depth=0.06, matrix=Matrix.Translation((0, -0.42, 3.06)) @ Euler((math.pi * 0.5, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, -0.37, 2.74)) @ Matrix.Diagonal((0.04, 0.04, 0.34, 1))),
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0.18, -0.38, 3.06)) @ Euler((0, 0.45, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.035, 0.04, 0.28, 1))),
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((-0.18, -0.38, 3.06)) @ Euler((0, -0.45, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.035, 0.04, 0.28, 1))),
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0.09, -0.31, 3.84)) @ Matrix.Diagonal((0.06, 0.04, 0.025, 1))),
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((-0.09, -0.31, 3.84)) @ Matrix.Diagonal((0.06, 0.04, 0.025, 1))),
        ), {"Chest": 0.7, "Head": 0.3}, 0),
        # Destructible Phase-2 / Phase-3 outer engraved bronze armor plates snugly framing shoulders, chest & crown
        ("ArmorPlate_Chest", "bronze", lambda bm: (
            chiseled_block(bm, (0, -0.20, 3.12), 0.46, 0.62, 0.52, segs=6, sy=0.60),
        ), {"Chest": 1.0}, 0),
        ("ArmorPlate_LeftShoulder", "bronze", lambda bm: (
            chiseled_block(bm, (0.86, 0, 3.30), 0.36, 0.28, 0.34, segs=6, rot=(0, 0.42, 0), sy=0.88),
        ), {"UpperArm_L": 1.0}, 0),
        ("ArmorPlate_RightShoulder", "bronze", lambda bm: (
            chiseled_block(bm, (-0.86, 0, 3.30), 0.36, 0.28, 0.34, segs=6, rot=(0, -0.42, 0), sy=0.88),
        ), {"UpperArm_R": 1.0}, 0),
        ("ArmorPlate_Crown", "bronze", lambda bm: (
            chiseled_block(bm, (0, -0.10, 4.04), 0.30, 0.24, 0.16, segs=6, sy=0.92),
        ), {"Head": 1.0}, 0),
        ("Warden_Chains", "iron", lambda bm: (
            chain_links(bm, (0.94, -0.14, 2.95), 5, (0.04, -0.02, -0.16)),
            chain_links(bm, (-0.94, -0.14, 2.95), 5, (-0.04, -0.02, -0.16)),
        ), {"Chest": 1.0}, 0),
        # Overlapping chiseled granite arms & pillar legs (zero gaps!)
        ("Warden_Arm_L", "granite", lambda bm: (
            chiseled_block(bm, (0.86, 0, 2.86), 0.23, 0.28, 0.88, segs=8, rot=(0, -0.16, 0), sy=0.92),
            chiseled_block(bm, (1.04, -0.10, 2.02), 0.26, 0.23, 0.92, segs=8, rot=(0.18, -0.08, 0), sy=0.92),
            chiseled_block(bm, (1.10, -0.18, 1.54), 0.22, 0.24, 0.28, segs=8, sy=1.0),
        ), {"UpperArm_L": 0.5, "LowerArm_L": 0.5}, 0),
        ("Warden_Arm_R", "granite", lambda bm: (
            chiseled_block(bm, (-0.86, 0, 2.86), 0.23, 0.28, 0.88, segs=8, rot=(0, 0.16, 0), sy=0.92),
            chiseled_block(bm, (-1.04, -0.10, 2.02), 0.26, 0.23, 0.92, segs=8, rot=(0.18, 0.08, 0), sy=0.92),
            chiseled_block(bm, (-1.10, -0.18, 1.54), 0.22, 0.24, 0.28, segs=8, sy=1.0),
        ), {"UpperArm_R": 0.5, "LowerArm_R": 0.5}, 0),
        ("Warden_Leg_L", "granite", lambda bm: (
            chiseled_block(bm, (0.36, 0, 1.38), 0.25, 0.30, 0.94, segs=8, sy=0.96),
            chiseled_block(bm, (0.39, 0, 0.54), 0.28, 0.24, 0.90, segs=8, sy=0.96),
            chiseled_block(bm, (0.40, -0.10, 0.14), 0.30, 0.24, 0.26, segs=8, sy=1.25),
        ), {"Thigh_L": 0.5, "Shin_L": 0.5}, 0),
        ("Warden_Leg_R", "granite", lambda bm: (
            chiseled_block(bm, (-0.36, 0, 1.38), 0.25, 0.30, 0.94, segs=8, sy=0.96),
            chiseled_block(bm, (-0.39, 0, 0.54), 0.28, 0.24, 0.90, segs=8, sy=0.96),
            chiseled_block(bm, (-0.40, -0.10, 0.14), 0.30, 0.24, 0.26, segs=8, sy=1.25),
        ), {"Thigh_R": 0.5, "Shin_R": 0.5}, 0),
        # Giant stone & iron warmaul gripped by right hand
        ("Warden_Warmaul", "iron", lambda bm: (
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.055, radius2=0.065, depth=2.5, matrix=Matrix.Translation((-1.10, -0.78, 1.44)) @ Euler((math.pi * 0.46, 0, 0)).to_matrix().to_4x4()),
            chiseled_block(bm, (-1.10, -1.92, 1.36), 0.32, 0.34, 0.72, segs=8, rot=(math.pi * 0.5, 0, 0), sy=0.92),
        ), {"LowerArm_R": 1.0}, 0),
    ]

    rig, objs = build_organic_rigged_mesh("BOSS_Warden", parts, mats, bones)
    add_procedural_nla_clips(rig, {
        "Idle": [(1, {"Chest": (2, 0, 0), "UpperArm_R": (-14, 0, -10), "UpperArm_L": (-14, 0, 10)}, {"Pelvis": (0, 0, 0)}), (28, {"Chest": (5, 0, 0), "Head": (-4, 0, 0)}, {"Pelvis": (0, -0.04, 0)}), (56, {"Chest": (2, 0, 0), "UpperArm_R": (-14, 0, -10), "UpperArm_L": (-14, 0, 10)}, {"Pelvis": (0, 0, 0)})],
        "Walk": [(1, {"Thigh_L": (22, 0, 0), "Thigh_R": (-18, 0, 0), "Chest": (6, 0, 8)}, {"Pelvis": (0, -0.06, 0)}), (18, {"Thigh_L": (-18, 0, 0), "Thigh_R": (22, 0, 0), "Chest": (6, 0, -8)}, {"Pelvis": (0, 0.04, 0)}), (36, {"Thigh_L": (22, 0, 0), "Thigh_R": (-18, 0, 0), "Chest": (6, 0, 8)}, {"Pelvis": (0, -0.06, 0)})],
        "MaceChain": [(1, {"Chest": (-12, -24, 0), "UpperArm_R": (-110, 0, -24)}, {}), (12, {"Chest": (20, 32, 0), "UpperArm_R": (-28, 18, 36)}, {"Pelvis": (0, -0.14, 0)}), (28, {}, {})],
        "Sweep": [(1, {"Chest": (4, -34, 0), "UpperArm_R": (-78, -28, -42)}, {}), (12, {"Chest": (14, 42, 0), "UpperArm_R": (-54, 24, 56)}, {"Pelvis": (0, -0.12, 0)}), (28, {}, {})],
        "Slam": [(1, {"Chest": (-18, 0, 0), "UpperArm_R": (-145, 0, 0), "UpperArm_L": (-135, 0, 0)}, {"Pelvis": (0, 0.12, 0)}), (14, {"Chest": (32, 0, 0), "UpperArm_R": (-22, 0, 0), "UpperArm_L": (-22, 0, 0)}, {"Pelvis": (0, -0.28, 0)}), (32, {}, {})],
        "Fissure": [(1, {"Chest": (-16, 0, 0), "UpperArm_R": (-140, 0, 0), "UpperArm_L": (-140, 0, 0)}, {}), (14, {"Chest": (36, 0, 0), "UpperArm_R": (-16, 0, 0), "UpperArm_L": (-16, 0, 0)}, {"Pelvis": (0, -0.32, 0)}), (30, {}, {})],
        "Stagger": [(1, {"Chest": (-22, -16, 0), "Head": (-18, 0, 0)}, {"Pelvis": (0, -0.08, 0.12)}), (24, {}, {})],
        "Death": [(1, {}, {}), (16, {"Chest": (28, 0, 0), "Pelvis": (-20, 0, 0)}, {"Pelvis": (0, -0.5, 0)}), (36, {"Pelvis": (-88, 0, 0)}, {"Pelvis": (0, -1.6, 0.35)})],
    })
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "boss_warden.blend"))
    export_rigged_glb(rig, objs, OUT_BOSS / "boss_warden.glb")
    print(f"[BOSS] Mountain Warden -> {(OUT_BOSS / 'boss_warden.glb').stat().st_size // 1024} KB")


HUMANOID_ENEMIES = [
    {"id": "enm_hollow_swordsman", "height": 1.85, "macro": {"gender": 1.0, "age": 0.96, "muscle": 0.35, "weight": 0.12, "proportions": 0.5, "height": 0.78, "cupsize": 0.0, "firmness": 0.4, "race": {"asian": 0.1, "caucasian": 0.85, "african": 0.05}}, "skin_rgb": (132, 138, 142), "metal_tint": (0.48, 0.50, 0.54), "cloth_tex": "poly_wool_herringbone", "cloth_tint": (0.24, 0.26, 0.30), "hair_tint": (0.14, 0.14, 0.16), "iris_rgb": (0.42, 0.74, 0.96)},
    {"id": "enm_hollow_archer", "height": 1.80, "macro": {"gender": 0.8, "age": 0.96, "muscle": 0.28, "weight": 0.10, "proportions": 0.45, "height": 0.70, "cupsize": 0.0, "firmness": 0.4, "race": {"asian": 0.1, "caucasian": 0.85, "african": 0.05}}, "skin_rgb": (128, 134, 138), "metal_tint": (0.44, 0.46, 0.50), "cloth_tex": "poly_wool_herringbone", "cloth_tint": (0.22, 0.28, 0.26), "hair_tint": (0.14, 0.14, 0.16), "iris_rgb": (0.42, 0.74, 0.96)},
    {"id": "enm_hollow_knight", "height": 2.28, "macro": {"gender": 1.0, "age": 0.94, "muscle": 0.88, "weight": 0.48, "proportions": 0.78, "height": 1.0, "cupsize": 0.0, "firmness": 0.7, "race": {"asian": 0.05, "caucasian": 0.90, "african": 0.05}}, "skin_rgb": (118, 124, 132), "metal_tint": (0.34, 0.36, 0.40), "cloth_tex": "castle_wall_slates", "cloth_tint": (0.28, 0.30, 0.36), "hair_tint": (0.10, 0.10, 0.12), "iris_rgb": (0.48, 0.78, 1.0)},
    {"id": "enm_bandit", "height": 1.88, "macro": {"gender": 1.0, "age": 0.68, "muscle": 0.72, "weight": 0.58, "proportions": 0.62, "height": 0.82, "cupsize": 0.0, "firmness": 0.6, "race": {"asian": 0.15, "caucasian": 0.75, "african": 0.10}}, "skin_rgb": (182, 140, 118), "stubble": True, "metal_tint": (0.52, 0.50, 0.48), "cloth_tex": "brown_leather", "cloth_tint": (0.46, 0.34, 0.26), "hair_tint": (0.18, 0.14, 0.12), "hair_style": "villager_short", "beard": True, "iris_rgb": (0.36, 0.28, 0.20)},
]


def render_qa_sheet():
    clear_scene()
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
        bg.inputs["Strength"].default_value = 0.75

    lineup = [
        (OUT_ENM / "enm_frost_wolf.glb", -4.2),
        (OUT_ENM / "enm_hollow_swordsman.glb", -2.7),
        (OUT_ENM / "enm_bandit.glb", -1.3),
        (OUT_ENM / "enm_hollow_knight.glb", 0.1),
        (OUT_ENM / "enm_frost_troll.glb", 1.7),
        (OUT_BOSS / "boss_warden.glb", 3.8),
    ]
    for p, x in lineup:
        if p.exists():
            before = set(bpy.data.objects)
            before_acts = set(bpy.data.actions)
            bpy.ops.import_scene.gltf(filepath=str(p))
            idle_act = next((a for a in bpy.data.actions if a not in before_acts and a.name.lower().startswith("idle")), None)
            for o in bpy.data.objects:
                if o not in before and o.parent is None:
                    o.location.x = x
                    if o.type == "ARMATURE":
                        o.animation_data_create()
                        o.animation_data.action = idle_act
    bpy.context.scene.frame_set(1)

    bpy.ops.mesh.primitive_plane_add(size=32, location=(0, 0, 0))
    bpy.ops.object.light_add(type="SUN", location=(5, -8, 10))
    bpy.context.active_object.data.energy = 3.2
    bpy.context.active_object.rotation_euler = (math.radians(48), 0, math.radians(-20))

    cam_data = bpy.data.cameras.new("EnmCam")
    cam = bpy.data.objects.new("EnmCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -16.8, 2.35)
    cam.rotation_euler = (math.radians(84), 0, 0)
    scene.camera = cam

    out_png = OUT_PREVIEW / "realistic_enemies_boss_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    print(f"[QA ENEMIES/BOSS] {out_png}")


def main():
    for cfg in HUMANOID_ENEMIES:
        build_humanoid_enemy(cfg)
    build_frost_wolf()
    build_frost_troll()
    build_mountain_warden_boss()
    render_qa_sheet()


if __name__ == "__main__":
    main()
