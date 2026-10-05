"""Verify every redesigned game screen and preservation of an earlier save."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".tools" / "python"))
from playwright.sync_api import sync_playwright

OUT = ROOT / "artifacts" / "redesign"
PAGES = ["explore", "gather", "craft", "town", "equipment", "inventory", "codex", "records", "settings"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors, resource_errors = [], [], []

    def check(name, condition, detail=None):
        record = {"name": name, "passed": bool(condition)}
        if detail is not None:
            record["detail"] = detail
        checks.append(record)
        if not condition:
            raise AssertionError(f"{name}: {detail}")
        print(f"PASS: {name}", flush=True)

    def navigate(page, name):
        if page.viewport_size["width"] <= 760 and not page.locator(".game-shell.menu-open").count():
            page.locator('[data-action="toggle-menu"]').click()
        page.locator(f'.nav-button[data-page="{name}"]').click()
        page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
        page.wait_for_timeout(100)

    with sync_playwright() as playwright:
        edge = Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe"
        browser = playwright.chromium.launch(executable_path=str(edge) if edge.exists() else None, headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: resource_errors.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
        page.on("requestfailed", lambda request: resource_errors.append({"url": request.url, "failure": request.failure}))
        report = {"passed": False}
        try:
            page.goto(base + "/?dev=1")
            page.wait_for_function("Boolean(window.__northward)")
            manifest = page.evaluate("fetch('/assets/manifest.json').then(r => r.json())")
            region_ids = page.evaluate("window.__northward.getData().regions.map(r => r.id)")
            assets = {asset["id"]: asset for asset in manifest["assets"]}
            portraits = ["hero", "bear", "wolf", "boar", "stag", "guardian"]
            check("초상 6종 모두 새 v2 파일로 교체", all("/v2/" in assets[key]["path"] for key in portraits))
            backgrounds = [assets[f"region-{key}"]["path"] for key in region_ids]
            check("여섯 지역에 서로 다른 새 배경 적용", len(set(backgrounds)) == 6 and all("/v2/" in path for path in backgrounds))
            paths = list(dict.fromkeys(asset["path"] for asset in assets.values()))
            loaded = page.evaluate("""async paths => Promise.all(paths.map(async path => {
              const image = new Image(); image.src = '/' + path;
              await image.decode().catch(error => { throw new Error(`${path}: ${error}`); });
              return {path, width: image.naturalWidth, height: image.naturalHeight};
            }))""", paths)
            check("전체 신규 래스터 아트 실제 브라우저 해석", len(loaded) == manifest["uniqueAssetCount"] and all(image["width"] > 0 for image in loaded), loaded)

            # The first edition's exported v2 save predates the visual replacement.
            older_save = ROOT / "tests" / "fixtures" / "pre-redesign-v2-save.json"
            raw = older_save.read_text(encoding="utf-8")
            expected = json.loads(raw)["state"]
            actual = page.evaluate("""async raw => {
              const {decodeSave} = await import('/src/storage/save.js');
              const loaded = decodeSave(raw, window.__northward.getData());
              window.__northward.loadState(loaded.state);
              return window.__northward.getState();
            }""", raw)
            fields = ["inventory", "equipment", "skills", "rng", "time", "activity", "battle", "regionId", "clearedRegions"]
            check("개편 전 실제 저장의 자원·장비·숙련·진행 상태 보존", all(actual.get(key) == expected.get(key) for key in fields))

            page.evaluate("window.__northward.actions.setReducedMotion(true)")

            # Repeated ingredient names must retain focus in the same recipe.
            navigate(page, "craft")
            page.evaluate("window.__northward.dispatch({type:'gather', id:'rime-shore-logging'})")
            ingredient = page.locator('.work-card [data-action="find-item"][data-id="rime-shore-wood"]').nth(1)
            recipe_id = ingredient.evaluate("el => el.closest('[data-record-id]').dataset.recordId")
            ingredient.focus()
            page.evaluate("window.__northward.advance(window.__northward.getState().activity.durationMs+1)")
            focused_recipe = page.evaluate("document.activeElement.closest('[data-record-id]')?.dataset.recordId")
            check("같은 재료가 여러 제작법에 있어도 갱신 뒤 초점 보존", focused_recipe == recipe_id, {"before": recipe_id, "after": focused_recipe})
            for width, height in [(1440, 1000), (768, 1024), (390, 844)]:
                page.set_viewport_size({"width": width, "height": height})
                for screen in PAGES:
                    navigate(page, screen)
                    overflow = page.evaluate("({width: innerWidth, scrollWidth: document.documentElement.scrollWidth})")
                    check(f"{width}px {screen} 화면의 가로 넘침 없음", overflow["scrollWidth"] <= width, overflow)
                    page.screenshot(path=str(OUT / f"{screen}-{width}.jpg"), type="jpeg", quality=85, full_page=True)
            page.set_viewport_size({"width": 1440, "height": 1000})
            navigate(page, "explore")
            for key in region_ids:
                page.locator(f'[data-action="region"][data-id="{key}"]').click()
                expected_path = assets[f"region-{key}"]["path"]
                scene = page.locator(".region-scene")
                check(f"{key} 선택 시 해당 지역 풍경 표시", expected_path in scene.get_attribute("style"))
                page.screenshot(path=str(OUT / f"region-{key}.jpg"), type="jpeg", quality=85, full_page=True)

            # Screenshot loaded late-game equipment, full item slots, and the ending.
            page.evaluate("""async () => {
              const {playCampaign} = await import('/tests/campaign.js');
              window.__northward.loadState(playCampaign(window.__northward.getData(), 91).state);
            }""")
            for screen in ["equipment", "inventory", "codex", "explore"]:
                navigate(page, screen)
                page.screenshot(path=str(OUT / f"completed-{screen}.jpg"), type="jpeg", quality=85, full_page=True)
            check("개편 뒤에도 여섯 지역과 실제 결말 표시", page.locator(".ending-panel").count() == 1)

            # A raid interrupts gathering, so its watch button must open combat.
            navigate(page, "gather")
            raid = page.evaluate("""() => {
              const debug = window.__northward;
              const id = debug.getData().activities.find(a => a.regionId === debug.getState().regionId).id;
              const started = debug.dispatch({type:'gather', id});
              if (!started.ok) throw new Error(started.message);
              const current = debug.getState();
              debug.advance(current.nextRaidAt-current.time+1);
              return debug.getState().battle;
            }""")
            check("채집이 실제 습격으로 중단되어 수비 진행", raid and raid["kind"] == "raid")
            page.locator('.activity-dock [data-action="navigate"]').click()
            page.locator('.battle-arena').wait_for()
            check("수비 중 전투 관전 버튼이 실제 전투 화면으로 이동", page.locator('.nav-button[data-page="explore"]').get_attribute("aria-current") == "page")
            region = page.evaluate("window.__northward.getState().regionId")
            check("수비 전투도 현재 지역의 고유 배경 사용", assets[f"region-{region}"]["path"] in page.locator('.battle-arena').get_attribute("style"))
            page.locator('.battle-panel').screenshot(path=str(OUT / "raid-combat.jpg"), type="jpeg", quality=85)
            check("전체 화면 전환에서 실행 오류 없음", not errors, errors)
            check("전체 아트·화면 리소스 요청 오류 없음", not resource_errors, resource_errors)
            report = {"passed": True, "checks": checks, "pageErrors": errors, "resourceErrors": resource_errors}
        except Exception as error:
            report = {"passed": False, "checks": checks, "error": str(error), "pageErrors": errors, "resourceErrors": resource_errors}
            if not page.is_closed():
                page.screenshot(path=str(OUT / "failure.jpg"), type="jpeg", quality=85, full_page=True)
            raise
        finally:
            (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            browser.close()


if __name__ == "__main__":
    main()
