"""
Skyforge Arena — Blender 5.3 Enemy & Arena Prop Forge
Generates 3 animated dark-fantasy enemy characters (charger, kiter, swarmer)
and 1 sculpted Gothic Arena Obelisk prop (citadel_obelisk).

Exports:
  - public/models/enemies/<kind>.glb
  - public/models/props/citadel_obelisk.glb
  - blender/exports/<name>.fbx
  - blender/sources/<name>.blend
  - blender/previews/enemies_lineup.png
"""

import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENEMY_GLB_DIR = os.path.join(ROOT_DIR, "public", "models", "enemies")
PROP_GLB_DIR = os.path.join(ROOT_DIR, "public", "models", "props")
EXPORT_FBX_DIR = os.path.join(ROOT_DIR, "blender", "exports")
SOURCE_BLEND_DIR = os.path.join(ROOT_DIR, "blender", "sources")
PREVIEW_DIR = os.path.join(ROOT_DIR, "blender", "previews")

for d in (ENEMY_GLB_DIR, PROP_GLB_DIR, EXPORT_FBX_DIR, SOURCE_BLEND_DIR, PREVIEW_DIR):
    os.makedirs(d, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name, base_color, metallic=0.2, roughness=0.45, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    if not mat.node_tree:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission, 1.0)
    return mat


class MeshRigBuilder:
    def __init__(self, name, materials):
        self.name = name
        self.materials = materials
        self.mat_index = {k: i for i, k in enumerate(materials.keys())}
        self.bm = bmesh.new()
        self.deform_layer = self.bm.verts.layers.deform.new()
        self.group_names = []
        self.group_map = {}

    def _gid(self, bone_name):
        if bone_name not in self.group_map:
            self.group_map[bone_name] = len(self.group_names)
            self.group_names.append(bone_name)
        return self.group_map[bone_name]

    def _assign(self, verts, faces, mat_key, weights, smooth=True):
        mi = self.mat_index[mat_key]
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
        for v in verts:
            dvert = v[self.deform_layer]
            for bn, w in weights.items():
                if w > 0.001:
                    dvert[self._gid(bn)] = w

    def _xform(self, verts, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        mat = Matrix.Translation(Vector(loc)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.transform(self.bm, matrix=mat, verts=verts)

    def add_box(self, size, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, smooth=True):
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        self._xform(verts, (0, 0, 0), (0, 0, 0), size)
        if bevel > 0.0:
            edges = list({e for v in verts for e in v.link_edges})
            bres = bmesh.ops.bevel(
                self.bm, geom=edges, offset=bevel, offset_type="OFFSET",
                segments=1, profile=0.5, affect="EDGES", clamp_overlap=True,
            )
            verts = [v for v in (set(verts) | set(bres.get("verts", []))) if v.is_valid]
        faces = list({f for v in verts for f in v.link_faces if f.is_valid})
        self._xform(verts, loc, rot, (1, 1, 1))
        self._assign(verts, faces, mat_key, weights, smooth=smooth)
        return verts

    def add_sphere(self, radius, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), u=12, v=8, smooth=True):
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=radius)
        verts = ret["verts"]
        faces = list({f for vert in verts for f in vert.link_faces if f.is_valid})
        self._xform(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights, smooth=smooth)
        return verts

    def add_cone(self, r1, r2, depth, segs, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
        ret = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
        verts = ret["verts"]
        faces = list({f for vert in verts for f in vert.link_faces if f.is_valid})
        self._xform(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights, smooth=smooth)
        return verts

    def add_torus(self, major_r, minor_r, maj_s, min_s, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0)):
        rings = []
        verts = []
        for i in range(maj_s):
            theta = (i / maj_s) * math.tau
            ct, st = math.cos(theta), math.sin(theta)
            ring = []
            for j in range(min_s):
                phi = (j / min_s) * math.tau
                cp, sp = math.cos(phi), math.sin(phi)
                x = (major_r + minor_r * cp) * ct
                y = (major_r + minor_r * cp) * st
                z = minor_r * sp
                v = self.bm.verts.new((x, y, z))
                ring.append(v)
                verts.append(v)
            rings.append(ring)
        faces = []
        for i in range(maj_s):
            ni = (i + 1) % maj_s
            for j in range(min_s):
                nj = (j + 1) % min_s
                faces.append(self.bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj])))
        self._xform(verts, loc, rot, (1, 1, 1))
        self._assign(verts, faces, mat_key, weights, smooth=True)
        return verts

    def finalize(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for m in self.materials.values():
            obj.data.materials.append(m)
        for g in self.group_names:
            obj.vertex_groups.new(name=g)
        return obj


def make_armature(name, bones_spec):
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for bname, head, tail, parent in bones_spec:
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def write_nla_clips(arm_obj, clips):
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
            for bn, rdeg in rots.items():
                if bn in pose:
                    pose[bn].rotation_euler = tuple(math.radians(a) for a in rdeg)
            for bn, loc in locs.items():
                if bn in pose:
                    pose[bn].location = loc
            for pb in pose:
                pb.keyframe_insert(data_path="rotation_euler", frame=frame)
                if pb.name in locs or pb.name == "Core":
                    pb.keyframe_insert(data_path="location", frame=frame)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, act)
        strip.name = clip_name
        arm_obj.animation_data.action = None
    for pb in pose:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)


def export_rig_asset(name, out_glb_dir, mesh_obj, arm_obj=None):
    if arm_obj is not None:
        mesh_obj.parent = arm_obj
        mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj

    bpy.context.view_layer.update()
    bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE_BLEND_DIR, f"{name}.blend"))
    glb_path = os.path.join(out_glb_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=arm_obj is not None,
        export_def_bones=True,
        export_animations=arm_obj is not None,
        export_animation_mode="NLA_TRACKS",
    )
    fbx_path = os.path.join(EXPORT_FBX_DIR, f"{name}.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx_path,
        use_selection=False,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        add_leaf_bones=False,
        bake_anim=arm_obj is not None,
        bake_anim_use_nla_strips=arm_obj is not None,
        bake_anim_use_all_actions=False,
    )
    print(
        f"ASSET_OK {name}: tris={tris} z=[{min_z:.3f}, {max_z:.3f}] "
        f"glb={round(os.path.getsize(glb_path)/1024, 1)}KB fbx={round(os.path.getsize(fbx_path)/1024, 1)}KB"
    )


def build_charger():
    """Obsidian Golem Charger — hulking volcanic brute with magma core and horned pauldrons."""
    clear_scene()
    arm = make_armature("Charger_Armature", [
        ("Root", (0, 0, 0), (0, 0, 0.3), None),
        ("Core", (0, 0, 1.05), (0, 0, 1.85), "Root"),
        ("Head", (0, -0.25, 1.80), (0, -0.45, 2.08), "Core"),
        ("Arm_R", (-0.72, 0.0, 1.65), (-0.82, -0.15, 0.85), "Core"),
        ("Arm_L", (0.72, 0.0, 1.65), (0.82, -0.15, 0.85), "Core"),
        ("Leg_R", (-0.34, 0.0, 0.90), (-0.34, 0.0, 0.05), "Root"),
        ("Leg_L", (0.34, 0.0, 0.90), (0.34, 0.0, 0.05), "Root"),
    ])
    mats = {
        "stone": make_pbr_mat("MAT_Draugr_BarrowSlate", (0.17, 0.20, 0.23), metallic=0.14, roughness=0.78),
        "iron": make_pbr_mat("MAT_Draugr_AncientIron", (0.28, 0.29, 0.31), metallic=0.84, roughness=0.40),
        "magma": make_pbr_mat("MAT_Emissive_DraugrFrost", (0.38, 0.88, 1.0), metallic=0.05, roughness=0.18, emission=(0.30, 0.84, 1.0), emission_strength=4.2),
    }
    b = MeshRigBuilder("GolemCharger_Mesh", mats)
    # Massive stomping legs grounded at z=0
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.34, 0.42, 0.48), "stone", {f"Leg_{side}": 1.0}, loc=(sx * 0.34, 0.0, 0.24), bevel=0.05, smooth=False)
        b.add_box((0.30, 0.34, 0.46), "iron", {f"Leg_{side}": 1.0}, loc=(sx * 0.34, 0.0, 0.68), bevel=0.04, smooth=False)
        b.add_box((0.38, 0.48, 0.14), "iron", {f"Leg_{side}": 1.0}, loc=(sx * 0.34, -0.06, 0.07), bevel=0.02, smooth=False)

    # Hulking obsidian torso + glowing magma core fissure
    b.add_box((1.16, 0.86, 0.94), "stone", {"Core": 1.0}, loc=(0, 0.04, 1.42), bevel=0.14, smooth=False)
    b.add_box((0.72, 0.60, 0.34), "iron", {"Core": 1.0}, loc=(0, 0.0, 0.96), bevel=0.06, smooth=False)
    b.add_sphere(0.30, "magma", {"Core": 1.0}, loc=(0, -0.36, 1.44), scale=(1.1, 0.45, 1.15), u=10, v=8)
    b.add_box((0.18, 0.92, 0.72), "magma", {"Core": 1.0}, loc=(0, 0.06, 1.42), bevel=0.02)

    # Horned hunched head
    b.add_box((0.46, 0.48, 0.42), "stone", {"Head": 1.0}, loc=(0, -0.34, 1.92), bevel=0.08, smooth=False)
    b.add_box((0.32, 0.10, 0.08), "magma", {"Head": 1.0}, loc=(0, -0.56, 1.96), bevel=0.015)
    for sx in (-1.0, 1.0):
        b.add_cone(0.11, 0.015, 0.56, 6, "iron", {"Head": 1.0}, loc=(sx * 0.28, -0.46, 2.08), rot=(math.radians(52), sx * math.radians(32), 0), smooth=False)

    # Massive boulder fists & spiked shoulders
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.48, 0.54, 0.44), "iron", {f"Arm_{side}": 0.6, "Core": 0.4}, loc=(sx * 0.72, 0.0, 1.76), rot=(0, sx * math.radians(20), 0), bevel=0.06, smooth=False)
        b.add_cone(0.10, 0.01, 0.40, 5, "iron", {f"Arm_{side}": 0.6, "Core": 0.4}, loc=(sx * 0.88, 0.0, 2.04), rot=(0, sx * math.radians(26), 0), smooth=False)
        b.add_box((0.34, 0.36, 0.52), "stone", {f"Arm_{side}": 1.0}, loc=(sx * 0.82, -0.06, 1.30), bevel=0.06, smooth=False)
        b.add_box((0.46, 0.52, 0.48), "stone", {f"Arm_{side}": 1.0}, loc=(sx * 0.88, -0.18, 0.82), bevel=0.08, smooth=False)
        b.add_box((0.48, 0.16, 0.14), "magma", {f"Arm_{side}": 1.0}, loc=(sx * 0.88, -0.40, 0.82), bevel=0.02)

    mesh_obj = b.finalize()
    write_nla_clips(arm, {
        "Idle": [
            (1, {"Arm_R": (-8, 0, -6), "Arm_L": (-8, 0, 6)}, {"Core": (0, 0, 0)}),
            (21, {"Core": (5, 0, 0), "Arm_R": (-16, 0, -10), "Arm_L": (-16, 0, 10)}, {"Core": (0, 0, 0.05)}),
            (41, {"Arm_R": (-8, 0, -6), "Arm_L": (-8, 0, 6)}, {"Core": (0, 0, 0)}),
        ],
        "Run": [
            (1, {"Core": (16, 0, 8), "Leg_R": (32, 0, 0), "Leg_L": (-28, 0, 0), "Arm_R": (-32, 0, -10), "Arm_L": (26, 0, 10)}, {"Core": (0, 0, -0.04)}),
            (11, {"Core": (16, 0, -8), "Leg_R": (-28, 0, 0), "Leg_L": (32, 0, 0), "Arm_R": (26, 0, -10), "Arm_L": (-32, 0, 10)}, {"Core": (0, 0, 0.06)}),
            (21, {"Core": (16, 0, 8), "Leg_R": (32, 0, 0), "Leg_L": (-28, 0, 0), "Arm_R": (-32, 0, -10), "Arm_L": (26, 0, 10)}, {"Core": (0, 0, -0.04)}),
        ],
        "Attack": [
            (1, {}, {"Core": (0, 0, 0)}),
            (7, {"Core": (-14, 0, 0), "Arm_R": (-110, 0, -15), "Arm_L": (-110, 0, 15)}, {"Core": (0, 0.08, 0.06)}),
            (13, {"Core": (32, 0, 0), "Head": (18, 0, 0), "Arm_R": (-20, 0, 22), "Arm_L": (-20, 0, -22)}, {"Core": (0, -0.14, -0.08)}),
            (21, {}, {"Core": (0, 0, 0)}),
        ],
    })
    export_rig_asset("charger", ENEMY_GLB_DIR, mesh_obj, arm)


def build_kiter():
    """Void Wisp Kiter — levitating arcane wraith with orbiting brass astrolabe rings."""
    clear_scene()
    arm = make_armature("Kiter_Armature", [
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Core", (0, 0, 1.25), (0, 0, 1.95), "Root"),
        ("Ring_A", (0, 0, 1.35), (0, 0, 1.65), "Core"),
        ("Ring_B", (0, 0, 1.35), (0, 0, 1.65), "Core"),
    ])
    mats = {
        "robe": make_pbr_mat("MAT_Priest_TatteredShroud", (0.12, 0.15, 0.18), metallic=0.05, roughness=0.84),
        "brass": make_pbr_mat("MAT_Priest_DragonBronze", (0.62, 0.50, 0.26), metallic=0.88, roughness=0.28),
        "void": make_pbr_mat("MAT_Emissive_FrostSoul", (0.48, 0.90, 1.0), metallic=0.1, roughness=0.14, emission=(0.38, 0.86, 1.0), emission_strength=4.4),
    }
    b = MeshRigBuilder("WispKiter_Mesh", mats)
    # Tapered floating robes & cowl
    b.add_cone(0.46, 0.14, 1.10, 10, "robe", {"Core": 1.0}, loc=(0, 0, 0.85))
    b.add_sphere(0.28, "robe", {"Core": 1.0}, loc=(0, 0.02, 1.68), scale=(0.95, 1.15, 1.15), u=12, v=10)
    b.add_cone(0.22, 0.02, 0.44, 8, "robe", {"Core": 1.0}, loc=(0, 0.24, 1.86), rot=(math.radians(65), 0, 0))
    # Floating crystal core + dark face shadow + glowing arcane eyes
    b.add_cone(0.22, 0.01, 0.36, 6, "void", {"Core": 1.0}, loc=(0, -0.14, 1.36), smooth=False)
    b.add_cone(0.22, 0.01, 0.36, 6, "void", {"Core": 1.0}, loc=(0, -0.14, 1.00), rot=(math.radians(180), 0, 0), smooth=False)
    for sx in (-1.0, 1.0):
        b.add_sphere(0.048, "void", {"Core": 1.0}, loc=(sx * 0.095, -0.305, 1.68), scale=(1.25, 0.55, 0.72), u=8, v=6)
        # Floating spectral claw sleeves
        b.add_cone(0.14, 0.03, 0.54, 7, "robe", {"Core": 1.0}, loc=(sx * 0.44, -0.18, 1.24), rot=(math.radians(52), sx * math.radians(24), 0))
    # Orbiting astrolabe rings
    b.add_torus(0.68, 0.042, 24, 8, "brass", {"Ring_A": 1.0}, loc=(0, 0, 1.35), rot=(math.radians(68), math.radians(22), 0))
    b.add_torus(0.82, 0.032, 24, 8, "void", {"Ring_B": 1.0}, loc=(0, 0, 1.35), rot=(math.radians(-58), math.radians(-30), 0))

    mesh_obj = b.finalize()
    write_nla_clips(arm, {
        "Idle": [
            (1, {"Ring_A": (0, 0, 0), "Ring_B": (0, 0, 0)}, {"Core": (0, 0, 0.0)}),
            (21, {"Ring_A": (0, 0, 180), "Ring_B": (0, 0, -180)}, {"Core": (0, 0, 0.14)}),
            (41, {"Ring_A": (0, 0, 360), "Ring_B": (0, 0, -360)}, {"Core": (0, 0, 0.0)}),
        ],
        "Run": [
            (1, {"Core": (16, 0, 0), "Ring_A": (0, 0, 0), "Ring_B": (0, 0, 0)}, {"Core": (0, 0, 0.06)}),
            (13, {"Core": (20, 0, 0), "Ring_A": (0, 0, 180), "Ring_B": (0, 0, -180)}, {"Core": (0, 0, 0.16)}),
            (25, {"Core": (16, 0, 0), "Ring_A": (0, 0, 360), "Ring_B": (0, 0, -360)}, {"Core": (0, 0, 0.06)}),
        ],
        "Attack": [
            (1, {}, {"Core": (0, 0, 0)}),
            (7, {"Core": (-18, 0, 0), "Ring_A": (40, 0, 120), "Ring_B": (-40, 0, -120)}, {"Core": (0, 0.10, 0.18)}),
            (13, {"Core": (24, 0, 0), "Ring_A": (0, 0, 280), "Ring_B": (0, 0, -280)}, {"Core": (0, -0.18, 0.08)}),
            (21, {}, {"Core": (0, 0, 0)}),
        ],
    })
    export_rig_asset("kiter", ENEMY_GLB_DIR, mesh_obj, arm)


def build_swarmer():
    """Shard Swarmer — agile horned crystal-chitin stalker with twin razor claws."""
    clear_scene()
    arm = make_armature("Swarmer_Armature", [
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Core", (0, 0.05, 0.62), (0, -0.25, 0.92), "Root"),
        ("Claw_R", (-0.32, -0.16, 0.68), (-0.42, -0.68, 0.54), "Core"),
        ("Claw_L", (0.32, -0.16, 0.68), (0.42, -0.68, 0.54), "Core"),
        ("Leg_R", (-0.24, 0.08, 0.52), (-0.28, 0.12, 0.04), "Root"),
        ("Leg_L", (0.24, 0.08, 0.52), (0.28, 0.12, 0.04), "Root"),
    ])
    mats = {
        "chitin": make_pbr_mat("MAT_IceWraith_GlacialCarapace", (0.28, 0.42, 0.52), metallic=0.28, roughness=0.26),
        "blade": make_pbr_mat("MAT_IceWraith_FrostShard", (0.62, 0.84, 0.94), metallic=0.55, roughness=0.16),
        "eye": make_pbr_mat("MAT_Emissive_IceWraithEye", (0.55, 0.96, 1.0), metallic=0.1, roughness=0.12, emission=(0.45, 0.92, 1.0), emission_strength=4.5),
    }
    b = MeshRigBuilder("ShardSwarmer_Mesh", mats)
    # Predatory crystal carapace body
    b.add_sphere(0.32, "chitin", {"Core": 1.0}, loc=(0, 0.02, 0.72), scale=(0.95, 1.35, 0.85), u=10, v=8, smooth=False)
    b.add_cone(0.24, 0.02, 0.58, 6, "blade", {"Core": 1.0}, loc=(0, 0.32, 0.88), rot=(math.radians(-58), 0, 0), smooth=False)
    # Jagged dorsal spines
    for i in range(3):
        b.add_cone(0.08 - i * 0.015, 0.008, 0.30 - i * 0.04, 5, "blade", {"Core": 1.0}, loc=(0, 0.0 + i * 0.16, 1.02 - i * 0.06), rot=(math.radians(-30), 0, 0), smooth=False)
    # Head & eyes
    b.add_box((0.30, 0.34, 0.24), "chitin", {"Core": 1.0}, loc=(0, -0.36, 0.82), rot=(math.radians(16), 0, 0), bevel=0.04, smooth=False)
    for sx in (-1.0, 1.0):
        b.add_sphere(0.052, "eye", {"Core": 1.0}, loc=(sx * 0.10, -0.535, 0.85), scale=(1.25, 0.6, 0.7), u=8, v=6)
        # Razor scythe claws
        b.add_cone(0.09, 0.012, 0.74, 5, "blade", {f"Claw_{'R' if sx < 0 else 'L'}": 1.0}, loc=(sx * 0.38, -0.44, 0.62), rot=(math.radians(82), sx * math.radians(-16), 0), smooth=False)
        # Digitigrade stalker legs grounded at z=0
        b.add_box((0.14, 0.18, 0.52), "chitin", {f"Leg_{'R' if sx < 0 else 'L'}": 1.0}, loc=(sx * 0.26, 0.08, 0.26), rot=(math.radians(-14), 0, 0), bevel=0.025, smooth=False)
        b.add_cone(0.08, 0.015, 0.22, 5, "blade", {f"Leg_{'R' if sx < 0 else 'L'}": 1.0}, loc=(sx * 0.26, -0.06, 0.06), rot=(math.radians(90), 0, 0), smooth=False)

    mesh_obj = b.finalize()
    write_nla_clips(arm, {
        "Idle": [
            (1, {"Claw_R": (0, 0, 0), "Claw_L": (0, 0, 0)}, {"Core": (0, 0, 0)}),
            (13, {"Core": (8, 0, 0), "Claw_R": (-14, 0, -10), "Claw_L": (-14, 0, 10)}, {"Core": (0, 0, 0.04)}),
            (25, {"Claw_R": (0, 0, 0), "Claw_L": (0, 0, 0)}, {"Core": (0, 0, 0)}),
        ],
        "Run": [
            (1, {"Core": (14, 0, 8), "Leg_R": (44, 0, 0), "Leg_L": (-42, 0, 0), "Claw_R": (-28, 0, -12), "Claw_L": (22, 0, 12)}, {"Core": (0, 0, -0.03)}),
            (7, {"Core": (14, 0, -8), "Leg_R": (-42, 0, 0), "Leg_L": (44, 0, 0), "Claw_R": (22, 0, -12), "Claw_L": (-28, 0, 12)}, {"Core": (0, 0, 0.07)}),
            (13, {"Core": (14, 0, 8), "Leg_R": (44, 0, 0), "Leg_L": (-42, 0, 0), "Claw_R": (-28, 0, -12), "Claw_L": (22, 0, 12)}, {"Core": (0, 0, -0.03)}),
        ],
        "Attack": [
            (1, {}, {"Core": (0, 0, 0)}),
            (5, {"Core": (-16, 0, 0), "Claw_R": (-70, 0, -28), "Claw_L": (-70, 0, 28)}, {"Core": (0, 0.08, 0.14)}),
            (10, {"Core": (28, 0, 0), "Claw_R": (30, 0, 36), "Claw_L": (30, 0, -36)}, {"Core": (0, -0.18, 0.0)}),
            (17, {}, {"Core": (0, 0, 0)}),
        ],
    })
    export_rig_asset("swarmer", ENEMY_GLB_DIR, mesh_obj, arm)


def build_citadel_obelisk():
    """Sculpted Gothic Rune Obelisk prop for arena perimeter pedestals."""
    clear_scene()
    mats = {
        "stone": make_pbr_mat("Obelisk_Stone", (0.18, 0.16, 0.24), metallic=0.18, roughness=0.68),
        "gold": make_pbr_mat("Obelisk_Gold", (0.82, 0.64, 0.30), metallic=0.90, roughness=0.22),
        "rune": make_pbr_mat("Obelisk_Rune", (0.84, 0.36, 1.0), metallic=0.1, roughness=0.15, emission=(0.80, 0.28, 1.0), emission_strength=3.8),
    }
    b = MeshRigBuilder("CitadelObelisk_Mesh", mats)
    # Stepped plinth grounded at z=0
    b.add_box((1.20, 1.20, 0.24), "stone", {}, loc=(0, 0, 0.12), bevel=0.04, smooth=False)
    b.add_box((0.92, 0.92, 0.22), "gold", {}, loc=(0, 0, 0.34), bevel=0.03, smooth=False)
    # Tapered gothic monolith spire
    b.add_cone(0.42, 0.22, 1.55, 6, "stone", {}, loc=(0, 0, 1.20), smooth=False)
    b.add_cone(0.24, 0.02, 0.48, 6, "gold", {}, loc=(0, 0, 2.20), smooth=False)
    # Floating crystal & halo ring
    b.add_torus(0.56, 0.035, 20, 8, "gold", {}, loc=(0, 0, 1.58), rot=(math.radians(74), 0, 0))
    b.add_sphere(0.18, "rune", {}, loc=(0, 0, 1.58), scale=(0.8, 0.8, 1.5), u=8, v=6, smooth=False)
    for ang in (0, 90, 180, 270):
        rad = math.radians(ang)
        b.add_box((0.06, 0.06, 0.88), "rune", {}, loc=(math.cos(rad) * 0.33, math.sin(rad) * 0.33, 1.15), bevel=0.01)

    mesh_obj = b.finalize()
    export_rig_asset("citadel_obelisk", PROP_GLB_DIR, mesh_obj, None)


def render_enemies_lineup():
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 640
    scene.render.image_settings.file_format = "PNG"

    world = bpy.data.worlds.new("EnemyWorld")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.07, 0.05, 0.11, 1.0)
    bg.inputs["Strength"].default_value = 0.85

    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=6.5, depth=0.1, location=(0, 0, -0.05))
    floor = bpy.context.active_object
    floor.data.materials.append(make_pbr_mat("Floor", (0.14, 0.13, 0.18), metallic=0.1, roughness=0.65))

    items = [
        (os.path.join(ENEMY_GLB_DIR, "charger.glb"), -3.0),
        (os.path.join(ENEMY_GLB_DIR, "kiter.glb"), -0.8),
        (os.path.join(ENEMY_GLB_DIR, "swarmer.glb"), 1.2),
        (os.path.join(PROP_GLB_DIR, "citadel_obelisk.glb"), 3.2),
    ]
    for path, x in items:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        for o in bpy.data.objects:
            if o not in before and o.parent is None:
                o.location.x += x

    def add_light(name, loc, rot_deg, energy, color):
        ld = bpy.data.lights.new(name=name, type="SUN")
        ld.energy = energy
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

    add_light("Key", (4, -6, 8), (52, 0, 28), 3.2, (1.0, 0.90, 0.82))
    add_light("Fill", (-5, -4, 5), (60, 0, -45), 1.4, (0.65, 0.78, 1.0))
    add_light("Rim", (0, 8, 6), (-50, 0, 180), 2.0, (0.90, 0.70, 1.0))

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 42
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -10.6, 2.05)
    cam.rotation_euler = (Vector((0.0, 0.0, 1.10)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    out_png = os.path.join(PREVIEW_DIR, "enemies_lineup.png")
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print("ENEMY_PREVIEW_RENDERED:", out_png)


if __name__ == "__main__":
    build_charger()
    build_kiter()
    build_swarmer()
    build_citadel_obelisk()
    render_enemies_lineup()
