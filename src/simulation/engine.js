// The simulation owns all time, random draws, costs and rewards. No browser APIs.
// At one timestamp: construction, town production/supply, crops, recovery,
// player attack, enemy attack, work, healing, raid.
import { createTownState, getTownStats, getTownBonuses, getTownActionAvailability, handleTownCommand, processTownDue, nextTownEventTime, grantTownResources, gainTownXp, validateTownContent, validateTownState } from './town.js';
import { createProgressionState, getMasteryInfo, getFarmPlots, getObjectives, getCollectionStats, handleProgressionCommand, processFarmDue, nextFarmEventTime, gainMastery, masteryOutputs, recordObtained, recordKill, validateProgressionContent, validateProgressionState } from './progression.js';
export { createTownState, createProgressionState, getTownStats, getTownActionAvailability, getMasteryInfo, getFarmPlots, getObjectives, getCollectionStats };

export function validateExpansionState(state, data) {
  validateTownState(state, data);
  validateProgressionState(state, data);
  return true;
}
const indexes = new WeakMap();
const DAY_MS = 86400000;

function indexContent(data) {
  if (!indexes.has(data)) {
    const index = {};
    for (const key of ['items', 'skills', 'activities', 'recipes', 'regions', 'enemies']) {
      index[key] = new Map(data[key].map(record => [record.id, record]));
    }
    indexes.set(data, index);
  }
  return indexes.get(data);
}

function assert(value, message) {
  if (!value) throw new Error(`콘텐츠 오류: ${message}`);
}

export function validateContent(data) {
  assert(data && data.meta && data.settings, '게임 정보와 설정이 필요합니다.');
  const maps = {};
  for (const key of ['items', 'skills', 'activities', 'recipes', 'regions', 'enemies']) {
    assert(Array.isArray(data[key]) && data[key].length, `${key} 배열이 비어 있습니다.`);
    maps[key] = new Map();
    for (const record of data[key]) {
      assert(typeof record.id === 'string' && record.id && typeof record.name === 'string' && record.name, `${key}의 ID와 이름`);
      assert(!maps[key].has(record.id), `${key} 중복 ID ${record.id}`);
      maps[key].set(record.id, record);
    }
  }
  const quantities = (value, owner) => {
    assert(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length, `${owner} 재료 목록`);
    for (const [id, amount] of Object.entries(value)) {
      assert(maps.items.has(id), `${owner}가 알 수 없는 아이템 ${id} 참조`);
      assert(Number.isSafeInteger(amount) && amount > 0, `${owner}의 ${id} 수량`);
    }
  };
  for (const item of data.items) {
    assert(['material', 'food', 'equipment', 'trophy'].includes(item.kind), `${item.id} 종류`);
    if (item.kind === 'equipment') {
      assert(['weapon', 'armor', 'charm'].includes(item.slot), `${item.id} 장비 슬롯`);
      assert(item.stats && Object.values(item.stats).every(Number.isFinite), `${item.id} 장비 수치`);
    }
    if (item.kind === 'food') {
      assert(Number.isFinite(item.heal) && item.heal > 0 && Number.isSafeInteger(item.quality) && item.quality > 0, `${item.id} 음식 수치`);
    }
  }
  for (const key of ['activities', 'recipes']) for (const work of data[key]) {
    assert(maps.regions.has(work.regionId), `${work.id} 지역`);
    assert(maps.skills.has(work.skillId), `${work.id} 숙련`);
    assert(Number.isSafeInteger(work.durationMs) && work.durationMs > 0, `${work.id} 작업 시간`);
    quantities(work.outputs, work.id);
    if (key === 'recipes') {
      quantities(work.inputs, work.id);
      assert(Number.isSafeInteger(work.level) && work.level >= 1, `${work.id} 숙련 조건`);
    }
  }
  const ordered = [...data.regions].sort((a, b) => a.index - b.index);
  ordered.forEach((region, position) => {
    assert(region.index === position, `${region.id} 지역 순서`);
    assert(region.enemyIds?.length && region.enemyIds.every(id => maps.enemies.has(id)), `${region.id} 적`);
    assert(maps.enemies.has(region.bossId), `${region.id} 우두머리`);
    assert(region.nextRegionId === (ordered[position + 1]?.id ?? null), `${region.id} 다음 지역 연결`);
    for (const key of ['foodCost', 'foodQuality', 'encountersToBoss', 'raidIntervalMs', 'travelMs']) {
      assert(Number.isSafeInteger(region[key]) && region[key] > 0, `${region.id} ${key}`);
    }
    assert(region.requirements && Object.values(region.requirements).every(v => Number.isFinite(v) && v >= 0), `${region.id} 진입 조건`);
    assert(region.recommendedGear?.every(id => maps.items.get(id)?.kind === 'equipment'), `${region.id} 추천 장비`);
    assert(maps.items.get(region.recommendedFood)?.kind === 'food', `${region.id} 추천 보급`);
  });
  for (const enemy of data.enemies) {
    for (const key of ['maxHp', 'attack', 'attackMs']) assert(Number.isFinite(enemy[key]) && enemy[key] > 0, `${enemy.id} ${key}`);
    assert(Number.isFinite(enemy.defense) && enemy.defense >= 0, `${enemy.id} 방어`);
    assert(['bear', 'wolf', 'boar', 'stag', 'guardian'].includes(enemy.art), `${enemy.id} 아트`);
    quantities(enemy.loot, enemy.id);
  }
  const s = data.settings;
  assert(s.baseStats && Object.values(s.baseStats).every(Number.isFinite), '기본 능력치');
  for (const key of ['maxHp', 'attack', 'attackMs']) assert(s.baseStats[key] > 0, `기본 ${key}`);
  assert(s.baseStats.defense >= 0 && s.baseStats.warmth >= 0 && s.baseStats.critChance >= 0 && s.baseStats.critChance <= 1, '기본 방어·온기·치명타');
  assert(Number.isSafeInteger(s.offlineCapMs) && s.offlineCapMs > 0, '오프라인 계산 상한');
  for (const key of ['focusStopMs', 'combatHpPerLevel', 'combatAttackPerLevel', 'combatDefenseLevels', 'skillXpDivisor', 'gatherXp', 'craftXp', 'combatXp', 'explorationXp', 'passiveHealMs', 'passiveHealAmount', 'recoveryMs', 'lossStreakCap', 'eventLimit']) {
    assert(Number.isFinite(s[key]) && s[key] > 0, `${key} 설정`);
  }
  for (const key of ['lossStreakFraction', 'lossPerDefeatFraction', 'workMinSpeedFactor', 'autoFoodThreshold']) assert(Number.isFinite(s[key]) && s[key] > 0 && s[key] <= 1, `${key} 설정`);
  quantities(s.initialInventory, '시작 소지품');
  for (const slot of ['weapon', 'armor', 'charm']) {
    const id = s.initialEquipment?.[slot];
    assert(maps.items.get(id)?.slot === slot && s.initialInventory[id] >= 1, `시작 장비 ${slot}`);
  }
  assert(Array.isArray(data.combatStyles) && data.combatStyles.some(style => style.id === 'balanced'), '기본 전투 태세');
  const styleIds = new Set();
  for (const style of data.combatStyles) {
    assert(style.id && style.name && !styleIds.has(style.id), '전투 태세 ID');
    styleIds.add(style.id);
    for (const key of ['attackMultiplier', 'defenseMultiplier', 'skillEvery', 'skillDamage', 'guardMultiplier']) assert(Number.isFinite(style[key]) && style[key] > 0, `${style.id} ${key}`);
    assert(Number.isInteger(style.skillEvery) && Number.isFinite(style.attackMs), `${style.id} 행동 주기`);
  }
  validateTownContent(data);
  validateProgressionContent(data);
  indexes.delete(data);
  indexContent(data);
  return true;
}

export function getSkillLevel(xp, xpDivisor = 25) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / xpDivisor));
}

function random(state) {
  let x = state.rng >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0 || 1;
  return state.rng / 4294967296;
}

function event(state, data, type, text) {
  const value = { id: ++state.eventSequence, time: state.time, type, text };
  state.events.push(value);
  if (state.events.length > data.settings.eventLimit) state.events.splice(0, state.events.length - data.settings.eventLimit);
  return value;
}

function recordItems(target, amounts) {
  for (const [id, amount] of Object.entries(amounts)) target[id] = (target[id] || 0) + amount;
}

function produce(state, outputs) {
  recordItems(state.inventory, outputs);
  recordItems(state.totals.produced, outputs);
  recordObtained(state, outputs);
}

function consume(state, inputs) {
  for (const [id, count] of Object.entries(inputs)) state.inventory[id] = Math.max(0, (state.inventory[id] || 0) - count);
  recordItems(state.totals.consumed, inputs);
}

function gainXp(state, data, skillId, amount) {
  const skill = state.skills[skillId];
  if (!skill) return;
  const old = skill.level;
  skill.xp += amount;
  skill.level = getSkillLevel(skill.xp, data.settings.skillXpDivisor);
  if (skill.level > old) event(state, data, 'level', `${indexContent(data).skills.get(skillId).name} 숙련 ${skill.level} 달성`);
}

export function getDerivedStats(state, data) {
  const stats = { ...data.settings.baseStats };
  const index = indexContent(data);
  for (const id of Object.values(state.equipment)) {
    const item = index.items.get(id);
    if (item) for (const [key, value] of Object.entries(item.stats || {})) stats[key] = (stats[key] || 0) + value;
  }
  const level = state.skills.combat?.level || 1;
  stats.maxHp += (level - 1) * data.settings.combatHpPerLevel;
  stats.attack += (level - 1) * data.settings.combatAttackPerLevel;
  stats.defense += Math.floor((level - 1) / data.settings.combatDefenseLevels);
  const townBonuses = state.battle?.townBonuses ?? (state.town ? getTownBonuses(state, data) : {});
  for (const key of ['maxHp', 'attack', 'defense', 'warmth']) stats[key] = (stats[key] || 0) + (townBonuses[key] || 0);
  const style = data.combatStyles.find(record => record.id === state.combatStyle) || data.combatStyles[0];
  stats.attack *= style.attackMultiplier;
  stats.defense = Math.round(stats.defense * style.defenseMultiplier * 10) / 10;
  stats.attackMs += style.attackMs;
  stats.maxHp = Math.round(stats.maxHp);
  stats.attack = Math.round(stats.attack * 10) / 10;
  stats.attackMs = Math.max(1200, Math.round(stats.attackMs + data.settings.focusStopMs));
  stats.critChance = Math.min(0.35, stats.critChance);
  return stats;
}

export function getRegionRequirements(state, data, regionId) {
  const region = indexContent(data).regions.get(regionId);
  const stats = { ...getDerivedStats(state, data), combatLevel: state.skills.combat.level };
  const requirements = region?.requirements || {};
  const names = { attack: '공격', defense: '방어', warmth: '온기', combatLevel: '전투 숙련' };
  const missing = [];
  if (!region) missing.push('알 수 없는 지역입니다.');
  else {
    if (!state.unlockedRegions.includes(regionId)) missing.push('이전 지역을 먼저 돌파해야 합니다.');
    for (const [key, value] of Object.entries(requirements)) if ((stats[key] || 0) < value) missing.push(`${names[key] || key} ${value} 필요 (현재 ${stats[key] || 0})`);
  }
  return { ok: missing.length === 0, requirements, stats, missing };
}

function missingInputs(state, data, recipe) {
  const items = indexContent(data).items;
  return Object.entries(recipe.inputs).filter(([id, amount]) => (state.inventory[id] || 0) < amount).map(([id, amount]) => `${items.get(id).name} ${amount - (state.inventory[id] || 0)}개 부족`);
}

function availableFood(state, data, quality = 0) {
  return data.items.filter(item => item.kind === 'food' && item.quality >= quality && (state.inventory[item.id] || 0) > 0).sort((a, b) => a.quality - b.quality || a.heal - b.heal || a.id.localeCompare(b.id));
}

export function getActivityAvailability(state, data, type, id) {
  if (state.phase === 'defending') return { ok: false, message: '습격을 수비하는 동안 활동을 바꿀 수 없습니다.' };
  if (state.phase === 'recovering') return { ok: false, message: '자동 회복을 마친 뒤 활동을 바꿀 수 있습니다.' };
  if (state.battle) return { ok: false, message: '전투를 마치거나 활동 중지로 귀환한 뒤 변경할 수 있습니다.' };
  const index = indexContent(data);
  if (type === 'explore') {
    const check = getRegionRequirements(state, data, id);
    if (!check.ok) return { ok: false, message: check.missing.join(' · ') };
    const region = index.regions.get(id);
    const foodCount = availableFood(state, data, region.foodQuality).reduce((sum, item) => sum + state.inventory[item.id], 0);
    if (foodCount < region.foodCost) return { ok: false, message: `품질 ${region.foodQuality} 이상의 보급 ${region.foodCost}개가 필요합니다.` };
    return { ok: true, message: state.clearedRegions.includes(id) ? '반복 탐험은 오프라인에도 계속됩니다.' : '첫 돌파는 접속 중에 진행됩니다.' };
  }
  const work = (type === 'gather' ? index.activities : type === 'craft' ? index.recipes : new Map()).get(id);
  if (!work) return { ok: false, message: '알 수 없는 활동입니다.' };
  if (!state.unlockedRegions.includes(work.regionId)) return { ok: false, message: '이전 지역을 먼저 돌파해야 합니다.' };
  if (type === 'craft') {
    if (state.skills[work.skillId].level < work.level) return { ok: false, message: `${index.skills.get(work.skillId).name} 숙련 ${work.level}이 필요합니다.` };
    // Changing a craft refunds its escrow first. Availability must describe
    // exactly the same stock as the command, so UI never blocks a valid swap.
    const refundable = state.activity?.reserved ? { ...state, inventory: { ...state.inventory } } : state;
    if (refundable !== state) recordItems(refundable.inventory, state.activity.reserved);
    const missing = missingInputs(refundable, data, work);
    if (missing.length) return { ok: false, message: missing.join(' · ') };
  }
  return { ok: true, message: '' };
}

export function createGame(data, { seed = 1, now = 0 } = {}) {
  validateContent(data);
  assert(Number.isSafeInteger(now) && now >= 0, '시작 시각');
  const region = [...data.regions].sort((a, b) => a.index - b.index)[0];
  const state = {
    schemaVersion: 3, time: now, rng: (Number(seed) >>> 0) || 1,
    regionId: region.id, unlockedRegions: [region.id], clearedRegions: [],
    inventory: { ...data.settings.initialInventory },
    skills: Object.fromEntries(data.skills.map(skill => [skill.id, { xp: 0, level: 1 }])),
    equipment: { ...data.settings.initialEquipment }, hp: 1,
    activity: null, phase: 'idle', battle: null, suspendedBattle: null,
    nextRaidAt: now + region.raidIntervalMs, nextHealAt: now + data.settings.passiveHealMs,
    recoveryUntil: null, pendingRaids: 0, lossBudget: null, autoFood: true,
    offlineBlocked: false, stopReason: null, events: [], eventSequence: 0, actionSequence: 0, combatStyle: 'balanced',
    totals: { produced: {}, consumed: {}, lost: {}, raids: 0, defenseWins: 0, defenseLosses: 0, explorationWins: 0, explorationLosses: 0, interruptedMs: 0, offlinePausedMs: 0, workCycles: 0, tripsCompleted: 0 },
    completed: false, endingAt: null, createdAt: now,
    town: createTownState(data, { now }), ...createProgressionState(data, { now })
  };
  recordItems(state.inventory, data.farming.initialSeeds);
  state.hp = getDerivedStats(state, data).maxHp;
  event(state, data, 'story', region.story);
  event(state, data, 'guide', '원목·광석·식재료를 모아 음식과 세 종류의 장비를 준비하세요.');
  return state;
}

function refundReserved(state) {
  if (state.activity?.reserved) {
    recordItems(state.inventory, state.activity.reserved);
    state.activity.reserved = null;
  }
}

function endActivity(state, data, reason) {
  refundReserved(state);
  state.activity = null;
  state.suspendedBattle = null;
  state.offlineBlocked = false;
  state.phase = 'idle';
  state.stopReason = reason;
  if (reason) event(state, data, 'stop', reason);
}

function workDuration(state, data, work) {
  const level = state.skills[work.skillId]?.level || 1;
  const mastery = getMasteryInfo(state, data, work.id);
  const townSpeed = getTownBonuses(state, data).workSpeedBps || 0;
  return Math.max(1000, Math.round(work.durationMs * Math.max(data.settings.workMinSpeedFactor, 1 - (level - 1) * 0.015) * (1 - Math.min(data.mastery.combinedWorkSpeedCapBps, mastery.speedBonusBps + townSpeed) / 10000)));
}

function startWorkCycle(state, data) {
  const activity = state.activity;
  const index = indexContent(data);
  const work = (activity.type === 'craft' ? index.recipes : index.activities).get(activity.id);
  if (activity.type === 'craft') {
    const missing = missingInputs(state, data, work);
    if (missing.length) {
      endActivity(state, data, `${work.name} 중단: ${missing.join(' · ')}`);
      return false;
    }
    // Escrow protects an unfinished recipe from raids. It is refunded on cancellation.
    activity.reserved = { ...work.inputs };
    for (const [id, amount] of Object.entries(work.inputs)) state.inventory[id] -= amount;
  }
  activity.durationMs = workDuration(state, data, work);
  activity.progressMs = 0;
  state.phase = 'working';
  return true;
}

function moveRegion(state, data, regionId) {
  if (state.regionId === regionId) return;
  state.regionId = regionId;
  const region = indexContent(data).regions.get(regionId);
  event(state, data, 'travel', `${region.name}에 도착했다. ${region.subtitle}`);
  // Travelling never resets the already scheduled raid clock.
}

export function applyCommand(state, data, command) {
  if (!command || typeof command !== 'object') return { ok: false, message: '명령 형식이 올바르지 않습니다.' };
  const index = indexContent(data);
  const type = command.type;
  const services = expansionServices();
  const expansion = handleTownCommand(state, data, command, services) ?? handleProgressionCommand(state, data, command, services);
  if (expansion) return expansion;
  if (type === 'autoFood') {
    if (typeof command.value !== 'boolean') return { ok: false, message: '자동 보급 설정이 올바르지 않습니다.' };
    state.autoFood = command.value;
    return { ok: true, message: `전투 자동 회복 ${command.value ? '켜짐' : '꺼짐'}` };
  }
  if (state.phase === 'defending' || state.phase === 'recovering') return { ok: false, message: state.phase === 'defending' ? '습격을 수비하는 동안 활동과 장비를 바꿀 수 없습니다.' : '자동 회복을 마친 뒤 변경할 수 있습니다.' };
  if (type === 'stop') {
    if (state.battle) state.battle = null;
    endActivity(state, data, '활동을 중지하고 안전한 곳으로 귀환했다.');
    return { ok: true, message: '활동을 중지했습니다. 진행 중이던 제작 재료는 돌려받습니다.' };
  }
  if (state.battle) {
    if (type === 'explore' && state.activity?.regionId === command.regionId) return { ok: true, message: '현재 탐험을 계속합니다.' };
    return { ok: false, message: '전투를 마치거나 활동 중지로 귀환한 뒤 변경할 수 있습니다.' };
  }
  if (type === 'combatStyle') {
    const style = data.combatStyles.find(record => record.id === command.id);
    if (!style) return { ok: false, message: '알 수 없는 전투 태세입니다.' };
    state.combatStyle = style.id;
    state.hp = Math.min(state.hp, getDerivedStats(state, data).maxHp);
    event(state, data, 'style', `${style.name} 태세로 준비했다.`);
    return { ok: true, message: `${style.name} 태세를 선택했습니다.` };
  }
  if (type === 'equip') {
    const item = index.items.get(command.itemId);
    if (!item || item.kind !== 'equipment' || !(state.inventory[item.id] >= 1)) return { ok: false, message: '소유한 장비만 장착할 수 있습니다.' };
    state.equipment[item.slot] = item.id;
    state.hp = Math.min(state.hp, getDerivedStats(state, data).maxHp);
    event(state, data, 'equip', `${item.name} 장착`);
    return { ok: true, message: `${item.name}을 장착했습니다.` };
  }
  if (type === 'travel') {
    if (!index.regions.has(command.regionId) || !state.unlockedRegions.includes(command.regionId)) return { ok: false, message: '해금한 지역만 이동할 수 있습니다.' };
    if (state.regionId === command.regionId) return { ok: true, message: '이미 이 지역에 있습니다.' };
    endActivity(state, data, null);
    moveRegion(state, data, command.regionId);
    return { ok: true, message: '지역을 이동했습니다.' };
  }
  if (!['gather', 'craft', 'explore'].includes(type)) return { ok: false, message: '알 수 없는 명령입니다.' };
  const id = type === 'explore' ? command.regionId : command.id;
  if (type === 'craft' && command.count !== undefined && (!Number.isSafeInteger(command.count) || command.count <= 0)) return { ok: false, message: '제작 횟수는 1 이상의 정수여야 합니다.' };
  if (state.activity?.type === type && state.activity.id === id) return { ok: true, message: '진행 중인 활동을 계속합니다.' };
  // A cancelled recipe's reserved items may be used by the replacement recipe.
  const availability = getActivityAvailability(state, data, type, id);
  if (!availability.ok) return availability;
  endActivity(state, data, null);
  state.stopReason = null;
  if (type === 'explore') {
    moveRegion(state, data, id);
    const region = index.regions.get(id);
    state.activity = { type, id, regionId: id, encounters: 0, stage: 'travel', progressMs: 0, durationMs: region.travelMs, status: 'active', repeat: state.clearedRegions.includes(id) };
    state.phase = 'exploring';
    event(state, data, 'explore', `${region.name} ${state.activity.repeat ? '반복 탐험' : '첫 돌파'} 시작`);
  } else {
    const work = (type === 'gather' ? index.activities : index.recipes).get(id);
    if (type === 'gather') moveRegion(state, data, work.regionId);
    state.activity = { type, id, regionId: work.regionId, progressMs: 0, durationMs: 0, status: 'active', remaining: type === 'craft' ? command.count ?? null : null, reserved: null };
    startWorkCycle(state, data);
    event(state, data, 'activity', `${work.name} 시작`);
  }
  return { ok: true, message: '활동을 시작했습니다.' };
}

function takeFood(state, data, amount, quality, heal = true) {
  const food = availableFood(state, data, quality);
  if (food.reduce((count, item) => count + state.inventory[item.id], 0) < amount) return false;
  let left = amount;
  for (const item of food) {
    const count = Math.min(left, state.inventory[item.id]);
    consume(state, { [item.id]: count });
    if (heal) state.hp = Math.min(getDerivedStats(state, data).maxHp, state.hp + item.heal * count);
    left -= count;
    if (!left) break;
  }
  return true;
}

function beginBattle(state, data, kind, enemyId) {
  const enemy = indexContent(data).enemies.get(enemyId);
  const stats = getDerivedStats(state, data);
  state.battle = {
    id: ++state.actionSequence, kind, enemyId, enemyHp: enemy.maxHp, enemyMaxHp: enemy.maxHp,
    townBonuses: { ...getTownBonuses(state, data) },
    startedAt: state.time, playerAttackMs: stats.attackMs, enemyAttackMs: enemy.attackMs + data.settings.focusStopMs,
    nextPlayerAt: state.time + stats.attackMs, nextEnemyAt: state.time + enemy.attackMs + data.settings.focusStopMs,
    nextActionAt: state.time + Math.min(stats.attackMs, enemy.attackMs + data.settings.focusStopMs), lastAction: null, turns: 0, playerTurns: 0, guardNext: false
  };
  state.phase = kind === 'raid' ? 'defending' : 'exploring';
  if (kind !== 'raid') state.activity.stage = 'battle';
  event(state, data, 'battle', `${kind === 'raid' ? '수비' : kind === 'boss' ? '돌파' : '조우'}: ${enemy.name}`);
}

function suspendExplorationBattle(state) {
  if (!state.battle || state.battle.kind === 'raid') return;
  state.suspendedBattle = {
    ...state.battle,
    remainingPlayerMs: Math.max(0, state.battle.nextPlayerAt - state.time),
    remainingEnemyMs: Math.max(0, state.battle.nextEnemyAt - state.time)
  };
  state.battle = null;
}

function restoreActivity(state, data) {
  if (!state.activity) { state.phase = 'idle'; return; }
  if (state.offlineBlocked) {
    state.phase = 'idle';
    state.activity.status = 'offline-paused';
    return;
  }
  state.activity.status = 'active';
  if (state.suspendedBattle) {
    const held = state.suspendedBattle;
    state.battle = { ...held, nextPlayerAt: state.time + held.remainingPlayerMs, nextEnemyAt: state.time + held.remainingEnemyMs };
    delete state.battle.remainingPlayerMs;
    delete state.battle.remainingEnemyMs;
    state.battle.nextActionAt = Math.min(state.battle.nextPlayerAt, state.battle.nextEnemyAt);
    state.suspendedBattle = null;
    state.phase = 'exploring';
    // A raid may have used newer town bonuses than this preserved encounter.
    // Returning to its snapshot must never leave HP above that encounter's cap.
    state.hp = Math.min(state.hp, getDerivedStats(state, data).maxHp);
    return;
  }
  state.phase = state.activity.type === 'explore' ? 'exploring' : 'working';
}

function startRaid(state, data, counted = false) {
  const region = indexContent(data).regions.get(state.regionId);
  if (!counted) state.totals.raids++;
  if (state.phase === 'defending' || state.phase === 'recovering') {
    state.pendingRaids++;
    return;
  }
  suspendExplorationBattle(state);
  const enemyId = region.enemyIds[Math.floor(random(state) * region.enemyIds.length)];
  beginBattle(state, data, 'raid', enemyId);
  event(state, data, 'raid', `${region.name}에 습격이 닥쳤다. 진행 중인 활동을 보존하고 수비한다.`);
}

function loseMaterials(state, data) {
  const eligible = data.items.filter(item => ['material', 'food'].includes(item.kind));
  if (!state.lossBudget) {
    state.lossBudget = {
      startedAt: state.time, remaining: data.settings.lossStreakCap,
      items: Object.fromEntries(eligible.map(item => [item.id, Math.floor((state.inventory[item.id] || 0) * data.settings.lossStreakFraction)]))
    };
  }
  const losses = {};
  for (const item of eligible) {
    const count = state.inventory[item.id] || 0;
    const amount = Math.min(Math.max(0, count - 1), Math.ceil(count * data.settings.lossPerDefeatFraction), state.lossBudget.items[item.id] || 0, state.lossBudget.remaining);
    if (amount <= 0) continue;
    state.inventory[item.id] -= amount;
    state.lossBudget.items[item.id] -= amount;
    state.lossBudget.remaining -= amount;
    losses[item.id] = amount;
  }
  recordItems(state.totals.lost, losses);
  return losses;
}

function battleVictory(state, data, battle) {
  const index = indexContent(data);
  const enemy = index.enemies.get(battle.enemyId);
  recordKill(state, enemy.id);
  state.battle = null;
  const region = index.regions.get(state.regionId);
  gainXp(state, data, 'combat', data.settings.combatXp * (region.index + 1) * (battle.kind === 'boss' ? 3 : 1));
  produce(state, enemy.loot);
  event(state, data, 'victory', `${enemy.name}을 ${battle.kind === 'raid' ? '막아냈다' : '넘어섰다'}.`);
  if (battle.kind === 'raid') {
    state.totals.defenseWins++;
    state.lossBudget = null;
    restoreActivity(state, data);
    return;
  }
  state.totals.explorationWins++;
  const explored = index.regions.get(state.activity.regionId);
  gainXp(state, data, 'exploration', data.settings.explorationXp * (explored.index + 1));
  if (battle.kind === 'boss') {
    state.totals.tripsCompleted++;
    if (!state.clearedRegions.includes(explored.id)) {
      state.clearedRegions.push(explored.id);
      event(state, data, 'clear', explored.clearText);
      if (explored.nextRegionId) {
        state.unlockedRegions.push(explored.nextRegionId);
        const next = index.regions.get(explored.nextRegionId);
        event(state, data, 'unlock', `${next.name}의 채집과 제작이 열렸다. ${next.story}`);
      } else {
        state.completed = true;
        state.endingAt = state.time;
        event(state, data, 'ending', data.meta.ending);
      }
    }
    state.activity.encounters = 0;
    state.activity.repeat = true;
  } else state.activity.encounters++;
  state.activity.stage = 'travel';
  state.activity.progressMs = 0;
  state.activity.durationMs = Math.round(explored.travelMs * Math.max(0.65, 1 - (state.skills.exploration.level - 1) * 0.02));
  state.phase = 'exploring';
}

function battleDefeat(state, data, battle) {
  state.battle = null;
  state.hp = 1;
  if (battle.kind === 'raid') {
    state.totals.defenseLosses++;
    const lost = loseMaterials(state, data);
    const count = Object.values(lost).reduce((sum, value) => sum + value, 0);
    event(state, data, 'defeat', `수비 패배. 일반 재료·보급 ${count}개 손실. 숙련·장비·해금은 보존된다.`);
  } else {
    state.totals.explorationLosses++;
    const region = indexContent(data).regions.get(state.activity.regionId);
    // An unsuccessful expedition spends at most one additional supply unit.
    const food = availableFood(state, data, region.foodQuality)[0];
    if (food) {
      state.inventory[food.id]--;
      recordItems(state.totals.lost, { [food.id]: 1 });
    }
    endActivity(state, data, '탐험에서 쓰러져 귀환했다. 음식과 장비를 정비하면 다시 도전할 수 있다.');
  }
  state.phase = 'recovering';
  state.recoveryUntil = state.time + data.settings.recoveryMs;
  event(state, data, 'recovery', `${Math.round(data.settings.recoveryMs / 1000)}초 동안 자동 회복한 뒤 보존한 활동을 재개한다.`);
}

function battleAction(state, data, actor) {
  const battle = state.battle;
  const stats = getDerivedStats(state, data);
  const enemy = indexContent(data).enemies.get(battle.enemyId);
  if (actor === 'player' && state.autoFood && state.hp <= stats.maxHp * data.settings.autoFoodThreshold) {
    const quality = battle.kind === 'raid' ? 0 : indexContent(data).regions.get(state.activity.regionId).foodQuality;
    const food = availableFood(state, data, quality)[0];
    if (food) {
      takeFood(state, data, 1, quality);
      event(state, data, 'food', `${food.name}으로 체력을 회복했다.`);
    }
  }
  const critical = random(state) < (actor === 'player' ? stats.critChance : 0.04);
  const variance = 0.9 + random(state) * 0.2;
  const attack = actor === 'player' ? stats.attack : enemy.attack;
  const defense = actor === 'player' ? enemy.defense : stats.defense;
  const style = data.combatStyles.find(record => record.id === state.combatStyle) || data.combatStyles[0];
  let skill = null;
  let multiplier = 1;
  if (actor === 'player') {
    battle.playerTurns++;
    if (battle.playerTurns % style.skillEvery === 0) {
      skill = style.skillName;
      multiplier = style.skillDamage;
      battle.guardNext = style.guardMultiplier < 1;
      event(state, data, 'skill', `${skill} 발동`);
    }
  } else if (battle.guardNext) {
    multiplier = style.guardMultiplier;
    battle.guardNext = false;
  }
  const damage = Math.max(1, Math.round(Math.max(1, attack - defense) * variance * (critical ? 1.6 : 1) * multiplier));
  battle.lastAction = { id: ++state.actionSequence, time: state.time, actor, damage, critical, skill };
  battle.turns++;
  if (actor === 'player') {
    battle.enemyHp = Math.max(0, battle.enemyHp - damage);
    battle.nextPlayerAt += battle.playerAttackMs;
    // Focus Stop is shared simulation time: the other actor's action clock
    // pauses too, so simultaneous attacks cannot overwrite one another.
    battle.nextEnemyAt += data.settings.focusStopMs;
    if (battle.enemyHp <= 0) { battleVictory(state, data, battle); return; }
  } else {
    state.hp = Math.max(0, state.hp - damage);
    battle.nextEnemyAt += battle.enemyAttackMs;
    battle.nextPlayerAt += data.settings.focusStopMs;
    if (state.hp <= 0) { battleDefeat(state, data, battle); return; }
  }
  battle.nextActionAt = Math.min(battle.nextPlayerAt, battle.nextEnemyAt);
}

function completeWork(state, data) {
  const activity = state.activity;
  const work = (activity.type === 'craft' ? indexContent(data).recipes : indexContent(data).activities).get(activity.id);
  if (activity.reserved) {
    recordItems(state.totals.consumed, activity.reserved);
    activity.reserved = null;
  }
  produce(state, masteryOutputs(state, data, work.id, work.outputs));
  gainMastery(state, data, work.id, expansionServices());
  if (activity.type === 'gather' && work.skillId === 'foraging' && (state.progression.mastery[work.id].xp / data.mastery.xpPerCycle) % data.town.settings.seedDropEveryCycles === 0) {
    const crop = data.farming.crops.find(c => c.regionId === work.regionId);
    if (crop) produce(state, { [Object.keys(crop.inputs)[0]]: 1 });
  }
  state.totals.workCycles++;
  gainXp(state, data, work.skillId, (activity.type === 'craft' ? data.settings.craftXp : data.settings.gatherXp) * (indexContent(data).regions.get(work.regionId).index + 1));
  if (activity.type === 'craft') {
    event(state, data, 'craft', `${work.name} 완료`);
    if (activity.remaining !== null) {
      activity.remaining--;
      if (activity.remaining <= 0) {
        endActivity(state, data, '지정한 제작을 모두 마쳤다.');
        return;
      }
    }
  }
  startWorkCycle(state, data);
}

function completeTravel(state, data) {
  const region = indexContent(data).regions.get(state.activity.regionId);
  if (!takeFood(state, data, region.foodCost, region.foodQuality)) {
    endActivity(state, data, `품질 ${region.foodQuality} 이상의 탐험 보급이 부족하여 귀환했다.`);
    return;
  }
  state.activity.progressMs = 0;
  const boss = state.activity.encounters >= region.encountersToBoss;
  const enemyId = boss ? region.bossId : region.enemyIds[Math.floor(random(state) * region.enemyIds.length)];
  beginBattle(state, data, boss ? 'boss' : 'exploration', enemyId);
}

function progressTime(state, elapsedMs) {
  if (elapsedMs <= 0) return;
  if (state.phase === 'defending' || state.phase === 'recovering') state.totals.interruptedMs += elapsedMs;
  if (state.offlineBlocked) state.totals.offlinePausedMs += elapsedMs;
  if (state.activity && !state.battle && !state.offlineBlocked && ['working', 'exploring'].includes(state.phase)) state.activity.progressMs += elapsedMs;
  state.time += elapsedMs;
}

function nextEventTime(state) {
  let next = Math.min(state.nextRaidAt, state.nextHealAt, nextTownEventTime(state), nextFarmEventTime(state));
  if (state.recoveryUntil !== null) next = Math.min(next, state.recoveryUntil);
  if (state.battle) next = Math.min(next, state.battle.nextPlayerAt, state.battle.nextEnemyAt);
  if (state.activity && !state.battle && !state.offlineBlocked && ['working', 'exploring'].includes(state.phase)) next = Math.min(next, state.time + Math.max(0, state.activity.durationMs - state.activity.progressMs));
  return next;
}

function processDue(state, data) {
  const now = state.time;
  const services = expansionServices();
  processTownDue(state, data, services);
  processFarmDue(state, data, services);
  if (state.recoveryUntil !== null && state.recoveryUntil <= now) {
    state.recoveryUntil = null;
    state.hp = getDerivedStats(state, data).maxHp;
    event(state, data, 'recovered', '체력을 회복했다. 보존한 활동을 이어간다.');
    restoreActivity(state, data);
  }
  const battleId = state.battle?.id;
  if (state.battle && state.battle.nextPlayerAt <= now) battleAction(state, data, 'player');
  if (state.battle && state.battle.id === battleId && state.battle.nextEnemyAt <= now) battleAction(state, data, 'enemy');
  if (state.activity && !state.battle && !state.offlineBlocked && ['working', 'exploring'].includes(state.phase) && state.activity.progressMs >= state.activity.durationMs) {
    if (state.activity.type === 'explore') completeTravel(state, data);
    else completeWork(state, data);
  }
  if (state.nextHealAt <= now) {
    if (!state.battle && state.phase !== 'recovering') state.hp = Math.min(getDerivedStats(state, data).maxHp, state.hp + data.settings.passiveHealAmount);
    state.nextHealAt += data.settings.passiveHealMs;
  }
  if (state.nextRaidAt <= now) {
    const region = indexContent(data).regions.get(state.regionId);
    state.nextRaidAt += region.raidIntervalMs;
    startRaid(state, data);
  }
  if (state.pendingRaids > 0 && !['defending', 'recovering'].includes(state.phase)) {
    state.pendingRaids--;
    startRaid(state, data, true);
  }
}

function snapshotTotals(totals) {
  return { ...totals, produced: { ...totals.produced }, consumed: { ...totals.consumed }, lost: { ...totals.lost } };
}

function differenceItems(after, before) {
  return Object.fromEntries(Object.entries(after).map(([id, value]) => [id, value - (before[id] || 0)]).filter(([, value]) => value !== 0));
}

function expansionServices() { return { produce, consume, event, grantTownResources, gainTownXp }; }

function expansionSnapshot(state) {
  return { town: structuredClone(state.town.totals), farm: structuredClone(state.farm.totals),
    mastery: { ...state.progression.totals.masteryXp }, levels: Object.fromEntries(Object.entries(state.progression.mastery).map(([id, value]) => [id, value.level])),
    objectives: [...state.progression.claimedObjectives] };
}

function expansionSummary(state, before, elapsedMs) {
  const town = { elapsedMs };
  for (const key of ['produced', 'consumed', 'overflow']) town[key] = differenceItems(state.town.totals[key], before.town[key]);
  for (const key of ['trades', 'builds', 'upgrades', 'taxes', 'repairs', 'ticks']) town[key] = state.town.totals[key] - before.town[key];
  const farm = {};
  for (const key of ['produced', 'consumed']) farm[key] = differenceItems(state.farm.totals[key], before.farm[key]);
  for (const key of ['planted', 'harvested', 'autoReplanted']) farm[key] = state.farm.totals[key] - before.farm[key];
  return { town, farm, mastery: { xp: differenceItems(state.progression.totals.masteryXp, before.mastery),
    levels: Object.entries(state.progression.mastery).filter(([id, value]) => value.level > before.levels[id]).map(([id, value]) => ({ id, from: before.levels[id], to: value.level })) },
    objectives: { claimed: state.progression.claimedObjectives.filter(id => !before.objectives.includes(id)) } };
}

export function advanceGame(state, data, elapsedMs, { offline = false } = {}) {
  if (!Number.isFinite(elapsedMs)) throw new Error('경과 시간은 유한한 숫자여야 합니다.');
  const duration = Math.max(0, Math.floor(elapsedMs));
  if (!Number.isSafeInteger(state.time + duration)) throw new Error('계산할 수 있는 시간 범위를 벗어났습니다.');
  const before = snapshotTotals(state.totals);
  const beforeExpansion = expansionSnapshot(state);
  const beforeCleared = [...state.clearedRegions];
  const initialTime = state.time;
  const firstExploration = state.activity?.type === 'explore' && !state.clearedRegions.includes(state.activity.regionId);
  const blocked = Boolean(offline && firstExploration);
  if (blocked && !state.offlineBlocked) {
    suspendExplorationBattle(state);
    state.offlineBlocked = true;
    state.activity.status = 'offline-paused';
    if (!['defending', 'recovering'].includes(state.phase)) state.phase = 'idle';
    event(state, data, 'paused', '첫 돌파 탐험은 접속 중에 이어진다. 현재 전투와 이동 진행은 보존했다.');
  } else if (!blocked && state.offlineBlocked) {
    state.offlineBlocked = false;
    if (!['defending', 'recovering'].includes(state.phase)) restoreActivity(state, data);
    event(state, data, 'resumed', '보존한 첫 돌파 탐험을 이어간다.');
  }
  const target = initialTime + duration;
  while (true) {
    const next = nextEventTime(state);
    if (next > target) { progressTime(state, target - state.time); break; }
    if (next < state.time) throw new Error('시뮬레이션 사건 시각이 현재보다 이전입니다.');
    progressTime(state, next - state.time);
    processDue(state, data);
  }
  const summary = { elapsedMs: state.time - initialTime, produced: differenceItems(state.totals.produced, before.produced), consumed: differenceItems(state.totals.consumed, before.consumed), lost: differenceItems(state.totals.lost, before.lost), clearedRegions: state.clearedRegions.filter(id => !beforeCleared.includes(id)) };
  for (const key of ['raids', 'defenseWins', 'defenseLosses', 'explorationWins', 'explorationLosses', 'interruptedMs', 'offlinePausedMs', 'workCycles', 'tripsCompleted']) summary[key] = state.totals[key] - before[key];
  summary.completed = state.completed;
  summary.stopReason = state.stopReason;
  summary.firstExplorationPaused = state.offlineBlocked;
  Object.assign(summary, expansionSummary(state, beforeExpansion, summary.elapsedMs));
  return summary;
}

export const SIMULATION_DAY_MS = DAY_MS;
