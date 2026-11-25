"""
Skyforge Arena — Skyrim Nordic Mountain Sanctuary Kit (Blender 5.3)
Follows: blender-director -> genre-rpg + genre-open-world-sandbox + biome-worlds (Arctic)
         + fantasy-worlds (Medieval Nordic) + vegetation-artist + environment-artist
         -> materials -> collision-proxy (cc-blender-skill collision_preflight.py)
         -> asset-optimization -> export-pipeline -> qa-review

Assets produced (1 Blender unit = 1 meter, floor pivot Z = 0):
  1. SM_Env_NordicWordWall_01     -> public/models/props/nordic_word_wall.glb + UCX_ FBX
  2. SM_Veg_NordicPine_01         -> public/models/props/nordic_pine.glb + FBX
  3. SM_Env_GothicBrazierPillar_01 (Skyrim Nordic Brazier Cairn) -> public/models/props/gothic_brazier_pillar.glb + UCX_ FBX
  4. SM_Env_CathedralSpire_01     (Skyrim Nordic Barrow Watchtower) -> public/models/props/cathedral_spire.glb + UCX_ FBX
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, r"C:\Users\CP\.gemini\config\skills\blender-export\scripts")
from collision_preflight import export_collision_fbx

ROOT = Path(r"d:\MY Projects\Blender test")
GLB_DIR = ROOT / "public" / "models" / "props"
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


def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.78, emission=None, emission_strength=0.0):
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
    if emission is not None and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def create_skyrim_materials():
    return {
        "nordic_stone": make_pbr_mat("MAT_Stone_NordicGranite", (0.29, 0.31, 0.34), metallic=0.04, roughness=0.86),
        "barrow_slate": make_pbr_mat("MAT_Stone_BarrowSlate", (0.16, 0.18, 0.21), metallic=0.06, roughness=0.88),
        "moss_stone": make_pbr_mat("MAT_Stone_LichenGranite", (0.24, 0.28, 0.25), metallic=0.02, roughness=0.90),
        "snow": make_pbr_mat("MAT_Snow_AlpineDrift", (0.86, 0.91, 0.96), metallic=0.0, roughness=0.62),
        "timber": make_pbr_mat("MAT_Wood_NordicPineTimber", (0.20, 0.14, 0.10), metallic=0.0, roughness=0.82),
        "pine_needles": make_pbr_mat("MAT_Foliage_SpruceNeedles", (0.09, 0.19, 0.12), metallic=0.0, roughness=0.78),
        "wrought_iron": make_pbr_mat("MAT_Metal_NordicIron", (0.17, 0.18, 0.20), metallic=0.85, roughness=0.44),
        "aged_bronze": make_pbr_mat("MAT_Metal_AncientBronze", (0.48, 0.38, 0.21), metallic=0.82, roughness=0.38),
        "emit_word": make_pbr_mat("MAT_Emissive_DragonWord", (0.48, 0.88, 1.0), metallic=0.05, roughness=0.18, emission=(0.40, 0.86, 1.0), emission_strength=4.5),
        "emit_hearth": make_pbr_mat("MAT_Emissive_HearthEmber", (1.0, 0.50, 0.14), metallic=0.05, roughness=0.22, emission=(1.0, 0.46, 0.12), emission_strength=4.2),
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


def make_mesh_obj(name, bm, materials, collection, smooth_deg=34.0):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
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
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_deg))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def make_convex_collider(render_name, sx, sy, sz, shape, col_collision):
    """Strictly convex closed triangulated outward-winding UCX_ collider for collision_preflight.py."""
    name = f"UCX_{render_name}"
    bm = bmesh.new()
    if shape == "box":
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, sz * 0.5)) @ Matrix.Diagonal((sx, sy, sz, 1.0)))
    else:
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=8,
            radius1=sx, radius2=sy, depth=sz,
            matrix=Matrix.Translation((0, 0, sz * 0.5)),
        )
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    col_collision.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# 1. SM_Env_NordicWordWall_01 — Iconic Curved Skyrim Dragon Shout Word Wall!
#    Faces Blender -Y (Three.js +Z, toward the player when placed at North z=-17.5)
# ─────────────────────────────────────────────────────────────────────────────
def build_nordic_word_wall(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["nordic_stone"], mats["barrow_slate"], mats["snow"], mats["aged_bronze"], mats["emit_word"]]

    # Stepped curved semicircle stone altar steps + 7 monumental carved curved megalith slabs
    arc_r = 4.6
    slab_specs = [
        # (angle_deg, width, height, depth)
        (-48, 1.35, 3.15, 0.88),
        (-32, 1.48, 3.85, 0.96),
        (-16, 1.56, 4.45, 1.06),
        (  0, 1.85, 5.10, 1.18),  # Tall central Word of Power monolith
        ( 16, 1.56, 4.45, 1.06),
        ( 32, 1.48, 3.85, 0.96),
        ( 48, 1.35, 3.15, 0.88),
    ]

    def add_monoliths(sub):
        # Two stepped curved Nordic offering platform steps at base
        for tier, (rad_in, rad_out, h, zc) in enumerate([(2.9, 5.4, 0.28, 0.14), (3.4, 5.1, 0.26, 0.40)]):
            for s in range(-3, 4):
                ang = math.radians(s * 16)
                cx = math.sin(ang) * ((rad_in + rad_out) * 0.5)
                cy = math.cos(ang) * ((rad_in + rad_out) * 0.5) - arc_r + 0.35
                m = Matrix.Translation((cx, cy, zc)) @ Euler((0, 0, -ang)).to_matrix().to_4x4() @ Matrix.Diagonal((1.48, (rad_out - rad_in), h, 1))
                r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
                bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.035, segments=1, affect='EDGES', clamp_overlap=True)

        # 7 Curved Leaning Megalith Stones forming the iconic Skyrim crescent Word Wall!
        for idx, (ang_deg, w, h, d) in enumerate(slab_specs):
            ang = math.radians(ang_deg)
            cx = math.sin(ang) * arc_r
            cy = math.cos(ang) * arc_r - arc_r
            tilt = math.radians(6.5) if idx % 2 == 0 else math.radians(4.5)
            m = (
                Matrix.Translation((cx, cy, h * 0.5 + 0.32))
                @ Euler((0, 0, -ang)).to_matrix().to_4x4()
                @ Euler((tilt, 0, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((w, d, h, 1))
            )
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.075, segments=2, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_monoliths, mat_idx=0)

    # Dark carved relief border frames & Nordic dragon-wing stone side buttresses
    def add_carvings(sub):
        for ang_deg, w, h, d in slab_specs:
            ang = math.radians(ang_deg)
            cx = math.sin(ang) * (arc_r - d * 0.44)
            cy = math.cos(ang) * (arc_r - d * 0.44) - arc_r
            # Horizontal relief band moldings (tier-2 panel break!)
            for frac in (0.28, 0.72):
                m = Matrix.Translation((cx, cy, 0.35 + h * frac)) @ Euler((0, 0, -ang)).to_matrix().to_4x4() @ Matrix.Diagonal((w * 0.88, 0.18, 0.16, 1))
                bmesh.ops.create_cube(sub, size=1.0, matrix=m)
        # Flanking carved Nordic dragon-head plinth stones at outer wings
        for sgn in (-1, 1):
            ang = math.radians(sgn * 58)
            cx = math.sin(ang) * (arc_r + 0.1)
            cy = math.cos(ang) * (arc_r + 0.1) - arc_r
            m = Matrix.Translation((cx, cy, 1.35)) @ Euler((0, 0, -ang)).to_matrix().to_4x4() @ Matrix.Diagonal((0.95, 1.15, 2.5, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.08, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_carvings, mat_idx=1)

    # Thick wind-blown alpine snow caps accumulated along every slab crest and base steps
    def add_snow(sub):
        for ang_deg, w, h, d in slab_specs:
            ang = math.radians(ang_deg)
            cx = math.sin(ang) * (arc_r + 0.12)
            cy = math.cos(ang) * (arc_r + 0.12) - arc_r
            m = Matrix.Translation((cx, cy, h + 0.36)) @ Euler((0, 0, -ang)).to_matrix().to_4x4() @ Matrix.Diagonal((w * 0.98, d * 0.92, 0.30, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.09, segments=2, affect='EDGES', clamp_overlap=True)
        # Base snowdrifts against lower stones
        for sgn in (-1, 0, 1):
            m = Matrix.Translation((sgn * 2.4, -0.55 - abs(sgn) * 0.35, 0.22)) @ Matrix.Diagonal((2.1, 1.3, 0.40, 1))
            bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.5, matrix=m)
    add_bm_part(bm, add_snow, mat_idx=2)

    # Ancient Nordic bronze dragon emblem mounted at central apex
    def add_emblem(sub):
        m = Matrix.Translation((0, -0.58, 4.55)) @ Matrix.Diagonal((0.92, 0.14, 0.42, 1))
        r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.03, segments=1, affect='EDGES', clamp_overlap=True)
        for sgn in (-1, 1):
            wm = Matrix.Translation((sgn * 0.62, -0.56, 4.66)) @ Euler((0, sgn * -0.35, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.55, 0.10, 0.22, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=wm)
    add_bm_part(bm, add_emblem, mat_idx=3)

    # Glowing Glacial-Cyan Dragon Language "Word of Power" carved rune strokes on center monolith!
    def add_dragon_word(sub):
        # Stylized triple dragon-claw dovahzul glyph strokes (sharp angular claw slashes!)
        strokes = [
            # (x, z, w, h, rot_y_deg)
            (-0.42, 2.85, 0.08, 0.92,  14),
            (-0.22, 2.92, 0.08, 0.72, -18),
            (-0.30, 3.18, 0.38, 0.07,   6),
            ( 0.00, 2.88, 0.10, 1.08,   0),
            ( 0.00, 3.35, 0.44, 0.08,  10),
            ( 0.00, 2.48, 0.36, 0.07, -12),
            ( 0.36, 2.86, 0.08, 0.92, -16),
            ( 0.20, 2.75, 0.07, 0.56,  22),
            ( 0.34, 2.65, 0.32, 0.07,  -8),
            # Secondary smaller inscription lines on flanking stones
            (-1.45, 2.45, 0.46, 0.06,  12),
            (-1.42, 2.18, 0.36, 0.06,  -8),
            ( 1.45, 2.45, 0.46, 0.06, -12),
            ( 1.42, 2.18, 0.36, 0.06,   8),
        ]
        for x, z, w, h, ry in strokes:
            # Map x onto curved front face of monolith
            ang = x / arc_r
            cy = math.cos(ang) * (arc_r - 0.56) - arc_r
            m = (
                Matrix.Translation((x, cy, z))
                @ Euler((0, 0, -ang)).to_matrix().to_4x4()
                @ Euler((0, math.radians(ry), 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((w, 0.08, h, 1))
            )
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_dragon_word, mat_idx=4)

    return make_mesh_obj("SM_Env_NordicWordWall_01", bm, m_list, col_geo)


# ─────────────────────────────────────────────────────────────────────────────
# 2. SM_Veg_NordicPine_01 — Skyrim Snow-Laden Alpine Spruce Tree (vegetation-artist)
# ─────────────────────────────────────────────────────────────────────────────
def build_nordic_pine(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["timber"], mats["pine_needles"], mats["snow"]]

    # Tapered bark trunk with grounded root buttresses
    def add_trunk(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.34, radius2=0.06, depth=6.6, matrix=Matrix.Translation((0, 0, 3.3)))
        # 4 Grounded root buttress flares
        for i in range(4):
            ang = i * (math.pi / 2) + 0.35
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((0.26, 0, 0.28)) @ Euler((0, 0.55, 0)).to_matrix().to_4x4()
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=5, radius1=0.18, radius2=0.06, depth=0.72, matrix=m)
    add_bm_part(bm, add_trunk, mat_idx=0)

    # 6 Layered organic evergreen alpine spruce bough tiers with serrated branch silhouette
    tiers = [
        # (z_base, height, r_bottom, twist)
        (1.45, 1.95, 2.15, 0.0),
        (2.55, 1.85, 1.85, 0.42),
        (3.60, 1.75, 1.52, 0.88),
        (4.60, 1.60, 1.20, 1.32),
        (5.55, 1.45, 0.88, 1.75),
        (6.45, 1.35, 0.55, 2.18),
    ]

    def add_foliage(sub):
        for zb, h, rb, twist in tiers:
            # Main flared spruce cone skirt
            ret = bmesh.ops.create_cone(
                sub, cap_ends=True, cap_tris=False, segments=9,
                radius1=rb, radius2=rb * 0.12, depth=h,
                matrix=Matrix.Translation((0, 0, zb + h * 0.5)) @ Euler((0, 0, twist)).to_matrix().to_4x4(),
            )
            # Displace alternating bottom rim verts outward/downward for organic drooping pine boughs!
            for idx, v in enumerate(ret["verts"]):
                if v.co.z < zb + h * 0.35:
                    ang = math.atan2(v.co.y, v.co.x)
                    lobe = 1.0 + 0.22 * math.sin(ang * 5.0 + twist * 2.0)
                    v.co.x *= lobe
                    v.co.y *= lobe
                    v.co.z -= 0.14 * (lobe - 0.85)
    add_bm_part(bm, add_foliage, mat_idx=1)

    # Sculpted alpine snow blankets resting atop each pine bough tier
    def add_snow_caps(sub):
        for zb, h, rb, twist in tiers:
            ret = bmesh.ops.create_cone(
                sub, cap_ends=True, cap_tris=False, segments=9,
                radius1=rb * 0.94, radius2=rb * 0.10, depth=h * 0.72,
                matrix=Matrix.Translation((0, 0, zb + h * 0.68)) @ Euler((0, 0, twist)).to_matrix().to_4x4(),
            )
            for v in ret["verts"]:
                if v.co.z < zb + h * 0.55:
                    ang = math.atan2(v.co.y, v.co.x)
                    lobe = 1.0 + 0.20 * math.sin(ang * 5.0 + twist * 2.0)
                    v.co.x *= lobe
                    v.co.y *= lobe
    add_bm_part(bm, add_snow_caps, mat_idx=2)

    return make_mesh_obj("SM_Veg_NordicPine_01", bm, m_list, col_geo, smooth_deg=42.0)


# ─────────────────────────────────────────────────────────────────────────────
# 3. SM_Env_GothicBrazierPillar_01 (Skyrim Nordic Stone Cairn & Iron Fire-Bowl)
#    Plinth radius = 1.62m matching ARENA_PILLARS physics radius!
# ─────────────────────────────────────────────────────────────────────────────
def build_nordic_brazier_pillar(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["nordic_stone"], mats["moss_stone"], mats["snow"], mats["wrought_iron"], mats["aged_bronze"], mats["emit_hearth"]]

    # Rough-hewn stepped Nordic barrow masonry plinth + octagonal carved granite shaft + corbel cap
    def add_stone(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.64, radius2=1.50, depth=0.46, matrix=Matrix.Translation((0, 0, 0.23)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.42, radius2=1.28, depth=0.38, matrix=Matrix.Translation((0, 0, 0.65)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.10, radius2=0.98, depth=3.10, matrix=Matrix.Translation((0, 0, 2.38)))
        # 8 Carved Nordic vertical relief pilasters
        for i in range(8):
            ang = i * (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.05, 0, 2.36)) @ Matrix.Diagonal((0.20, 0.26, 3.05, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.025, segments=1, affect='EDGES', clamp_overlap=True)
        # Heavy stepped Nordic cap stone (Z 3.92 -> 4.46)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.08, radius2=1.46, depth=0.54, matrix=Matrix.Translation((0, 0, 4.19)))
    add_bm_part(bm, add_stone, mat_idx=0)

    # Lichen-moss weathered block courses & corner buttress stones
    def add_moss_stone(sub):
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.35, 0, 0.82)) @ Euler((0, -0.28, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.36, 0.42, 0.92, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.035, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_moss_stone, mat_idx=1)

    # Drifted snow sitting on plinth ledge & cap rim
    def add_snow(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.52, radius2=1.32, depth=0.14, matrix=Matrix.Translation((0, 0, 0.48)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.48, radius2=1.42, depth=0.14, matrix=Matrix.Translation((0, 0, 4.48)))
    add_bm_part(bm, add_snow, mat_idx=2)

    # Forged Nordic black-iron banding & tripod fire-basket bowl
    def add_iron(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=12, radius1=1.22, radius2=1.22, depth=0.18, matrix=Matrix.Translation((0, 0, 1.55)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.72, radius2=1.10, depth=0.48, matrix=Matrix.Translation((0, 0, 4.74)))
        for i in range(8):
            ang = i * (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.08, 0, 5.12)) @ Euler((0, 0.34, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.08, 0.11, 0.72, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_iron, mat_idx=3)

    # Aged Nordic bronze knotwork collar ring & rivets
    def add_bronze(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=12, radius1=1.18, radius2=1.18, depth=0.22, matrix=Matrix.Translation((0, 0, 3.22)))
        for i in range(8):
            ang = i * (math.pi / 4) + (math.pi / 8)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.22, 0, 3.22)) @ Matrix.Diagonal((0.12, 0.14, 0.18, 1))
            bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=m)
    add_bm_part(bm, add_bronze, mat_idx=4)

    # Warm hearth burning logs/coals inside fire-basket
    def add_embers(sub):
        bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.72, matrix=Matrix.Translation((0, 0, 4.94)) @ Matrix.Diagonal((1.0, 1.0, 0.34, 1)))
    add_bm_part(bm, add_embers, mat_idx=5)

    return make_mesh_obj("SM_Env_GothicBrazierPillar_01", bm, m_list, col_geo)


# ─────────────────────────────────────────────────────────────────────────────
# 4. SM_Env_CathedralSpire_01 (Skyrim Nordic Barrow Watchtower / Ruin Pier)
#    Height ~16.5m; open timber-and-stone beacon lantern cradles warm beacon crystal!
# ─────────────────────────────────────────────────────────────────────────────
def build_nordic_ruin_tower(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["nordic_stone"], mats["barrow_slate"], mats["snow"], mats["timber"], mats["wrought_iron"], mats["aged_bronze"]]

    # Massive battered Nordic stone watchtower body with diagonal stepped buttresses & open belfry
    def add_stone(sub):
        # Broad battered stone fortress base (Z 0 -> 2.8)
        r0 = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0, 1.4)) @ Matrix.Diagonal((3.5, 3.5, 2.8, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r0["verts"] for e in v.link_edges}), offset=0.14, segments=1, affect='EDGES', clamp_overlap=True)
        # Tapering octagonal Nordic watchtower shaft (Z 2.6 -> 12.2)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.62, radius2=1.24, depth=9.6, matrix=Matrix.Translation((0, 0, 7.4)))
        # 4 Heavy Nordic corner stone buttresses
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.72, 0, 5.4)) @ Euler((0, -0.10, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.95, 0.56, 9.6, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.06, segments=1, affect='EDGES', clamp_overlap=True)
        # Parapet stone walkway deck (Z 12.1 -> 12.7)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.42, radius2=1.68, depth=0.65, matrix=Matrix.Translation((0, 0, 12.35)))
        # 8 Crenellated Nordic stone merlons around parapet
        for i in range(8):
            ang = i * (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.48, 0, 13.05)) @ Matrix.Diagonal((0.36, 0.62, 0.85, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.03, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_stone, mat_idx=0)

    # Dark barrow-slate arrow slits & recessed stone arch lintels
    def add_slate(sub):
        for i in range(4):
            ang = i * (math.pi / 2)
            for z_slit in (5.2, 9.2):
                m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.38, 0, z_slit)) @ Matrix.Diagonal((0.28, 0.34, 1.85, 1))
                bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_slate, mat_idx=1)

    # Thick Nordic snow accumulated on parapet roof, buttress shoulders, & base
    def add_snow(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.70, radius2=1.64, depth=0.22, matrix=Matrix.Translation((0, 0, 12.70)))
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.28, 0, 10.35)) @ Matrix.Diagonal((0.92, 0.60, 0.26, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
        # Snow blanket on pitched timber roof
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.55, radius2=0.06, depth=2.65, matrix=Matrix.Translation((0, 0, 17.35)))
    add_bm_part(bm, add_snow, mat_idx=2)

    # Heavy Nordic carved timber belfry posts & steep Nordic stave-church pitched roof!
    def add_timber(sub):
        # 4 Heavy pine timber lantern posts supporting the peaked Nordic roof (Z 12.6 -> 15.9)
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            px = math.cos(ang) * 1.05
            py = math.sin(ang) * 1.05
            bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((px, py, 14.25)) @ Matrix.Diagonal((0.26, 0.26, 3.3, 1)))
        # Pitched Nordic wooden shingle roof eaves under snow cap
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.74, radius2=0.14, depth=2.70, matrix=Matrix.Translation((0, 0, 17.05)))
        # Timber reinforcement collar beams at Z 6.4
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.60, radius2=1.56, depth=0.38, matrix=Matrix.Translation((0, 0, 6.4)))
    add_bm_part(bm, add_timber, mat_idx=3)

    # Iron ridge straps & Nordic dragon-prow roof finials
    def add_iron(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.08, radius2=0.02, depth=1.6, matrix=Matrix.Translation((0, 0, 19.1)))
        for i in range(4):
            ang = i * (math.pi / 2)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.45, 0, 16.05)) @ Euler((0, 0.45, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.14, 0.16, 0.95, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_iron, mat_idx=4)

    # Bronze Nordic shield medallions mounted on tower faces
    def add_bronze(sub):
        for i in range(4):
            ang = i * (math.pi / 2)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.52, 0, 7.2)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=12, radius1=0.42, radius2=0.36, depth=0.12, matrix=m)
    add_bm_part(bm, add_bronze, mat_idx=5)

    return make_mesh_obj("SM_Env_CathedralSpire_01", bm, m_list, col_geo)


def audit_obj(obj, tri_budget=6500):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    tris = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    loose_v = sum(1 for v in bm.verts if not v.link_faces)
    has_uv = len(me.uv_layers) > 0
    scale_ok = all(abs(s - 1.0) < 1e-4 for s in obj.scale)
    min_z = min((obj.matrix_world @ v.co).z for v in bm.verts)
    grounded = abs(min_z) < 0.12
    naming_ok = obj.name.startswith(("SM_Env_", "SM_Veg_")) and all(m.name.startswith("MAT_") for m in obj.data.materials if m)
    bm.free()
    ev.to_mesh_clear()
    passed = (tris <= tri_budget) and (loose_v == 0) and has_uv and scale_ok and grounded and naming_ok
    return {
        "name": obj.name,
        "tris": tris,
        "budget": tri_budget,
        "materials": len(obj.data.materials),
        "min_z": round(min_z, 3),
        "grounded": grounded,
        "has_uv": has_uv,
        "scale_applied": scale_ok,
        "naming_ok": naming_ok,
        "status": "PASS" if passed else "FAIL",
    }


def export_asset(render_obj, collider_obj, glb_name, fbx_name):
    bpy.ops.object.select_all(action='DESELECT')
    render_obj.select_set(True)
    bpy.context.view_layer.objects.active = render_obj
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
    render_obj.select_set(False)

    fbx_path = FBX_DIR / fbx_name
    if fbx_path.exists():
        fbx_path.unlink()
    if collider_obj is not None:
        col_rep = export_collision_fbx(render_obj, [collider_obj], fbx_path)
        col_passed = col_rep["passed"]
    else:
        render_obj.select_set(True)
        bpy.context.view_layer.objects.active = render_obj
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
        render_obj.select_set(False)
        col_passed = True
    return glb_path.stat().st_size, fbx_path.stat().st_size, col_passed


def render_qa_sheet(word_wall, pine, pillar, tower, colliders, col_lights, col_cams):
    for c in colliders:
        c.hide_render = True
        c.hide_viewport = True

    word_wall.location = (-8.2, 1.5, 0.0)
    pine.location = (-1.6, 0.6, 0.0)
    pillar.location = (2.6, -0.4, 0.0)
    tower.location = (7.8, 1.2, 0.0)

    # 1.8m Dragonborn scale reference silhouette
    bm_ref = bmesh.new()
    bmesh.ops.create_cone(bm_ref, cap_ends=True, segments=12, radius1=0.22, radius2=0.24, depth=1.35, matrix=Matrix.Translation((0, 0, 0.675)))
    bmesh.ops.create_icosphere(bm_ref, subdivisions=2, radius=0.14, matrix=Matrix.Translation((0, 0, 1.62)))
    me_ref = bpy.data.meshes.new("SM_Ref_DragonbornScale_Mesh")
    bm_ref.to_mesh(me_ref)
    bm_ref.free()
    ref_obj = bpy.data.objects.new("SM_Ref_DragonbornScale", me_ref)
    ref_obj.location = (0.4, -2.2, 0.0)
    ref_obj.data.materials.append(make_pbr_mat("MAT_Ref_NordicGold", (0.86, 0.72, 0.36), metallic=0.25, roughness=0.45))
    bpy.context.scene.collection.objects.link(ref_obj)

    # Snowy alpine floor
    bpy.ops.mesh.primitive_plane_add(size=80.0, location=(0, 0, 0.0))
    floor = bpy.context.active_object
    floor.name = "SM_QA_AlpineSnowFloor"
    floor.data.materials.append(make_pbr_mat("MAT_QA_AlpineSnow", (0.64, 0.72, 0.80), metallic=0.02, roughness=0.58))

    # Crisp Skyrim boreal sky world
    world = bpy.data.worlds.new("WLD_QA_SkyrimBoreal")
    bpy.context.scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.14, 0.22, 0.34, 1.0)
        bg.inputs["Strength"].default_value = 1.15

    # Crisp cold arctic sun + warm hearth fill
    sun_d = bpy.data.lights.new("LGT_Key_ArcticSun", type='SUN')
    sun_d.energy = 3.8
    sun_d.color = (0.94, 0.96, 1.0)
    sun = bpy.data.objects.new("LGT_Key_ArcticSun", sun_d)
    sun.rotation_euler = (math.radians(48), math.radians(15), math.radians(32))
    col_lights.objects.link(sun)

    pl = bpy.data.lights.new("LGT_Brazier_Hearth", type='POINT')
    pl.energy = 2800
    pl.color = (1.0, 0.56, 0.22)
    po = bpy.data.objects.new("LGT_Brazier_Hearth", pl)
    po.location = (2.6, -0.4, 5.5)
    col_lights.objects.link(po)

    cam_data = bpy.data.cameras.new("CAM_QA_SkyrimKit")
    cam_data.lens = 30
    cam = bpy.data.objects.new("CAM_QA_SkyrimKit", cam_data)
    col_cams.objects.link(cam)
    cam.location = (0.0, -34.0, 9.6)
    direction = Vector((0.0, 0.6, 6.8)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = 'PNG'
    out_img = PREVIEW_DIR / "skyrim_kit_qa_sheet.png"
    scene.render.filepath = str(out_img)
    bpy.ops.render.render(write_still=True)
    return out_img


def main():
    reset_scene()
    col_root = get_or_create_collection("COL_Skyrim_Nordic_Kit")
    col_geo = get_or_create_collection("COL_Geo_Hero", col_root)
    col_col = get_or_create_collection("COL_Collision", col_root)
    col_lights = get_or_create_collection("COL_Lights", col_root)
    col_cams = get_or_create_collection("COL_Cameras", col_root)

    mats = create_skyrim_materials()

    word_wall = build_nordic_word_wall(mats, col_geo)
    word_col = make_convex_collider(word_wall.name, 9.4, 3.2, 5.4, "box", col_col)

    pine = build_nordic_pine(mats, col_geo)

    pillar = build_nordic_brazier_pillar(mats, col_geo)
    pillar_col = make_convex_collider(pillar.name, 1.64, 1.48, 5.2, "cone", col_col)

    tower = build_nordic_ruin_tower(mats, col_geo)
    tower_col = make_convex_collider(tower.name, 2.05, 1.35, 18.8, "cone", col_col)

    results = []
    for obj, col_obj, glb_name, fbx_name in (
        (word_wall, word_col, "nordic_word_wall.glb", "SM_Env_NordicWordWall_01.fbx"),
        (pine, None, "nordic_pine.glb", "SM_Veg_NordicPine_01.fbx"),
        (pillar, pillar_col, "gothic_brazier_pillar.glb", "SM_Env_GothicBrazierPillar_01.fbx"),
        (tower, tower_col, "cathedral_spire.glb", "SM_Env_CathedralSpire_01.fbx"),
    ):
        audit = audit_obj(obj, tri_budget=6500)
        if audit["status"] != "PASS":
            raise RuntimeError(f"Skyrim kit asset optimization gate FAILED for {obj.name}: {audit}")
        glb_sz, fbx_sz, col_ok = export_asset(obj, col_obj, glb_name, fbx_name)
        audit["glb_kb"] = round(glb_sz / 1024, 1)
        audit["fbx_kb"] = round(fbx_sz / 1024, 1)
        audit["collision_preflight_passed"] = col_ok
        results.append(audit)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "Skyforge_Citadel_Kit.blend"))
    qa_img = render_qa_sheet(word_wall, pine, pillar, tower, [word_col, pillar_col, tower_col], col_lights, col_cams)
    print("SKYRIM_KIT_AUDIT_JSON=" + json.dumps(results, indent=2))
    print(f"QA_RENDER={qa_img}")


if __name__ == "__main__":
    main()
