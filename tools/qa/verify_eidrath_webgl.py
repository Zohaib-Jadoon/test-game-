"""
EIDRATH: The Last Oath — Automated Real-WebGL Browser QA Harness (QA-01..QA-12)
Runs real Chrome/Chromium WebGL against http://127.0.0.1:3000, captures visual verification
screenshots across Title, Oathgrave, Combat, RPG Menus, Dev Manifest, Ravenhold Village,
Mountain Warden Boss Courtyard, and Mobile Touch HUD, and records FPS & console errors.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"d:\MY Projects\Blender test")
OUT_DIR = ROOT / "art" / "qa"
OUT_DIR.mkdir(parents=True, exist_ok=True)
BASE_URL = "http://127.0.0.1:3000"


def launch_browser(p):
    args = [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--autoplay-policy=no-user-gesture-required",
    ]
    chrome_path = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    edge_path = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if chrome_path.exists():
        return p.chromium.launch(executable_path=str(chrome_path), headless=True, args=args), "Chrome"
    if edge_path.exists():
        return p.chromium.launch(executable_path=str(edge_path), headless=True, args=args), "Edge"
    return p.chromium.launch(headless=True, args=args), "Chromium"


def main():
    console_errors = []
    page_errors = []
    failed_requests = []
    metrics = {}

    with sync_playwright() as p:
        browser, browser_name = launch_browser(p)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text)
            if msg.type == "error"
            else None,
        )
        page.on(
            "response",
            lambda res: failed_requests.append(f"{res.status} {res.url}")
            if res.status >= 400 and not res.url.endswith("favicon.ico")
            else None,
        )

        # 1. QA-01: Title screen & full rebrand check
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2200)
        body_text = page.inner_text("body")
        assert "EIDRATH" in body_text.upper(), "Missing EIDRATH title branding"
        assert "THE LAST OATH" in body_text.upper(), "Missing subtitle"
        assert "SKYFORGE" not in body_text.upper(), "Legacy Skyforge branding leaked into UI"
        assert page.locator("canvas").count() == 1, "Expected 1 WebGL canvas"
        page.screenshot(path=str(OUT_DIR / "01_title_screen.png"))
        metrics["title_ok"] = True

        # 2. QA-02 / QA-04: Start New Game -> Oathgrave Tomb
        page.get_by_role("button", name="New Game", exact=True).click()
        page.wait_for_timeout(350)
        page.get_by_role("button", name="Wake in Oathgrave Tomb", exact=True).click()
        page.wait_for_timeout(3200)

        hud_upper = page.inner_text("body").upper()
        assert "OATHGRAVE TOMB" in hud_upper, "Missing Oathgrave Tomb region label"
        assert "THE BROKEN OATH" in hud_upper, "Missing starter quest tracker"
        page.screenshot(path=str(OUT_DIR / "02_oathgrave_gameplay.png"))

        # 3. QA-02 / QA-03: Locomotion, interaction, combat & spellcast
        page.keyboard.down("KeyW")
        page.wait_for_timeout(1200)
        page.keyboard.up("KeyW")
        page.keyboard.press("KeyE")
        page.wait_for_timeout(350)
        page.keyboard.press("Digit1")  # Rime Lance
        page.wait_for_timeout(200)
        page.keyboard.press("Space")  # Dodge roll
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT_DIR / "03_combat_action.png"))

        # Measure live client FPS & frame-time percentiles (avg/p95/worst ms)
        frame_stats = page.evaluate(
            """() => new Promise(resolve => {
                const deltas = [];
                let last = performance.now();
                function step(now) {
                    deltas.push(now - last);
                    last = now;
                    if (deltas.length < 45) requestAnimationFrame(step);
                    else {
                        const sorted = [...deltas].sort((a,b) => a - b);
                        const avg = deltas.reduce((s,v)=>s+v, 0) / deltas.length;
                        const p95 = sorted[Math.floor(sorted.length * 0.95)];
                        resolve({
                            avgMs: Number(avg.toFixed(2)),
                            p95Ms: Number(p95.toFixed(2)),
                            worstMs: Number(sorted[sorted.length - 1].toFixed(2)),
                            fps: Math.round(1000 / Math.max(1, avg))
                        });
                    }
                }
                requestAnimationFrame(step);
            })"""
        )
        metrics["desktop_1280x720_perf"] = frame_stats

        # 4. QA-06: Inventory, Skill Tree unlock, World Map
        page.keyboard.press("KeyI")
        page.wait_for_timeout(450)
        inv_upper = page.inner_text("body").upper()
        assert "KAELEN" in inv_upper and "EQUIPPED" in inv_upper, "Inventory panel did not open"
        page.screenshot(path=str(OUT_DIR / "04_inventory_menu.png"))

        page.get_by_role("button", name="Skills (2)", exact=True).click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Unlock (1 pt)", exact=True).first.click()
        page.wait_for_timeout(300)
        assert "SKILLS (1)" in page.inner_text("body").upper(), "Skill point did not decrement after unlock"

        page.get_by_role("button", name="World Map", exact=True).click()
        page.wait_for_timeout(350)
        assert "FROSTHEIM ATLAS" in page.inner_text("body").upper(), "Frostheim World Map missing"
        page.screenshot(path=str(OUT_DIR / "05_world_map.png"))

        # 5. QA-08 / QA-09: Save slot + Developer-only Blender Manifest Drawer
        page.get_by_role("button", name="Save & Settings", exact=True).click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Save", exact=True).first.click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Open Forge", exact=True).click()
        page.wait_for_timeout(400)
        assert "55 / 55" in page.inner_text("body"), "Dev Blender manifest did not list all 55 assets"
        page.screenshot(path=str(OUT_DIR / "06_dev_blender_forge.png"))
        page.get_by_role("button", name="Close", exact=True).click()
        page.wait_for_timeout(200)

        # 6. QA-09: Reload & verify Continue button persists Chronicle
        page.reload(wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1600)
        assert "CONTINUE" in page.inner_text("body").upper(), "Continue button missing after reload"
        metrics["save_reload_ok"] = True

        # 7. QA-04 / QA-05 / QA-07: Seed verified v1 saves to visually capture Ravenhold Village & Mountain Warden Boss Courtyard
        page.evaluate(
            """() => {
                const raw = localStorage.getItem('eidrath_save_v1_slot_1') || localStorage.getItem('eidrath_save_v1_autosave');
                const base = JSON.parse(raw);

                const village = JSON.parse(JSON.stringify(base));
                village.slotId = 'slot_2';
                village.regionName = 'Frostheim — Ravenhold';
                village.player.x = -12;
                village.player.z = 44;
                village.player.yaw = 3.1;
                village.companion.activeId = 'lyra';
                village.world.discoveredLandmarks = ['lm_oathgrave_tomb','lm_ruined_bridge','lm_ravenhold'];
                localStorage.setItem('eidrath_save_v1_slot_2', JSON.stringify(village));

                const boss = JSON.parse(JSON.stringify(base));
                boss.slotId = 'slot_3';
                boss.regionName = "Frostheim — Warden's Keep";
                boss.player.x = 6;
                boss.player.z = -132;
                boss.player.yaw = Math.PI;
                boss.player.inventory.push({ itemId: 'wpn_oathbreaker', quantity: 1, upgradeLevel: 1 });
                boss.player.equipment.mainHand = 'wpn_oathbreaker';
                boss.companion.activeId = 'lyra';
                boss.world.discoveredLandmarks = ['lm_oathgrave_tomb','lm_ravenhold','lm_wardens_keep'];
                boss.world.solvedPuzzles = ['puzzle_keep_gate'];
                localStorage.setItem('eidrath_save_v1_slot_3', JSON.stringify(boss));
            }"""
        )
        page.reload(wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)

        # Capture Ravenhold Village (Slot 2)
        page.get_by_role("button", name="Load Game").click()
        page.wait_for_timeout(300)
        page.locator("button", has_text="slot 2").click()
        page.wait_for_timeout(2800)
        rv_upper = page.inner_text("body").upper()
        assert "RAVENHOLD" in rv_upper, "Ravenhold village did not load"
        assert "COMPANION: LYRA" in rv_upper, "Lyra companion HUD did not appear"
        page.screenshot(path=str(OUT_DIR / "07_ravenhold_village.png"))
        metrics["ravenhold_village_ok"] = True

        # Capture Mountain Warden Boss Courtyard (Slot 3)
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        page.get_by_role("button", name="Save & Settings", exact=True).click()
        page.wait_for_timeout(250)
        page.get_by_role("button", name="Load", exact=True).last.click()
        page.wait_for_timeout(2800)
        boss_upper = page.inner_text("body").upper()
        assert "THE MOUNTAIN WARDEN" in boss_upper, "Mountain Warden boss HUD did not activate"
        page.screenshot(path=str(OUT_DIR / "08_mountain_warden_boss.png"))
        metrics["boss_courtyard_ok"] = True

        # 8. QA-10: Mobile viewport & Touch UI verification (390x844)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(500)
        touch_btn = page.get_by_role("button", name="Touch", exact=True)
        if touch_btn.count() > 0:
            touch_btn.click()
            page.wait_for_timeout(400)
        mobile_upper = page.inner_text("body").upper()
        assert "ATK" in mobile_upper and "PARRY" in mobile_upper and "DODGE" in mobile_upper
        page.screenshot(path=str(OUT_DIR / "09_mobile_touch_hud.png"))
        metrics["mobile_touch_ok"] = True

        browser.close()

    result = {
        "browser": browser_name,
        "metrics": metrics,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "failed_requests": failed_requests,
        "screenshots": sorted([str(p) for p in OUT_DIR.glob("*.png")]),
    }
    print("PLAYWRIGHT_QA_JSON=" + json.dumps(result, indent=2))
    if console_errors or page_errors or failed_requests:
        sys.exit(2)


if __name__ == "__main__":
    main()
