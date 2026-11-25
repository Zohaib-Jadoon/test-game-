"""
EIDRATH: The Last Oath — Original Characters Blender 5.3 Pipeline
Generates 5 original rigged, UV-unwrapped, NLA-animated humanoid characters:
  - CHR_Kaelen   (1.90m) -> public/assets/eidrath/characters/chr_kaelen.glb
  - CHR_Lyra     (1.74m) -> public/assets/eidrath/characters/chr_lyra.glb
  - NPC_Borin    (1.48m) -> public/assets/eidrath/characters/npc_borin.glb
  - NPC_Edda     (1.78m) -> public/assets/eidrath/characters/npc_edda.glb
  - NPC_Villager (1.72m) -> public/assets/eidrath/characters/npc_villager.glb

Conventions (game.md Section 14):
  1 Blender unit = 1 meter, Y-up glTF export, origin at feet Z = 0, facing -Y (+Z in Three.js).
  Skeleton includes sockets: hand_r, hand_l, back_weapon, head.
  EIDRATH palette: charcoal #22272B, parchment #D9D1BE, oxidized bronze #9C7848,
                   weathered iron #68717A, oath blue #6D9CB6, blood rust #7D3834.
"""
import json
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"d:\MY Projects\Blender test")
OUT_GLB = ROOT / "public" / "assets" / "eidrath" / "characters"
OUT_BLEND = ROOT / "art" / "blender" / "characters"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_GLB, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def hex_to_linear(hex_str):
    h = hex_str.lstrip("#")
    srgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def make_mat(name, color_hex, metallic=0.0, roughness=0.65, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    if not mat.node_tree:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*hex_to_linear(color_hex), 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission_hex and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*hex_to_linear(emission_hex), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


class SkinnedMeshBuilder:
    def __init__(self, mesh_name, materials):
        self.mesh_name = mesh_name
        self.materials = materials
        self.mat_idx = {k: i for i, k in enumerate(materials.keys())}
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.new()
        self.groups = []
        self.gmap = {}

    def _gid(self, bone):
        if bone not in self.gmap:
            self.gmap[bone] = len(self.groups)
            self.groups.append(bone)
        return self.gmap[bone]

    def _assign(self, verts, faces, mat_key, weights, smooth=True):
        mi = self.mat_idx[mat_key]
        for f in faces:
            if f.is_valid:
                f.material_index = mi
                f.smooth = smooth
        for v in verts:
            if v.is_valid:
                dv = v[self.deform]
                for bn, w in weights.items():
                    if w > 0.001:
                        dv[self._gid(bn)] = w

    def _xf(self, verts, loc, rot, scale):
        m = Matrix.Translation(Vector(loc)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.transform(self.bm, matrix=m, verts=verts)

    def add_box(self, size, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.015, smooth=True):
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        self._xf(verts, (0, 0, 0), (0, 0, 0), size)
        if bevel > 0:
            edges = list({e for v in verts for e in v.link_edges})
            bres = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
            verts = [v for v in (set(verts) | set(bres.get("verts", []))) if v.is_valid]
        faces = list({f for v in verts for f in v.link_faces if f.is_valid})
        self._xf(verts, loc, rot, (1, 1, 1))
        self._assign(verts, faces, mat_key, weights, smooth=smooth)

    def add_limb(self, r1, r2, length, segs, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
        ret = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=length)
        verts = ret["verts"]
        faces = list({f for v in verts for f in v.link_faces if f.is_valid})
        self._xf(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights, smooth=smooth)

    def add_sphere(self, radius, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), u=14, v=10, smooth=True):
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=radius)
        verts = ret["verts"]
        faces = list({f for vert in verts for f in vert.link_faces if f.is_valid})
        self._xf(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights, smooth=smooth)

    def finalize(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.mesh_name + "_Data")
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.materials.values():
            me.materials.append(m)
        obj = bpy.data.objects.new(self.mesh_name, me)
        bpy.context.scene.collection.objects.link(obj)
        for gn in self.groups:
            obj.vertex_groups.new(name=gn)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
        return obj


def build_humanoid_armature(arm_name, height_scale=1.0, width_scale=1.0):
    s = height_scale
    w = width_scale
    arm_data = bpy.data.armatures.new(arm_name)
    arm_obj = bpy.data.objects.new(arm_name, arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_b(name, head, tail, parent=None):
        b = eb.new(name)
        b.head = Vector((head[0] * w, head[1] * w, head[2] * s))
        b.tail = Vector((tail[0] * w, tail[1] * w, tail[2] * s))
        if parent:
            b.parent = eb[parent]

    add_b("Root", (0, 0, 0.0), (0, 0, 0.20))
    add_b("Pelvis", (0, 0, 0.96), (0, 0, 1.12), "Root")
    add_b("Spine", (0, 0, 1.12), (0, 0, 1.44), "Pelvis")
    add_b("Chest", (0, 0, 1.44), (0, 0, 1.60), "Spine")
    add_b("head", (0, 0, 1.60), (0, 0, 1.88), "Chest")
    add_b("back_weapon", (0, 0.17, 1.42), (0, 0.24, 1.56), "Chest")
    add_b("Cloak", (0, 0.14, 1.44), (0, 0.20, 0.56), "Chest")

    for side, sx in (("r", -1.0), ("l", 1.0)):
        add_b(f"UpperArm_{side}", (sx * 0.24, 0, 1.48), (sx * 0.36, 0, 1.22), "Chest")
        add_b(f"LowerArm_{side}", (sx * 0.36, 0, 1.22), (sx * 0.42, -0.05, 0.96), f"UpperArm_{side}")
        add_b(f"hand_{side}", (sx * 0.42, -0.05, 0.96), (sx * 0.44, -0.14, 0.88), f"LowerArm_{side}")
        add_b(f"Thigh_{side}", (sx * 0.11, 0, 0.94), (sx * 0.12, 0, 0.50), "Pelvis")
        add_b(f"Shin_{side}", (sx * 0.12, 0, 0.50), (sx * 0.12, 0, 0.08), f"Thigh_{side}")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def write_nla_actions(arm_obj, clips):
    arm_obj.animation_data_create()
    pose = arm_obj.pose.bones
    for pb in pose:
        pb.rotation_mode = "XYZ"

    for clip_name, frames in clips.items():
        act = bpy.data.actions.new(name=clip_name)
        arm_obj.animation_data.action = act
        for frame, rots, locs in frames:
            for pb in pose:
                pb.location = (0, 0, 0)
                pb.rotation_euler = (0, 0, 0)
            for bn, degs in rots.items():
                if bn in pose:
                    pose[bn].rotation_euler = tuple(math.radians(a) for a in degs)
            for bn, loc in locs.items():
                if bn in pose:
                    pose[bn].location = loc
            for pb in pose:
                pb.keyframe_insert(data_path="rotation_euler", frame=frame)
                if pb.name in locs or pb.name == "Pelvis":
                    pb.keyframe_insert(data_path="location", frame=frame)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, act)
        strip.name = clip_name
        arm_obj.animation_data.action = None
    for pb in pose:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)


def humanoid_clips(full_hero=False):
    clips = {
        "Idle": [
            (1, {"UpperArm_r": (6, 0, -6), "UpperArm_l": (6, 0, 6), "LowerArm_r": (-14, 0, 0), "LowerArm_l": (-14, 0, 0)}, {"Pelvis": (0, 0, 0)}),
            (25, {"Chest": (3, 0, 0), "UpperArm_r": (8, 0, -8), "UpperArm_l": (8, 0, 8), "Cloak": (4, 0, 0)}, {"Pelvis": (0, 0, 0.018)}),
            (49, {"UpperArm_r": (6, 0, -6), "UpperArm_l": (6, 0, 6), "LowerArm_r": (-14, 0, 0), "LowerArm_l": (-14, 0, 0)}, {"Pelvis": (0, 0, 0)}),
        ],
        "Walk": [
            (1, {"Thigh_r": (24, 0, 0), "Thigh_l": (-22, 0, 0), "Shin_r": (-10, 0, 0), "Shin_l": (-22, 0, 0), "UpperArm_r": (-18, 0, -6), "UpperArm_l": (18, 0, 6), "Cloak": (10, 0, 0)}, {"Pelvis": (0, 0, -0.02)}),
            (13, {"Thigh_r": (-22, 0, 0), "Thigh_l": (24, 0, 0), "Shin_r": (-22, 0, 0), "Shin_l": (-10, 0, 0), "UpperArm_r": (18, 0, -6), "UpperArm_l": (-18, 0, 6), "Cloak": (14, 0, 0)}, {"Pelvis": (0, 0, 0.02)}),
            (25, {"Thigh_r": (24, 0, 0), "Thigh_l": (-22, 0, 0), "Shin_r": (-10, 0, 0), "Shin_l": (-22, 0, 0), "UpperArm_r": (-18, 0, -6), "UpperArm_l": (18, 0, 6), "Cloak": (10, 0, 0)}, {"Pelvis": (0, 0, -0.02)}),
        ],
        "Run": [
            (1, {"Chest": (14, 0, 5), "Thigh_r": (44, 0, 0), "Thigh_l": (-40, 0, 0), "Shin_r": (-18, 0, 0), "Shin_l": (-48, 0, 0), "UpperArm_r": (-38, 0, -8), "UpperArm_l": (36, 0, 8), "Cloak": (28, 0, 0)}, {"Pelvis": (0, 0, -0.04)}),
            (9, {"Chest": (14, 0, -5), "Thigh_r": (-40, 0, 0), "Thigh_l": (44, 0, 0), "Shin_r": (-48, 0, 0), "Shin_l": (-18, 0, 0), "UpperArm_r": (36, 0, -8), "UpperArm_l": (-38, 0, 8), "Cloak": (34, 0, 0)}, {"Pelvis": (0, 0, 0.05)}),
            (17, {"Chest": (14, 0, 5), "Thigh_r": (44, 0, 0), "Thigh_l": (-40, 0, 0), "Shin_r": (-18, 0, 0), "Shin_l": (-48, 0, 0), "UpperArm_r": (-38, 0, -8), "UpperArm_l": (36, 0, 8), "Cloak": (28, 0, 0)}, {"Pelvis": (0, 0, -0.04)}),
        ],
        "Talk": [
            (1, {"Chest": (2, 0, 0), "UpperArm_r": (-26, 0, -10), "LowerArm_r": (-42, 0, 0)}, {"Pelvis": (0, 0, 0)}),
            (18, {"Chest": (-2, 0, 6), "head": (-4, 0, 8), "UpperArm_r": (-42, 0, -18), "LowerArm_r": (-52, 0, 0), "UpperArm_l": (-18, 0, 12)}, {"Pelvis": (0, 0, 0.01)}),
            (36, {"Chest": (2, 0, 0), "UpperArm_r": (-26, 0, -10), "LowerArm_r": (-42, 0, 0)}, {"Pelvis": (0, 0, 0)}),
        ],
        "Cast": [
            (1, {}, {"Pelvis": (0, 0, 0)}),
            (8, {"Chest": (-10, 0, 0), "UpperArm_r": (-82, 0, -16), "UpperArm_l": (-76, 0, 16), "LowerArm_r": (-24, 0, 0)}, {"Pelvis": (0, 0, 0.03)}),
            (18, {"Chest": (10, 0, 0), "UpperArm_r": (-52, 0, 8), "UpperArm_l": (-48, 0, -8)}, {"Pelvis": (0, -0.04, 0)}),
            (28, {}, {"Pelvis": (0, 0, 0)}),
        ],
    }
    if full_hero:
        clips.update({
            "LightAttack": [
                (1, {"Chest": (0, 0, -18), "UpperArm_r": (-64, 0, -28), "LowerArm_r": (-36, 0, 0)}, {"Pelvis": (0, 0, 0)}),
                (6, {"Chest": (14, 0, 34), "UpperArm_r": (-42, 0, 56), "LowerArm_r": (-12, 0, 0), "UpperArm_l": (22, 0, 20), "Cloak": (22, 0, -16)}, {"Pelvis": (0, -0.09, -0.04)}),
                (15, {}, {"Pelvis": (0, 0, 0)}),
            ],
            "HeavyAttack": [
                (1, {}, {"Pelvis": (0, 0, 0)}),
                (9, {"Chest": (-16, 0, -24), "UpperArm_r": (-130, 0, -18), "UpperArm_l": (-110, 0, 18), "LowerArm_r": (-28, 0, 0)}, {"Pelvis": (0, 0.08, 0.04)}),
                (15, {"Chest": (28, 0, 26), "UpperArm_r": (-22, 0, 34), "UpperArm_l": (-16, 0, -18), "Cloak": (36, 0, 0)}, {"Pelvis": (0, -0.18, -0.08)}),
                (27, {}, {"Pelvis": (0, 0, 0)}),
            ],
            "Block": [
                (1, {"Chest": (8, 0, 16), "UpperArm_l": (-62, 0, -34), "LowerArm_l": (-56, 0, 0), "UpperArm_r": (-34, 0, -18), "Thigh_l": (16, 0, 0), "Thigh_r": (-16, 0, 0)}, {"Pelvis": (0, 0, -0.05)}),
                (16, {"Chest": (8, 0, 16), "UpperArm_l": (-62, 0, -34), "LowerArm_l": (-56, 0, 0), "UpperArm_r": (-34, 0, -18), "Thigh_l": (16, 0, 0), "Thigh_r": (-16, 0, 0)}, {"Pelvis": (0, 0, -0.05)}),
            ],
            "Dodge": [
                (1, {"Chest": (28, 0, 0), "Thigh_r": (48, 0, 0), "Thigh_l": (-38, 0, 0), "Cloak": (48, 0, 0)}, {"Pelvis": (0, -0.08, -0.16)}),
                (8, {"Chest": (46, 0, 0), "Thigh_r": (68, 0, 0), "Shin_r": (-72, 0, 0), "UpperArm_r": (34, 0, -18), "UpperArm_l": (34, 0, 18), "Cloak": (62, 0, 0)}, {"Pelvis": (0, -0.14, -0.26)}),
                (16, {}, {"Pelvis": (0, 0, 0)}),
            ],
            "Stagger": [
                (1, {"Chest": (-22, 0, 10), "head": (-16, 0, 0), "UpperArm_r": (-24, 0, -35), "UpperArm_l": (-24, 0, 35)}, {"Pelvis": (0, 0.12, -0.05)}),
                (14, {}, {"Pelvis": (0, 0, 0)}),
            ],
            "Death": [
                (1, {"Chest": (-12, 0, 0)}, {"Pelvis": (0, 0, 0)}),
                (18, {"Pelvis": (-76, 0, 0), "Chest": (-14, 0, 0), "UpperArm_r": (-30, 0, -45), "UpperArm_l": (-30, 0, 45)}, {"Pelvis": (0, 0.25, -0.78)}),
            ],
        })
    return clips


def build_character(spec):
    clear_scene()
    s = spec["height_m"] / 1.90
    w = spec["width_scale"]
    arm = build_humanoid_armature(f"ARM_{spec['name']}", height_scale=s, width_scale=w)
    mats = {k: make_mat(f"MAT_{spec['name']}_{k}", *v) for k, v in spec["materials"].items()}
    b = SkinnedMeshBuilder(spec["mesh_name"], mats)

    # Legs & heavy medieval boots grounded cleanly at Z=0
    for side, sx in (("r", -1.0), ("l", 1.0)):
        b.add_box((0.12 * w, 0.26 * w, 0.11 * s), "leather", {f"Shin_{side}": 1.0}, loc=(sx * 0.12 * w, -0.04 * w, 0.055 * s), bevel=0.018)
        b.add_limb(0.068 * w, 0.082 * w, 0.44 * s, 10, "leather", {f"Shin_{side}": 1.0}, loc=(sx * 0.12 * w, 0, 0.28 * s))
        b.add_limb(0.082 * w, 0.098 * w, 0.46 * s, 10, "cloth", {f"Thigh_{side}": 1.0}, loc=(sx * 0.115 * w, 0, 0.72 * s))
        # Knee plate on armored characters
        if spec.get("armored", True):
            b.add_sphere(0.068 * w, "metal", {f"Thigh_{side}": 0.5, f"Shin_{side}": 0.5}, loc=(sx * 0.12 * w, -0.072 * w, 0.50 * s), scale=(0.95, 0.65, 1.0))

    # Pelvis, belt & lamellar tassets (seamless bridge from hips to thighs)
    b.add_box((0.36 * w, 0.25 * w, 0.28 * s), "armor", {"Pelvis": 1.0}, loc=(0, 0, 1.00 * s), bevel=0.04)
    b.add_box((0.39 * w, 0.27 * w, 0.08 * s), "leather", {"Pelvis": 1.0}, loc=(0, 0, 1.12 * s), bevel=0.015)
    b.add_box((0.10 * w, 0.06 * w, 0.09 * s), "bronze", {"Pelvis": 1.0}, loc=(0, -0.145 * w, 1.12 * s), bevel=0.01)
    # Front/back/side lamellar armor skirts or apron
    b.add_box((0.28 * w, 0.06 * w, 0.38 * s), spec.get("apron_mat", "cloth"), {"Pelvis": 0.7, "Thigh_r": 0.15, "Thigh_l": 0.15}, loc=(0, -0.125 * w, 0.84 * s), rot=(0.06, 0, 0), bevel=0.015)
    for side, sx in (("r", -1.0), ("l", 1.0)):
        b.add_box((0.08 * w, 0.22 * w, 0.28 * s), "leather", {"Pelvis": 0.65, f"Thigh_{side}": 0.35}, loc=(sx * 0.18 * w, 0, 0.88 * s), rot=(0, -sx * 0.12, 0), bevel=0.014)

    # Torso & Chest V-tapered lamellar breastplate + gorget
    b.add_box((0.40 * w, 0.25 * w, 0.24 * s), "armor", {"Spine": 0.75, "Chest": 0.25}, loc=(0, 0, 1.24 * s), bevel=0.045)
    b.add_box((0.46 * w, 0.28 * w, 0.28 * s), "armor", {"Spine": 0.2, "Chest": 0.8}, loc=(0, -0.01 * w, 1.44 * s), bevel=0.055)
    b.add_box((0.36 * w, 0.24 * w, 0.09 * s), "metal" if spec.get("armored", True) else "leather", {"Chest": 1.0}, loc=(0, -0.01 * w, 1.56 * s), bevel=0.025)
    # Layered shoulder pauldrons & continuously connected arms (exact bone alignment!)
    for side, sx in (("r", -1.0), ("l", 1.0)):
        b.add_sphere(0.14 * w, spec.get("shoulder_mat", "metal"), {"Chest": 0.55, f"UpperArm_{side}": 0.45}, loc=(sx * 0.25 * w, 0, 1.50 * s), scale=(1.12, 0.94, 0.78))
        b.add_limb(0.064 * w, 0.078 * w, 0.32 * s, 10, "cloth", {f"UpperArm_{side}": 1.0}, loc=(sx * 0.30 * w, 0, 1.35 * s), rot=(0, -sx * 0.38, 0))
        b.add_sphere(0.068 * w, "metal" if spec.get("armored", True) else "leather", {f"UpperArm_{side}": 0.5, f"LowerArm_{side}": 0.5}, loc=(sx * 0.36 * w, 0, 1.22 * s), scale=(0.95, 0.95, 0.95))
        b.add_limb(0.056 * w, 0.068 * w, 0.30 * s, 10, "metal" if spec.get("armored", True) else "leather", {f"LowerArm_{side}": 1.0}, loc=(sx * 0.39 * w, -0.025 * w, 1.09 * s), rot=(0.18, -sx * 0.20, 0))
        b.add_box((0.085 * w, 0.095 * w, 0.12 * s), "leather", {f"hand_{side}": 1.0}, loc=(sx * 0.425 * w, -0.06 * w, 0.94 * s), bevel=0.018)

    # Character-specific oath scar / bronze mantle clasp / cloak
    if spec.get("has_oath_scar"):
        b.add_box((0.07 * w, 0.03 * w, 0.16 * s), "accent", {"Chest": 1.0}, loc=(-0.10 * w, -0.15 * w, 1.44 * s), rot=(0, 0.35, 0), bevel=0.005)
        b.add_box((0.05 * w, 0.05 * w, 0.05 * s), "accent", {"hand_l": 1.0}, loc=(0.425 * w, -0.10 * w, 0.94 * s), bevel=0.006)
    if spec.get("has_cloak"):
        b.add_box((0.48 * w, 0.055 * w, 1.02 * s), "cloak", {"Cloak": 0.85, "Chest": 0.15}, loc=(0, 0.18 * w, 1.02 * s), rot=(0.08, 0, 0), bevel=0.02)
        b.add_box((0.44 * w, 0.26 * w, 0.11 * s), "cloak", {"Chest": 1.0}, loc=(0, 0.03 * w, 1.56 * s), bevel=0.03)
    if spec.get("has_staff"):
        # Lyra's carved bronze oracle staff gripped in hand_r
        b.add_limb(0.022, 0.024, 1.72 * s, 8, "bronze", {"hand_r": 1.0}, loc=(-0.43 * w, -0.09 * w, 1.06 * s))
        b.add_sphere(0.068, "accent", {"hand_r": 1.0}, loc=(-0.43 * w, -0.09 * w, 1.92 * s), u=10, v=8)
    if spec.get("has_hammer"):
        # Borin's forge hammer gripped in hand_r
        b.add_limb(0.022, 0.022, 0.56 * s, 8, "leather", {"hand_r": 1.0}, loc=(-0.43 * w, -0.14 * w, 0.94 * s), rot=(1.35, 0, 0))
        b.add_box((0.10, 0.18, 0.11), "metal", {"hand_r": 1.0}, loc=(-0.43 * w, -0.37 * w, 0.98 * s), bevel=0.015)
    if spec.get("has_shield"):
        # Edda's Frostheim iron round shield strapped to LowerArm_l
        b.add_limb(0.32, 0.31, 0.05, 16, "metal", {"LowerArm_l": 1.0}, loc=(0.48 * w, -0.04 * w, 1.08 * s), rot=(0, math.pi / 2, 0))
        b.add_sphere(0.08, "bronze", {"LowerArm_l": 1.0}, loc=(0.51 * w, -0.04 * w, 1.08 * s))

    # Neck & grounded sculpted Nordic head (cranio-facial planes, brow ridge, nose, jawline, almond eyes)
    b.add_limb(0.068 * w, 0.072 * w, 0.12 * s, 10, "skin", {"head": 0.5, "Chest": 0.5}, loc=(0, 0, 1.61 * s))
    b.add_sphere(0.118 * w, "skin", {"head": 1.0}, loc=(0, -0.005 * w, 1.76 * s), scale=(0.86, 0.98, 1.02), u=16, v=12)
    # Tapered jaw/chin plane + strong brow ridge + nose bridge
    b.add_box((0.145 * w, 0.15 * w, 0.10 * s), "skin", {"head": 1.0}, loc=(0, -0.03 * w, 1.69 * s), bevel=0.035)
    b.add_box((0.16 * w, 0.055 * w, 0.032 * s), "skin", {"head": 1.0}, loc=(0, -0.098 * w, 1.79 * s), bevel=0.012)
    b.add_box((0.028 * w, 0.042 * w, 0.058 * s), "skin", {"head": 1.0}, loc=(0, -0.112 * w, 1.748 * s), bevel=0.008)
    # Hair volume + layered locks / braids
    b.add_sphere(0.128 * w, "hair", {"head": 1.0}, loc=(0, 0.025 * w, 1.805 * s), scale=(0.94, 1.06, 0.90), u=14, v=10)
    b.add_box((0.19 * w, 0.08 * w, 0.05 * s), "hair", {"head": 1.0}, loc=(0, -0.04 * w, 1.84 * s), rot=(0.2, 0, 0), bevel=0.02)
    if spec.get("long_hair"):
        b.add_box((0.23 * w, 0.09 * w, 0.38 * s), "hair", {"head": 0.7, "Chest": 0.3}, loc=(0, 0.10 * w, 1.60 * s), rot=(0.14, 0, 0), bevel=0.03)
    if spec.get("beard_style") == "short":
        b.add_box((0.15 * w, 0.11 * w, 0.11 * s), "hair", {"head": 1.0}, loc=(0, -0.068 * w, 1.675 * s), bevel=0.03)
    elif spec.get("beard_style") == "braided":
        b.add_box((0.18 * w, 0.12 * w, 0.28 * s), "hair", {"head": 0.65, "Chest": 0.35}, loc=(0, -0.105 * w, 1.56 * s), bevel=0.035)
        b.add_box((0.12 * w, 0.06 * w, 0.04 * s), "bronze", {"head": 0.5, "Chest": 0.5}, loc=(0, -0.145 * w, 1.47 * s), bevel=0.01)
    # Subtle almond recessed eyes (not cartoon round dots)
    for sx in (-1.0, 1.0):
        b.add_sphere(0.014 * w, "eye", {"head": 1.0}, loc=(sx * 0.038 * w, -0.102 * w, 1.768 * s), scale=(1.25, 0.45, 0.52), u=8, v=6)

    mesh_obj = b.finalize()
    mesh_obj.parent = arm
    mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm

    write_nla_actions(arm, humanoid_clips(full_hero=spec.get("full_hero", False)))

    bpy.context.view_layer.update()
    bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    tris = sum(max(0, len(p.vertices) - 2) for p in mesh_obj.data.polygons)

    blend_path = OUT_BLEND / f"{spec['id']}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    glb_path = OUT_GLB / f"{spec['id']}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_def_bones=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )
    return {
        "id": spec["id"],
        "mesh": spec["mesh_name"],
        "tris": tris,
        "height_m": round(max_z - min_z, 3),
        "min_z": round(min_z, 3),
        "glb_kb": round(glb_path.stat().st_size / 1024, 1),
        "clips": len(arm.animation_data.nla_tracks),
    }


CHARACTER_SPECS = [
    {
        "id": "chr_kaelen",
        "name": "Kaelen",
        "mesh_name": "CHR_Kaelen",
        "height_m": 1.90,
        "width_scale": 1.04,
        "armored": True,
        "has_cloak": True,
        "has_oath_scar": True,
        "beard_style": "short",
        "full_hero": True,
        "shoulder_mat": "metal",
        "materials": {
            "armor": ("#22272B", 0.52, 0.42),
            "metal": ("#5B646D", 0.88, 0.34),
            "bronze": ("#9C7848", 0.86, 0.32),
            "cloth": ("#2E353B", 0.04, 0.82),
            "cloak": ("#4A5865", 0.02, 0.86),
            "leather": ("#2A211C", 0.06, 0.78),
            "skin": ("#C79B82", 0.0, 0.56),
            "hair": ("#1D1A18", 0.02, 0.72),
            "eye": ("#3D4E5A", 0.05, 0.22),
            "accent": ("#6D9CB6", 0.1, 0.22, "#6D9CB6", 3.2),
        },
    },
    {
        "id": "chr_lyra",
        "name": "Lyra",
        "mesh_name": "CHR_Lyra",
        "height_m": 1.74,
        "width_scale": 0.88,
        "armored": False,
        "has_cloak": True,
        "has_staff": True,
        "long_hair": True,
        "shoulder_mat": "cloak",
        "materials": {
            "armor": ("#293B42", 0.06, 0.76),
            "metal": ("#68717A", 0.75, 0.40),
            "bronze": ("#9C7848", 0.86, 0.30),
            "cloth": ("#253038", 0.02, 0.84),
            "cloak": ("#2F5259", 0.02, 0.82),
            "leather": ("#31251E", 0.04, 0.78),
            "skin": ("#D4B09B", 0.0, 0.54),
            "hair": ("#CFD6DC", 0.05, 0.48),
            "eye": ("#6D9CB6", 0.1, 0.18, "#6D9CB6", 1.8),
            "accent": ("#7CB7D4", 0.1, 0.18, "#6D9CB6", 3.5),
        },
    },
    {
        "id": "npc_borin",
        "name": "Borin",
        "mesh_name": "NPC_Borin",
        "height_m": 1.48,
        "width_scale": 1.24,
        "armored": False,
        "has_hammer": True,
        "beard_style": "braided",
        "apron_mat": "leather",
        "shoulder_mat": "leather",
        "materials": {
            "armor": ("#3A322C", 0.08, 0.82),
            "metal": ("#5B636B", 0.86, 0.42),
            "bronze": ("#9C7848", 0.84, 0.35),
            "cloth": ("#332D2A", 0.02, 0.88),
            "cloak": ("#3A322C", 0.02, 0.88),
            "leather": ("#38261B", 0.06, 0.78),
            "skin": ("#C5947B", 0.0, 0.58),
            "hair": ("#7A462B", 0.02, 0.74),
            "eye": ("#2B2622", 0.05, 0.25),
            "accent": ("#C87638", 0.1, 0.25, "#D97724", 2.2),
        },
    },
    {
        "id": "npc_edda",
        "name": "Edda",
        "mesh_name": "NPC_Edda",
        "height_m": 1.78,
        "width_scale": 0.96,
        "armored": True,
        "has_cloak": True,
        "has_shield": True,
        "long_hair": True,
        "shoulder_mat": "cloak",
        "materials": {
            "armor": ("#2F353A", 0.58, 0.46),
            "metal": ("#68717A", 0.86, 0.38),
            "bronze": ("#7D3834", 0.15, 0.62),  # Red commander cord accent
            "cloth": ("#3B3532", 0.02, 0.86),
            "cloak": ("#5A5147", 0.0, 0.92),    # Wolf-fur mantle
            "leather": ("#2B211B", 0.05, 0.80),
            "skin": ("#C9A089", 0.0, 0.56),
            "hair": ("#8D7E6E", 0.02, 0.68),
            "eye": ("#3E4B52", 0.05, 0.24),
            "accent": ("#7D3834", 0.1, 0.55),
        },
    },
    {
        "id": "npc_villager",
        "name": "Villager",
        "mesh_name": "NPC_Villager",
        "height_m": 1.72,
        "width_scale": 0.94,
        "armored": False,
        "has_cloak": True,
        "beard_style": "short",
        "shoulder_mat": "cloak",
        "materials": {
            "armor": ("#45403B", 0.02, 0.86),
            "metal": ("#5F666E", 0.78, 0.46),
            "bronze": ("#8A6D46", 0.72, 0.42),
            "cloth": ("#363B40", 0.02, 0.88),
            "cloak": ("#4A4640", 0.02, 0.90),
            "leather": ("#33261E", 0.04, 0.82),
            "skin": ("#CCA28B", 0.0, 0.58),
            "hair": ("#463528", 0.02, 0.74),
            "eye": ("#2C2E30", 0.05, 0.26),
            "accent": ("#9C7848", 0.2, 0.55),
        },
    },
]


def render_lineup(stats):
    clear_scene()
    x_positions = [-2.4, -1.2, 0.0, 1.2, 2.4]
    for st, xp in zip(stats, x_positions):
        bpy.ops.import_scene.gltf(filepath=str(OUT_GLB / f"{st['id']}.glb"))
        roots = [o for o in bpy.context.selected_objects if o.parent is None]
        for r in roots:
            r.location.x = xp

    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, 0))
    fl = bpy.context.active_object
    fl.data.materials.append(make_mat("MAT_QA_Snow", "#9BA7B2", 0.02, 0.72))

    world = bpy.data.worlds.new("WLD_QA_Chars")
    bpy.context.scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (*hex_to_linear("#22272B"), 1.0)
        bg.inputs["Strength"].default_value = 1.1

    for name, energy, col, loc, rot in (
        ("LGT_Key", 420, (1.0, 0.95, 0.90), (3.5, -4.5, 4.0), (55, 0, 35)),
        ("LGT_Fill", 180, (0.68, 0.82, 1.0), (-4.0, -3.5, 2.5), (62, 0, -45)),
        ("LGT_Rim", 260, (0.72, 0.86, 1.0), (0.0, 4.0, 3.2), (-52, 0, 0)),
    ):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.color = col
        ld.size = 2.4
        lo = bpy.data.objects.new(name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot)

    cd = bpy.data.cameras.new("CAM_QA_Chars")
    cd.lens = 42
    cam = bpy.data.objects.new("CAM_QA_Chars", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.0, -7.8, 1.50)
    cam.rotation_euler = (Vector((0, 0, 0.98)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x = 1520
    scene.render.resolution_y = 760
    out_png = OUT_PREVIEW / "eidrath_characters_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    return out_png


def main():
    stats = [build_character(spec) for spec in CHARACTER_SPECS]
    qa = render_lineup(stats)
    print("EIDRATH_CHARACTERS_JSON=" + json.dumps(stats, indent=2))
    print(f"QA_RENDER={qa}")


if __name__ == "__main__":
    main()
