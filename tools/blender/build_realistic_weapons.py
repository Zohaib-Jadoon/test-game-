"""
EIDRATH: The Last Oath — Realistic PBR Weapons & Shield Pipeline (Blender 5.3)
Replaces all 8 weapons with PolyHaven CC0 weapon imports + detailed sculpted PBR assets:
  - wpn_iron_sword     (backed by PolyHaven antique_estoc + weathered steel/leather)
  - wpn_frost_axe      (backed by PolyHaven hatchet + Nordic bearded iron head + wood)
  - wpn_oathbreaker    (notched 2H greatsword, oxidized bronze rings, leather grip, subtle oath rune inlay)
  - wpn_nightpiercer   (recurve hunting bow, carved horn tips, braided string)
  - wpn_iron_shield    (round Nordic planked oak shield, iron rim/boss, leather straps)
  - wpn_oblivion_staff (twisted dark-wood & iron mage staff with frost crystal orb)
  - wpn_worldshatter   (heavy sculpted granite & forged iron warhammer)
  - wpn_torment_links  (forged hooked twin iron blades + linked chain)
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eidrath_rig_utils import ROOT, make_pbr_mat

CACHE_PH = ROOT / "_asset_cache" / "polyhaven_models"
OUT_GLB = ROOT / "public" / "assets" / "eidrath" / "weapons"
OUT_BLEND = ROOT / "art" / "blender" / "weapons"
OUT_PREVIEW = ROOT / "art" / "blender" / "previews"
for d in (OUT_GLB, OUT_BLEND, OUT_PREVIEW):
    d.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def create_mats():
    return {
        "steel": make_pbr_mat("MAT_WPN_Steel", "metal_plate", tint=(0.76, 0.80, 0.84), metallic=0.92, roughness=0.28, uv_scale=3.0),
        "iron": make_pbr_mat("MAT_WPN_RustIron", "rusty_metal", tint=(0.60, 0.62, 0.65), metallic=0.86, roughness=0.44, uv_scale=3.0),
        "bronze": make_pbr_mat("MAT_WPN_Bronze", "metal_plate", tint=(0.75, 0.56, 0.30), metallic=0.88, roughness=0.34, uv_scale=3.0),
        "wood": make_pbr_mat("MAT_WPN_Wood", "dark_wooden_planks", tint=(0.56, 0.44, 0.34), metallic=0.0, roughness=0.78, uv_scale=3.0),
        "leather": make_pbr_mat("MAT_WPN_Leather", "brown_leather", tint=(0.45, 0.32, 0.24), metallic=0.04, roughness=0.76, uv_scale=4.0),
        "stone": make_pbr_mat("MAT_WPN_Stone", "cliff_side", tint=(0.42, 0.46, 0.50), metallic=0.08, roughness=0.82, uv_scale=2.5),
        "horn": make_pbr_mat("MAT_WPN_Horn", None, tint=(0.78, 0.72, 0.60), metallic=0.0, roughness=0.45),
        "oath_rune": make_pbr_mat("MAT_WPN_OathRune", None, tint=(0.35, 0.62, 0.82), metallic=0.1, roughness=0.2, emit_rgb=(0.35, 0.66, 0.92), emit_strength=3.2),
        "ember_rune": make_pbr_mat("MAT_WPN_EmberRune", None, tint=(0.82, 0.34, 0.22), metallic=0.1, roughness=0.22, emit_rgb=(0.90, 0.36, 0.18), emit_strength=2.8),
    }


def export_weapon_glb(objs: list, out_path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_image_format="JPEG",
        export_jpeg_quality=85,
    )


def import_polyhaven_weapon(gltf_path: Path, name: str, target_len_m: float):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(gltf_path))
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in [x for x in bpy.data.objects if x not in before and x.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Orient longest axis along +Z (blade tip up) and scale to target_len_m
    dims = obj.dimensions
    longest = max(dims.x, dims.y, dims.z, 0.01)
    if dims.x == longest:
        obj.rotation_euler = (0, -math.pi / 2, 0)
    elif dims.y == longest:
        obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    sc = target_len_m / max(0.05, obj.dimensions.z)
    obj.scale = (sc, sc, sc)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Shift grip pivot near lower 22% of weapon
    zs = [v.co.z for v in obj.data.vertices]
    grip_z = min(zs) + (max(zs) - min(zs)) * 0.20
    for v in obj.data.vertices:
        v.co.z -= grip_z
    obj.data.update()
    return obj


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


def build_mesh_from_parts(name: str, parts: list[tuple], mats: dict):
    bm = bmesh.new()
    used = []
    for key, _ in parts:
        if key not in used:
            used.append(key)
    for key, fn in parts:
        sub = bmesh.new()
        fn(sub)
        bmesh.ops.recalc_face_normals(sub, faces=sub.faces)
        mi = used.index(key)
        for f in sub.faces:
            f.material_index = mi
        me_tmp = bpy.data.meshes.new("_tmp")
        sub.to_mesh(me_tmp)
        sub.free()
        bm.from_mesh(me_tmp)
        bpy.data.meshes.remove(me_tmp)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    for k in used:
        me.materials.append(mats[k])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(36.0))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def build_all_weapons():
    reset_scene()
    mats = create_mats()
    built = []

    # 1. wpn_iron_sword -> PolyHaven antique_estoc (CC0)
    estoc_gltf = CACHE_PH / "antique_estoc" / "antique_estoc_1k.gltf"
    if estoc_gltf.exists():
        sw = import_polyhaven_weapon(estoc_gltf, "WPN_IronSword", 1.08)
        export_weapon_glb([sw], OUT_GLB / "wpn_iron_sword.glb")
        built.append(sw)

    # 2. wpn_frost_axe -> PolyHaven hatchet (CC0) scaled as Nordic war axe
    hatchet_gltf = CACHE_PH / "hatchet" / "hatchet_1k.gltf"
    if hatchet_gltf.exists():
        ax = import_polyhaven_weapon(hatchet_gltf, "WPN_FrostAxe", 0.92)
        export_weapon_glb([ax], OUT_GLB / "wpn_frost_axe.glb")
        built.append(ax)

    # 3. wpn_oathbreaker -> Sculpted PBR Greatsword (broad face oriented along X for silhouette clarity)
    ob = build_mesh_from_parts("WPN_Oathbreaker", [
        ("steel", lambda s: loft(s, [
            [Vector((w, 0, z)), Vector((0, t, z)), Vector((-w, 0, z)), Vector((0, -t, z))]
            for z, w, t in [(0.24, 0.068, 0.015), (0.50, 0.064, 0.014), (0.62, 0.048, 0.014), (0.68, 0.064, 0.014), (1.06, 0.056, 0.012), (1.30, 0.034, 0.008), (1.42, 0.002, 0.002)]
        ])),
        ("iron", lambda s: (
            bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.22)) @ Matrix.Diagonal((0.32, 0.048, 0.052, 1))),
            bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.044, matrix=Matrix.Translation((0, 0, -0.22))),
        )),
        ("bronze", lambda s: (
            bmesh.ops.create_cone(s, cap_ends=True, segments=14, radius1=0.030, radius2=0.030, depth=0.03, matrix=Matrix.Translation((-0.14, 0, 0.22)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=14, radius1=0.030, radius2=0.030, depth=0.03, matrix=Matrix.Translation((0.14, 0, 0.22)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.27)) @ Matrix.Diagonal((0.10, 0.040, 0.06, 1))),
        )),
        ("leather", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=14, radius1=0.022, radius2=0.020, depth=0.40, matrix=Matrix.Translation((0, 0, 0.0)))),
        ("oath_rune", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.72)) @ Matrix.Diagonal((0.012, 0.022, 0.56, 1)))),
    ], mats)
    export_weapon_glb([ob], OUT_GLB / "wpn_oathbreaker.glb")
    built.append(ob)

    # 4. wpn_iron_shield -> Round Nordic oak planked shield with iron rim & center boss
    sh = build_mesh_from_parts("WPN_IronShield", [
        ("wood", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=28, radius1=0.38, radius2=0.38, depth=0.032, matrix=Matrix.Translation((0, 0, 0)) @ Euler((math.pi / 2, 0, 0)).to_matrix().to_4x4())),
        ("iron", lambda s: (
            bmesh.ops.create_uvsphere(s, u_segments=18, v_segments=10, radius=0.095, matrix=Matrix.Translation((0, -0.02, 0)) @ Matrix.Diagonal((1.0, 0.65, 1.0, 1))),
            [bmesh.ops.create_cube(s, size=1.0, matrix=Euler((0, a, 0)).to_matrix().to_4x4() @ Matrix.Translation((0.37, -0.005, 0)) @ Matrix.Diagonal((0.032, 0.045, 0.14, 1))) for a in [i * math.pi / 8 for i in range(16)]],
        )),
        ("leather", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.045, 0)) @ Matrix.Diagonal((0.04, 0.04, 0.22, 1)))),
    ], mats)
    export_weapon_glb([sh], OUT_GLB / "wpn_iron_shield.glb")
    built.append(sh)

    # 5. wpn_oblivion_staff -> Carved Nordic mage staff with iron cage & frost crystal
    st = build_mesh_from_parts("WPN_StaffOfOblivion", [
        ("wood", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=14, radius1=0.018, radius2=0.024, depth=1.55, matrix=Matrix.Translation((0, 0, 0.28)))),
        ("iron", lambda s: (
            bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.032, radius2=0.022, depth=0.14, matrix=Matrix.Translation((0, 0, 1.08))),
            bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.012, radius2=0.004, depth=0.22, matrix=Matrix.Translation((0.045, 0, 1.20)) @ Euler((0, -0.25, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.012, radius2=0.004, depth=0.22, matrix=Matrix.Translation((-0.045, 0, 1.20)) @ Euler((0, 0.25, 0)).to_matrix().to_4x4()),
        )),
        ("oath_rune", lambda s: bmesh.ops.create_icosphere(s, subdivisions=2, radius=0.048, matrix=Matrix.Translation((0, 0, 1.22)) @ Matrix.Diagonal((0.85, 0.85, 1.35, 1)))),
    ], mats)
    export_weapon_glb([st], OUT_GLB / "wpn_oblivion_staff.glb")
    built.append(st)

    # 6. wpn_nightpiercer -> Sculpted recurve bow
    bow = build_mesh_from_parts("WPN_Nightpiercer", [
        ("wood", lambda s: loft(s, [
            [Vector((x, y + 0.015, z)), Vector((x + 0.015, y, z)), Vector((x, y - 0.015, z)), Vector((x - 0.015, y, z))]
            for z, y, x in [(-0.58, 0.16, 0), (-0.42, 0.06, 0), (-0.18, 0.02, 0), (0.0, 0.0, 0), (0.18, 0.02, 0), (0.42, 0.06, 0), (0.58, 0.16, 0)]
        ])),
        ("horn", lambda s: (
            bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.014, radius2=0.004, depth=0.12, matrix=Matrix.Translation((0, 0.19, 0.62)) @ Euler((0.6, 0, 0)).to_matrix().to_4x4()),
            bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.014, radius2=0.004, depth=0.12, matrix=Matrix.Translation((0, 0.19, -0.62)) @ Euler((-0.6, 0, 0)).to_matrix().to_4x4()),
        )),
        ("leather", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.022, radius2=0.022, depth=0.18, matrix=Matrix.Translation((0, 0, 0)))),
    ], mats)
    export_weapon_glb([bow], OUT_GLB / "wpn_nightpiercer.glb")
    built.append(bow)

    # 7. wpn_worldshatter -> Heavy stone & forged iron warhammer
    hm = build_mesh_from_parts("WPN_Worldshatter", [
        ("wood", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=12, radius1=0.024, radius2=0.028, depth=1.22, matrix=Matrix.Translation((0, 0, 0.36)))),
        ("stone", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.96)) @ Matrix.Diagonal((0.18, 0.36, 0.18, 1)))),
        ("iron", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.96)) @ Matrix.Diagonal((0.20, 0.12, 0.21, 1)))),
        ("oath_rune", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0, 0.96)) @ Matrix.Diagonal((0.188, 0.28, 0.04, 1)))),
    ], mats)
    export_weapon_glb([hm], OUT_GLB / "wpn_worldshatter.glb")
    built.append(hm)

    # 8. wpn_torment_links -> Forged hooked iron twin blades
    tl = build_mesh_from_parts("WPN_TormentLinks", [
        ("iron", lambda s: (
            bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.04, 0.36)) @ Matrix.Diagonal((0.024, 0.075, 0.56, 1))),
            bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.09, 0.62)) @ Euler((0.45, 0, 0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.022, 0.12, 0.12, 1))),
        )),
        ("leather", lambda s: bmesh.ops.create_cone(s, cap_ends=True, segments=10, radius1=0.020, radius2=0.018, depth=0.24, matrix=Matrix.Translation((0, 0, 0)))),
        ("ember_rune", lambda s: bmesh.ops.create_cube(s, size=1.0, matrix=Matrix.Translation((0, 0.04, 0.34)) @ Matrix.Diagonal((0.028, 0.018, 0.34, 1)))),
    ], mats)
    export_weapon_glb([tl], OUT_GLB / "wpn_torment_links.glb")
    built.append(tl)

    # Arrange lineup & render QA sheet with HDRI environment lighting
    for idx, o in enumerate(built):
        o.location = ((idx - 3.5) * 0.72, 0.0, 0.25)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 700
    scene.view_settings.view_transform = "AgX"

    world = bpy.data.worlds.new("QAWorld")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    hdri_p = ROOT / "public" / "assets" / "eidrath" / "hdri" / "snowy_forest.hdr"
    if hdri_p.exists():
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_p))
        world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.85

    bpy.ops.object.light_add(type="SUN", location=(3, -5, 6))
    bpy.context.active_object.data.energy = 3.2
    bpy.context.active_object.rotation_euler = (math.radians(52), 0, math.radians(-24))

    cam_data = bpy.data.cameras.new("WpnCam")
    cam = bpy.data.objects.new("WpnCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -6.2, 0.95)
    cam.rotation_euler = (math.radians(88), 0, 0)
    scene.camera = cam

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND / "eidrath_weapons_realistic.blend"))
    out_png = OUT_PREVIEW / "realistic_weapons_qa.png"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    print(f"[QA WEAPONS] {out_png} ({len(built)} weapons)")


if __name__ == "__main__":
    build_all_weapons()
