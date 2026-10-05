import { createGame, getSkillLevel, validateExpansionState } from '../simulation/engine.js';

export const SAVE_KEY = 'northward-idle.save.v2';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const ORIGINAL_KEY = `${SAVE_KEY}.original`;
export const SETTINGS_KEY = 'northward-idle.settings.v1';
// The key stays stable so earlier journeys are found; the envelope owns versioning.
export const SCHEMA_VERSION = 3;
const MAX_SAVE_LENGTH = 2_000_000;

export class SaveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
  }
}

export function checksum(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new SaveError('invalid', `저장 파일을 읽을 수 없습니다: ${message}`);
}

export function validateState(state, data) {
  if (!record(state)) fail('게임 상태가 없습니다.');
  if (state.schemaVersion !== SCHEMA_VERSION) fail('상태 버전이 맞지 않습니다.');
  if (!Number.isSafeInteger(state.time) || state.time < 0) fail('진행 시간이 잘못되었습니다.');
  if (!Number.isSafeInteger(state.rng) || state.rng < 0 || state.rng > 0xffffffff) fail('난수 상태가 잘못되었습니다.');
  const items = new Map(data.items.map(item => [item.id, item]));
  const regions = new Set(data.regions.map(region => region.id));
  const enemies = new Set(data.enemies.map(enemy => enemy.id));
  if (!regions.has(state.regionId)) fail('현재 지역이 존재하지 않습니다.');
  for (const field of ['unlockedRegions', 'clearedRegions']) {
    if (!Array.isArray(state[field]) || state[field].some(id => !regions.has(id)) || new Set(state[field]).size !== state[field].length) fail('지역 진행이 잘못되었습니다.');
  }
  if (!state.unlockedRegions.includes(state.regionId) || state.clearedRegions.some(id => !state.unlockedRegions.includes(id))) fail('지역 해금이 잘못되었습니다.');
  if (!record(state.inventory)) fail('소지품 정보가 없습니다.');
  for (const [id, amount] of Object.entries(state.inventory)) {
    if (!items.has(id) || !Number.isSafeInteger(amount) || amount < 0 || amount > 1e9) fail('소지품 수량이 잘못되었습니다.');
  }
  if (!record(state.equipment)) fail('장비 정보가 없습니다.');
  for (const slot of ['weapon', 'armor', 'charm']) {
    const id = state.equipment[slot];
    if (id !== null && (!items.has(id) || items.get(id).slot !== slot || !(state.inventory[id] > 0))) fail('장착 장비가 잘못되었습니다.');
  }
  if (!record(state.skills)) fail('숙련 정보가 없습니다.');
  if (typeof state.autoFood !== 'boolean' || typeof state.offlineBlocked !== 'boolean' || !data.combatStyles.some(style => style.id === state.combatStyle)) fail('전투 준비 설정이 잘못되었습니다.');
  for (const skill of data.skills) {
    const value = state.skills[skill.id];
    if (!record(value) || !Number.isSafeInteger(value.xp) || value.xp < 0 || value.level !== getSkillLevel(value.xp, data.settings.skillXpDivisor)) fail('숙련 경험치와 레벨이 일치하지 않습니다.');
  }
  if (!Number.isFinite(state.hp) || state.hp < 0) fail('체력이 잘못되었습니다.');
  if (!['idle', 'working', 'exploring', 'defending', 'recovering'].includes(state.phase)) fail('현재 진행 단계가 잘못되었습니다.');
  const safeMs = value => Number.isSafeInteger(value) && value >= 0;
  for (const field of ['nextRaidAt', 'nextHealAt']) if (!safeMs(state[field]) || state[field] < state.time) fail('다음 사건 시각이 잘못되었습니다.');
  if (state.recoveryUntil !== null && (!safeMs(state.recoveryUntil) || state.recoveryUntil < state.time)) fail('회복 시간이 잘못되었습니다.');
  if (!Number.isSafeInteger(state.pendingRaids) || state.pendingRaids < 0) fail('대기 중인 습격 정보가 잘못되었습니다.');
  if (state.activity !== null) {
    if (!record(state.activity) || !['gather', 'craft', 'explore'].includes(state.activity.type)) fail('선택한 활동이 잘못되었습니다.');
    if (state.activity.type === 'gather' && !data.activities.some(a => a.id === state.activity.id)) fail('채집 활동이 존재하지 않습니다.');
    if (state.activity.type === 'craft' && !data.recipes.some(a => a.id === state.activity.id)) fail('제작법이 존재하지 않습니다.');
    if (!regions.has(state.activity.regionId) || !state.unlockedRegions.includes(state.activity.regionId)) fail('활동 지역이 존재하지 않습니다.');
    const work = state.activity.type === 'gather' ? data.activities.find(a => a.id === state.activity.id) : state.activity.type === 'craft' ? data.recipes.find(a => a.id === state.activity.id) : null;
    if (work && work.regionId !== state.activity.regionId || state.activity.type === 'explore' && state.activity.id !== state.activity.regionId) fail('활동과 지역이 일치하지 않습니다.');
    if (!['active', 'offline-paused'].includes(state.activity.status)) fail('활동 진행 상태가 잘못되었습니다.');
    if (state.activity.type === 'explore' && (!['travel', 'battle'].includes(state.activity.stage) || !safeMs(state.activity.encounters) || typeof state.activity.repeat !== 'boolean')) fail('탐험 진행 정보가 잘못되었습니다.');
    if (!safeMs(state.activity.progressMs) || !safeMs(state.activity.durationMs) || state.activity.durationMs <= 0 || state.activity.progressMs > state.activity.durationMs) fail('활동 진행이 잘못되었습니다.');
    if (state.activity.remaining !== undefined && state.activity.remaining !== null && (!Number.isSafeInteger(state.activity.remaining) || state.activity.remaining < 1)) fail('남은 제작 횟수가 잘못되었습니다.');
    if (state.activity.reserved !== undefined && state.activity.reserved !== null) {
      if (!record(state.activity.reserved)) fail('예약한 재료가 잘못되었습니다.');
      const recipe = data.recipes.find(r => r.id === state.activity.id);
      if (!recipe || Object.keys(state.activity.reserved).length !== Object.keys(recipe.inputs).length || Object.entries(state.activity.reserved).some(([id, amount]) => recipe.inputs[id] !== amount)) fail('예약한 제작 재료가 일치하지 않습니다.');
    }
    if (state.activity.type === 'craft' && !record(state.activity.reserved)) fail('진행 중인 제작의 예약 재료가 없습니다.');
  }
  const validateBattle = (battle, suspended = false) => {
    if (battle === null) return;
    if (!record(battle) || !enemies.has(battle.enemyId) || !['raid', 'exploration', 'boss'].includes(battle.kind)) fail('전투 대상이 존재하지 않습니다.');
    if (!safeMs(battle.id) || battle.id < 1 || !safeMs(battle.turns) || !safeMs(battle.playerTurns) || battle.playerTurns > battle.turns || typeof battle.guardNext !== 'boolean') fail('전투 행동 기록이 잘못되었습니다.');
    if (!Number.isFinite(battle.enemyHp) || battle.enemyHp < 0 || !Number.isFinite(battle.enemyMaxHp) || battle.enemyMaxHp <= 0 || battle.enemyHp > battle.enemyMaxHp) fail('전투 체력이 잘못되었습니다.');
    for (const field of ['startedAt', 'nextPlayerAt', 'nextEnemyAt', 'nextActionAt']) if (!safeMs(battle[field])) fail('전투 시각이 잘못되었습니다.');
    for (const field of ['playerAttackMs', 'enemyAttackMs']) if (!safeMs(battle[field]) || battle[field] < 1) fail('공격 간격이 잘못되었습니다.');
    if (battle.startedAt > state.time || battle.nextActionAt !== Math.min(battle.nextPlayerAt, battle.nextEnemyAt)) fail('전투 사건 시각이 일치하지 않습니다.');
    if (battle.townBonuses !== undefined && (!record(battle.townBonuses) || Object.entries(battle.townBonuses).some(([key, amount]) => !['attack', 'defense', 'warmth', 'maxHp', 'workSpeedBps'].includes(key) || !Number.isFinite(amount) || amount < 0))) fail('전투에 보존한 마을 효과가 잘못되었습니다.');
    if (!suspended && (battle.nextPlayerAt < state.time || battle.nextEnemyAt < state.time)) fail('전투 시각이 현재보다 이전입니다.');
    if (suspended && (!safeMs(battle.remainingPlayerMs) || !safeMs(battle.remainingEnemyMs) || battle.kind === 'raid')) fail('중단한 전투의 시간이 잘못되었습니다.');
    if (battle.kind !== 'raid' && state.activity?.type !== 'explore') fail('탐험과 전투 상태가 일치하지 않습니다.');
    if (battle.lastAction !== null && (!record(battle.lastAction) || !safeMs(battle.lastAction.id) || battle.lastAction.id < 1 || !safeMs(battle.lastAction.time) || battle.lastAction.time > state.time || !['player', 'enemy'].includes(battle.lastAction.actor) || !Number.isSafeInteger(battle.lastAction.damage) || battle.lastAction.damage < 1 || typeof battle.lastAction.critical !== 'boolean')) fail('최근 전투 행동이 잘못되었습니다.');
  };
  validateBattle(state.battle);
  validateBattle(state.suspendedBattle, true);
  if (state.phase === 'defending' && state.battle?.kind !== 'raid') fail('수비 상태가 일치하지 않습니다.');
  if (state.battle?.kind === 'raid' && state.phase !== 'defending') fail('습격 전투와 진행 단계가 일치하지 않습니다.');
  if (state.phase === 'recovering' && state.recoveryUntil === null) fail('회복 상태가 일치하지 않습니다.');
  if (state.phase !== 'recovering' && state.recoveryUntil !== null || state.phase === 'recovering' && state.battle !== null) fail('회복과 전투 상태가 일치하지 않습니다.');
  if (state.phase === 'working' && !['gather', 'craft'].includes(state.activity?.type)) fail('작업 상태가 일치하지 않습니다.');
  if (state.phase === 'working' && (state.battle !== null || state.offlineBlocked)) fail('작업과 전투·중단 상태가 일치하지 않습니다.');
  if (state.phase === 'exploring' && (state.activity?.type !== 'explore' || state.offlineBlocked)) fail('탐험 단계가 일치하지 않습니다.');
  if (state.phase === 'idle' && (state.battle !== null || state.activity !== null && !state.offlineBlocked)) fail('대기 상태가 일치하지 않습니다.');
  if (state.offlineBlocked && (state.activity?.type !== 'explore' || state.clearedRegions.includes(state.activity.regionId) || state.activity.status !== 'offline-paused')) fail('오프라인 첫 돌파 보존 상태가 일치하지 않습니다.');
  if (!Array.isArray(state.events) || state.events.length > 1000 || state.events.some(e => !record(e) || typeof e.text !== 'string')) fail('사건 기록이 잘못되었습니다.');
  if (!record(state.totals) || typeof state.completed !== 'boolean') fail('누적 기록이 잘못되었습니다.');
  for (const field of ['produced', 'consumed', 'lost']) {
    if (!record(state.totals[field]) || Object.entries(state.totals[field]).some(([id, amount]) => !items.has(id) || !Number.isSafeInteger(amount) || amount < 0)) fail('누적 자원 기록이 잘못되었습니다.');
  }
  for (const field of ['raids', 'defenseWins', 'defenseLosses', 'explorationWins', 'explorationLosses', 'interruptedMs', 'offlinePausedMs', 'workCycles', 'tripsCompleted']) if (!safeMs(state.totals[field])) fail('누적 활동 기록이 잘못되었습니다.');
  for (const field of ['eventSequence', 'actionSequence']) if (!safeMs(state[field])) fail('사건 순서가 잘못되었습니다.');
  if (!safeMs(state.createdAt) || state.createdAt > state.time || state.completed && (!safeMs(state.endingAt) || state.endingAt > state.time) || !state.completed && state.endingAt !== null) fail('여정 시작·결말 시각이 잘못되었습니다.');
  if (state.lossBudget !== null && (!record(state.lossBudget) || !safeMs(state.lossBudget.startedAt) || !safeMs(state.lossBudget.remaining) || state.lossBudget.remaining > data.settings.lossStreakCap || !record(state.lossBudget.items) || Object.entries(state.lossBudget.items).some(([id, amount]) => !items.has(id) || !Number.isSafeInteger(amount) || amount < 0))) fail('수비 손실 한도가 잘못되었습니다.');
  try { validateExpansionState(state, data); } catch (error) { fail(error.message); }
  validateGraph(state);
  return state;
}

function validateGraph(value, depth = 0) {
  if (depth > 20) fail('저장 구조가 너무 깊습니다.');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('유효하지 않은 수치가 있습니다.');
  if (Array.isArray(value)) value.forEach(item => validateGraph(item, depth + 1));
  else if (record(value)) for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('허용되지 않는 저장 필드입니다.');
    validateGraph(item, depth + 1);
  }
}

export function validateSummary(summary, data) {
  if (summary === null || summary === undefined) return;
  if (!record(summary)) fail('복귀 요약이 잘못되었습니다.');
  const counter = value => Number.isSafeInteger(value) && value >= 0;
  const map = (value, ids) => record(value) && Object.entries(value).every(([id, amount]) => ids.has(id) && counter(amount));
  const items = new Set(data.items.map(item => item.id));
  const resources = new Set(data.town.resources.map(resource => resource.id));
  const mastery = new Set([...data.activities, ...data.recipes, ...data.farming.crops].map(work => work.id));
  const objectives = new Set(data.objectives.map(objective => objective.id));
  for (const key of ['elapsedMs', 'raids', 'defenseWins', 'defenseLosses', 'explorationWins', 'explorationLosses', 'interruptedMs', 'offlinePausedMs', 'workCycles', 'tripsCompleted', 'excludedMs', 'awayMs']) if (summary[key] !== undefined && !counter(summary[key])) fail('복귀 요약의 시간이거나 횟수가 잘못되었습니다.');
  for (const key of ['produced', 'consumed', 'lost']) if (summary[key] !== undefined && !map(summary[key], items)) fail('복귀 요약의 물품이 잘못되었습니다.');
  for (const key of ['completed', 'firstExplorationPaused']) if (summary[key] !== undefined && typeof summary[key] !== 'boolean') fail('복귀 요약의 진행 상태가 잘못되었습니다.');
  if (summary.stopReason !== undefined && summary.stopReason !== null && typeof summary.stopReason !== 'string') fail('복귀 요약의 중단 이유가 잘못되었습니다.');
  if (summary.events !== undefined && (!Array.isArray(summary.events) || summary.events.length > 1000 || summary.events.some(value => typeof value !== 'string' && (!record(value) || typeof value.text !== 'string')))) fail('복귀 요약의 사건 기록이 잘못되었습니다.');
  if (summary.clearedRegions !== undefined && (!Array.isArray(summary.clearedRegions) || summary.clearedRegions.some(id => !data.regions.some(region => region.id === id)))) fail('복귀 요약의 지역이 잘못되었습니다.');
  for (const [name, ids, counters, maps] of [
    ['town', resources, ['elapsedMs', 'trades', 'builds', 'upgrades', 'taxes', 'repairs', 'ticks'], ['produced', 'consumed', 'overflow']],
    ['farm', items, ['planted', 'harvested', 'autoReplanted'], ['produced', 'consumed']],
  ]) if (summary[name] !== undefined) {
    if (!record(summary[name])) fail('복귀 요약의 마을·농사 기록이 잘못되었습니다.');
    for (const key of counters) if (summary[name][key] !== undefined && !counter(summary[name][key])) fail('복귀 요약의 마을·농사 횟수가 잘못되었습니다.');
    for (const key of maps) if (summary[name][key] !== undefined && !map(summary[name][key], ids)) fail('복귀 요약의 마을·농사 자원이 잘못되었습니다.');
  }
  if (summary.mastery !== undefined && (!record(summary.mastery) || !map(summary.mastery.xp, mastery) || !Array.isArray(summary.mastery.levels) || summary.mastery.levels.some(value => !record(value) || !mastery.has(value.id) || !counter(value.from) || !counter(value.to) || value.from < 1 || value.to < value.from))) fail('복귀 요약의 활동 숙련이 잘못되었습니다.');
  if (summary.objectives !== undefined && (!record(summary.objectives) || !Array.isArray(summary.objectives.claimed) || summary.objectives.claimed.some(id => !objectives.has(id)))) fail('복귀 요약의 의뢰 기록이 잘못되었습니다.');
  validateGraph(summary);
}

export function encodeSave(state, savedAt, { pendingSummary = null, writerId = '' } = {}) {
  if (!Number.isFinite(savedAt) || savedAt < 0) fail('저장 시각이 잘못되었습니다.');
  const payload = { game: 'northward-idle', schemaVersion: SCHEMA_VERSION, savedAt, state, pendingSummary, writerId };
  const payloadText = JSON.stringify(payload);
  return JSON.stringify({ ...payload, checksum: checksum(payloadText) });
}

export function decodeSave(raw, data) {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_LENGTH) fail('파일 크기가 너무 크거나 내용이 없습니다.');
  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw new SaveError('corrupt', '저장 파일이 손상되었습니다. 원본을 보존하고 복구 방법을 선택해 주세요.'); }
  if (!record(envelope) || envelope.game !== 'northward-idle') fail('이 게임의 저장 파일이 아닙니다.');
  validateGraph(envelope);
  const version = envelope.schemaVersion ?? envelope.version;
  if (!Number.isInteger(version) || version < 1) fail('저장 버전이 없습니다.');
  if (version > SCHEMA_VERSION) throw new SaveError('future', '더 새로운 게임 버전에서 만든 저장입니다. 원본은 그대로 보존됩니다.');
  if (!Number.isFinite(envelope.savedAt) || envelope.savedAt < 0) fail('저장 시각이 잘못되었습니다.');
  // All checksummed versions are verified before migrations touch the payload.
  if (version >= 2) {
    const { checksum: expected, ...payload } = envelope;
    if (typeof expected !== 'string' || checksum(JSON.stringify(payload)) !== expected) throw new SaveError('checksum', '저장 파일의 내용이 손상되었습니다. 원본은 그대로 보존됩니다.');
  }
  if (version < SCHEMA_VERSION) {
    if (!record(envelope.state)) fail('이전 저장에 상태가 없습니다.');
    if (version === 2 && envelope.state.schemaVersion !== 2) fail('이전 상태와 저장 버전이 일치하지 않습니다.');
    if (!Number.isSafeInteger(envelope.state.time) || envelope.state.time < 0) fail('이전 저장의 진행 시간이 잘못되었습니다.');
    const originalState = envelope.state;
    const defaults = createGame(data, { seed: originalState.rng ?? 1, now: originalState.time });
    envelope.state = { ...defaults, ...originalState, schemaVersion: SCHEMA_VERSION, autoFood: originalState.autoFood ?? true, town: defaults.town, progression: defaults.progression, farm: defaults.farm };
    // Preserve only collection evidence that the old format actually recorded.
    envelope.state.progression.collection.obtained = {};
    const held = { ...originalState.inventory };
    for (const [id, amount] of Object.entries(originalState.activity?.reserved ?? {})) held[id] = (held[id] ?? 0) + amount;
    for (const item of data.items) {
      const count = Math.max(originalState.totals?.produced?.[item.id] ?? 0, held[item.id] ?? 0);
      if (count > 0) envelope.state.progression.collection.obtained[item.id] = count;
    }
    for (const id of originalState.clearedRegions ?? []) {
      const bossId = data.regions.find(region => region.id === id)?.bossId;
      if (bossId) envelope.state.progression.collection.kills[bossId] = 1;
    }
    envelope.schemaVersion = SCHEMA_VERSION;
    envelope.pendingSummary ??= null;
    envelope.writerId ??= '';
  }
  validateState(envelope.state, data);
  validateSummary(envelope.pendingSummary, data);
  return { state: envelope.state, savedAt: envelope.savedAt, pendingSummary: envelope.pendingSummary ?? null, writerId: envelope.writerId ?? '', migrated: version < SCHEMA_VERSION, raw };
}

export function readSave(storage, data) {
  let raw;
  try { raw = storage.getItem(SAVE_KEY); } catch { throw new SaveError('unavailable', '브라우저 저장 공간에 접근할 수 없습니다. 저장 파일을 내보내 진행을 보관해 주세요.'); }
  if (raw === null) return null;
  return decodeSave(raw, data);
}

export function writeSave(storage, raw) {
  try {
    const previous = storage.getItem(SAVE_KEY);
    if (previous !== null && previous !== raw) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, raw);
  } catch { throw new SaveError('quota', '게임을 저장하지 못했습니다. 저장 파일을 내보낸 뒤 브라우저 저장 공간을 확인해 주세요.'); }
}

export function preserveOriginal(storage, raw) {
  try { storage.setItem(ORIGINAL_KEY, raw); }
  catch { throw new SaveError('quota', '원본을 백업하지 못했습니다. 먼저 원본 저장을 다운로드해 주세요.'); }
}

export function readSettings(storage) {
  try {
    const settings = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}');
    return { reducedMotion: typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : false };
  } catch { return { reducedMotion: false }; }
}

export function writeSettings(storage, settings) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify({ reducedMotion: Boolean(settings.reducedMotion) })); }
  catch { throw new SaveError('quota', '표시 설정을 저장하지 못했습니다.'); }
}
