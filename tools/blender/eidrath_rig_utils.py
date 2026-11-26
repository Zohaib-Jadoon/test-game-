"""
EIDRATH: The Last Oath — Shared Realistic Blender 5.3 PBR, MPFB2 & Mocap Rig Utilities
Provides:
  - PolyHaven PBR texture set material builder (512px/1024px cached JPEGs for fast GLB)
  - MPFB2 realistic anatomical human generator + Game Engine 53-bone rig + socket bones
  - Realistic skin/eye/scar UV texture generator (glTF-compliant Principled BSDF)
  - Mixamo (Soldier.glb / Xbot.glb) mocap -> MPFB2 game_engine retargeter
  - Full-body Bezier-interpolated NLA animation library (30+ clips)
"""
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
TEX_DIR = ROOT / "public" / "assets" / "eidrath" / "textures"
TEX_CACHE = ROOT / "_asset_cache" / "tex512"
MOCAP_DIR = ROOT / "_asset_cache" / "mocap_refs"
TEX_CACHE.mkdir(parents=True, exist_ok=True)


def ensure_resized_tex(src: Path, max_dim: int = 512) -> Path:
    """Use native Blender image scaling when resizing is needed; return path."""
    return src


def load_image(path: Path, colorspace: str = "sRGB", max_dim: int = 512):
    img = bpy.data.images.load(str(path), check_existing=True)
    if max(img.size[0], img.size[1]) > max_dim and img.size[0] > 0:
        scale = max_dim / max(img.size[0], img.size[1])
        img.scale(max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale)))
    try:
        img.colorspace_settings.name = colorspace
    except Exception:
        pass
    return img


def make_pbr_mat(
    name: str,
    tex_folder: str | None = None,
    tint=(1.0, 1.0, 1.0),
    metallic: float = 0.0,
    roughness: float = 0.65,
    uv_scale: float = 2.0,
    normal_strength: float = 1.0,
    emit_rgb=None,
    emit_strength: float = 0.0,
    tex_size: int = 256,
):
    """Create a glTF-export-ready Principled BSDF material backed by PolyHaven PBR maps."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emit_rgb and emit_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emit_rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength

    folder = (TEX_DIR / tex_folder) if tex_folder else None
    if folder and folder.exists():
        tex_coord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, uv_scale)
        links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

        diff_p = folder / "diff.jpg"
        if not diff_p.exists():
            diff_p = folder / "diff.png"
        if diff_p.exists():
            tex_diff = nodes.new("ShaderNodeTexImage")
            tex_diff.image = load_image(diff_p, "sRGB", max_dim=tex_size)
            links.new(mapping.outputs["Vector"], tex_diff.inputs["Vector"])
            if tint != (1.0, 1.0, 1.0):
                mix = nodes.new("ShaderNodeMix")
                mix.data_type = "RGBA"
                mix.blend_type = "MULTIPLY"
                mix.inputs["Factor"].default_value = 1.0
                mix.inputs[7].default_value = (*tint, 1.0)
                links.new(tex_diff.outputs["Color"], mix.inputs[6])
                links.new(mix.outputs[2], bsdf.inputs["Base Color"])
            else:
                links.new(tex_diff.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            bsdf.inputs["Base Color"].default_value = (*tint, 1.0)

        nor_p = folder / "nor_gl.jpg"
        if nor_p.exists():
            tex_nor = nodes.new("ShaderNodeTexImage")
            tex_nor.image = load_image(nor_p, "Non-Color", max_dim=tex_size)
            links.new(mapping.outputs["Vector"], tex_nor.inputs["Vector"])
            nmap = nodes.new("ShaderNodeNormalMap")
            nmap.inputs["Strength"].default_value = normal_strength
            links.new(tex_nor.outputs["Color"], nmap.inputs["Color"])
            links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

        rough_p = folder / "rough.jpg"
        if rough_p.exists():
            tex_r = nodes.new("ShaderNodeTexImage")
            tex_r.image = load_image(rough_p, "Non-Color", max_dim=tex_size)
            links.new(mapping.outputs["Vector"], tex_r.inputs["Vector"])
            links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Base Color"].default_value = (*tint, 1.0)

    return mat


def generate_skin_textures(char_id: str, base_rgb=(194, 152, 128), scar=False, stubble=False, weathered=True):
    """Build realistic skin albedo & micro-pore normal map aligned to MPFB/MakeHuman UV using native Blender + numpy."""
    import numpy as np

    out_dir = TEX_CACHE / "skins"
    out_dir.mkdir(parents=True, exist_ok=True)
    diff_path = out_dir / f"{char_id}_skin_diff.jpg"
    nor_path = out_dir / f"{char_id}_skin_nor.jpg"

    rng = np.random.default_rng(abs(hash(char_id)) % (2**31))
    sz = 384
    arr = np.zeros((sz, sz, 3), dtype=np.float32)
    arr[:, :] = np.array(base_rgb, dtype=np.float32) / 255.0

    # Blend MakeHuman's bundled face texture details if present
    from bl_ext.user_default.mpfb.services import locationservice
    mpfb_tex = Path(locationservice.LocationService.get_mpfb_data("textures"))
    face_src = mpfb_tex / "mpfb_face.jpg"
    if face_src.exists():
        fimg = bpy.data.images.load(str(face_src), check_existing=False)
        fimg.scale(sz, sz)
        fpx = np.array(fimg.pixels[:], dtype=np.float32).reshape((sz, sz, 4))[:, :, :3]
        lum = fpx.mean(axis=2, keepdims=True)
        arr = arr * (0.78 + 0.34 * lum)
        bpy.data.images.remove(fimg)

    pore = rng.normal(0.0, 0.018 if weathered else 0.011, (sz, sz, 1)).astype(np.float32)
    arr = np.clip(arr + pore, 0.02, 0.98)

    if scar:
        # Visible battle scar across upper face UV zone (Blender Y-up: y ~ 0.68..0.82)
        for t in np.linspace(0.0, 1.0, 60):
            cx = int(280 + t * 28)
            cy = int(382 - t * 38)
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    if 0 <= cx + dx < sz and 0 <= cy + dy < sz:
                        arr[cy + dy, cx + dx] = [0.55, 0.28, 0.26] if abs(dx) < 2 else [0.84, 0.68, 0.62]
    if stubble:
        yy, xx = np.ogrid[:sz, :sz]
        jaw_mask = (((xx - 256) / 48.0) ** 2 + ((yy - 325) / 36.0) ** 2) <= 1.0
        arr[jaw_mask] *= 0.84

    rgba_diff = np.ones((sz, sz, 4), dtype=np.float32)
    rgba_diff[:, :, :3] = arr
    img_d = bpy.data.images.new(f"{char_id}_skin_diff", sz, sz, alpha=False)
    img_d.pixels.foreach_set(rgba_diff.ravel())
    img_d.filepath_raw = str(diff_path)
    img_d.file_format = "JPEG"
    img_d.save()

    hfield = rng.normal(0.0, 1.0, (sz, sz)).astype(np.float32)
    dx = np.roll(hfield, -1, axis=1) - np.roll(hfield, 1, axis=1)
    dy = np.roll(hfield, -1, axis=0) - np.roll(hfield, 1, axis=0)
    rgba_nor = np.ones((sz, sz, 4), dtype=np.float32)
    rgba_nor[:, :, 0] = np.clip(0.5 + dx * 0.05, 0.35, 0.65)
    rgba_nor[:, :, 1] = np.clip(0.5 + dy * 0.05, 0.35, 0.65)
    rgba_nor[:, :, 2] = 0.98
    img_n = bpy.data.images.new(f"{char_id}_skin_nor", sz, sz, alpha=False)
    img_n.colorspace_settings.name = "Non-Color"
    img_n.pixels.foreach_set(rgba_nor.ravel())
    img_n.filepath_raw = str(nor_path)
    img_n.file_format = "JPEG"
    img_n.save()
    return diff_path, nor_path


def make_skin_mat(char_id: str, base_rgb=(194, 152, 128), scar=False, stubble=False, roughness=0.56):
    diff_p, nor_p = generate_skin_textures(char_id, base_rgb=base_rgb, scar=scar, stubble=stubble)
    mat = bpy.data.materials.new(name=f"MAT_Skin_{char_id}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.12

    td = nt.nodes.new("ShaderNodeTexImage")
    td.image = load_image(diff_p, "sRGB")
    nt.links.new(td.outputs["Color"], bsdf.inputs["Base Color"])

    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = load_image(nor_p, "Non-Color")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.45
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_realistic_mpfb_human(
    char_id: str,
    target_height_m: float,
    macro_detail: dict,
    skin_rgb=(194, 152, 128),
    scar=False,
    stubble=False,
    extra_targets: dict | None = None,
):
    """Create a grounded MPFB2 anatomical human with 53-bone game_engine rig + socket bones."""
    from bl_ext.user_default.mpfb.services import humanservice, targetservice

    human = humanservice.HumanService.create_human(
        mask_helpers=False,
        detailed_helpers=True,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro_detail,
    )
    human.name = f"{char_id}_Body"

    if extra_targets:
        for tname, tval in extra_targets.items():
            try:
                targetservice.TargetService.set_target_value(human, tname, tval)
            except Exception:
                pass

    rig = humanservice.HumanService.add_builtin_rig(human, "game_engine", import_weights=True)
    rig.name = f"{char_id}_Armature"

    targetservice.TargetService.bake_targets(human)

    # Measure exact anatomical eye & jaw centers BEFORE removing helper vertex groups
    def avg_vg(vg_name):
        g = human.vertex_groups.get(vg_name)
        if not g:
            return None
        pts = [human.matrix_world @ v.co for v in human.data.vertices if any(x.group == g.index and x.weight > 0.5 for x in v.groups)]
        return (sum(pts, Vector()) / len(pts)) if pts else None

    raw_eye_l = avg_vg("helper-l-eye") or avg_vg("joint-l-eye")
    raw_eye_r = avg_vg("helper-r-eye") or avg_vg("joint-r-eye")
    raw_jaw = avg_vg("joint-jaw")

    # Cleanly delete HelperGeometry & JointCubes in Edit mode so vertex weights & UVs remain intact
    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    for vg_name in ("HelperGeometry", "JointCubes"):
        vg = human.vertex_groups.get(vg_name)
        if vg is not None:
            human.vertex_groups.active_index = vg.index
            bpy.ops.object.vertex_group_select()
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Measure raw height & ground offset from clean body mesh
    zs = [(human.matrix_world @ v.co).z for v in human.data.vertices]
    raw_min_z = min(zs)
    cur_h = max(0.1, max(zs) - raw_min_z)
    scale_f = target_height_m / cur_h

    # Scale mesh vertices & armature bones directly in object/edit space so origin stays at (0,0,0) and bones match!
    for v in human.data.vertices:
        v.co.x *= scale_f
        v.co.y *= scale_f
        v.co.z = (v.co.z - raw_min_z) * scale_f
    human.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    for b in eb:
        b.head = Vector((b.head.x * scale_f, b.head.y * scale_f, (b.head.z - raw_min_z) * scale_f))
        b.tail = Vector((b.tail.x * scale_f, b.tail.y * scale_f, (b.tail.z - raw_min_z) * scale_f))

    spine3 = eb.get("spine_03")
    if spine3:
        bw = eb.new("back_weapon")
        bw.head = spine3.head + Vector((0.08, 0.22, 0.10))
        bw.tail = bw.head + Vector((0.04, 0.08, 0.14))
        bw.parent = spine3

        c1 = eb.new("Cloak_1")
        c1.head = spine3.tail + Vector((0.0, 0.12, -0.02))
        c1.tail = c1.head + Vector((0.0, 0.05, -0.34))
        c1.parent = spine3

        c2 = eb.new("Cloak_2")
        c2.head = c1.tail
        c2.tail = c2.head + Vector((0.0, 0.04, -0.36))
        c2.parent = c1

        c3 = eb.new("Cloak_3")
        c3.head = c2.tail
        c3.tail = c3.head + Vector((0.0, 0.03, -0.34))
        c3.parent = c2
    bpy.ops.object.mode_set(mode="OBJECT")

    def xform_pt(pt, fallback):
        if pt is None:
            return Vector(fallback)
        return Vector((pt.x * scale_f, pt.y * scale_f, (pt.z - raw_min_z) * scale_f))

    landmarks = {
        "eye_l": xform_pt(raw_eye_l, (0.032, -0.11, target_height_m * 0.925)),
        "eye_r": xform_pt(raw_eye_r, (-0.032, -0.11, target_height_m * 0.925)),
        "jaw": xform_pt(raw_jaw, (0.0, -0.12, target_height_m * 0.86)),
    }
    rig["eidrath_landmarks_eye_l"] = tuple(landmarks["eye_l"])
    rig["eidrath_landmarks_eye_r"] = tuple(landmarks["eye_r"])
    rig["eidrath_landmarks_jaw"] = tuple(landmarks["jaw"])

    # Assign realistic skin material
    skin_mat = make_skin_mat(char_id, base_rgb=skin_rgb, scar=scar, stubble=stubble)
    human.data.materials.clear()
    human.data.materials.append(skin_mat)

    bpy.ops.object.select_all(action="DESELECT")
    human.select_set(True)
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.shade_smooth()
    human.select_set(False)
    return rig, human


def attach_mesh_to_rig(mesh_obj, rig, bone_weights: dict[str, float] | None = None, transfer_from=None):
    """Bind armor/clothing/hair mesh to rig via weight transfer or rigid bone parenting."""
    mesh_obj.parent = rig
    mesh_obj.matrix_parent_inverse = rig.matrix_world.inverted()
    if transfer_from is not None:
        dt = mesh_obj.modifiers.new("DataTransfer", "DATA_TRANSFER")
        dt.object = transfer_from
        dt.use_vert_data = True
        dt.data_types_verts = {"VGROUP_WEIGHTS"}
        dt.vert_mapping = "POLYINTERP_NEAREST"
        bpy.ops.object.select_all(action="DESELECT")
        mesh_obj.select_set(True)
        bpy.context.view_layer.objects.active = mesh_obj
        bpy.ops.object.datalayout_transfer(modifier=dt.name)
        bpy.ops.object.modifier_apply(modifier=dt.name)
    elif bone_weights:
        for bn, w in bone_weights.items():
            vg = mesh_obj.vertex_groups.get(bn) or mesh_obj.vertex_groups.new(name=bn)
            vg.add(list(range(len(mesh_obj.data.vertices))), w, "REPLACE")

    arm_mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = rig
    arm_mod.use_vertex_groups = True


# ---------------------------------------------------------------------------
# Mixamo -> MPFB2 game_engine Mocap Retargeter & Full-Body Animation Library
# ---------------------------------------------------------------------------
MIXAMO_TO_MPFB = {
    "mixamorig:Hips": "pelvis",
    "mixamorig:Spine": "spine_01",
    "mixamorig:Spine1": "spine_02",
    "mixamorig:Spine2": "spine_03",
    "mixamorig:Neck": "neck_01",
    "mixamorig:Head": "head",
    "mixamorig:LeftShoulder": "clavicle_l",
    "mixamorig:LeftArm": "upperarm_l",
    "mixamorig:LeftForeArm": "lowerarm_l",
    "mixamorig:LeftHand": "hand_l",
    "mixamorig:RightShoulder": "clavicle_r",
    "mixamorig:RightArm": "upperarm_r",
    "mixamorig:RightForeArm": "lowerarm_r",
    "mixamorig:RightHand": "hand_r",
    "mixamorig:LeftUpLeg": "thigh_l",
    "mixamorig:LeftLeg": "calf_l",
    "mixamorig:LeftFoot": "foot_l",
    "mixamorig:LeftToeBase": "ball_l",
    "mixamorig:RightUpLeg": "thigh_r",
    "mixamorig:RightLeg": "calf_r",
    "mixamorig:RightFoot": "foot_r",
    "mixamorig:RightToeBase": "ball_r",
}


def retarget_mixamo_action(target_rig, src_glb: Path, src_action_name: str, out_clip_name: str, step: int = 2, max_frames: int = 90):
    """Import MIT Mixamo reference GLB temporarily and retarget its action onto target_rig."""
    if not src_glb.exists():
        return None
    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(src_glb))
    new_objs = [o for o in bpy.data.objects if o not in before_objs]
    src_arm = next((o for o in new_objs if o.type == "ARMATURE"), None)
    src_act = next((a for a in bpy.data.actions if a not in before_acts and a.name.lower() == src_action_name.lower()), None)
    if not src_arm or not src_act:
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        return None

    # Rotate Mixamo armature 180 deg around Z so both face -Y in world space
    src_arm.rotation_euler = (0.0, 0.0, math.pi)
    bpy.context.view_layer.update()

    # Precompute aligned world rest bone orientations for source & target
    src_rest_w = {b.name: (src_arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3()).to_quaternion() for b in src_arm.data.bones}
    tgt_rest_w = {b.name: (target_rig.matrix_world.to_3x3() @ b.matrix_local.to_3x3()).to_quaternion() for b in target_rig.data.bones}
    tgt_rest_dir = {b.name: (target_rig.matrix_world.to_3x3() @ (b.tail_local - b.head_local)).normalized() for b in target_rig.data.bones}
    src_rest_dir = {b.name: (src_arm.matrix_world.to_3x3() @ (b.tail_local - b.head_local)).normalized() for b in src_arm.data.bones}

    src_arm.animation_data_create()
    src_arm.animation_data.action = src_act
    f0 = int(round(src_act.frame_range[0]))
    f1 = min(int(round(src_act.frame_range[1])), f0 + max_frames)

    target_rig.animation_data_create()
    out_act = bpy.data.actions.new(name=out_clip_name)
    target_rig.animation_data.action = out_act
    tpose = target_rig.pose.bones
    for pb in tpose:
        pb.rotation_mode = "QUATERNION"

    # Compute source hip rest height for vertical delta scaling
    src_hips = src_arm.data.bones.get("mixamorig:Hips")
    tgt_pelvis = target_rig.data.bones.get("pelvis")
    src_hip_z = (src_arm.matrix_world @ src_hips.head_local).z if src_hips else 1.0
    tgt_hip_z = (target_rig.matrix_world @ tgt_pelvis.head_local).z if tgt_pelvis else 1.0
    hip_scale = tgt_hip_z / max(0.2, src_hip_z)

    def chain_dir(arm_obj, bone_name, child_map):
        b = arm_obj.data.bones.get(bone_name)
        ch_name = child_map.get(bone_name)
        ch = arm_obj.data.bones.get(ch_name) if ch_name else None
        if b and ch:
            v = arm_obj.matrix_world.to_3x3() @ (ch.head_local - b.head_local)
            if v.length > 1e-4:
                return v.normalized()
        return None

    src_child = {
        "mixamorig:LeftArm": "mixamorig:LeftForeArm",
        "mixamorig:LeftForeArm": "mixamorig:LeftHand",
        "mixamorig:RightArm": "mixamorig:RightForeArm",
        "mixamorig:RightForeArm": "mixamorig:RightHand",
    }
    tgt_child = {
        "upperarm_l": "lowerarm_l",
        "lowerarm_l": "hand_l",
        "upperarm_r": "lowerarm_r",
        "lowerarm_r": "hand_r",
    }
    tpose_align = {}
    for s_n, t_n in (("mixamorig:LeftArm", "upperarm_l"), ("mixamorig:LeftForeArm", "lowerarm_l"), ("mixamorig:RightArm", "upperarm_r"), ("mixamorig:RightForeArm", "lowerarm_r")):
        sd = chain_dir(src_arm, s_n, src_child)
        td = chain_dir(target_rig, t_n, tgt_child)
        if sd and td:
            tpose_align[t_n] = td.rotation_difference(sd)

    out_frame = 1
    keyed_bones = set(MIXAMO_TO_MPFB.values()) | {"Cloak_1", "Cloak_2", "Cloak_3"}
    for fr in range(f0, f1 + 1, step):
        bpy.context.scene.frame_set(fr)
        bpy.context.view_layer.update()

        for pb in tpose:
            pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
            pb.location = (0, 0, 0)

        # Solve hierarchy top-down so parent pose matrices are current
        for s_name, t_name in MIXAMO_TO_MPFB.items():
            spb = src_arm.pose.bones.get(s_name)
            tpb = tpose.get(t_name)
            if not spb or not tpb:
                continue
            s_pose_w = (src_arm.matrix_world.to_3x3() @ spb.matrix.to_3x3()).to_quaternion()
            delta_w = s_pose_w @ src_rest_w[s_name].inverted()
            # Compensate T-pose (Xbot) -> A-pose (MPFB2) rest angle on upper/lower arms!
            align_q = tpose_align.get(t_name)
            desired_w = (delta_w @ align_q @ tgt_rest_w[t_name]) if align_q else (delta_w @ tgt_rest_w[t_name])

            if tpb.parent:
                p_world = (target_rig.matrix_world.to_3x3() @ tpb.parent.matrix.to_3x3()).to_quaternion()
                rest_rel = tpb.bone.parent.matrix_local.to_3x3().inverted() @ tpb.bone.matrix_local.to_3x3()
                local_q = (p_world @ rest_rel.to_quaternion()).inverted() @ desired_w
            else:
                local_q = (target_rig.matrix_world.to_3x3().to_quaternion() @ tpb.bone.matrix_local.to_3x3().to_quaternion()).inverted() @ desired_w
            tpb.rotation_quaternion = local_q
            bpy.context.view_layer.update()

            if t_name == "pelvis" and src_hips and tgt_pelvis:
                cur_hip_z = (src_arm.matrix_world @ spb.head).z
                dz = (cur_hip_z - src_hip_z) * hip_scale * 0.85
                tpb.location = (0.0, dz, 0.0)

        # Subtle secondary motion on Cloak_1..3
        for idx, cname in enumerate(("Cloak_1", "Cloak_2", "Cloak_3")):
            cpb = tpose.get(cname)
            if cpb:
                phase = (fr - f0) * 0.25 + idx * 0.6
                cpb.rotation_quaternion = Euler((math.radians(4 + 4 * math.sin(phase)), 0, math.radians(2 * math.cos(phase))), "XYZ").to_quaternion()

        for pb in tpose:
            if pb.name in keyed_bones:
                pb.keyframe_insert(data_path="rotation_quaternion", frame=out_frame)
            if pb.name == "pelvis":
                pb.keyframe_insert(data_path="location", frame=out_frame)
        out_frame += step

    # Clean up temporary imported Mixamo objects & actions
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a not in before_acts and a != out_act:
            bpy.data.actions.remove(a)

    track = target_rig.animation_data.nla_tracks.new()
    track.name = out_clip_name
    strip = track.strips.new(out_clip_name, 1, out_act)
    strip.name = out_clip_name
    target_rig.animation_data.action = None
    return out_act


def add_procedural_nla_clips(rig, clip_specs: dict):
    """Author smooth spline-interpolated full-body NLA actions on MPFB game_engine rig."""
    rig.animation_data_create()
    pose = rig.pose.bones
    for pb in pose:
        pb.rotation_mode = "QUATERNION"

    for clip_name, frames in clip_specs.items():
        # Skip if mocap already populated this clip
        if any(t.name == clip_name for t in rig.animation_data.nla_tracks):
            continue
        act = bpy.data.actions.new(name=clip_name)
        rig.animation_data.action = act
        for frame, rots_deg, locs in frames:
            for pb in pose:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
            for bn, degs in rots_deg.items():
                if bn in pose:
                    pose[bn].rotation_quaternion = Euler(tuple(math.radians(a) for a in degs), "XYZ").to_quaternion()
            for bn, loc in locs.items():
                if bn in pose:
                    pose[bn].location = loc
            for pb in pose:
                pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
                if pb.name in locs or pb.name == "pelvis":
                    pb.keyframe_insert(data_path="location", frame=frame)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, act)
        strip.name = clip_name
        rig.animation_data.action = None

    for pb in pose:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))


def hero_clip_library():
    """Full combat, traversal, and interaction NLA keyframes for MPFB game_engine rig."""
    return {
        "WalkBack": [
            (1, {"thigh_r": (-18, 0, 0), "thigh_l": (16, 0, 0), "calf_r": (14, 0, 0), "calf_l": (22, 0, 0), "spine_02": (4, 0, 0), "upperarm_r": (14, 0, -4), "upperarm_l": (-14, 0, 4)}, {"pelvis": (0, -0.02, 0)}),
            (13, {"thigh_r": (16, 0, 0), "thigh_l": (-18, 0, 0), "calf_r": (22, 0, 0), "calf_l": (14, 0, 0), "spine_02": (4, 0, 0), "upperarm_r": (-14, 0, -4), "upperarm_l": (14, 0, 4)}, {"pelvis": (0, 0.01, 0)}),
            (25, {"thigh_r": (-18, 0, 0), "thigh_l": (16, 0, 0), "calf_r": (14, 0, 0), "calf_l": (22, 0, 0), "spine_02": (4, 0, 0), "upperarm_r": (14, 0, -4), "upperarm_l": (-14, 0, 4)}, {"pelvis": (0, -0.02, 0)}),
        ],
        "StrafeLeft": [
            (1, {"spine_02": (5, 0, -8), "thigh_r": (10, 0, 14), "thigh_l": (12, 0, -18), "calf_r": (18, 0, 0), "calf_l": (24, 0, 0), "upperarm_r": (-24, 0, -16), "upperarm_l": (-22, 0, 18)}, {"pelvis": (0, -0.04, 0)}),
            (12, {"spine_02": (5, 0, 4), "thigh_r": (8, 0, -4), "thigh_l": (8, 0, 6), "calf_r": (14, 0, 0), "calf_l": (16, 0, 0), "upperarm_r": (-20, 0, -12), "upperarm_l": (-20, 0, 14)}, {"pelvis": (0, 0.0, 0)}),
            (24, {"spine_02": (5, 0, -8), "thigh_r": (10, 0, 14), "thigh_l": (12, 0, -18), "calf_r": (18, 0, 0), "calf_l": (24, 0, 0), "upperarm_r": (-24, 0, -16), "upperarm_l": (-22, 0, 18)}, {"pelvis": (0, -0.04, 0)}),
        ],
        "StrafeRight": [
            (1, {"spine_02": (5, 0, 8), "thigh_r": (12, 0, 18), "thigh_l": (10, 0, -14), "calf_r": (24, 0, 0), "calf_l": (18, 0, 0), "upperarm_r": (-22, 0, -18), "upperarm_l": (-24, 0, 16)}, {"pelvis": (0, -0.04, 0)}),
            (12, {"spine_02": (5, 0, -4), "thigh_r": (8, 0, -6), "thigh_l": (8, 0, 4), "calf_r": (16, 0, 0), "calf_l": (14, 0, 0), "upperarm_r": (-20, 0, -14), "upperarm_l": (-20, 0, 12)}, {"pelvis": (0, 0.0, 0)}),
            (24, {"spine_02": (5, 0, 8), "thigh_r": (12, 0, 18), "thigh_l": (10, 0, -14), "calf_r": (24, 0, 0), "calf_l": (18, 0, 0), "upperarm_r": (-22, 0, -18), "upperarm_l": (-24, 0, 16)}, {"pelvis": (0, -0.04, 0)}),
        ],
        "Sprint": [
            (1, {"spine_01": (12, 0, 0), "spine_02": (16, 0, 8), "thigh_r": (48, 0, 0), "thigh_l": (-42, 0, 0), "calf_r": (16, 0, 0), "calf_l": (64, 0, 0), "upperarm_r": (-44, 0, -10), "lowerarm_r": (-70, 0, 0), "upperarm_l": (42, 0, 10), "lowerarm_l": (-65, 0, 0), "Cloak_1": (26, 0, 0), "Cloak_2": (18, 0, 0)}, {"pelvis": (0, -0.05, 0)}),
            (8, {"spine_01": (12, 0, 0), "spine_02": (16, 0, -8), "thigh_r": (-42, 0, 0), "thigh_l": (48, 0, 0), "calf_r": (64, 0, 0), "calf_l": (16, 0, 0), "upperarm_r": (42, 0, -10), "lowerarm_r": (-65, 0, 0), "upperarm_l": (-44, 0, 10), "lowerarm_l": (-70, 0, 0), "Cloak_1": (32, 0, 0), "Cloak_2": (22, 0, 0)}, {"pelvis": (0, 0.04, 0)}),
            (15, {"spine_01": (12, 0, 0), "spine_02": (16, 0, 8), "thigh_r": (48, 0, 0), "thigh_l": (-42, 0, 0), "calf_r": (16, 0, 0), "calf_l": (64, 0, 0), "upperarm_r": (-44, 0, -10), "lowerarm_r": (-70, 0, 0), "upperarm_l": (42, 0, 10), "lowerarm_l": (-65, 0, 0), "Cloak_1": (26, 0, 0), "Cloak_2": (18, 0, 0)}, {"pelvis": (0, -0.05, 0)}),
        ],
        "CrouchWalk": [
            (1, {"spine_01": (18, 0, 0), "spine_02": (14, 0, 4), "thigh_r": (56, 0, 0), "thigh_l": (20, 0, 0), "calf_r": (58, 0, 0), "calf_l": (72, 0, 0), "upperarm_r": (-26, 0, -14), "lowerarm_r": (-48, 0, 0), "upperarm_l": (-18, 0, 16), "lowerarm_l": (-54, 0, 0)}, {"pelvis": (0, -0.28, 0)}),
            (14, {"spine_01": (18, 0, 0), "spine_02": (14, 0, -4), "thigh_r": (20, 0, 0), "thigh_l": (56, 0, 0), "calf_r": (72, 0, 0), "calf_l": (58, 0, 0), "upperarm_r": (-18, 0, -14), "lowerarm_r": (-54, 0, 0), "upperarm_l": (-26, 0, 16), "lowerarm_l": (-48, 0, 0)}, {"pelvis": (0, -0.25, 0)}),
            (28, {"spine_01": (18, 0, 0), "spine_02": (14, 0, 4), "thigh_r": (56, 0, 0), "thigh_l": (20, 0, 0), "calf_r": (58, 0, 0), "calf_l": (72, 0, 0), "upperarm_r": (-26, 0, -14), "lowerarm_r": (-48, 0, 0), "upperarm_l": (-18, 0, 16), "lowerarm_l": (-54, 0, 0)}, {"pelvis": (0, -0.28, 0)}),
        ],
        "Jump": [
            (1, {"spine_01": (10, 0, 0), "thigh_r": (38, 0, 0), "thigh_l": (38, 0, 0), "calf_r": (48, 0, 0), "calf_l": (48, 0, 0)}, {"pelvis": (0, -0.14, 0)}),
            (8, {"spine_02": (-8, 0, 0), "thigh_r": (22, 0, 0), "thigh_l": (-16, 0, 0), "calf_r": (42, 0, 0), "calf_l": (18, 0, 0), "upperarm_r": (-52, 0, -24), "upperarm_l": (-48, 0, 24), "Cloak_1": (24, 0, 0)}, {"pelvis": (0, 0.08, 0)}),
            (18, {"spine_02": (-4, 0, 0), "thigh_r": (26, 0, 0), "thigh_l": (12, 0, 0), "calf_r": (36, 0, 0), "calf_l": (26, 0, 0), "upperarm_r": (-38, 0, -28), "upperarm_l": (-34, 0, 28)}, {"pelvis": (0, 0.04, 0)}),
        ],
        "Fall": [
            (1, {"spine_02": (6, 0, 0), "thigh_r": (28, 0, 0), "thigh_l": (14, 0, 0), "calf_r": (44, 0, 0), "calf_l": (28, 0, 0), "upperarm_r": (-45, 0, -34), "upperarm_l": (-45, 0, 34), "Cloak_1": (38, 0, 0)}, {"pelvis": (0, 0.02, 0)}),
            (16, {"spine_02": (8, 0, 0), "thigh_r": (24, 0, 0), "thigh_l": (18, 0, 0), "calf_r": (38, 0, 0), "calf_l": (32, 0, 0), "upperarm_r": (-52, 0, -38), "upperarm_l": (-52, 0, 38), "Cloak_1": (44, 0, 0)}, {"pelvis": (0, 0.02, 0)}),
        ],
        "Land": [
            (1, {"spine_01": (18, 0, 0), "thigh_r": (58, 0, 0), "thigh_l": (54, 0, 0), "calf_r": (74, 0, 0), "calf_l": (70, 0, 0), "upperarm_r": (-20, 0, -20), "upperarm_l": (-20, 0, 20)}, {"pelvis": (0, -0.28, 0)}),
            (12, {}, {"pelvis": (0, 0, 0)}),
        ],
        "TurnLeft": [
            (1, {"spine_02": (0, -14, 0), "head": (0, -18, 0), "thigh_l": (14, 0, -10), "calf_l": (18, 0, 0)}, {"pelvis": (0, -0.02, 0)}),
            (14, {}, {"pelvis": (0, 0, 0)}),
        ],
        "TurnRight": [
            (1, {"spine_02": (0, 14, 0), "head": (0, 18, 0), "thigh_r": (14, 0, 10), "calf_r": (18, 0, 0)}, {"pelvis": (0, -0.02, 0)}),
            (14, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Dodge": [
            (1, {"spine_01": (18, 0, 0), "spine_02": (16, 0, 0), "thigh_r": (38, 0, 0), "thigh_l": (-22, 0, 0), "calf_r": (48, 0, 0), "calf_l": (26, 0, 0), "upperarm_r": (-36, 0, -24), "upperarm_l": (-36, 0, 24)}, {"pelvis": (0, -0.22, 0)}),
            (9, {"spine_01": (34, -18, 0), "spine_02": (30, -22, 0), "thigh_r": (56, 0, 0), "thigh_l": (-36, 0, 0), "calf_r": (68, 0, 0), "calf_l": (44, 0, 0), "upperarm_r": (-52, 0, -34), "upperarm_l": (28, 0, 28), "Cloak_1": (44, 0, 0), "Cloak_2": (28, 0, 0)}, {"pelvis": (0, -0.34, -0.06)}),
            (18, {"spine_01": (26, 14, 0), "spine_02": (22, 16, 0), "thigh_r": (-26, 0, 0), "thigh_l": (48, 0, 0), "calf_r": (36, 0, 0), "calf_l": (62, 0, 0), "Cloak_1": (32, 0, 0)}, {"pelvis": (0, -0.24, 0)}),
            (28, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Backstep": [
            (1, {"spine_01": (12, 0, 0), "thigh_r": (24, 0, 0), "thigh_l": (-22, 0, 0), "calf_r": (28, 0, 0), "calf_l": (18, 0, 0)}, {"pelvis": (0, -0.12, 0)}),
            (10, {"spine_01": (-8, 0, 0), "thigh_r": (-26, 0, 0), "thigh_l": (30, 0, 0), "upperarm_r": (-32, 0, -18), "upperarm_l": (-32, 0, 18)}, {"pelvis": (0, 0.04, 0)}),
            (18, {}, {"pelvis": (0, 0, 0)}),
        ],
        "DrawSword": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (6, {"spine_02": (4, -18, 0), "clavicle_r": (0, 0, 18), "upperarm_r": (-128, -14, -22), "lowerarm_r": (-64, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (14, {"spine_02": (4, 8, 0), "upperarm_r": (-36, 0, -18), "lowerarm_r": (-34, 0, 0)}, {"pelvis": (0, -0.03, 0)}),
            (20, {}, {"pelvis": (0, 0, 0)}),
        ],
        "SheatheSword": [
            (1, {"upperarm_r": (-34, 0, -18), "lowerarm_r": (-34, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (10, {"spine_02": (4, -18, 0), "upperarm_r": (-126, -12, -20), "lowerarm_r": (-60, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (18, {}, {"pelvis": (0, 0, 0)}),
        ],
        "LightAttack": [
            (1, {"spine_01": (6, -18, 0), "spine_02": (8, -22, 0), "upperarm_r": (-58, -12, -38), "lowerarm_r": (-44, 0, 0), "thigh_r": (-14, 0, 0), "thigh_l": (22, 0, 0)}, {"pelvis": (0, -0.05, 0)}),
            (7, {"spine_01": (12, 24, 0), "spine_02": (16, 36, 0), "clavicle_r": (0, 20, 0), "upperarm_r": (-46, 26, 48), "lowerarm_r": (-16, 0, 0), "upperarm_l": (18, 0, 24), "thigh_r": (24, 0, 0), "thigh_l": (-20, 0, 0), "Cloak_1": (22, -16, 0)}, {"pelvis": (0, -0.09, -0.05)}),
            (16, {"spine_02": (6, 8, 0), "upperarm_r": (-22, 0, -12), "lowerarm_r": (-24, 0, 0)}, {"pelvis": (0, -0.02, 0)}),
            (22, {}, {"pelvis": (0, 0, 0)}),
        ],
        "LightAttack2": [
            (1, {"spine_01": (8, 22, 0), "spine_02": (10, 28, 0), "upperarm_r": (-42, 24, 44), "lowerarm_r": (-32, 0, 0)}, {"pelvis": (0, -0.05, 0)}),
            (7, {"spine_01": (12, -24, 0), "spine_02": (16, -34, 0), "upperarm_r": (-52, -20, -44), "lowerarm_r": (-14, 0, 0), "upperarm_l": (18, 0, 22), "Cloak_1": (24, 16, 0)}, {"pelvis": (0, -0.09, -0.05)}),
            (18, {}, {"pelvis": (0, 0, 0)}),
        ],
        "LightAttack3": [
            (1, {"spine_01": (-10, -24, 0), "spine_02": (-10, -20, 0), "upperarm_r": (-118, 0, -18), "lowerarm_r": (-36, 0, 0), "thigh_l": (28, 0, 0), "calf_l": (28, 0, 0)}, {"pelvis": (0, 0.04, 0.04)}),
            (8, {"spine_01": (22, 28, 0), "spine_02": (24, 34, 0), "upperarm_r": (-28, 12, 34), "lowerarm_r": (-10, 0, 0), "thigh_r": (36, 0, 0), "calf_r": (34, 0, 0), "Cloak_1": (36, 0, 0)}, {"pelvis": (0, -0.16, -0.10)}),
            (22, {}, {"pelvis": (0, 0, 0)}),
        ],
        "HeavyAttack": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (10, {"spine_01": (-14, -22, 0), "spine_02": (-16, -24, 0), "upperarm_r": (-138, 0, -20), "upperarm_l": (-116, 0, 20), "lowerarm_r": (-34, 0, 0), "lowerarm_l": (-34, 0, 0), "thigh_l": (20, 0, 0)}, {"pelvis": (0, 0.06, 0.05)}),
            (17, {"spine_01": (26, 26, 0), "spine_02": (28, 28, 0), "upperarm_r": (-22, 16, 28), "upperarm_l": (-22, -14, -18), "thigh_r": (38, 0, 0), "calf_r": (40, 0, 0), "Cloak_1": (42, 0, 0)}, {"pelvis": (0, -0.18, -0.10)}),
            (30, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Block": [
            (1, {"spine_01": (8, -10, 0), "spine_02": (8, -8, 0), "upperarm_r": (-52, 12, 22), "lowerarm_r": (-68, 0, 0), "upperarm_l": (-58, -16, -18), "lowerarm_l": (-76, 0, 0), "thigh_r": (-16, 0, 0), "thigh_l": (22, 0, 0), "calf_l": (22, 0, 0)}, {"pelvis": (0, -0.07, 0)}),
            (24, {"spine_01": (9, -10, 0), "spine_02": (9, -8, 0), "upperarm_r": (-54, 12, 22), "lowerarm_r": (-70, 0, 0), "upperarm_l": (-60, -16, -18), "lowerarm_l": (-78, 0, 0), "thigh_r": (-16, 0, 0), "thigh_l": (22, 0, 0), "calf_l": (22, 0, 0)}, {"pelvis": (0, -0.08, 0)}),
        ],
        "Parry": [
            (1, {"spine_02": (8, 12, 0), "upperarm_l": (-56, -16, -14), "lowerarm_l": (-74, 0, 0)}, {"pelvis": (0, -0.06, 0)}),
            (6, {"spine_02": (-6, -24, 0), "upperarm_l": (-72, 20, 44), "lowerarm_l": (-34, 0, 0), "upperarm_r": (-44, 0, -24)}, {"pelvis": (0, 0.02, 0)}),
            (16, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Stagger": [
            (1, {"spine_01": (-16, -10, 0), "spine_02": (-18, -14, 0), "head": (-14, 0, 0), "upperarm_r": (-28, 0, -32), "upperarm_l": (-28, 0, 32)}, {"pelvis": (0, -0.05, 0.08)}),
            (12, {"spine_01": (-8, 0, 0), "spine_02": (-8, 0, 0)}, {"pelvis": (0, -0.03, 0.04)}),
            (22, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Knockdown": [
            (1, {"spine_01": (-24, 0, 0), "upperarm_r": (-40, 0, -36), "upperarm_l": (-40, 0, 36)}, {"pelvis": (0, -0.10, 0.08)}),
            (12, {"pelvis": (-82, 0, 0), "thigh_r": (24, 0, 0), "thigh_l": (16, 0, 0), "calf_r": (36, 0, 0)}, {"pelvis": (0, -0.78, 0.25)}),
            (28, {"pelvis": (-86, 0, 0), "thigh_r": (18, 0, 0)}, {"pelvis": (0, -0.82, 0.25)}),
        ],
        "Recover": [
            (1, {"pelvis": (-80, 0, 0)}, {"pelvis": (0, -0.78, 0.2)}),
            (14, {"spine_01": (26, 0, 0), "thigh_r": (56, 0, 0), "calf_r": (78, 0, 0)}, {"pelvis": (0, -0.32, 0.06)}),
            (26, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Cast": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (8, {"spine_02": (-10, 0, 0), "upperarm_r": (-76, 0, -18), "upperarm_l": (-76, 0, 18), "lowerarm_r": (-34, 0, 0), "lowerarm_l": (-34, 0, 0)}, {"pelvis": (0, 0.02, 0)}),
            (16, {"spine_02": (12, 0, 0), "upperarm_r": (-62, 0, 8), "upperarm_l": (-62, 0, -8), "lowerarm_r": (-10, 0, 0), "lowerarm_l": (-10, 0, 0)}, {"pelvis": (0, -0.05, -0.05)}),
            (26, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Interact": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (10, {"spine_01": (22, 0, 0), "spine_02": (16, 0, 0), "upperarm_r": (-52, 0, 10), "lowerarm_r": (-34, 0, 0), "thigh_r": (20, 0, 0), "calf_r": (24, 0, 0)}, {"pelvis": (0, -0.10, 0)}),
            (22, {}, {"pelvis": (0, 0, 0)}),
        ],
        "Talk": [
            (1, {"spine_02": (2, 0, 0), "upperarm_r": (-24, 0, -10), "lowerarm_r": (-44, 0, 0)}, {"pelvis": (0, 0, 0)}),
            (18, {"spine_02": (-2, 6, 0), "head": (-4, 8, 0), "upperarm_r": (-42, 0, -16), "lowerarm_r": (-54, 0, 0), "upperarm_l": (-18, 0, 14)}, {"pelvis": (0, 0.01, 0)}),
            (36, {"spine_02": (2, 0, 0), "upperarm_r": (-24, 0, -10), "lowerarm_r": (-44, 0, 0)}, {"pelvis": (0, 0, 0)}),
        ],
        "Death": [
            (1, {}, {"pelvis": (0, 0, 0)}),
            (10, {"spine_01": (-20, 0, 0), "head": (-14, 0, 0), "thigh_r": (36, 0, 0), "calf_r": (52, 0, 0), "upperarm_r": (-28, 0, -28), "upperarm_l": (-28, 0, 28)}, {"pelvis": (0, -0.22, 0.05)}),
            (26, {"pelvis": (-84, 0, 0), "spine_01": (14, 0, 0), "upperarm_r": (-18, 0, -52), "upperarm_l": (-18, 0, 52), "thigh_r": (14, 0, 0)}, {"pelvis": (0, -0.86, 0.25)}),
        ],
    }


def apply_standard_mocap_and_clips(rig, full_hero: bool = True):
    """Retarget real Mixamo Idle/Walk/Run/CrouchIdle from Xbot.glb onto MPFB2 rig + author combat/movement clips."""
    xbot = MOCAP_DIR / "Xbot.glb"
    retarget_mixamo_action(rig, xbot, "idle", "Idle", step=2, max_frames=60)
    retarget_mixamo_action(rig, xbot, "walk", "Walk", step=1, max_frames=24)
    retarget_mixamo_action(rig, xbot, "run", "Run", step=1, max_frames=18)
    retarget_mixamo_action(rig, xbot, "sneak_pose", "CrouchIdle", step=2, max_frames=20)

    specs = hero_clip_library()
    if not full_hero:
        keep = {"Idle", "Walk", "Run", "Talk", "Cast", "Interact", "Death", "Stagger"}
        specs = {k: v for k, v in specs.items() if k in keep}
    add_procedural_nla_clips(rig, specs)


def export_rigged_glb(rig, meshes: list, glb_path: Path):
    if rig.animation_data:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_nla_strips_merged_animation_name="",
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_image_format="JPEG",
        export_jpeg_quality=78,
        export_skins=True,
        export_all_influences=False,
        export_def_bones=True,
    )
