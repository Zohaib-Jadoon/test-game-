"""
EIDRATH: The Last Oath — Original Frostheim Enemies & Mountain Warden Boss (Blender 5.3)
Produces 6 distinct enemy archetypes (including true quadruped Frost Wolf) + 3.85m Boss Warden:
  1. ENM_HollowSwordsman -> public/assets/eidrath/enemies/enm_hollow_swordsman.glb (1.86m)
  2. ENM_HollowArcher    -> public/assets/eidrath/enemies/enm_hollow_archer.glb    (1.82m)
  3. ENM_HollowKnight    -> public/assets/eidrath/enemies/enm_hollow_knight.glb    (2.12m)
  4. ENM_FrostWolf       -> public/assets/eidrath/enemies/enm_frost_wolf.glb       (quadruped 0.95m)
  5. ENM_Bandit          -> public/assets/eidrath/enemies/enm_bandit.glb           (1.88m)
  6. ENM_FrostTroll      -> public/assets/eidrath/enemies/enm_frost_troll.glb      (2.95m)
  7. BOSS_Warden         -> public/assets/eidrath/bosses/boss_warden.glb           (3.85m)
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"d:\MY Projects\Blender test")
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


class RigBuilder:
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

    def add_box(self, size, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.02, smooth=False):
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

    def add_cone(self, r1, r2, depth, segs, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
        ret = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
        verts = ret["verts"]
        faces = list({f for v in verts for f in v.link_faces if f.is_valid})
        self._xf(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights, smooth=smooth)

    def add_sphere(self, radius, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), u=12, v=8, smooth=True):
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


def create_armature(name, bones):
    ad = bpy.data.armatures.new(name)
    ao = bpy.data.objects.new(name, ad)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    eb = ad.edit_bones
    for bname, head, tail, parent in bones:
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def write_nla(arm_obj, clips):
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
                if pb.name in locs or pb.name == "Core":
                    pb.keyframe_insert(data_path="location", frame=frame)
        tr = arm_obj.animation_data.nla_tracks.new()
        tr.name = clip_name
        st = tr.strips.new(clip_name, 1, act)
        st.name = clip_name
        arm_obj.animation_data.action = None
    for pb in pose:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)


def export_rig(asset_id, out_dir, mesh_obj, arm_obj):
    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj
    bpy.context.view_layer.update()
    bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    tris = sum(max(0, len(p.vertices) - 2) for p in mesh_obj.data.polygons)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / f"{asset_id}.blend"))
    glb_path = out_dir / f"{asset_id}.glb"
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
        "id": asset_id,
        "mesh": mesh_obj.name,
        "tris": tris,
        "height_m": round(max_z - min_z, 3),
        "min_z": round(min_z, 3),
        "glb_kb": round(glb_path.stat().st_size / 1024, 1),
        "clips": len(arm_obj.animation_data.nla_tracks),
    }


def biped_bones(h=1.86, w=1.0):
    s = h / 1.86
    return [
        ("Root", (0, 0, 0), (0, 0, 0.2 * s), None),
        ("Core", (0, 0, 0.96 * s), (0, 0, 1.50 * s), "Root"),
        ("Head", (0, -0.02 * w, 1.52 * s), (0, -0.05 * w, 1.84 * s), "Core"),
        ("Arm_R", (-0.28 * w, 0, 1.46 * s), (-0.42 * w, -0.08 * w, 0.92 * s), "Core"),
        ("Arm_L", (0.28 * w, 0, 1.46 * s), (0.42 * w, -0.08 * w, 0.92 * s), "Core"),
        ("Leg_R", (-0.13 * w, 0, 0.92 * s), (-0.14 * w, 0, 0.05 * s), "Root"),
        ("Leg_L", (0.13 * w, 0, 0.92 * s), (0.14 * w, 0, 0.05 * s), "Root"),
    ]


def standard_enemy_clips():
    return {
        "Idle": [
            (1, {"Arm_R": (-8, 0, -6), "Arm_L": (-8, 0, 6)}, {"Core": (0, 0, 0)}),
            (21, {"Core": (4, 0, 0), "Arm_R": (-14, 0, -9), "Arm_L": (-14, 0, 9)}, {"Core": (0, 0, 0.03)}),
            (41, {"Arm_R": (-8, 0, -6), "Arm_L": (-8, 0, 6)}, {"Core": (0, 0, 0)}),
        ],
        "Walk": [
            (1, {"Leg_R": (22, 0, 0), "Leg_L": (-20, 0, 0), "Arm_R": (-18, 0, -8), "Arm_L": (16, 0, 8)}, {"Core": (0, 0, -0.02)}),
            (13, {"Leg_R": (-20, 0, 0), "Leg_L": (22, 0, 0), "Arm_R": (16, 0, -8), "Arm_L": (-18, 0, 8)}, {"Core": (0, 0, 0.03)}),
            (25, {"Leg_R": (22, 0, 0), "Leg_L": (-20, 0, 0), "Arm_R": (-18, 0, -8), "Arm_L": (16, 0, 8)}, {"Core": (0, 0, -0.02)}),
        ],
        "Run": [
            (1, {"Core": (14, 0, 6), "Leg_R": (38, 0, 0), "Leg_L": (-34, 0, 0), "Arm_R": (-34, 0, -10), "Arm_L": (28, 0, 10)}, {"Core": (0, 0, -0.04)}),
            (9, {"Core": (14, 0, -6), "Leg_R": (-34, 0, 0), "Leg_L": (38, 0, 0), "Arm_R": (28, 0, -10), "Arm_L": (-34, 0, 10)}, {"Core": (0, 0, 0.06)}),
            (17, {"Core": (14, 0, 6), "Leg_R": (38, 0, 0), "Leg_L": (-34, 0, 0), "Arm_R": (-34, 0, -10), "Arm_L": (28, 0, 10)}, {"Core": (0, 0, -0.04)}),
        ],
        "Telegraph": [
            (1, {}, {"Core": (0, 0, 0)}),
            (10, {"Core": (-16, 0, -18), "Arm_R": (-112, 0, -24), "Arm_L": (-32, 0, 18)}, {"Core": (0, 0.08, 0.05)}),
            (18, {"Core": (-18, 0, -22), "Arm_R": (-118, 0, -26), "Arm_L": (-34, 0, 18)}, {"Core": (0, 0.08, 0.05)}),
        ],
        "Attack": [
            (1, {"Core": (-16, 0, -18), "Arm_R": (-112, 0, -24)}, {"Core": (0, 0.06, 0.04)}),
            (7, {"Core": (26, 0, 28), "Arm_R": (-14, 0, 42), "Arm_L": (20, 0, 20)}, {"Core": (0, -0.16, -0.06)}),
            (18, {}, {"Core": (0, 0, 0)}),
        ],
        "Stagger": [
            (1, {"Core": (-24, 0, 14), "Head": (-18, 0, 0), "Arm_R": (-20, 0, -40), "Arm_L": (-20, 0, 40)}, {"Core": (0, 0.14, -0.05)}),
            (16, {}, {"Core": (0, 0, 0)}),
        ],
        "Death": [
            (1, {"Core": (-10, 0, 0)}, {"Core": (0, 0, 0)}),
            (18, {"Core": (-82, 0, 12), "Arm_R": (-25, 0, -48), "Arm_L": (-25, 0, 48)}, {"Core": (0, 0.35, -0.82)}),
        ],
    }


def build_hollow_variant(asset_id, mesh_name, role):
    clear_scene()
    h = 2.12 if role == "knight" else (1.82 if role == "archer" else 1.86)
    w = 1.24 if role == "knight" else (0.92 if role == "archer" else 1.0)
    s = h / 1.86
    arm = create_armature(f"ARM_{mesh_name}", biped_bones(h, w))
    mats = {
        "bone": make_mat(f"MAT_{mesh_name}_Bone", "#8E969B", 0.05, 0.72),
        "rust": make_mat(f"MAT_{mesh_name}_RustIron", "#3D4247", 0.80, 0.56),
        "cloth": make_mat(f"MAT_{mesh_name}_TornCloth", "#22272B", 0.02, 0.88),
        "soul": make_mat(f"MAT_{mesh_name}_Soul", "#6D9CB6", 0.05, 0.16, "#6D9CB6", 3.8),
    }
    b = RigBuilder(mesh_name, mats)

    # Legs (frost-stained bones under rusted greaves + pelvis/tassets bridge)
    b.add_box((0.36 * w, 0.24 * w, 0.26 * s), "cloth", {"Core": 1.0}, loc=(0, 0, 0.94 * s), bevel=0.03)
    b.add_box((0.32 * w, 0.08 * w, 0.36 * s), "cloth", {"Core": 0.7, "Leg_R": 0.15, "Leg_L": 0.15}, loc=(0, -0.10 * w, 0.76 * s), bevel=0.015)
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.12 * w, 0.24 * w, 0.10 * s), "rust", {f"Leg_{side}": 1.0}, loc=(sx * 0.13 * w, -0.04 * w, 0.05 * s), bevel=0.015)
        b.add_cone(0.062 * w, 0.078 * w, 0.86 * s, 8, "bone", {f"Leg_{side}": 1.0}, loc=(sx * 0.13 * w, 0, 0.49 * s), smooth=False)
        b.add_box((0.12 * w, 0.13 * w, 0.38 * s), "rust", {f"Leg_{side}": 1.0}, loc=(sx * 0.13 * w, -0.01 * w, 0.32 * s), bevel=0.015)

    # Jagged ribcage & rusted lamellar torso + neck
    b.add_box((0.42 * w, 0.26 * w, 0.50 * s), "rust", {"Core": 1.0}, loc=(0, 0, 1.28 * s), bevel=0.045)
    b.add_box((0.16 * w, 0.27 * w, 0.20 * s), "soul", {"Core": 1.0}, loc=(0, -0.015 * w, 1.32 * s), bevel=0.012)
    b.add_cone(0.06 * w, 0.065 * w, 0.14 * s, 7, "bone", {"Head": 0.5, "Core": 0.5}, loc=(0, -0.01 * w, 1.58 * s))
    # Jagged shoulder armor shards + seamlessly aligned arms & gauntlets
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_sphere(0.125 * w, "rust", {f"Arm_{side}": 0.5, "Core": 0.5}, loc=(sx * 0.25 * w, 0, 1.48 * s), scale=(1.1, 0.95, 0.8))
        b.add_cone(0.13 * w, 0.02 * w, 0.24 * s, 5, "rust", {f"Arm_{side}": 0.5, "Core": 0.5}, loc=(sx * 0.28 * w, 0, 1.56 * s), rot=(0, -sx * 0.45, 0), smooth=False)
        b.add_cone(0.060 * w, 0.072 * w, 0.62 * s, 8, "bone", {f"Arm_{side}": 1.0}, loc=(sx * 0.34 * w, -0.035 * w, 1.21 * s), rot=(0.14, -sx * 0.22, 0), smooth=False)
        b.add_box((0.095 * w, 0.10 * w, 0.14 * s), "rust", {f"Arm_{side}": 1.0}, loc=(sx * 0.40 * w, -0.08 * w, 0.94 * s), bevel=0.016)

    # Skull head / helm & faint blue soul eyes
    b.add_sphere(0.122 * w, "bone", {"Head": 1.0}, loc=(0, -0.03 * w, 1.72 * s), scale=(0.88, 1.02, 1.12), u=10, v=8, smooth=False)
    for sx in (-1.0, 1.0):
        b.add_sphere(0.022 * w, "soul", {"Head": 1.0}, loc=(sx * 0.042 * w, -0.142 * w, 1.74 * s), scale=(1.2, 0.5, 0.65), u=6, v=6)

    if role == "swordsman":
        # Jagged notched iron blade gripped directly in Arm_R gauntlet
        b.add_box((0.035, 0.085, 0.96), "rust", {"Arm_R": 1.0}, loc=(-0.40 * w, -0.44 * w, 0.98 * s), rot=(1.32, 0, 0), bevel=0.008)
        b.add_box((0.18, 0.045, 0.045), "rust", {"Arm_R": 1.0}, loc=(-0.40 * w, -0.12 * w, 0.94 * s), bevel=0.006)
    elif role == "archer":
        # Torn hooded cloak + broken jagged bone recurve bow gripped in Arm_L
        b.add_box((0.44 * w, 0.06, 0.98 * s), "cloth", {"Core": 1.0}, loc=(0, 0.16 * w, 1.02 * s), rot=(0.12, 0, 0), bevel=0.015)
        b.add_cone(0.038, 0.014, 1.12 * s, 6, "bone", {"Arm_L": 1.0}, loc=(0.41 * w, -0.14 * w, 1.12 * s), rot=(0.20, 0, 0), smooth=False)
        b.add_cone(0.015, 0.004, 0.56, 5, "soul", {"Arm_R": 1.0}, loc=(-0.39 * w, -0.26 * w, 0.98 * s), rot=(1.55, 0, 0), smooth=False)
    elif role == "knight":
        # Cracked horned helm + heavy rusted tower shield strapped to Arm_L + broadsword gripped in Arm_R
        for sx in (-1.0, 1.0):
            b.add_cone(0.05, 0.008, 0.36, 5, "rust", {"Head": 1.0}, loc=(sx * 0.14, -0.02, 1.88 * s), rot=(-0.25, -sx * 0.45, 0), smooth=False)
        b.add_box((0.08, 0.56, 1.08), "rust", {"Arm_L": 1.0}, loc=(0.48 * w, -0.08 * w, 1.08 * s), bevel=0.02)
        b.add_box((0.05, 0.11, 1.18), "rust", {"Arm_R": 1.0}, loc=(-0.40 * w, -0.50 * w, 1.02 * s), rot=(1.32, 0, 0), bevel=0.01)
        b.add_box((0.22, 0.05, 0.05), "rust", {"Arm_R": 1.0}, loc=(-0.40 * w, -0.11 * w, 0.94 * s), bevel=0.008)

    mesh_obj = b.finalize()
    clips = standard_enemy_clips()
    if role == "knight":
        clips["Block"] = [
            (1, {"Arm_L": (-55, 0, -35), "Core": (6, 0, 15)}, {"Core": (0, 0, -0.04)}),
            (16, {"Arm_L": (-55, 0, -35), "Core": (6, 0, 15)}, {"Core": (0, 0, -0.04)}),
        ]
    write_nla(arm, clips)
    return export_rig(asset_id, OUT_ENM, mesh_obj, arm)


def build_frost_wolf():
    clear_scene()
    # True quadruped wolf rig (facing -Y -> Three.js +Z)
    arm = create_armature("ARM_ENM_FrostWolf", [
        ("Root", (0, 0, 0), (0, 0, 0.15), None),
        ("Core", (0, 0.05, 0.66), (0, -0.45, 0.72), "Root"),
        ("Head", (0, -0.48, 0.74), (0, -0.88, 0.78), "Core"),
        ("Tail", (0, 0.52, 0.68), (0, 0.96, 0.58), "Core"),
        ("Leg_FR", (-0.17, -0.34, 0.62), (-0.17, -0.34, 0.04), "Core"),
        ("Leg_FL", (0.17, -0.34, 0.62), (0.17, -0.34, 0.04), "Core"),
        ("Leg_BR", (-0.16, 0.38, 0.60), (-0.16, 0.38, 0.04), "Core"),
        ("Leg_BL", (0.16, 0.38, 0.60), (0.16, 0.38, 0.04), "Core"),
    ])
    mats = {
        "fur": make_mat("MAT_Wolf_DarkFur", "#2A2F36", 0.0, 0.88),
        "frost": make_mat("MAT_Wolf_FrostMane", "#A7B9C7", 0.02, 0.76),
        "eye": make_mat("MAT_Wolf_IceEye", "#6D9CB6", 0.05, 0.15, "#6D9CB6", 3.6),
    }
    b = RigBuilder("ENM_FrostWolf", mats)
    # Lean muscular wolf torso & frost-dusted mane
    b.add_sphere(0.24, "fur", {"Core": 1.0}, loc=(0, 0.04, 0.66), scale=(0.88, 2.25, 0.96))
    b.add_sphere(0.22, "frost", {"Core": 1.0}, loc=(0, -0.26, 0.76), scale=(1.02, 1.15, 0.92))
    # Snout, skull, ears & piercing eyes
    b.add_sphere(0.15, "fur", {"Head": 1.0}, loc=(0, -0.56, 0.80), scale=(0.86, 1.15, 0.92))
    b.add_cone(0.09, 0.045, 0.28, 7, "frost", {"Head": 1.0}, loc=(0, -0.78, 0.76), rot=(math.pi / 2, 0, 0))
    for sx in (-1.0, 1.0):
        b.add_cone(0.05, 0.01, 0.15, 5, "fur", {"Head": 1.0}, loc=(sx * 0.09, -0.50, 0.95), rot=(-0.15, sx * 0.18, 0))
        b.add_sphere(0.022, "eye", {"Head": 1.0}, loc=(sx * 0.068, -0.66, 0.84), u=6, v=6)
    # Bushy frost-tipped tail
    b.add_cone(0.08, 0.02, 0.56, 7, "frost", {"Tail": 1.0}, loc=(0, 0.76, 0.64), rot=(-1.28, 0, 0))
    # 4 Grounded quadruped legs
    for bn, sx, sy in (("Leg_FR", -0.17, -0.34), ("Leg_FL", 0.17, -0.34), ("Leg_BR", -0.16, 0.38), ("Leg_BL", 0.16, 0.38)):
        b.add_cone(0.068, 0.048, 0.62, 7, "fur", {bn: 1.0}, loc=(sx, sy, 0.31))
        b.add_box((0.09, 0.13, 0.07), "frost", {bn: 1.0}, loc=(sx, sy - 0.03, 0.035), bevel=0.015)

    mesh_obj = b.finalize()
    write_nla(arm, {
        "Idle": [
            (1, {"Tail": (0, 0, -10)}, {"Core": (0, 0, 0)}),
            (18, {"Head": (8, 0, 6), "Tail": (0, 0, 12)}, {"Core": (0, 0, 0.02)}),
            (36, {"Tail": (0, 0, -10)}, {"Core": (0, 0, 0)}),
        ],
        "Run": [
            (1, {"Leg_FR": (38, 0, 0), "Leg_FL": (34, 0, 0), "Leg_BR": (-38, 0, 0), "Leg_BL": (-34, 0, 0), "Core": (8, 0, 0)}, {"Core": (0, 0, 0.06)}),
            (7, {"Leg_FR": (-36, 0, 0), "Leg_FL": (-32, 0, 0), "Leg_BR": (36, 0, 0), "Leg_BL": (32, 0, 0), "Core": (-8, 0, 0)}, {"Core": (0, 0, -0.03)}),
            (13, {"Leg_FR": (38, 0, 0), "Leg_FL": (34, 0, 0), "Leg_BR": (-38, 0, 0), "Leg_BL": (-34, 0, 0), "Core": (8, 0, 0)}, {"Core": (0, 0, 0.06)}),
        ],
        "Telegraph": [
            (1, {"Core": (-14, 0, 0), "Head": (12, 0, 0)}, {"Core": (0, 0.08, -0.10)}),
            (12, {"Core": (-18, 0, 0), "Head": (16, 0, 0)}, {"Core": (0, 0.10, -0.14)}),
        ],
        "Attack": [
            (1, {"Core": (-16, 0, 0)}, {"Core": (0, 0.08, -0.12)}),
            (7, {"Core": (22, 0, 0), "Leg_FR": (-48, 0, 0), "Leg_FL": (-48, 0, 0)}, {"Core": (0, -0.26, 0.16)}),
            (15, {}, {"Core": (0, 0, 0)}),
        ],
        "Death": [
            (1, {}, {"Core": (0, 0, 0)}),
            (15, {"Core": (0, 86, 0)}, {"Core": (0, 0, -0.44)}),
        ],
    })
    return export_rig("enm_frost_wolf", OUT_ENM, mesh_obj, arm)


def build_bandit():
    clear_scene()
    arm = create_armature("ARM_ENM_Bandit", biped_bones(1.88, 1.02))
    mats = {
        "leather": make_mat("MAT_Bandit_PatchedLeather", "#3D2D24", 0.04, 0.84),
        "linen": make_mat("MAT_Bandit_Linen", "#565047", 0.0, 0.90),
        "iron": make_mat("MAT_Bandit_Iron", "#5E666E", 0.86, 0.40),
        "blood": make_mat("MAT_Bandit_RedWrap", "#7D3834", 0.02, 0.84),
        "skin": make_mat("MAT_Bandit_Skin", "#BE947C", 0.0, 0.58),
    }
    b = RigBuilder("ENM_Bandit", mats)
    b.add_box((0.38, 0.26, 0.28), "leather", {"Core": 1.0}, loc=(0, 0, 0.94), bevel=0.035)
    b.add_box((0.34, 0.12, 0.28), "linen", {"Core": 0.7, "Leg_R": 0.15, "Leg_L": 0.15}, loc=(0, -0.08, 0.80), bevel=0.02)
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.12, 0.25, 0.11), "leather", {f"Leg_{side}": 1.0}, loc=(sx * 0.13, -0.04, 0.055), bevel=0.015)
        b.add_cone(0.075, 0.095, 0.88, 8, "linen", {f"Leg_{side}": 1.0}, loc=(sx * 0.13, 0, 0.50))
        b.add_sphere(0.125, "leather", {"Core": 0.5, f"Arm_{side}": 0.5}, loc=(sx * 0.26, 0, 1.48), scale=(1.1, 0.92, 0.85))
        b.add_cone(0.068, 0.080, 0.62, 8, "leather", {f"Arm_{side}": 1.0}, loc=(sx * 0.34, -0.035, 1.21), rot=(0.14, -sx * 0.22, 0))
        b.add_box((0.09, 0.10, 0.12), "leather", {f"Arm_{side}": 1.0}, loc=(sx * 0.41, -0.08, 0.94), bevel=0.016)
    b.add_box((0.44, 0.28, 0.52), "leather", {"Core": 1.0}, loc=(0, 0, 1.28), bevel=0.045)
    b.add_box((0.46, 0.30, 0.10), "blood", {"Core": 1.0}, loc=(0, 0, 1.04), bevel=0.02)
    b.add_cone(0.065, 0.07, 0.13, 8, "skin", {"Head": 0.5, "Core": 0.5}, loc=(0, 0, 1.59))
    b.add_sphere(0.125, "skin", {"Head": 1.0}, loc=(0, -0.02, 1.72))
    b.add_sphere(0.142, "linen", {"Head": 1.0}, loc=(0, 0.02, 1.77), scale=(0.98, 1.12, 0.94))
    b.add_box((0.18, 0.12, 0.09), "blood", {"Head": 1.0}, loc=(0, -0.08, 1.66), bevel=0.025)
    # Iron bearded axe firmly gripped in Arm_R
    b.add_cone(0.024, 0.024, 0.90, 7, "leather", {"Arm_R": 1.0}, loc=(-0.41, -0.36, 0.98), rot=(1.35, 0, 0))
    b.add_box((0.035, 0.22, 0.26), "iron", {"Arm_R": 1.0}, loc=(-0.41, -0.74, 1.05), bevel=0.008)

    mesh_obj = b.finalize()
    write_nla(arm, standard_enemy_clips())
    return export_rig("enm_bandit", OUT_ENM, mesh_obj, arm)


def build_frost_troll():
    clear_scene()
    h = 2.95
    w = 1.65
    arm = create_armature("ARM_ENM_FrostTroll", biped_bones(h, w))
    mats = {
        "hide": make_mat("MAT_Troll_StoneHide", "#4E575E", 0.05, 0.88),
        "scar": make_mat("MAT_Troll_FrostScar", "#7A8D9A", 0.02, 0.78),
        "club": make_mat("MAT_Troll_BoulderClub", "#363D44", 0.12, 0.90),
        "eye": make_mat("MAT_Troll_Eye", "#D9A441", 0.05, 0.2, "#D9A441", 2.8),
    }
    b = RigBuilder("ENM_FrostTroll", mats)
    # Thick primal hips & waist bridging legs and hunched upper back
    b.add_sphere(0.56, "hide", {"Core": 1.0}, loc=(0, 0.02, 1.38), scale=(1.15, 0.82, 0.72), smooth=False)
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.36, 0.46, 0.24), "hide", {f"Leg_{side}": 1.0}, loc=(sx * 0.34, -0.06, 0.12), bevel=0.05)
        b.add_cone(0.18, 0.24, 1.24, 8, "hide", {f"Leg_{side}": 1.0}, loc=(sx * 0.34, 0, 0.78), smooth=False)
        b.add_sphere(0.32, "hide", {"Core": 0.45, f"Arm_{side}": 0.55}, loc=(sx * 0.66, -0.04, 2.26), scale=(1.1, 1.0, 0.95), smooth=False)
        b.add_cone(0.22, 0.28, 1.08, 8, "hide", {f"Arm_{side}": 1.0}, loc=(sx * 0.78, -0.12, 1.74), rot=(0.18, -sx * 0.22, 0), smooth=False)
        b.add_sphere(0.26, "scar", {f"Arm_{side}": 1.0}, loc=(sx * 0.88, -0.24, 1.18), scale=(1.0, 1.15, 1.0), smooth=False)
    # Broad hunched asymmetric mountain troll torso + frost-crystal dorsal spines
    b.add_sphere(0.72, "hide", {"Core": 1.0}, loc=(0, 0.04, 2.04), scale=(1.08, 0.80, 0.96), smooth=False)
    b.add_sphere(0.46, "scar", {"Core": 1.0}, loc=(-0.44, 0.18, 2.52), scale=(1.1, 0.9, 0.85), smooth=False)
    for sx, rz in ((-0.24, 2.66), (0.0, 2.74), (0.26, 2.62)):
        b.add_cone(0.14, 0.02, 0.42, 5, "scar", {"Core": 1.0}, loc=(sx, 0.38, rz), rot=(-0.65, sx * 0.6, 0), smooth=False)
    b.add_sphere(0.30, "hide", {"Head": 1.0}, loc=(0, -0.36, 2.48), scale=(0.95, 1.08, 0.92), smooth=False)
    b.add_box((0.46, 0.20, 0.12), "scar", {"Head": 1.0}, loc=(0, -0.54, 2.60), bevel=0.04)
    for sx in (-1.0, 1.0):
        b.add_sphere(0.048, "eye", {"Head": 1.0}, loc=(sx * 0.12, -0.58, 2.52), u=6, v=6)
        b.add_cone(0.035, 0.008, 0.16, 5, "scar", {"Head": 1.0}, loc=(sx * 0.11, -0.60, 2.34), rot=(-0.45, -sx * 0.25, 0), smooth=False)
    # Massive boulder club gripped in Arm_R
    b.add_cone(0.12, 0.30, 1.72, 7, "club", {"Arm_R": 1.0}, loc=(-0.90, -0.78, 1.14), rot=(1.35, 0, 0), smooth=False)

    mesh_obj = b.finalize()
    write_nla(arm, standard_enemy_clips())
    return export_rig("enm_frost_troll", OUT_ENM, mesh_obj, arm)


def build_mountain_warden_boss():
    """
    First Playable Boss — The Mountain Warden (game.md Section 11):
    3.85m tall oath-seal guardian made of weathered slate plates, iron braces,
    twisted pine roots, and ONE recessed pale oath-blue chest core (#6D9CB6),
    wielding a heavy polygonal stone-and-iron greatmace.
    """
    clear_scene()
    h = 3.85
    w = 2.05
    arm = create_armature("ARM_BOSS_Warden", biped_bones(h, w))
    mats = {
        "slate": make_mat("MAT_Warden_WeatheredSlate", "#3C444C", 0.12, 0.84),
        "iron": make_mat("MAT_Warden_IronBrace", "#22272B", 0.88, 0.40),
        "bronze": make_mat("MAT_Warden_OathBronze", "#9C7848", 0.86, 0.34),
        "roots": make_mat("MAT_Warden_PineRoots", "#3A2C21", 0.0, 0.90),
        "core": make_mat("MAT_Emissive_WardenCore", "#6D9CB6", 0.08, 0.16, "#6D9CB6", 4.6),
    }
    b = RigBuilder("BOSS_Warden", mats)

    # Massive pillar legs grounded at Z = 0 + tapered armored waist & bronze tassets
    b.add_box((1.28, 0.88, 0.56), "iron", {"Core": 1.0}, loc=(0, 0, 1.72), bevel=0.09)
    b.add_box((1.38, 0.94, 0.22), "bronze", {"Core": 1.0}, loc=(0, 0, 1.94), bevel=0.04)
    for sx in (-0.42, 0.0, 0.42):
        b.add_box((0.36, 0.14, 0.68), "slate", {"Core": 0.7, "Leg_R": 0.15, "Leg_L": 0.15}, loc=(sx, -0.44, 1.48), rot=(0.12, 0, 0), bevel=0.03)
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.46, 0.64, 0.28), "iron", {f"Leg_{side}": 1.0}, loc=(sx * 0.46, -0.08, 0.14), bevel=0.05)
        b.add_cone(0.24, 0.28, 0.84, 8, "slate", {f"Leg_{side}": 1.0}, loc=(sx * 0.46, 0, 0.66), smooth=False)
        b.add_cone(0.26, 0.32, 0.78, 8, "slate", {f"Leg_{side}": 1.0}, loc=(sx * 0.44, 0, 1.38), smooth=False)
        b.add_sphere(0.26, "iron", {f"Leg_{side}": 1.0}, loc=(sx * 0.46, -0.14, 1.04), scale=(1.0, 0.75, 1.05), smooth=False)

    # Monumental tapered slate & iron cathedral cuirass + ONE iron-framed pale oath-blue chest core
    b.add_box((1.62, 1.06, 1.24), "slate", {"Core": 1.0}, loc=(0, 0.02, 2.58), bevel=0.18)
    b.add_box((1.72, 1.12, 0.22), "bronze", {"Core": 1.0}, loc=(0, 0.02, 3.06), bevel=0.05)
    # Recessed iron frame + glowing pale oath-blue seal core (diamond/runic silhouette)
    b.add_box((0.68, 0.22, 0.78), "iron", {"Core": 1.0}, loc=(0, -0.48, 2.58), rot=(0, 0, math.pi / 4), bevel=0.04)
    b.add_sphere(0.26, "core", {"Core": 1.0}, loc=(0, -0.54, 2.58), scale=(0.88, 0.42, 1.18), u=12, v=10)
    # Entwined dark pine roots coiling across shoulders & back
    for i, (rx, ry, rz, rotz) in enumerate([(-0.62, 0.44, 2.86, 0.4), (0.64, 0.42, 2.74, -0.5), (0.0, 0.56, 2.52, 0.15), (-0.42, -0.44, 2.95, 0.8)]):
        b.add_cone(0.11, 0.04, 1.25, 6, "roots", {"Core": 1.0}, loc=(rx, ry, rz), rot=(0.45, rotz, i * 0.7))

    # Tiered flared cathedral pauldrons & connected iron-braced gauntlets
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.76, 0.82, 0.58), "slate", {f"Arm_{side}": 0.55, "Core": 0.45}, loc=(sx * 1.04, 0, 3.08), rot=(0, -sx * 0.26, 0), bevel=0.10)
        b.add_box((0.82, 0.86, 0.16), "bronze", {f"Arm_{side}": 0.55, "Core": 0.45}, loc=(sx * 1.06, 0, 3.26), rot=(0, -sx * 0.26, 0), bevel=0.03)
        b.add_cone(0.22, 0.28, 0.96, 8, "slate", {f"Arm_{side}": 1.0}, loc=(sx * 1.10, -0.05, 2.38), rot=(0.12, -sx * 0.14, 0), smooth=False)
        b.add_sphere(0.26, "iron", {f"Arm_{side}": 1.0}, loc=(sx * 1.14, -0.10, 2.00), smooth=False)
        b.add_box((0.44, 0.48, 0.58), "iron", {f"Arm_{side}": 1.0}, loc=(sx * 1.18, -0.16, 1.66), bevel=0.07)

    # Carved monolith horned-crown helm & narrow visor oath-slit
    b.add_cone(0.34, 0.28, 0.68, 8, "slate", {"Head": 1.0}, loc=(0, -0.12, 3.52), smooth=False)
    b.add_box((0.64, 0.64, 0.15), "bronze", {"Head": 1.0}, loc=(0, -0.12, 3.74), bevel=0.03)
    for sx in (-1.0, 1.0):
        b.add_cone(0.08, 0.015, 0.48, 6, "bronze", {"Head": 1.0}, loc=(sx * 0.34, -0.06, 3.86), rot=(-0.2, -sx * 0.52, 0), smooth=False)
    b.add_box((0.36, 0.12, 0.07), "core", {"Head": 1.0}, loc=(0, -0.42, 3.54), bevel=0.01)

    # Heavy polygonal stone-and-iron greatmace held in Arm_R
    b.add_cone(0.085, 0.095, 2.35, 8, "iron", {"Arm_R": 1.0}, loc=(-1.20, -0.86, 1.66), rot=(1.38, 0, 0))
    b.add_cone(0.36, 0.32, 0.76, 8, "slate", {"Arm_R": 1.0}, loc=(-1.20, -1.84, 1.84), rot=(1.38, 0, 0), smooth=False)
    b.add_box((0.62, 0.26, 0.62), "bronze", {"Arm_R": 1.0}, loc=(-1.20, -1.84, 1.84), rot=(0.25, 0.4, 0), bevel=0.04)

    mesh_obj = b.finalize()
    write_nla(arm, {
        "Idle": [
            (1, {"Arm_R": (-8, 0, -6), "Arm_L": (-6, 0, 6)}, {"Core": (0, 0, 0)}),
            (25, {"Core": (3, 0, 0), "Arm_R": (-14, 0, -10), "Arm_L": (-10, 0, 10)}, {"Core": (0, 0, 0.06)}),
            (49, {"Arm_R": (-8, 0, -6), "Arm_L": (-6, 0, 6)}, {"Core": (0, 0, 0)}),
        ],
        "Walk": [
            (1, {"Core": (6, 0, 6), "Leg_R": (24, 0, 0), "Leg_L": (-22, 0, 0), "Arm_R": (-18, 0, -8), "Arm_L": (18, 0, 8)}, {"Core": (0, 0, -0.05)}),
            (16, {"Core": (6, 0, -6), "Leg_R": (-22, 0, 0), "Leg_L": (24, 0, 0), "Arm_R": (18, 0, -8), "Arm_L": (-18, 0, 8)}, {"Core": (0, 0, 0.06)}),
            (31, {"Core": (6, 0, 6), "Leg_R": (24, 0, 0), "Leg_L": (-22, 0, 0), "Arm_R": (-18, 0, -8), "Arm_L": (18, 0, 8)}, {"Core": (0, 0, -0.05)}),
        ],
        "MaceChain": [
            (1, {"Core": (-14, 0, -24), "Arm_R": (-96, 0, -32)}, {"Core": (0, 0.12, 0.06)}),
            (10, {"Core": (22, 0, 32), "Arm_R": (-18, 0, 48)}, {"Core": (0, -0.24, -0.10)}),
            (20, {"Core": (-10, 0, -26), "Arm_R": (-82, 0, 40)}, {"Core": (0, 0.08, 0.04)}),
            (28, {"Core": (24, 0, -22), "Arm_R": (-14, 0, -40)}, {"Core": (0, -0.26, -0.10)}),
            (40, {}, {"Core": (0, 0, 0)}),
        ],
        "Sweep": [
            (1, {"Core": (0, 0, -42), "Arm_R": (-68, 0, -56)}, {"Core": (0, 0, 0)}),
            (12, {"Core": (12, 0, 48), "Arm_R": (-54, 0, 66)}, {"Core": (0, -0.18, -0.08)}),
            (28, {}, {"Core": (0, 0, 0)}),
        ],
        "Slam": [
            (1, {}, {"Core": (0, 0, 0)}),
            (12, {"Core": (-22, 0, 0), "Arm_R": (-142, 0, -12), "Arm_L": (-124, 0, 12)}, {"Core": (0, 0.16, 0.16)}),
            (20, {"Core": (36, 0, 0), "Arm_R": (-8, 0, 14), "Arm_L": (-16, 0, -14)}, {"Core": (0, -0.32, -0.22)}),
            (36, {}, {"Core": (0, 0, 0)}),
        ],
        "Fissure": [
            (1, {}, {"Core": (0, 0, 0)}),
            (14, {"Core": (-16, 0, 0), "Arm_R": (-110, 0, -36), "Arm_L": (-110, 0, 36)}, {"Core": (0, 0, 0.12)}),
            (24, {"Core": (28, 0, 0), "Arm_R": (-10, 0, 22), "Arm_L": (-10, 0, -22)}, {"Core": (0, -0.18, -0.18)}),
            (38, {}, {"Core": (0, 0, 0)}),
        ],
        "Stagger": [
            (1, {"Core": (-26, 0, 16), "Head": (-22, 0, 0), "Arm_R": (-24, 0, -44), "Arm_L": (-24, 0, 44)}, {"Core": (0, 0.22, -0.12)}),
            (24, {}, {"Core": (0, 0, 0)}),
        ],
        "Death": [
            (1, {}, {"Core": (0, 0, 0)}),
            (26, {"Core": (-84, 0, 14), "Arm_R": (-28, 0, -52), "Arm_L": (-28, 0, 52)}, {"Core": (0, 0.6, -1.55)}),
        ],
    })
    return export_rig("boss_warden", OUT_BOSS, mesh_obj, arm)


def render_qa_sheet(stats):
    clear_scene()
    layout = [
        ("enm_hollow_swordsman", OUT_ENM, -5.6),
        ("enm_hollow_archer", OUT_ENM, -3.9),
        ("enm_hollow_knight", OUT_ENM, -2.1),
        ("enm_frost_wolf", OUT_ENM, -0.4),
        ("enm_bandit", OUT_ENM, 1.3),
        ("enm_frost_troll", OUT_ENM, 3.4),
        ("boss_warden", OUT_BOSS, 6.4),
    ]
    for aid, folder, xp in layout:
        bpy.ops.import_scene.gltf(filepath=str(folder / f"{aid}.glb"))
        for r in [o for o in bpy.context.selected_objects if o.parent is None]:
            r.location.x = xp

    bpy.ops.mesh.primitive_plane_add(size=32, location=(0, 0, 0))
    fl = bpy.context.active_object
    fl.data.materials.append(make_mat("MAT_QA_Slate", "#76838E", 0.05, 0.78))

    world = bpy.data.worlds.new("WLD_QA_Enemies")
    bpy.context.scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (*hex_to_linear("#1E2429"), 1.0)
        bg.inputs["Strength"].default_value = 1.15

    for name, energy, col, loc, rot in (
        ("LGT_Key", 1800, (0.96, 0.96, 1.0), (8.0, -11.0, 9.0), (55, 0, 35)),
        ("LGT_Fill", 700, (0.62, 0.80, 1.0), (-9.0, -8.0, 5.0), (62, 0, -45)),
        ("LGT_Rim", 1200, (0.55, 0.82, 1.0), (0.0, 10.0, 7.0), (-52, 0, 0)),
    ):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.color = col
        ld.size = 5.0
        lo = bpy.data.objects.new(name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot)

    cd = bpy.data.cameras.new("CAM_QA_Enemies")
    cd.lens = 35
    cam = bpy.data.objects.new("CAM_QA_Enemies", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.5, -16.8, 3.0)
    cam.rotation_euler = (Vector((0.5, 0, 1.75)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 800
    out_png = OUT_PREVIEW / "eidrath_enemies_boss_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    return out_png


def main():
    stats = [
        build_hollow_variant("enm_hollow_swordsman", "ENM_HollowSwordsman", "swordsman"),
        build_hollow_variant("enm_hollow_archer", "ENM_HollowArcher", "archer"),
        build_hollow_variant("enm_hollow_knight", "ENM_HollowKnight", "knight"),
        build_frost_wolf(),
        build_bandit(),
        build_frost_troll(),
        build_mountain_warden_boss(),
    ]
    qa = render_qa_sheet(stats)
    print("EIDRATH_ENEMIES_BOSS_JSON=" + json.dumps(stats, indent=2))
    print(f"QA_RENDER={qa}")


if __name__ == "__main__":
    main()
