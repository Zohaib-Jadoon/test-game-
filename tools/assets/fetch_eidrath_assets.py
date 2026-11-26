"""
EIDRATH: The Last Oath — CC0 / MIT Real Asset Acquisition Pipeline
Downloads verified free HDRIs, PBR texture sets, photorealistic 3D models,
MPFB2 human generator extension, and MIT mocap reference GLBs into _asset_cache/
and runtime texture/HDRI directories under public/assets/eidrath/.
Never bypasses logins, paywalls, or non-commercial licenses.
"""
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "_asset_cache"
PUBLIC_TEX = ROOT / "public" / "assets" / "eidrath" / "textures"
PUBLIC_HDRI = ROOT / "public" / "assets" / "eidrath" / "hdri"
BLENDER_EXE = os.environ.get("EIDRATH_BLENDER_EXE") or shutil.which("blender") or r"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"

for d in (CACHE, CACHE / "mpfb2", CACHE / "polyhaven_models", CACHE / "ambientcg", CACHE / "mocap_refs", PUBLIC_TEX, PUBLIC_HDRI):
    d.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "EidrathOverhaulPipeline/1.0 (https://github.com/Zohaib-Jadoon/test-game-)"}
SESSION = requests.Session()
SESSION.headers.update(UA)

LEDGER = []


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def download_file(url: str, dest: Path, label: str, creator: str, license_name: str, commercial=True, redistribution="Permitted") -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 256:
        LEDGER.append({
            "id": label,
            "url": url,
            "localPath": str(dest.relative_to(ROOT)).replace("\\", "/"),
            "creator": creator,
            "license": license_name,
            "commercialUse": commercial,
            "redistribution": redistribution,
            "bytes": dest.stat().st_size,
            "cached": True,
        })
        return True
    try:
        r = SESSION.get(url, timeout=(15, 60), stream=True)
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
        tmp.replace(dest)
        LEDGER.append({
            "id": label,
            "url": url,
            "localPath": str(dest.relative_to(ROOT)).replace("\\", "/"),
            "creator": creator,
            "license": license_name,
            "commercialUse": commercial,
            "redistribution": redistribution,
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
            "cached": False,
        })
        print(f"[OK] {label} -> {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")
        return True
    except Exception as exc:
        print(f"[FAIL] {label} ({url}): {exc}")
        return False


def fetch_mpfb2():
    print("\n=== 1. MPFB2 (MakeHuman Plugin for Blender) ===")
    ext_url = "https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip"
    zip_path = CACHE / "mpfb2" / "add-on-mpfb-v2.0.18.zip"
    ok = download_file(
        ext_url,
        zip_path,
        "mpfb2_v2_0_18",
        "MakeHuman Community (Joel Palmius & contributors)",
        "CC0 / AGPL-3.0 (generated base mesh output is CC0 1.0)",
        True,
        "Blender extension cached locally; generated character meshes are original CC0/game assets",
    )
    if ok and Path(BLENDER_EXE).exists():
        # Install into Blender 5.3 user extensions directory
        try:
            proc = subprocess.run(
                [BLENDER_EXE, "--command", "extension", "install-file", str(zip_path), "-r", "user_default", "-e"],
                capture_output=True,
                text=True,
                timeout=90,
            )
            print("MPFB2 install-file rc=", proc.returncode, proc.stdout.strip(), proc.stderr.strip())
        except Exception as e:
            print("MPFB2 CLI install warning:", e)


def fetch_polyhaven_hdris():
    print("\n=== 2. PolyHaven HDRIs (CC0) ===")
    hdris = ["snowy_forest", "winter_evening", "snowy_hillside", "forest_cave"]
    for hid in hdris:
        try:
            info = SESSION.get(f"https://api.polyhaven.com/files/{hid}", timeout=15).json()
            entry = info.get("hdri", {}).get("1k", {}).get("hdr") or info.get("hdri", {}).get("2k", {}).get("hdr")
            if not entry or "url" not in entry:
                print(f"[SKIP] HDRI {hid}: no 1k/2k hdr URL")
                continue
            download_file(
                entry["url"],
                PUBLIC_HDRI / f"{hid}.hdr",
                f"hdri_{hid}",
                "Poly Haven (Greg Zaal & contributors)",
                "CC0 1.0",
                True,
                "CC0 1.0 — Public Domain",
            )
        except Exception as e:
            print(f"[ERR] HDRI {hid}: {e}")


def fetch_polyhaven_textures():
    print("\n=== 3. PolyHaven PBR Texture Sets (CC0, 1K JPG) ===")
    tex_ids = [
        "snow_01",
        "snow_field_aerial",
        "cliff_side",
        "brown_mud_rocks_01",
        "cobblestone_01",
        "medieval_blocks_02",
        "castle_wall_slates",
        "old_stone_wall",
        "roof_slates_02",
        "weathered_peeling_timber",
        "dark_wooden_planks",
        "medieval_wood",
        "metal_plate",
        "rusty_metal",
        "brown_leather",
        "poly_wool_herringbone",
    ]
    for tid in tex_ids:
        try:
            info = SESSION.get(f"https://api.polyhaven.com/files/{tid}", timeout=15).json()
            out_dir = PUBLIC_TEX / tid
            out_dir.mkdir(parents=True, exist_ok=True)
            for map_key, out_name in [("Diffuse", "diff.jpg"), ("nor_gl", "nor_gl.jpg"), ("Rough", "rough.jpg"), ("AO", "ao.jpg")]:
                # PolyHaven uses lowercase/mixed keys like Diffuse, nor_gl, Rough, AO
                res_dict = info.get(map_key) or info.get(map_key.lower()) or {}
                one_k = res_dict.get("1k", {})
                jpg = one_k.get("jpg") or one_k.get("png")
                if jpg and "url" in jpg:
                    ext = ".png" if "png" in one_k and "jpg" not in one_k else ".jpg"
                    download_file(
                        jpg["url"],
                        out_dir / out_name.replace(".jpg", ext),
                        f"tex_{tid}_{map_key.lower()}",
                        "Poly Haven",
                        "CC0 1.0",
                        True,
                        "CC0 1.0 — Public Domain",
                    )
        except Exception as e:
            print(f"[ERR] Texture {tid}: {e}")


def fetch_ambientcg_textures():
    print("\n=== 4. ambientCG PBR Texture Sets (CC0, 1K-JPG) ===")
    for aid, folder in [("Ice003", "ice_003"), ("Snow008A", "snow_008a")]:
        try:
            data = SESSION.get(f"https://ambientcg.com/api/v2/full_json?id={aid}&include=downloadData", timeout=15).json()
            assets = data.get("foundAssets", [])
            if not assets:
                print(f"[SKIP] ambientCG {aid}: not found")
                continue
            dl_list = assets[0].get("downloadFolders", {}).get("default", {}).get("downloadFiletypeCategories", {}).get("zip", {}).get("downloads", [])
            target = next((x for x in dl_list if x.get("attribute") == "1K-JPG"), None) or (dl_list[0] if dl_list else None)
            if not target:
                continue
            zip_dest = CACHE / "ambientcg" / f"{aid}_1K-JPG.zip"
            if download_file(target["downloadLink"], zip_dest, f"acg_{aid}", "ambientCG (Lennart Demes)", "CC0 1.0", True, "CC0 1.0 — Public Domain"):
                out_dir = PUBLIC_TEX / folder
                out_dir.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(zip_dest, "r") as zf:
                    for member in zf.namelist():
                        low = member.lower()
                        if low.endswith(".jpg") and any(k in low for k in ["_color.", "_normalgl.", "_roughness.", "_ambientocclusion."]):
                            fname = "diff.jpg" if "_color." in low else "nor_gl.jpg" if "_normalgl." in low else "rough.jpg" if "_roughness." in low else "ao.jpg"
                            with zf.open(member) as src, (out_dir / fname).open("wb") as dst:
                                dst.write(src.read())
        except Exception as e:
            print(f"[ERR] ambientCG {aid}: {e}")


def fetch_polyhaven_models():
    print("\n=== 5. PolyHaven 3D Models (CC0, 1K GLTF + textures) ===")
    # Skip 465MB-914MB raw film scans (pine_tree_01, fir_tree_01); use fir_sapling (24MB) + pine_tree_01 cached 1K twig/bark maps
    models = [
        "fir_sapling",
        "dead_tree_trunk",
        "tree_stump_01",
        "fern_02",
        "boulder_01",
        "coastal_cliff_01",
        "rock_face_01",
        "rock_moss_set_01",
        "modular_fort_01",
        "modular_wooden_pier",
        "stone_fire_pit",
        "Lantern_01",
        "Barrel_01",
        "Barrel_02",
        "brass_candleholders",
        "WoodenTable_01",
        "gothic_statue",
        "antique_estoc",
        "hatchet",
    ]
    for mid in models:
        try:
            info = SESSION.get(f"https://api.polyhaven.com/files/{mid}", timeout=15).json()
            gltf_entry = info.get("gltf", {}).get("1k", {}).get("gltf")
            if not gltf_entry or "url" not in gltf_entry:
                print(f"[SKIP] Model {mid}: no 1k gltf")
                continue
            mdir = CACHE / "polyhaven_models" / mid
            mdir.mkdir(parents=True, exist_ok=True)
            gltf_name = Path(urlparse(gltf_entry["url"]).path).name
            download_file(
                gltf_entry["url"],
                mdir / gltf_name,
                f"model_{mid}",
                "Poly Haven",
                "CC0 1.0",
                True,
                "CC0 1.0 — Public Domain",
            )
            includes = gltf_entry.get("include", {})
            for rel_path, inc_info in includes.items():
                if "url" in inc_info:
                    download_file(
                        inc_info["url"],
                        mdir / rel_path,
                        f"model_{mid}_{Path(rel_path).name}",
                        "Poly Haven",
                        "CC0 1.0",
                        True,
                        "CC0 1.0 — Public Domain",
                    )
        except Exception as e:
            print(f"[ERR] Model {mid}: {e}")


def fetch_mocap_references():
    print("\n=== 6. Three.js MIT Mocap Reference GLBs ===")
    base = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf"
    for fname in ["Soldier.glb", "Xbot.glb", "Michelle.glb"]:
        download_file(
            f"{base}/{fname}",
            CACHE / "mocap_refs" / fname,
            f"mocap_ref_{fname}",
            "Three.js Examples / Mixamo Open Sample",
            "MIT (Three.js examples repository)",
            True,
            "Cached locally for animation curve reference/retargeting",
        )


def main():
    fetch_mpfb2()
    fetch_polyhaven_hdris()
    fetch_polyhaven_textures()
    fetch_ambientcg_textures()
    fetch_polyhaven_models()
    fetch_mocap_references()

    ledger_path = CACHE / "asset_download_ledger.json"
    ledger_path.write_text(json.dumps(LEDGER, indent=2), encoding="utf-8")
    print(f"\nCompleted Phase 2A/2B asset acquisition: {len(LEDGER)} files logged to {ledger_path}")


if __name__ == "__main__":
    main()

