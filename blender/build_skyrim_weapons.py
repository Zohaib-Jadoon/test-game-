"""
Skyforge Arena — Skyrim Dragonborn First-Person Weapons Pack (Blender 5.3)
Follows: blender-director -> hard-surface -> genre-rpg + fantasy-worlds (Medieval Nordic)
         -> uv-workflow -> materials -> asset-optimization -> export-pipeline -> qa-review

Exports 1:1 FPS viewmodel scale with Grip Pivot at (0, 0, 0):
  1. SM_Weapon_Shadowbow_A      (Nordic Ironwood & Horn Recurve Bow)     -> ranger_bow.glb
  2. SM_Weapon_ShadowArrow_A    (Forged Steel & Feather Arrow)           -> ranger_arrow.glb
  3. SM_Weapon_RunicGlaive_A    (Ancient Nordic Bearded Steel Battleaxe) -> vanguard_glaive.glb
  4. SM_Weapon_CryptWarhammer_A (Nordic Steel & Bronze Warhammer)        -> sentinel_warhammer.glb
  5. SM_Weapon_TowerShield_A    (Banded Iron & Oak Round Shield)         -> sentinel_shield.glb
  6. SM_Weapon_BloodmoonOdachi_A(Blades Akaviri Dragonbane Katana)       -> ronin_odachi.glb
"""
import json
import math
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


def create_skyrim_weapon_materials():
    return {
        "forged_steel": make_pbr_mat("MAT_Metal_SkyrimSteel", (0.58, 0.62, 0.68), metallic=0.94, roughness=0.26, coat=0.12),
        "dark_iron": make_pbr_mat("MAT_Metal_NordicIron", (0.20, 0.21, 0.24), metallic=0.88, roughness=0.42),
        "aged_bronze": make_pbr_mat("MAT_Metal_NordicBronze", (0.58, 0.45, 0.24), metallic=0.88, roughness=0.32),
        "ash_wood": make_pbr_mat("MAT_Wood_NordicAsh", (0.24, 0.15, 0.09), metallic=0.0, roughness=0.70),
        "oak_planks": make_pbr_mat("MAT_Wood_ShieldOak", (0.30, 0.20, 0.12), metallic=0.0, roughness=0.76),
        "leather": make_pbr_mat("MAT_Leather_StitchedGrip", (0.14, 0.09, 0.06), metallic=0.04, roughness=0.82),
        "horn_bone": make_pbr_mat("MAT_Organic_CarvedHorn", (0.70, 0.64, 0.54), metallic=0.02, roughness=0.52),
        "bowstring": make_pbr_mat("MAT_Fabric_BraidedLinen", (0.74, 0.70, 0.62), metallic=0.0, roughness=0.78),
        "feather": make_pbr_mat("MAT_Organic_HawkFeather", (0.78, 0.73, 0.65), metallic=0.0, roughness=0.74),
        "frost_rune": make_pbr_mat("MAT_Emissive_FrostEnchant", (0.55, 0.90, 1.0), metallic=0.1, roughness=0.16, emission=(0.45, 0.88, 1.0), emission_strength=3.2),
    }


def add_bm_part(bm, build_fn, mat_idx=0):
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


def loft_profile(bm, sections, cap_ends=True):
    rings = [[bm.verts.new(p) for p in pts] for pts in sections]
    n_pts = len(rings[0])
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(n_pts):
            jn = (j + 1) % n_pts
            try:
                bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
            except ValueError:
                pass
    if cap_ends:
        try:
            bm.faces.new(list(reversed(rings[0])))
        except ValueError:
            pass
        try:
            bm.faces.new(rings[-1])
        except ValueError:
            pass


def make_obj_from_bm(name, bm, materials, collection):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00025)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(36.0))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


# 1. Nordic Ironwood & Horn Recurve Bow (Skyrim Hunting / Nordic Bow)
def build_nordic_bow(mats, col):
    bm = bmesh.new()
    m_list = [mats["ash_wood"], mats["dark_iron"], mats["horn_bone"], mats["leather"], mats["bowstring"], mats["aged_bronze"]]

    def add_limbs(sub):
        samples = [
            (-0.47, -0.105, 0.009, 0.012),
            (-0.42, -0.055, 0.014, 0.017),
            (-0.34,  0.042, 0.018, 0.021),
            (-0.24,  0.098, 0.022, 0.025),
            (-0.14,  0.102, 0.024, 0.028),
            (-0.08,  0.068, 0.020, 0.028),
            ( 0.00,  0.042, 0.018, 0.024),
            ( 0.08,  0.068, 0.020, 0.028),
            ( 0.14,  0.102, 0.024, 0.028),
            ( 0.24,  0.098, 0.022, 0.025),
            ( 0.34,  0.042, 0.018, 0.021),
            ( 0.42, -0.055, 0.014, 0.017),
            ( 0.47, -0.105, 0.009, 0.012),
        ]
        sections = []
        for z, yo, wx, dy in samples:
            sections.append([
                Vector((0.0, yo + dy * 1.1, z)),
                Vector((wx * 0.85, yo + dy * 0.4, z)),
                Vector((wx, yo - dy * 0.4, z)),
                Vector((0.0, yo - dy * 0.9, z)),
                Vector((-wx, yo - dy * 0.4, z)),
                Vector((-wx * 0.85, yo + dy * 0.4, z)),
            ])
        loft_profile(sub, sections)
    add_bm_part(bm, add_limbs, mat_idx=0)

    # Forged Nordic iron limb reinforcement plates & arrow rest
    def add_iron_braces(sub):
        for sgn in (-1, 1):
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0.098, sgn * 0.16)) @ Euler((sgn * -0.14, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.052, 0.044, 0.088, 1)))
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
            # Sight guard wing
            r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0.072, sgn * 0.095)) @ Matrix.Diagonal((0.046, 0.056, 0.026, 1)))
            bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.003, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_iron_braces, mat_idx=1)

    # Carved elk-horn recurve tips & decorative limb inlay strips
    def add_horn(sub):
        for sgn in (-1, 1):
            m = Matrix.Translation((0, -0.095, sgn * 0.465)) @ Euler((sgn * 0.55, 0, 0)).to_matrix().to_4x4()
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.015, radius2=0.004, depth=0.09, matrix=m)
            # Outer horn backstrip along curved elbows
            bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0.118, sgn * 0.25)) @ Euler((sgn * 0.22, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.024, 0.014, 0.14, 1)))
    add_bm_part(bm, add_horn, mat_idx=2)

    # Stitched leather grip centered at (0, 0, 0)
    def add_grip(sub):
        for i in range(6):
            z = -0.055 + i * 0.022
            bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.5, matrix=Matrix.Translation((0, 0.028, z)) @ Matrix.Diagonal((0.040, 0.048, 0.018, 1)))
    add_bm_part(bm, add_grip, mat_idx=3)

    # Braided linen bowstring
    def add_string(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.0035, radius2=0.0035, depth=0.92, matrix=Matrix.Translation((0, -0.102, 0)))
    add_bm_part(bm, add_string, mat_idx=4)

    # Bronze Nordic rivets on iron limb collars
    def add_rivets(sub):
        for sgn in (-1, 1):
            for sx in (-1, 1):
                bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.007, matrix=Matrix.Translation((sx * 0.026, 0.104, sgn * 0.16)))
    add_bm_part(bm, add_rivets, mat_idx=5)

    return make_obj_from_bm("SM_Weapon_Shadowbow_A", bm, m_list, col)


# 2. Skyrim Forged Steel Arrow
def build_steel_arrow(mats, col):
    bm = bmesh.new()
    m_list = [mats["ash_wood"], mats["forged_steel"], mats["leather"], mats["feather"]]

    def add_shaft(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.0075, radius2=0.0085, depth=0.62, matrix=Matrix.Translation((0, 0.16, 0)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_shaft, mat_idx=0)

    def add_broadhead(sub):
        sections = [
            [Vector((0, 0.43, 0.011)), Vector((0.011, 0.43, 0)), Vector((0, 0.43, -0.011)), Vector((-0.011, 0.43, 0))],
            [Vector((0, 0.46, 0.026)), Vector((0.030, 0.45, 0)), Vector((0, 0.46, -0.026)), Vector((-0.030, 0.45, 0))],
            [Vector((0, 0.56, 0.006)), Vector((0.010, 0.56, 0)), Vector((0, 0.56, -0.006)), Vector((-0.010, 0.56, 0))],
            [Vector((0, 0.61, 0.001)), Vector((0.001, 0.61, 0)), Vector((0, 0.61, -0.001)), Vector((-0.001, 0.61, 0))],
        ]
        loft_profile(sub, sections)
    add_bm_part(bm, add_broadhead, mat_idx=1)

    def add_binding(sub):
        for y in (0.43, -0.11):
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.011, radius2=0.011, depth=0.024, matrix=Matrix.Translation((0, y, 0)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_binding, mat_idx=2)

    def add_fletching(sub):
        for i in range(3):
            ang = i * (2 * math.pi / 3)
            m = Matrix.Translation((0, -0.07, 0)) @ Euler((0, ang, 0)).to_matrix().to_4x4() @ Matrix.Translation((0, 0, 0.018)) @ Euler((-0.24, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.0035, 0.095, 0.030, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_fletching, mat_idx=3)

    return make_obj_from_bm("SM_Weapon_ShadowArrow_A", bm, m_list, col)


# 3. Ancient Nordic Bearded Steel Battleaxe (Vanguard Primary)
def build_nordic_battleaxe(mats, col):
    bm = bmesh.new()
    m_list = [mats["ash_wood"], mats["dark_iron"], mats["forged_steel"], mats["aged_bronze"], mats["leather"]]
    axis_m = Euler((-0.22, 0, 0)).to_matrix().to_4x4()

    def add_haft(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.021, radius2=0.019, depth=0.82, matrix=axis_m @ Matrix.Translation((0, 0, 0.16)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.028, radius2=0.004, depth=0.10, matrix=axis_m @ Matrix.Translation((0, 0, -0.30)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_haft, mat_idx=0)

    def add_socket_iron(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Diagonal((0.052, 0.088, 0.145, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.008, segments=2, affect='EDGES', clamp_overlap=True)
        # Top thrusting spear-spike
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=4, radius1=0.030, radius2=0.002, depth=0.16, matrix=hm @ Matrix.Translation((0, 0, 0.15)))
    add_bm_part(bm, add_socket_iron, mat_idx=1)

    # Double-beveled bearded Nordic crescent axe blades (front large + rear counter-blade!)
    def add_blades(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        for sgn, reach, h_span in ((1, 0.21, 0.18), (-1, 0.15, 0.13)):
            # Loft from thick cheek socket outward along +/-Y to razor edge
            sections = []
            for frac, half_z, half_x in ((0.18, h_span * 0.44, 0.019), (0.55, h_span * 0.78, 0.013), (0.86, h_span * 1.02, 0.006), (1.0, h_span * 0.94, 0.0012)):
                y = sgn * (0.025 + frac * reach)
                # Drop lower beard slightly downward for classic bearded Viking/Skyrim axe look!
                z_top = half_z * 0.85
                z_bot = -half_z * 1.15
                sections.append([
                    hm @ Vector((0.0, y, z_top)),
                    hm @ Vector((half_x, y, 0.0)),
                    hm @ Vector((0.0, y, z_bot)),
                    hm @ Vector((-half_x, y, 0.0)),
                ])
            if sgn < 0:
                sections = list(reversed(sections))
            loft_profile(sub, sections)
    add_bm_part(bm, add_blades, mat_idx=2)

    # Engraved Nordic bronze collar & cheek-plates
    def add_bronze(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.032, radius2=0.038, depth=0.055, matrix=axis_m @ Matrix.Translation((0, 0, 0.39)))
        for sx in (-1, 1):
            bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Translation((sx * 0.028, 0.04, 0)) @ Matrix.Diagonal((0.012, 0.075, 0.088, 1)))
    add_bm_part(bm, add_bronze, mat_idx=3)

    # Coaxial leather grip wrap around (0, 0, 0)
    def add_grip(sub):
        for i in range(7):
            z = -0.10 + i * 0.032
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=10, radius1=0.025, radius2=0.0235, depth=0.022, matrix=axis_m @ Matrix.Translation((0, 0, z)))
    add_bm_part(bm, add_grip, mat_idx=4)

    return make_obj_from_bm("SM_Weapon_RunicGlaive_A", bm, m_list, col)


# 4. Skyrim Steel & Nordic Bronze Warhammer (Sentinel Primary)
def build_nordic_warhammer(mats, col):
    bm = bmesh.new()
    m_list = [mats["ash_wood"], mats["dark_iron"], mats["forged_steel"], mats["aged_bronze"], mats["leather"], mats["frost_rune"]]
    axis_m = Euler((-0.18, 0, 0)).to_matrix().to_4x4()

    def add_haft(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.023, radius2=0.025, depth=0.72, matrix=axis_m @ Matrix.Translation((0, 0, 0.20)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.034, radius2=0.005, depth=0.095, matrix=axis_m @ Matrix.Translation((0, 0, -0.20)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4())
    add_bm_part(bm, add_haft, mat_idx=0)

    def add_iron_core(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Diagonal((0.145, 0.185, 0.155, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.015, segments=2, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_iron_core, mat_idx=1)

    # Forged steel beveled striking anvil face (front +Y) + armor-piercing war-pick beak (rear -Y)
    def add_steel_faces(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Translation((0, 0.125, 0)) @ Matrix.Diagonal((0.172, 0.075, 0.178, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.014, segments=2, affect='EDGES', clamp_overlap=True)
        # Rear piercing crow-beak spike
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=4, radius1=0.068, radius2=0.004, depth=0.19, matrix=hm @ Matrix.Translation((0, -0.175, -0.01)) @ Euler((math.pi / 2 + 0.14, 0, 0)).to_matrix().to_4x4())
        # Top spear-spike crown
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=4, radius1=0.044, radius2=0.003, depth=0.14, matrix=hm @ Matrix.Translation((0, 0, 0.145)))
    add_bm_part(bm, add_steel_faces, mat_idx=2)

    def add_bronze_straps(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.036, radius2=0.046, depth=0.055, matrix=axis_m @ Matrix.Translation((0, 0, 0.39)))
        for sy in (-0.065, 0.065):
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Translation((0, sy, 0)) @ Matrix.Diagonal((0.165, 0.022, 0.172, 1)))
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_bronze_straps, mat_idx=3)

    def add_grip(sub):
        for i in range(6):
            z = -0.08 + i * 0.032
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=10, radius1=0.027, radius2=0.0255, depth=0.022, matrix=axis_m @ Matrix.Translation((0, 0, z)))
    add_bm_part(bm, add_grip, mat_idx=4)

    # Subtle engraved Nordic frost enchantment rune strip along hammer cheeks
    def add_frost_rune(sub):
        hm = axis_m @ Matrix.Translation((0, 0, 0.50))
        bmesh.ops.create_cube(sub, size=1.0, matrix=hm @ Matrix.Diagonal((0.156, 0.072, 0.036, 1)))
    add_bm_part(bm, add_frost_rune, mat_idx=5)

    return make_obj_from_bm("SM_Weapon_CryptWarhammer_A", bm, m_list, col)


# 5. Iconic Skyrim Banded Iron & Oak Round Shield (Front faces +X, matching leftHandGroup)
def build_banded_iron_shield(mats, col):
    bm = bmesh.new()
    m_list = [mats["oak_planks"], mats["dark_iron"], mats["forged_steel"], mats["aged_bronze"]]

    # Circular beveled oak wood shield body (radius 0.28m, aligned in Y-Z plane, face toward +X)
    def add_oak_body(sub):
        m = Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=20, radius1=0.28, radius2=0.27, depth=0.032, matrix=m)
    add_bm_part(bm, add_oak_body, mat_idx=0)

    # Heavy riveted iron outer rim ring + cross reinforcement straps + rear iron handle
    def add_iron_bands(sub):
        # 16-segment outer iron band collar around shield perimeter
        r_rim = 0.275
        n = 16
        chord = 2 * r_rim * math.sin(math.pi / n) + 0.012
        for i in range(n):
            ang = (i + 0.5) * (2 * math.pi / n)
            cy = math.cos(ang) * r_rim
            cz = math.sin(ang) * r_rim
            m = Matrix.Translation((0.002, cy, cz)) @ Euler((ang, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.044, 0.028, chord, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
        # Crossed iron reinforcement straps across oak face
        bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0.020, 0, 0)) @ Matrix.Diagonal((0.014, 0.52, 0.042, 1)))
        bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0.020, 0, 0)) @ Matrix.Diagonal((0.014, 0.042, 0.52, 1)))
        # Rear handle bar at X = -0.04
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.014, radius2=0.014, depth=0.18, matrix=Matrix.Translation((-0.038, 0, 0)))
    add_bm_part(bm, add_iron_bands, mat_idx=1)

    # Raised hammered steel central shield boss (umbo)
    def add_steel_boss(sub):
        bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.088, matrix=Matrix.Translation((0.022, 0, 0)) @ Matrix.Diagonal((0.68, 1.0, 1.0, 1)))
    add_bm_part(bm, add_steel_boss, mat_idx=2)

    # Riveted aged-bronze decorative bosses around outer rim & boss collar
    def add_rivets(sub):
        for i in range(8):
            ang = i * (math.pi / 4)
            bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.014, matrix=Matrix.Translation((0.026, math.cos(ang) * 0.245, math.sin(ang) * 0.245)))
            bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.010, matrix=Matrix.Translation((0.028, math.cos(ang) * 0.102, math.sin(ang) * 0.102)))
    add_bm_part(bm, add_rivets, mat_idx=3)

    return make_obj_from_bm("SM_Weapon_TowerShield_A", bm, m_list, col)


# 6. Skyrim Blades Akaviri Dragonbane Katana (Ronin Primary)
def build_blades_katana(mats, col):
    bm = bmesh.new()
    m_list = [mats["forged_steel"], mats["aged_bronze"], mats["leather"], mats["frost_rune"]]
    axis_m = Euler((-0.34, 0, 0)).to_matrix().to_4x4()

    def add_blade(sub):
        sections = []
        steps = 12
        length = 0.88
        for i in range(steps + 1):
            t = i / steps
            z = 0.17 + t * length
            sori_y = -0.058 * (t ** 2)
            taper = 1.0 if t < 0.85 else max(0.06, 1.0 - ((t - 0.85) / 0.15) * 0.94)
            width = 0.048 * (1.0 - 0.22 * t) * taper
            thick = 0.0095 * (1.0 - 0.30 * t) * taper
            y_edge = sori_y + width * 0.58
            y_ridge = sori_y - width * 0.08
            y_spine = sori_y - width * 0.42
            sections.append([
                axis_m @ Vector((0.0, y_edge, z)),
                axis_m @ Vector((thick, y_ridge, z)),
                axis_m @ Vector((thick * 0.72, y_spine, z)),
                axis_m @ Vector((-thick * 0.72, y_spine, z)),
                axis_m @ Vector((-thick, y_ridge, z)),
            ])
        loft_profile(sub, sections)
    add_bm_part(bm, add_blade, mat_idx=0)

    def add_fittings(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=12, radius1=0.062, radius2=0.058, depth=0.014, matrix=axis_m @ Matrix.Translation((0, 0, 0.125)))
        for i in range(4):
            ang = i * (math.pi / 2)
            lm = axis_m @ Matrix.Translation((0, 0, 0.125)) @ Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((0, 0.058, 0)) @ Matrix.Diagonal((0.022, 0.020, 0.020, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=lm)
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=axis_m @ Matrix.Translation((0, 0, 0.155)) @ Matrix.Diagonal((0.022, 0.044, 0.045, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.003, segments=1, affect='EDGES', clamp_overlap=True)
        r2 = bmesh.ops.create_cube(sub, size=1.0, matrix=axis_m @ Matrix.Translation((0, 0, -0.165)) @ Matrix.Diagonal((0.028, 0.042, 0.028, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r2["verts"] for e in v.link_edges}), offset=0.004, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_fittings, mat_idx=1)

    def add_tsuka(sub):
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=axis_m @ Matrix.Translation((0, 0, -0.02)) @ Matrix.Diagonal((0.024, 0.036, 0.27, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.005, segments=2, affect='EDGES', clamp_overlap=True)
        for i in range(8):
            z = -0.13 + i * 0.031
            bmesh.ops.create_cube(sub, size=1.0, matrix=axis_m @ Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((0.028, 0.041, 0.015, 1)))
    add_bm_part(bm, add_tsuka, mat_idx=2)

    # Subtle glacial-blue Dragonbane enchantment gleam along the blade fuller
    def add_enchant(sub):
        sections = []
        steps = 10
        for i in range(steps + 1):
            t = i / steps
            z = 0.20 + t * 0.76
            sori_y = -0.052 * (t ** 2)
            taper = 1.0 if t < 0.85 else max(0.18, 1.0 - ((t - 0.85) / 0.15) * 0.82)
            y_mid = sori_y + 0.002
            hx = 0.0082 * taper
            sections.append([
                axis_m @ Vector((0.0, y_mid + 0.005, z)),
                axis_m @ Vector((hx, y_mid, z)),
                axis_m @ Vector((0.0, y_mid - 0.005, z)),
                axis_m @ Vector((-hx, y_mid, z)),
            ])
        loft_profile(sub, sections)
    add_bm_part(bm, add_enchant, mat_idx=3)

    return make_obj_from_bm("SM_Weapon_BloodmoonOdachi_A", bm, m_list, col)


def audit_obj(obj, tri_budget=4500):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    tris = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    loose_v = sum(1 for v in bm.verts if not v.link_faces)
    has_uv = len(me.uv_layers) > 0
    scale_ok = all(abs(s - 1.0) < 1e-4 for s in obj.scale)
    naming_ok = obj.name.startswith("SM_") and all(m.name.startswith("MAT_") for m in obj.data.materials if m)
    bm.free()
    ev.to_mesh_clear()
    passed = (tris <= tri_budget) and (loose_v == 0) and has_uv and scale_ok and naming_ok
    return {"name": obj.name, "tris": tris, "materials": len(obj.data.materials), "status": "PASS" if passed else "FAIL"}


def export_weapon(obj, glb_name, fbx_name):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    orig = obj.location.copy()
    obj.location = (0, 0, 0)
    glb_path = GLB_DIR / glb_name
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_materials='EXPORT', export_normals=True, export_texcoords=True,
    )
    fbx_path = FBX_DIR / fbx_name
    bpy.ops.export_scene.fbx(
        filepath=str(fbx_path), use_selection=True, object_types={'MESH'},
        apply_unit_scale=True, apply_scale_options='FBX_SCALE_ALL', bake_space_transform=True,
        use_mesh_modifiers=True, mesh_smooth_type='FACE', bake_anim=False, axis_forward='-Z', axis_up='Y',
    )
    obj.location = orig
    obj.select_set(False)
    return glb_path.stat().st_size, fbx_path.stat().st_size


def render_qa_sheet(objs, col_lights, col_cams):
    offsets = [(-1.25, 0, 0.50), (-0.78, 0, 0.45), (-0.34, 0, 0.40), (0.20, 0, 0.36), (0.76, 0, 0.50), (1.30, 0, 0.36)]
    rots = [(0, 0, math.radians(-58)), (math.radians(-70), 0, math.radians(-30)), (0, 0, math.radians(-64)), (0, 0, math.radians(-58)), (0, 0, math.radians(-72)), (0, 0, math.radians(-68))]
    for obj, loc, rot in zip(objs, offsets, rots):
        obj.location = loc
        obj.rotation_euler = rot

    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0, 0, -0.02))
    fl = bpy.context.active_object
    fl.name = "SM_QA_NordicStoneTable"
    fl.data.materials.append(make_pbr_mat("MAT_QA_NordicSlate", (0.16, 0.18, 0.22), metallic=0.08, roughness=0.68))

    world = bpy.data.worlds.new("WLD_QA_SkyrimStudio")
    bpy.context.scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.10, 0.16, 0.24, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    for name, energy, color, loc, rot_deg, sz in (
        ("LGT_Key_NordicSun", 290, (1.0, 0.96, 0.90), (2.4, -2.8, 2.4), (55, 0, 38), 1.8),
        ("LGT_Fill_AlpineBlue", 120, (0.68, 0.84, 1.0), (-2.6, -2.0, 1.6), (65, 0, -48), 2.4),
        ("LGT_Rim_Hearth", 180, (1.0, 0.68, 0.38), (0.0, 2.4, 1.8), (-58, 0, 0), 2.2),
    ):
        ld = bpy.data.lights.new(name, type='AREA')
        ld.energy = energy
        ld.color = color
        ld.size = sz
        lo = bpy.data.objects.new(name, ld)
        col_lights.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

    cd = bpy.data.cameras.new("CAM_QA_SkyrimWeapons")
    cd.lens = 36
    cam = bpy.data.objects.new("CAM_QA_SkyrimWeapons", cd)
    col_cams.objects.link(cam)
    cam.location = (0.04, -4.15, 0.92)
    cam.rotation_euler = (Vector((0.04, 0.0, 0.60)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1520
    scene.render.resolution_y = 760
    scene.render.image_settings.file_format = 'PNG'
    out = PREVIEW_DIR / "skyrim_weapons_qa_sheet.png"
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    return out


def main():
    reset_scene()
    col_root = get_or_create_collection("COL_Skyrim_Weapons_FPS")
    col_geo = get_or_create_collection("COL_Geo_Hero", col_root)
    col_lights = get_or_create_collection("COL_Lights", col_root)
    col_cams = get_or_create_collection("COL_Cameras", col_root)

    mats = create_skyrim_weapon_materials()
    weapons = [
        (build_nordic_bow(mats, col_geo), "ranger_bow.glb", "SM_Weapon_Shadowbow_A.fbx"),
        (build_steel_arrow(mats, col_geo), "ranger_arrow.glb", "SM_Weapon_ShadowArrow_A.fbx"),
        (build_nordic_battleaxe(mats, col_geo), "vanguard_glaive.glb", "SM_Weapon_RunicGlaive_A.fbx"),
        (build_nordic_warhammer(mats, col_geo), "sentinel_warhammer.glb", "SM_Weapon_CryptWarhammer_A.fbx"),
        (build_banded_iron_shield(mats, col_geo), "sentinel_shield.glb", "SM_Weapon_TowerShield_A.fbx"),
        (build_blades_katana(mats, col_geo), "ronin_odachi.glb", "SM_Weapon_BloodmoonOdachi_A.fbx"),
    ]

    reports = []
    for obj, glb_name, fbx_name in weapons:
        audit = audit_obj(obj)
        if audit["status"] != "PASS":
            raise RuntimeError(f"Optimization failed: {audit}")
        glb_sz, fbx_sz = export_weapon(obj, glb_name, fbx_name)
        audit["glb_kb"] = round(glb_sz / 1024, 1)
        audit["fbx_kb"] = round(fbx_sz / 1024, 1)
        reports.append(audit)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "Skyforge_FPS_Weapons.blend"))
    qa = render_qa_sheet([w[0] for w in weapons], col_lights, col_cams)
    print("SKYRIM_WEAPONS_AUDIT_JSON=" + json.dumps(reports, indent=2))
    print(f"QA_RENDER={qa}")


if __name__ == "__main__":
    main()
