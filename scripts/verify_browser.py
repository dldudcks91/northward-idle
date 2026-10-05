"""Exercise the real browser game and save screenshots and a machine-readable report."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".tools/python"))
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

SAVE_KEY = "northward-idle.save.v2"
ARTIFACTS = ROOT / "artifacts/browser"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    checks = []
    errors = []
    bad_responses = []

    def check(name, condition, detail=None):
        entry = {"name": name, "passed": bool(condition)}
        if detail is not None:
            entry["detail"] = detail
        checks.append(entry)
        if not condition:
            raise AssertionError(f"{name}: {detail}")
        print(f"PASS: {name}", flush=True)

    def attach(page):
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: bad_responses.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)

    def ready(page):
        page.wait_for_function("Boolean(window.__northward)", timeout=15000)
        page.wait_for_timeout(100)

    def state(page):
        return page.evaluate("window.__northward.getState()")

    def navigate(page, name):
        button = page.locator(f'.nav-button[data-page="{name}"]')
        if page.viewport_size["width"] <= 760 and not page.locator('.game-shell.menu-open').count():
            page.locator('[data-action="toggle-menu"]').click()
        button.click()

    with sync_playwright() as p:
        edge = Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe"
        browser = p.chromium.launch(executable_path=str(edge) if edge.exists() else None, headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True, locale="ko-KR")
        page = context.new_page()
        attach(page)
        dialogs = []
        page.on("dialog", lambda dialog: (dialogs.append(dialog.message), dialog.accept()))
        try:
            page.goto(base + "/?dev=1")
            ready(page)
            check("처음 진입과 여섯 지역 표시", page.locator('.route-stop').count() == 6)
            check("신규 아트 이미지 실제 로드", page.evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)"))
            page.screenshot(path=str(ARTIFACTS / "overview.jpg"), type="jpeg", quality=85, full_page=True)
            initial = state(page)
            navigate(page, "gather")
            page.locator('[data-action="gather"][data-id="rime-shore-logging"]').click()
            check("채집 버튼이 실제 활동 시작", state(page)["activity"]["id"] == "rime-shore-logging")
            before_freeze = state(page)["time"]
            session = context.new_cdp_session(page)
            session.send("Page.setWebLifecycleState", {"state": "frozen"})
            time.sleep(0.55)
            session.send("Page.setWebLifecycleState", {"state": "active"})
            page.wait_for_function(f"window.__northward.getState().time >= {before_freeze + 500}")
            check("브라우저 타이머 정지 뒤 실제 경과 복구", state(page)["activity"]["id"] == "rime-shore-logging")
            navigate(page, "craft")
            page.evaluate("window.__northward.advance(26000)")
            gathered = state(page)
            check("다른 메뉴에서도 채집 지속", gathered["inventory"].get("rime-shore-wood", 0) >= 8 and gathered["activity"]["id"] == "rime-shore-logging")
            quantity = page.locator('#count-rime-shore-saw')
            quantity.select_option("1")
            quantity.focus()
            page.wait_for_timeout(450)
            check("렌더 갱신 뒤 제작 선택과 키보드 초점 보존", quantity.input_value() == "1" and quantity.evaluate("el => document.activeElement === el"))
            page.locator('[data-action="craft"][data-id="rime-shore-saw"]').click()
            page.evaluate("window.__northward.advance(12000)")
            crafted = state(page)
            check("실제 재료 소비와 지정 횟수 제작 완료", crafted["inventory"].get("rime-shore-plank", 0) == 2 and crafted["activity"] is None)

            # Another page may render the game, but must not advance or overwrite it.
            other = context.new_page()
            attach(other)
            other.goto(base + "/")
            other.locator('#app-overlay').wait_for()
            check("중복 창의 진행·저장 방지", "다른 창" in other.locator('#app-overlay').inner_text())
            other.close()

            navigate(page, "settings")
            reduced = page.get_by_role("checkbox", name="전투 연출 줄이기")
            reduced.focus()
            reduced.press("Space")
            check("키보드로 연출 감소 설정", page.evaluate("window.__northward.actions.getSettings().reducedMotion"))
            with page.expect_download() as download_info:
                page.locator('[data-action="export"]').click()
            download = download_info.value
            save_path = ARTIFACTS / "exported-save.json"
            download.save_as(str(save_path))
            exported = json.loads(save_path.read_text(encoding="utf-8"))
            check("내보낸 저장 파일 실제 상태 포함", exported["game"] == "northward-idle" and exported["state"]["inventory"].get("rime-shore-plank") == 2)
            page.locator('#save-import').set_input_files(str(save_path))
            page.wait_for_timeout(500)
            check("가져오기 검증·확인·실제 복원", state(page)["inventory"].get("rime-shore-plank") == 2 and len(dialogs) == 1)
            page.locator('[data-action="reset-prompt"]').click()
            page.get_by_role('button', name='취소', exact=True).click()
            check("새 여정 취소에서 진행 보존", state(page)["inventory"].get("rime-shore-plank") == 2)
            page.locator('[data-action="reset-prompt"]').click()
            page.locator('[data-action="reset-confirm"]').click()
            check("새 여정 한 번 확인·원본 보관", state(page)["clearedRegions"] == [] and len(dialogs) == 1 and bool(page.evaluate("localStorage.getItem('northward-idle.save.v2.original')")))

            # Build a prepared battle fixture through the normal-command campaign.
            ending = page.evaluate("""async () => {
              const { playCampaign } = await import('/tests/campaign.js');
              const result = playCampaign(window.__northward.getData(), 7);
              window.__northward.loadState(result.state);
              return { completed: result.state.completed, cleared: result.state.clearedRegions.length, time: result.elapsedMs };
            }""")
            check("처음부터 정규 명령으로 결말 도달", ending["completed"] and ending["cleared"] == 6, ending)
            navigate(page, "explore")
            page.locator('[data-action="region"][data-id="aurora-ruins"]').click()
            check("실제 결말과 모든 지역 해금 표시", page.locator('.ending-panel').count() == 1)
            page.screenshot(path=str(ARTIFACTS / "ending.jpg"), type="jpeg", quality=85, full_page=True)
            navigate(page, "codex")
            page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
            check("도감 몬스터 18종과 종별 아트 실제 로드", page.locator('.creature-card').count() == 18)
            navigate(page, "explore")
            page.locator('[data-action="explore"][data-id="aurora-ruins"]').click()
            page.evaluate("window.__northward.advance(16000)")
            check("결말 후 반복 탐험 가능", state(page)["activity"]["type"] == "explore")
            page.wait_for_function("Boolean(window.__northward.getState().battle)")
            page.evaluate("window.__northward.actions.setReducedMotion(false)")
            page.locator('[data-fighter="player"]').wait_for()
            page.evaluate("window.__fighter = document.querySelector('[data-fighter=player]')")
            page.wait_for_timeout(450)
            check("Focus Stop 도중 전투 노드 유지", page.evaluate("window.__fighter === document.querySelector('[data-fighter=player]')"))
            page.locator('.battle-panel').screenshot(path=str(ARTIFACTS / "combat.jpg"), type="jpeg", quality=85)
            before_explore = state(page)["activity"]["id"]
            navigate(page, "inventory")
            page.evaluate("window.__northward.advance(12000)")
            check("다른 메뉴에서도 탐험과 전투 지속", state(page)["activity"]["id"] == before_explore)

            for width, height in [(768, 1024), (390, 844)]:
                page.set_viewport_size({"width": width, "height": height})
                navigate(page, "explore")
                page.wait_for_timeout(150)
                check(f"{width}px 반응형 가로 넘침 없음", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                page.screenshot(path=str(ARTIFACTS / f"mobile-{width}.jpg"), type="jpeg", quality=85, full_page=True)
                navigate(page, "settings")
                check(f"{width}px 메뉴 조작과 설정 접근", page.get_by_role("checkbox", name="전투 연출 줄이기").is_visible())
                if width == 390:
                    check("닫힌 모바일 메뉴의 키보드·접근성 차단", page.locator('.sidebar').evaluate('el => el.inert'))
                    page.locator('[data-action="toggle-menu"]').click()
                    check("모바일 메뉴 열기에서 첫 항목 초점", page.locator('.nav-button').first.evaluate('el => document.activeElement === el') and not page.locator('.sidebar').evaluate('el => el.inert'))
                    page.keyboard.press('Escape')
                    check("모바일 메뉴 Escape 뒤 초점 복귀", page.locator('[data-action="toggle-menu"]').evaluate('el => document.activeElement === el') and page.locator('.sidebar').evaluate('el => el.inert'))

            # Resume the same saved normal-command campaign offline in a new browser session.
            page.evaluate("window.__northward.save()")
            raw = page.evaluate(f"localStorage.getItem({json.dumps(SAVE_KEY)})")
            session_saved = json.loads(raw)
            context.close()

            def seeded_context(payload, now=None):
                ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
                script = f"""if (location.origin === {json.dumps(base)} && !sessionStorage.getItem('verification-seeded')) {{
                  localStorage.setItem({json.dumps(SAVE_KEY)}, {json.dumps(payload)});
                  sessionStorage.setItem('verification-seeded', '1');
                }}"""
                ctx.add_init_script(script)
                if now is not None:
                    ctx.add_init_script(f"Date.now = () => {now};")
                return ctx

            # Re-sign offline fixture using the actual serializer, not a test replica.
            temp_context = browser.new_context()
            temp_page = temp_context.new_page()
            temp_page.goto(base + "/?dev=1")
            ready(temp_page)
            offline_raw = temp_page.evaluate("""async raw => {
              const storage = await import('/src/storage/save.js');
              const loaded = storage.decodeSave(raw, window.__northward.getData());
              const now = Date.now();
              return { raw: storage.encodeSave(loaded.state, now-7200000), capRaw: storage.encodeSave(loaded.state, now-10*86400000), now };
            }""", raw)
            temp_context.close()
            offline_context = seeded_context(offline_raw["raw"], offline_raw["now"])
            offline_page = offline_context.new_page()
            attach(offline_page)
            offline_page.goto(base + "/?dev=1")
            ready(offline_page)
            summary = offline_page.evaluate("window.__northward.getSummary()")
            check("오프라인 복귀 실제 수비 계산·요약", summary["elapsedMs"] >= 7200000 and summary["raids"] > 0 and offline_page.get_by_role('dialog').count() == 1, {"raids": summary["raids"], "wins": summary["defenseWins"], "losses": summary["defenseLosses"]})
            inventory_after = state(offline_page)["inventory"]
            raids_after = state(offline_page)["totals"]["raids"]
            offline_page.screenshot(path=str(ARTIFACTS / "offline-summary.jpg"), type="jpeg", quality=85, full_page=True)
            offline_page.reload()
            ready(offline_page)
            check("복귀 중 재로드에서 수비·보상 중복 없음", state(offline_page)["totals"]["raids"] == raids_after and state(offline_page)["inventory"] == inventory_after)
            offline_page.get_by_role('button', name='복귀 요약 닫기').click()
            check("복귀 요약 확인을 저장", offline_page.evaluate("window.__northward.getSummary()") is None)
            offline_context.close()

            capped_context = seeded_context(offline_raw["capRaw"], offline_raw["now"])
            capped_page = capped_context.new_page()
            attach(capped_page)
            cap_started = time.perf_counter()
            capped_page.goto(base + "/?dev=1")
            ready(capped_page)
            cap_seconds = time.perf_counter() - cap_started
            capped_summary = capped_page.evaluate("window.__northward.getSummary()")
            check("실제 앱 7일 복귀와 제외 시간 표시", capped_summary["elapsedMs"] == 7*86400000 and capped_summary["excludedMs"] == 3*86400000 and state(capped_page)["completed"], {"browserBootAndReturnSeconds": round(cap_seconds, 3), "simulatedDays": 7, "excludedDays": 3})
            capped_context.close()

            corrupt_context = seeded_context('{"game":"northward-idle", broken')
            corrupt_page = corrupt_context.new_page()
            attach(corrupt_page)
            corrupt_page.goto(base + "/?dev=1")
            corrupt_page.locator('#app-overlay').wait_for()
            check("손상 저장 복구 화면과 원본 보존", "저장 복구" in corrupt_page.locator('#app-overlay').inner_text() and corrupt_page.evaluate(f"localStorage.getItem({json.dumps(SAVE_KEY)})") == '{"game":"northward-idle", broken')
            corrupt_context.close()

            check("전체 브라우저 실행 오류 없음", not errors, errors)
            check("전체 게임 리소스 HTTP 오류 없음", not bad_responses, bad_responses)
            # Capture the ordinary starting screen without development controls.
            clean_context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
            clean_page = clean_context.new_page()
            clean_page.goto(base + "/")
            clean_page.locator('.region-scene').wait_for()
            clean_page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
            check("일반 플레이에서 개발 도구 숨김", clean_page.locator('#dev-tools').count() == 0)
            clean_page.screenshot(path=str(ARTIFACTS / "overview.jpg"), type="jpeg", quality=85, full_page=True)
            clean_context.close()
            report = {"passed": True, "checks": checks, "pageErrors": errors, "resourceErrors": bad_responses}
        except Exception as error:
            report = {"passed": False, "checks": checks, "error": str(error), "pageErrors": errors, "resourceErrors": bad_responses}
            if not page.is_closed():
                page.screenshot(path=str(ARTIFACTS / "failure.jpg"), type="jpeg", quality=85, full_page=True)
            raise
        finally:
            (ARTIFACTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            browser.close()


if __name__ == "__main__":
    main()
