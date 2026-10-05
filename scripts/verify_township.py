"""Verify Township commands, accessibility, responsive screens and real offline returns."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/python'))
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

OUT = ROOT / 'artifacts/township/browser'
SAVE_KEY = 'northward-idle.save.v2'
NOW = 1_800_000_000_000
TABS = ['buildings', 'storage', 'trade', 'supply', 'farm', 'objectives']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    base = parser.parse_args().url.rstrip('/')
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors, requests = [], [], []
    report = {'passed': False}

    def check(name, passed, detail=None):
        row = {'name': name, 'passed': bool(passed)}
        if detail is not None:
            row['detail'] = detail
        checks.append(row)
        if not passed:
            raise AssertionError(f'{name}: {detail}')
        print(f'PASS: {name}', flush=True)

    def attach(page):
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: requests.append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
        page.on('requestfailed', lambda request: requests.append({'url': request.url, 'failure': request.failure}))

    def ready(page):
        page.wait_for_function('Boolean(window.__northward)', timeout=30000)

    def state(page):
        return page.evaluate('window.__northward.getState()')

    def navigate(page, name):
        if page.viewport_size['width'] <= 760 and not page.locator('.game-shell.menu-open').count():
            page.locator('[data-action="toggle-menu"]').click()
        page.locator(f'.nav-button[data-page="{name}"]').click()

    def tab(page, name):
        page.locator(f'[data-action="town-tab"][data-id="{name}"]').click()

    def advance(page, ms):
        return page.evaluate('ms => window.__northward.advance(ms)', ms)

    with sync_playwright() as p:
        edge = Path(os.environ.get('PROGRAMFILES(X86)', 'C:/Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe'
        browser = p.chromium.launch(executable_path=str(edge) if edge.exists() else None, headless=True)
        contexts = []

        def context(raw=None):
            ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='ko-KR')
            ctx.add_init_script(f'Date.now = () => {NOW};')
            if raw is not None:
                ctx.add_init_script(f"if (location.origin === {json.dumps(base)} && !sessionStorage.getItem('seeded')) {{ localStorage.setItem({json.dumps(SAVE_KEY)}, {json.dumps(raw)}); sessionStorage.setItem('seeded','1'); }}")
            contexts.append(ctx)
            return ctx

        ctx = context()
        page = ctx.new_page()
        attach(page)
        try:
            page.goto(base + '/?dev=1')
            ready(page)
            check('새 마을·농사·숙련의 실제 저장 버전3 초기화', state(page)['schemaVersion'] == 3 and len(state(page)['town']['buildings']) == 12)
            navigate(page, 'gather')
            page.locator('[data-action="gather"][data-id="rime-shore-logging"]').click()
            advance(page, 30000)
            navigate(page, 'town')
            page.locator('[data-action="town-building"][data-id="sawmill"]').click()
            before = state(page)
            saw_cost = page.evaluate("window.__northward.getData().town.buildings.find(b=>b.id==='sawmill').levels[0].cost.resources.wood")
            page.locator('[data-action="town-build"][data-id="sawmill"]').click()
            constructing = state(page)
            check('시설 버튼이 실제 비용을 예약하며 주인공 채집 유지', constructing['town']['construction']['buildingId'] == 'sawmill' and constructing['town']['resources']['wood'] == before['town']['resources']['wood'] - saw_cost and constructing['activity'] == before['activity'])
            page.locator('[data-action="town-cancel-build"]').click()
            cancelled = state(page)
            check('건설 취소 버튼이 모든 자원·주화를 정확히 반환', cancelled['town']['resources'] == before['town']['resources'] and cancelled['town']['coins'] == before['town']['coins'] and cancelled['town']['construction'] is None)
            page.locator('[data-action="town-build"][data-id="sawmill"]').click()
            advance(page, 30000)
            check('같은 시간 엔진에서 실제 시설 완공·수동 활동 지속', state(page)['town']['buildings']['sawmill']['level'] == 1 and state(page)['activity']['id'] == 'rime-shore-logging')
            page.locator('[data-action="town-building"][data-id="kitchen"]').click()
            page.locator('[data-action="town-build"][data-id="kitchen"]').click()
            advance(page, 30000)
            check('공동 식당이 완공되어 실제 가공 생산에 연결', state(page)['town']['buildings']['kitchen']['level'] == 1)

            tab(page, 'trade')
            seed_input = page.locator('[data-input-key="trade-seed-rime-shore"]')
            seed_input.fill('2')
            seed_input.press('Tab')
            before = state(page)
            page.locator('[data-action="town-trade"][data-id="seed-rime-shore"]').click()
            after = state(page)
            check('교역 입력2회가 실제 주화8개와 씨앗2봉을 교환', after['inventory']['seed-rime-shore'] == before['inventory']['seed-rime-shore'] + 2 and after['town']['coins'] == before['town']['coins'] - 8)
            tab(page, 'farm')
            before = state(page)
            page.locator('[data-action="farm-plant"][data-id="plot-1"]').click()
            planted = state(page)
            check('농사 심기가 실제 씨앗1봉을 쓰며 직접 활동 유지', planted['inventory']['seed-rime-shore'] == before['inventory']['seed-rime-shore'] - 1 and planted['farm']['plots']['plot-1']['status'] == 'growing' and planted['activity'] == before['activity'])
            advance(page, 180000)
            check('수확 대기 작물은 가방에 자동 중복 지급되지 않음', state(page)['farm']['plots']['plot-1']['status'] == 'ready' and state(page)['farm']['totals']['harvested'] == 0)
            page.locator('[data-action="farm-harvest"][data-id="plot-1"]').click()
            check('수확 버튼이 실제 작물과 작물 마스터리를 한 번 지급', state(page)['farm']['totals']['harvested'] == 1 and state(page)['farm']['totals']['produced']['rime-shore-raw'] == 8 and state(page)['progression']['mastery']['crop-rime-shore']['xp'] == 10)

            # Make room for the reward using actual warehouse controls.
            tab(page, 'storage')
            food = state(page)['town']['resources']['food']
            if food:
                page.locator('[data-input-key="resource-food"]').fill(str(food))
                page.locator('[data-input-key="resource-food"]').press('Tab')
                page.locator('[data-action="town-donate"][data-id="food"]').click()
                check('창고 기부가 선택한 실제 자원을 사용하고 주화를 지급', state(page)['town']['resources']['food'] == 0)
            priorities = state(page)['town']['priority']
            page.locator('[data-action="town-priority"][data-id="fuel"][data-direction="up"]').click()
            check('창고 우선순위 버튼이 실제 저장 순서를 변경', state(page)['town']['priority'][0] == 'fuel' and state(page)['town']['priority'] != priorities)
            tab(page, 'objectives')
            before = state(page)
            page.locator('[data-action="claim-objective"][data-id="first-harvest"]').click()
            after = state(page)
            check('의뢰 버튼이 납품2개·씨앗3봉·한 번 보상 기록을 적용', after['inventory']['rime-shore-herb'] == before['inventory']['rime-shore-herb'] - 2 and after['inventory']['seed-rime-shore'] == before['inventory']['seed-rime-shore'] + 3 and after['progression']['claimedObjectives'].count('first-harvest') == 1)
            page.locator('[data-action="objective-filter"][data-id="claimed"]').click()
            check('받은 의뢰의 보상 재수령 버튼 차단', page.locator('[data-action="claim-objective"][data-id="first-harvest"]').is_disabled())

            tab(page, 'supply')
            page.locator('[data-input-key="auto-target"]').fill('20')
            page.locator('[data-input-key="auto-target"]').press('Tab')
            page.locator('[data-action="town-auto-apply"]').click()
            check('보급 설정 버튼이 실제 목표 재고와 품목 저장', state(page)['town']['autoSupply']['enabled'] and state(page)['town']['autoSupply']['targetStock'] == 20)

            # Keyboard focus must survive actual inventory changes.
            navigate(page, 'inventory')
            wood = page.locator('[data-action="find-item"][data-id="rime-shore-wood"]').first
            wood.focus()
            advance(page, 10000)
            check('실제 채집 결과 뒤 가방 아이템의 키보드 초점 유지', page.evaluate("document.activeElement?.dataset.id === 'rime-shore-wood'"))
            navigate(page, 'settings')
            colors = page.locator('.setting-row p').first.evaluate('(el) => ({color:getComputedStyle(el).color,background:getComputedStyle(el.closest(".panel")).backgroundColor})')
            check('자동 회복 조건의 작은 글씨 가독성', colors['color'] not in ['rgb(136, 151, 149)', 'rgb(123, 143, 152)'], colors)

            # Prepare a genuine construction/crop return state with normal commands.
            navigate(page, 'town')
            tab(page, 'farm')
            page.locator('[data-input-key="farm-auto-plot-1"]').check()
            page.locator('[data-action="farm-plant"][data-id="plot-1"]').click()
            offline = page.evaluate('''async () => {
              const d=window.__northward, data=d.getData(), original=d.getState();
              const {advanceGame}=await import('/src/simulation/engine.js');
              const {encodeSave}=await import('/src/storage/save.js');
              const expected=structuredClone(original), summary=advanceGame(expected,data,7200000,{offline:true});
              return {raw:encodeSave(original,Date.now()-7200000),expected,summary};
            }''')
            ctx.close()
            returned_ctx = context(offline['raw'])
            returned = returned_ctx.new_page()
            page = returned
            attach(returned)
            returned.goto(base + '/?dev=1')
            ready(returned)
            summary = returned.evaluate('window.__northward.getSummary()')
            check('앱 복귀 분할 계산이 순수 엔진2시간 결과와 정확히 일치', state(returned) == offline['expected'])
            check('복귀 요약에 실제 마을 생산·교역·농사·숙련 포함', summary['town']['ticks'] == 120 and summary['farm']['harvested'] > 0 and len(summary['mastery']['xp']) > 0 and returned.locator('.summary-expansion').count() >= 2)
            returned.screenshot(path=str(OUT / 'offline-town-farm.jpg'), type='jpeg', quality=85, full_page=True)
            after_return = state(returned)
            returned.reload()
            ready(returned)
            check('복귀 화면 재로드로 자원·작물·의뢰가 중복 지급되지 않음', state(returned) == after_return)
            returned.locator('[data-action="summary-town"]').click()
            check('복귀 요약에서 실제 마을 관리로 이동·요약 확인 저장', returned.locator('.nav-button[data-page="town"]').get_attribute('aria-current') == 'page' and returned.evaluate('window.__northward.getSummary()') is None)

            first_clear_raw = returned.evaluate('''async () => {
              const fixtures=await fetch('/tests/fixtures/pre-township-v2-states.json').then(r=>r.json());
              const {decodeSave,encodeSave}=await import('/src/storage/save.js');
              const legacy=decodeSave(JSON.stringify(fixtures.fixtures.explorationBattle),window.__northward.getData());
              return encodeSave(legacy.state,Date.now()-3600000);
            }''')
            paused_ctx = context(first_clear_raw)
            paused = paused_ctx.new_page()
            attach(paused)
            paused.goto(base + '/?dev=1')
            ready(paused)
            paused_state = state(paused)
            check('첫 돌파의1시간오프라인 보존 전투와 실제 수비 계산', paused_state['offlineBlocked'] and paused_state['suspendedBattle'] is not None and paused_state['totals']['raids'] > 0)
            paused.reload()
            ready(paused)
            check('오랫동안 보존한 첫 돌파 전투도 재로드와 저장 복구 오류 없음', state(paused) == paused_state and paused.locator('#app-overlay').count() == 0)
            paused.locator('[data-action="modal-close"]').first.click()
            advance(paused, 1000)
            check('재접속 후 첫 돌파의 보존된 공격 시계와 탐험 재개', not state(paused)['offlineBlocked'] and state(paused)['activity']['type'] == 'explore')
            paused_ctx.close()

            invalid_summary_raw = returned.evaluate('''async () => {
              const {encodeSave}=await import('/src/storage/save.js');
              return encodeSave(window.__northward.getState(),Date.now(),{pendingSummary:{elapsedMs:5000,events:'broken'}});
            }''')
            invalid_ctx = context(invalid_summary_raw)
            invalid = invalid_ctx.new_page()
            attach(invalid)
            invalid.goto(base + '/?dev=1')
            invalid.locator('#app-overlay').wait_for()
            check('손상 복귀 요약은 렌더 오류 없이 복구 안내·원본 보존', '저장 복구' in invalid.locator('#app-overlay').inner_text() and invalid.evaluate(f'localStorage.getItem({json.dumps(SAVE_KEY)})') == invalid_summary_raw)
            invalid_ctx.close()

            # Use the separately verified normal-command endgame, never arbitrary inventory.
            completed = json.loads((ROOT / 'artifacts/township/completed-state.json').read_text(encoding='utf-8'))
            returned.evaluate('value => window.__northward.loadState(value)', completed)
            check('정규 완주 저장의12시설6단계·18개 완료 의뢰 표시', len(state(returned)['progression']['claimedObjectives']) == 18 and all(b['level'] == 6 for b in state(returned)['town']['buildings'].values()))
            for width, height in [(1440, 1000), (768, 1024), (390, 844)]:
                returned.set_viewport_size({'width': width, 'height': height})
                navigate(returned, 'town')
                experience_layout = returned.locator('.town-experience').evaluate('''el => {
                  const panel=el.closest('.town-overview').getBoundingClientRect();
                  return [...el.children].map(child => {
                    const box=child.getBoundingClientRect();
                    return {text:child.textContent.trim(),inside:box.left>=panel.left+1&&box.right<=panel.right-1,
                      clipped:child.scrollWidth>child.clientWidth+1};
                  });
                }''')
                check(f'{width}px 마을 경험치·남은 단계 글씨 잘림 없음', all(row['inside'] and not row['clipped'] for row in experience_layout), experience_layout)
                for name in TABS:
                    tab(returned, name)
                    check(f'{width}px 마을 {name} 탭 실제 표시·가로 넘침 없음', returned.evaluate('document.documentElement.scrollWidth <= innerWidth') and returned.locator(f'.town-tab[data-id="{name}"]').get_attribute('aria-current') == 'page')
                    returned.screenshot(path=str(OUT / f'completed-{name}-{width}.jpg'), type='jpeg', quality=85, full_page=True)
            returned.locator('[data-action="toggle-menu"]').click()
            trapped = []
            for _ in range(14):
                returned.keyboard.press('Tab')
                trapped.append(returned.evaluate('document.activeElement.closest(".sidebar") !== null'))
            check('390px 메뉴에서 반복Tab이 배경으로 빠지지 않음', all(trapped) and returned.locator('.workspace').evaluate('el=>el.inert'))
            returned.keyboard.press('Escape')
            check('모바일 메뉴Escape가 메뉴를 닫고 토글 초점을 복원', returned.locator('[data-action="toggle-menu"]').evaluate('el=>el===document.activeElement') and returned.locator('.sidebar').evaluate('el=>el.inert'))
            check('마을 전체 실제 실행 오류 없음', not errors, errors)
            check('마을 아트와 전체 리소스 요청 오류 없음', not requests, requests)
            report = {'passed': True, 'checks': checks, 'pageErrors': errors, 'resourceErrors': requests}
        except Exception as error:
            report = {'passed': False, 'checks': checks, 'error': str(error), 'pageErrors': errors, 'resourceErrors': requests}
            if not page.is_closed():
                page.screenshot(path=str(OUT / 'failure.jpg'), type='jpeg', quality=85, full_page=True)
            raise
        finally:
            (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()


if __name__ == '__main__':
    main()
