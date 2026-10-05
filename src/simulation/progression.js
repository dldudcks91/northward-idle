// Passive crops, per-action mastery, objectives and collection records.
// All timers share the engine's logical millisecond clock.
import { getTownStorageState } from './town.js';
const own = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const requireValue = (value, message) => { if (!value) throw new Error(`성장 데이터/상태 오류: ${message}`); };
const records = (data) => [...data.activities.map(x => ({ ...x, kind: 'gather' })), ...data.recipes.map(x => ({ ...x, kind: 'craft' })), ...data.farming.crops.map(x => ({ ...x, kind: 'farm' }))];
const masteryLevel = (xp, data) => Math.min(data.mastery.maxLevel, 1 + Math.floor(Math.sqrt(xp / data.mastery.xpDivisor)));
const add = (map, entries) => { for (const [id, n] of Object.entries(entries)) map[id] = (map[id] || 0) + n; };
const blankCost = () => ({ resources: {}, items: {}, coins: 0 });
const result = (ok, message = '', extra = {}) => ({ ok, message, cost: blankCost(), maxCount: 1, durationMs: 0, targetLevel: null, ...extra });

export function createProgressionState(data, { now = 0 } = {}) {
  const obtained = { ...data.settings.initialInventory };
  add(obtained, data.farming.initialSeeds);
  return {
    progression: {
      createdAt: now,
      mastery: Object.fromEntries(records(data).map(r => [r.id, { xp: 0, level: 1 }])),
      yieldRemainders: {}, collection: { obtained, kills: {} }, claimedObjectives: [],
      totals: { masteryXp: {}, objectiveClaims: 0 }
    },
    farm: {
      createdAt: now,
      plots: Object.fromEntries(data.farming.plots.map(r => [r.id, { cropId: null, status: 'empty', plantedAt: null, readyAt: null, autoReplant: false, outputs: {}, cycles: 0, stopReason: null }])),
      totals: { planted: 0, harvested: 0, autoReplanted: 0, produced: {}, consumed: {} }
    }
  };
}

export function getMasteryInfo(state, data, id) {
  let selected;
  if (id === undefined) selected = records(data);
  else {
    let found = data.activities.find(r => r.id === id); let kind = 'gather';
    if (!found) { found = data.recipes.find(r => r.id === id); kind = 'craft'; }
    if (!found) { found = data.farming.crops.find(r => r.id === id); kind = 'farm'; }
    selected = found ? [{ ...found, kind }] : [];
  }
  const list = selected.map(record => {
    const value = state.progression.mastery[record.id] || { xp: 0, level: 1 };
    const levelStartXp = (value.level - 1) ** 2 * data.mastery.xpDivisor;
    const nextLevelXp = value.level >= data.mastery.maxLevel ? null : value.level ** 2 * data.mastery.xpDivisor;
    return { id: record.id, name: record.name, kind: record.kind, xp: value.xp, level: value.level,
      maxLevel: data.mastery.maxLevel, nextLevelXp, levelStartXp, progressXp: value.xp - levelStartXp, progressMaxXp: nextLevelXp === null ? 0 : nextLevelXp - levelStartXp,
      speedBonusBps: Math.min(data.mastery.maxSpeedBonusBps, (value.level - 1) * data.mastery.speedBpsPerLevel),
      yieldBonusBps: Math.min(data.mastery.maxYieldBonusBps, (value.level - 1) * data.mastery.yieldBpsPerLevel) };
  });
  return id === undefined ? list : list.find(record => record.id === id) || null;
}

export function gainMastery(state, data, id, services) {
  const value = state.progression.mastery[id];
  if (!value) return;
  const previous = value.level;
  value.xp += data.mastery.xpPerCycle;
  value.level = masteryLevel(value.xp, data);
  add(state.progression.totals.masteryXp, { [id]: data.mastery.xpPerCycle });
  if (value.level > previous) services.event(state, data, 'mastery', `${getMasteryInfo(state, data, id).name} 마스터리 ${value.level} 달성`);
}

export function masteryOutputs(state, data, id, outputs) {
  const bonus = getMasteryInfo(state, data, id)?.yieldBonusBps || 0;
  const remainders = state.progression.yieldRemainders[id] ||= {};
  const actual = {};
  for (const [itemId, amount] of Object.entries(outputs)) {
    const extra = amount * bonus + (remainders[itemId] || 0);
    actual[itemId] = amount + Math.floor(extra / 10000);
    remainders[itemId] = extra % 10000;
  }
  return actual;
}

export function recordObtained(state, outputs) { add(state.progression.collection.obtained, outputs); }
export function recordKill(state, enemyId) { add(state.progression.collection.kills, { [enemyId]: 1 }); }

function unlockMessage(state, data, conditions = {}) {
  if ((conditions.clearedRegions || 0) > state.clearedRegions.length) return `봉화 ${conditions.clearedRegions}개 돌파 필요`;
  if (conditions.regionId && !state.unlockedRegions.includes(conditions.regionId)) return `${data.regions.find(r => r.id === conditions.regionId)?.name || conditions.regionId} 해금 필요`;
  return '';
}

function missingItems(state, data, inputs) {
  const missing = Object.entries(inputs).filter(([id, n]) => (state.inventory[id] || 0) < n);
  return missing.map(([id, n]) => `${data.items.find(i => i.id === id)?.name || id} ${n - (state.inventory[id] || 0)}개 부족`).join(' · ');
}

export function getFarmPlots(state, data) {
  return data.farming.plots.map(record => {
    const plot = state.farm.plots[record.id];
    const locked = unlockMessage(state, data, record.requirements);
    const crop = data.farming.crops.find(c => c.id === plot.cropId);
    return { id: record.id, name: record.name, unlocked: !locked, unlockMessage: locked,
      status: plot.status, cropId: plot.cropId, cropName: crop?.name || null,
      plantedAt: plot.plantedAt, readyAt: plot.readyAt, remainingMs: plot.status === 'growing' ? Math.max(0, plot.readyAt - state.time) : 0,
      autoReplant: plot.autoReplant, outputs: { ...plot.outputs }, cycles: plot.cycles, stopReason: plot.stopReason,
      harvestAvailability: getProgressionActionAvailability(state, data, { type: 'farmHarvest', plotId: record.id }),
      crops: data.farming.crops.map(c => ({ id: c.id, name: c.name,
        durationMs: Math.round(c.durationMs * (1 - (getMasteryInfo(state, data, c.id)?.speedBonusBps || 0) / 10000)),
        inputs: { ...c.inputs }, outputs: { ...c.outputs }, description: c.description,
        availability: getProgressionActionAvailability(state, data, { type: 'farmPlant', plotId: record.id, cropId: c.id, autoReplant: plot.autoReplant }) })) };
  });
}

function objectiveProgress(state, data, objective) {
  return objective.requirements.map(requirement => {
    let current = 0;
    let label = '';
    switch (requirement.type) {
      case 'itemObtained': current = state.progression.collection.obtained[requirement.id] || 0; label = `${data.items.find(i => i.id === requirement.id)?.name} 누적 획득`; break;
      case 'enemyKills': current = state.progression.collection.kills[requirement.id] || 0; label = `${data.enemies.find(i => i.id === requirement.id)?.name} 처치`; break;
      case 'regionCleared': current = state.clearedRegions.includes(requirement.id) ? 1 : 0; label = `${data.regions.find(i => i.id === requirement.id)?.name} 돌파`; break;
      case 'clearedRegions': current = state.clearedRegions.length; label = '돌파한 봉화'; break;
      case 'masteryLevel': current = state.progression.mastery[requirement.id]?.level || 1; label = `${getMasteryInfo(state, data, requirement.id)?.name} 마스터리`; break;
      case 'buildingLevel': current = state.town.buildings[requirement.id]?.level || 0; label = `${data.town.buildings.find(i => i.id === requirement.id)?.name} 단계`; break;
      case 'farmHarvests': current = state.farm.totals.harvested; label = '농사 수확'; break;
      case 'population': current = state.town.population; label = '마을 주민'; break;
      case 'townLevel': current = state.town.level; label = '마을 숙련'; break;
    }
    return { label, current, target: requirement.amount };
  });
}

function objectiveAvailability(state, data, objective) {
  const extra = { cost: objective.cost };
  if (state.progression.claimedObjectives.includes(objective.id)) return result(false, '이미 완료 보상을 받았습니다.', extra);
  const locked = unlockMessage(state, data, objective.unlock);
  if (locked) return result(false, locked, extra);
  const unmet = objectiveProgress(state, data, objective).find(r => r.current < r.target);
  if (unmet) return result(false, `${unmet.label} ${unmet.current} / ${unmet.target}`, extra);
  const missing = missingItems(state, data, objective.cost.items || {});
  if (missing) return result(false, missing, extra);
  for (const [id, n] of Object.entries(objective.cost.resources || {})) if ((state.town.resources[id] || 0) < n) return result(false, `${data.town.resources.find(r => r.id === id)?.name} ${n} 필요`, extra);
  if (state.town.coins < (objective.cost.coins || 0)) return result(false, '마을 주화가 부족합니다.', extra);
  for (const [id, amount] of Object.entries(objective.rewards.items || {})) {
    const afterCost = (state.inventory[id] || 0) - (objective.cost.items?.[id] || 0);
    const reserved = (state.activity?.reserved?.[id] || 0) + (state.town.construction?.reserved.items?.[id] || 0);
    if (afterCost + reserved + amount > 1e9) return result(false, `${data.items.find(item => item.id === id)?.name} 보상을 가방에 더 보관할 수 없습니다.`, extra);
  }
  const weights = Object.fromEntries(data.town.resources.map(r => [r.id, r.weight]));
  const rewardSpace = Object.entries(objective.rewards.resources || {}).reduce((n, [id, amount]) => n + amount * weights[id], 0);
  const releasedSpace = Object.entries(objective.cost.resources || {}).reduce((n, [id, amount]) => n + amount * weights[id], 0);
  const storage = getTownStorageState(state, data);
  if (rewardSpace > storage.free + releasedSpace) return result(false, `보상 공간 ${rewardSpace}칸이 필요합니다. 창고를 확장하거나 잉여 자원을 교역·기부·정리하세요.`, extra);
  for (const [id, amount] of Object.entries(objective.rewards.resources || {})) {
    const afterCost = (state.town.resources[id] || 0) - (objective.cost.resources?.[id] || 0);
    if (afterCost + (storage.reservedResources[id] || 0) + amount > storage.resourceCapacity[id]) return result(false, `${data.town.resources.find(r => r.id === id)?.name} 보상 ${amount}개의 전용 창고 공간이 필요합니다. 우선순위를 올리거나 창고를 확장·정리하세요.`, extra);
  }
  if (state.town.coins - (objective.cost.coins || 0) + (state.town.construction?.reserved.coins || 0) + (objective.rewards.coins || 0) > 1e9) return result(false, '보상 주화를 보관할 공간이 필요합니다.', extra);
  return result(true, '실제 재료를 전달하고 보상을 한 번 받습니다.', extra);
}

export function getObjectives(state, data) {
  return data.objectives.map(objective => {
    const availability = objectiveAvailability(state, data, objective);
    return { id: objective.id, name: objective.name, description: objective.description, category: objective.category,
      claimed: state.progression.claimedObjectives.includes(objective.id), ready: availability.ok,
      unlocked: !unlockMessage(state, data, objective.unlock), progress: objectiveProgress(state, data, objective),
      cost: objective.cost, rewards: objective.rewards, availability };
  });
}

export function getCollectionStats(state, data) {
  const items = data.items.map(item => ({ id: item.id, name: item.name, kind: item.kind,
    obtained: state.progression.collection.obtained[item.id] || 0, owned: state.inventory[item.id] || 0,
    discovered: (state.progression.collection.obtained[item.id] || 0) > 0 }));
  const enemies = data.enemies.map(enemy => ({ id: enemy.id, name: enemy.name,
    kills: state.progression.collection.kills[enemy.id] || 0, discovered: (state.progression.collection.kills[enemy.id] || 0) > 0 }));
  const discoveredItems = items.filter(i => i.discovered).length;
  const defeatedEnemies = enemies.filter(i => i.discovered).length;
  return { discoveredItems, totalItems: items.length, defeatedEnemies, totalEnemies: enemies.length,
    percent: Math.floor((discoveredItems + defeatedEnemies) * 100 / (items.length + enemies.length)), items, enemies };
}

export function getProgressionActionAvailability(state, data, command) {
  if (command.type === 'claimObjective') {
    const objective = data.objectives.find(o => o.id === command.objectiveId);
    return objective ? objectiveAvailability(state, data, objective) : result(false, '알 수 없는 의뢰입니다.');
  }
  if (!['farmPlant', 'farmHarvest', 'farmAutoReplant'].includes(command.type)) return null;
  const definition = data.farming.plots.find(p => p.id === command.plotId);
  if (!definition) return result(false, '알 수 없는 텃밭입니다.');
  const plot = state.farm.plots[definition.id];
  const locked = unlockMessage(state, data, definition.requirements);
  if (locked) return result(false, locked);
  if (command.type === 'farmAutoReplant') return typeof command.enabled === 'boolean' ? result(true) : result(false, '자동 재파종 설정이 올바르지 않습니다.');
  if (command.type === 'farmHarvest') return plot.status === 'ready' ? result(true, '익은 작물을 한 번 수확합니다.') : result(false, plot.status === 'growing' ? '아직 작물이 자라고 있습니다.' : '수확할 작물이 없습니다.');
  if (plot.status !== 'empty') return result(false, '현재 작물을 수확한 뒤 다시 심을 수 있습니다.');
  const crop = data.farming.crops.find(c => c.id === command.cropId);
  if (!crop) return result(false, '알 수 없는 작물입니다.');
  if (!state.unlockedRegions.includes(crop.regionId)) return result(false, '작물의 지역을 먼저 해금해야 합니다.');
  if (command.autoReplant !== undefined && typeof command.autoReplant !== 'boolean') return result(false, '자동 재파종 설정이 올바르지 않습니다.');
  const extra = { cost: { ...blankCost(), items: crop.inputs }, durationMs: Math.round(crop.durationMs * (1 - getMasteryInfo(state, data, crop.id).speedBonusBps / 10000)) };
  const missing = missingItems(state, data, crop.inputs);
  return missing ? result(false, missing, extra) : result(true, '씨앗을 소비하고 독립적인 성장을 시작합니다.', extra);
}

function plant(state, data, plot, crop, services, automatic = false) {
  services.consume(state, crop.inputs);
  add(state.farm.totals.consumed, crop.inputs);
  const info = getMasteryInfo(state, data, crop.id);
  plot.cropId = crop.id; plot.status = 'growing'; plot.plantedAt = state.time;
  plot.readyAt = state.time + Math.max(1000, Math.round(crop.durationMs * (1 - info.speedBonusBps / 10000)));
  plot.outputs = masteryOutputs(state, data, crop.id, crop.outputs);
  plot.stopReason = null;
  state.farm.totals.planted++;
  if (automatic) state.farm.totals.autoReplanted++;
  services.event(state, data, 'farm', `${crop.name} ${automatic ? '자동 재파종' : '심기'}`);
}

function harvest(state, data, plot, services) {
  const crop = data.farming.crops.find(c => c.id === plot.cropId);
  services.produce(state, plot.outputs);
  add(state.farm.totals.produced, plot.outputs);
  gainMastery(state, data, crop.id, services);
  state.farm.totals.harvested++; plot.cycles++;
  services.event(state, data, 'farm', `${crop.name} 수확 완료`);
  plot.status = 'empty'; plot.cropId = null; plot.plantedAt = null; plot.readyAt = null; plot.outputs = {};
  if (plot.autoReplant) {
    const missing = missingItems(state, data, crop.inputs);
    if (missing) { plot.stopReason = `${missing}하여 자동 재파종 종료`; services.event(state, data, 'farm-stop', plot.stopReason); }
    else plant(state, data, plot, crop, services, true);
  }
}

export function nextFarmEventTime(state) {
  return Math.min(Infinity, ...Object.values(state.farm.plots).filter(p => p.status === 'growing').map(p => p.readyAt));
}

export function processFarmDue(state, data, services) {
  for (const definition of data.farming.plots) {
    const plot = state.farm.plots[definition.id];
    if (plot.status !== 'growing' || plot.readyAt > state.time) continue;
    plot.status = 'ready';
    if (plot.autoReplant) harvest(state, data, plot, services);
    else services.event(state, data, 'farm-ready', `${definition.name}의 작물이 수확을 기다립니다.`);
  }
}

export function handleProgressionCommand(state, data, command, services) {
  const availability = getProgressionActionAvailability(state, data, command);
  if (!availability) return null;
  if (!availability.ok) return availability;
  if (command.type === 'claimObjective') {
    const objective = data.objectives.find(o => o.id === command.objectiveId);
    services.consume(state, objective.cost.items || {});
    for (const [id, n] of Object.entries(objective.cost.resources || {})) state.town.resources[id] -= n;
    add(state.town.totals.consumed, objective.cost.resources || {});
    state.town.coins -= objective.cost.coins || 0;
    services.produce(state, objective.rewards.items || {});
    services.grantTownResources(state, data, objective.rewards.resources || {});
    state.town.coins += objective.rewards.coins || 0;
    services.gainTownXp(state, data, objective.rewards.townXp || 0);
    state.progression.claimedObjectives.push(objective.id);
    state.progression.totals.objectiveClaims++;
    services.event(state, data, 'objective', `${objective.name} 완료 · 재료를 전달하고 보상을 받았다.`);
  } else {
    const plot = state.farm.plots[command.plotId];
    if (command.type === 'farmPlant') {
      plot.autoReplant = command.autoReplant ?? plot.autoReplant;
      plant(state, data, plot, data.farming.crops.find(c => c.id === command.cropId), services);
    } else if (command.type === 'farmHarvest') harvest(state, data, plot, services);
    else {
      plot.autoReplant = command.enabled;
      if (plot.autoReplant && plot.status === 'ready') harvest(state, data, plot, services);
    }
  }
  return { ok: true, message: command.type === 'claimObjective' ? '의뢰를 완료했습니다.' : '텃밭을 관리했습니다.' };
}

export function validateProgressionContent(data) {
  requireValue(own(data.mastery) && own(data.farming) && Array.isArray(data.objectives), '성장 설정');
  for (const key of ['xpPerCycle', 'xpDivisor', 'maxLevel', 'speedBpsPerLevel', 'yieldBpsPerLevel', 'maxSpeedBonusBps', 'maxYieldBonusBps']) requireValue(integer(data.mastery[key]) && data.mastery[key] > 0, `마스터리 ${key}`);
  requireValue(integer(data.mastery.combinedWorkSpeedCapBps) && data.mastery.combinedWorkSpeedCapBps > 0 && data.mastery.combinedWorkSpeedCapBps < 10000, '통합 작업 속도 상한');
  requireValue(data.mastery.maxSpeedBonusBps < 10000 && data.mastery.maxYieldBonusBps < 10000, '마스터리 보너스 상한');
  const items = new Set(data.items.map(i => i.id));
  const regions = new Set(data.regions.map(i => i.id));
  const quantity = (map) => { requireValue(own(map), '아이템 수량 목록'); for (const [id, n] of Object.entries(map)) requireValue(items.has(id) && integer(n) && n > 0, `아이템 ${id}`); };
  for (const array of [data.farming.plots, data.farming.crops, data.objectives]) {
    requireValue(Array.isArray(array) && array.length && new Set(array.map(r => r.id)).size === array.length, '성장 ID 목록');
    for (const record of array) requireValue(typeof record.id === 'string' && typeof record.name === 'string', '성장 ID/이름');
  }
  quantity(data.farming.initialSeeds);
  for (const plot of data.farming.plots) requireValue(own(plot.requirements) && integer(plot.requirements.clearedRegions) && plot.requirements.clearedRegions <= data.regions.length, '텃밭 해금');
  for (const crop of data.farming.crops) {
    requireValue(regions.has(crop.regionId) && integer(crop.durationMs) && crop.durationMs >= 1000, `작물 ${crop.id}`);
    quantity(crop.inputs); quantity(crop.outputs);
    requireValue(Object.keys(crop.inputs).length && Object.keys(crop.outputs).length, '작물의 유한 입력/출력');
  }
  const workIds = new Set(records(data).map(r => r.id));
  const buildings = new Set(data.town.buildings.map(r => r.id));
  const enemies = new Set(data.enemies.map(r => r.id));
  const townResources = new Set(data.town.resources.map(r => r.id));
  for (const objective of data.objectives) {
    requireValue(Array.isArray(objective.requirements) && objective.requirements.length, '의뢰 조건');
    for (const req of objective.requirements) {
      requireValue(integer(req.amount) && req.amount > 0, '의뢰 목표량');
      const ids = { itemObtained: items, enemyKills: enemies, regionCleared: regions, masteryLevel: workIds, buildingLevel: buildings };
      requireValue(ids[req.type] ? ids[req.type].has(req.id) : ['clearedRegions', 'farmHarvests', 'population', 'townLevel'].includes(req.type), `의뢰 조건 ${req.type}`);
    }
    requireValue(own(objective.cost) && own(objective.rewards) && own(objective.unlock), '의뢰 비용/보상/해금');
    quantity(objective.cost.items || {}); quantity(objective.rewards.items || {});
    for (const map of [objective.cost.resources || {}, objective.rewards.resources || {}]) for (const [id, n] of Object.entries(map)) requireValue(townResources.has(id) && integer(n) && n > 0, '의뢰 거점 재료');
    for (const n of [objective.cost.coins || 0, objective.rewards.coins || 0, objective.rewards.townXp || 0]) requireValue(integer(n), '의뢰 주화/경험치');
    if (objective.unlock.regionId) requireValue(regions.has(objective.unlock.regionId), '의뢰 해금 지역');
    if (objective.unlock.clearedRegions !== undefined) requireValue(integer(objective.unlock.clearedRegions) && objective.unlock.clearedRegions <= regions.size, '의뢰 해금 봉화');
  }
  return true;
}

export function validateProgressionState(state, data) {
  const p = state.progression; const farm = state.farm;
  requireValue(own(p) && own(farm) && integer(p.createdAt) && p.createdAt <= state.time && integer(farm.createdAt) && farm.createdAt <= state.time, '성장 생성 시각');
  const known = records(data);
  const ids = new Set(known.map(r => r.id));
  const itemIds = new Set(data.items.map(r => r.id));
  const enemyIds = new Set(data.enemies.map(r => r.id));
  const countMap = (map, allowed) => { requireValue(own(map), '누적 수량'); for (const [id, n] of Object.entries(map)) requireValue(allowed.has(id) && integer(n), `누적 ${id}`); };
  requireValue(own(p.mastery) && Object.keys(p.mastery).length === ids.size, '마스터리 목록');
  for (const [id, value] of Object.entries(p.mastery)) requireValue(ids.has(id) && own(value) && integer(value.xp) && value.level === masteryLevel(value.xp, data), `마스터리 ${id}`);
  requireValue(own(p.yieldRemainders), '마스터리 잔여 산출');
  for (const [id, map] of Object.entries(p.yieldRemainders)) {
    requireValue(ids.has(id) && own(map), '산출 잔여 활동');
    const outputs = known.find(r => r.id === id).outputs;
    for (const [itemId, n] of Object.entries(map)) requireValue(Object.hasOwn(outputs, itemId) && integer(n) && n < 10000, '산출 잔여값');
  }
  requireValue(own(p.collection), '수집 기록'); countMap(p.collection.obtained, itemIds); countMap(p.collection.kills, enemyIds);
  requireValue(Array.isArray(p.claimedObjectives) && new Set(p.claimedObjectives).size === p.claimedObjectives.length && p.claimedObjectives.every(id => data.objectives.some(o => o.id === id)), '완료 의뢰');
  requireValue(own(p.totals) && integer(p.totals.objectiveClaims) && p.totals.objectiveClaims === p.claimedObjectives.length, '의뢰 누적'); countMap(p.totals.masteryXp, ids);
  for (const [id, value] of Object.entries(p.mastery)) requireValue(value.xp === (p.totals.masteryXp[id] || 0), '마스터리 경험치 원장 일치');
  requireValue(own(farm.plots) && Object.keys(farm.plots).length === data.farming.plots.length, '텃밭 목록');
  for (const [id, plot] of Object.entries(farm.plots)) {
    const def = data.farming.plots.find(r => r.id === id);
    requireValue(def && own(plot) && typeof plot.autoReplant === 'boolean' && integer(plot.cycles) && ['empty', 'growing', 'ready'].includes(plot.status), '텃밭 상태');
    requireValue(plot.stopReason === null || typeof plot.stopReason === 'string', '텃밭 중단 이유');
    countMap(plot.outputs, itemIds);
    if (plot.status === 'empty') requireValue(plot.cropId === null && plot.plantedAt === null && plot.readyAt === null && Object.keys(plot.outputs).length === 0, '빈 텃밭');
    else {
      const crop = data.farming.crops.find(r => r.id === plot.cropId);
      requireValue(crop && state.unlockedRegions.includes(crop.regionId) && !unlockMessage(state, data, def.requirements), '성장 작물 해금');
      requireValue(integer(plot.plantedAt) && plot.plantedAt >= farm.createdAt && plot.plantedAt <= state.time && integer(plot.readyAt) && plot.readyAt > plot.plantedAt, '작물 시간');
      requireValue(plot.status === 'growing' ? plot.readyAt >= state.time : plot.readyAt <= state.time, '작물 성장/수확 경계');
      requireValue(Object.keys(plot.outputs).length === Object.keys(crop.outputs).length && Object.entries(plot.outputs).every(([itemId, n]) => Object.hasOwn(crop.outputs, itemId) && n >= crop.outputs[itemId] && n <= Math.ceil(crop.outputs[itemId] * (1 + data.mastery.maxYieldBonusBps / 10000))), '예약한 수확물');
    }
  }
  requireValue(own(farm.totals), '농사 누적');
  for (const key of ['planted', 'harvested', 'autoReplanted']) requireValue(integer(farm.totals[key]), `농사 ${key}`);
  requireValue(farm.totals.harvested === Object.values(farm.plots).reduce((n, plot) => n + plot.cycles, 0) && farm.totals.autoReplanted <= farm.totals.planted && farm.totals.harvested <= farm.totals.planted, '농사 횟수 일치');
  requireValue(farm.totals.planted === farm.totals.harvested + Object.values(farm.plots).filter(plot => plot.status !== 'empty').length, '심기와 미수확 작물 일치');
  countMap(farm.totals.produced, itemIds); countMap(farm.totals.consumed, itemIds);
  return true;
}
