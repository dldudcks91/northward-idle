import { createGame, advanceGame, applyCommand, validateContent } from '../simulation/engine.js';
import { mountUI } from '../ui/view.js';
import { returnWindow } from './clock.js';
import { combineSummary } from './summary.js';
import { SAVE_KEY, BACKUP_KEY, readSave, decodeSave, encodeSave, writeSave, preserveOriginal, readSettings, writeSettings } from '../storage/save.js';

const HOUR = 3_600_000;
let game, data, assets, view, settings, pendingSummary = null;
let wallApplied = Date.now();
let busy = false, blocked = false, stopped = false, saveWarning = false;
let lastSaveAt = 0, corruptRaw = null;
const writerId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const dev = new URLSearchParams(location.search).get('dev') === '1';
const storage = {
  getItem(key) { return localStorage.getItem(key); },
  setItem(key, value) { localStorage.setItem(key, value); },
};

async function readJSON(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path} 파일을 읽지 못했습니다.`);
  return response.json();
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fresh() {
  const seed = globalThis.crypto?.getRandomValues?.(new Uint32Array(1))?.[0] ?? Math.floor(Math.random() * 0xffffffff);
  return createGame(data, { seed: seed || 1, now: 0 });
}

function persist() {
  if (blocked || busy || !game) return false;
  try {
    writeSave(storage, encodeSave(game, wallApplied, { pendingSummary, writerId }));
    lastSaveAt = Date.now();
    saveWarning = false;
    return true;
  } catch (error) {
    if (!saveWarning) view?.showError(error.message);
    saveWarning = true;
    return false;
  }
}

function onlineTick() {
  if (blocked || busy || stopped || !game) return;
  const now = Date.now();
  const elapsed = Math.max(0, now - wallApplied);
  if (elapsed > 0) {
    advanceGame(game, data, elapsed, { offline: false });
    wallApplied = Math.max(wallApplied, now);
  }
  view?.render();
  if (now - lastSaveAt >= 5000) persist();
}

async function catchUp(savedAt, candidate = game) {
  const now = Date.now();
  const cap = data.settings.offlineCapMs ?? 72 * HOUR;
  const plan = returnWindow(savedAt, now, cap);
  const { awayMs, elapsedMs: elapsed } = plan;
  let remaining = elapsed;
  let summary = { elapsedMs: 0, produced: {}, consumed: {}, lost: {}, raids: 0, defenseWins: 0, defenseLosses: 0, explorationWins: 0, interruptedMs: 0, clearedRegions: [], excludedMs: awayMs - elapsed, awayMs, firstExplorationPaused: candidate.activity?.type === 'explore' && !candidate.clearedRegions.includes(candidate.activity.regionId) };
  busy = true;
  let lastYield = performance.now();
  try {
    while (remaining > 0) {
      const slice = Math.min(remaining, 5 * 60_000);
      summary = combineSummary(summary, advanceGame(candidate, data, slice, { offline: true }));
      remaining -= slice;
      // Yield between exact simulation chunks so long returns do not freeze input.
      if (remaining > 0 && performance.now() - lastYield >= 16) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    return { state: candidate, summary, appliedAt: plan.appliedAt };
  } finally { busy = false; }
}

function dispatch(command) {
  if (blocked) return { ok: false, message: '저장 복구가 필요합니다.' };
  if (busy) return { ok: false, message: '복귀 처리 중입니다.' };
  onlineTick();
  const result = applyCommand(game, data, command);
  view.render();
  if (result.ok) persist();
  return result;
}

function modal({ title, message, buttons }) {
  document.getElementById('app-overlay')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'app-overlay';
  backdrop.className = 'app-backdrop';
  const panel = document.createElement('section');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'overlay-title');
  panel.className = 'app-dialog';
  const heading = document.createElement('h1');
  heading.id = 'overlay-title';
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  paragraph.className = 'app-dialog-message';
  const controls = document.createElement('div');
  controls.className = 'app-dialog-controls';
  panel.append(heading, paragraph, controls);
  for (const item of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.className = 'button';
    button.addEventListener('click', item.action);
    controls.append(button);
  }
  backdrop.append(panel);
  document.body.append(backdrop);
  controls.querySelector('button')?.focus();
  backdrop.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controlsList = [...backdrop.querySelectorAll('button')];
    const index = controlsList.indexOf(document.activeElement);
    if (event.shiftKey && index === 0) { controlsList.at(-1)?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && index === controlsList.length - 1) { controlsList[0]?.focus(); event.preventDefault(); }
  });
}

function recovery(error) {
  blocked = true;
  let backup = null;
  try {
    corruptRaw = storage.getItem(SAVE_KEY);
    const rawBackup = storage.getItem(BACKUP_KEY);
    if (rawBackup) backup = decodeSave(rawBackup, data);
  } catch { /* Primary and backup are left unchanged. */ }
  const buttons = [];
  if (corruptRaw) buttons.push({ label: '원본 저장 다운로드', action: () => download(corruptRaw, 'northward-original-save.json') });
  if (backup) buttons.push({ label: '이전 정상 저장 복구', action: async () => {
    try {
      preserveOriginal(storage, corruptRaw);
      const result = await catchUp(backup.savedAt, structuredClone(backup.state));
      game = result.state;
      wallApplied = result.appliedAt;
      pendingSummary = combineSummary(backup.pendingSummary, result.summary);
      blocked = false;
      if (!persist()) { blocked = true; return; }
      document.getElementById('app-overlay')?.remove();
      view.render();
      view.showSummary(pendingSummary);
    } catch (problem) { view.showError(problem.message); }
  } });
  buttons.push({ label: '저장 파일 가져오기', action: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => input.files[0] && actions.importSave(input.files[0]));
    input.click();
  } });
  buttons.push({ label: '새 여정 시작', action: actions.resetGame });
  modal({ title: '저장 복구', message: `${error.message}\n기존 저장은 유지됩니다.`, buttons });
}

const actions = {
  exportSave() {
    if (blocked && corruptRaw) return download(corruptRaw, 'northward-original-save.json');
    onlineTick();
    download(encodeSave(game, wallApplied, { pendingSummary, writerId }), `northward-save-${new Date().toISOString().slice(0, 10)}.json`);
  },
  async importSave(file) {
    try {
      if (file.size > 2_000_000) throw new Error('저장 파일은 2MB 이하만 가져올 수 있습니다.');
      const parsed = decodeSave(await file.text(), data);
      if (!confirm('이 저장으로 교체할까요? 현재 저장은 백업됩니다.')) return false;
      onlineTick();
      const original = storage.getItem(SAVE_KEY);
      if (original) preserveOriginal(storage, original);
      const result = await catchUp(parsed.savedAt, structuredClone(parsed.state));
      game = result.state;
      wallApplied = result.appliedAt;
      pendingSummary = combineSummary(parsed.pendingSummary, result.summary);
      blocked = false;
      if (!persist()) { blocked = true; return false; }
      document.getElementById('app-overlay')?.remove();
      view.render();
      if (pendingSummary.elapsedMs >= 5000 || pendingSummary.excludedMs > 0) view.showSummary(pendingSummary);
      return true;
    } catch (error) { view.showError(error.message); return false; }
  },
  resetGame({ confirmed = false } = {}) {
    if (!confirmed && !confirm('진행을 초기화할까요? 현재 저장은 백업됩니다.')) return false;
    try {
      const original = storage.getItem(SAVE_KEY);
      if (original) preserveOriginal(storage, original);
      const candidate = fresh();
      const at = Date.now();
      writeSave(storage, encodeSave(candidate, at, { writerId }));
      game = candidate;
      wallApplied = at;
      pendingSummary = null;
      blocked = false;
      saveWarning = false;
      document.getElementById('app-overlay')?.remove();
      view.render();
      return true;
    } catch (error) { view.showError(error.message); return false; }
  },
  setReducedMotion(value) {
    settings.reducedMotion = Boolean(value);
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    try { writeSettings(storage, settings); } catch (error) { view.showError(error.message); }
    view.render();
  },
  setAutoFood(value) { return dispatch({ type: 'autoFood', value: Boolean(value) }); },
  getSettings() { return { ...settings, autoFood: game.autoFood !== false }; },
  getSaveStatus() { return { lastSaveAt, failed: saveWarning, blocked }; },
  dismissSummary() { pendingSummary = null; persist(); },
};

async function acquireLock() {
  if (!navigator.locks) return true;
  return new Promise((resolve, reject) => {
    navigator.locks.request('northward-idle-play', { ifAvailable: true }, async lock => {
      resolve(Boolean(lock));
      if (lock) await new Promise(() => {});
    }).catch(reject);
  });
}

function enableDevTools() {
  if (!dev) return;
  const debug = {
    getState: () => structuredClone(game),
    getData: () => structuredClone(data),
    dispatch,
    advance(ms, offline = false) {
      if (!Number.isFinite(ms) || ms < 0 || ms > 7 * 24 * HOUR) throw new Error('개발 진행은 7일 이내로 지정하세요.');
      const summary = advanceGame(game, data, ms, { offline });
      wallApplied = Math.max(wallApplied, Date.now());
      view.render();
      persist();
      return summary;
    },
    save: persist,
    loadState(state) {
      const checked = decodeSave(encodeSave(state, Date.now()), data);
      game = checked.state;
      wallApplied = checked.savedAt;
      pendingSummary = null;
      view.render();
      persist();
    },
    actions,
    getSummary: () => structuredClone(pendingSummary),
  };
  window.__northward = debug;
  const panel = document.createElement('details');
  panel.id = 'dev-tools';
  panel.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:90;padding:10px;background:#102c40;border:1px dashed #f5bc67;border-radius:8px;color:#f5bc67;font:12px monospace';
  const label = document.createElement('summary');
  label.textContent = '개발 도구 · 시간 진행';
  panel.append(label);
  for (const [name, time, offline] of [['1분', 60_000, false], ['1시간', HOUR, false], ['오프라인 8시간', 8 * HOUR, true]]) {
    const button = document.createElement('button');
    button.textContent = name;
    button.style.cssText = 'margin:8px 4px 0 0;padding:6px;cursor:pointer';
    button.addEventListener('click', () => {
      const summary = debug.advance(time, offline);
      if (offline) view.showSummary(summary);
    });
    panel.append(button);
  }
  document.body.append(panel);
}

async function boot() {
  try {
    [data, assets] = await Promise.all([readJSON('data/game.json'), readJSON('assets/manifest.json').catch(() => ({ assets: [] }))]);
    validateContent(data);
    const assetMap = Object.fromEntries((assets.assets ?? []).map(asset => [asset.id, asset.path]));
    settings = readSettings(storage);
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    game = fresh();
    view = mountUI({ data, getState: () => game, dispatch, actions, assets: assetMap });
    if (!(await acquireLock())) {
      blocked = true;
      modal({ title: '다른 창에서 실행 중', message: '다른 게임 창을 닫고 새로고침하세요.', buttons: [{ label: '새로고침', action: () => location.reload() }] });
      return;
    }
    let loaded;
    try { loaded = readSave(storage, data); } catch (error) { recovery(error); enableDevTools(); return; }
    if (loaded) {
      if (loaded.migrated) preserveOriginal(storage, loaded.raw);
      const result = await catchUp(loaded.savedAt, structuredClone(loaded.state));
      game = result.state;
      wallApplied = result.appliedAt;
      pendingSummary = combineSummary(loaded.pendingSummary, result.summary);
    } else { wallApplied = Date.now(); }
    persist();
    view.render();
    if (pendingSummary && (pendingSummary.elapsedMs >= 5000 || pendingSummary.excludedMs > 0)) view.showSummary(pendingSummary);
    enableDevTools();
  } catch (error) {
    blocked = true;
    modal({ title: '불러오기 실패', message: error.message, buttons: [{ label: '새로고침', action: () => location.reload() }] });
    console.error(error);
  }
}

await boot();
setInterval(() => {
  try { onlineTick(); } catch (error) { stopped = true; view?.showError(`진행 중단: ${error.message} 저장을 내보내세요.`); console.error(error); }
}, 200);
addEventListener('pagehide', () => { onlineTick(); persist(); });
addEventListener('beforeunload', () => { onlineTick(); persist(); });
document.addEventListener('visibilitychange', () => { onlineTick(); persist(); });
addEventListener('storage', event => {
  if (event.key === SAVE_KEY && event.newValue && !navigator.locks) {
    try {
      const parsed = decodeSave(event.newValue, data);
      if (parsed.writerId !== writerId) {
        blocked = true;
        modal({ title: '다른 창에서 저장 변경', message: '이 창의 진행이 중단됐습니다.', buttons: [{ label: '새 저장 불러오기', action: () => location.reload() }] });
      }
    } catch { /* A malformed external update must not replace this state. */ }
  }
});
