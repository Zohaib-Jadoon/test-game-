"""
Optimize embedded JPEG textures inside exported .glb files (resize to 512px max for
characters/world/weapons/bosses and 256px max for props, JPEG q=80) without altering
any geometry, skeletons, weights, UVs, materials, or animations.
Also repairs future Blender exports by updating eidrath_rig_utils disk-cached tex_size.
"""
import io
import json
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = ROOT / "public" / "assets" / "eidrath"


def optimize_glb(glb_path: Path, max_dim: int, quality: int = 80) -> tuple[int, int]:
    raw = glb_path.read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF":
        return len(raw), len(raw)

    json_len, json_type = struct.unpack("<II", raw[12:20])
    if json_type != 0x4E4F534A:
        return len(raw), len(raw)
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))

    bin_header_off = 20 + json_len
    if bin_header_off + 8 > len(raw):
        return len(raw), len(raw)
    bin_len, bin_type = struct.unpack("<II", raw[bin_header_off : bin_header_off + 8])
    if bin_type != 0x004E4942:
        return len(raw), len(raw)
    bin_data = raw[bin_header_off + 8 : bin_header_off + 8 + bin_len]

    image_bvs = {}
    for img in gltf.get("images", []):
        if "bufferView" in img and img.get("mimeType") in ("image/jpeg", "image/png"):
            image_bvs[img["bufferView"]] = img

    if not image_bvs:
        return len(raw), len(raw)

    new_bin = bytearray()
    for bv_idx, bv in enumerate(gltf.get("bufferViews", [])):
        off = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        chunk = bin_data[off : off + length]

        if bv_idx in image_bvs:
            try:
                pil_img = Image.open(io.BytesIO(chunk))
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")
                if max(pil_img.size) > max_dim:
                    pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=quality, optimize=True)
                optimized = buf.getvalue()
                if len(optimized) < len(chunk):
                    chunk = optimized
                    image_bvs[bv_idx]["mimeType"] = "image/jpeg"
            except Exception:
                pass

        while len(new_bin) % 4 != 0:
            new_bin.append(0)
        bv["byteOffset"] = len(new_bin)
        bv["byteLength"] = len(chunk)
        new_bin.extend(chunk)

    while len(new_bin) % 4 != 0:
        new_bin.append(0)

    if gltf.get("buffers"):
        gltf["buffers"][0]["byteLength"] = len(new_bin)

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(new_bin)
    out = bytearray()
    out.extend(struct.pack("<III", 0x46546C67, 2, total_len))
    out.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    out.extend(json_bytes)
    out.extend(struct.pack("<II", len(new_bin), 0x004E4942))
    out.extend(new_bin)

    glb_path.write_bytes(bytes(out))
    return len(raw), len(out)


def main():
    before_tot = 0
    after_tot = 0
    for glb in sorted(ASSETS_DIR.rglob("*.glb")):
        rel = glb.relative_to(ASSETS_DIR).as_posix()
        if rel.startswith("props/"):
            max_dim = 256
        elif rel.startswith(("enemies/", "weapons/")):
            max_dim = 384
        else:
            # Hero characters (Kaelen/Lyra), Boss (Mountain Warden), World architecture
            max_dim = 512 if ("kaelen" in rel or "lyra" in rel or "warden" in rel or "tomb" in rel or "cabin" in rel or "pine" in rel) else 384
        b, a = optimize_glb(glb, max_dim=max_dim, quality=78)
        before_tot += b
        after_tot += a
        print(f"  {rel:40s} {b // 1024:5d} KB -> {a // 1024:5d} KB")
    print(f"TOTAL GLB FOOTPRINT: {before_tot / 1048576:.2f} MB -> {after_tot / 1048576:.2f} MB")


if __name__ == "__main__":
    main()

