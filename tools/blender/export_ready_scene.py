"""Export a reviewed collection from an artist-made Blender scene; no generated placeholder.
Run Blender with --disable-autoexec and open the downloaded .blend:
blender --background --disable-autoexec PATH.blend --python tools/blender/export_ready_scene.py -- --source-id pine-forest --id pine-title --collection COLLECTION
Export stays staged until explicit activation with --placement FILE.
"""
import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
CATALOG = {x["id"]: x for x in json.loads((ROOT / "tools/assets/ready_scene_sources.json").read_text("utf-8"))["sources"]}
CONFIG = ROOT / "src/game/assets/ready-scenes.json"
STAGING = ROOT / "_asset_cache/ready-scenes/exports"
RUNTIME = ROOT / "public/assets/eidrath/ready-scenes"

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def validate_placement(data, mode):
    if mode == "title":
        for key in ("position", "target"):
            assert isinstance(data.get(key), list) and len(data[key]) == 3 and all(finite(v) for v in data[key]), f"Invalid {key}"
    else:
        assert all(finite(data.get(k)) for k in ("x", "z", "yaw", "scale", "radius")), "Invalid zone placement"
        assert data["scale"] > 0 and 0 < data["radius"] <= 45, "Zone radius must be 0–45 m"
        assert isinstance(data.get("omit"), list) and all(isinstance(s, str) and re.fullmatch(r"env_[a-z0-9_]+", s) for s in data["omit"]), "Only visual environment assets may be omitted"
        assert isinstance(data.get("colliders"), list) and data["colliders"], "Supply reviewed world-space obstacle circles"
        for c in data["colliders"]:
            assert all(finite(c.get(k)) for k in ("x", "z", "radius")) and c["radius"] > 0, "Invalid collider"
            assert math.hypot(c["x"] - data["x"], c["z"] - data["z"]) <= data["radius"], "Collider outside zone"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-id", required=True, choices=CATALOG)
    parser.add_argument("--id", required=True)
    parser.add_argument("--collection", required=True, help="Name of the adapted/optimized author collection")
    parser.add_argument("--max-triangles", type=int, default=350000)
    parser.add_argument("--max-mib", type=int, default=45)
    parser.add_argument("--placement", type=Path, help="Explicit placement JSON, with mode title or zone; activate only after visual review")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not re.fullmatch(r"[a-z0-9_-]+", args.id):
        parser.error("Invalid scene id")
    source = CATALOG[args.source_id]
    collection = bpy.data.collections.get(args.collection)
    if collection is None:
        raise RuntimeError("Collection not found. Available: " + ", ".join(c.name for c in bpy.data.collections))
    objects = [o for o in collection.all_objects if o.type == "MESH" and not o.hide_get() and not o.hide_render]
    if not objects:
        raise RuntimeError("No visible mesh objects in collection")
    # Refuse an unbaked geometry-node/particle forest: the artist must prepare LODs and realized meshes.
    for obj in objects:
        if any(m.type == "NODES" for m in obj.modifiers) or len(obj.particle_systems):
            raise RuntimeError("Bake/realize or replace procedural geometry before export: " + obj.name)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            tris += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    if tris > args.max_triangles:
        raise RuntimeError(f"Scene has {tris:,} triangles, exceeds {args.max_triangles:,}; optimize the real meshes first")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    STAGING.mkdir(parents=True, exist_ok=True)
    output = STAGING / (args.id + ".glb")
    result = bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False, export_materials="EXPORT", export_normals=True, export_texcoords=True)
    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError("GLB export failed")
    if output.stat().st_size > args.max_mib * 1024**2:
        raise RuntimeError("GLB too large; optimize textures/materials before activation")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(json.dumps({"source": source["source"], "license": source["license"], "glb": str(output), "triangles": tris, "sha256": digest, "status": "staged-not-visual-approved"}, indent=2))
    if args.placement:
        placement = json.loads(args.placement.read_text("utf-8"))
        mode = placement.pop("mode", None)
        if mode not in ("title", "zone"):
            parser.error("Placement mode must be title or zone")
        validate_placement(placement, mode)
        cfg = json.loads(CONFIG.read_text("utf-8"))
        record = {**placement, "id": args.id, "file": f"/assets/eidrath/ready-scenes/{args.id}.glb", "source": source["source"], "creator": source["creator"], "license": source["license"], "sha256": digest}
        if mode == "title":
            cfg["title"] = record
        else:
            remaining = [z for z in cfg["zones"] if z["id"] != args.id]
            for z in remaining:
                if math.hypot(z["x"] - record["x"], z["z"] - record["z"]) < z["radius"] + record["radius"]:
                    raise RuntimeError("Overlapping scene zone")
            cfg["zones"] = remaining + [record]
        RUNTIME.mkdir(parents=True, exist_ok=True)
        (RUNTIME / output.name).write_bytes(output.read_bytes())
        CONFIG.write_text(json.dumps(cfg, indent=2) + "\n", "utf-8")
        print("Activated for runtime testing only. Visual QA and license attribution still required.")

if __name__ == "__main__":
    main()
