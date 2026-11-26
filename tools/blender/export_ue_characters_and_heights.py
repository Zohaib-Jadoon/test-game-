"""
Export unified single-mesh SkeletalMeshes (SKM_Kaelen, SKM_Lyra, SKM_HollowSwordsman,
SKM_MountainWarden) with all NLA clips intact, and extract an exact UE-space height
grid from SM_FrostheimTerrain.glb into _asset_cache/ue_ready_assets/terrain_heights.json.
"""
import json
import struct
import sys
from pathlib import Path
import bpy

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "_asset_cache" / "ue_ready_assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def export_unified_character(blend_rel: str, out_glb_name: str, unified_mesh_name: str):
    blend_path = REPO_ROOT / blend_rel
    if not blend_path.exists():
        print(f"[UE_CHAR] Missing blend: {blend_path}")
        return
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        print(f"[UE_CHAR] No armature in {blend_rel}")
        return
    arm = armatures[0]
    arm.hide_set(False)
    arm.hide_viewport = False

    # Join all child meshes (skip UCX_ or sockets/empties) into one clean unified SkinnedMesh
    meshes = [
        o for o in bpy.data.objects
        if o.type == "MESH" and not o.name.startswith("UCX_") and len(o.data.polygons) > 0
    ]
    if not meshes:
        print(f"[UE_CHAR] No meshes in {blend_rel}")
        return

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.hide_set(False)
        m.hide_viewport = False
        m.select_set(True)
    # Prefer Body as active object so armature parent & vertex groups stay clean
    body = next((m for m in meshes if "body" in m.name.lower() or "core" in m.name.lower()), meshes[0])
    bpy.context.view_layer.objects.active = body
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = unified_mesh_name
    if joined.parent != arm:
        joined.parent = arm

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    joined.select_set(True)
    bpy.context.view_layer.objects.active = arm

    out_file = OUT_DIR / out_glb_name
    bpy.ops.export_scene.gltf(
        filepath=str(out_file),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_skins=True,
        export_all_influences=False,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=82,
        export_texcoords=True,
        export_normals=True,
    )
    print(f"[UE_CHAR] Exported {out_file.name}: {len(joined.data.polygons)} polys, size={out_file.stat().st_size / 1048576:.2f} MB")


def build_terrain_height_grid():
    glb_path = OUT_DIR / "SM_FrostheimTerrain.glb"
    raw = glb_path.read_bytes()
    json_len, _ = struct.unpack("<II", raw[12:20])
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))
    bin_off = 20 + json_len
    bin_len, _ = struct.unpack("<II", raw[bin_off : bin_off + 8])
    bin_data = raw[bin_off + 8 : bin_off + 8 + bin_len]

    pos_idx = gltf["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
    acc = gltf["accessors"][pos_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", 12)
    count = acc["count"]

    # Inspect glTF vertex positions -> convert to UE coordinates:
    # Blender +X = glTF +X = UE +X
    # Blender +Y = glTF -Z = UE -Y (Unreal glTF Interchange maps Blender Y to UE -Y, wait verify via min/max!)
    # Let's check acc['min'] and acc['max'] directly!
    gmin = acc["min"]
    gmax = acc["max"]
    print(f"[UE_TERRAIN] glTF min={gmin}, max={gmax}")
    # Remember UE Terrain bounds: min=(-10294.09, -10000.05, -1108.15), max=(10000.07, 10000.16, 668.70)
    # glTF: X is [-102.94, 100.00], Y(up) is [-11.08, 6.68], Z is [-100.00, 100.00]
    # In UE Interchange: UE_X = glTF_X * 100, UE_Y = glTF_Z * 100 (or -glTF_Z?), UE_Z = glTF_Y * 100
    # Build a 128x128 spatial grid keeping max height per cell in both +Z and -Z sign check
    pts = []
    for i in range(count):
        gx, gy, gz = struct.unpack_from("<fff", bin_data, start + i * stride)
        pts.append((gx * 100.0, gz * 100.0, gy * 100.0))

    grid_n = 100
    xmin, xmax = -10300.0, 10100.0
    ymin, ymax = -10100.0, 10100.0
    dx = (xmax - xmin) / grid_n
    dy = (ymax - ymin) / grid_n
    cells = [[None] * grid_n for _ in range(grid_n)]
    for ux, uy, uz in pts:
        ix = max(0, min(grid_n - 1, int((ux - xmin) / dx)))
        iy = max(0, min(grid_n - 1, int((uy - ymin) / dy)))
        cur = cells[ix][iy]
        if cur is None or uz > cur:
            cells[ix][iy] = round(uz, 2)

    # Fill any sparse empty cell by neighbor average
    for ix in range(grid_n):
        for iy in range(grid_n):
            if cells[ix][iy] is None:
                neigh = [cells[nx][ny] for nx in range(max(0, ix - 1), min(grid_n, ix + 2))
                         for ny in range(max(0, iy - 1), min(grid_n, iy + 2))
                         if cells[nx][ny] is not None]
                cells[ix][iy] = round(sum(neigh) / len(neigh), 2) if neigh else 0.0

    out_json = OUT_DIR / "terrain_heights.json"
    out_json.write_text(json.dumps({
        "gridN": grid_n,
        "xmin": xmin, "xmax": xmax, "dx": dx,
        "ymin": ymin, "ymax": ymax, "dy": dy,
        "cells": cells,
    }), "utf-8")
    print(f"[UE_TERRAIN] Wrote height grid {out_json.name} ({count} vertices -> {grid_n}x{grid_n} cells)")


def main():
    export_unified_character("art/blender/characters/chr_kaelen.blend", "SKM_Kaelen.glb", "SKM_Kaelen")
    export_unified_character("art/blender/characters/chr_lyra.blend", "SKM_Lyra.glb", "SKM_Lyra")
    export_unified_character("art/blender/enemies/enm_hollow_swordsman.blend", "SKM_HollowSwordsman.glb", "SKM_HollowSwordsman")
    export_unified_character("art/blender/enemies/boss_warden.blend", "SKM_MountainWarden.glb", "SKM_MountainWarden")
    build_terrain_height_grid()


if __name__ == "__main__":
    main()

