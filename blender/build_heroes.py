"""
Skyforge Arena — Blender 5.3 Hero Character Forge
Generates 5 rigged, animated dark-fantasy hero characters (ranger, vanguard,
sentinel, ronin, ember) with clean topology, PBR Principled BSDF materials,
18-bone humanoid armatures, and 4 baked NLA animation clips (Idle, Run, Attack, Dash).

Exports:
  - public/models/heroes/<id>.glb   (Runtime glTF 2.0 binary for Three.js WebGL & PWA)
  - blender/exports/<id>.fbx        (FBX 7.4 binary for Blender/Unity/Unreal interop)
  - blender/sources/<id>.blend      (Editable Blender source files)
  - blender/previews/heroes_sheet.png (Multi-angle studio render verification)
"""

import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HERO_GLB_DIR = os.path.join(ROOT_DIR, "public", "models", "heroes")
EXPORT_FBX_DIR = os.path.join(ROOT_DIR, "blender", "exports")
SOURCE_BLEND_DIR = os.path.join(ROOT_DIR, "blender", "sources")
PREVIEW_DIR = os.path.join(ROOT_DIR, "blender", "previews")

for d in (HERO_GLB_DIR, EXPORT_FBX_DIR, SOURCE_BLEND_DIR, PREVIEW_DIR):
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


class HeroMeshBuilder:
    """Builds a single multi-material SkinnedMesh with deterministic per-part vertex groups."""

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

    def _assign(self, verts, faces, mat_key, weights):
        mi = self.mat_index[mat_key]
        for f in faces:
            f.material_index = mi
            f.smooth = True
        for v in verts:
            dvert = v[self.deform_layer]
            for bone_name, w in weights.items():
                if w > 0.001:
                    dvert[self._gid(bone_name)] = w

    def _transform_verts(self, verts, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        m_loc = Matrix.Translation(Vector(loc))
        m_rot = Euler(rot, "XYZ").to_matrix().to_4x4()
        m_scl = Matrix.Diagonal((*scale, 1.0))
        mat = m_loc @ m_rot @ m_scl
        bmesh.ops.transform(self.bm, matrix=mat, verts=verts)

    def add_lathe(self, profile_rz, segments, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), cap_bottom=True, cap_top=True, y_scale=1.0, z_weights=None):
        """profile_rz: list of (radius, z) tuples from bottom to top."""
        rings = []
        new_verts = []
        for r, z in profile_rz:
            ring = []
            for i in range(segments):
                ang = (i / segments) * math.tau
                v = self.bm.verts.new((math.cos(ang) * r, math.sin(ang) * r * y_scale, z))
                ring.append(v)
                new_verts.append(v)
            rings.append(ring)

        new_faces = []
        for ri in range(len(rings) - 1):
            r0, r1 = rings[ri], rings[ri + 1]
            for i in range(segments):
                ni = (i + 1) % segments
                try:
                    new_faces.append(self.bm.faces.new((r0[i], r0[ni], r1[ni], r1[i])))
                except ValueError:
                    pass

        if cap_bottom and profile_rz[0][0] > 0.001:
            try:
                new_faces.append(self.bm.faces.new(list(reversed(rings[0]))))
            except ValueError:
                pass
        if cap_top and profile_rz[-1][0] > 0.001:
            try:
                new_faces.append(self.bm.faces.new(rings[-1]))
            except ValueError:
                pass

        self._transform_verts(new_verts, loc, rot, scale)
        if z_weights:
            mi = self.mat_index[mat_key]
            for f in new_faces:
                f.material_index = mi
                f.smooth = True
            for v in new_verts:
                wmap = z_weights(v.co.z)
                dvert = v[self.deform_layer]
                for bn, w in wmap.items():
                    if w > 0.001:
                        dvert[self._gid(bn)] = w
        else:
            self._assign(new_verts, new_faces, mat_key, weights)
        return new_verts

    def add_box(self, size, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
        sx, sy, sz = size
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        self._transform_verts(verts, (0, 0, 0), (0, 0, 0), (sx, sy, sz))
        if bevel > 0.0:
            edges = list({e for v in verts for e in v.link_edges})
            bres = bmesh.ops.bevel(
                self.bm,
                geom=edges,
                offset=bevel,
                offset_type="OFFSET",
                segments=1,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
            verts = [v for v in (set(verts) | set(bres.get("verts", []))) if v.is_valid]
        faces = list({f for v in verts for f in v.link_faces if f.is_valid})
        self._transform_verts(verts, loc, rot, (1, 1, 1))
        self._assign(verts, faces, mat_key, weights)
        return verts

    def add_sphere(self, radius, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), u_segs=14, v_segs=10):
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=u_segs, v_segments=v_segs, radius=radius)
        verts = ret["verts"]
        faces = list({f for v in verts for f in v.link_faces})
        self._transform_verts(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights)
        return verts

    def add_cone(self, r1, r2, depth, segs, mat_key, weights, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        ret = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r1,
            radius2=r2,
            depth=depth,
        )
        verts = ret["verts"]
        faces = list({f for v in verts for f in v.link_faces})
        self._transform_verts(verts, loc, rot, scale)
        self._assign(verts, faces, mat_key, weights)
        return verts

    def add_tube(self, points, radii, segs, mat_key, weights, closed_caps=True):
        """Sweeps a smooth circular tube along a 3D polyline."""
        rings = []
        new_verts = []
        n = len(points)
        prev_up = Vector((1, 0, 0))
        for idx, pt in enumerate(points):
            p = Vector(pt)
            if idx == 0:
                tangent = (Vector(points[1]) - p).normalized()
            elif idx == n - 1:
                tangent = (p - Vector(points[-2])).normalized()
            else:
                tangent = (Vector(points[idx + 1]) - Vector(points[idx - 1])).normalized()
            if abs(tangent.dot(prev_up)) > 0.92:
                prev_up = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((0, 0, 1))
            side = tangent.cross(prev_up).normalized()
            up = side.cross(tangent).normalized()
            prev_up = up

            rad = radii[idx] if isinstance(radii, (list, tuple)) else radii
            ring = []
            for s in range(segs):
                ang = (s / segs) * math.tau
                offset = side * (math.cos(ang) * rad) + up * (math.sin(ang) * rad)
                v = self.bm.verts.new(p + offset)
                ring.append(v)
                new_verts.append(v)
            rings.append(ring)

        new_faces = []
        for ri in range(len(rings) - 1):
            r0, r1 = rings[ri], rings[ri + 1]
            for s in range(segs):
                ns = (s + 1) % segs
                try:
                    new_faces.append(self.bm.faces.new((r0[s], r0[ns], r1[ns], r1[s])))
                except ValueError:
                    pass
        if closed_caps:
            try:
                new_faces.append(self.bm.faces.new(list(reversed(rings[0]))))
                new_faces.append(self.bm.faces.new(rings[-1]))
            except ValueError:
                pass

        self._assign(new_verts, new_faces, mat_key, weights)
        return new_verts

    def add_cloak_sheet(self, top_z, bot_z, top_w, bot_w, back_y, flair_y, rows, cols, mat_key, thickness=0.018):
        """Creates a double-sided sculpted flowing cloak with progressive Cloak_1 -> Cloak_2 weights."""
        front_grid = []
        back_grid = []
        all_verts = []
        for r in range(rows + 1):
            t = r / rows
            z = top_z + (bot_z - top_z) * t
            half_w = (top_w + (bot_w - top_w) * (t ** 0.85)) * 0.5
            y_base = back_y + flair_y * (t ** 1.35)
            f_row = []
            b_row = []
            for c in range(cols + 1):
                u = (c / cols) * 2.0 - 1.0  # -1..1
                x = u * half_w
                # Curved wrap around back & soft drape folds
                curve_y = -0.10 * (1.0 - u * u) + math.sin(u * math.pi * 2.0) * 0.028 * t
                # Subtle tattered bottom hem for dark-fantasy silhouette
                hem_drop = 0.0
                if r == rows:
                    hem_drop = -0.055 * abs(math.sin(u * math.pi * 1.5))
                vf = self.bm.verts.new((x, y_base + curve_y, z + hem_drop))
                vb = self.bm.verts.new((x, y_base + curve_y + thickness, z + hem_drop))
                f_row.append((vf, t))
                b_row.append((vb, t))
                all_verts.append((vf, t))
                all_verts.append((vb, t))
            front_grid.append(f_row)
            back_grid.append(b_row)

        faces = []
        for r in range(rows):
            for c in range(cols):
                a, b = front_grid[r][c][0], front_grid[r][c + 1][0]
                d, e = front_grid[r + 1][c + 1][0], front_grid[r + 1][c][0]
                faces.append(self.bm.faces.new((a, e, d, b)))
                a2, b2 = back_grid[r][c][0], back_grid[r][c + 1][0]
                d2, e2 = back_grid[r + 1][c + 1][0], back_grid[r + 1][c][0]
                faces.append(self.bm.faces.new((a2, b2, d2, e2)))

        # Stitch perimeter rim so cloak is watertight
        for c in range(cols):
            faces.append(self.bm.faces.new((front_grid[0][c][0], front_grid[0][c + 1][0], back_grid[0][c + 1][0], back_grid[0][c][0])))
            faces.append(self.bm.faces.new((front_grid[rows][c][0], back_grid[rows][c][0], back_grid[rows][c + 1][0], front_grid[rows][c + 1][0])))
        for r in range(rows):
            faces.append(self.bm.faces.new((front_grid[r][0][0], back_grid[r][0][0], back_grid[r + 1][0][0], front_grid[r + 1][0][0])))
            faces.append(self.bm.faces.new((front_grid[r][cols][0], front_grid[r + 1][cols][0], back_grid[r + 1][cols][0], back_grid[r][cols][0])))

        mi = self.mat_index[mat_key]
        for f in faces:
            f.material_index = mi
            f.smooth = True
        for v, t in all_verts:
            dvert = v[self.deform_layer]
            if t < 0.2:
                dvert[self._gid("Chest")] = 1.0 - t * 2.5
                dvert[self._gid("Cloak_1")] = t * 2.5
            elif t < 0.6:
                k = (t - 0.2) / 0.4
                dvert[self._gid("Cloak_1")] = 1.0 - k * 0.65
                dvert[self._gid("Cloak_2")] = k * 0.65
            else:
                dvert[self._gid("Cloak_1")] = 0.25 * (1.0 - (t - 0.6) / 0.4)
                dvert[self._gid("Cloak_2")] = 0.75 + 0.25 * ((t - 0.6) / 0.4)

    def finalize(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()

        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for mat in self.materials.values():
            obj.data.materials.append(mat)
        for gname in self.group_names:
            obj.vertex_groups.new(name=gname)
        return obj


def create_humanoid_armature(name):
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    eb = arm_data.edit_bones

    def add_bone(bname, head, tail, parent=None, connected=False):
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent is not None:
            b.parent = eb[parent]
            b.use_connect = connected
        return b

    add_bone("Root", (0, 0, 0.0), (0, 0, 0.25))
    add_bone("Hips", (0, 0, 0.90), (0, 0, 1.04), "Root")
    add_bone("Spine", (0, 0, 1.04), (0, 0, 1.28), "Hips", True)
    add_bone("Chest", (0, 0, 1.28), (0, 0, 1.56), "Spine", True)
    add_bone("Neck", (0, 0, 1.56), (0, 0, 1.66), "Chest", True)
    add_bone("Head", (0, 0, 1.66), (0, 0, 1.98), "Neck", True)

    add_bone("Cloak_1", (0, 0.18, 1.50), (0, 0.25, 0.96), "Chest")
    add_bone("Cloak_2", (0, 0.25, 0.96), (0, 0.34, 0.34), "Cloak_1", True)

    # Note: character faces -Y, so -X is character's RIGHT and +X is character's LEFT
    for side, sx in (("R", -1.0), ("L", 1.0)):
        add_bone(f"Shoulder_{side}", (sx * 0.14, 0.0, 1.50), (sx * 0.30, 0.0, 1.48), "Chest")
        add_bone(f"UpperArm_{side}", (sx * 0.30, 0.0, 1.48), (sx * 0.34, -0.02, 1.18), f"Shoulder_{side}", True)
        add_bone(f"Forearm_{side}", (sx * 0.34, -0.02, 1.18), (sx * 0.35, -0.18, 0.98), f"UpperArm_{side}", True)
        add_bone(f"Hand_{side}", (sx * 0.35, -0.18, 0.98), (sx * 0.35, -0.28, 0.94), f"Forearm_{side}", True)
        add_bone(f"Weapon_{side}", (sx * 0.35, -0.24, 0.96), (sx * 0.35, -0.58, 0.96), f"Hand_{side}")

        add_bone(f"Thigh_{side}", (sx * 0.15, 0.0, 0.90), (sx * 0.16, -0.02, 0.48), "Hips")
        add_bone(f"Shin_{side}", (sx * 0.16, -0.02, 0.48), (sx * 0.16, 0.02, 0.10), f"Thigh_{side}", True)
        add_bone(f"Foot_{side}", (sx * 0.16, 0.02, 0.10), (sx * 0.16, -0.18, 0.02), f"Shin_{side}", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def add_common_limbs(b, slender=False, heavy=False):
    """Builds sculpted articulated legs, greaves, sabatons, arms, and gauntlets."""
    leg_s = 0.88 if slender else (1.16 if heavy else 1.0)
    arm_s = 0.84 if slender else (1.15 if heavy else 1.0)
    hip_x = 0.145 if slender else (0.175 if heavy else 0.16)

    for side, sx in (("R", -1.0), ("L", 1.0)):
        # Thigh armor
        b.add_lathe(
            [(0.088 * leg_s, 0.0), (0.102 * leg_s, 0.22), (0.118 * leg_s, 0.42)],
            12,
            "under",
            {f"Thigh_{side}": 1.0},
            loc=(sx * hip_x, 0.0, 0.48),
        )
        # Knee cop
        b.add_sphere(
            0.095 * leg_s,
            "trim",
            {f"Thigh_{side}": 0.45, f"Shin_{side}": 0.55},
            loc=(sx * hip_x, -0.085 * leg_s, 0.49),
            scale=(0.88, 0.72, 1.15),
            u_segs=10,
            v_segs=8,
        )
        # Sculpted armored greave
        b.add_lathe(
            [
                (0.072 * leg_s, 0.0),
                (0.085 * leg_s, 0.12),
                (0.098 * leg_s, 0.28),
                (0.112 * leg_s, 0.39),
                (0.118 * leg_s, 0.42),
            ],
            12,
            "armor",
            {f"Shin_{side}": 1.0},
            loc=(sx * hip_x, 0.0, 0.08),
        )
        # Boot / Sabaton firmly grounded at z = 0.0
        b.add_box(
            (0.14 * leg_s, 0.27 * leg_s, 0.11),
            "trim",
            {f"Foot_{side}": 1.0},
            loc=(sx * hip_x, -0.055, 0.055),
            bevel=0.025,
        )
        # Toe cap
        b.add_cone(
            0.068 * leg_s,
            0.032 * leg_s,
            0.12,
            8,
            "trim",
            {f"Foot_{side}": 1.0},
            loc=(sx * hip_x, -0.20, 0.048),
            rot=(math.radians(90), 0, 0),
        )

        # Upper arm
        b.add_lathe(
            [(0.062 * arm_s, 0.0), (0.074 * arm_s, 0.16), (0.082 * arm_s, 0.31)],
            10,
            "skin" if slender else "under",
            {f"UpperArm_{side}": 1.0},
            loc=(sx * 0.32, -0.01, 1.17),
        )
        # Elbow guard
        b.add_sphere(
            0.068 * arm_s,
            "trim",
            {f"UpperArm_{side}": 0.5, f"Forearm_{side}": 0.5},
            loc=(sx * 0.34, 0.02, 1.18),
            u_segs=8,
            v_segs=6,
        )
        # Forearm bracer (angled forward toward hand)
        b.add_tube(
            [(sx * 0.34, -0.02, 1.18), (sx * 0.35, -0.10, 1.07), (sx * 0.35, -0.19, 0.98)],
            [0.070 * arm_s, 0.066 * arm_s, 0.058 * arm_s],
            10,
            "armor",
            {f"Forearm_{side}": 1.0},
        )
        # Gauntlet hand
        b.add_sphere(
            0.064 * arm_s,
            "trim",
            {f"Hand_{side}": 1.0},
            loc=(sx * 0.35, -0.22, 0.96),
            scale=(0.85, 1.25, 0.85),
            u_segs=10,
            v_segs=8,
        )


def build_hero_geometry(hero_id):
    if hero_id == "ranger":
        mats = {
            "armor": make_pbr_mat("Ranger_Armor", (0.36, 0.10, 0.22), metallic=0.58, roughness=0.34),
            "under": make_pbr_mat("Ranger_Leather", (0.14, 0.09, 0.11), metallic=0.12, roughness=0.72),
            "trim": make_pbr_mat("Ranger_Silver", (0.74, 0.77, 0.83), metallic=0.88, roughness=0.22),
            "cloak": make_pbr_mat("Ranger_Cloak", (0.42, 0.06, 0.14), metallic=0.05, roughness=0.82),
            "hood": make_pbr_mat("Ranger_Hood", (0.16, 0.21, 0.34), metallic=0.08, roughness=0.78),
            "skin": make_pbr_mat("Ranger_Skin", (0.62, 0.67, 0.78), metallic=0.04, roughness=0.55),
            "hair": make_pbr_mat("Ranger_Hair", (0.82, 0.85, 0.91), metallic=0.18, roughness=0.42),
            "weapon": make_pbr_mat("Ranger_Bow", (0.44, 0.38, 0.24), metallic=0.62, roughness=0.32),
            "glow": make_pbr_mat("Ranger_Glow", (1.0, 0.18, 0.42), metallic=0.1, roughness=0.15, emission=(1.0, 0.12, 0.38), emission_strength=3.6),
            "soul": make_pbr_mat("Ranger_Soul", (0.75, 0.45, 1.0), metallic=0.1, roughness=0.15, emission=(0.72, 0.35, 1.0), emission_strength=3.0),
        }
        b = HeroMeshBuilder("BansheeRanger_Mesh", mats)
        add_common_limbs(b, slender=True)

        # Hourglass sculpted cuirass
        b.add_lathe(
            [
                (0.20, 0.0),
                (0.22, 0.12),
                (0.155, 0.27),
                (0.225, 0.46),
                (0.25, 0.60),
                (0.18, 0.69),
                (0.095, 0.75),
            ],
            16,
            "armor",
            {},
            loc=(0, 0, 0.88),
            y_scale=0.82,
            z_weights=lambda z: {"Hips": 1.0} if z < 1.02 else ({"Spine": 1.0} if z < 1.26 else {"Chest": 1.0}),
        )
        # Belt + ruby buckle + tassets
        b.add_lathe([(0.22, 0.0), (0.23, 0.06), (0.22, 0.11)], 16, "under", {"Hips": 1.0}, loc=(0, 0, 0.94), y_scale=0.86)
        b.add_sphere(0.065, "trim", {"Hips": 1.0}, loc=(0, -0.20, 0.99), scale=(1.1, 0.55, 1.1), u_segs=8, v_segs=6)
        b.add_sphere(0.036, "glow", {"Hips": 1.0}, loc=(0, -0.235, 0.99), scale=(0.9, 0.6, 1.1), u_segs=8, v_segs=6)
        b.add_box((0.18, 0.035, 0.40), "cloak", {"Hips": 0.7, "Thigh_L": 0.15, "Thigh_R": 0.15}, loc=(0, -0.19, 0.74), rot=(math.radians(10), 0, 0), bevel=0.008)
        for side, sx in (("R", -1.0), ("L", 1.0)):
            b.add_box((0.045, 0.24, 0.42), "armor", {"Hips": 0.6, f"Thigh_{side}": 0.4}, loc=(sx * 0.23, 0.0, 0.75), rot=(0, sx * math.radians(-12), 0), bevel=0.01)

        # Feathered spiked pauldrons
        for side, sx in (("R", -1.0), ("L", 1.0)):
            b.add_sphere(0.185, "armor", {f"Shoulder_{side}": 0.7, "Chest": 0.3}, loc=(sx * 0.31, 0.0, 1.51), scale=(1.15, 0.95, 0.78), u_segs=12, v_segs=8)
            b.add_cone(0.065, 0.008, 0.36, 6, "trim", {f"Shoulder_{side}": 0.8, "Chest": 0.2}, loc=(sx * 0.44, 0.05, 1.62), rot=(math.radians(18), sx * math.radians(52), 0))
            b.add_cone(0.052, 0.006, 0.28, 6, "cloak", {f"Shoulder_{side}": 0.8, "Chest": 0.2}, loc=(sx * 0.41, 0.13, 1.54), rot=(math.radians(34), sx * math.radians(58), 0))

        # Sculpted head, elven ears, glowing eyes, cascading hair, open-front deep ranger hood
        b.add_lathe([(0.072, 0.0), (0.066, 0.12)], 10, "skin", {"Neck": 1.0}, loc=(0, -0.01, 1.56))
        b.add_sphere(0.148, "skin", {"Head": 1.0}, loc=(0, -0.04, 1.77), scale=(0.86, 0.94, 1.06), u_segs=14, v_segs=12)
        # Subtle dark brow ridge + glowing twin crimson eyes clearly visible under hood
        b.add_box((0.15, 0.04, 0.024), "under", {"Head": 1.0}, loc=(0, -0.168, 1.825), bevel=0.004)
        for sx in (-1.0, 1.0):
            b.add_sphere(0.025, "glow", {"Head": 1.0}, loc=(sx * 0.052, -0.172, 1.795), scale=(1.35, 0.65, 0.58), u_segs=8, v_segs=6)
            # Pointed elven ears sweeping out past the hood sides
            b.add_cone(0.028, 0.004, 0.22, 5, "skin", {"Head": 1.0}, loc=(sx * 0.175, 0.00, 1.79), rot=(math.radians(18), sx * math.radians(78), 0))
            # Flowing silver hair locks framing face & shoulders
            b.add_tube(
                [(sx * 0.11, -0.07, 1.88), (sx * 0.155, -0.11, 1.73), (sx * 0.17, -0.12, 1.54), (sx * 0.15, -0.08, 1.36)],
                [0.036, 0.040, 0.035, 0.018],
                8,
                "hair",
                {"Head": 0.65, "Chest": 0.35},
            )
        # Open-front arched ranger hood (back dome + top cowl arch + pointed trailing tail, never occluding face)
        b.add_sphere(0.195, "hood", {"Head": 1.0}, loc=(0, 0.085, 1.80), scale=(1.06, 1.05, 1.08), u_segs=14, v_segs=10)
        b.add_tube(
            [(-0.185, -0.04, 1.66), (-0.19, -0.11, 1.83), (-0.11, -0.155, 1.955), (0.0, -0.175, 1.995), (0.11, -0.155, 1.955), (0.19, -0.11, 1.83), (0.185, -0.04, 1.66)],
            [0.048, 0.055, 0.058, 0.062, 0.058, 0.055, 0.048],
            10,
            "hood",
            {"Head": 1.0},
        )
        b.add_cone(0.155, 0.018, 0.38, 8, "hood", {"Head": 1.0}, loc=(0, 0.27, 1.86), rot=(math.radians(74), 0, 0))
        b.add_tube(
            [(-0.19, -0.07, 1.68), (-0.185, -0.145, 1.84), (0.0, -0.195, 1.995), (0.185, -0.145, 1.84), (0.19, -0.07, 1.68)],
            0.016,
            8,
            "trim",
            {"Head": 1.0},
        )

        # Back quiver + 4 arrows
        b.add_cone(0.062, 0.082, 0.56, 10, "under", {"Chest": 1.0}, loc=(0.14, 0.23, 1.32), rot=(math.radians(-14), math.radians(-22), 0))
        for i in range(4):
            a = (i / 4) * math.tau
            ox, oy = math.cos(a) * 0.028, math.sin(a) * 0.028
            b.add_cone(0.010, 0.010, 0.26, 5, "trim", {"Chest": 1.0}, loc=(0.21 + ox, 0.26 + oy, 1.63), rot=(math.radians(-14), math.radians(-22), 0))
            b.add_cone(0.025, 0.004, 0.08, 4, "glow", {"Chest": 1.0}, loc=(0.24 + ox, 0.27 + oy, 1.76), rot=(math.radians(-14), math.radians(-22), 0))

        # Flowing crimson cloak
        b.add_cloak_sheet(1.52, 0.24, 0.50, 0.96, 0.17, 0.24, rows=6, cols=6, mat_key="cloak")

        # Carved Recurve Greatbow on Left Hand (Weapon_L)
        bx, by, bz = 0.35, -0.34, 0.98
        bow_pts = [
            (bx, by + 0.16, bz + 0.84),
            (bx, by - 0.14, bz + 0.62),
            (bx, by - 0.22, bz + 0.28),
            (bx, by - 0.10, bz),
            (bx, by - 0.22, bz - 0.28),
            (bx, by - 0.14, bz - 0.62),
            (bx, by + 0.16, bz - 0.84),
        ]
        b.add_tube(bow_pts, [0.024, 0.044, 0.050, 0.036, 0.050, 0.044, 0.024], 8, "weapon", {"Weapon_L": 1.0})
        b.add_box((0.08, 0.14, 0.26), "trim", {"Weapon_L": 1.0}, loc=(bx, by - 0.14, bz), bevel=0.018)
        b.add_cone(0.045, 0.006, 0.22, 5, "trim", {"Weapon_L": 1.0}, loc=(bx, by + 0.20, bz + 0.92), rot=(math.radians(32), 0, 0))
        b.add_cone(0.045, 0.006, 0.22, 5, "trim", {"Weapon_L": 1.0}, loc=(bx, by + 0.20, bz - 0.92), rot=(math.radians(148), 0, 0))
        # Glowing bowstring
        b.add_tube([(bx, by + 0.15, bz + 0.82), (bx, by + 0.15, bz - 0.82)], 0.009, 6, "soul", {"Weapon_L": 1.0})
        # Shadow arrow in Right Hand (Weapon_R)
        b.add_tube([(-0.35, -0.18, 0.96), (-0.35, -0.96, 0.96)], 0.014, 6, "trim", {"Weapon_R": 1.0})
        b.add_cone(0.044, 0.004, 0.18, 4, "glow", {"Weapon_R": 1.0}, loc=(-0.35, -1.04, 0.96), rot=(math.radians(90), 0, 0))
        return b

    # Shared Gothic Knights / Sentinel / Ronin / Ember
    palettes = {
        "vanguard": {
            "armor": (0.20, 0.19, 0.42),
            "under": (0.10, 0.09, 0.15),
            "trim": (0.80, 0.65, 0.36),
            "cloak": (0.28, 0.14, 0.44),
            "glow": (0.68, 0.34, 1.0),
        },
        "sentinel": {
            "armor": (0.14, 0.36, 0.38),
            "under": (0.10, 0.11, 0.14),
            "trim": (0.82, 0.62, 0.28),
            "cloak": (0.11, 0.24, 0.28),
            "glow": (0.20, 0.92, 0.62),
        },
        "ronin": {
            "armor": (0.44, 0.10, 0.22),
            "under": (0.09, 0.08, 0.12),
            "trim": (0.86, 0.72, 0.42),
            "cloak": (0.58, 0.08, 0.18),
            "glow": (1.0, 0.22, 0.38),
        },
        "ember": {
            "armor": (0.56, 0.13, 0.10),
            "under": (0.14, 0.09, 0.10),
            "trim": (0.88, 0.64, 0.24),
            "cloak": (0.72, 0.24, 0.06),
            "glow": (1.0, 0.56, 0.14),
        },
    }
    p = palettes[hero_id]
    mats = {
        "armor": make_pbr_mat(f"{hero_id}_Armor", p["armor"], metallic=0.66, roughness=0.30),
        "under": make_pbr_mat(f"{hero_id}_Under", p["under"], metallic=0.22, roughness=0.68),
        "trim": make_pbr_mat(f"{hero_id}_Trim", p["trim"], metallic=0.90, roughness=0.20),
        "cloak": make_pbr_mat(f"{hero_id}_Cloak", p["cloak"], metallic=0.06, roughness=0.80),
        "skin": make_pbr_mat(f"{hero_id}_DarkSteel", (0.18, 0.18, 0.22), metallic=0.72, roughness=0.36),
        "glow": make_pbr_mat(f"{hero_id}_Glow", p["glow"], metallic=0.1, roughness=0.12, emission=p["glow"], emission_strength=3.6),
    }

    is_heavy = hero_id == "sentinel"
    is_slender = hero_id == "ronin"
    b = HeroMeshBuilder(f"{hero_id.capitalize()}_Mesh", mats)
    add_common_limbs(b, slender=is_slender, heavy=is_heavy)

    # Armored Cuirass
    cw = 1.15 if is_heavy else (0.94 if is_slender else 1.05)
    b.add_lathe(
        [
            (0.22 * cw, 0.0),
            (0.21 * cw, 0.14),
            (0.29 * cw, 0.42),
            (0.32 * cw, 0.58),
            (0.22 * cw, 0.70),
            (0.12 * cw, 0.76),
        ],
        14,
        "armor",
        {},
        loc=(0, 0, 0.86),
        y_scale=0.80,
        z_weights=lambda z: {"Hips": 1.0} if z < 1.02 else ({"Spine": 1.0} if z < 1.26 else {"Chest": 1.0}),
    )
    # Waist belt & runestone core
    b.add_lathe([(0.24 * cw, 0.0), (0.25 * cw, 0.09), (0.23 * cw, 0.16)], 14, "trim", {"Hips": 1.0}, loc=(0, 0, 0.90), y_scale=0.84)
    b.add_sphere(0.088, "trim", {"Chest": 1.0}, loc=(0, -0.245 * cw, 1.36), scale=(1.0, 0.45, 1.25), u_segs=8, v_segs=6)
    b.add_sphere(0.056, "glow", {"Chest": 1.0}, loc=(0, -0.268 * cw, 1.36), scale=(0.85, 0.5, 1.15), u_segs=8, v_segs=6)

    # Armored Faulds / Skirt Plates
    for side, sx in (("R", -1.0), ("L", 1.0)):
        b.add_box((0.055, 0.28, 0.38), "armor", {"Hips": 0.55, f"Thigh_{side}": 0.45}, loc=(sx * 0.25 * cw, 0.0, 0.74), rot=(0, sx * math.radians(-10), 0), bevel=0.012)
    b.add_box((0.20, 0.045, 0.36), "cloak", {"Hips": 0.8, "Thigh_L": 0.1, "Thigh_R": 0.1}, loc=(0, -0.21 * cw, 0.74), rot=(math.radians(8), 0, 0), bevel=0.01)

    # Pauldrons
    for side, sx in (("R", -1.0), ("L", 1.0)):
        if is_heavy:
            b.add_box((0.28, 0.34, 0.24), "armor", {f"Shoulder_{side}": 0.75, "Chest": 0.25}, loc=(sx * 0.38, 0.0, 1.54), rot=(0, sx * math.radians(18), 0), bevel=0.03)
            b.add_box((0.30, 0.08, 0.26), "trim", {f"Shoulder_{side}": 0.75, "Chest": 0.25}, loc=(sx * 0.38, 0.0, 1.56), rot=(0, sx * math.radians(18), 0), bevel=0.015)
        elif hero_id == "ronin":
            # Layered lamellar sode plates
            for k in range(3):
                b.add_box((0.22 - k * 0.02, 0.24, 0.065), "armor" if k % 2 == 0 else "trim", {f"Shoulder_{side}": 0.8, "Chest": 0.2}, loc=(sx * (0.34 + k * 0.02), 0.0, 1.55 - k * 0.07), rot=(0, sx * math.radians(28), 0), bevel=0.01)
        else:
            b.add_sphere(0.21, "armor", {f"Shoulder_{side}": 0.75, "Chest": 0.25}, loc=(sx * 0.35, 0.0, 1.52), scale=(1.15, 0.96, 0.82), u_segs=12, v_segs=8)
            b.add_cone(0.06, 0.008, 0.34, 6, "trim", {f"Shoulder_{side}": 0.8, "Chest": 0.2}, loc=(sx * 0.48, 0.0, 1.66), rot=(0, sx * math.radians(40), 0))

    # Neck & Helm
    b.add_lathe([(0.095, 0.0), (0.088, 0.12)], 10, "under", {"Neck": 1.0}, loc=(0, 0, 1.56))
    b.add_sphere(0.185, "armor", {"Head": 1.0}, loc=(0, 0.0, 1.79), scale=(0.90, 1.02, 1.08), u_segs=14, v_segs=10)
    # Glowing visor slit
    b.add_box((0.22, 0.08, 0.052), "glow", {"Head": 1.0}, loc=(0, -0.165, 1.80), bevel=0.01)

    if hero_id == "ronin":
        # Wide woven-metal Kasa war hat
        b.add_cone(0.48, 0.04, 0.20, 18, "trim", {"Head": 1.0}, loc=(0, 0.0, 1.98))
        b.add_cone(0.45, 0.06, 0.14, 18, "armor", {"Head": 1.0}, loc=(0, 0.0, 2.00))
    elif hero_id == "sentinel":
        # Crowned Iron Bastion crest
        b.add_box((0.06, 0.32, 0.16), "trim", {"Head": 1.0}, loc=(0, 0.02, 1.99), bevel=0.012)
        b.add_box((0.26, 0.05, 0.12), "trim", {"Head": 1.0}, loc=(0, -0.175, 1.72), bevel=0.01)
    else:
        # Swept Gothic Horns (vanguard & ember)
        for sx in (-1.0, 1.0):
            b.add_tube(
                [(sx * 0.13, -0.02, 1.90), (sx * 0.22, 0.04, 2.04), (sx * 0.18, 0.14, 2.18)],
                [0.044, 0.028, 0.008],
                8,
                "trim",
                {"Head": 1.0},
            )

    # Flowing Cape
    b.add_cloak_sheet(1.52, 0.26, 0.54, 0.92, 0.19, 0.22, rows=6, cols=6, mat_key="cloak")

    # Weapons (Weapon_R = right hand at x=-0.35, Weapon_L = left hand at x=+0.35)
    if hero_id == "sentinel":
        # Massive Filigree Tower Shield on Left Arm
        b.add_box((0.10, 0.58, 1.10), "armor", {"Weapon_L": 1.0}, loc=(0.44, -0.26, 1.02), bevel=0.022)
        b.add_box((0.12, 0.50, 1.02), "trim", {"Weapon_L": 1.0}, loc=(0.44, -0.26, 1.02), bevel=0.015)
        b.add_sphere(0.11, "glow", {"Weapon_L": 1.0}, loc=(0.49, -0.26, 1.08), scale=(0.4, 0.85, 1.2), u_segs=8, v_segs=6)
        # Runic Warhammer in Right Hand
        b.add_tube([(-0.35, 0.18, 0.96), (-0.35, -1.06, 0.96)], 0.032, 8, "trim", {"Weapon_R": 1.0})
        b.add_box((0.26, 0.32, 0.36), "armor", {"Weapon_R": 1.0}, loc=(-0.35, -1.08, 0.96), bevel=0.035)
        b.add_box((0.28, 0.12, 0.22), "glow", {"Weapon_R": 1.0}, loc=(-0.35, -1.08, 0.96), bevel=0.015)
    elif hero_id == "ronin":
        # Bloodmoon Odachi (long curved blade) in Right Hand
        b.add_tube([(-0.35, 0.06, 0.96), (-0.35, -0.34, 0.96)], 0.022, 8, "under", {"Weapon_R": 1.0})
        b.add_cone(0.085, 0.085, 0.028, 12, "trim", {"Weapon_R": 1.0}, loc=(-0.35, -0.35, 0.96), rot=(math.radians(90), 0, 0))
        b.add_box((0.024, 1.38, 0.085), "trim", {"Weapon_R": 1.0}, loc=(-0.35, -1.06, 0.97), rot=(math.radians(2.5), 0, 0), bevel=0.008)
        b.add_box((0.030, 1.34, 0.032), "glow", {"Weapon_R": 1.0}, loc=(-0.35, -1.05, 0.93), rot=(math.radians(2.5), 0, 0), bevel=0.004)
        # Wakizashi short blade on Left Hip
        b.add_tube([(0.24, 0.12, 0.88), (0.28, -0.44, 0.80)], 0.020, 6, "trim", {"Hips": 1.0})
    else:
        # Vanguard / Ember: Runic Glaive or Flame Greatsword + Kite Shield
        b.add_box((0.08, 0.38, 0.62), "armor", {"Weapon_L": 1.0}, loc=(0.42, -0.24, 1.00), bevel=0.02)
        b.add_sphere(0.075, "glow", {"Weapon_L": 1.0}, loc=(0.46, -0.24, 1.02), scale=(0.45, 0.9, 1.15), u_segs=8, v_segs=6)
        b.add_tube([(-0.35, 0.24, 0.96), (-0.35, -0.82, 0.96)], 0.028, 8, "trim", {"Weapon_R": 1.0})
        b.add_box((0.042, 0.88, 0.17), "glow", {"Weapon_R": 1.0}, loc=(-0.35, -1.24, 0.96), bevel=0.012)
        b.add_cone(0.085, 0.008, 0.28, 4, "trim", {"Weapon_R": 1.0}, loc=(-0.35, -1.74, 0.96), rot=(math.radians(90), 0, 0))

    return b


def build_animations(arm_obj, hero_id):
    """Creates 4 clean NLA animation clips: Idle, Run, Attack, Dash."""
    arm_obj.animation_data_create()
    pose = arm_obj.pose.bones

    for pb in pose:
        pb.rotation_mode = "XYZ"

    def reset_pose():
        for pb in pose:
            pb.location = (0, 0, 0)
            pb.rotation_euler = (0, 0, 0)

    def key_all(frame, bone_rots, bone_locs=None):
        reset_pose()
        for bname, rot_deg in bone_rots.items():
            if bname in pose:
                pose[bname].rotation_euler = tuple(math.radians(a) for a in rot_deg)
        if bone_locs:
            for bname, loc in bone_locs.items():
                if bname in pose:
                    pose[bname].location = loc
        for pb in pose:
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
            if bone_locs and pb.name in bone_locs or pb.name == "Hips":
                pb.keyframe_insert(data_path="location", frame=frame)

    def finalize_clip(clip_name, keyframes):
        act = bpy.data.actions.new(name=clip_name)
        arm_obj.animation_data.action = act
        for frame, rots, locs in keyframes:
            key_all(frame, rots, locs)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, act)
        strip.name = clip_name
        arm_obj.animation_data.action = None

    is_archer = hero_id == "ranger"

    # 1. Idle (frames 1..49, seamless loop — heroic battle-ready stance with weapon clear of face)
    idle_base = {
        "UpperArm_R": (-8, 0, -16),
        "Forearm_R": (-10, 0, -8),
        "Weapon_R": (8, 0, -14),
        "UpperArm_L": (-10 if is_archer else -6, 0, 22 if is_archer else 14),
        "Forearm_L": (-6 if is_archer else -10, 0, 12 if is_archer else 6),
        "Cloak_1": (8, 0, 0),
        "Cloak_2": (10, 0, 0),
    }
    idle_mid = {
        "Spine": (3, 0, 2),
        "Chest": (4, 0, -2),
        "Head": (-3, 0, 2),
        "UpperArm_R": (-12, 0, -18),
        "Forearm_R": (-14, 0, -8),
        "Weapon_R": (10, 0, -14),
        "UpperArm_L": (-14 if is_archer else -10, 0, 24 if is_archer else 16),
        "Forearm_L": (-8 if is_archer else -12, 0, 12 if is_archer else 6),
        "Cloak_1": (15, 0, 4),
        "Cloak_2": (20, 0, -5),
    }
    finalize_clip(
        "Idle",
        [
            (1, idle_base, {"Hips": (0, 0, 0.0)}),
            (25, idle_mid, {"Hips": (0, 0, 0.032)}),
            (49, idle_base, {"Hips": (0, 0, 0.0)}),
        ],
    )

    # 2. Run (frames 1..25, energetic athletic stride)
    run_a = {
        "Spine": (14, 0, 6),
        "Chest": (8, 0, 8),
        "Head": (-14, 0, -6),
        "Thigh_R": (42, 0, 0),
        "Shin_R": (-18, 0, 0),
        "Thigh_L": (-38, 0, 0),
        "Shin_L": (-55, 0, 0),
        "UpperArm_R": (-38, 0, -8),
        "Forearm_R": (-35, 0, 0),
        "UpperArm_L": (34, 0, 8),
        "Forearm_L": (-40, 0, 0),
        "Cloak_1": (36, 0, 0),
        "Cloak_2": (28, 0, 0),
    }
    run_b = {
        "Spine": (14, 0, -6),
        "Chest": (8, 0, -8),
        "Head": (-14, 0, 6),
        "Thigh_R": (-38, 0, 0),
        "Shin_R": (-55, 0, 0),
        "Thigh_L": (42, 0, 0),
        "Shin_L": (-18, 0, 0),
        "UpperArm_R": (34, 0, -8),
        "Forearm_R": (-40, 0, 0),
        "UpperArm_L": (-38, 0, 8),
        "Forearm_L": (-35, 0, 0),
        "Cloak_1": (44, 0, 0),
        "Cloak_2": (34, 0, 0),
    }
    run_mid = {
        "Spine": (12, 0, 0),
        "Chest": (6, 0, 0),
        "Head": (-10, 0, 0),
        "Thigh_R": (6, 0, 0),
        "Shin_R": (-28, 0, 0),
        "Thigh_L": (6, 0, 0),
        "Shin_L": (-28, 0, 0),
        "Cloak_1": (40, 0, 0),
        "Cloak_2": (30, 0, 0),
    }
    finalize_clip(
        "Run",
        [
            (1, run_a, {"Hips": (0, 0, -0.04)}),
            (7, run_mid, {"Hips": (0, 0, 0.06)}),
            (13, run_b, {"Hips": (0, 0, -0.04)}),
            (19, run_mid, {"Hips": (0, 0, 0.06)}),
            (25, run_a, {"Hips": (0, 0, -0.04)}),
        ],
    )

    # 3. Attack (frames 1..19, archer bow-draw-release or melee cleave)
    if is_archer:
        atk_frames = [
            (1, idle_base, {"Hips": (0, 0, 0)}),
            (6, {
                "Spine": (4, 0, -28),
                "Chest": (6, 0, -24),
                "Head": (0, 0, 42),
                "UpperArm_L": (-78, 0, -24),
                "Forearm_L": (-10, 0, 0),
                "UpperArm_R": (-65, 0, -35),
                "Forearm_R": (-70, 0, 0),
                "Cloak_1": (24, 0, -10),
                "Cloak_2": (20, 0, -10),
            }, {"Hips": (0, 0, -0.03)}),
            (12, {
                "Spine": (-4, 0, 12),
                "Chest": (-4, 0, 10),
                "Head": (4, 0, -14),
                "UpperArm_L": (-86, 0, 8),
                "UpperArm_R": (-30, 0, -55),
                "Forearm_R": (-15, 0, 0),
                "Cloak_1": (32, 0, 12),
                "Cloak_2": (24, 0, 12),
            }, {"Hips": (0, 0, 0.02)}),
            (19, idle_base, {"Hips": (0, 0, 0)}),
        ]
    else:
        atk_frames = [
            (1, idle_base, {"Hips": (0, 0, 0)}),
            (6, {
                "Spine": (-8, 0, -36),
                "Chest": (-10, 0, -30),
                "Head": (8, 0, 35),
                "UpperArm_R": (-115, 0, -38),
                "Forearm_R": (-28, 0, 0),
                "Weapon_R": (-25, 0, 0),
                "UpperArm_L": (-35, 0, 28),
                "Cloak_1": (26, 0, -18),
            }, {"Hips": (0, 0, -0.05)}),
            (11, {
                "Spine": (20, 0, 44),
                "Chest": (16, 0, 42),
                "Head": (-12, 0, -45),
                "UpperArm_R": (-42, 0, 62),
                "Forearm_R": (-12, 0, 0),
                "Weapon_R": (35, 0, 0),
                "UpperArm_L": (28, 0, 20),
                "Cloak_1": (45, 0, 24),
                "Cloak_2": (35, 0, 20),
            }, {"Hips": (0, -0.06, -0.02)}),
            (19, idle_base, {"Hips": (0, 0, 0)}),
        ]
    finalize_clip("Attack", atk_frames)

    # 4. Dash (frames 1..15, low burst lunge)
    dash_pose = {
        "Spine": (28, 0, 0),
        "Chest": (18, 0, 0),
        "Head": (-30, 0, 0),
        "Thigh_R": (46, 0, 0),
        "Shin_R": (-55, 0, 0),
        "Thigh_L": (-48, 0, 0),
        "Shin_L": (-30, 0, 0),
        "UpperArm_R": (48, 0, -24),
        "UpperArm_L": (48, 0, 24),
        "Cloak_1": (62, 0, 0),
        "Cloak_2": (48, 0, 0),
    }
    finalize_clip(
        "Dash",
        [
            (1, idle_base, {"Hips": (0, 0, 0)}),
            (5, dash_pose, {"Hips": (0, -0.05, -0.14)}),
            (11, dash_pose, {"Hips": (0, -0.05, -0.12)}),
            (15, idle_base, {"Hips": (0, 0, 0)}),
        ],
    )
    reset_pose()


def build_and_export_hero(hero_id):
    clear_scene()
    arm_obj = create_humanoid_armature(f"{hero_id.capitalize()}_Armature")
    builder = build_hero_geometry(hero_id)
    mesh_obj = builder.finalize()

    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj

    build_animations(arm_obj, hero_id)

    # Measure bounds & polygon count
    bpy.context.view_layer.update()
    bbox = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)

    # Save editable .blend
    blend_path = os.path.join(SOURCE_BLEND_DIR, f"{hero_id}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    # Export GLB (runtime Three.js format)
    glb_path = os.path.join(HERO_GLB_DIR, f"{hero_id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_def_bones=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )

    # Export FBX (cross-engine interop & FBXLoader verification)
    fbx_path = os.path.join(EXPORT_FBX_DIR, f"{hero_id}.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx_path,
        use_selection=False,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_nla_strips=True,
        bake_anim_use_all_actions=False,
    )

    glb_kb = round(os.path.getsize(glb_path) / 1024, 1)
    fbx_kb = round(os.path.getsize(fbx_path) / 1024, 1)
    print(f"HERO_OK {hero_id}: tris={tris} z=[{min_z:.3f}, {max_z:.3f}] glb={glb_kb}KB fbx={fbx_kb}KB")


def render_hero_lineup():
    """Imports all 5 exported GLB heroes side-by-side and renders a verification studio preview."""
    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 640
    scene.render.image_settings.file_format = "PNG"

    # Twilight studio world
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.08, 0.06, 0.13, 1.0)
    bg.inputs["Strength"].default_value = 0.85

    # Ground disc
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=8.5, depth=0.1, location=(0, 0, -0.05))
    floor = bpy.context.active_object
    floor.data.materials.append(make_pbr_mat("Floor", (0.14, 0.13, 0.18), metallic=0.1, roughness=0.65))

    hero_ids = ["ranger", "vanguard", "sentinel", "ronin", "ember"]
    xs = [-3.6, -1.8, 0.0, 1.8, 3.6]
    for hid, x in zip(hero_ids, xs):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(HERO_GLB_DIR, f"{hid}.glb"))
        added = [o for o in bpy.data.objects if o not in before and o.parent is None]
        for o in added:
            o.location.x += x
            o.rotation_euler.z = math.radians(-14)

    # Studio 3-point lighting
    def add_light(name, ltype, loc, rot_deg, energy, color):
        ld = bpy.data.lights.new(name=name, type=ltype)
        ld.energy = energy
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

    add_light("Key", "SUN", (4, -6, 8), (52, 0, 28), 3.2, (1.0, 0.90, 0.82))
    add_light("Fill", "SUN", (-5, -4, 5), (60, 0, -45), 1.3, (0.65, 0.78, 1.0))
    add_light("Rim", "SUN", (0, 8, 6), (-50, 0, 180), 2.0, (0.85, 0.72, 1.0))

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 42
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -11.4, 2.05)
    direction = Vector((0.0, 0.0, 1.05)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    out_png = os.path.join(PREVIEW_DIR, "heroes_lineup.png")
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_RENDERED:", out_png)


if __name__ == "__main__":
    for hid in ("ranger", "vanguard", "sentinel", "ronin", "ember"):
        build_and_export_hero(hid)
    render_hero_lineup()
