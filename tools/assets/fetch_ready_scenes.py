"""Free, authored scene acquisition. Standard library only; never bypass login.
Run from any directory: python tools/assets/fetch_ready_scenes.py --id pine-forest
The archive and original .blend files stay in ignored _asset_cache.
"""
import argparse
import hashlib
import json
import shutil
import stat
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
CATALOG = {x["id"]: x for x in json.loads((Path(__file__).with_name("ready_scene_sources.json")).read_text("utf-8"))["sources"]}
CACHE = ROOT / "_asset_cache" / "ready-scenes"
MAX_BYTES = 8 * 1024**3

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def extract_safe(archive, destination):
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if sum(i.file_size for i in entries) > MAX_BYTES:
            raise ValueError("Archive exceeds unpacked size limit")
        for entry in entries:
            name = PurePosixPath(entry.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts or ":" in str(name) or stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"Unsafe archive entry: {entry.filename}")
        for entry in entries:
            name = PurePosixPath(entry.filename.replace("\\", "/"))
            target = destination.joinpath(*name.parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(entry) as source, target.open("wb") as out:
                    shutil.copyfileobj(source, out)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", choices=CATALOG, required=True)
    parser.add_argument("--local", type=Path, help="Manually acquired original ZIP or .blend; required for login-gated sources")
    args = parser.parse_args()
    meta = CATALOG[args.id]
    if not args.local and not meta["download"]:
        parser.error("Acquire the source normally from " + meta["source"] + " and supply --local; no login bypass")
    destination = CACHE / args.id
    destination.mkdir(parents=True, exist_ok=True)
    if args.local:
        archive = args.local.resolve()
        if not archive.is_file() or archive.suffix.lower() not in (".zip", ".blend"):
            parser.error("--local must be a ZIP or .blend file")
    else:
        archive = destination / "original.zip"
        if not archive.exists():
            tmp = archive.with_suffix(".part")
            req = urllib.request.Request(meta["download"], headers={"User-Agent": "Eidrath scene acquisition/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=60) as response, tmp.open("wb") as out:
                    count = 0
                    while block := response.read(1024 * 1024):
                        count += len(block)
                        if count > MAX_BYTES:
                            raise ValueError("Download size limit exceeded")
                        out.write(block)
                if not zipfile.is_zipfile(tmp):
                    raise ValueError("Download is not a ZIP")
                tmp.replace(archive)
            finally:
                tmp.unlink(missing_ok=True)
    checksum = sha(archive)
    extracted = destination / ("source-" + checksum[:12])
    if not extracted.exists():
        with TemporaryDirectory(dir=destination) as scratch:
            stage = Path(scratch) / "source"
            stage.mkdir()
            if archive.suffix.lower() == ".blend":
                shutil.copy2(archive, stage / archive.name)
            else:
                extract_safe(archive, stage)
            if not any(stage.rglob("*.blend")):
                raise ValueError("No Blender scene in archive")
            stage.rename(extracted)
    scenes = sorted(str(p.relative_to(ROOT)) for p in extracted.rglob("*.blend"))
    receipt = {**meta, "archiveSha256": checksum, "scenes": scenes, "status": "downloaded-not-reviewed"}
    (destination / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", "utf-8")
    print(json.dumps(receipt, indent=2))

if __name__ == "__main__":
    main()
