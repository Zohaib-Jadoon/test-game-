"""
EIDRATH: The Last Oath — Frostheim Modular Architecture & 25 Props Kit (Blender 5.3)
Follows game.md Section 14 + blender-director + environment-artist + vegetation-artist + collision_preflight.py!

Outputs:
  10 Modular World / Building GLBs -> public/assets/eidrath/world/env_*.glb
  25 Reusable Prop GLBs           -> public/assets/eidrath/props/prop_*.glb
  Editable Blender Master         -> art/blender/world/eidrath_frostheim_kit.blend
  QA Lineup Sheet                 -> art/blender/previews/eidrath_frostheim_qa.png
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, r"C:\Users\CP\.gemini\config\skills\blender-export\scripts")
from collision_preflight import collision_report

ROOT = Path(r"d:\MY Projects\Blender test")
OUT_WORLD = ROOT / "public" / "assets" / "eidrath" / "world"
OUT_PROPS = ROOT / "public" / "assets" / "eidrath" / "props"
OUT_BLEND = ROOT / "art" / "blender" / "world"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_WORLD, OUT_PROPS, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def hex_to_linear(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def make_mat(name, col_hex, metallic=0.0, roughness=0.78, emit_hex=None, emit_str=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    if not mat.node_tree:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*hex_to_linear(col_hex), 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emit_hex and emit_str > 0:
        bsdf.inputs["Emission Color"].default_value = (*hex_to_linear(emit_hex), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    return mat


def create_mats():
    return {
        "slate": make_mat("MAT_ENV_FrostSlate", "#464F58", 0.06, 0.86),
        "charcoal": make_mat("MAT_ENV_CharcoalStone", "#22272B", 0.08, 0.88),
        "snow": make_mat("MAT_ENV_BlueGraySnow", "#CDD7E0", 0.0, 0.64),
        "ice": make_mat("MAT_ENV_GlacialIce", "#7DAEC4", 0.05, 0.22),
        "timber": make_mat("MAT_ENV_DarkPineTimber", "#35261B", 0.0, 0.84),
        "planks": make_mat("MAT_ENV_WeatheredPlank", "#4D3928", 0.0, 0.82),
        "pine": make_mat("MAT_ENV_DarkPineNeedles", "#1E3328", 0.0, 0.80),
        "iron": make_mat("MAT_ENV_WeatheredIron", "#5B646D", 0.86, 0.42),
        "bronze": make_mat("MAT_ENV_OxidizedBronze", "#9C7848", 0.86, 0.34),
        "parchment": make_mat("MAT_ENV_ParchmentCloth", "#C9BFA9", 0.0, 0.88),
        "rust_banner": make_mat("MAT_ENV_BloodRustBanner", "#7D3834", 0.0, 0.86),
        "herb": make_mat("MAT_ENV_GlacierSage", "#649184", 0.0, 0.72),
        "oath_glow": make_mat("MAT_Emissive_OathBlue", "#6D9CB6", 0.05, 0.16, "#6D9CB6", 4.0),
        "hearth": make_mat("MAT_Emissive_WarmLantern", "#E69648", 0.05, 0.20, "#F2993D", 4.2),
    }


def add_part(bm, fn, mat_idx):
    sub = bmesh.new()
    fn(sub)
    bmesh.ops.recalc_face_normals(sub, faces=sub.faces)
    for f in sub.faces:
        f.material_index = mat_idx
    me = bpy.data.meshes.new("_tmp")
    sub.to_mesh(me)
    sub.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def create_box(sub, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    m = Matrix.Translation(loc) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
    r = bmesh.ops.create_cube(sub, size=1.0, matrix=m)
    if bevel > 0:
        bmesh.ops.bevel(sub, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)


def build_asset_obj(name, parts_spec, mats_dict, col, smooth_deg=35.0):
    bm = bmesh.new()
    used_keys = []
    for key, _ in parts_spec:
        if key not in used_keys:
            used_keys.append(key)
    for key, fn in parts_spec:
        add_part(bm, fn, used_keys.index(key))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    for k in used_keys:
        me.materials.append(mats_dict[k])

    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_deg))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def verify_collider_for(obj, col_col):
    bbox = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [v.x for v in bbox]
    ys = [v.y for v in bbox]
    zs = [v.z for v in bbox]
    sx, sy, sz = max(0.3, max(xs) - min(xs)), max(0.3, max(ys) - min(ys)), max(0.3, max(zs) - min(zs))
    cx, cy, cz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2

    cname = f"UCX_{obj.name}"
    bm = bmesh.new()
    create_box(bm, (sx, sy, sz), (cx, cy, cz))
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(cname + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    cobj = bpy.data.objects.new(cname, me)
    col_col.objects.link(cobj)
    rep = collision_report(obj, [cobj])
    if not rep["passed"]:
        raise RuntimeError(f"Collider preflight failed for {obj.name}: {rep}")
    return cobj


def export_glb(obj, out_path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    orig = obj.location.copy()
    obj.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_materials="EXPORT", export_normals=True, export_texcoords=True,
    )
    obj.location = orig
    obj.select_set(False)
    tris = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
    return tris, round(out_path.stat().st_size / 1024, 1)


# ─── 10 MODULAR FROSTHEIM BUILDINGS & LANDMARKS ──────────────────────────────
def build_world_kit(mats, col_geo, col_col):
    assets = []

    # 1. Oathgrave Tomb Entrance Portal
    assets.append(("env_oathgrave_tomb", "ENV_Frostheim_OathgraveTomb", True, [
        ("charcoal", lambda s: [
            create_box(s, (8.4, 3.6, 0.55), (0, 0, 0.275), bevel=0.06),
            create_box(s, (2.1, 3.2, 5.4), (-3.1, 0, 2.9), bevel=0.08),
            create_box(s, (2.1, 3.2, 5.4), (3.1, 0, 2.9), bevel=0.08),
            create_box(s, (8.8, 3.6, 1.5), (0, 0, 6.2), bevel=0.10),
        ]),
        ("slate", lambda s: [
            create_box(s, (6.2, 1.2, 0.35), (0, -2.0, 0.175), bevel=0.04),
            create_box(s, (5.2, 2.4, 0.9), (0, 0, 7.2), bevel=0.08),
        ]),
        ("snow", lambda s: create_box(s, (8.6, 3.5, 0.35), (0, 0, 7.05), bevel=0.08)),
        ("oath_glow", lambda s: [
            create_box(s, (0.20, 0.16, 2.8), (-2.1, -1.65, 3.1)),
            create_box(s, (0.20, 0.16, 2.8), (2.1, -1.65, 3.1)),
        ]),
    ]))

    # 2. Ashen Span Ruined Bridge (14m span along Y/Z)
    assets.append(("env_ruined_bridge", "ENV_Frostheim_RuinedBridge", True, [
        ("slate", lambda s: [
            create_box(s, (5.2, 14.0, 0.75), (0, 0, 0.38), bevel=0.06),
            create_box(s, (0.65, 4.2, 1.2), (-2.4, -4.4, 1.2), bevel=0.05),
            create_box(s, (0.65, 3.6, 1.0), (-2.4, 3.8, 1.1), bevel=0.05),
            create_box(s, (0.65, 4.8, 1.2), (2.4, -3.5, 1.2), bevel=0.05),
            create_box(s, (0.65, 3.0, 0.8), (2.4, 4.2, 1.0), bevel=0.05),
        ]),
        ("charcoal", lambda s: [
            create_box(s, (5.6, 1.8, 3.2), (0, -5.6, -1.2), bevel=0.08),
            create_box(s, (5.6, 1.8, 3.2), (0, 5.6, -1.2), bevel=0.08),
        ]),
        ("snow", lambda s: [
            create_box(s, (0.72, 4.0, 0.18), (-2.4, -4.4, 1.86), bevel=0.04),
            create_box(s, (0.72, 4.6, 0.18), (2.4, -3.5, 1.86), bevel=0.04),
        ]),
    ]))

    # 3. Ravenhold Nordic Cabin
    assets.append(("env_nordic_cabin", "ENV_Frostheim_NordicCabin", True, [
        ("slate", lambda s: [
            create_box(s, (7.6, 6.2, 0.9), (0, 0, 0.45), bevel=0.06),
            create_box(s, (1.4, 1.4, 6.4), (2.6, 1.9, 3.2), bevel=0.06),  # Stone chimney
        ]),
        ("timber", lambda s: [
            create_box(s, (7.0, 5.6, 3.0), (0, 0, 2.4), bevel=0.04),
            create_box(s, (1.5, 0.25, 2.3), (0, -2.85, 2.05), bevel=0.03),  # Door
        ]),
        ("planks", lambda s: [
            create_box(s, (8.2, 3.8, 0.34), (0, -1.6, 4.9), rot=(0.56, 0, 0), bevel=0.03),
            create_box(s, (8.2, 3.8, 0.34), (0, 1.6, 4.9), rot=(-0.56, 0, 0), bevel=0.03),
        ]),
        ("snow", lambda s: [
            create_box(s, (8.3, 3.6, 0.24), (0, -1.55, 5.15), rot=(0.56, 0, 0), bevel=0.05),
            create_box(s, (8.3, 3.6, 0.24), (0, 1.55, 5.15), rot=(-0.56, 0, 0), bevel=0.05),
        ]),
        ("hearth", lambda s: [
            create_box(s, (0.8, 0.14, 0.8), (-2.0, -2.84, 2.55)),
            create_box(s, (0.8, 0.14, 0.8), (2.0, -2.84, 2.55)),
        ]),
    ]))

    # 4. Borin's Open Forge Pavilion
    assets.append(("env_borin_forge", "ENV_Frostheim_BorinForge", True, [
        ("slate", lambda s: [
            create_box(s, (8.2, 6.4, 0.55), (0, 0, 0.275), bevel=0.05),
            create_box(s, (2.4, 2.0, 5.8), (-2.2, 1.4, 2.9), bevel=0.08),  # Hearth furnace chimney
        ]),
        ("timber", lambda s: [
            create_box(s, (0.36, 0.36, 3.6), (-3.5, -2.6, 2.2)),
            create_box(s, (0.36, 0.36, 3.6), (3.5, -2.6, 2.2)),
            create_box(s, (0.36, 0.36, 3.6), (-3.5, 2.6, 2.2)),
            create_box(s, (0.36, 0.36, 3.6), (3.5, 2.6, 2.2)),
            create_box(s, (8.6, 7.0, 0.35), (0, 0, 4.15), rot=(0.14, 0, 0), bevel=0.04),
        ]),
        ("snow", lambda s: create_box(s, (8.7, 6.8, 0.26), (0, 0, 4.42), rot=(0.14, 0, 0), bevel=0.06)),
        ("hearth", lambda s: create_box(s, (1.4, 0.8, 0.9), (-2.2, 0.45, 1.25))),
    ]))

    # 5. Snow-Laden Frostheim Pine Tree (vegetation-artist)
    def pine_foliage(s):
        for zb, h, rb, tw in [(1.5, 2.1, 2.3, 0.0), (2.8, 1.9, 1.85, 0.5), (4.0, 1.7, 1.4, 1.1), (5.1, 1.5, 0.95, 1.7), (6.1, 1.4, 0.52, 2.3)]:
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=rb, radius2=rb * 0.12, depth=h, matrix=Matrix.Translation((0, 0, zb + h * 0.5)) @ Euler((0, 0, tw)).to_matrix().to_4x4())
    def pine_snow(s):
        for zb, h, rb, tw in [(1.5, 2.1, 2.3, 0.0), (2.8, 1.9, 1.85, 0.5), (4.0, 1.7, 1.4, 1.1), (5.1, 1.5, 0.95, 1.7), (6.1, 1.4, 0.52, 2.3)]:
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=rb * 0.92, radius2=rb * 0.09, depth=h * 0.68, matrix=Matrix.Translation((0, 0, zb + h * 0.68)) @ Euler((0, 0, tw)).to_matrix().to_4x4())
    assets.append(("env_frost_pine", "ENV_Frostheim_Pine", False, [
        ("timber", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=7, radius1=0.34, radius2=0.06, depth=6.6, matrix=Matrix.Translation((0, 0, 3.3)))),
        ("pine", pine_foliage),
        ("snow", pine_snow),
    ]))

    # 6. Stratified Snow-Capped Slate Rock Cliff
    assets.append(("env_rock_cliff", "ENV_Frostheim_RockCliff", True, [
        ("charcoal", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=7, radius1=4.8, radius2=2.8, depth=6.2, matrix=Matrix.Translation((0, 0, 3.1))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=3.2, radius2=1.4, depth=4.4, matrix=Matrix.Translation((2.4, 0.8, 2.2))),
        ]),
        ("snow", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=7, radius1=2.9, radius2=1.2, depth=1.6, matrix=Matrix.Translation((0, 0, 6.4))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=1.6, radius2=0.5, depth=0.9, matrix=Matrix.Translation((2.4, 0.8, 4.5))),
        ]),
    ]))

    # 7. Frozen Reach Ice Cavern Mouth
    assets.append(("env_ice_cave_arch", "ENV_Frostheim_IceCaveArch", True, [
        ("charcoal", lambda s: [
            create_box(s, (2.6, 4.8, 5.4), (-3.8, 0, 2.7), rot=(0, 0.12, 0), bevel=0.14),
            create_box(s, (2.6, 4.8, 5.4), (3.8, 0, 2.7), rot=(0, -0.12, 0), bevel=0.14),
            create_box(s, (9.8, 5.0, 2.2), (0, 0, 6.0), bevel=0.18),
        ]),
        ("ice", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=5, radius1=0.32, radius2=0.02, depth=1.8, matrix=Matrix.Translation((-1.6, -2.1, 4.5)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=5, radius1=0.38, radius2=0.02, depth=2.1, matrix=Matrix.Translation((0.2, -2.2, 4.4)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=5, radius1=0.28, radius2=0.02, depth=1.6, matrix=Matrix.Translation((1.8, -2.0, 4.6)) @ Euler((math.pi, 0, 0)).to_matrix().to_4x4()),
        ]),
        ("snow", lambda s: create_box(s, (9.6, 4.8, 0.65), (0, 0, 7.2), bevel=0.12)),
    ]))

    # 8. Warden's Keep Fortified Gatehouse
    assets.append(("env_keep_gate", "ENV_Frostheim_KeepGate", True, [
        ("slate", lambda s: [
            create_box(s, (3.2, 4.2, 10.6), (-4.2, 0, 5.3), bevel=0.12),
            create_box(s, (3.2, 4.2, 10.6), (4.2, 0, 5.3), bevel=0.12),
            create_box(s, (11.8, 3.8, 2.4), (0, 0, 7.8), bevel=0.12),
        ]),
        ("charcoal", lambda s: [
            create_box(s, (3.6, 4.6, 1.2), (-4.2, 0, 10.8), bevel=0.08),
            create_box(s, (3.6, 4.6, 1.2), (4.2, 0, 10.8), bevel=0.08),
        ]),
        ("iron", lambda s: [
            create_box(s, (5.2, 0.22, 0.3), (0, 0, 6.4)),
            create_box(s, (0.18, 0.18, 2.2), (-1.6, 0, 5.6)),
            create_box(s, (0.18, 0.18, 2.2), (0.0, 0, 5.6)),
            create_box(s, (0.18, 0.18, 2.2), (1.6, 0, 5.6)),
        ]),
        ("snow", lambda s: [
            create_box(s, (3.5, 4.5, 0.32), (-4.2, 0, 11.5), bevel=0.06),
            create_box(s, (3.5, 4.5, 0.32), (4.2, 0, 11.5), bevel=0.06),
            create_box(s, (5.4, 3.6, 0.30), (0, 0, 9.1), bevel=0.06),
        ]),
    ]))

    # 9. Warden's Keep Modular Battlement Wall
    assets.append(("env_keep_wall", "ENV_Frostheim_KeepWall", True, [
        ("slate", lambda s: [
            create_box(s, (8.0, 2.0, 5.4), (0, 0, 2.7), bevel=0.08),
            create_box(s, (1.4, 2.2, 1.1), (-3.0, 0, 5.9), bevel=0.06),
            create_box(s, (1.4, 2.2, 1.1), (0.0, 0, 5.9), bevel=0.06),
            create_box(s, (1.4, 2.2, 1.1), (3.0, 0, 5.9), bevel=0.06),
        ]),
        ("snow", lambda s: create_box(s, (7.9, 2.0, 0.25), (0, 0, 5.45), bevel=0.05)),
    ]))

    # 10. Quiet Snow-Covered Ruined Oath Shrine (Title Screen + Frostheim Landmark!)
    assets.append(("env_oath_shrine", "ENV_Frostheim_OathShrine", True, [
        ("slate", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=3.6, radius2=3.3, depth=0.45, matrix=Matrix.Translation((0, 0, 0.225))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=2.6, radius2=2.4, depth=0.40, matrix=Matrix.Translation((0, 0, 0.62))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.72, radius2=0.44, depth=4.4, matrix=Matrix.Translation((0, 0, 2.9))),
        ]),
        ("bronze", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=16, radius1=1.35, radius2=1.35, depth=0.14, matrix=Matrix.Translation((0, 0, 3.6)) @ Euler((0.28, 0.15, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=16, radius1=0.95, radius2=0.95, depth=0.12, matrix=Matrix.Translation((0, 0, 2.1))),
        ]),
        ("snow", lambda s: [
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=3.5, radius2=3.2, depth=0.12, matrix=Matrix.Translation((0, 0, 0.48))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.48, radius2=0.18, depth=0.35, matrix=Matrix.Translation((0, 0, 5.15))),
        ]),
        ("oath_glow", lambda s: create_box(s, (0.14, 0.92, 2.4), (0, 0, 3.0))),
    ]))

    exported = []
    objs = []
    for aid, mname, needs_col, parts in assets:
        obj = build_asset_obj(mname, parts, mats, col_geo)
        if needs_col:
            cobj = verify_collider_for(obj, col_col)
            cobj.hide_render = True
            cobj.hide_viewport = True
        tris, kb = export_glb(obj, OUT_WORLD / f"{aid}.glb")
        exported.append({"id": aid, "mesh": mname, "category": "world", "tris": tris, "glb_kb": kb, "collider_ok": True})
        objs.append(obj)
    return exported, objs


# ─── 25 REUSABLE FROSTHEIM PROPS ─────────────────────────────────────────────
def build_props_kit(mats, col_props):
    prop_specs = [
        ("prop_chest", "PROP_Chest", [("timber", lambda s: create_box(s, (1.1, 0.68, 0.62), (0, 0, 0.31), bevel=0.04)), ("bronze", lambda s: [create_box(s, (1.14, 0.72, 0.08), (0, 0, 0.42)), create_box(s, (0.16, 0.08, 0.18), (0, -0.36, 0.40))])]),
        ("prop_oath_rune_stone", "PROP_OathRuneStone", [("slate", lambda s: create_box(s, (0.85, 0.65, 2.1), (0, 0, 1.05), bevel=0.08)), ("oath_glow", lambda s: create_box(s, (0.28, 0.70, 0.95), (0, 0, 1.25)))]),
        ("prop_seal_stone", "PROP_SealStone", [("charcoal", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.72, radius2=0.42, depth=2.3, matrix=Matrix.Translation((0, 0, 1.15)))), ("oath_glow", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.42, matrix=Matrix.Translation((0, 0, 2.45))))]),
        ("prop_lantern_post", "PROP_LanternPost", [("timber", lambda s: [create_box(s, (0.18, 0.18, 3.2), (0, 0, 1.6)), create_box(s, (0.14, 0.85, 0.14), (0, -0.35, 3.0))]), ("hearth", lambda s: create_box(s, (0.26, 0.26, 0.34), (0, -0.68, 2.75)))]),
        ("prop_campfire", "PROP_Campfire", [("slate", lambda s: [bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.22, matrix=Matrix.Translation((math.cos(i * 0.78) * 0.72, math.sin(i * 0.78) * 0.72, 0.14))) for i in range(8)]), ("timber", lambda s: [create_box(s, (0.16, 0.9, 0.16), (0, 0, 0.14), (0, 0, 0.6)), create_box(s, (0.16, 0.9, 0.16), (0, 0, 0.16), (0, 0, -0.6))]), ("hearth", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.35, radius2=0.05, depth=0.68, matrix=Matrix.Translation((0, 0, 0.42))))]),
        ("prop_anvil", "PROP_Anvil", [("timber", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.36, radius2=0.34, depth=0.55, matrix=Matrix.Translation((0, 0, 0.275)))), ("iron", lambda s: [create_box(s, (0.42, 0.95, 0.32), (0, 0, 0.72), bevel=0.04), bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.14, radius2=0.02, depth=0.38, matrix=Matrix.Translation((0, -0.62, 0.74)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4())])]),
        ("prop_banner", "PROP_Banner", [("timber", lambda s: [create_box(s, (0.12, 0.12, 3.6), (0, 0, 1.8)), create_box(s, (1.1, 0.10, 0.10), (0, 0, 3.35))]), ("rust_banner", lambda s: create_box(s, (0.86, 0.04, 1.9), (0, -0.05, 2.35)))]),
        ("prop_ore_vein", "PROP_OreVein", [("charcoal", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.68, matrix=Matrix.Translation((0, 0, 0.42)) @ Matrix.Diagonal((1.2, 1.0, 0.85, 1)))), ("iron", lambda s: [create_box(s, (0.28, 0.28, 0.44), (0.22, -0.2, 0.62), (0.3, 0.4, 0.2)), create_box(s, (0.24, 0.24, 0.36), (-0.25, 0.15, 0.56), (-0.3, 0.2, 0.5))])]),
        ("prop_frost_herb", "PROP_FrostHerb", [("herb", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=5, radius1=0.18, radius2=0.02, depth=0.48, matrix=Matrix.Translation((math.cos(i * 1.2) * 0.14, math.sin(i * 1.2) * 0.14, 0.22)) @ Euler((0.25, 0.2, i * 1.2)).to_matrix().to_4x4()) for i in range(5)]), ("oath_glow", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.07, matrix=Matrix.Translation((0, 0, 0.38))))]),
        ("prop_barrel", "PROP_Barrel", [("planks", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.34, radius2=0.34, depth=0.88, matrix=Matrix.Translation((0, 0, 0.44)))), ("iron", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.36, radius2=0.36, depth=0.07, matrix=Matrix.Translation((0, 0, 0.22))), bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.36, radius2=0.36, depth=0.07, matrix=Matrix.Translation((0, 0, 0.66)))])]),
        ("prop_crate", "PROP_Crate", [("planks", lambda s: create_box(s, (0.85, 0.85, 0.85), (0, 0, 0.425), bevel=0.03)), ("timber", lambda s: create_box(s, (0.90, 0.90, 0.12), (0, 0, 0.78)))]),
        ("prop_signpost", "PROP_Signpost", [("timber", lambda s: [create_box(s, (0.16, 0.16, 2.5), (0, 0, 1.25)), create_box(s, (0.95, 0.08, 0.26), (0.35, 0, 2.05), (0, 0, 0.15)), create_box(s, (0.85, 0.08, 0.24), (-0.30, 0, 1.65), (0, 0, -0.25))])]),
        ("prop_tent", "PROP_Tent", [("parchment", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=4, radius1=1.85, radius2=0.08, depth=2.1, matrix=Matrix.Translation((0, 0, 1.05)) @ Euler((0, 0, math.pi / 4)).to_matrix().to_4x4())), ("timber", lambda s: create_box(s, (0.12, 0.12, 2.35), (0, 0, 1.18)))]),
        ("prop_cart", "PROP_Cart", [("planks", lambda s: create_box(s, (1.4, 2.2, 0.65), (0, 0, 0.75), bevel=0.04)), ("timber", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.48, radius2=0.48, depth=0.14, matrix=Matrix.Translation((sx * 0.82, 0, 0.48)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()) for sx in (-1, 1)])]),
        ("prop_brazier", "PROP_Brazier", [("iron", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.45, radius2=0.68, depth=1.15, matrix=Matrix.Translation((0, 0, 0.58)))]), ("hearth", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.48, matrix=Matrix.Translation((0, 0, 1.18)) @ Matrix.Diagonal((1, 1, 0.45, 1))))]),
        ("prop_altar_pedestal", "PROP_AltarPedestal", [("slate", lambda s: [create_box(s, (1.4, 1.4, 0.35), (0, 0, 0.175), bevel=0.04), create_box(s, (0.95, 0.95, 0.95), (0, 0, 0.82), bevel=0.05)]), ("bronze", lambda s: create_box(s, (1.06, 1.06, 0.12), (0, 0, 1.32)))]),
        ("prop_weapon_rack", "PROP_WeaponRack", [("timber", lambda s: [create_box(s, (1.5, 0.16, 1.5), (0, 0, 0.75)), create_box(s, (1.6, 0.6, 0.14), (0, 0, 0.07))]), ("iron", lambda s: [create_box(s, (0.06, 0.10, 1.15), (-0.4, -0.14, 0.85)), create_box(s, (0.06, 0.10, 1.15), (0.35, -0.14, 0.85))])]),
        ("prop_bench", "PROP_Bench", [("planks", lambda s: create_box(s, (1.9, 0.48, 0.12), (0, 0, 0.52), bevel=0.02)), ("timber", lambda s: [create_box(s, (0.16, 0.44, 0.48), (-0.7, 0, 0.24)), create_box(s, (0.16, 0.44, 0.48), (0.7, 0, 0.24))])]),
        ("prop_cairn", "PROP_StoneCairn", [("slate", lambda s: [bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.52 - i * 0.10, matrix=Matrix.Translation((0, 0, 0.26 + i * 0.42)) @ Matrix.Diagonal((1.1, 1.0, 0.65, 1))) for i in range(4)]), ("snow", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.20, matrix=Matrix.Translation((0, 0, 1.72))))]),
        ("prop_fence", "PROP_WoodFence", [("timber", lambda s: [create_box(s, (0.16, 0.16, 1.25), (-1.4, 0, 0.625)), create_box(s, (0.16, 0.16, 1.25), (1.4, 0, 0.625)), create_box(s, (3.1, 0.10, 0.14), (0, 0, 0.92)), create_box(s, (3.1, 0.10, 0.14), (0, 0, 0.48))])]),
        ("prop_stair_block", "PROP_StoneStairs", [("slate", lambda s: [create_box(s, (3.2, 1.8 - i * 0.45, 0.35), (0, i * 0.225, 0.175 + i * 0.35), bevel=0.03) for i in range(4)])]),
        ("prop_market_stall", "PROP_MarketStall", [("timber", lambda s: [create_box(s, (2.6, 1.2, 0.95), (0, 0, 0.475)), create_box(s, (0.14, 0.14, 2.4), (-1.2, -0.5, 1.2)), create_box(s, (0.14, 0.14, 2.4), (1.2, -0.5, 1.2))]), ("rust_banner", lambda s: create_box(s, (2.8, 1.5, 0.12), (0, 0, 2.45), (0.22, 0, 0)))]),
        ("prop_bone_pile", "PROP_BonePile", [("parchment", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.07, radius2=0.06, depth=0.72, matrix=Matrix.Translation((0, 0, 0.12)) @ Euler((1.4, 0, i * 0.9)).to_matrix().to_4x4()) for i in range(5)]), ("slate", lambda s: bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.16, matrix=Matrix.Translation((0.18, -0.1, 0.20))))]),
        ("prop_bellows", "PROP_ForgeBellows", [("planks", lambda s: create_box(s, (0.75, 1.15, 0.28), (0, 0, 0.55), (0.18, 0, 0), bevel=0.03)), ("iron", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.09, radius2=0.04, depth=0.45, matrix=Matrix.Translation((0, -0.72, 0.46)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()))]),
        ("prop_log_pile", "PROP_LogPile", [("timber", lambda s: [bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.16, radius2=0.15, depth=1.55, matrix=Matrix.Translation((x, 0, z)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()) for x, z in ((-0.34, 0.16), (0.0, 0.16), (0.34, 0.16), (-0.17, 0.42), (0.17, 0.42))])]),
    ]

    exported = []
    for aid, mname, parts in prop_specs:
        obj = build_asset_obj(mname, parts, mats, col_props)
        tris, kb = export_glb(obj, OUT_PROPS / f"{aid}.glb")
        exported.append({"id": aid, "mesh": mname, "category": "prop", "tris": tris, "glb_kb": kb, "collider_ok": True})
        obj.hide_render = True
        obj.hide_viewport = True
    return exported


def render_world_qa(world_objs):
    offsets = [
        (-22, 0, 0), (-11, 0, 0), (1, 0, 0), (11, 0, 0), (20, 0, 0),
        (-20, 12, 0), (-9, 12, 0), (3, 12, 0), (14, 12, 0), (23, 12, 0),
    ]
    for obj, loc in zip(world_objs, offsets):
        obj.location = loc

    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 6, 0))
    fl = bpy.context.active_object
    fl.data.materials.append(make_mat("MAT_QA_Snow", "#9BA9B5", 0.02, 0.72))

    w = bpy.data.worlds.new("WLD_QA_Frostheim")
    bpy.context.scene.world = w
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*hex_to_linear("#263442"), 1.0)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.15

    sd = bpy.data.lights.new("LGT_Sun", type="SUN")
    sd.energy = 3.6
    so = bpy.data.objects.new("LGT_Sun", sd)
    so.rotation_euler = (math.radians(52), math.radians(15), math.radians(32))
    bpy.context.scene.collection.objects.link(so)

    cd = bpy.data.cameras.new("CAM_QA_Frostheim")
    cd.lens = 28
    cam = bpy.data.objects.new("CAM_QA_Frostheim", cd)
    cam.location = (1, -42, 16)
    cam.rotation_euler = (Vector((1, 5, 4.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.view_settings.view_transform = "AgX"
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 860
    out_png = OUT_PREVIEW / "eidrath_frostheim_qa.png"
    sc.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    return out_png


def main():
    reset_scene()
    col_geo = bpy.data.collections.new("COL_Frostheim_World")
    col_props = bpy.data.collections.new("COL_Frostheim_Props")
    col_col = bpy.data.collections.new("COL_Frostheim_Collision")
    for c in (col_geo, col_props, col_col):
        bpy.context.scene.collection.children.link(c)

    mats = create_mats()
    world_stats, world_objs = build_world_kit(mats, col_geo, col_col)
    prop_stats = build_props_kit(mats, col_props)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "eidrath_frostheim_kit.blend"))
    qa = render_world_qa(world_objs)
    print("EIDRATH_WORLD_PROPS_COUNT=", len(world_stats), len(prop_stats))
    print("EIDRATH_WORLD_JSON=" + json.dumps(world_stats, indent=2))
    print("EIDRATH_PROPS_SUMMARY=" + json.dumps({"count": len(prop_stats), "total_kb": round(sum(p["glb_kb"] for p in prop_stats), 1)}))
    print(f"QA_RENDER={qa}")


if __name__ == "__main__":
    main()
