"""
EIDRATH: The Last Oath — CC0 / CC-BY Real Recorded Audio & Music Acquisition
Downloads verified free sound packs (OpenGameArt CC0/CC-BY, Scott Buckley CC BY 4.0)
into _asset_cache/audio_raw/ and normalizes/transcodes them with FFmpeg into
public/assets/eidrath/audio/{footsteps,combat,env,music,ui}/.
"""
import json
import os
import re
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

import requests

ROOT = Path(r"d:\MY Projects\Blender test")
CACHE_AUDIO = ROOT / "_asset_cache" / "audio_raw"
OUT_AUDIO = ROOT / "public" / "assets" / "eidrath" / "audio"

for sub in ("footsteps", "combat", "env", "music", "ui"):
    (OUT_AUDIO / sub).mkdir(parents=True, exist_ok=True)
CACHE_AUDIO.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "EidrathAudioPipeline/1.0"}
SESSION = requests.Session()
SESSION.headers.update(UA)
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"

AUDIO_CREDITS = []


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 512:
        return True
    try:
        r = SESSION.get(url, timeout=(12, 45), stream=True)
        r.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(65536):
                if chunk:
                    f.write(chunk)
        tmp.replace(dest)
        print(f"[OK] {dest.name} ({dest.stat().st_size // 1024} KB)")
        return True
    except Exception as e:
        print(f"[FAIL] {url}: {e}")
        return False


def transcode_sfx(src: Path, dest: Path, max_sec: float = 4.0, fade_out: float = 0.08):
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG, "-y", "-i", str(src),
        "-t", str(max_sec),
        "-af", f"silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={max(0.1, max_sec - fade_out)}:d={fade_out}",
        "-ac", "1", "-ar", "44100", "-b:a", "96k",
        str(dest),
    ]
    # Simpler reliable filter when short clip duration < max_sec
    cmd_safe = [
        FFMPEG, "-y", "-i", str(src),
        "-t", str(max_sec),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ac", "1", "-ar", "44100", "-b:a", "96k",
        str(dest),
    ]
    r = subprocess.run(cmd_safe, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FFMPEG ERR] {src.name}: {r.stderr[:200]}")


def transcode_music(src: Path, dest: Path, max_sec: float = 120.0):
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG, "-y", "-i", str(src),
        "-t", str(max_sec),
        "-af", "loudnorm=I=-18:TP=-1.5:LRA=11",
        "-ac", "2", "-ar", "44100", "-b:a", "128k",
        str(dest),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FFMPEG MUSIC ERR] {src.name}: {r.stderr[:200]}")


def search_oga_packs():
    """Search OpenGameArt for CC0 / CC-BY sound effects & packs."""
    queries = {
        "rpg_pack": ("https://opengameart.org/content/rpg-sound-pack", "CC0 1.0", "artisticdude (OpenGameArt)"),
        "footsteps_surfaces": ("https://opengameart.org/content/footsteps-on-different-surfaces", "CC BY 3.0", "Jute / OpenGameArt contributors"),
        "wind_loop": ("https://opengameart.org/content/wind-loop", "CC0 1.0", "OpenGameArt contributor"),
        "fire_loop": ("https://opengameart.org/content/campfire-fire-loop", "CC0 1.0", "OpenGameArt contributor"),
        "sword_swing": ("https://opengameart.org/content/swishes-sound-pack", "CC0 1.0", "artisticdude (OpenGameArt)"),
        "magic_sfx": ("https://opengameart.org/content/spell-sounds-starter-pack", "CC0 1.0", "OpenGameArt contributor"),
    }
    extracted_dirs = {}
    for key, (page_url, lic, author) in queries.items():
        try:
            r = SESSION.get(page_url, timeout=15)
            if not r.ok:
                continue
            files = re.findall(r'https://opengameart\.org/sites/default/files/[^\s"\'<>]+?\.(?:zip|ogg|wav|mp3)', r.text)
            files = [f for f in files if "preview" not in f and "styles" not in f and "montage" not in f.lower()]
            if not files:
                continue
            # Prefer .zip archive over single preview mp3
            zips = [f for f in files if f.lower().endswith(".zip")]
            url = zips[0] if zips else files[0]
            fname = url.split("/")[-1].replace("%20", "_")
            dest = CACHE_AUDIO / f"{key}_{fname}"
            if download(url, dest):
                AUDIO_CREDITS.append({"id": key, "source": page_url, "downloadUrl": url, "creator": author, "license": lic})
                if dest.suffix.lower() == ".zip":
                    ex_dir = CACHE_AUDIO / key
                    ex_dir.mkdir(exist_ok=True)
                    with zipfile.ZipFile(dest, "r") as zf:
                        zf.extractall(ex_dir)
                    extracted_dirs[key] = ex_dir
                else:
                    ex_dir = CACHE_AUDIO / key
                    ex_dir.mkdir(exist_ok=True)
                    shutil.copy2(dest, ex_dir / dest.name)
                    extracted_dirs[key] = ex_dir
        except Exception as e:
            print(f"[OGA WARN] {key}: {e}")

    # Fallback search for wind / fire / river / wolf / ice if direct URLs above didn't exist
    extra_searches = [
        ("wind", "wind+ambient"),
        ("fire", "fire+crackling"),
        ("water", "river+water+loop"),
        ("wolf", "wolf+growl+howl"),
        ("thunder_ice", "ice+crack+magic"),
    ]
    for tag, q in extra_searches:
        try:
            sr = SESSION.get(f"https://opengameart.org/art-search-advanced?keys={q}&field_art_type_tid%5B%5D=13&sort_by=count&sort_order=DESC", timeout=15)
            nodes = re.findall(r'href="(/content/[^"]+)"', sr.text)
            for node in nodes[:3]:
                pr = SESSION.get(f"https://opengameart.org{node}", timeout=12)
                if "CC0" not in pr.text and "CC-BY" not in pr.text:
                    continue
                files = [f for f in re.findall(r'https://opengameart\.org/sites/default/files/[^\s"\'<>]+?\.(?:zip|ogg|wav|mp3)', pr.text) if "preview" not in f]
                if not files:
                    continue
                url = files[0]
                fname = url.split("/")[-1].replace("%20", "_")
                dest = CACHE_AUDIO / f"{tag}_{fname}"
                if download(url, dest):
                    lic = "CC0 1.0" if "CC0" in pr.text else "CC BY 3.0/4.0"
                    AUDIO_CREDITS.append({"id": tag, "source": f"https://opengameart.org{node}", "downloadUrl": url, "creator": "OpenGameArt contributor", "license": lic})
                    ex_dir = CACHE_AUDIO / tag
                    ex_dir.mkdir(exist_ok=True)
                    if dest.suffix.lower() == ".zip":
                        with zipfile.ZipFile(dest, "r") as zf:
                            zf.extractall(ex_dir)
                    else:
                        shutil.copy2(dest, ex_dir / dest.name)
                    extracted_dirs[tag] = ex_dir
                    break
        except Exception as e:
            print(f"[OGA SEARCH WARN] {tag}: {e}")
    return extracted_dirs


def fetch_scott_buckley_music():
    print("\n=== Fetching Scott Buckley Orchestral Music (CC BY 4.0) ===")
    r = SESSION.get("https://www.scottbuckley.com.au/library/", timeout=20)
    mp3s = re.findall(r'https://www\.scottbuckley\.com\.au/library/wp-content/uploads/[^\s"\'<>]+?\.mp3', r.text)
    # Pick thematic orchestral tracks for Menu, Exploration, Village, Combat, Boss, Victory/Emotion
    wanted = {
        "menu": ["Katabasis_I.mp3", "Convergence.mp3"],
        "explore": ["Anabasis_I.mp3", "InThisMoment.mp3"],
        "village": ["HomeWasYou.mp3", "WithTheseHands.mp3"],
        "combat": ["Katabasis_II.mp3", "Aphelion.mp3"],
        "boss": ["Anabasis_II.mp3", "Phoenix2026.mp3"],
        "tomb": ["Unraveling.mp3", "Katabasis_I.mp3"],
    }
    used = {}
    for role, prefs in wanted.items():
        chosen_url = None
        for pref in prefs:
            chosen_url = next((u for u in mp3s if pref.lower() in u.lower()), None)
            if chosen_url:
                break
        if not chosen_url and mp3s:
            chosen_url = mp3s[len(used) % len(mp3s)]
        ok = False
        if chosen_url:
            out_path = OUT_AUDIO / "music" / f"music_{role}.mp3"
            if out_path.exists() and out_path.stat().st_size > 50_000:
                used[role] = chosen_url
                AUDIO_CREDITS.append({
                    "id": f"music_{role}",
                    "source": "https://www.scottbuckley.com.au/library/",
                    "downloadUrl": chosen_url,
                    "creator": "Scott Buckley",
                    "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
                    "attribution": f"Music: '{chosen_url.split('/')[-1].replace('.mp3', '')}' by Scott Buckley (www.scottbuckley.com.au)",
                })
                continue
            raw_path = CACHE_AUDIO / f"sb_{role}_{chosen_url.split('/')[-1]}"
            ok = download(chosen_url, raw_path)
            if ok:
                out_path = OUT_AUDIO / "music" / f"music_{role}.mp3"
                transcode_music(raw_path, out_path, max_sec=90.0)
                used[role] = chosen_url
                AUDIO_CREDITS.append({
                    "id": f"music_{role}",
                    "source": "https://www.scottbuckley.com.au/library/",
                    "downloadUrl": chosen_url,
                    "creator": "Scott Buckley",
                    "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
                    "attribution": f"Music: '{chosen_url.split('/')[-1].replace('.mp3', '')}' by Scott Buckley (www.scottbuckley.com.au)",
                })
        # Fallback if a specific track timed out
        if not ok:
            for alt_url in mp3s:
                if alt_url in used.values():
                    continue
                alt_path = CACHE_AUDIO / f"sb_{role}_{alt_url.split('/')[-1]}"
                if download(alt_url, alt_path):
                    out_path = OUT_AUDIO / "music" / f"music_{role}.mp3"
                    transcode_music(alt_path, out_path, max_sec=90.0)
                    used[role] = alt_url
                    AUDIO_CREDITS.append({
                        "id": f"music_{role}",
                        "source": "https://www.scottbuckley.com.au/library/",
                        "downloadUrl": alt_url,
                        "creator": "Scott Buckley",
                        "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
                        "attribution": f"Music: '{alt_url.split('/')[-1].replace('.mp3', '')}' by Scott Buckley (www.scottbuckley.com.au)",
                    })
                    break


def organize_sfx(extracted_dirs):
    print("\n=== Transcoding & Organizing Recorded SFX ===")
    all_files = []
    for k, d in extracted_dirs.items():
        for p in sorted(d.rglob("*")):
            if p.is_file() and not p.name.startswith("._") and "__MACOSX" not in str(p) and p.suffix.lower() in (".wav", ".ogg", ".mp3", ".flac"):
                all_files.append((k, p))

    def pick(keywords, fallback_keys=(), limit=3):
        hits = []
        for k, p in all_files:
            low = (k + " " + str(p.relative_to(CACHE_AUDIO))).lower()
            if any(w in low for w in keywords):
                hits.append(p)
        if not hits and fallback_keys:
            for k, p in all_files:
                if k in fallback_keys:
                    hits.append(p)
        return hits[:limit]

    mappings = {
        "footsteps/snow": pick(["\\grass\\", "/grass/", "snow", "crunch"], ("footsteps_surfaces",), 3),
        "footsteps/stone": pick(["\\tile\\", "/tile/", "\\gravel\\", "/gravel/", "stone"], ("footsteps_surfaces",), 3),
        "footsteps/wood": pick(["\\wood\\", "/wood/", "\\boots\\", "/boots/"], ("footsteps_surfaces",), 3),
        "footsteps/water": pick(["\\water\\", "/water/", "splash"], ("footsteps_surfaces", "water"), 3),
        "combat/swing": pick(["swing", "swish", "whoosh", "slash"], ("sword_swing", "rpg_pack"), 3),
        "combat/unsheathe": pick(["unsheathe", "sword", "draw"], ("rpg_pack",), 2),
        "combat/impact": pick(["hit", "impact", "clash", "clang", "armor", "metal", "explode"], ("rpg_pack", "magic_sfx"), 3),
        "combat/parry": pick(["ring", "clang", "parry", "metal", "chime", "magicshield"], ("rpg_pack", "magic_sfx"), 2),
        "combat/block": pick(["shield", "thud", "block", "wood"], ("rpg_pack",), 2),
        "combat/spell": pick(["freeze", "flamethrower", "spell", "enchant", "heal"], ("magic_sfx",), 3),
        "combat/roar": pick(["growl", "roar", "wolf", "beast", "monster", "ogre", "curse"], ("wolf", "rpg_pack", "magic_sfx"), 3),
        "env/wind": pick(["wind", "storm", "blizzard"], ("wind", "wind_loop"), 1),
        "env/fire": pick(["fire", "camp", "crackle", "flame"], ("fire", "fire_loop"), 1),
        "env/water": pick(["vistula", "river", "stream", "water"], ("water",), 1),
        "ui/click": pick(["click", "button", "coin", "cloth", "leather", "bag", "interface", "bottle"], ("rpg_pack",), 3),
    }

    manifest = {}
    for target_prefix, sources in mappings.items():
        out_urls = []
        for idx, src in enumerate(sources):
            is_env = target_prefix.startswith("env/")
            out_rel = f"{target_prefix}_{idx + 1}.mp3"
            out_file = OUT_AUDIO / out_rel
            if is_env:
                transcode_music(src, out_file, max_sec=25.0)
            else:
                transcode_sfx(src, out_file, max_sec=3.0)
            if out_file.exists():
                out_urls.append(f"/assets/eidrath/audio/{out_rel}")
        manifest[target_prefix] = out_urls
        print(f"  {target_prefix}: {len(out_urls)} clips")

    for p in (OUT_AUDIO / "music").glob("*.mp3"):
        manifest[f"music/{p.stem.replace('music_', '')}"] = [f"/assets/eidrath/audio/music/{p.name}"]

    (OUT_AUDIO / "audio_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (CACHE_AUDIO / "audio_credits.json").write_text(json.dumps(AUDIO_CREDITS, indent=2), encoding="utf-8")
    print(f"\nAudio manifest saved: {OUT_AUDIO / 'audio_manifest.json'}")


def main():
    extracted = search_oga_packs()
    fetch_scott_buckley_music()
    organize_sfx(extracted)


if __name__ == "__main__":
    main()

