import { getDerivedStats, getActivityAvailability, getRegionRequirements } from '../simulation/engine.js';
import * as expansion from '../simulation/engine.js';

const PATHS = {
  compass: '<circle cx="24" cy="25" r="19" fill="#efb457"/><circle cx="24" cy="23" r="15" fill="#e7f8fb"/><path d="m31 12-3 15-14 7 6-15Z" fill="#ee7768"/><path d="m31 12-3 15-8-8Z" fill="#b3433e"/><circle cx="24" cy="23" r="2.5" fill="#fff9df"/><path d="M24 5V2"/><path d="M11 15a15 15 0 0 1 13-7" stroke="#fff4d2" stroke-width="3"/>',
  leaf: '<path d="M9 38C5 18 16 8 41 7c1 22-10 33-27 28Z" fill="#69b96b"/><path d="M12 34 32 15M22 25l-1-10M23 24l12 1" fill="none" stroke="#327841" stroke-width="3"/><path d="m8 43 10-14" stroke="#ad783d" stroke-width="4"/><path d="M13 20q8-8 19-9" fill="none" stroke="#c5ed9c" stroke-width="3"/>',
  hammer: '<path d="m16 18 8 6L11 44l-7-6Z" fill="#ac7040"/><path d="m11 32 5 3M9 37l4 2" stroke="#e5ad70"/><path d="m22 5 20 12-5 12-20-12Z" fill="#88b9cc"/><path d="m22 5 4 7 16 5M26 12l-4 9" fill="none" stroke="#d5f0f2" stroke-width="3"/><path d="m37 29 5-12-7 4Z" fill="#53788f"/>',
  sword: '<path d="m29 4 14 1 0 12-23 22-10-10Z" fill="#a8dae9"/><path d="M39 8 15 33" stroke="#edfaff" stroke-width="4"/><path d="m28 26 6 5-5 5-21-17 5-5Z" fill="#f3bd57"/><path d="m11 30 7 6L9 46l-7-7Z" fill="#a66a42"/><path d="m8 34 6 5" stroke="#e4b078"/>',
  book: '<path d="M6 10q10-4 18 1 8-5 18-1v29q-10-4-18 1-8-5-18-1Z" fill="#6a97cd"/><path d="M9 6q8-2 15 3 7-5 15-3v27q-8-2-15 3-7-5-15-3Z" fill="#fff1d5"/><path d="M24 9v27M13 13l6 2M13 19l6 2M29 15l6-2M29 21l6-2" stroke="#b5a079" stroke-width="2"/><path d="m30 5 5-1v11l-3-2-2 3Z" fill="#f7a450"/>',
  scroll: '<path d="M11 4h27v31H11C3 35 3 45 11 45h27c8 0 8-10 0-10" fill="#f9dfaa"/><path d="M11 4v31M15 12h16M15 19h16M15 26h10" stroke="#aa814b"/><path d="M11 4C3 4 3 14 11 14M38 35v10" fill="#d3ad74"/><path d="m27 26 6 2-5 15-4 2-1-5Z" fill="#d88153"/>',
  gear: '<path d="m19 3-1 7-5 3-6-2-4 8 5 5-1 5-5 5 5 7 7-2 5 3 1 6h10l1-6 5-3 6 2 4-8-5-5v-5l5-5-5-8-6 3-5-3-1-7Z" fill="#96b7d0"/><circle cx="25" cy="25" r="10" fill="#507a9c"/><circle cx="25" cy="25" r="6" fill="#e2f2f8"/><path d="m20 8 8 0M9 18l4-4" stroke="#e7f4fb" stroke-width="3"/>',
  heart: '<path d="M24 42 5 23C-3 9 13-1 24 12 35-1 51 9 43 23Z" fill="#ee707d"/><path d="M10 18c-2-8 6-10 10-5" fill="none" stroke="#ffc6c3" stroke-width="4"/><path d="m24 40 17-18" fill="none" stroke="#ba3c55" stroke-width="4"/>',
  shield: '<path d="M24 3 4 11v14c0 10 20 21 20 21s20-11 20-21V11Z" fill="#e0d4ab"/><path d="M24 8 9 14v11c0 7 15 15 15 15s15-8 15-15V14Z" fill="#75afd5"/><path d="M24 8v32" stroke="#bbdfea" stroke-width="3"/><path d="m17 24 5 5 10-12" fill="none" stroke="#fff6d6" stroke-width="4"/>',
  fire: '<path d="M26 2c7 12-7 14-1 22 6-3 9-6 8-13 9 8 16 24 7 32-10 9-31 4-33-8-2-8 5-16 12-22-1 9 1 10 3 12 6-6-1-13 4-23Z" fill="#f68d3f"/><path d="M26 21c5 8-2 9-1 14 3-1 5-3 6-6 6 11 1 17-6 17-10 0-12-12-7-18 0 5 1 6 3 7 4-4 0-7 5-14Z" fill="#ffdc67"/><path d="m14 14-4 7" stroke="#ffd1a2" stroke-width="3"/>',
  food: '<ellipse cx="24" cy="36" rx="21" ry="8" fill="#98bbd0"/><path d="M5 23h38c0 17-8 20-19 20S5 38 5 23Z" fill="#719dc0"/><ellipse cx="24" cy="22" rx="20" ry="7" fill="#fff4d6"/><ellipse cx="24" cy="22" rx="16" ry="4" fill="#cd7846"/><path d="m15 22 6-4 4 4 7-2" fill="none" stroke="#eabc61" stroke-width="3"/><path d="M15 12c-5-4 5-4 1-8M26 12c-5-4 5-4 1-8M36 12c-5-4 5-4 1-8" fill="none" stroke="#d7f2f7" stroke-width="3"/><path d="M9 29q3 7 9 8" fill="none" stroke="#b9d6e5" stroke-width="3"/>',
  snow: '<path d="M21 2h6v11l8-6 4 5-10 7 12 2v6l-12 2 10 7-4 5-8-6v11h-6V35l-8 6-4-5 10-7-13-2v-6l13-2-10-7 4-5 8 6Z" fill="#a7e8f8"/><path d="M24 8v32M11 15l26 19M11 34l26-19" stroke="#edfaff" stroke-width="2"/>',
  camp: '<path d="m3 35 17-30 22 30Z" fill="#df9d57"/><path d="m20 5 6 30h16Z" fill="#6498c2"/><path d="m9 35 12-18 5 18Z" fill="#4c687c"/><path d="m3 35-1 5h42l-2-5Z" fill="#cae3ee"/><path d="m10 17 8-8" stroke="#ffdda0" stroke-width="3"/><path d="m33 27 3 8 6 3-8 5-6-6Z" fill="#ef9847"/>',
  arrow: '<path d="M4 17h22V6l19 19-19 19V33H4Z" fill="#80c5eb"/><path d="M7 20h22V13l11 12" fill="none" stroke="#e1f6ff" stroke-width="3"/>',
  check: '<path d="m5 22 9-7 9 10L39 5l7 8-24 30Z" fill="#72c57b"/><path d="m10 23 13 14 18-23" fill="none" stroke="#c9edb9" stroke-width="3"/>',
  lock: '<path d="M13 23V13c0-15 23-15 23 0v10" fill="none" stroke="#879daf" stroke-width="7"/><rect x="6" y="20" width="36" height="26" rx="6" fill="#e1bb66"/><path d="M11 24h26" stroke="#fff1b6" stroke-width="3"/><circle cx="24" cy="31" r="4" fill="#83613d"/><path d="M24 32v8" stroke="#83613d" stroke-width="4"/>',
  stop: '<rect x="7" y="7" width="34" height="34" rx="8" fill="#e97873"/><path d="M12 13h24" stroke="#ffc8ba" stroke-width="3"/><rect x="17" y="17" width="14" height="14" rx="2" fill="#fff4e3"/>',
  close: '<path d="m9 4 15 14L39 4l6 8-14 13 14 14-7 7-14-14L9 46l-7-8 15-13L2 12Z" fill="#eb8c77"/><path d="m10 10 14 14 14-14" fill="none" stroke="#ffe0cb" stroke-width="3"/>',
  download: '<path d="M16 3h16v19h11L24 41 5 22h11Z" fill="#71badd"/><path d="M19 7v19h-6" fill="none" stroke="#d6f5fa" stroke-width="3"/><path d="M5 39v7h38v-7" fill="none" stroke="#859fb0" stroke-width="4"/>',
  upload: '<path d="M16 43h16V24h11L24 5 5 24h11Z" fill="#76bb95"/><path d="M19 37V21h-6" fill="none" stroke="#dcf5d3" stroke-width="3"/><path d="M5 9V2h38v7" fill="none" stroke="#859fb0" stroke-width="4"/>',
  eye: '<path d="M2 24s8-14 22-14 22 14 22 14-8 14-22 14S2 24 2 24Z" fill="#eff8ef"/><circle cx="24" cy="24" r="10" fill="#6eacd1"/><circle cx="24" cy="24" r="5" fill="#3b526b"/><circle cx="21" cy="21" r="3" fill="#fff" stroke="none"/>',
  backpack: '<path d="M15 12V5h18v7" fill="none" stroke="#866149" stroke-width="5"/><rect x="6" y="10" width="36" height="35" rx="8" fill="#db9b54"/><path d="M6 18h36v11H6Z" fill="#f5c978"/><rect x="13" y="29" width="22" height="13" rx="3" fill="#b87542"/><path d="M20 18v8h8v-8" fill="#d9dce2"/><path d="M11 14h26M17 33h14" stroke="#ffe1a0" stroke-width="3"/>',
  clock: '<circle cx="24" cy="25" r="20" fill="#d4a95a"/><circle cx="24" cy="23" r="16" fill="#fff5da"/><path d="M24 12v12l8 5" fill="none" stroke="#6b8399" stroke-width="4"/><path d="M24 9v3M10 23h3M35 23h3M24 34v3" stroke="#bfa577"/><circle cx="24" cy="23" r="2" fill="#df9b50"/>',
  menu: '<rect x="4" y="6" width="40" height="9" rx="3" fill="#b7dcf0"/><rect x="4" y="20" width="40" height="9" rx="3" fill="#80b9dc"/><rect x="4" y="34" width="40" height="9" rx="3" fill="#6698bc"/><path d="M8 9h31M8 23h31" stroke="#e6f5ff" stroke-width="2"/>',
  fish: '<path d="M12 24 3 11l2 27Z" fill="#6cadd0"/><path d="M9 24C18 4 38 9 46 24 38 40 18 44 9 24Z" fill="#94d4e4"/><path d="m18 15 3-11 13 8m-16 22 3 11 12-9" fill="#6dacc8"/><path d="M34 14q-8 10 0 21" fill="none" stroke="#639cad"/><circle cx="38" cy="21" r="3" fill="#344c63"/><circle cx="39" cy="20" r="1" fill="#fff" stroke="none"/><path d="M15 23q7-10 13-9" fill="none" stroke="#d9f4f4" stroke-width="3"/>',
  ore: '<path d="m11 6 24-2 11 20-11 20H10L2 25Z" fill="#9baac9"/><path d="m11 6 8 19-9 19M35 4l-5 20 5 20M2 25l17 0 11-1 16 0" fill="none" stroke="#667997"/><path d="m11 6 24-2-16 21Z" fill="#d2e2f0"/><path d="m30 24 5 20H10l9-19Z" fill="#8e9dbb"/><path d="m13 8 14-1" stroke="#edf6ff" stroke-width="3"/>',
  wood: '<path d="m5 31 28-23 11 14-29 23Z" fill="#b67a44"/><path d="m13 28 27-14M17 33l26-15" stroke="#7e563d" stroke-width="3"/><ellipse cx="11" cy="36" rx="10" ry="8" transform="rotate(-35 11 36)" fill="#edc784"/><ellipse cx="11" cy="36" rx="5" ry="4" transform="rotate(-35 11 36)" fill="#cfa366"/><path d="m9 25 25-18" stroke="#f8dca3" stroke-width="3"/>',
  charm: '<path d="M12 8q12-13 24 0v9" fill="none" stroke="#c28d49" stroke-width="4"/><path d="m24 11 14 12-6 20H16l-6-20Z" fill="#e5c06f"/><path d="m24 17 8 8-4 13h-8l-4-13Z" fill="#8c75d0"/><path d="m24 17 0 21M16 25h16" stroke="#c4b3f0" stroke-width="2"/>',
  paw: '<path d="M13 29q11-18 22 0c13 12-4 20-11 14-8 6-24-2-11-14Z" fill="#c28c64"/><ellipse cx="7" cy="17" rx="5" ry="8" transform="rotate(-25 7 17)" fill="#deb68d"/><ellipse cx="19" cy="9" rx="5" ry="8" fill="#deb68d"/><ellipse cx="31" cy="9" rx="5" ry="8" fill="#deb68d"/><ellipse cx="42" cy="17" rx="5" ry="8" transform="rotate(25 42 17)" fill="#deb68d"/><path d="M17 32q7-9 14 0" fill="none" stroke="#f5d4ad" stroke-width="3"/>',
  spark: '<path d="m24 3 6 13 15 2-11 11 3 15-13-7-13 7 3-15L3 18l15-2Z" fill="#f4c762"/><path d="m24 8 4 12 11 1-9 6" fill="none" stroke="#fff3b9" stroke-width="3"/>',
};
let iconAssets = {};
const icon = (name, cls = '') => iconAssets[`icon-${name}`] ? `<img class="icon ${cls}" src="${iconAssets[`icon-${name}`]}" alt="" aria-hidden="true" />` : `<svg class="icon ${cls}" viewBox="0 0 48 48" fill="none" stroke="#39556d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.spark}</svg>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (value) => Math.floor(Number(value) || 0).toLocaleString('ko-KR');
const exactNum = (value) => (Number(value) || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const statNum = (value) => (Number(value) || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const percent = (value, max) => Math.max(0, Math.min(100, max > 0 ? Math.floor(value / max * 100) : 0));
const duration = (ms) => {
  const seconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${seconds % 60 ? `${seconds % 60}초` : ''}`.trim();
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분`;
};
const timecode = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const stopReasonText = (reason) => {
  if (!reason || reason === '활동을 중지하고 안전한 곳으로 귀환했다.' || reason === '지정한 제작을 모두 마쳤다.') return '';
  if (reason.startsWith('탐험에서 쓰러져')) return '탐험 패배';
  return reason.replace(' 이상의 탐험 보급이 부족하여 귀환했다.', ' 이상 보급 부족');
};
const PHASES = { idle: '활동 대기', working: '작업 중', exploring: '탐험 중', defending: '자동 수비 중', recovering: '회복 중' };
const STAT_LABELS = { attack: '공격', defense: '방어', warmth: '보온', maxHp: '최대 체력', combatLevel: '전투 숙련', critChance: '치명타' };
const SLOT_LABELS = { weapon: '무기', armor: '방어구', charm: '장신구' };
const NAV = [['explore', 'compass', '탐험'], ['gather', 'leaf', '채집'], ['craft', 'hammer', '제작'], ['town', 'camp', '마을'], ['equipment', 'sword', '장비'], ['inventory', 'backpack', '가방'], ['codex', 'book', '도감'], ['records', 'scroll', '기록'], ['settings', 'gear', '설정']];

export function mountUI({ data, getState, dispatch, actions = {}, assets = {} }) {
  iconAssets = assets;
  const app = document.getElementById('app');
  const byId = (records) => Object.fromEntries((records || []).map(record => [record.id, record]));
  const items = byId(data.items);
  const regions = byId(data.regions);
  const activities = byId(data.activities);
  const recipes = byId(data.recipes);
  const enemies = byId(data.enemies);
  const skills = byId(data.skills);
  let page = 'explore';
  let selectedRegion = getState().regionId;
  let lastStateRegion = getState().regionId;
  let filter = 'all';
  let highlightedId = null;
  let inventoryFilter = 'all';
  let menuOpen = false;
  let lastBattleAction = null;
  let summaryData = null;
  let resetPrompt = false;
  let modalReturnFocus = null;
  let modalReturnFocusKey = null;
  let townTab = 'buildings';
  let selectedBuilding = null;
  let objectiveFilter = 'pending';
  let collectionFilter = 'all';
  const townInputs = {};
  const toastTimers = new Set();
  const selectCounts = {};
  const isDev = new URLSearchParams(location.search).get('dev') === '1';
  const assetPath = (role) => assets[role] || assets[role === 'stag' ? 'wolf' : 'landscape'] || '';
  const regionAsset = (regionId) => assets[`region-${regionId}`] || assets.landscape || '';
  const portrait = (role, className, alt) => assetPath(role) ? `<img class="${className}" src="${esc(assetPath(role))}" alt="${esc(alt)}" draggable="false" />` : `<div class="${className} art-fallback" aria-label="${esc(alt)}">${icon(role === 'hero' ? 'sword' : 'paw')}</div>`;
  const itemIcon = (item = {}) => {
    if (item.slot) return { weapon: 'sword', armor: 'shield', charm: 'charm' }[item.slot];
    if (item.kind === 'food') return 'food';
    if (item.kind === 'trophy') return 'spark';
    const key = `${item.id || ''} ${item.name || ''}`;
    if (/(?:^|-)(?:wood|plank)$/.test(item.id || '') || /목재|나무|가지|장작|판재/.test(item.name || '')) return 'wood';
    if (/(?:^|-)(?:ore|ingot|stone)$/.test(item.id || '') || /광석|철|강철|주괴|정수|수정/.test(item.name || '')) return 'ore';
    if (/(?:^|-)hide$/.test(item.id || '') || /가죽|모피/.test(item.name || '')) return 'paw';
    if (/fish|물고기|송어|장어|청어|은어|어류|생선/.test(key)) return 'fish';
    if (/(?:^|-)raw$/.test(item.id || '')) return 'food';
    return 'leaf';
  };
  const symbol = (item, small = false) => `<span class="item-symbol ${esc(item?.kind || 'material')} ${small ? 'small' : ''}">${icon(itemIcon(item))}</span>`;
  const stateStats = (state) => getDerivedStats(state, data);
  const availability = (state, type, id) => getActivityAvailability(state, data, type, id);
  const stateSkill = (state, id) => state.skills?.[id] || { xp: 0, level: 1 };
  const countFood = (state, quality = 0) => data.items.filter(item => item.kind === 'food' && (item.quality || 0) >= quality).reduce((total, item) => total + (state.inventory[item.id] || 0), 0);
  const tokens = (map = {}, state, inputs = false, clickable = false, reserved = null, scope = 'region') => `<div class="item-tokens">${Object.entries(map).map(([id, qty]) => {
    const item = items[id]; const stock = state.inventory[id] || 0;
    const held = reserved?.[id] || 0;
    const insufficient = inputs && stock < qty && held < qty;
    const content = `${icon(itemIcon(item))}<span>${esc(item?.name || id)} <strong>${inputs ? held >= qty ? `${num(held)} 예약` : `${num(stock)}/${num(qty)}` : `×${num(qty)}`}</strong>${inputs&&held>=qty?`<small>추가 재고 ${num(stock)}</small>`:''}</span>`;
    return clickable ? `<button class="item-token ${insufficient ? 'insufficient' : ''} ${held>=qty?'reserved':''}" data-action="find-item" data-id="${esc(id)}" data-focus-key="item-${esc(scope)}-${esc(id)}" title="${esc(item?.name || id)} 준비할 활동 보기">${content}</button>` : `<span class="item-token ${insufficient ? 'insufficient' : ''}">${content}</span>`;
  }).join('')}</div>`;
  const meter = (value, max, cls = '') => `<div class="meter ${cls}"><span style="width:${percent(value, max)}%"></span></div>`;
  const setHTML = (element, html) => {
    if (element._html === html) return;
    const focused = document.activeElement;
    const focusKey = element.contains(focused) ? focused?.dataset?.focusKey : null;
    const openDetails = new Map([...element.querySelectorAll('details[data-detail-key]')].map(detail=>[detail.dataset.detailKey,detail.open]));
    const inputValue = focusKey && focused.matches('input:not([type=checkbox]),textarea') ? focused.value : null;
    const selection = inputValue !== null && focused.selectionStart !== null ? [focused.selectionStart,focused.selectionEnd] : null;
    const preservedArena = element.querySelector('.battle-arena');
    element.innerHTML = html;
    element.querySelectorAll('details[data-detail-key]').forEach(detail=>{if(openDetails.has(detail.dataset.detailKey))detail.open=openDetails.get(detail.dataset.detailKey);});
    element.querySelectorAll('[data-action]:not([data-focus-key]),summary:not([data-focus-key])').forEach((control,index)=>{
      control.dataset.focusKey = `${element.classList[0]}-${control.dataset.action||'details'}-${control.dataset.id||control.dataset.page||control.closest('[data-detail-key]')?.dataset.detailKey||index}`;
    });
    const newArena = element.querySelector('.battle-arena');
    if (preservedArena && newArena && preservedArena.dataset.battleKey === newArena.dataset.battleKey) newArena.replaceWith(preservedArena);
    element._html = html;
    if (focusKey) {
      const replacement = element.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (replacement && inputValue !== null) replacement.value = inputValue;
      replacement?.focus({ preventScroll: true });
      if (replacement && selection) replacement.setSelectionRange?.(...selection);
    }
  };

  app.innerHTML = `<div class="game-shell">
    <button class="mobile-overlay" data-action="close-menu" aria-label="메뉴 닫기"></button>
    <aside id="game-menu" class="sidebar" aria-label="게임 메뉴"><div class="brand"><div class="brand-mark" aria-hidden="true">${icon('fire')}</div><div class="brand-name"><span>북방의</span><span>마지막 봉화</span></div></div>
      <nav class="nav"></nav><div class="sidebar-spacer"></div><div class="hero-panel"></div>
    </aside>
    <div class="workspace"><header class="topbar"></header><div class="workspace-body"><main id="main-content" class="page-content" tabindex="-1"></main><aside class="context-sidebar" aria-label="보급과 야영 상태"></aside></div></div>
    <div class="activity-dock" aria-label="현재 진행하는 활동"></div>
    <div class="toast-stack" role="status" aria-live="polite"></div><div class="modal-container"></div>
    <input class="sr-only" id="save-import" type="file" accept="application/json,.json" aria-label="저장 파일 선택" />
  </div>`;
  const shell = app.querySelector('.game-shell');
  const sidebar = app.querySelector('.sidebar');
  const mobileMedia = matchMedia('(max-width: 760px)');
  const refs = Object.fromEntries(['nav', 'hero-panel', 'topbar', 'page-content', 'context-sidebar', 'activity-dock', 'toast-stack', 'modal-container'].map(key => [key, app.querySelector(`.${key}`)]));
  const syncInert = () => {
    const modalOpen = summaryData !== null || resetPrompt;
    const drawerOpen = mobileMedia.matches && menuOpen;
    sidebar.inert = modalOpen || (mobileMedia.matches && !menuOpen);
    app.querySelector('.workspace').inert = modalOpen || drawerOpen;
    refs['activity-dock'].inert = modalOpen || drawerOpen;
    app.querySelector('.mobile-overlay').inert = modalOpen;
  };
  document.title = data.meta?.title || '북방의 마지막 봉화';

  const heading = (label, title, description, badge = '') => `<div class="page-heading"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${badge ? `<span class="subtle-badge">${badge}</span>` : ''}</div>`;
  const sourceFor = (itemId, state) => {
    const gather = data.activities.find(a => a.outputs?.[itemId] && state.unlockedRegions.includes(a.regionId));
    if (gather) return { page: 'gather', record: gather };
    const craft = data.recipes.find(r => r.outputs?.[itemId] && state.unlockedRegions.includes(r.regionId));
    if (craft) return { page: 'craft', record: craft };
    const any = data.activities.find(a => a.outputs?.[itemId]);
    return any ? { page: 'gather', record: any } : null;
  };
  const nextPreparation = (state, region = regions[state.regionId]) => {
    const stats = stateStats(state);
    const requirements = getRegionRequirements(state, data, region.id);
    const weaponRecipe = data.recipes.find(recipe => recipe.regionId === region.id && Object.keys(recipe.outputs || {}).some(id => items[id]?.slot === 'weapon'));
    const armorRecipe = data.recipes.find(recipe => recipe.regionId === region.id && Object.keys(recipe.outputs || {}).some(id => items[id]?.slot === 'armor'));
    const foodRecipe = data.recipes.find(recipe => recipe.regionId === region.id && Object.keys(recipe.outputs || {}).some(id => items[id]?.kind === 'food'));
    if (!state.equipment.weapon && weaponRecipe) return { title: '무기 없음', page: 'craft', record: weaponRecipe, label: '무기 제작' };
    if (countFood(state,region.foodQuality) < region.foodCost && foodRecipe) return { title: `식량 부족 · 품질 ${region.foodQuality}`, page: 'craft', record: foodRecipe, label: '음식 제작' };
    if (!requirements.ok && (weaponRecipe || armorRecipe)) return { title: requirements.missing?.join(' · ') || '장비 조건 미충족', page: 'craft', record: stats.attack < (region.requirements?.attack || 0) ? weaponRecipe : armorRecipe, label: '제작' };
    return null;
  };

  function renderNav(state) {
    return NAV.map(([id, name, label]) => `${id === 'settings' ? '<div class="nav-divider"></div>' : ''}<button class="nav-button ${page === id ? 'active' : ''}" data-action="navigate" data-page="${id}" data-focus-key="nav-${id}" ${page === id ? 'aria-current="page"' : ''}>${icon(name)}<span>${label}</span>${id === 'explore' ? `<span class="nav-count">${state.clearedRegions.length} / ${data.regions.length}</span>` : ''}</button>`).join('');
  }
  function renderHero(state, stats) {
    return `<div class="hero-summary">${portrait('hero', 'hero-avatar', '북방을 여행하는 주인공')}<div><div class="hero-name">북방의 여행자</div><div class="hero-caption">${esc(PHASES[state.phase])}</div><div class="hero-level">전투 숙련 Lv. ${stateSkill(state, 'combat').level}</div></div></div>
      <div class="meter-label"><span>체력</span><strong>${num(state.hp)} / ${num(stats.maxHp)}</strong></div>${meter(state.hp, stats.maxHp, 'hp')}
      <div class="hero-statline"><span>${icon('sword')} 공격</span><strong>${statNum(stats.attack)}</strong></div><div class="hero-statline"><span>${icon('shield')} 방어</span><strong>${statNum(stats.defense)}</strong></div><div class="hero-statline"><span>${icon('snow')} 보온</span><strong>${statNum(stats.warmth)}</strong></div>`;
  }
  function renderTopbar(state) {
    const save = actions.getSaveStatus?.() || {};
    const status = save.blocked ? '저장 확인 필요' : save.failed ? '저장 오류' : '자동 저장';
    const stats = stateStats(state);
    return `<div class="topbar-left"><button class="mobile-menu" data-action="toggle-menu" data-focus-key="mobile-menu" aria-label="게임 메뉴 열기" aria-expanded="${menuOpen}" aria-controls="game-menu">${icon('menu')}</button><div class="hud-player">${portrait('hero','hud-avatar','북방의 여행자')}<span class="hud-level">${stateSkill(state,'combat').level}</span><div class="hud-player-info"><strong>북방의 여행자</strong><div class="hud-hp"><span>${icon('heart')}${num(state.hp)} / ${num(stats.maxHp)}</span>${meter(state.hp,stats.maxHp,'hp')}</div></div></div><div class="hud-location"><strong>${esc(regions[state.regionId]?.name)}</strong><span>${esc(PHASES[state.phase])} · ${status}</span></div></div>
      <div class="topbar-right"><button class="hud-resource" data-action="food-prepare" data-focus-key="hud-food" aria-label="식량 ${num(countFood(state))}개, 보급 제작">${icon('food')}<span><strong>${num(countFood(state))}</strong><small>식량</small></span></button><div class="hud-threat ${state.phase==='defending'?'warning':''}">${icon('shield')}<span><strong>${state.phase==='defending'?'수비 중':state.phase==='recovering'?'회복 중':timecode(state.nextRaidAt-state.time)}</strong><small>${state.phase==='defending'?'야영지 습격':'다음 습격'}</small></span></div><button class="icon-button hud-settings" data-action="navigate" data-page="settings" data-focus-key="hud-settings" aria-label="설정 열기">${icon('gear')}</button></div>`;
  }

  function renderExplore(state, stats) {
    const region = regions[selectedRegion] || regions[state.regionId];
    const unlocked = state.unlockedRegions.includes(region.id);
    const cleared = state.clearedRegions.includes(region.id);
    const allowed = availability(state, 'explore', region.id);
    const battling = Boolean(state.battle);
    const here = region.id === state.regionId;
    const activityHere = state.activity?.type === 'explore' && state.activity.regionId === region.id;
    const next = nextPreparation(state, region);
    const boss = enemies[region.bossId];
    const regionNames = ['해안','침엽림','호수','습지','산맥','유적'];
    const requirementsHTML = Object.entries(region.requirements || {}).filter(([,value]) => Number(value) > 0).map(([key, value]) => {
      const actual = key === 'combatLevel' ? stateSkill(state, 'combat').level : stats[key] || 0;
      return `<span class="requirement ${actual < value ? 'missing' : ''}">${icon(key === 'attack' ? 'sword' : key === 'defense' ? 'shield' : key === 'warmth' ? 'snow' : 'spark')}<span>${esc(STAT_LABELS[key] || key)} <strong>${statNum(actual)} / ${statNum(value)}</strong></span></span>`;
    }).join('');
    let result = heading('', '탐험', '', `${icon('fire')} 봉화 ${state.clearedRegions.length} / ${data.regions.length}`);
    if (state.completed) result += `<section class="panel ending-panel">${icon('fire','ending-fire')}<div><h2>${esc(data.meta?.endingTitle || '북방에 다시 아침이 온다')}</h2><span class="subtle-badge gold">${icon('check')} 여정 완료 · 반복 탐험 가능</span></div></section>`;
    if (state.battle) result += renderBattle(state, stats);
    result += `<section class="region-scene ${!unlocked?'unexplored':''}" style="--region-bg:url('${esc(regionAsset(region.id))}')">${regionAsset(region.id) ? `<img class="scene-image" src="${esc(regionAsset(region.id))}" alt="${esc(region.name)}의 설원 풍경" />` : ''}
      <div class="scene-top"><div class="scene-name"><span class="chapter-tag">${region.index+1}장</span><div><h2>${esc(region.name)}</h2></div></div><span class="scene-state ${cleared?'cleared':''}">${icon(cleared?'check':unlocked?'compass':'lock')}${cleared?'돌파 완료':unlocked?(here?'현재 지역':'탐험 가능'):'미개방'}</span></div>
      <div class="scene-characters"><div class="scene-traveler">${portrait('hero','scene-hero-art','북방의 여행자')}<span class="character-nameplate">여행자 <strong>Lv.${stateSkill(state,'combat').level}</strong></span></div><div class="scene-boss">${portrait(unlocked?boss?.art:'guardian','scene-boss-art',unlocked?boss?.name:'미지의 위협')}<span class="boss-nameplate"><small>마지막 위협</small>${unlocked?esc(boss?.name):'아직 닿지 않은 길'}</span></div></div>
      <div class="scene-bottom"><div class="region-route" aria-label="북방 지역 선택">${data.regions.map(r=>`<button class="route-stop ${r.id===region.id?'active':''} ${state.clearedRegions.includes(r.id)?'cleared':''} ${!state.unlockedRegions.includes(r.id)?'locked':''}" data-action="region" data-id="${esc(r.id)}" data-focus-key="region-${esc(r.id)}" aria-label="${esc(r.name)}, ${state.clearedRegions.includes(r.id)?'돌파 완료':state.unlockedRegions.includes(r.id)?'탐험 가능':'미해금'}" aria-pressed="${r.id===region.id}"><span class="route-circle">${state.clearedRegions.includes(r.id)?icon('check'):!state.unlockedRegions.includes(r.id)?icon('lock'):r.index+1}</span><span>${regionNames[r.index]||esc(r.name)}</span></button>`).join('')}</div>
      <div class="scene-controls"><div class="scene-conditions"><div class="requirements">${requirementsHTML}<span class="requirement ${countFood(state,region.foodQuality)<region.foodCost?'missing':''}">${icon('food')}<span>품질 ${region.foodQuality}<strong>${num(countFood(state,region.foodQuality))} / ${region.foodCost}</strong></span></span></div><p>${activityHere?`탐험 중 · ${state.activity.encounters} / ${region.encountersToBoss} 조우`:!unlocked?`${esc(data.regions[Math.max(0,region.index-1)]?.name)} 돌파 필요`:!allowed.ok?esc(allowed.message):`조우마다 식량 ${region.foodCost}개 · ${cleared?'오프라인 가능':'첫 돌파 · 접속 중'}`}</p></div><button class="button primary scene-explore-button" data-action="explore" data-id="${esc(region.id)}" data-focus-key="explore-${esc(region.id)}" ${!allowed.ok||activityHere||battling?'disabled':''}>${icon(activityHere?'compass':'sword')}${activityHere?'탐험 중':cleared?'반복 탐험':'탐험 시작'}</button></div></div></section>`;
    if (next && unlocked && !activityHere && !battling) result += `<section class="quest-strip">${icon('fire')}<div><strong>${esc(next.title)}</strong></div><button class="button small" data-action="prepare" data-page="${next.page}" data-id="${esc(next.record?.id||'')}" data-region="${esc(next.regionId||next.record?.regionId||region.id)}">${esc(next.label)} ${icon('arrow')}</button></section>`;
    result += `<details class="region-information" data-detail-key="region-${esc(region.id)}"><summary>${icon('book')}지역 정보</summary><div class="explore-details"><section class="detail-card"><h3>${icon('paw')}야생의 위협</h3><p>${(region.enemyIds||[]).map(id=>esc(enemies[id]?.name)).join(' · ')}</p></section><section class="detail-card"><h3>${icon('leaf')}채집 재료</h3>${tokens(Object.fromEntries(data.activities.filter(a=>a.regionId===region.id).flatMap(a=>Object.entries(a.outputs||{})).slice(0,3)),state,false,true)}</section></div>${unlocked&&!here&&!state.battle&&state.phase!=='recovering'?`<button class="button small quiet" data-action="travel" data-id="${esc(region.id)}">이 지역으로 이동</button>`:''}</details>`;
    return result;
  }

  function renderBattle(state, stats) {
    const battle = state.battle;
    const enemy = enemies[battle.enemyId];
    if (!enemy) return '';
    const style = data.combatStyles?.find(record=>record.id===state.combatStyle) || data.combatStyles?.[0];
    const actorCard = (isEnemy) => {
      return `<div class="battle-fighter ${isEnemy ? 'enemy-fighter' : 'player-fighter'}" data-fighter="${isEnemy ? 'enemy' : 'player'}">${portrait(isEnemy ? enemy.art : 'hero', 'fighter-portrait', isEnemy ? enemy.name : '북방의 여행자')}<div class="fighter-details"><div class="fighter-kind">${isEnemy ? battle.kind === 'boss' ? '보스' : battle.kind === 'raid' ? '습격' : '야생' : '여행자'}</div><div class="fighter-name">${esc(isEnemy ? enemy.name : '북방의 여행자')}</div><div class="fighter-bars"><div class="meter-label"><span>체력</span><strong data-battle-value="hp"></strong></div><div class="meter ${isEnemy ? 'enemy-hp' : 'hp'}"><span data-battle-value="hp-bar"></span></div><div class="meter-label"><span>${isEnemy ? '다음 공격' : '다음 행동'}</span><strong data-battle-value="next"></strong></div><div class="meter gold"><span data-battle-value="action-bar"></span></div>${!isEnemy && style ? `<div class="battle-skill">${icon('spark')}<span>${esc(style.skillName)}</span><strong data-battle-value="skill-count"></strong></div>`:''}</div></div></div>`;
    };
    return `<section class="panel battle-panel"><div class="panel-heading"><span class="panel-title">${icon('sword')}${battle.kind === 'raid' ? '야영지 자동 수비' : battle.kind === 'boss' ? '마지막 위협과의 조우' : '길 위의 조우'}</span><span class="subtle-badge ${battle.kind === 'raid' ? 'gold' : ''}">${icon('eye')}자동전투 관전</span></div><div class="battle-arena" data-battle-key="${esc(battle.enemyId)}-${battle.startedAt}" ${regionAsset(state.regionId) ? `style="--battle-bg:url('${esc(regionAsset(state.regionId))}')"` : ''}>${actorCard(true)}<div class="battle-center"><span class="crossed">${icon('sword')}</span><div><p data-battle-value="last-action">대기</p></div></div>${actorCard(false)}</div><div class="battle-footer">${battle.kind === 'raid'?'<span>수비 후 활동 재개</span>':''}<span>${esc(data.combatStyles?.find(style=>style.id===state.combatStyle)?.name || '균형')} 태세 · 치명타 ${Math.round(stats.critChance * 100)}%</span></div></section>`;
  }

  function updateBattle(state, stats) {
    const battle = state.battle;
    if (!battle || page !== 'explore') return;
    const enemy = enemies[battle.enemyId];
    for (const actor of ['enemy', 'player']) {
      const fighter = refs['page-content'].querySelector(`[data-fighter="${actor}"]`);
      if (!fighter) continue;
      const isEnemy = actor === 'enemy';
      const hp = isEnemy ? battle.enemyHp : state.hp;
      const maxHp = isEnemy ? battle.enemyMaxHp : stats.maxHp;
      const period = isEnemy ? battle.enemyAttackMs || enemy.attackMs : battle.playerAttackMs || stats.attackMs;
      const nextAt = isEnemy ? battle.nextEnemyAt : battle.nextPlayerAt;
      const progress = Math.max(0,period-Math.max(0,nextAt-state.time));
      fighter.querySelector('[data-battle-value="hp"]').textContent = `${num(hp)} / ${num(maxHp)}`;
      fighter.querySelector('[data-battle-value="hp-bar"]').style.width = `${percent(hp,maxHp)}%`;
      fighter.querySelector('[data-battle-value="next"]').textContent = duration(Math.max(0,nextAt-state.time));
      fighter.querySelector('[data-battle-value="action-bar"]').style.width = `${percent(progress,period)}%`;
    }
    const last = battle.lastAction;
    const text = last ? `${last.actor === 'player' ? '여행자' : enemy.name}의 ${last.skill || (last.critical ? '치명타' : '공격')} · ${num(last.damage)} 피해` : '대기';
    refs['page-content'].querySelector('[data-battle-value="last-action"]').textContent = text;
    const style = data.combatStyles?.find(record=>record.id===state.combatStyle) || data.combatStyles?.[0];
    const skillCount = refs['page-content'].querySelector('[data-battle-value="skill-count"]');
    if (skillCount && style) skillCount.textContent = `${battle.playerTurns % style.skillEvery} / ${style.skillEvery}`;
  }

  function renderWork(state, type) {
    const isCraft = type === 'craft';
    const records = isCraft ? data.recipes : data.activities;
    const filtered = records.filter(record => filter === 'all' || record.regionId === filter);
    const anySelected = state.activity?.type === type;
    let html = heading('', isCraft ? '제작' : '채집', '');
    html += `<div class="filter-row" aria-label="지역별 활동 보기"><button class="filter-button ${filter === 'all' ? 'active' : ''}" data-action="filter" data-id="all">모든 지역</button>${data.regions.map(region => `<button class="filter-button ${filter === region.id ? 'active' : ''}" data-action="filter" data-id="${esc(region.id)}">${!state.unlockedRegions.includes(region.id) ? icon('lock') : ''}${esc(region.name)}</button>`).join('')}</div>`;
    if (anySelected) html += `<div class="readiness"><div><h3>${icon(isCraft ? 'hammer' : 'leaf')}${esc(records.find(record => record.id === state.activity.id)?.name)} 진행 중</h3>${state.phase === 'defending'?'<p>수비 후 재개</p>':state.phase === 'recovering'?`<p>회복 ${duration(state.recoveryUntil-state.time)}</p>`:''}</div><button class="button quiet small" data-action="stop" ${state.phase === 'defending' || state.phase === 'recovering' ? 'disabled' : ''}>마치기</button></div>`;
    html += `<div class="cards-grid">${filtered.map(record => {
      const firstOutput = items[Object.keys(record.outputs || {})[0]];
      const unlocked = state.unlockedRegions.includes(record.regionId);
      const current = state.activity?.type === type && state.activity.id === record.id;
      const available = availability(state, type, record.id);
      const skill = stateSkill(state, record.skillId);
      const reserved = current&&isCraft?state.activity.reserved:null;
      const needsNextInputs = current&&isCraft&&state.activity.remaining!==1&&Object.entries(record.inputs||{}).some(([itemId,amount])=>(state.inventory[itemId]||0)<amount);
      const note = current&&needsNextInputs?'다음 재료 부족':!current&&!available.ok?available.message:'';
      return `<article class="panel work-card ${isCraft?'craft-card':'gather-card'} ${!unlocked ? 'locked' : ''} ${current || highlightedId === record.id ? 'current' : ''}" data-record-id="${esc(record.id)}" tabindex="-1"><div class="card-top"><span class="card-duration">${icon('clock')}${current?duration(state.activity.durationMs):'기본 '+duration(record.durationMs)}</span><span class="subtle-badge ${current?'green':''}">${current?'진행 중':esc(skills[record.skillId]?.name||'')} Lv.${skill.level}</span></div><div class="work-item-display">${symbol(firstOutput)}<h3>${esc(record.name)}</h3><small>${esc(regions[record.regionId]?.name)}</small></div><div class="recipe-result">${tokens(record.outputs,state,false,false)}</div>${isCraft?`<div class="recipe-label">${reserved?'예약 재료':'재료'}</div>${tokens(record.inputs,state,true,true,reserved,record.id)}`:''}${firstOutput?.kind==='equipment'?`<div class="stats-line">${formatStats(firstOutput.stats)}</div>`:firstOutput?.kind==='food'?`<div class="stats-line">${icon('heart')}회복 +${num(firstOutput.heal)} · 품질 ${firstOutput.quality}</div>`:''}${renderWorkMastery(state,record.id)}<div class="card-foot">${isCraft?`<div class="quantity-row"><label class="sr-only" for="count-${esc(record.id)}">${esc(record.name)} 제작 횟수</label><select id="count-${esc(record.id)}" data-action="count" data-id="${esc(record.id)}" data-focus-key="count-${esc(record.id)}">${[[0,'재료가 있는 동안 반복'],[1,'1회 제작'],[5,'5회 제작'],[10,'10회 제작']].map(([n,label])=>`<option value="${n}" ${Number(selectCounts[record.id]||0)===n?'selected':''}>${label}</option>`).join('')}</select></div>`:''}<button class="button ${current?'quiet':'primary'} wide" data-action="${type}" data-id="${esc(record.id)}" data-focus-key="start-${esc(record.id)}" ${!available.ok||current?'disabled':''}>${icon(current?'check':isCraft?'hammer':'leaf')}${current?'진행 중':isCraft?'제작':'채집'}</button>${note?`<div class="card-note">${esc(note)}</div>`:''}</div></article>`;
    }).join('')}</div>`;
    return html;
  }
  function formatStats(stats = {}) {
    return Object.entries(stats).filter(([key, value]) => value && STAT_LABELS[key]).map(([key, value]) => `<span>${esc(STAT_LABELS[key])} +${key === 'critChance' ? `${Math.round(value * 100)}%` : statNum(value)}</span>`).join('');
  }

  function renderEquipment(state, stats) {
    const equipment = data.items.filter(item => item.kind === 'equipment');
    let html = heading('', '장비', '');
    html += `<section class="hero-loadout" style="--region-bg:url('${esc(regionAsset(state.regionId))}')"><div class="loadout-character"><h2>북방의 여행자 <span>Lv.${stateSkill(state,'combat').level}</span></h2>${portrait('hero','loadout-hero-art','북방의 여행자')}<div class="loadout-rank">${icon('fire')}봉화 ${state.clearedRegions.length} / 6</div></div><div class="equipped-strip">${Object.entries(SLOT_LABELS).map(([slot,label])=>{const item=items[state.equipment[slot]];return `<div class="equipment-slot">${symbol(item||{slot})}<div><small>${label}</small><strong>${esc(item?.name||'빈 슬롯')}</strong><div class="stats-line">${formatStats(item?.stats)}</div></div></div>`;}).join('')}</div><div class="equipment-summary">${[['attack','sword'],['defense','shield'],['warmth','snow'],['maxHp','heart']].map(([key,name])=>`<div class="equipment-stat">${icon(name)}<div><strong class="stat-value">${statNum(stats[key])}</strong><span class="stat-label">${STAT_LABELS[key]}</span></div></div>`).join('')}</div></section>`;
    html += `<section class="panel stance-panel"><div class="panel-heading"><span class="panel-title">${icon('sword')}전투 태세</span><span class="muted">전투 전 선택</span></div><div class="panel-body"><div class="stance-grid">${(data.combatStyles || []).map(style=>`<button class="stance-button ${style.id===state.combatStyle?'active':''}" data-action="combat-style" data-id="${esc(style.id)}" data-focus-key="style-${esc(style.id)}" aria-pressed="${style.id===state.combatStyle}" ${state.battle || state.phase==='recovering' ? 'disabled':''}><strong>${icon(style.id==='guard'?'shield':'sword')}${esc(style.name)}</strong><span>공격 ×${exactNum(style.attackMultiplier)} · 방어 ×${exactNum(style.defenseMultiplier)}${style.attackMs?` · 간격 +${exactNum(style.attackMs/1000)}초`:''}</span><small>${style.skillEvery}타 · ${esc(style.skillName)} · ×${exactNum(style.skillDamage)}${style.guardMultiplier<1?` · 다음 피해 ×${exactNum(style.guardMultiplier)}`:''}</small></button>`).join('')}</div></div></section>`;
    const owned = equipment.filter(item => state.inventory[item.id] > 0 || state.equipment[item.slot] === item.id);
    html += `<div class="section-label"><h2>보유 장비</h2><span>${owned.length} / ${equipment.length}종</span></div>`;
    if (!owned.length) html += `<div class="empty-state">${icon('sword')}<p>보유 장비 없음</p><button class="button primary" data-action="navigate" data-page="craft">제작 ${icon('arrow')}</button></div>`;
    else html += `<div class="cards-grid">${owned.map(item => {
      const equipped = state.equipment[item.slot] === item.id;
      return `<article class="panel work-card ${equipped ? 'current' : ''}"><div class="card-top"><div class="card-title-row">${symbol(item)}<div><h3>${esc(item.name)}</h3><small>${esc(SLOT_LABELS[item.slot])}</small></div></div>${equipped ? `<span class="subtle-badge green">${icon('check')}장착</span>` : `<span class="card-duration">보유 ${num(state.inventory[item.id])}</span>`}</div><div class="stats-line">${formatStats(item.stats)}</div><div class="card-foot"><button class="button ${equipped ? 'quiet' : 'primary'} wide" data-action="equip" data-id="${esc(item.id)}" ${equipped || state.phase === 'defending' || state.phase === 'recovering' || Boolean(state.battle) ? 'disabled' : ''}>${icon(equipped ? 'check' : 'shield')}${equipped ? '장착 중' : '장착'}</button>${state.battle ? '<p class="card-note">전투 중 교체 불가</p>' : ''}</div></article>`;
    }).join('')}</div>`;
    const nextGear = (regions[state.regionId]?.recommendedGear||[]).map(id=>items[id]).filter(item=>item&&!owned.includes(item));
    if(nextGear.length)html += `<div class="section-label"><h2>추천 장비</h2><button class="text-button" data-action="navigate" data-page="craft">제작법 ${icon('arrow')}</button></div><div class="cards-grid">${nextGear.map(item=>`<article class="panel work-card"><div class="card-title-row">${symbol(item)}<div><h3>${esc(item.name)}</h3><small>${esc(SLOT_LABELS[item.slot])}</small></div></div><div class="stats-line">${formatStats(item.stats)}</div><div class="card-foot"><button class="button wide" data-action="find-item" data-id="${esc(item.id)}">제작 준비</button></div></article>`).join('')}</div>`;
    return html;
  }

  const townResources = byId(data.town?.resources);
  const townBuildings = byId(data.town?.buildings);
  const townTrades = byId(data.town?.trades);
  const townAvailability = (state, value) => expansion.getTownActionAvailability(state,data,value);
  const bps = (value) => `${statNum((value||0)/100)}%`;
  const townInput = (key,fallback) => townInputs[key] ?? fallback;
  const townNumber = (key,fallback=1) => Number(townInput(key,fallback));
  const coinToken = (value) => `<span class="town-coin">${icon('spark')}<strong>${num(value)}</strong> 코인</span>`;
  const resourceTokens = (map={},state,{cost=false,clickable=false,scope='town'}={}) => `<div class="item-tokens town-resource-tokens">${Object.entries(map).map(([id,amount])=>{
    const record=townResources[id]; const stock=state.town?.resources[id]||0;
    const label=`${icon(record?.icon||'spark')}<span>${esc(record?.name||id)} <strong>${cost?`${num(stock)} / ${statNum(amount)}`:`×${statNum(amount)}`}</strong></span>`;
    return clickable?`<button class="item-token ${cost&&stock<amount?'insufficient':''}" data-action="town-find-resource" data-id="${esc(id)}" data-focus-key="resource-${esc(scope)}-${esc(id)}">${label}</button>`:`<span class="item-token">${label}</span>`;
  }).join('')}</div>`;
  const townBudget = (cost={},state,scope='cost',reserved=false) => `<div class="town-budget">${resourceTokens(cost.resources,state,{cost:!reserved,clickable:!reserved,scope})}${tokens(cost.items||{},state,!reserved,!reserved,null,scope)}${cost.coins?`<span class="item-token ${!reserved&&(state.town?.coins||0)<cost.coins?'insufficient':''}">${coinToken(cost.coins)}${!reserved?`<small>보유 ${num(state.town?.coins)}</small>`:''}</span>`:''}</div>`;
  function buildingArt(record,level) {
    const tones={camp:['#91b8d4','#587794'],wood:['#cb9b66','#956e4d'],ore:['#92a4b7','#60768f'],leaf:['#97c2a0','#568477'],food:['#e5af70','#ad7650'],hammer:['#9ba6bd','#627594'],backpack:['#bda07b','#886e59'],book:['#98a9d4','#657caf'],shield:['#8eb7ca','#557e99'],spark:['#d0b17b','#8d7658']};
    const [roof,edge]=tones[record.icon]||tones.camp;
    const chimney=/smith|kitchen|forge|healer/.test(record.id);
    return `<svg class="building-art" viewBox="0 0 112 100" aria-hidden="true"><ellipse cx="56" cy="87" rx="46" ry="10" fill="#426c8833"/><path d="m14 75 44 14 42-18-42-13Z" fill="#d5ecf2" stroke="#8bafb9" stroke-width="2"/><path d="m19 40 37-14 35 18v33L56 90 19 77Z" fill="#f2dfb6" stroke="#516e84" stroke-width="2"/><path d="m56 56 35-12v33L56 90Z" fill="#c4bda7"/><path d="m7 43 49-29 48 29-48 20Z" fill="${roof}" stroke="${edge}" stroke-width="3"/><path d="m7 42 49-29 47 29-14 3-33-19-34 20Z" fill="#ecf6f0" stroke="#a6bec6" stroke-width="1.5"/><path d="m56 62 48-19v7L56 69 7 50v-7Z" fill="${edge}"/><path d="m28 60 14 4v18l-14-4Z" fill="#718ba0" stroke="#536b7d" stroke-width="1.5"/><path d="m64 66 16-5v12l-16 5Z" fill="#ffe2a0" stroke="#728599" stroke-width="2"/><path d="m72 63 0 12M65 71l14-4" stroke="#8a9caf" stroke-width="1.5"/>${chimney?'<path d="m76 19 10-4 0 21-10 4Z" fill="#a9b9c5" stroke="#6c8195" stroke-width="2"/><path d="m73 17 12-5 4 4-12 5Z" fill="#f1f7f2"/>':''}${level===0?'<path d="m15 84 9-2 5 10-9 2Zm70-5 12-4 5 10-12 4Z" fill="#c5ae85" stroke="#8d7c64"/>':''}</svg><span class="building-sign">${icon(record.icon||'camp')}</span>`;
  }
  const buildingEffects = (effects={},state,scope='effects') => `<div class="town-effects">${Object.keys(effects.outputs||{}).length?`<div><small>기본 생산/분</small>${resourceTokens(effects.outputs,state,{scope})}</div>`:''}${Object.keys(effects.inputs||{}).length?`<div><small>소모/분</small>${resourceTokens(effects.inputs,state,{scope,cost:true,clickable:true})}</div>`:''}<div class="stats-line">${[['storage','창고 용량'],['populationCapacity','주민 정원'],['health','건강'],['happiness','행복'],['education','교육']].filter(([key])=>effects[key]).map(([key,label])=>`<span>${label} +${statNum(effects[key])}</span>`).join('')}${formatStats(effects.bonuses)}${effects.bonuses?.workSpeedBps?`<span>채집·제작 시간 −${bps(effects.bonuses.workSpeedBps)}</span>`:''}</div></div>`;
  function renderTown(state) {
    if(!state.town||!expansion.getTownStats)return heading('','봉화 마을','마을 정보 오류');
    const stats=expansion.getTownStats(state,data);
    selectedBuilding = stats.buildings.some(b=>b.id===selectedBuilding)?selectedBuilding:stats.buildings[0]?.id;
    let html=heading('','봉화 마을','',`${icon('fire')}Lv.${stats.level}`);
    html+=`<section class="town-overview"><div class="town-production">${icon('clock')}다음 생산 <strong>${duration(stats.nextTickAt-state.time)}</strong></div><div class="town-statuses">${[['주민',`${num(stats.population)} / ${num(stats.populationCapacity)}`,'camp'],['코인',num(stats.coins),'spark'],['생산 효율',bps(stats.efficiencyBps),'gear'],['건강',num(stats.health),'heart'],['행복',num(stats.happiness),'fire'],['교육',num(stats.education),'book']].map(([label,value,symbol])=>`<div>${icon(symbol)}<span>${label}<strong>${value}</strong></span></div>`).join('')}</div><div class="town-experience"><span>${icon('spark')}마을 경험치</span>${stats.nextLevelXp!==null?`${meter(stats.progressXp,stats.progressMaxXp)}<strong>다음 단계까지 ${num(stats.nextLevelXp-stats.xp)}</strong>`:'<strong>최고 단계</strong>'}</div></section>`;
    html+=`<nav class="town-tabs" aria-label="마을 운영 메뉴">${[['buildings','camp','시설'],['storage','backpack','창고'],['trade','compass','교역'],['supply','food','보급'],['farm','leaf','농사'],['objectives','scroll','의뢰']].map(([id,symbol,label])=>`<button class="town-tab ${townTab===id?'active':''}" data-action="town-tab" data-id="${id}" data-focus-key="town-tab-${id}" ${townTab===id?'aria-current="page"':''}>${icon(symbol)}${label}</button>`).join('')}</nav>`;
    const renderers={buildings:renderTownBuildings,storage:renderTownStorage,trade:renderTownTrade,supply:renderTownSupply,farm:renderTownFarm,objectives:renderTownObjectives};
    html+=renderers[townTab](state,stats);
    return html;
  }
  function renderTownBuildings(state,stats) {
    const building=stats.buildings.find(b=>b.id===selectedBuilding); const record=townBuildings[building.id];
    const queue=stats.construction; const active=queue?.buildingId===building.id;
    const available=building.upgradeAvailability;
    let html=`<section class="town-map" style="--town-bg:url('${esc(assets['town-village']||regionAsset('rime-shore'))}')"><div class="town-buildings">${stats.buildings.map(b=>{
      const r=townBuildings[b.id]; const queued=queue?.buildingId===b.id;
      return `<button class="town-building ${selectedBuilding===b.id?'selected':''} ${b.level===0?'unbuilt':''} ${b.unlockMessage?'locked':''}" data-action="town-building" data-id="${esc(b.id)}" data-focus-key="building-${esc(b.id)}" aria-pressed="${selectedBuilding===b.id}" aria-label="${esc(b.name)}, ${queued?'건설 중':b.level?`레벨 ${b.level}`:'미건설'}">${buildingArt(r,b.level)}<strong>${esc(b.name)}</strong><small>${queued?'건설 중':b.level?`Lv.${b.level} · 상태 ${bps(b.conditionBps)}`:b.unlockMessage?'잠금':'건설 가능'}</small></button>`;
    }).join('')}</div></section>`;
    if(queue)html+=`<section class="construction-strip">${icon('hammer')}<div><strong>${esc(townBuildings[queue.buildingId]?.name)} Lv.${queue.targetLevel} 건설 중</strong><p>완공 ${duration(queue.endsAt-state.time)}</p>${meter(state.time-queue.startedAt,queue.endsAt-queue.startedAt)}</div><button class="button quiet small" data-action="town-cancel-build" data-focus-key="cancel-construction">취소·재료 반환</button></section>`;
    html+=`<section class="panel facility-panel" data-building-panel="${esc(building.id)}"><div class="panel-heading"><span class="panel-title">${icon(record.icon)}${esc(building.name)}</span><span class="subtle-badge">${building.level?`Lv.${building.level} / ${building.maxLevel}`:'미건설'}</span></div><div class="panel-body">${building.level?`<div class="facility-current"><div><h3>현재 시설</h3>${building.productionReason?`<p class="town-reason warning">${esc(building.productionReason)}</p>`:''}${buildingEffects({...building,storage:record.levels[building.level-1]?.storage,populationCapacity:record.levels[building.level-1]?.populationCapacity,health:record.levels[building.level-1]?.health,happiness:record.levels[building.level-1]?.happiness,education:record.levels[building.level-1]?.education},state,'current')}</div><div class="facility-condition"><span>시설 상태 <strong>${bps(building.conditionBps)}</strong></span>${meter(building.conditionBps,10000)}<button class="button quiet small" data-action="town-repair" data-id="${esc(building.id)}" data-focus-key="repair-${esc(building.id)}" ${!building.repairAvailability.ok?'disabled':''}>${icon('hammer')}수리</button>${!building.repairAvailability.ok?`<small>${esc(building.repairAvailability.message)}</small>`:''}<details class="repair-costs" data-detail-key="repair-${esc(building.id)}"><summary>수리 비용 확인</summary><div class="repair-cost-body">${building.repairAvailability.cost?townBudget(building.repairAvailability.cost,state,`repair-${building.id}`):'<p>수리 불필요</p>'}</div></details></div></div>`:''}${active?`<div class="facility-upgrade"><h3>예약 재료</h3>${townBudget(queue.reserved,state,'reserved',true)}<p>취소 시 전량 반환</p></div>`:building.nextLevel?`<div class="facility-upgrade"><h3>${building.level?'다음 단계':'첫 건설'} · Lv.${building.nextLevel.level}</h3>${buildingEffects(building.nextEffects,state,'next')}<div class="town-price-label">건설 비용</div>${townBudget(available.cost||building.nextLevel.cost,state,`build-${building.id}`)}<div class="facility-action"><button class="button primary" data-action="town-build" data-id="${esc(building.id)}" data-focus-key="build-${esc(building.id)}" ${!available.ok?'disabled':''}>${icon('hammer')}${building.level?'업그레이드':'건설'}</button><span>${icon('clock')}${duration(available.durationMs||building.nextLevel.durationMs)}</span></div>${!available.ok?`<p class="town-reason warning">${esc(available.message)}</p>`:''}</div>`:'<div class="completion-note">최고 단계</div>'}</div></section>`;
    return html;
  }
  function renderTownStorage(state,stats) {
    const last=state.town.lastTick; const ticked=state.town.totals.ticks>0;
    let html=`<section class="panel warehouse-panel"><div class="panel-heading"><span class="panel-title">${icon('backpack')}마을 전용 창고</span><span class="subtle-badge ${stats.freeStorage===0?'gold':''}">${num(stats.storageUsed)} / ${num(stats.storageCapacity)}</span></div><div class="panel-body">${meter(stats.storageUsed,stats.storageCapacity)}<div class="warehouse-space"><span>남은 공간 <strong>${num(stats.freeStorage)}</strong></span>${stats.reservedStorage?`<span>건설 예약 <strong>${num(stats.reservedStorage)}</strong></span>`:''}</div><div class="warehouse-living"><span>${icon('food')}주민 식량 사용 <strong>${num(stats.foodCost)} / 분</strong></span><span>${icon('fire')}주민 연료 사용 <strong>${num(stats.fuelCost)} / 분</strong></span><span>${ticked?`직전 생산 · 식량 ${last.foodSatisfied?'충족':'부족'} · 연료 ${last.fuelSatisfied?'충족':'부족'}`:'생산 대기'}</span><button class="text-button" data-action="town-building" data-id="storehouse" data-focus-key="storage-expand">창고 확장 ${icon('arrow')}</button></div>${stats.freeStorage===0?`<div class="town-alert">${icon('backpack')}창고 포화<button class="text-button" data-action="town-building" data-id="storehouse" data-focus-key="storage-full-expand">창고 확장</button><button class="text-button" data-action="town-tab" data-id="trade">교역으로 사용</button></div>`:''}</div></section>`;
    html+=`<div class="section-label"><h2>수용 우선순위</h2><span>높은 순위 · 한도 증가</span></div><div class="warehouse-resources">${state.town.priority.map((id,index)=>{
      const r=stats.resources.find(record=>record.id===id); const record=townResources[id];
      const count=townNumber(`resource-${id}`,Math.min(10,r.amount||1));
      const discard=townAvailability(state,{type:'townDiscard',resourceId:id,count}); const donate=townAvailability(state,{type:'townDonate',resourceId:id,count});
      return `<article class="warehouse-resource" data-resource-id="${esc(id)}"><div class="resource-heading"><span class="priority-number">${index+1}</span>${icon(record.icon)}<div><h3>${esc(r.name)}</h3></div><strong>${num(r.amount)}</strong></div><div class="resource-capacity"><span>자원 보관 한도 ${bps(r.storageShareBps)}</span><strong>${num(r.amount+r.reserved)} / ${num(r.capacity)}</strong>${meter(r.amount+r.reserved,r.capacity)}${r.reserved?`<small>건설 예약 ${num(r.reserved)}개</small>`:''}${r.amount+r.reserved>=r.capacity?'<small class="text-red">한도 도달 · 새 수용 중단</small>':''}</div><div class="resource-flow"><span>생산/분 <strong>+${statNum(stats.production[id]||0)}</strong></span><span>소모/분 <strong>−${statNum(stats.consumption[id]||0)}</strong></span>${last.overflow?.[id]?`<span class="text-red">수용 초과 ${num(last.overflow[id])}</span>`:''}<button class="text-button" data-action="town-find-resource" data-id="${esc(id)}" data-focus-key="producer-${esc(id)}">생산 시설</button></div><div class="resource-actions"><div class="priority-actions"><button class="icon-button" data-action="town-priority" data-id="${esc(id)}" data-direction="up" data-focus-key="priority-up-${esc(id)}" aria-label="${esc(r.name)} 우선순위 올리기" ${index===0?'disabled':''}>↑</button><button class="icon-button" data-action="town-priority" data-id="${esc(id)}" data-direction="down" data-focus-key="priority-down-${esc(id)}" aria-label="${esc(r.name)} 우선순위 내리기" ${index===state.town.priority.length-1?'disabled':''}>↓</button></div><label class="town-quantity">수량<input type="number" min="1" step="1" value="${esc(townInput(`resource-${id}`,Math.min(10,r.amount||1)))}" data-input-key="resource-${esc(id)}" data-focus-key="resource-count-${esc(id)}" aria-label="${esc(r.name)} 버리기 또는 기부 수량" /></label><button class="button small" data-action="town-donate" data-id="${esc(id)}" data-focus-key="donate-${esc(id)}" ${!donate.ok?'disabled':''}>기부·코인</button><button class="button quiet small" data-action="town-discard" data-id="${esc(id)}" data-focus-key="discard-${esc(id)}" ${!discard.ok?'disabled':''}>버리기</button></div><p class="town-reason">${esc(!donate.ok?donate.message:`${data.town.settings.donationUnitsPerCoin}개 → 1코인`)}</p></article>`;
    }).join('')}</div>`;
    return html;
  }
  function renderTownTrade(state,stats) {
    let html=`<div class="town-trades">`;
    html+=stats.trades.map(trade=>{
      const record=townTrades[trade.id]; const count=townNumber(`trade-${trade.id}`);
      const available=townAvailability(state,{type:'townTrade',tradeId:trade.id,count}); const one=trade.availability;
      return `<article class="panel trade-card" data-record-id="${esc(trade.id)}"><div class="trade-card-top">${icon(record.quality?'food':Object.keys(record.outputs.items).some(id=>items[id]?.kind==='seed')?'leaf':'backpack')}<div><h3>${esc(trade.name)}</h3></div>${record.quality?`<span class="subtle-badge gold">품질 ${record.quality}</span>`:''}</div><div class="trade-exchange"><div><small>1회 비용</small>${townBudget(one.cost||record.cost,state,`trade-${trade.id}`)}</div><span class="trade-arrow">${icon('arrow')}</span><div><small>1회 지급</small>${tokens(record.outputs.items,state)}</div></div><div class="trade-controls"><label class="town-quantity">교역 횟수<input type="number" min="1" step="1" value="${esc(townInput(`trade-${trade.id}`,1))}" data-input-key="trade-${esc(trade.id)}" data-focus-key="trade-count-${esc(trade.id)}" aria-label="${esc(trade.name)} 교역 횟수" /></label><button class="button quiet small" data-action="town-trade-max" data-id="${esc(trade.id)}" data-focus-key="trade-max-${esc(trade.id)}" ${!one.maxCount?'disabled':''}>최대 ${num(one.maxCount)}</button><button class="button primary" data-action="town-trade" data-id="${esc(trade.id)}" data-focus-key="trade-${esc(trade.id)}" ${!available.ok?'disabled':''}>${icon('compass')}교역</button></div>${count>1?`<details class="trade-total" data-detail-key="trade-total-${esc(trade.id)}"><summary>${num(count)}회 총 비용 확인</summary>${townBudget(available.cost,state,`trade-total-${trade.id}`)}</details>`:''}${!available.ok?`<p class="town-reason warning">${esc(available.message)}</p>`:''}${trade.nextReadyAt>state.time?`<p class="town-reason">대기 ${duration(trade.nextReadyAt-state.time)}</p>`:record.cooldownMs?`<p class="town-reason">간격 ${duration(record.cooldownMs)}</p>`:''}</article>`;
    }).join('')+'</div>';
    return html;
  }
  function renderTownSupply(state,stats) {
    const supplies=data.town.trades.filter(trade=>Object.keys(trade.outputs.items).some(id=>items[id]?.kind==='food'));
    const current=state.town.autoSupply;
    const selected=townInput('auto-trade',current.tradeId||supplies[0]?.id);
    const trade=townTrades[selected]||supplies[0]; const currentTrade=townTrades[current.tradeId];
    const target=townNumber('auto-target',current.targetStock||12);
    const available=townAvailability(state,{type:'townAutoSupply',enabled:true,tradeId:trade?.id,targetStock:target});
    const one=trade?townAvailability(state,{type:'townTrade',tradeId:trade.id,count:1}):{ok:false,message:'해금한 음식 없음'};
    const outputs=trade?.outputs.items||{};
    const warning=!available.ok?available.message:!one.ok?one.message:null;
    return `<section class="panel supply-panel"><div class="panel-heading"><span class="panel-title">${icon('food')}자동 보급</span><span class="subtle-badge ${current.enabled?'green':''}">${current.enabled?'가동 중':'꺼짐'}</span></div><div class="panel-body">${current.enabled?`<div class="supply-current"><strong>${esc(currentTrade?.name)} · 목표 ${num(current.targetStock)}개</strong></div>`:''}<div class="supply-form"><label>음식<select data-input-key="auto-trade" data-focus-key="auto-supply-trade">${supplies.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>품질 ${t.quality} · ${esc(t.name)}</option>`).join('')}</select></label><label>목표 재고<input type="number" min="1" max="${data.town.settings.maxAutoSupplyStock}" step="1" value="${esc(townInput('auto-target',current.targetStock||12))}" data-input-key="auto-target" data-focus-key="auto-supply-target" /></label></div><div class="supply-cost"><h3>1회 교역</h3>${townBudget(one.cost||trade?.cost,state,'auto-supply')}${tokens(outputs,state)}<p>${Object.keys(outputs).map(id=>`재고 ${num(state.inventory[id])} · 품질 ${items[id]?.quality}`).join(' · ')}</p><span class="supply-rule">묶음 단위 · 목표 초과 가능</span></div><div class="save-actions"><button class="button primary" data-action="town-auto-apply" data-focus-key="auto-supply-apply" ${!available.ok?'disabled':''}>${icon('check')}적용</button><button class="button quiet" data-action="town-auto-pause" data-focus-key="auto-supply-pause" ${!current.enabled?'disabled':''}>중단</button></div>${warning?`<p class="town-reason warning">${esc(warning)}</p>`:''}</div></section>`;
  }

  function renderTownFarm(state) {
    const plots=expansion.getFarmPlots(state,data);
    return `<div class="farm-plots">${plots.map(plot=>{
      const selected=plot.status!=='empty'?plot.cropId:townInput(`crop-${plot.id}`,plot.crops[0]?.id);
      const crop=plot.crops.find(c=>c.id===selected)||plot.crops[0];
      const auto=townInput(`farm-auto-${plot.id}`,plot.autoReplant);
      const plant=townAvailability(state,{type:'farmPlant',plotId:plot.id,cropId:crop?.id,autoReplant:Boolean(auto)});
      const harvest=townAvailability(state,{type:'farmHarvest',plotId:plot.id});
      const mastery=crop?expansion.getMasteryInfo(state,data,crop.id):null;
      return `<article class="panel farm-plot ${!plot.unlocked?'locked':''} ${plot.status==='ready'?'harvest-ready':''}" data-plot-id="${esc(plot.id)}"><div class="farm-illustration"><div class="farm-soil"></div>${[0,1,2,3,4,5].map(i=>`<span class="farm-sprout ${plot.status==='empty'?'empty':''}" style="--sprout:${i}">${icon(plot.status==='ready'?'spark':'leaf')}</span>`).join('')}<span class="farm-state">${!plot.unlocked?icon('lock')+'잠금':plot.status==='ready'?'수확 가능':plot.status==='growing'?'성장 중':'빈 텃밭'}</span></div><div class="farm-body"><h3>${esc(plot.name)}</h3>${!plot.unlocked?`<p class="town-reason warning">${esc(plot.unlockMessage)}</p>`:`<label class="farm-crop-select">작물<select data-input-key="crop-${esc(plot.id)}" data-focus-key="crop-${esc(plot.id)}" ${plot.status!=='empty'?'disabled':''}>${plot.crops.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)} · ${duration(c.durationMs)}</option>`).join('')}</select></label>${mastery?`<p class="farm-mastery">작물 마스터리 Lv.${mastery.level} · 수확량 +${bps(mastery.yieldBonusBps)}</p>`:''}${plot.status==='growing'?`<div class="farm-timer"><span>수확까지 ${duration(plot.remainingMs)}</span>${meter((plot.readyAt-plot.plantedAt)-plot.remainingMs,plot.readyAt-plot.plantedAt)}</div>`:''}<div class="farm-yield"><small>${plot.status==='empty'?'기본 수확물':'이번 수확물'}</small>${tokens(plot.status==='empty'?crop?.outputs:plot.outputs,state)}</div>${plot.status==='empty'?`<div class="farm-seeds"><small>씨앗</small>${tokens(crop?.inputs,state,true,true,null,`farm-${plot.id}`)}</div><label class="farm-auto-option"><input type="checkbox" data-input-key="farm-auto-${esc(plot.id)}" data-focus-key="farm-auto-${esc(plot.id)}" ${auto?'checked':''} />자동 수확·재파종</label><button class="button primary wide" data-action="farm-plant" data-id="${esc(plot.id)}" data-focus-key="plant-${esc(plot.id)}" ${!plant.ok?'disabled':''}>${icon('leaf')}심기</button>${!plant.ok?`<p class="town-reason warning">${esc(plant.message)}</p>`:plot.stopReason?'<p class="town-reason">재파종 중단</p>':''}`:`<div class="farm-active-actions"><button class="button primary" data-action="farm-harvest" data-id="${esc(plot.id)}" data-focus-key="harvest-${esc(plot.id)}" ${!harvest.ok?'disabled':''}>${icon('leaf')}수확</button><button class="button quiet small" data-action="farm-auto" data-id="${esc(plot.id)}" data-focus-key="farm-auto-active-${esc(plot.id)}">자동 재파종 ${plot.autoReplant?'끄기':'켜기'}</button></div>${plot.autoReplant?`<div class="farm-seeds"><small>재파종 씨앗</small>${tokens(crop?.inputs,state,true,true,null,`farm-active-${plot.id}`)}</div>`:''}`}`}</div></article>`;
    }).join('')}</div>`;
  }
  function renderTownObjectives(state) {
    const all=expansion.getObjectives(state,data);
    const filtered=all.filter(objective=>objectiveFilter==='all'||objectiveFilter==='claimed'?objectiveFilter==='all'||objective.claimed:!objective.claimed);
    return `<div class="filter-row">${[['pending','진행 중'],['claimed','완료'],['all','모두']].map(([id,label])=>`<button class="filter-button ${objectiveFilter===id?'active':''}" data-action="objective-filter" data-id="${id}" data-focus-key="objective-filter-${id}">${label}</button>`).join('')}<span class="objective-count">${all.filter(o=>o.claimed).length} / ${all.length} 완료</span></div>${!filtered.length?'<div class="empty-state">의뢰 없음</div>':`<div class="objective-board">${filtered.map(o=>`<article class="objective-card ${o.claimed?'claimed':''} ${o.ready&&!o.claimed?'ready':''}" data-objective-id="${esc(o.id)}"><div class="objective-paper-pin"></div><div class="objective-card-top"><span>${esc(o.category)}</span><span>${o.claimed?'수령 완료':!o.unlocked?'잠금':o.availability.ok?'수령 가능':'진행 중'}</span></div><h3>${esc(o.name)}</h3><div class="objective-progress">${o.progress.map(progress=>`<div><div class="meter-label"><span>${esc(progress.label)}</span><strong>${num(progress.current)} / ${num(progress.target)}</strong></div>${meter(progress.current,progress.target,progress.current>=progress.target?'hp':'')}</div>`).join('')}</div>${Object.keys(o.cost.items||{}).length||Object.keys(o.cost.resources||{}).length||o.cost.coins?`<div class="objective-delivery"><small>납품</small>${townBudget(o.cost,state,`objective-${o.id}`)}</div>`:''}<div class="objective-rewards"><small>보상</small>${resourceTokens(o.rewards.resources,state)}${tokens(o.rewards.items||{},state)}<div class="stats-line">${o.rewards.coins?coinToken(o.rewards.coins):''}${o.rewards.townXp?`<span>마을 경험치 +${num(o.rewards.townXp)}</span>`:''}</div></div><button class="button ${o.claimed?'quiet':'primary'} wide" data-action="claim-objective" data-id="${esc(o.id)}" data-focus-key="objective-${esc(o.id)}" ${!o.availability.ok||o.claimed?'disabled':''}>${icon(o.claimed?'check':'scroll')}${o.claimed?'완료':'납품·보상 받기'}</button>${!o.claimed&&!o.availability.ok?`<p class="town-reason warning">${esc(o.availability.message)}</p>`:''}</article>`).join('')}</div>`}`;
  }
  function renderWorkMastery(state,id) {
    if(!state.progression||!expansion.getMasteryInfo)return '';
    const mastery=expansion.getMasteryInfo(state,data,id);
    if(!mastery)return '';
    return `<div class="work-mastery"><div><span>${icon('spark')}활동 마스터리</span><strong>Lv.${mastery.level} / ${mastery.maxLevel}</strong></div>${mastery.level<mastery.maxLevel?`${meter(mastery.progressXp,mastery.progressMaxXp)}<small>다음 Lv. ${num(mastery.nextLevelXp-mastery.xp)} XP</small>`:'<small>최고 단계</small>'}<p>시간 −${bps(mastery.speedBonusBps)} · 산출 +${bps(mastery.yieldBonusBps)}</p></div>`;
  }
  function renderCollection(state) {
    if(!state.progression||!expansion.getCollectionStats)return '';
    const collection=expansion.getCollectionStats(state,data);
    const filtered=collection.items.filter(item=>collectionFilter==='all'||item.kind===collectionFilter);
    return `<section class="collection-summary"><div>${icon('book')}<strong>${statNum(collection.percent)}%</strong><span>수집률</span></div><div><strong>${collection.discoveredItems} / ${collection.totalItems}</strong><span>획득한 아이템</span></div><div><strong>${collection.defeatedEnemies} / ${collection.totalEnemies}</strong><span>처치한 적 종류</span></div></section><div class="section-label"><h2>아이템 수집</h2></div><div class="filter-row">${[['all','모두'],['material','재료'],['food','음식'],['equipment','장비'],['seed','씨앗'],['trophy','전리품']].map(([id,label])=>`<button class="filter-button ${collectionFilter===id?'active':''}" data-action="collection-filter" data-id="${id}" data-focus-key="collection-filter-${id}">${label}</button>`).join('')}</div><div class="collection-items">${filtered.map(record=>`<button class="collection-item ${record.discovered?'discovered':'undiscovered'}" data-action="find-item" data-id="${esc(record.id)}" data-focus-key="collection-${esc(record.id)}" aria-label="${esc(record.name)}, ${record.discovered?`총 ${num(record.obtained)}개 획득`:'미수집'}, 입수 경로 확인">${symbol(items[record.id])}<strong>${esc(record.name)}</strong><small>${record.discovered?`획득 ${num(record.obtained)}`:'미수집'}</small><span>보유 ${num(record.owned)}</span></button>`).join('')}</div>`;
  }
  function renderExpansionRecords(state) {
    if(!state.town||!state.progression)return '';
    const town=state.town; const plots=expansion.getFarmPlots(state,data); const collection=expansion.getCollectionStats(state,data);
    const mastery=expansion.getMasteryInfo(state,data).filter(record=>record.xp>0).sort((a,b)=>b.level-a.level||b.xp-a.xp);
    return `<section class="panel expansion-records"><div class="panel-heading"><span class="panel-title">${icon('camp')}마을 기록</span></div><div class="panel-body"><div class="growth-records">${[['건설·업그레이드',`${num(town.totals.builds)} / ${num(town.totals.upgrades)}`],['완료한 교역',num(town.totals.trades)],['누적 세금',`${num(town.totals.taxes)} 코인`],['농사 수확',num(plots.reduce((total,plot)=>total+plot.cycles,0))],['완료한 의뢰',`${state.progression.claimedObjectives.length} / ${data.objectives.length}`],['아이템 수집',`${collection.discoveredItems} / ${collection.totalItems}`]].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><details class="mastery-records" data-detail-key="mastery-records"><summary>${icon('spark')}활동 마스터리 ${mastery.length}종</summary>${mastery.length?`<div class="mastery-table">${mastery.map(record=>`<div><span>${esc(record.name)}</span><strong>Lv.${record.level}</strong><small>시간 −${bps(record.speedBonusBps)} · 산출 +${bps(record.yieldBonusBps)}</small></div>`).join('')}</div>`:'<p>기록 없음</p>'}</details></div></section>`;
  }
  function renderExpansionSummary(summary,state) {
    const town=summary.town;
    const part=(label,map)=>Object.keys(map||{}).length?`<div class="summary-section"><h3>${label}</h3>${resourceTokens(map,state)}</div>`:'';
    let html='';
    if(town)html+=`<section class="summary-expansion"><h3>${icon('camp')}마을</h3><div class="summary-town-counts"><span>생산 ${num(town.ticks)}회</span><span>교역 ${num(town.trades)}회</span><span>건설 ${num(town.builds)} · 업그레이드 ${num(town.upgrades)}</span><span>세금 ${num(town.taxes)}코인 · 수리 ${num(town.repairs)}회</span></div>${part('마을 자원 생산',town.produced)}${part('마을 자원 사용',town.consumed)}${part('수용 초과',town.overflow)}<button class="text-button" data-action="summary-town">마을 ${icon('arrow')}</button></section>`;
    if(summary.farm&&(summary.farm.planted||summary.farm.harvested||summary.farm.autoReplanted))html+=`<section class="summary-expansion"><h3>${icon('leaf')}농사</h3><p>심기 ${num(summary.farm.planted)}회 · 수확 ${num(summary.farm.harvested)}회 · 자동 재파종 ${num(summary.farm.autoReplanted)}회</p></section>`;
    if(Object.keys(summary.mastery?.xp||{}).length||summary.mastery?.levels?.length)html+=`<section class="summary-expansion"><h3>${icon('spark')}마스터리</h3><div class="summary-mastery">${Object.entries(summary.mastery?.xp||{}).map(([id,xp])=>`<div><span>${esc(activities[id]?.name||recipes[id]?.name||data.farming.crops.find(crop=>crop.id===id)?.name||id)}</span><strong>+${num(xp)} 경험치</strong></div>`).join('')}</div>${summary.mastery?.levels?.length?`<ul>${summary.mastery.levels.map(level=>`<li>${esc(activities[level.id]?.name||recipes[level.id]?.name||data.farming.crops.find(crop=>crop.id===level.id)?.name||level.id)} · Lv.${level.from} → ${level.to}</li>`).join('')}</ul>`:''}</section>`;
    if(summary.objectives?.claimed?.length)html+=`<section class="summary-expansion"><h3>${icon('scroll')}완료한 의뢰</h3><ul>${summary.objectives.claimed.map(id=>`<li>${esc(data.objectives.find(objective=>objective.id===id)?.name||id)}</li>`).join('')}</ul></section>`;
    return html;
  }
  function renderInventory(state) {
    const filtered = data.items.filter(item => (state.inventory[item.id] || 0) > 0 && (inventoryFilter === 'all' || item.kind === inventoryFilter));
    return heading('', '가방', '', `${icon('backpack')}${data.items.filter(item => (state.inventory[item.id] || 0) > 0).length}종 보유`) + `<div class="filter-row">${[['all','모두'],['material','재료'],['food','음식'],['equipment','장비'],['seed','씨앗'],['trophy','전리품']].map(([key,label]) => `<button class="filter-button ${inventoryFilter === key ? 'active' : ''}" data-action="inventory-filter" data-id="${key}">${label}</button>`).join('')}</div>${filtered.length ? `<section class="inventory-list">${filtered.map(item => `<article class="inventory-row item-tier-${esc(item.kind)}"><strong class="item-stock">${num(state.inventory[item.id])}</strong>${symbol(item)}<div class="inventory-name"><span>${esc(item.name)}</span><small>${item.kind==='food'?`회복 +${num(item.heal)} · 품질 ${item.quality}`:item.kind==='equipment'?esc(SLOT_LABELS[item.slot]):item.kind==='trophy'?'전리품':'재료'}</small></div><button class="item-slot-action" data-action="find-item" data-id="${esc(item.id)}" aria-label="${esc(item.name)} 제작 또는 채집 확인">${item.kind==='trophy'?'탐험':item.kind==='equipment'?(sourceFor(item.id,state)?'제작':'장착'):'더 모으기'} ${icon('arrow')}</button></article>`).join('')}</section>` : `<div class="empty-state">${icon('backpack')}<p>아이템 없음</p><button class="button" data-action="navigate" data-page="gather">채집</button></div>`}`;
  }

  function renderCodex(state) {
    let html = heading('', '북방 도감', '', `${icon('book')}${state.unlockedRegions.length}개 지역 발견`);
    html += renderCollection(state);
    const killRecords=state.progression?byId(expansion.getCollectionStats(state,data).enemies):{};
    html += `<div class="section-label"><h2>처치 기록</h2></div><div class="codex-grid">${data.enemies.map(enemy=>{
      const region=data.regions.find(r=>r.enemyIds.includes(enemy.id)||r.bossId===enemy.id);
      const known=region&&state.unlockedRegions.includes(region.id);
      return `<article class="creature-card ${known?'':'undiscovered'}"><div class="creature-illustration" style="--region-bg:url('${esc(regionAsset(region?.id))}')">${portrait(enemy.art,'creature-art',known?enemy.name:'아직 만나지 않은 야생 생명')}<span class="creature-label">${known?region?.bossId===enemy.id?'마지막 위협':'야생':icon('lock')+'미발견'}</span></div><div class="creature-info"><small>${esc(region?.name||'북방')}</small><h3>${known?esc(enemy.name):'미지의 생명'}</h3><p class="creature-kills">처치 ${num(killRecords[enemy.id]?.kills||0)}회</p>${known?`<div class="creature-stats"><span>${icon('heart')}${num(enemy.maxHp)}</span><span>${icon('sword')}${num(enemy.attack)}</span><span>${icon('shield')}${num(enemy.defense)}</span></div>`:'<p>지역 미개방</p>'}</div></article>`;
    }).join('')}</div>`;
    html += `<section class="panel mastery-panel"><div class="panel-heading"><span class="panel-title">${icon('spark')}여행자의 숙련</span></div><div class="panel-body skill-list">${data.skills.map(skill => {
      const xp = stateSkill(state, skill.id).xp; const level = stateSkill(state, skill.id).level;
      const lower = (level - 1) ** 2 * (data.settings.skillXpDivisor || 25); const upper = level ** 2 * (data.settings.skillXpDivisor || 25);
      return `<div class="skill-row"><span class="item-symbol small">${icon(skill.id === 'combat' ? 'sword' : /craft|smith/.test(skill.id) ? 'hammer' : /fish/.test(skill.id) ? 'fish' : /cook/.test(skill.id) ? 'food' : 'leaf')}</span><div class="skill-detail"><div class="skill-label"><span>${esc(skill.name)}</span><strong>Lv. ${level}</strong></div>${meter(xp-lower,upper-lower)}<small>다음 Lv. ${num(upper-xp)} XP</small></div></div>`;
    }).join('')}</div></section>`;
    return html;
  }

  const recordText = (event) => {
    const text=String(event.text||'');
    const region=data.regions.find(r=>text===r.clearText||text.startsWith(r.name));
    switch(event.type) {
      case 'story': case 'guide': return '';
      case 'travel': return `${region?.name||'지역'} 이동`;
      case 'clear': return `${region?.name||'지역'} 돌파`;
      case 'unlock': return `${region?.name||'지역'} 해금`;
      case 'ending': return '여정 완료';
      case 'raid': return `${region?.name||'야영지'} 습격`;
      case 'defeat': { const count=text.match(/보급\s*(\d+)개/);return `수비 패배${count?` · 손실 ${count[1]}개`:''}`; }
      case 'recovery': { const seconds=text.match(/^(\d+)초/);return `회복${seconds?` ${seconds[1]}초`:''}`; }
      case 'recovered': return '회복 완료';
      case 'paused': return '첫 돌파 대기';
      case 'resumed': return '첫 돌파 재개';
      case 'style': return text.replace(' 태세로 준비했다.',' 태세');
      case 'victory': return text.replace(/을 막아냈다\.$/,' 수비 승리').replace(/을 넘어섰다\.$/,' 탐험 승리');
      case 'food': return text.replace('으로 체력을 회복했다.',' 자동 회복');
      case 'objective': return text.split(' · ')[0];
      case 'farm-ready': return text.replace('의 작물이 수확을 기다립니다.',' 수확 가능');
      case 'farm-stop': return text.replace('부족하여 자동 재파종 종료','부족 · 재파종 중단');
      case 'town-build': return text.replace('예약한 모든 재료와 주화 반환','전량 반환');
      default: return text;
    }
  };
  const eventsHTML = (events, recent = false) => `<ol class="event-list ${recent ? 'recent-events' : ''}">${events.map(event => `<li class="event-row ${/loss|defeat|fail/.test(event.type) ? 'loss' : /win|clear|victory/.test(event.type) ? 'win' : ''}"><time class="event-time">${timecode(event.time)}</time><span class="event-mark"></span><span>${esc(event.text)}</span></li>`).join('')}</ol>`;
  function renderRecords(state) {
    const totals = state.totals || {};
    const records=state.events.map(event=>({...event,text:recordText(event)})).filter(event=>event.text);
    return heading('', '기록', '', `${icon('clock')}${duration(state.time)}`) + renderExpansionRecords(state) + `<div class="records-grid"><div class="panel record-stat"><strong>${state.clearedRegions.length}</strong><span>돌파한 지역 / ${data.regions.length}</span></div><div class="panel record-stat"><strong>${num(totals.defenseWins)}</strong><span>수비 성공</span></div><div class="panel record-stat"><strong>${num(totals.explorationWins)}</strong><span>탐험에서 이긴 전투</span></div></div><section class="panel"><div class="panel-heading"><span class="panel-title">${icon('scroll')}최근 여정</span></div><div class="panel-body">${records.length ? eventsHTML([...records].reverse()) : '<p class="context-note">기록 없음</p>'}</div></section>`;
  }

  function renderSettings(state) {
    const settings = actions.getSettings?.() || {};
    const save = actions.getSaveStatus?.() || {};
    let html = heading('', '설정', '');
    html += `<section class="panel"><div class="panel-heading"><span class="panel-title">${icon('eye')}플레이</span></div><div class="panel-body"><label class="setting-row"><div><h3>전투 연출 줄이기</h3></div><input class="toggle" type="checkbox" data-action="reduced-motion" data-focus-key="reduced-motion" ${settings.reducedMotion ? 'checked' : ''} aria-label="전투 연출 줄이기" /></label><label class="setting-row"><div><h3>음식 자동 회복</h3><p>체력 ${statNum(data.settings.autoFoodThreshold*100)}% 이하 · 음식 소모</p></div><input class="toggle" type="checkbox" data-action="auto-food" data-focus-key="auto-food" ${(settings.autoFood ?? state.autoFood) !== false ? 'checked' : ''} aria-label="전투 중 음식으로 자동 회복" /></label></div></section>`;
    html += `<section class="panel"><div class="panel-heading"><span class="panel-title">${icon('backpack')}저장</span><span class="subtle-badge ${save.failed || save.blocked ? 'gold' : 'green'}">${icon(save.failed || save.blocked ? 'lock' : 'check')}${save.blocked ? '복구 필요' : save.failed ? '저장 오류' : '자동 저장'}</span></div><div class="panel-body"><p class="settings-copy">브라우저 저장 · 데이터 삭제·기기 이동 전 백업 필요</p><div class="save-actions"><button class="button" data-action="export">${icon('download')}백업 내보내기</button><button class="button quiet" data-action="import">${icon('upload')}가져오기</button></div></div></section>`;
    html += `<section class="panel"><div class="panel-heading"><span class="panel-title">${icon('compass')}새 게임</span></div><div class="panel-body"><button class="button danger" data-action="reset-prompt">초기화</button></div></section>`;
    if (isDev && (actions.advanceTime || actions.devAdvance)) html += `<section class="panel dev-panel"><div class="panel-heading"><span class="panel-title">${icon('clock')}개발 도구</span></div><div class="panel-body dev-buttons">${[[60000,'1분'],[600000,'10분'],[3600000,'1시간'],[28800000,'8시간']].map(([ms,label]) => `<button class="button quiet small" data-action="dev-time" data-ms="${ms}">${label}</button>`).join('')}<button class="button quiet small" data-action="dev-offline" data-ms="3600000">오프라인 1시간</button></div></section>`;
    return html;
  }

  function renderDock(state) {
    const activity = state.activity;
    const current = activity?.type === 'craft' ? recipes[activity.id] : activity?.type === 'gather' ? activities[activity.id] : regions[activity?.regionId];
    const selectedName = current?.name;
    const isBusy = state.phase === 'defending' || state.phase === 'recovering';
    const label = isBusy ? PHASES[state.phase] : selectedName || '대기';
    const targetPage = state.battle ? 'explore' : activity?.type === 'craft' ? 'craft' : activity?.type === 'gather' ? 'gather' : 'explore';
    const progressText = state.phase === 'defending' ? esc(enemies[state.battle?.enemyId]?.name || '') : state.phase === 'recovering' ? `회복 ${duration(state.recoveryUntil-state.time)}` : activity?.type === 'explore' ? `${activity.encounters || 0} / ${regions[activity.regionId]?.encountersToBoss || 0} 조우` : activity ? `${activity.type === 'craft' ? '완성' : '채집'} ${duration((activity.durationMs || current?.durationMs || 1) - activity.progressMs)}` : '';
    const progressValue = isBusy ? 100 : activity?.type === 'explore' ? activity.encounters || 0 : activity?.progressMs || 0;
    const progressMax = isBusy ? 100 : activity?.type === 'explore' ? regions[activity.regionId]?.encountersToBoss || 1 : activity?.durationMs || current?.durationMs || 1;
    const detail = !activity&&stopReasonText(state.stopReason) ? stopReasonText(state.stopReason) : isBusy&&selectedName ? `재개 예정 · ${selectedName}` : '';
    return `<div class="dock-inner"><span class="activity-dot">${icon(state.phase === 'defending' ? 'shield' : state.phase === 'recovering' ? 'heart' : activity?.type === 'craft' ? 'hammer' : activity?.type === 'gather' ? 'leaf' : 'compass')}</span><div class="activity-description"><strong>${esc(label)}</strong>${detail?`<p>${esc(detail)}</p>`:''}</div>${activity||isBusy?`<div class="dock-progress"><div class="meter-label"><span>${progressText}</span><span>${activity && !isBusy ? `${percent(progressValue,progressMax)}%` : ''}</span></div>${meter(progressValue,progressMax,state.phase === 'recovering' ? 'hp' : '')}</div>`:''}<div class="dock-actions"><button class="button small" data-action="navigate" data-page="${targetPage}">${icon(state.battle ? 'eye' : 'arrow')}${state.battle ? '전투 관전' : '활동 보기'}</button>${activity ? `<button class="button quiet small" data-action="stop" aria-label="현재 활동 마치기" ${isBusy ? 'disabled' : ''}>${icon('stop')}<span class="stop-label">마치기</span></button>` : ''}</div></div>`;
  }

  function playBattleAction(state) {
    const action = state.battle?.lastAction;
    if (!action || action.id === lastBattleAction) return;
    lastBattleAction = action.id;
    if (page !== 'explore' || document.hidden || state.time-action.time > 1200) return;
    const settings = actions.getSettings?.() || {};
    if (settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const actor = refs['page-content'].querySelector(`[data-fighter="${action.actor}"]`);
    const target = refs['page-content'].querySelector(`[data-fighter="${action.actor === 'player' ? 'enemy' : 'player'}"]`);
    if (!actor || !target) return;
    actor.classList.remove('player-attacking','enemy-attacking');
    void actor.offsetWidth;
    actor.classList.add(action.actor === 'player' ? 'player-attacking' : 'enemy-attacking');
    target.classList.add('hit');
    const damage = document.createElement('span');
    damage.className = `damage-number ${action.critical ? 'critical' : ''}`;
    damage.textContent = `${action.critical ? '✦ ' : ''}${num(action.damage)}`;
    target.append(damage);
    damage.addEventListener('animationend', () => damage.remove(), { once: true });
    const timer = setTimeout(()=>{actor.classList.remove('player-attacking','enemy-attacking');target.classList.remove('hit');damage.remove();toastTimers.delete(timer);},750);
    toastTimers.add(timer);
  }

  function render() {
    const state = getState();
    if (!state || !data) return;
    if (state.regionId !== lastStateRegion) {
      if (selectedRegion === lastStateRegion) selectedRegion = state.regionId;
      lastStateRegion = state.regionId;
    }
    const stats = stateStats(state);
    const settings = actions.getSettings?.() || {};
    document.documentElement.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    shell.classList.toggle('menu-open', menuOpen);
    shell.dataset.page = page;
    shell.style.setProperty('--world-bg', `url('${regionAsset(state.regionId)}')`);
    syncInert();
    setHTML(refs.nav, renderNav(state));
    setHTML(refs['hero-panel'], renderHero(state,stats));
    setHTML(refs.topbar, renderTopbar(state));
    const renderers = { explore: () => renderExplore(state,stats), gather: () => renderWork(state,'gather'), craft: () => renderWork(state,'craft'), town: () => renderTown(state), equipment: () => renderEquipment(state,stats), inventory: () => renderInventory(state), codex: () => renderCodex(state), records: () => renderRecords(state), settings: () => renderSettings(state) };
    setHTML(refs['page-content'], renderers[page]?.() || renderers.explore());
    setHTML(refs['context-sidebar'], '');
    setHTML(refs['activity-dock'], renderDock(state));
    updateBattle(state,stats);
    playBattleAction(state);
  }

  const toast = (message, error = false) => {
    if (!message) return;
    const element = document.createElement('div');
    element.className = `toast ${error ? 'error' : ''}`;
    element.textContent = String(message);
    refs['toast-stack'].append(element);
    while (refs['toast-stack'].childElementCount > 3) refs['toast-stack'].firstElementChild.remove();
    const timer = setTimeout(() => { element.remove(); toastTimers.delete(timer); }, error ? 6500 : 4000);
    toastTimers.add(timer);
  };
  const command = async (value) => {
    try { const result = await dispatch(value); if (result?.message&&!result.ok) toast(result.message,true); render(); } catch (error) { toast(error.message || '활동을 시작하지 못했습니다.',true); }
  };
  const navigate = (nextPage, opts = {}) => {
    const changed = page !== nextPage;
    const closingMenu = menuOpen;
    page = nextPage;
    if (changed) { filter = nextPage === 'craft' || nextPage === 'gather' ? getState().regionId : 'all'; highlightedId = null; }
    if (opts.region) filter = opts.region;
    if (opts.id) highlightedId = opts.id;
    if (opts.selectedRegion) selectedRegion = opts.selectedRegion;
    if (opts.townTab) townTab = opts.townTab;
    menuOpen = false;
    render();
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
    if (changed || closingMenu) refs['page-content'].focus({ preventScroll: true });
    if (opts.id) refs['page-content'].querySelector(`[data-record-id="${CSS.escape(opts.id)}"]`)?.scrollIntoView({block:'center',behavior:'instant'});
  };
  const findItem = (id) => {
    const source = sourceFor(id,getState());
    if (source) { navigate(source.page, { region: source.record.regionId, id: source.record.id });  }
    else if ((data.town?.trades||[]).some(trade=>trade.outputs.items[id])) { const trade=data.town.trades.find(record=>record.outputs.items[id]);navigate('town',{townTab:'trade',id:trade.id}); }
    else if (items[id]?.kind === 'trophy') { navigate('explore'); toast('보스 돌파 보상'); }
    else if (items[id]?.kind === 'equipment') { navigate('equipment');  }
    else toast('전투 전리품');
  };
  const doAction = async (action) => {
    try { const result = await action?.(); render(); return result; } catch (error) { toast(error.message || '요청을 완료하지 못했습니다.',true); return false; }
  };
  const closeMenu = () => {
    menuOpen = false;
    render();
    refs.topbar.querySelector('[data-action="toggle-menu"]')?.focus({ preventScroll: true });
  };

  function clickHandler(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || button.tagName === 'SELECT' || button.tagName === 'INPUT') return;
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case 'navigate': navigate(button.dataset.page); break;
      case 'toggle-menu':
        if (menuOpen) closeMenu();
        else { menuOpen = true; render(); refs.nav.querySelector('button')?.focus({ preventScroll: true }); }
        break;
      case 'close-menu': closeMenu(); break;
      case 'region': selectedRegion = id; render(); break;
      case 'filter': filter = id; highlightedId = null; render(); break;
      case 'inventory-filter': inventoryFilter = id; render(); break;
      case 'town-tab': townTab=id;render();break;
      case 'town-building': selectedBuilding=id;townTab='buildings';render();refs['page-content'].querySelector('.facility-panel')?.scrollIntoView({block:'nearest',behavior:'instant'});break;
      case 'town-find-resource': {
        const stats=expansion.getTownStats(getState(),data);
        const producer=stats.buildings.find(building=>building.outputs?.[id]||building.nextEffects?.outputs?.[id]);
        if(producer){selectedBuilding=producer.id;townTab='buildings';navigate('town');refs['page-content'].querySelector('.facility-panel')?.scrollIntoView({block:'nearest',behavior:'instant'});}
        else {townTab='trade';navigate('town');toast('교역·의뢰 보상');}
        break;
      }
      case 'town-build': command({type:'townBuild',buildingId:id});break;
      case 'town-cancel-build': command({type:'townCancelBuild'});break;
      case 'town-repair': command({type:'townRepair',buildingId:id});break;
      case 'town-priority': {
        const resourceIds=[...getState().town.priority]; const index=resourceIds.indexOf(id);const other=index+(button.dataset.direction==='up'?-1:1);
        if(index>=0&&other>=0&&other<resourceIds.length){[resourceIds[index],resourceIds[other]]=[resourceIds[other],resourceIds[index]];command({type:'townPriority',resourceIds});}
        break;
      }
      case 'town-discard': case 'town-donate': {
        const amount=getState().town.resources[id]||0;
        command({type:button.dataset.action==='town-discard'?'townDiscard':'townDonate',resourceId:id,count:townNumber(`resource-${id}`,Math.min(10,amount||1))});break;
      }
      case 'town-trade': command({type:'townTrade',tradeId:id,count:townNumber(`trade-${id}`)});break;
      case 'town-trade-max': townInputs[`trade-${id}`]=townAvailability(getState(),{type:'townTrade',tradeId:id,count:1}).maxCount;render();break;
      case 'town-auto-apply': {
        const current=getState().town.autoSupply;
        const first=data.town.trades.find(trade=>Object.keys(trade.outputs.items).some(itemId=>items[itemId]?.kind==='food'));
        command({type:'townAutoSupply',enabled:true,tradeId:townInput('auto-trade',current.tradeId||first?.id),targetStock:townNumber('auto-target',current.targetStock||12)});break;
      }
      case 'town-auto-pause': command({type:'townAutoSupply',...getState().town.autoSupply,enabled:false});break;
      case 'farm-plant': {
        const plot=expansion.getFarmPlots(getState(),data).find(record=>record.id===id);
        command({type:'farmPlant',plotId:id,cropId:townInput(`crop-${id}`,plot.crops[0]?.id),autoReplant:Boolean(townInput(`farm-auto-${id}`,plot.autoReplant))});break;
      }
      case 'farm-harvest': command({type:'farmHarvest',plotId:id});break;
      case 'farm-auto': {
        const plot=getState().farm.plots[id];delete townInputs[`farm-auto-${id}`];command({type:'farmAutoReplant',plotId:id,enabled:!plot.autoReplant});break;
      }
      case 'objective-filter': objectiveFilter=id;render();break;
      case 'claim-objective': command({type:'claimObjective',objectiveId:id});break;
      case 'collection-filter': collectionFilter=id;render();break;
      case 'gather': command({ type: 'gather', id }); break;
      case 'craft': command({ type: 'craft', id, ...(Number(selectCounts[id]) > 0 ? { count: Number(selectCounts[id]) } : {}) }); break;
      case 'explore': command({ type: 'explore', regionId: id }); break;
      case 'travel': command({ type: 'travel', regionId: id }); break;
      case 'equip': command({ type: 'equip', itemId: id }); break;
      case 'combat-style': command({type:'combatStyle',id}); break;
      case 'stop': command({ type: 'stop' }); break;
      case 'find-item': findItem(id); break;
      case 'prepare': navigate(button.dataset.page, { id, region: button.dataset.region, selectedRegion: button.dataset.region }); break;
      case 'food-prepare': {
        const recipe = data.recipes.find(r => r.regionId === getState().regionId && Object.keys(r.outputs || {}).some(itemId => items[itemId]?.kind === 'food'));
        if (recipe) navigate('craft', { id: recipe.id, region: recipe.regionId });
        break;
      }
      case 'export': doAction(() => actions.exportSave()).then(result => { if(result!==false)toast('백업 저장'); }); break;
      case 'import': document.getElementById('save-import').click(); break;
      case 'reset-prompt': resetPrompt = true; showModal(); break;
      case 'reset-confirm': closeModal(); doAction(() => actions.resetGame({confirmed:true})).then(result => { if(result!==false) { selectedRegion = getState().regionId; navigate('explore'); toast('초기화 완료'); } }); break;
      case 'modal-close': closeModal(); break;
      case 'summary-prepare': closeModal(); navigate('craft'); break;
      case 'summary-records': closeModal(); navigate('records'); break;
      case 'summary-town': closeModal(); navigate('town'); break;
      case 'dev-time': doAction(() => (actions.advanceTime || actions.devAdvance)?.(Number(button.dataset.ms), { offline: false })); break;
      case 'dev-offline': doAction(() => (actions.advanceTime || actions.devAdvance)?.(Number(button.dataset.ms), { offline: true })); break;
    }
  }
  function changeHandler(event) {
    const input = event.target;
    switch (input.dataset.action) {
      case 'count': selectCounts[input.dataset.id] = Number(input.value); break;
      case 'reduced-motion': doAction(() => actions.setReducedMotion(input.checked)); break;
      case 'auto-food': doAction(() => actions.setAutoFood?.(input.checked)); break;
    }
    if (input.id === 'save-import' && input.files?.[0]) {
      const file = input.files[0];
      input.value = '';
      doAction(() => actions.importSave(file));
    }
  }
  function inputHandler(event) {
    const input=event.target;
    if(!input.dataset.inputKey)return;
    townInputs[input.dataset.inputKey]=input.type==='checkbox'?input.checked:input.value;
    render();
  }

  function showModal() {
    modalReturnFocus = document.activeElement;
    modalReturnFocusKey = modalReturnFocus?.dataset?.focusKey;
    const state = getState();
    let html;
    if (resetPrompt) html = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">새 게임</h2><p>진행 전체 삭제</p></div><button class="icon-button" data-action="modal-close" aria-label="닫기">${icon('close')}</button></div><div class="modal-body"><button class="button quiet" data-action="export">${icon('download')}백업 내보내기</button></div><div class="modal-actions"><button class="button quiet" data-action="modal-close">취소</button><button class="button danger" data-action="reset-confirm">초기화</button></div></section></div>`;
    else {
      const summary = summaryData;
      const section = (label,map,cls='') => Object.keys(map || {}).length ? `<section class="summary-section"><h3 class="${cls}">${label}</h3>${tokens(map,state,false,false)}</section>` : '';
      const stopReason = stopReasonText(summary.stopReason);
      const paused = summary.interruptedMs > 0 || summary.firstExplorationPaused || stopReason;
      html = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">복귀 결과</h2><p>부재 ${duration(summary.awayMs||summary.elapsedMs)}</p></div><button class="icon-button" data-action="modal-close" aria-label="복귀 요약 닫기">${icon('close')}</button></div><div class="modal-body"><div class="summary-metrics"><div class="summary-metric"><strong>${num(summary.raids)}</strong><span>습격</span></div><div class="summary-metric"><strong>${num(summary.defenseWins)} / ${num(summary.defenseLosses)}</strong><span>수비 승 / 패</span></div><div class="summary-metric"><strong>${num(summary.explorationWins)}</strong><span>탐험 승리</span></div></div>${section('산출',summary.produced,'text-green')}${section('소모',summary.consumed)}${section('손실',summary.lost,'text-red')}${renderExpansionSummary(summary,state)}${paused?`<section class="summary-section"><h3>중단</h3>${summary.interruptedMs>0?`<p>수비·회복 ${duration(summary.interruptedMs)}</p>`:''}${summary.firstExplorationPaused?`<p>첫 돌파 대기 ${duration(summary.offlinePausedMs||0)} · 접속 후 재개</p>`:''}${stopReason?`<p class="text-gold">${esc(stopReason)}</p>`:''}</section>`:''}${summary.excludedMs > 0 ? `<p class="warning-note">적용 ${duration(summary.elapsedMs)} · 제외 ${duration(summary.excludedMs)}</p>` : ''}${summary.clearedRegions?.length ? `<section class="summary-section"><h3 class="text-gold">지역 돌파</h3><p>${summary.clearedRegions.map(id => esc(regions[id]?.name || id)).join(' · ')}</p></section>` : ''}</div><div class="modal-actions"><button class="button quiet" data-action="summary-records">기록</button><button class="button quiet" data-action="summary-prepare">제작</button><button class="button primary" data-action="modal-close">닫기 ${icon('arrow')}</button></div></section></div>`;
    }
    refs['modal-container'].innerHTML = html;
    syncInert();
    refs['modal-container'].querySelector('button')?.focus();
  }

  function closeModal() {
    const hadSummary = summaryData !== null;
    refs['modal-container'].innerHTML = '';
    summaryData = null; resetPrompt = false;
    syncInert();
    if (hadSummary) actions.dismissSummary?.();
    if (modalReturnFocus?.isConnected) modalReturnFocus.focus({ preventScroll: true });
    else if (modalReturnFocusKey) app.querySelector(`[data-focus-key="${CSS.escape(modalReturnFocusKey)}"]`)?.focus({preventScroll:true});
  }
  function keyHandler(event) {
    if (event.key === 'Escape') { if (summaryData || resetPrompt) closeModal(); else if (menuOpen) closeMenu(); }
    const focusScope = summaryData || resetPrompt ? refs['modal-container'] : menuOpen && mobileMedia.matches ? sidebar : null;
    if (event.key === 'Tab' && focusScope) {
      const focusables = [...focusScope.querySelectorAll('button:not(:disabled), a[href], input, select, summary')].filter(element=>!element.closest('[inert]')&&element.getClientRects().length);
      const first = focusables[0]; const last = focusables[focusables.length-1];
      if (!focusScope.contains(document.activeElement)) { (event.shiftKey?last:first)?.focus();event.preventDefault(); }
      else if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
    }
  }
  app.addEventListener('click',clickHandler);
  app.addEventListener('change',changeHandler);
  app.addEventListener('input',inputHandler);
  document.addEventListener('keydown',keyHandler);
  render();
  return {
    render,
    showSummary(summary) { if (!summary) return; summaryData = summary; resetPrompt = false; showModal(); },
    showError(message) { toast(message,true); },
    destroy() { app.removeEventListener('click',clickHandler); app.removeEventListener('change',changeHandler); app.removeEventListener('input',inputHandler); document.removeEventListener('keydown',keyHandler); toastTimers.forEach(clearTimeout); app.innerHTML = ''; },
  };
}
