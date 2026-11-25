"""
EIDRATH: The Last Oath — 8 Original Signature Weapons & Shields (Blender 5.3)
Grip pivot strictly at (0, 0, 0), 1 Blender unit = 1 meter, Y-up glTF export.
  - wpn_oathbreaker    (Notched two-handed greatsword, bronze oath rings, restrained oath-blue runes)
  - wpn_iron_sword     (Weathered infantry oath blade)
  - wpn_frost_axe      (Frostheim bearded battleaxe)
  - wpn_nightpiercer   (Black yew recurve bow, horn tips, silver thread)
  - wpn_iron_shield    (Ravenhold banded iron & oak guard shield)
  - wpn_oblivion_staff (Obsidian staff with rotating basalt shards)
  - wpn_worldshatter   (Polygonal slate/steel hammer with lightning channels)
  - wpn_torment_links  (Twin hooked iron weapons with short chain tether)
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"d:\MY Projects\Blender test")
OUT_GLB = ROOT / "public" / "assets" / "eidrath" / "weapons"
OUT_BLEND = ROOT / "art" / "blender" / "weapons"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_GLB, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def hex_to_linear(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def make_mat(name, col_hex, metallic=0.0, roughness=0.5, emit_hex=None, emit_str=0.0):
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
        "steel": make_mat("MAT_WPN_WeatheredSteel", "#76808A", 0.94, 0.28),
        "charcoal": make_mat("MAT_WPN_CharcoalIron", "#22272B", 0.88, 0.42),
        "bronze": make_mat("MAT_WPN_OxidizedBronze", "#9C7848", 0.88, 0.34),
        "slate": make_mat("MAT_WPN_BasaltSlate", "#3A4148", 0.14, 0.84),
        "yew": make_mat("MAT_WPN_BlackYew", "#271F1B", 0.02, 0.68),
        "oak": make_mat("MAT_WPN_ShieldOak", "#4B3726", 0.0, 0.78),
        "leather": make_mat("MAT_WPN_LeatherGrip", "#2C2018", 0.04, 0.82),
        "horn": make_mat("MAT_WPN_CarvedHorn", "#D9D1BE", 0.02, 0.50),
        "silver": make_mat("MAT_WPN_SilverThread", "#C7D0D8", 0.92, 0.22),
        "oath_blue": make_mat("MAT_Emissive_OathBlue", "#6D9CB6", 0.1, 0.16, "#6D9CB6", 3.6),
        "lightning": make_mat("MAT_Emissive_StormChannel", "#9AD8F2", 0.1, 0.14, "#8DD4F4", 3.8),
        "ember": make_mat("MAT_Emissive_TormentEmber", "#A84A3A", 0.1, 0.20, "#C95238", 3.2),
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


def loft(bm, sections):
    rings = [[bm.verts.new(p) for p in pts] for pts in sections]
    n = len(rings[0])
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(n):
            jn = (j + 1) % n
            try:
                bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
            except ValueError:
                pass
    for cap in (list(reversed(rings[0])), rings[-1]):
        try:
            bm.faces.new(cap)
        except ValueError:
            pass


def finalize_weapon(name, bm, mat_list, col):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00025)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    for m in mat_list:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(36.0))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def build_oathbreaker(mats, col):
    bm = bmesh.new()
    ml = [mats["steel"], mats["charcoal"], mats["bronze"], mats["leather"], mats["oath_blue"]]
    # Broad notched two-handed steel greatsword (1.58m total)
    def blade(s):
        secs = [
            (0.24, 0.068, 0.015), (0.48, 0.064, 0.014), (0.62, 0.050, 0.014),  # Forged oath-notch!
            (0.68, 0.064, 0.014), (1.02, 0.056, 0.012), (1.26, 0.036, 0.008), (1.38, 0.002, 0.002),
        ]
        loft(s, [[Vector((0, w, z)), Vector((t, 0, z)), Vector((0, -w, z)), Vector((-t, 0, z))] for z, w, t in secs])
    add_part(bm, blade, 0)
    def guard(s):
        r = bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.22)) @ Matrix.Diagonal((0.05, 0.30, 0.055, 1)))
        bmesh.ops.bevel(s, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.008, segments=2, affect="EDGES", clamp_overlap=True)
        bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.042, matrix=Matrix.Translation((0, 0, -0.22)))
    add_part(bm, guard, 1)
    def bronze_rings(s):
        for y in (-0.12, 0.12):
            bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.032, radius2=0.032, depth=0.025, matrix=Matrix.Translation((0, y, 0.22)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4())
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.28)) @ Matrix.Diagonal((0.042, 0.11, 0.07, 1)))
    add_part(bm, bronze_rings, 2)
    def grip(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.022, radius2=0.020, depth=0.40, matrix=Matrix.Translation((0, 0, 0.0)))
    add_part(bm, grip, 3)
    def runes(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.68)) @ Matrix.Diagonal((0.029, 0.020, 0.64, 1)))
    add_part(bm, runes, 4)
    return finalize_weapon("WPN_Oathbreaker", bm, ml, col)


def build_iron_sword(mats, col):
    bm = bmesh.new()
    ml = [mats["steel"], mats["charcoal"], mats["bronze"], mats["leather"]]
    def blade(s):
        secs = [(0.16, 0.042, 0.011), (0.58, 0.038, 0.010), (0.86, 0.026, 0.007), (0.98, 0.002, 0.002)]
        loft(s, [[Vector((0, w, z)), Vector((t, 0, z)), Vector((0, -w, z)), Vector((-t, 0, z))] for z, w, t in secs])
    add_part(bm, blade, 0)
    def guard(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.14)) @ Matrix.Diagonal((0.034, 0.20, 0.036, 1)))
    add_part(bm, guard, 1)
    def pommel(s):
        bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.032, matrix=Matrix.Translation((0, 0, -0.16)))
    add_part(bm, pommel, 2)
    def grip(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.018, radius2=0.017, depth=0.28, matrix=Matrix.Translation((0, 0, -0.01)))
    add_part(bm, grip, 3)
    return finalize_weapon("WPN_IronSword", bm, ml, col)


def build_frost_axe(mats, col):
    bm = bmesh.new()
    ml = [mats["steel"], mats["charcoal"], mats["bronze"], mats["yew"], mats["oath_blue"]]
    def blades(s):
        secs = [(0.04, 0.08, 0.018), (0.14, 0.15, 0.011), (0.22, 0.18, 0.002)]
        loft(s, [[Vector((0, y, 0.54 + h * 0.8)), Vector((t, y, 0.54)), Vector((0, y, 0.54 - h * 1.15)), Vector((-t, y, 0.54))] for y, h, t in secs])
    add_part(bm, blades, 0)
    def socket(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.54)) @ Matrix.Diagonal((0.046, 0.08, 0.14, 1)))
        bmesh.ops.create_cone(s, cap_ends=True, segments=4, radius1=0.028, radius2=0.002, depth=0.14, matrix=Matrix.Translation((0, 0, 0.67)))
    add_part(bm, socket, 1)
    def collar(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.028, radius2=0.032, depth=0.05, matrix=Matrix.Translation((0, 0, 0.44)))
    add_part(bm, collar, 2)
    def haft(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.020, radius2=0.018, depth=0.82, matrix=Matrix.Translation((0, 0, 0.22)))
    add_part(bm, haft, 3)
    def rune(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.08, 0.54)) @ Matrix.Diagonal((0.032, 0.04, 0.08, 1)))
    add_part(bm, rune, 4)
    return finalize_weapon("WPN_FrostAxe", bm, ml, col)


def build_nightpiercer(mats, col):
    bm = bmesh.new()
    ml = [mats["yew"], mats["horn"], mats["silver"], mats["leather"]]
    def limbs(s):
        pts = [(-0.62, -0.14, 0.010), (-0.48, 0.04, 0.018), (-0.26, 0.14, 0.022), (0, 0.06, 0.020), (0.26, 0.14, 0.022), (0.48, 0.04, 0.018), (0.62, -0.14, 0.010)]
        loft(s, [[Vector((0, y + r, z)), Vector((r, y, z)), Vector((0, y - r, z)), Vector((-r, y, z))] for z, y, r in pts])
    add_part(bm, limbs, 0)
    def tips(s):
        for sgn in (-1, 1):
            bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.014, radius2=0.003, depth=0.10, matrix=Matrix.Translation((0, -0.14, sgn * 0.65)) @ Euler((sgn * 0.5, 0, 0)).to_matrix().to_4x4())
    add_part(bm, tips, 1)
    def string(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=6, radius1=0.003, radius2=0.003, depth=1.26, matrix=Matrix.Translation((0, -0.14, 0)))
    add_part(bm, string, 2)
    def grip(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.024, radius2=0.024, depth=0.16, matrix=Matrix.Translation((0, 0.04, 0)))
    add_part(bm, grip, 3)
    return finalize_weapon("WPN_Nightpiercer", bm, ml, col)


def build_iron_shield(mats, col):
    bm = bmesh.new()
    ml = [mats["oak"], mats["charcoal"], mats["steel"], mats["bronze"]]
    def body(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=18, radius1=0.34, radius2=0.33, depth=0.036, matrix=Euler((0, math.pi / 2, 0)).to_matrix().to_4x4())
    add_part(bm, body, 0)
    def bands(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0.022, 0, 0)) @ Matrix.Diagonal((0.016, 0.64, 0.048, 1)))
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0.022, 0, 0)) @ Matrix.Diagonal((0.016, 0.048, 0.64, 1)))
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.015, radius2=0.015, depth=0.22, matrix=Matrix.Translation((-0.04, 0, 0)))
    add_part(bm, bands, 1)
    def boss(s):
        bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.10, matrix=Matrix.Translation((0.026, 0, 0)) @ Matrix.Diagonal((0.65, 1.0, 1.0, 1)))
    add_part(bm, boss, 2)
    def studs(s):
        for i in range(8):
            a = i * (math.pi / 4)
            bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.016, matrix=Matrix.Translation((0.028, math.cos(a) * 0.28, math.sin(a) * 0.28)))
    add_part(bm, studs, 3)
    return finalize_weapon("WPN_IronShield", bm, ml, col)


def build_oblivion_staff(mats, col):
    bm = bmesh.new()
    ml = [mats["charcoal"], mats["slate"], mats["bronze"], mats["oath_blue"]]
    def shaft(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.020, radius2=0.026, depth=1.75, matrix=Matrix.Translation((0, 0, 0.22)))
    add_part(bm, shaft, 0)
    def shards(s):
        for i in range(4):
            a = i * (math.pi / 2)
            m = Matrix.Translation((math.cos(a) * 0.14, math.sin(a) * 0.14, 1.24)) @ Euler((0.25, 0.2, a)).to_matrix().to_4x4() @ Matrix.Diagonal((0.045, 0.045, 0.16, 1))
            bmesh.ops.create_cube(s, size=1.0, matrix=m)
    add_part(bm, shards, 1)
    def cradle(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.04, radius2=0.08, depth=0.14, matrix=Matrix.Translation((0, 0, 1.08)))
    add_part(bm, cradle, 2)
    def core(s):
        bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.075, matrix=Matrix.Translation((0, 0, 1.26)))
    add_part(bm, core, 3)
    return finalize_weapon("WPN_StaffOfOblivion", bm, ml, col)


def build_worldshatter(mats, col):
    bm = bmesh.new()
    ml = [mats["slate"], mats["steel"], mats["bronze"], mats["leather"], mats["lightning"]]
    def head(s):
        r = bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.72)) @ Matrix.Diagonal((0.20, 0.38, 0.22, 1)))
        bmesh.ops.bevel(s, geom=list({e for v in r["verts"] for e in v.link_edges}), offset=0.032, segments=2, affect="EDGES", clamp_overlap=True)
    add_part(bm, head, 0)
    def faces(s):
        for sy in (-0.19, 0.19):
            bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, sy, 0.72)) @ Matrix.Diagonal((0.22, 0.06, 0.24, 1)))
        bmesh.ops.create_cone(s, cap_ends=True, segments=4, radius1=0.055, radius2=0.004, depth=0.18, matrix=Matrix.Translation((0, 0, 0.90)))
    add_part(bm, faces, 1)
    def straps(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.028, radius2=0.030, depth=1.05, matrix=Matrix.Translation((0, 0, 0.22)))
    add_part(bm, straps, 2)
    def grip(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.032, radius2=0.030, depth=0.34, matrix=Matrix.Translation((0, 0, 0.0)))
    add_part(bm, grip, 3)
    def channels(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.72)) @ Matrix.Diagonal((0.215, 0.24, 0.05, 1)))
    add_part(bm, channels, 4)
    return finalize_weapon("WPN_Worldshatter", bm, ml, col)


def build_torment_links(mats, col):
    bm = bmesh.new()
    ml = [mats["charcoal"], mats["steel"], mats["leather"], mats["ember"]]
    def hook_blade(s):
        secs = [(0.16, 0.035, 0.010), (0.36, 0.055, 0.011), (0.56, 0.088, 0.009), (0.68, 0.015, 0.003)]
        loft(s, [[Vector((0, w + 0.03, z)), Vector((t, 0, z)), Vector((0, -0.02, z)), Vector((-t, 0, z))] for z, w, t in secs])
    add_part(bm, hook_blade, 1)
    def chain_links(s):
        for i in range(4):
            bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.028, radius2=0.028, depth=0.016, matrix=Matrix.Translation((0, -0.04, -0.14 - i * 0.055)) @ Euler((0, math.pi / 2 if i % 2 else 0, 0)).to_matrix().to_4x4())
    add_part(bm, chain_links, 0)
    def grip(s):
        bmesh.ops.create_cone(s, cap_ends=True, segments=8, radius1=0.018, radius2=0.018, depth=0.26, matrix=Matrix.Translation((0, 0, 0.0)))
    add_part(bm, grip, 2)
    def tether_glow(s):
        bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.03, 0.42)) @ Matrix.Diagonal((0.022, 0.014, 0.34, 1)))
    add_part(bm, tether_glow, 3)
    return finalize_weapon("WPN_TormentLinks", bm, ml, col)


def main():
    reset_scene()
    col = bpy.data.collections.new("COL_Eidrath_Weapons")
    bpy.context.scene.collection.children.link(col)
    mats = create_mats()

    builders = [
        ("wpn_oathbreaker", build_oathbreaker),
        ("wpn_iron_sword", build_iron_sword),
        ("wpn_frost_axe", build_frost_axe),
        ("wpn_nightpiercer", build_nightpiercer),
        ("wpn_iron_shield", build_iron_shield),
        ("wpn_oblivion_staff", build_oblivion_staff),
        ("wpn_worldshatter", build_worldshatter),
        ("wpn_torment_links", build_torment_links),
    ]

    objs = []
    stats = []
    for wid, fn in builders:
        obj = fn(mats, col)
        objs.append(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        glb_path = OUT_GLB / f"{wid}.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path), export_format="GLB", use_selection=True,
            export_yup=True, export_apply=True, export_materials="EXPORT", export_normals=True, export_texcoords=True,
        )
        tris = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        stats.append({"id": wid, "mesh": obj.name, "tris": tris, "glb_kb": round(glb_path.stat().st_size / 1024, 1)})
        obj.select_set(False)

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "eidrath_weapons.blend"))

    # Arrange QA lineup render
    xs = [-2.1, -1.5, -0.9, -0.3, 0.35, 1.0, 1.65, 2.25]
    for obj, xp in zip(objs, xs):
        obj.location = (xp, 0, 0.55)
        obj.rotation_euler = (0, 0, math.radians(-64))

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.02))
    fl = bpy.context.active_object
    fl.data.materials.append(make_mat("MAT_QA_WpnFloor", "#2C3238", 0.08, 0.72))
    w = bpy.data.worlds.new("WLD_QA_Wpns")
    bpy.context.scene.world = w
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*hex_to_linear("#1E2429"), 1.0)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1

    ld = bpy.data.lights.new("LGT_Key", type="AREA")
    ld.energy = 600
    ld.size = 3.2
    lo = bpy.data.objects.new("LGT_Key", ld)
    lo.location = (3, -4.5, 3.2)
    lo.rotation_euler = (math.radians(58), 0, math.radians(32))
    bpy.context.scene.collection.objects.link(lo)

    cd = bpy.data.cameras.new("CAM_QA_Wpns")
    cd.lens = 34
    cam = bpy.data.objects.new("CAM_QA_Wpns", cd)
    cam.location = (0.1, -5.8, 1.15)
    cam.rotation_euler = (Vector((0.1, 0, 0.85)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.view_settings.view_transform = "AgX"
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 760
    out_png = OUT_PREVIEW / "eidrath_weapons_qa.png"
    sc.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)

    print("EIDRATH_WEAPONS_JSON=" + json.dumps(stats, indent=2))
    print(f"QA_RENDER={out_png}")


if __name__ == "__main__":
    main()
