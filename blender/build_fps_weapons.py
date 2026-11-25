"""
Skyforge Arena — Hero First-Person Weapons Hard-Surface Pipeline (Blender 5.3)
Follows: blender-director -> hard-surface -> genre-soulslike + dark-gritty-mood
         -> uv-workflow -> materials -> asset-optimization -> export-pipeline -> qa-review

Coordinate contract for Three.js GLTF (+Y Up export):
  Blender +X -> Three.js +X (Right)
  Blender +Z -> Three.js +Y (Up)
  Blender +Y -> Three.js -Z (Forward away from FPS camera)
  Origin (0, 0, 0) = Grip hand-contact pivot.
"""
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"d:\MY Projects\Blender test")
GLB_DIR = ROOT / "public" / "models" / "weapons"
FBX_DIR = ROOT / "blender" / "exports"
BLEND_DIR = ROOT / "blender" / "sources"
PREVIEW_DIR = ROOT / "blender" / "previews"

for d in (GLB_DIR, FBX_DIR, BLEND_DIR, PREVIEW_DIR):
    d.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    return scene


def get_or_create_collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        if parent is None:
            bpy.context.scene.collection.children.link(col)
        else:
            parent.children.link(col)
    return col


def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0, coat=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    if not mat.node_tree:
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (420, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (120, 0)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def create_master_materials():
    return {
        "dark_steel": make_pbr_mat("MAT_Metal_DarkSteel", (0.14, 0.14, 0.18), metallic=0.92, roughness=0.32, coat=0.15),
        "silver_edge": make_pbr_mat("MAT_Metal_DamascusEdge", (0.66, 0.69, 0.76), metallic=0.96, roughness=0.18, coat=0.25),
        "gilded_bronze": make_pbr_mat("MAT_Metal_GildedBronze", (0.64, 0.49, 0.24), metallic=0.90, roughness=0.26, coat=0.1),
        "crimson_enamel": make_pbr_mat("MAT_Metal_CrimsonEnamel", (0.32, 0.06, 0.14), metallic=0.68, roughness=0.34, coat=0.25),
        "teal_enamel": make_pbr_mat("MAT_Metal_CryptTeal", (0.09, 0.27, 0.28), metallic=0.70, roughness=0.34, coat=0.2),
        "indigo_enamel": make_pbr_mat("MAT_Metal_VoidIndigo", (0.14, 0.12, 0.30), metallic=0.72, roughness=0.32, coat=0.2),
        "ebony_bone": make_pbr_mat("MAT_Organic_CharredBone", (0.20, 0.16, 0.22), metallic=0.12, roughness=0.52),
        "leather": make_pbr_mat("MAT_Leather_GripWrap", (0.09, 0.06, 0.07), metallic=0.05, roughness=0.78),
        "emit_crimson": make_pbr_mat("MAT_Emissive_CrimsonSoul", (0.95, 0.16, 0.34), metallic=0.1, roughness=0.14, emission=(1.0, 0.14, 0.32), emission_strength=4.2),
        "emit_amethyst": make_pbr_mat("MAT_Emissive_AmethystRune", (0.68, 0.36, 0.98), metallic=0.1, roughness=0.15, emission=(0.68, 0.32, 1.0), emission_strength=3.8),
        "emit_emerald": make_pbr_mat("MAT_Emissive_EmeraldFlame", (0.18, 0.88, 0.62), metallic=0.1, roughness=0.14, emission=(0.18, 0.92, 0.62), emission_strength=4.0),
    }


def add_bm_box(bm, size, loc=(0, 0, 0), rot=(0, 0, 0), mat_idx=0, bevel_w=0.0, bevel_seg=1):
    mat = Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
    verts = res["verts"]
    faces = list({f for v in verts if v.is_valid for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
    if bevel_w > 0:
        edges = list({e for f in faces if f.is_valid for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel_w, segments=bevel_seg, affect='EDGES', clamp_overlap=True)
        # Re-assign material on newly created bevel faces nearby
        for f in bm.faces:
            if f.material_index == 0 and mat_idx != 0 and f.calc_center_median() is not None:
                pass
    return verts


def add_bm_part(bm, build_fn, mat_idx=0):
    """Build an isolated sub-bmesh, assign material_index cleanly, and merge into target bm."""
    sub = bmesh.new()
    build_fn(sub)
    bmesh.ops.recalc_face_normals(sub, faces=sub.faces)
    for f in sub.faces:
        f.material_index = mat_idx
    me_tmp = bpy.data.meshes.new("_tmp_sub")
    sub.to_mesh(me_tmp)
    sub.free()
    bm.from_mesh(me_tmp)
    bpy.data.meshes.remove(me_tmp)


def loft_profile(bm, sections, closed=False, cap_ends=True):
    """Loft a list of (center_vec, x_radius, y_radius, z_angle, profile_pts_2d) rings into a crisp mesh."""
    rings = []
    for pts in sections:
        ring = [bm.verts.new(p) for p in pts]
        rings.append(ring)
    n_rings = len(rings)
    n_pts = len(rings[0])
    ring_pairs = list(range(n_rings - 1))
    if closed:
        ring_pairs.append(n_rings - 1)
    for i in ring_pairs:
        r0 = rings[i]
        r1 = rings[(i + 1) % n_rings]
        for j in range(n_pts):
            jn = (j + 1) % n_pts
            try:
                bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
            except ValueError:
                pass
    if cap_ends and not closed:
        try:
            bm.faces.new(list(reversed(rings[0])))
        except ValueError:
            pass
        try:
            bm.faces.new(rings[-1])
        except ValueError:
            pass
    return rings


def make_obj_from_bm(name, bm, materials, collection):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00025)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Remove any loose verts/edges
    loose_v = [v for v in bm.verts if not v.link_faces]
    if loose_v:
        bmesh.ops.delete(bm, geom=loose_v, context='VERTS')

    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    for m in materials:
        mesh.materials.append(m)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    # Smart shading: smooth faces with sharp creases where angle > 36 deg
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(36.0))

    # Smart UV Projection for clean engine texel mapping
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Apply transforms cleanly
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# 1. SM_Weapon_Shadowbow_A (Banshee Ranger Sculpted Recurve Shadowbow)
# ─────────────────────────────────────────────────────────────────────────────
def build_shadowbow(mats, col):
    bm = bmesh.new()
    m_list = [mats["dark_steel"], mats["silver_edge"], mats["crimson_enamel"], mats["leather"], mats["emit_crimson"], mats["emit_amethyst"]]
    # 0=dark_steel, 1=silver_edge, 2=crimson_enamel, 3=leather, 4=emit_crimson, 5=emit_amethyst

    # Sculpted recurve bow limbs lofted along Z (-0.46 to +0.46), curving forward toward +Y (Three.js -Z)
    def add_limbs(sub):
        # Asymmetric faceted gothic bow cross-section (6-point diamond-hex profile)
        samples = [
            # (z, y_offset, half_w_x, half_d_y)
            (-0.46, -0.095, 0.008, 0.011),
            (-0.42, -0.055, 0.013, 0.016),
            (-0.35,  0.035, 0.017, 0.020),
            (-0.26,  0.092, 0.021, 0.024),
            (-0.17,  0.105, 0.023, 0.027),
            (-0.10,  0.072, 0.020, 0.030),
            ( 0.00,  0.048, 0.018, 0.026),
            ( 0.10,  0.072, 0.020, 0.030),
            ( 0.17,  0.105, 0.023, 0.027),
            ( 0.26,  0.092, 0.021, 0.024),
            ( 0.35,  0.035, 0.017, 0.020),
            ( 0.42, -0.055, 0.013, 0.016),
            ( 0.46, -0.095, 0.008, 0.011),
        ]
        sections = []
        for z, yo, wx, dy in samples:
            ring = [
                Vector((0.0, yo + dy * 1.15, z)),
                Vector((wx * 0.85, yo + dy * 0.45, z)),
                Vector((wx, yo - dy * 0.35, z)),
                Vector((0.0, yo - dy * 0.95, z)),
                Vector((-wx, yo - dy * 0.35, z)),
                Vector((-wx * 0.85, yo + dy * 0.45, z)),
            ]
            sections.append(ring)
        loft_profile(sub, sections)
    add_bm_part(bm, add_limbs, mat_idx=0)

    # Ornate silver gothic edge blades flaring off upper & lower limb elbows
    def add_limb_blades(sub):
        for sgn in (-1, 1):
            pts = [
                [Vector((0.0, 0.125, sgn * 0.13)), Vector((0.010, 0.095, sgn * 0.13)), Vector((0.0, 0.075, sgn * 0.13)), Vector((-0.010, 0.095, sgn * 0.13))],
                [Vector((0.0, 0.155, sgn * 0.24)), Vector((0.013, 0.105, sgn * 0.24)), Vector((0.0, 0.088, sgn * 0.24)), Vector((-0.013, 0.105, sgn * 0.24))],
                [Vector((0.0, 0.115, sgn * 0.37)), Vector((0.009, 0.055, sgn * 0.37)), Vector((0.0, 0.038, sgn * 0.37)), Vector((-0.009, 0.055, sgn * 0.37))],
                [Vector((0.0, -0.045, sgn * 0.47)), Vector((0.004, -0.088, sgn * 0.47)), Vector((0.0, -0.098, sgn * 0.47)), Vector((-0.004, -0.088, sgn * 0.47))],
            ]
            if sgn < 0:
                pts = list(reversed(pts))
            loft_profile(sub, pts)
            # Nock claw hooks at bow tips
            m = Matrix.Translation((0, -0.095, sgn * 0.475)) @ Euler((sgn * 0.45, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.022, 0.032, 0.042, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_limb_blades, mat_idx=1)

    # Crimson enameled gothic riser chassis + twin sight window guards (panel break depth)
    def add_riser(sub):
        for side in (-1, 1):
            m = Matrix.Translation((side * 0.024, 0.055, 0.0)) @ Matrix.Diagonal((0.014, 0.068, 0.19, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.003, segments=2, affect='EDGES', clamp_overlap=True)
        # Upper & lower gothic riser crown fins
        for sgn in (-1, 1):
            m = Matrix.Translation((0, 0.098, sgn * 0.105)) @ Euler((sgn * -0.28, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.052, 0.036, 0.062, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.004, segments=2, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_riser, mat_idx=2)

    # Ribbed leather hand-grip centered at (0, 0, 0)
    def add_grip(sub):
        for i in range(6):
            z = -0.055 + i * 0.022
            m = Matrix.Translation((0, 0.024, z)) @ Euler((0.08, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.038, 0.046, 0.016, 1))
            bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.5, matrix=m)
    add_bm_part(bm, add_grip, mat_idx=3)

    # Floating recessed crimson soul-crystal focal gem in riser nose
    def add_soul_gem(sub):
        m = Matrix.Translation((0, 0.112, 0.0)) @ Matrix.Diagonal((0.024, 0.030, 0.068, 1))
        bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=m)
        # Limb rune inlays
        for sgn in (-1, 1):
            m2 = Matrix.Translation((0, 0.112, sgn * 0.22)) @ Matrix.Diagonal((0.014, 0.014, 0.075, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m2)
    add_bm_part(bm, add_soul_gem, mat_idx=4)

    # Taut luminous amethyst arcane bowstring from lower tip to upper tip
    def add_string(sub):
        m = Matrix.Translation((0, -0.095, 0.0))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.0038, radius2=0.0038, depth=0.91, matrix=m)
    add_bm_part(bm, add_string, mat_idx=5)

    return make_obj_from_bm("SM_Weapon_Shadowbow_A", bm, m_list, col)


# ─────────────────────────────────────────────────────────────────────────────
# 2. SM_Weapon_ShadowArrow_A (Nocked Crimson Soul Arrow for Right Hand)
# ─────────────────────────────────────────────────────────────────────────────
def build_shadow_arrow(mats, col):
    bm = bmesh.new()
    m_list = [mats["dark_steel"], mats["silver_edge"], mats["emit_crimson"], mats["emit_amethyst"]]

    # Tapered octagonal obsidian shaft pointing along Blender +Y (Three.js -Z)
    def add_shaft(sub):
        m = Matrix.Translation((0, 0.16, 0)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.0075, radius2=0.009, depth=0.62, matrix=m)
    add_bm_part(bm, add_shaft, mat_idx=0)

    # Collar rings near tip and nock
    def add_collars(sub):
        for y in (0.43, -0.11):
            m = Matrix.Translation((0, y, 0)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.012, radius2=0.012, depth=0.025, matrix=m)
    add_bm_part(bm, add_collars, mat_idx=1)

    # Sculpted barbed crimson crystal broadhead
    def add_broadhead(sub):
        sections = [
            [Vector((0, 0.43, 0.012)), Vector((0.012, 0.43, 0)), Vector((0, 0.43, -0.012)), Vector((-0.012, 0.43, 0))],
            [Vector((0, 0.46, 0.028)), Vector((0.032, 0.45, 0)), Vector((0, 0.46, -0.028)), Vector((-0.032, 0.45, 0))],
            [Vector((0, 0.56, 0.006)), Vector((0.011, 0.56, 0)), Vector((0, 0.56, -0.006)), Vector((-0.011, 0.56, 0))],
            [Vector((0, 0.61, 0.001)), Vector((0.001, 0.61, 0)), Vector((0, 0.61, -0.001)), Vector((-0.001, 0.61, 0))],
        ]
        loft_profile(sub, sections)
    add_bm_part(bm, add_broadhead, mat_idx=2)

    # 3 swept arcane fletching vanes at rear
    def add_fletching(sub):
        for i in range(3):
            ang = i * (2 * math.pi / 3)
            m = Matrix.Translation((0, -0.07, 0)) @ Euler((0, ang, 0)).to_matrix().to_4x4() @ Matrix.Translation((0, 0, 0.018)) @ Euler((-0.25, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.0035, 0.095, 0.032, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_fletching, mat_idx=3)

    return make_obj_from_bm("SM_Weapon_ShadowArrow_A", bm, m_list, col)


# ─────────────────────────────────────────────────────────────────────────────
# 3. SM_Weapon_RunicGlaive_A (Dread Vanguard Sculpted Halberd-Glaive)
# ─────────────────────────────────────────────────────────────────────────────
def build_runic_glaive(mats, col):
    bm = bmesh.new()
    m_list = [mats["dark_steel"], mats["gilded_bronze"], mats["indigo_enamel"], mats["leather"], mats["emit_amethyst"]]
    # Single shared weapon centerline transform: origin (0,0,0) = exact hand grip center!
    axis_m = Euler((-0.24, 0, 0)).to_matrix().to_4x4()

    # Hexagonal iron polearm haft + pommel strictly coaxial on axis_m
    def add_haft(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.019, radius2=0.017, depth=0.82, matrix=axis_m @ Matrix.Translation((0, 0, 0.14)))
        # Spiked counter-pommel at bottom (-Z along axis_m)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.028, radius2=0.003, depth=0.11, matrix=axis_m @ Matrix.Translation((0, 0, -0.32)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_haft, mat_idx=0)

    # Coaxial leather grip wrap rings directly around origin (0,0,0)
    def add_grip(sub):
        for i in range(7):
            z = -0.10 + i * 0.032
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=10, radius1=0.0235, radius2=0.0215, depth=0.022, matrix=axis_m @ Matrix.Translation((0, 0, z)))
    add_bm_part(bm, add_grip, mat_idx=3)

    # Ornate gilded gothic winged collar & socket crossguard at top of haft (z=0.46)
    def add_guard(sub):
        base_m = axis_m @ Matrix.Translation((0, 0, 0.46))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=base_m @ Matrix.Diagonal((0.056, 0.092, 0.068, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.006, segments=2, affect='EDGES', clamp_overlap=True)
        for sgn, tilt in ((1, -0.42), (-1, 0.48)):
            pm = base_m @ Matrix.Translation((0, sgn * 0.062, 0.022)) @ Euler((tilt, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.026, 0.084, 0.024, 1))
            r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=pm)
            bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_guard, mat_idx=1)

    # Sculpted curved gothic halberd-glaive blade body mounted coaxially above socket
    def add_blade(sub):
        base_m = axis_m @ Matrix.Translation((0, 0, 0.46))
        profile_data = [
            (0.02,  0.042, -0.022, 0.014),
            (0.10,  0.086, -0.024, 0.013),
            (0.22,  0.112, -0.020, 0.012),
            (0.34,  0.098, -0.012, 0.010),
            (0.45,  0.064, -0.002, 0.007),
            (0.55,  0.018,  0.006, 0.004),
            (0.60, -0.008, -0.010, 0.001),
        ]
        sections = []
        for zl, yf, yb, ht in profile_data:
            ym = yb + (yf - yb) * 0.35
            pts = [
                base_m @ Vector((0.0, yf, zl)),
                base_m @ Vector((ht, ym, zl)),
                base_m @ Vector((ht * 0.65, yb, zl)),
                base_m @ Vector((-ht * 0.65, yb, zl)),
                base_m @ Vector((-ht, ym, zl)),
            ]
            sections.append(pts)
        loft_profile(sub, sections)
    add_bm_part(bm, add_blade, mat_idx=2)

    # Glowing recessed amethyst rune fuller + socket soul crystal
    def add_runes(sub):
        base_m = axis_m @ Matrix.Translation((0, 0, 0.46))
        fm = base_m @ Matrix.Translation((0, 0.028, 0.24)) @ Euler((0.04, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.028, 0.020, 0.30, 1))
        bmesh.ops.create_cube(sub, size=1.0, matrix=fm)
        cm = base_m @ Matrix.Diagonal((0.066, 0.040, 0.040, 1))
        bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=cm)
    add_bm_part(bm, add_runes, mat_idx=4)

    return make_obj_from_bm("SM_Weapon_RunicGlaive_A", bm, m_list, col)


# ─────────────────────────────────────────────────────────────────────────────
# 4. SM_Weapon_CryptWarhammer_A (Crypt Sentinel Sculpted Gothic Warhammer)
# ─────────────────────────────────────────────────────────────────────────────
def build_crypt_warhammer(mats, col):
    bm = bmesh.new()
    m_list = [mats["dark_steel"], mats["gilded_bronze"], mats["teal_enamel"], mats["leather"], mats["emit_emerald"]]
    # Single shared weapon centerline transform: origin (0,0,0) = exact hand grip center!
    axis_m = Euler((-0.18, 0, 0)).to_matrix().to_4x4()

    # Reinforced octagonal steel haft + gothic pommel strictly coaxial on axis_m
    def add_haft(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.022, radius2=0.024, depth=0.72, matrix=axis_m @ Matrix.Translation((0, 0, 0.20)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.034, radius2=0.004, depth=0.095, matrix=axis_m @ Matrix.Translation((0, 0, -0.20)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_haft, mat_idx=0)

    # Coaxial leather grip rings around (0,0,0)
    def add_grip(sub):
        for i in range(6):
            z = -0.08 + i * 0.032
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=10, radius1=0.0265, radius2=0.025, depth=0.022, matrix=axis_m @ Matrix.Translation((0, 0, z)))
    add_bm_part(bm, add_grip, mat_idx=3)

    # Heavy beveled twin-anvil gothic hammer head at top of haft (z=0.50)
    def add_head(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Diagonal((0.15, 0.18, 0.16, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.014, segments=2, affect='EDGES', clamp_overlap=True)
        for sgn in (-1, 1):
            fm = hm @ Matrix.Translation((0, sgn * 0.125, 0)) @ Matrix.Diagonal((0.175, 0.072, 0.185, 1))
            r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=fm)
            bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.012, segments=2, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_head, mat_idx=2)

    # Gilded gothic architectural buttress straps + top crown spike + lower socket collar
    def add_gilded_trim(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        for sy in (-0.068, 0.068):
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Translation((0, sy, 0)) @ Matrix.Diagonal((0.168, 0.022, 0.182, 1)))
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=4, radius1=0.048, radius2=0.002, depth=0.145, matrix=hm @ Matrix.Translation((0, 0, 0.145)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.036, radius2=0.044, depth=0.055, matrix=axis_m @ Matrix.Translation((0, 0, 0.39)))
        for sx in (-1, 1):
            bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Translation((sx * 0.082, 0, 0)) @ Matrix.Diagonal((0.020, 0.24, 0.032, 1)))
    add_bm_part(bm, add_gilded_trim, mat_idx=1)

    # Recessed emerald soulfire furnace vents on hammer core
    def add_furnace(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Diagonal((0.162, 0.095, 0.092, 1)))
        for sgn in (-1, 1):
            bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.032, matrix=hm @ Matrix.Translation((0, sgn * 0.162, 0)))
    add_bm_part(bm, add_furnace, mat_idx=4)

    return make_obj_from_bm("SM_Weapon_CryptWarhammer_A", bm, m_list, col)


# ─────────────────────────────────────────────────────────────────────────────
# 5. SM_Weapon_TowerShield_A (Gothic Filigree Tower Shield)
# ─────────────────────────────────────────────────────────────────────────────
def build_tower_shield(mats, col):
    bm = bmesh.new()
    m_list = [mats["teal_enamel"], mats["gilded_bronze"], mats["dark_steel"], mats["emit_emerald"]]
    # Shield thickness along X (front face +X), width along Y, height along Z (matches leftHandGroup)

    # Sculpted curved gothic pointed-arch tower shield body
    def add_body(sub):
        # Loft top-to-bottom tapered gothic shield with subtle convex bow toward +X
        rows = [
            # (z, half_w_y, bow_x, thick_x)
            (-0.32, 0.012, 0.022, 0.018),
            (-0.24, 0.098, 0.032, 0.022),
            (-0.10, 0.155, 0.038, 0.024),
            ( 0.08, 0.172, 0.038, 0.024),
            ( 0.24, 0.168, 0.034, 0.024),
            ( 0.30, 0.132, 0.028, 0.020),
            ( 0.33, 0.058, 0.022, 0.016),
        ]
        sections = []
        for z, wy, bx, tx in rows:
            # 6-point curved horizontal cross-section
            pts = [
                Vector((bx + tx * 0.5, 0.0, z)),
                Vector((bx * 0.6 + tx * 0.4, wy * 0.65, z)),
                Vector((tx * 0.2, wy, z)),
                Vector((-tx * 0.5, wy * 0.85, z)),
                Vector((-tx * 0.5, -wy * 0.85, z)),
                Vector((tx * 0.2, -wy, z)),
                Vector((bx * 0.6 + tx * 0.4, -wy * 0.65, z)),
            ]
            sections.append(pts)
        loft_profile(sub, sections)
    add_bm_part(bm, add_body, mat_idx=0)

    # Stepped gilded gothic cross-ribs + perimeter bevel trim bosses
    def add_filigree(sub):
        # Vertical center gothic spine rib
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0.052, 0.0, 0.01)) @ Matrix.Diagonal((0.024, 0.036, 0.58, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.005, segments=1, affect='EDGES', clamp_overlap=True)
        # Horizontal cross bar
        r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0.048, 0.0, 0.08)) @ Matrix.Diagonal((0.024, 0.31, 0.036, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.005, segments=1, affect='EDGES', clamp_overlap=True)
        # Perimeter corner rivets
        for sy, sz in ((-0.13, 0.22), (0.13, 0.22), (-0.12, -0.12), (0.12, -0.12), (0.0, -0.25), (0.0, 0.28)):
            bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.016, matrix=Matrix.Translation((0.042, sy, sz)))
    add_bm_part(bm, add_filigree, mat_idx=1)

    # Rear forged iron grip handle at (0, 0, 0)
    def add_back_grip(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.014, radius2=0.014, depth=0.18, matrix=Matrix.Translation((-0.038, 0, 0)))
    add_bm_part(bm, add_back_grip, mat_idx=2)

    # Recessed central glowing emerald boss jewel
    def add_jewel(sub):
        bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=Matrix.Translation((0.068, 0.0, 0.08)) @ Matrix.Diagonal((0.032, 0.064, 0.092, 1)))
    add_bm_part(bm, add_jewel, mat_idx=3)

    return make_obj_from_bm("SM_Weapon_TowerShield_A", bm, m_list, col)


# ─────────────────────────────────────────────────────────────────────────────
# 6. SM_Weapon_BloodmoonOdachi_A (Bloodmoon Ronin Curved Katana / Odachi)
# ─────────────────────────────────────────────────────────────────────────────
def build_bloodmoon_odachi(mats, col):
    bm = bmesh.new()
    m_list = [mats["silver_edge"], mats["gilded_bronze"], mats["crimson_enamel"], mats["leather"], mats["emit_crimson"]]

    # Diamond-wrapped tsuka handle + kashira pommel cap centered on grip (0,0,0)
    def add_tsuka(sub):
        base_m = Matrix.Translation((0, 0.0, 0.0)) @ Euler((-0.34, 0, 0)).to_matrix().to_4x4()
        # Core oval handle
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=base_m @ Matrix.Translation((0, 0, -0.02)) @ Matrix.Diagonal((0.024, 0.036, 0.27, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.005, segments=2, affect='EDGES', clamp_overlap=True)
        # Wrapped ito diamond ridges
        for i in range(8):
            z = -0.13 + i * 0.031
            bmesh.ops.create_cube(sub, size=1.0, matrix=base_m @ Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((0.028, 0.041, 0.015, 1)))
    add_bm_part(bm, add_tsuka, mat_idx=3)

    # Ornate gothic scalloped tsuba handguard + habaki blade collar + kashira pommel
    def add_fittings(sub):
        base_m = Matrix.Translation((0, 0.0, 0.0)) @ Euler((-0.34, 0, 0)).to_matrix().to_4x4()
        # Tsuba disc with gothic notch cutouts
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=12, radius1=0.062, radius2=0.058, depth=0.014, matrix=base_m @ Matrix.Translation((0, 0, 0.125)))
        # Raised gothic rim lugs on tsuba
        for i in range(4):
            ang = i * (math.pi / 2)
            lm = base_m @ Matrix.Translation((0, 0, 0.125)) @ Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((0, 0.058, 0)) @ Matrix.Diagonal((0.022, 0.020, 0.020, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=lm)
        # Stepped habaki collar above tsuba
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=base_m @ Matrix.Translation((0, 0, 0.155)) @ Matrix.Diagonal((0.022, 0.044, 0.045, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.003, segments=1, affect='EDGES', clamp_overlap=True)
        # Kashira pommel cap
        r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=base_m @ Matrix.Translation((0, 0, -0.165)) @ Matrix.Diagonal((0.028, 0.042, 0.028, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_fittings, mat_idx=1)

    # Curved Shinogi-Zukuri Katana/Odachi blade (5-facet authentic cross-section, gentle sori curve!)
    def add_blade(sub):
        base_m = Matrix.Translation((0, 0.0, 0.0)) @ Euler((-0.34, 0, 0)).to_matrix().to_4x4()
        sections = []
        steps = 12
        length = 0.88
        for i in range(steps + 1):
            t = i / steps
            z = 0.17 + t * length
            # Authentic katana sori curvature sweeping slightly backward (-Y) toward tip
            sori_y = -0.058 * (t ** 2)
            # Taper width & thickness near kissaki tip
            taper = 1.0 if t < 0.85 else max(0.06, 1.0 - ((t - 0.85) / 0.15) * 0.94)
            width = 0.048 * (1.0 - 0.22 * t) * taper
            thick = 0.0095 * (1.0 - 0.30 * t) * taper
            y_edge = sori_y + width * 0.58   # Cutting edge faces forward (+Y)
            y_ridge = sori_y - width * 0.08  # Shinogi ridge line
            y_spine = sori_y - width * 0.42  # Mune spine (-Y)
            pts = [
                base_m @ Vector((0.0, y_edge, z)),
                base_m @ Vector((thick, y_ridge, z)),
                base_m @ Vector((thick * 0.72, y_spine, z)),
                base_m @ Vector((-thick * 0.72, y_spine, z)),
                base_m @ Vector((-thick, y_ridge, z)),
            ]
            sections.append(pts)
        loft_profile(sub, sections)
    add_bm_part(bm, add_blade, mat_idx=0)

    # Glowing crimson bloodmoon hamon edge thread + fuller inlay
    def add_hamon(sub):
        base_m = Matrix.Translation((0, 0.0, 0.0)) @ Euler((-0.34, 0, 0)).to_matrix().to_4x4()
        sections = []
        steps = 10
        length = 0.82
        for i in range(steps + 1):
            t = i / steps
            z = 0.18 + t * length
            sori_y = -0.055 * (t ** 2)
            taper = 1.0 if t < 0.88 else max(0.15, 1.0 - ((t - 0.88) / 0.12) * 0.85)
            y_front = sori_y + (0.048 * (1.0 - 0.22 * t)) * 0.60 * taper
            y_back = y_front - 0.011 * taper
            hx = 0.0042 * taper
            pts = [
                base_m @ Vector((0.0, y_front + 0.002, z)),
                base_m @ Vector((hx, y_back, z)),
                base_m @ Vector((0.0, y_back - 0.004, z)),
                base_m @ Vector((-hx, y_back, z)),
            ]
            sections.append(pts)
        loft_profile(sub, sections)
    add_bm_part(bm, add_hamon, mat_idx=4)

    return make_obj_from_bm("SM_Weapon_BloodmoonOdachi_A", bm, m_list, col)


def audit_object(obj, tri_budget=4500):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    tris = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    loose_v = sum(1 for v in bm.verts if not v.link_faces)
    has_uv = len(me.uv_layers) > 0
    scale_ok = all(abs(s - 1.0) < 1e-4 for s in obj.scale)
    mat_count = len(obj.data.materials)
    naming_ok = obj.name.startswith("SM_") and all(m.name.startswith("MAT_") for m in obj.data.materials if m)
    bm.free()
    ev.to_mesh_clear()
    passed = (tris <= tri_budget) and (loose_v == 0) and has_uv and scale_ok and naming_ok and mat_count <= 6
    return {
        "name": obj.name,
        "tris": tris,
        "budget": tri_budget,
        "materials": mat_count,
        "loose_verts": loose_v,
        "has_uv": has_uv,
        "scale_applied": scale_ok,
        "naming_ok": naming_ok,
        "status": "PASS" if passed else "FAIL",
    }


def export_weapon(obj, glb_name, fbx_name, blend_name=None):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    orig_loc = obj.location.copy()
    obj.location = (0, 0, 0)

    glb_path = GLB_DIR / glb_name
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=True,
    )

    fbx_path = FBX_DIR / fbx_name
    bpy.ops.export_scene.fbx(
        filepath=str(fbx_path),
        use_selection=True,
        object_types={'MESH'},
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_ALL',
        bake_space_transform=True,
        use_mesh_modifiers=True,
        mesh_smooth_type='FACE',
        bake_anim=False,
        axis_forward='-Z',
        axis_up='Y',
    )

    obj.location = orig_loc
    obj.select_set(False)
    return glb_path.stat().st_size, fbx_path.stat().st_size


def render_qa_sheet(objs, col_lights, col_cams):
    # Arrange weapons side-by-side in a clear QA gallery lineup
    offsets = [
        (-1.15, 0.0, 0.50),  # Shadowbow
        (-0.72, 0.0, 0.45),  # Shadow Arrow
        (-0.32, 0.0, 0.42),  # Runic Glaive
        ( 0.22, 0.0, 0.35),  # Crypt Warhammer
        ( 0.76, 0.0, 0.50),  # Tower Shield
        ( 1.26, 0.0, 0.36),  # Bloodmoon Odachi
    ]
    rotations = [
        (0.0, 0.0, math.radians(-55)),   # Shadowbow profile + 3/4
        (math.radians(-70), 0.0, math.radians(-30)),
        (0.0, 0.0, math.radians(-65)),
        (0.0, 0.0, math.radians(-55)),
        (0.0, 0.0, math.radians(-72)),
        (0.0, 0.0, math.radians(-68)),
    ]
    for obj, loc, rot in zip(objs, offsets, rotations):
        obj.location = loc
        obj.rotation_euler = rot

    # Subtle obsidian studio floor for reflections/grounding
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0, 0, -0.02))
    floor = bpy.context.active_object
    floor.name = "SM_QA_StudioFloor"
    floor_mat = make_pbr_mat("MAT_QA_ObsidianFloor", (0.04, 0.035, 0.06), metallic=0.15, roughness=0.45)
    floor.data.materials.append(floor_mat)

    # Dark twilight world backdrop
    world = bpy.data.worlds.new("WLD_QA_Twilight")
    bpy.context.scene.world = world
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.04, 0.025, 0.06, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    # Three-point studio lighting (blender-pro-workflow Recipe 3)
    def add_light(name, ltype, energy, color, loc, rot_deg, size=1.5):
        ld = bpy.data.lights.new(name, type=ltype)
        ld.energy = energy
        ld.color = color
        if ltype == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        col_lights.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

    add_light("LGT_Key_Warm", 'AREA', 260, (1.0, 0.90, 0.78), (2.2, -2.6, 2.2), (55, 0, 38), size=1.8)
    add_light("LGT_Fill_Cool", 'AREA', 110, (0.62, 0.76, 1.0), (-2.6, -2.0, 1.4), (65, 0, -48), size=2.4)
    add_light("LGT_Rim_Crimson", 'AREA', 220, (1.0, 0.36, 0.55), (0.0, 2.4, 1.9), (-58, 0, 0), size=2.5)

    # Camera framed cleanly on ALL SIX weapons with breathing margin
    cam_data = bpy.data.cameras.new("CAM_QA_WeaponsLineup")
    cam_data.lens = 36
    cam = bpy.data.objects.new("CAM_QA_WeaponsLineup", cam_data)
    col_cams.objects.link(cam)
    cam.location = (0.04, -3.95, 0.92)
    direction = Vector((0.04, 0.0, 0.62)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = 'PNG'
    out_img = PREVIEW_DIR / "weapons_qa_sheet.png"
    scene.render.filepath = str(out_img)
    bpy.ops.render.render(write_still=True)
    return out_img


def main():
    reset_scene()
    col_root = get_or_create_collection("COL_Weapons_FPS")
    col_geo = get_or_create_collection("COL_Geo_Hero", col_root)
    col_lights = get_or_create_collection("COL_Lights", col_root)
    col_cams = get_or_create_collection("COL_Cameras", col_root)

    mats = create_master_materials()
    weapons = [
        (build_shadowbow(mats, col_geo), "ranger_bow.glb", "SM_Weapon_Shadowbow_A.fbx"),
        (build_shadow_arrow(mats, col_geo), "ranger_arrow.glb", "SM_Weapon_ShadowArrow_A.fbx"),
        (build_runic_glaive(mats, col_geo), "vanguard_glaive.glb", "SM_Weapon_RunicGlaive_A.fbx"),
        (build_crypt_warhammer(mats, col_geo), "sentinel_warhammer.glb", "SM_Weapon_CryptWarhammer_A.fbx"),
        (build_tower_shield(mats, col_geo), "sentinel_shield.glb", "SM_Weapon_TowerShield_A.fbx"),
        (build_bloodmoon_odachi(mats, col_geo), "ronin_odachi.glb", "SM_Weapon_BloodmoonOdachi_A.fbx"),
    ]

    reports = []
    for obj, glb_name, fbx_name in weapons:
        audit = audit_object(obj, tri_budget=4500)
        if audit["status"] != "PASS":
            raise RuntimeError(f"Asset optimization gate FAILED for {obj.name}: {audit}")
        glb_sz, fbx_sz = export_weapon(obj, glb_name, fbx_name)
        audit["glb_kb"] = round(glb_sz / 1024, 1)
        audit["fbx_kb"] = round(fbx_sz / 1024, 1)
        reports.append(audit)

    # Save master .blend source before arranging QA lineup
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "Skyforge_FPS_Weapons.blend"))

    qa_img = render_qa_sheet([w[0] for w in weapons], col_lights, col_cams)
    print("WEAPONS_AUDIT_JSON=" + json.dumps(reports, indent=2))
    print(f"QA_RENDER={qa_img}")


if __name__ == "__main__":
    main()
