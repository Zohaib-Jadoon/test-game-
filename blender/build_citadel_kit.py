"""
Skyforge Arena — Soulslike Ruins Citadel Modular Environment Kit (Blender 5.3)
Follows: blender-director -> genre-soulslike -> dark-gritty-mood -> fantasy-worlds
         -> environment-artist -> materials -> collision-proxy (cc-blender-skill collision_preflight.py)
         -> asset-optimization -> export-pipeline -> qa-review

Coordinate contract for Three.js GLTF (+Y Up export):
  Blender +X -> Three.js +X
  Blender +Z -> Three.js +Y (Up; floor pivot at Z = 0)
  Blender +Y -> Three.js -Z
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Load RobLe3/cc-blender-skill collision preflight validator directly!
sys.path.insert(0, r"C:\Users\CP\.gemini\config\skills\blender-export\scripts")
from collision_preflight import collision_report, export_collision_fbx

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


def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.75, emission=None, emission_strength=0.0, coat=0.0):
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


def create_citadel_materials():
    return {
        "basalt": make_pbr_mat("MAT_Stone_ObsidianBasalt", (0.14, 0.125, 0.185), metallic=0.14, roughness=0.76),
        "basalt_dark": make_pbr_mat("MAT_Stone_CharredSlate", (0.075, 0.068, 0.105), metallic=0.18, roughness=0.82),
        "wrought_iron": make_pbr_mat("MAT_Metal_WroughtIron", (0.19, 0.18, 0.23), metallic=0.88, roughness=0.38),
        "gilded_bronze": make_pbr_mat("MAT_Metal_GildedBronze", (0.64, 0.50, 0.25), metallic=0.90, roughness=0.28, coat=0.12),
        "emit_ember": make_pbr_mat("MAT_Emissive_SoulCoal", (1.0, 0.28, 0.24), metallic=0.05, roughness=0.22, emission=(1.0, 0.24, 0.22), emission_strength=4.5),
        "emit_amethyst": make_pbr_mat("MAT_Emissive_SanctuaryRune", (0.72, 0.36, 1.0), metallic=0.05, roughness=0.16, emission=(0.72, 0.34, 1.0), emission_strength=3.8),
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


def make_mesh_obj(name, bm, materials, collection):
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
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(34.0))
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def make_convex_collider(render_name, radius_bottom, radius_top, height, sides, col_collision):
    """Build a strictly convex, closed, triangulated, outward-winding UCX_ collider verified by collision_preflight.py."""
    name = f"UCX_{render_name}"
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=True,
        segments=sides,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=height,
        matrix=Matrix.Translation((0, 0, height * 0.5)),
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
# 1. SM_Env_GothicBrazierPillar_01 (Soulslike Cover Pillar + Iron Fire-Basket)
#    Plinth radius = 1.62m (calibrated to ARENA_PILLARS physics radius = 1.65m)
#    Fire-basket hearth = Z 4.85m (live Three.js flame sits at y = 5.32m!)
# ─────────────────────────────────────────────────────────────────────────────
def build_gothic_brazier_pillar(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["basalt"], mats["basalt_dark"], mats["wrought_iron"], mats["gilded_bronze"], mats["emit_ember"]]

    # 1. Two-tier stepped chamfered octagonal plinth + fluted core + gothic engaged colonnettes
    def add_basalt(sub):
        # Lower base slab (Z 0.0 -> 0.42)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.64, radius2=1.52, depth=0.42, matrix=Matrix.Translation((0, 0, 0.21)))
        # Upper beveled plinth tier (Z 0.42 -> 0.78)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.42, radius2=1.26, depth=0.36, matrix=Matrix.Translation((0, 0, 0.60)))
        # Core octagonal shaft (Z 0.78 -> 3.92)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.06, radius2=0.96, depth=3.14, matrix=Matrix.Translation((0, 0, 2.35)))
        # 8 Gothic engaged clustered colonnette ribs around shaft (real light-catching fluting!)
        for i in range(8):
            ang = i * (math.pi / 4)
            cx = math.cos(ang) * 1.05
            cy = math.sin(ang) * 1.05
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.175, radius2=0.155, depth=3.12, matrix=Matrix.Translation((cx, cy, 2.34)))
        # Flared gothic corbel capital (Z 3.92 -> 4.46)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.08, radius2=1.46, depth=0.54, matrix=Matrix.Translation((0, 0, 4.19)))
        # 8 Carved gothic corbel scroll brackets under capital overhang
        for i in range(8):
            ang = i * (math.pi / 4) + (math.pi / 8)
            m = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.16, 0, 4.02))
                @ Euler((0, 0.42, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.32, 0.22, 0.68, 1))
            )
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.025, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_basalt, mat_idx=0)

    # 2. Recessed dark slate plinth molding & crenellated capital crown merlons
    def add_dark_stone(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.48, radius2=1.44, depth=0.09, matrix=Matrix.Translation((0, 0, 0.43)))
        # 8 Gothic parapet crown teeth around capital rim (Z 4.46 -> 4.74)
        for i in range(8):
            ang = i * (math.pi / 4)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.30, 0, 4.58)) @ Matrix.Diagonal((0.22, 0.42, 0.28, 1))
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.025, segments=1, affect='EDGES', clamp_overlap=True)
    add_bm_part(bm, add_dark_stone, mat_idx=1)

    # 3. Forged wrought-iron strapping bands, base buttress claws, and spiked brazier fire-basket
    def add_iron(sub):
        # Lower iron collar band (Z 1.50)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=16, radius1=1.22, radius2=1.22, depth=0.18, matrix=Matrix.Translation((0, 0, 1.50)))
        # 8 Base iron buttress claws anchoring plinth to shaft
        for i in range(8):
            ang = i * (math.pi / 4)
            m = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.34, 0, 0.68))
                @ Euler((0, -0.35, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.18, 0.14, 0.72, 1))
            )
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
        # Brazier pedestal stem & bowl (Z 4.46 -> 4.92)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.68, radius2=1.08, depth=0.46, matrix=Matrix.Translation((0, 0, 4.69)))
        # 8 Curved forged iron fire-basket crown prongs flaring around the flame!
        for i in range(8):
            ang = i * (math.pi / 4)
            m = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.06, 0, 5.10))
                @ Euler((0, 0.34, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.085, 0.11, 0.76, 1))
            )
            r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.014, segments=1, affect='EDGES', clamp_overlap=True)
        # Iron cage upper hoop ring holding the prongs
        for i in range(8):
            a0 = i * (math.pi / 4)
            a1 = (i + 1) * (math.pi / 4)
            am = 0.5 * (a0 + a1)
            r_ring = 1.09
            chord = 2 * r_ring * math.sin(math.pi / 8)
            m = Euler((0, 0, am)).to_matrix().to_4x4() @ Matrix.Translation((r_ring * math.cos(math.pi / 8), 0, 5.14)) @ Matrix.Diagonal((0.065, chord + 0.04, 0.075, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_iron, mat_idx=2)

    # 4. Gilded gothic upper collar band + forged diamond rivets + capital trim fillet
    def add_gilded(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=16, radius1=1.18, radius2=1.18, depth=0.20, matrix=Matrix.Translation((0, 0, 3.18)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.47, radius2=1.49, depth=0.10, matrix=Matrix.Translation((0, 0, 4.44)))
        for z_band, r_band in ((1.50, 1.24), (3.18, 1.20)):
            for i in range(8):
                ang = i * (math.pi / 4) + (math.pi / 8)
                m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((r_band, 0, z_band)) @ Matrix.Diagonal((0.12, 0.12, 0.16, 1))
                bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=m)
    add_bm_part(bm, add_gilded, mat_idx=3)

    # 5. Recessed glowing soul-coal ember bed inside fire-basket (Z 4.90 -> 5.05)
    def add_coals(sub):
        bmesh.ops.create_icosphere(sub, subdivisions=2, radius=0.72, matrix=Matrix.Translation((0, 0, 4.90)) @ Matrix.Diagonal((1.0, 1.0, 0.34, 1)))
    add_bm_part(bm, add_coals, mat_idx=4)

    return make_mesh_obj("SM_Env_GothicBrazierPillar_01", bm, m_list, col_geo)


# ─────────────────────────────────────────────────────────────────────────────
# 2. SM_Env_CathedralSpire_01 (Monumental Soulslike Gothic Buttress Spire)
#    Height ~19.2m; open belfry lantern at Z 12.2m-15.6m cradles floating crystal!
# ─────────────────────────────────────────────────────────────────────────────
def build_cathedral_spire(mats, col_geo):
    bm = bmesh.new()
    m_list = [mats["basalt"], mats["basalt_dark"], mats["wrought_iron"], mats["gilded_bronze"], mats["emit_amethyst"]]

    # 1. Tiered buttress plinth, 4 diagonal flying buttress fins, gothic shaft, and open lantern belfry piers
    def add_basalt(sub):
        # Stepped square gothic pedestal base (Z 0.0 -> 3.0)
        r0 = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0, 0.65)) @ Matrix.Diagonal((3.4, 3.4, 1.30, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r0["verts"] for e in v.link_edges}), offset=0.10, segments=1, affect='EDGES', clamp_overlap=True)
        r1 = bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0, 2.05)) @ Matrix.Diagonal((2.85, 2.85, 1.65, 1)))
        bmesh.ops.bevel(sub, geom=list({e for v in r1["verts"] for e in v.link_edges}), offset=0.08, segments=1, affect='EDGES', clamp_overlap=True)
        # Main octagonal tower shaft (Z 2.8 -> 12.2)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.42, radius2=1.08, depth=9.4, matrix=Matrix.Translation((0, 0, 7.5)))
        # 4 Diagonal Monumental Flying-Buttress Fins tapering up the tower!
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            # Lower massive buttress tier
            m_low = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.72, 0, 3.2))
                @ Euler((0, -0.14, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((1.05, 0.44, 6.2, 1))
            )
            r_low = bmesh.ops.create_cube(sub, size=1.0, matrix=m_low)
            bmesh.ops.bevel(sub, geom=list({e for v in r_low["verts"] for e in v.link_edges}), offset=0.05, segments=1, affect='EDGES', clamp_overlap=True)
            # Upper flying buttress rib
            m_up = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.34, 0, 8.6))
                @ Euler((0, -0.18, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.72, 0.34, 5.8, 1))
            )
            r_up = bmesh.ops.create_cube(sub, size=1.0, matrix=m_up)
            bmesh.ops.bevel(sub, geom=list({e for v in r_up["verts"] for e in v.link_edges}), offset=0.04, segments=1, affect='EDGES', clamp_overlap=True)
            # Buttress pinnacle cap seated directly atop upper flying buttress rib
            bmesh.ops.create_cone(
                sub, cap_ends=True, cap_tris=False, segments=4, radius1=0.34, radius2=0.02, depth=1.35,
                matrix=Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.22, 0, 11.75))
            )
        # Open Lantern Belfry Cage (Z 12.2 -> 15.8): 4 slender arched corner stone piers cradling crystal at Z ~14.4
        for i in range(4):
            ang = i * (math.pi / 2) + (math.pi / 4)
            px = math.cos(ang) * 0.96
            py = math.sin(ang) * 0.96
            bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.20, radius2=0.16, depth=3.7, matrix=Matrix.Translation((px, py, 14.0)))
    add_bm_part(bm, add_basalt, mat_idx=0)

    # 2. Recessed dark slate lancet arch alcoves (4 faces, tier-2 panel break depth!)
    def add_dark_alcoves(sub):
        for i in range(4):
            ang = i * (math.pi / 2)
            # Lower lancet frame
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.24, 0, 5.2)) @ Matrix.Diagonal((0.24, 0.72, 3.6, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            # Upper lancet frame
            m2 = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.08, 0, 9.6)) @ Matrix.Diagonal((0.22, 0.56, 3.2, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m2)
    add_bm_part(bm, add_dark_alcoves, mat_idx=1)

    # 3. Wrought-iron gothic needle spire roof (Z 15.8 -> 19.6), crocket fins, and iron belfry crown
    def add_iron(sub):
        # Upper belfry ring cornice (Z 12.1 & Z 15.8)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.34, radius2=1.28, depth=0.45, matrix=Matrix.Translation((0, 0, 12.15)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.22, radius2=1.02, depth=0.52, matrix=Matrix.Translation((0, 0, 15.85)))
        # Towering steep octagonal gothic needle spire finial
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=0.98, radius2=0.03, depth=4.4, matrix=Matrix.Translation((0, 0, 18.25)))
        # Iron cross-finial at summit (Z 20.5)
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=6, radius1=0.05, radius2=0.02, depth=1.15, matrix=Matrix.Translation((0, 0, 20.6)))
        bmesh.ops.create_cube(sub, size=1.0, matrix=Matrix.Translation((0, 0, 20.75)) @ Matrix.Diagonal((0.68, 0.08, 0.09, 1)))
        # 4 Gothic crocket horn spikes around upper lantern crown
        for i in range(4):
            ang = i * (math.pi / 2)
            m = (
                Euler((0, 0, ang)).to_matrix().to_4x4()
                @ Matrix.Translation((1.12, 0, 16.45))
                @ Euler((0, 0.28, 0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.14, 0.18, 1.15, 1))
            )
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    add_bm_part(bm, add_iron, mat_idx=2)

    # 4. Gilded bronze gothic cornice collars + lancet pointed arch keystones
    def add_gilded(sub):
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.52, radius2=1.48, depth=0.36, matrix=Matrix.Translation((0, 0, 6.45)))
        bmesh.ops.create_cone(sub, cap_ends=True, cap_tris=False, segments=8, radius1=1.38, radius2=1.35, depth=0.22, matrix=Matrix.Translation((0, 0, 12.35)))
        for i in range(4):
            ang = i * (math.pi / 2)
            for z_k, r_k in ((7.1, 1.32), (11.3, 1.16)):
                m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((r_k, 0, z_k)) @ Matrix.Diagonal((0.26, 0.22, 0.42, 1))
                bmesh.ops.create_icosphere(sub, subdivisions=1, radius=0.5, matrix=m)
    add_bm_part(bm, add_gilded, mat_idx=3)

    # 5. Subtle vertical glowing amethyst rune strips inside the 4 gothic lancet alcoves
    def add_runes(sub):
        for i in range(4):
            ang = i * (math.pi / 2)
            m = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.35, 0, 5.2)) @ Matrix.Diagonal((0.06, 0.14, 2.7, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m)
            m2 = Euler((0, 0, ang)).to_matrix().to_4x4() @ Matrix.Translation((1.18, 0, 9.6)) @ Matrix.Diagonal((0.06, 0.12, 2.3, 1))
            bmesh.ops.create_cube(sub, size=1.0, matrix=m2)
    add_bm_part(bm, add_runes, mat_idx=4)

    return make_mesh_obj("SM_Env_CathedralSpire_01", bm, m_list, col_geo)


def audit_env_object(obj, tri_budget=6500):
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
    grounded = abs(min_z) < 0.08
    naming_ok = obj.name.startswith("SM_Env_") and all(m.name.startswith("MAT_") for m in obj.data.materials if m)
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


def export_env_asset(render_obj, collider_obj, glb_name, fbx_name):
    # 1. Export render-only GLB for Three.js WebGL runtime
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

    # 2. Validate & export render + UCX_ convex collider FBX using cc-blender-skill collision_preflight.py!
    fbx_path = FBX_DIR / fbx_name
    if fbx_path.exists():
        fbx_path.unlink()
    col_rep = export_collision_fbx(render_obj, [collider_obj], fbx_path)
    return glb_path.stat().st_size, fbx_path.stat().st_size, col_rep


def render_qa_sheet(pillar, spire, colliders, col_lights, col_cams):
    # Hide collision proxies for beauty QA render
    for c in colliders:
        c.hide_render = True
        c.hide_viewport = True

    pillar.location = (-3.6, 0.0, 0.0)
    spire.location = (3.4, 0.0, 0.0)

    # Add 1.8m Human Scale Reference Silhouette (environment-artist requirement!)
    bm_ref = bmesh.new()
    bmesh.ops.create_cone(bm_ref, cap_ends=True, segments=12, radius1=0.22, radius2=0.24, depth=1.35, matrix=Matrix.Translation((0, 0, 0.675)))
    bmesh.ops.create_icosphere(bm_ref, subdivisions=2, radius=0.14, matrix=Matrix.Translation((0, 0, 1.62)))
    me_ref = bpy.data.meshes.new("SM_Ref_HumanScale_180cm_Mesh")
    bm_ref.to_mesh(me_ref)
    bm_ref.free()
    ref_obj = bpy.data.objects.new("SM_Ref_HumanScale_180cm", me_ref)
    ref_obj.location = (-0.5, -1.6, 0.0)
    ref_obj.data.materials.append(make_pbr_mat("MAT_Ref_ScaleGold", (0.90, 0.78, 0.42), metallic=0.2, roughness=0.45))
    bpy.context.scene.collection.objects.link(ref_obj)

    # Ground plane
    bpy.ops.mesh.primitive_plane_add(size=40.0, location=(0, 0, 0.0))
    floor = bpy.context.active_object
    floor.name = "SM_QA_CitadelFloor"
    floor.data.materials.append(make_pbr_mat("MAT_QA_WetBasalt", (0.045, 0.04, 0.068), metallic=0.18, roughness=0.35))

    # Soulslike twilight world + dramatic rim lighting
    world = bpy.data.worlds.new("WLD_QA_Soulslike")
    bpy.context.scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.028, 0.075, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    def add_light(name, ltype, energy, color, loc, rot_deg, size=4.0):
        ld = bpy.data.lights.new(name, type=ltype)
        ld.energy = energy
        ld.color = color
        if ltype == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        col_lights.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot_deg)

    add_light("LGT_Key_Moon", 'AREA', 8500, (0.95, 0.88, 1.0), (11.0, -14.0, 14.0), (52, 0, 38), size=5.0)
    add_light("LGT_Fill_Cold", 'AREA', 2800, (0.55, 0.68, 1.0), (-12.0, -10.0, 7.0), (65, 0, -48), size=6.0)
    add_light("LGT_Rim_Eclipse", 'AREA', 9500, (1.0, 0.34, 0.48), (-2.0, 14.0, 12.0), (-58, 0, 0), size=7.0)
    # Warm soulfire point light inside pillar fire-basket
    pl = bpy.data.lights.new("LGT_Brazier_Soulfire", type='POINT')
    pl.energy = 2600
    pl.color = (1.0, 0.36, 0.28)
    po = bpy.data.objects.new("LGT_Brazier_Soulfire", pl)
    po.location = (-3.6, 0.0, 5.45)
    col_lights.objects.link(po)

    cam_data = bpy.data.cameras.new("CAM_QA_CitadelKit")
    cam_data.lens = 32
    cam = bpy.data.objects.new("CAM_QA_CitadelKit", cam_data)
    col_cams.objects.link(cam)
    cam.location = (-0.4, -36.5, 10.8)
    direction = Vector((0.2, 0.0, 9.8)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = 'PNG'
    out_img = PREVIEW_DIR / "citadel_kit_qa_sheet.png"
    scene.render.filepath = str(out_img)
    bpy.ops.render.render(write_still=True)
    return out_img


def main():
    reset_scene()
    col_root = get_or_create_collection("COL_Citadel_Kit")
    col_geo = get_or_create_collection("COL_Geo_Hero", col_root)
    col_col = get_or_create_collection("COL_Collision", col_root)
    col_lights = get_or_create_collection("COL_Lights", col_root)
    col_cams = get_or_create_collection("COL_Cameras", col_root)

    mats = create_citadel_materials()

    pillar = build_gothic_brazier_pillar(mats, col_geo)
    pillar_col = make_convex_collider(pillar.name, 1.64, 1.48, 5.2, 8, col_col)

    spire = build_cathedral_spire(mats, col_geo)
    spire_col = make_convex_collider(spire.name, 1.95, 1.15, 19.5, 8, col_col)

    results = []
    for obj, col_obj, glb_name, fbx_name in (
        (pillar, pillar_col, "gothic_brazier_pillar.glb", "SM_Env_GothicBrazierPillar_01.fbx"),
        (spire, spire_col, "cathedral_spire.glb", "SM_Env_CathedralSpire_01.fbx"),
    ):
        audit = audit_env_object(obj, tri_budget=6500)
        if audit["status"] != "PASS":
            raise RuntimeError(f"Asset optimization gate FAILED for {obj.name}: {audit}")
        glb_sz, fbx_sz, col_rep = export_env_asset(obj, col_obj, glb_name, fbx_name)
        audit["glb_kb"] = round(glb_sz / 1024, 1)
        audit["fbx_kb"] = round(fbx_sz / 1024, 1)
        audit["collision_preflight_passed"] = col_rep["passed"]
        results.append(audit)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_DIR / "Skyforge_Citadel_Kit.blend"))
    qa_img = render_qa_sheet(pillar, spire, [pillar_col, spire_col], col_lights, col_cams)
    print("CITADEL_AUDIT_JSON=" + json.dumps(results, indent=2))
    print(f"QA_RENDER={qa_img}")


if __name__ == "__main__":
    main()
