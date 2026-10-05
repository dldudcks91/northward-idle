import { getProgressionActionAvailability } from './progression.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const requireValue = (value, message) => { if (!value) throw new Error(`마을 데이터/상태 오류: ${message}`); };
const add = (map, entries) => { for (const [id, n] of Object.entries(entries)) map[id] = (map[id] || 0) + n; };
const emptyCost = () => ({ resources: {}, items: {}, coins: 0 });
const answer = (ok, message = '', extra = {}) => ({ ok, message, cost: emptyCost(), maxCount: 1, durationMs: 0, targetLevel: null, ...extra });
const levelOf = (xp, data) => Math.min(data.town.settings.maxLevel, 1 + Math.floor(Math.sqrt(xp / data.town.settings.xpDivisor)));
const buildingLevel = (state, building) => building.levels.find(l => l.level === state.town.buildings[building.id].level);

export function createTownState(data, { now = 0 } = {}) {
  const resources = Object.fromEntries(data.town.resources.map(r => [r.id, data.town.initialResources[r.id] || 0]));
  return { createdAt: now, nextTickAt: now + data.town.tickMs, resources, coins: data.town.initialCoins,
    buildings: Object.fromEntries(data.town.buildings.map(b => [b.id, { level: data.town.initialBuildings[b.id] || 0, conditionBps: 10000 }])),
    construction: null, population: data.town.initialPopulation, xp: 0, level: 1,
    priority: data.town.resources.map(r => r.id), autoSupply: { enabled: false, tradeId: data.town.trades.find(t => t.quality)?.id || null, targetStock: 20 },
    tradeReadyAt: {}, productionRemainders: {}, lastTick: { produced: {}, consumed: {}, overflow: {}, foodSatisfied: true, fuelSatisfied: true, efficiencyBps: 10000, reasons: {} },
    totals: { produced: {}, consumed: {}, overflow: {}, trades: 0, builds: 0, upgrades: 0, taxes: 0, repairs: 0, ticks: 0 } };
}

export function gainTownXp(state, data, amount) {
  state.town.xp += amount;
  state.town.level = levelOf(state.town.xp, data);
}

function basics(state, data, forecast = false) {
  const town = state.town; const settings = data.town.settings;
  let storageCapacity = data.town.baseStorage;
  let populationCapacity = settings.basePopulationCapacity;
  let health = settings.baseHealth; let happiness = settings.baseHappiness; let education = settings.baseEducation;
  let taxBonus = 0; let tradeDiscountBps = 0;
  const bonuses = { attack: 0, defense: 0, warmth: 0, maxHp: 0, workSpeedBps: 0 };
  for (const building of data.town.buildings) {
    const level = buildingLevel(state, building);
    if (!level) continue;
    storageCapacity += level.storage || 0; populationCapacity += level.populationCapacity || 0;
    health += level.health || 0; happiness += level.happiness || 0; education += level.education || 0;
    taxBonus += level.taxBonus || 0; tradeDiscountBps += level.tradeDiscountBps || 0;
    for (const [key, n] of Object.entries(level.bonuses || {})) bonuses[key] = (bonuses[key] || 0) + n;
  }
  health = Math.min(100, health); happiness = Math.min(100, happiness); education = Math.min(100, education);
  let efficiencyBps = Math.min(10000, settings.baseEfficiencyBps + health * settings.healthEfficiencyBps + happiness * settings.happinessEfficiencyBps + education * settings.educationEfficiencyBps);
  if (!town.lastTick.foodSatisfied) efficiencyBps = Math.floor(efficiencyBps * settings.shortageEfficiencyBps / 10000);
  if (!town.lastTick.fuelSatisfied) efficiencyBps = Math.floor(efficiencyBps * settings.shortageEfficiencyBps / 10000);
  efficiencyBps = Math.max(settings.minEfficiencyBps, efficiencyBps);
  const weights = Object.fromEntries(data.town.resources.map(r => [r.id, r.weight]));
  const stored = Object.entries(town.resources).reduce((n, [id, amount]) => n + weights[id] * amount, 0);
  // Construction escrow keeps its warehouse space, guaranteeing full cancellation refunds.
  const reserved = Object.entries(town.construction?.reserved.resources || {}).reduce((n, [id, amount]) => n + weights[id] * amount, 0);
  const storageUsed = stored + reserved;
  const production = {}; const consumption = {}; const productionReasons = {};
  const foodCost = Math.ceil(town.population / settings.foodPerResidents);
  const fuelCost = Math.ceil(town.population / settings.fuelPerResidents);
  add(consumption, { food: foodCost, fuel: fuelCost });
  if (forecast) {
    const stock = { ...town.resources, food: Math.max(0, town.resources.food - foodCost), fuel: Math.max(0, town.resources.fuel - fuelCost) };
    for (const b of data.town.buildings) {
      const l = buildingLevel(state, b);
      if (!l) continue;
      const missing = Object.entries(l.inputs).find(([id, n]) => (stock[id] || 0) < n);
      if (missing) { productionReasons[b.id] = `${data.town.resources.find(r => r.id === missing[0]).name} 부족`; continue; }
      for (const [id, n] of Object.entries(l.inputs)) stock[id] -= n;
      add(consumption, l.inputs);
      for (const [id, n] of Object.entries(l.outputs)) add(production, { [id]: n * efficiencyBps * town.buildings[b.id].conditionBps / 1e8 });
    }
  }
  const levelStartXp = (town.level - 1) ** 2 * settings.xpDivisor;
  const nextLevelXp = town.level >= settings.maxLevel ? null : town.level ** 2 * settings.xpDivisor;
  return { level: town.level, xp: town.xp, nextLevelXp, levelStartXp, progressXp: town.xp - levelStartXp, progressMaxXp: nextLevelXp === null ? 0 : nextLevelXp - levelStartXp,
    population: town.population, populationCapacity, foodCost, fuelCost, health, happiness, education, efficiencyBps,
    storageCapacity, storageUsed, reservedStorage: reserved, freeStorage: Math.max(0, storageCapacity - storageUsed),
    production, consumption, productionReasons, bonuses, taxBonus, tradeDiscountBps: Math.min(settings.maxTradeDiscountBps, tradeDiscountBps),
    coins: town.coins, nextTickAt: town.nextTickAt, construction: town.construction };
}

export function getTownBonuses(state, data) { return basics(state, data).bonuses; }
export function getTownStorageState(state, data) {
  const stats = basics(state, data);
  const resourceCapacity = Object.fromEntries(state.town.priority.map((id, index) => [id, Math.floor(stats.storageCapacity * data.town.settings.priorityStorageSharesBps[index] / 10000 / data.town.resources.find(r => r.id === id).weight)]));
  return { capacity: stats.storageCapacity, used: stats.storageUsed, free: stats.freeStorage, resourceCapacity,
    reservedResources: { ...(state.town.construction?.reserved.resources || {}) } };
}

function conditionsMessage(state, data, conditions = {}) {
  if ((conditions.clearedRegions || 0) > state.clearedRegions.length) return `봉화 ${conditions.clearedRegions}개 돌파 필요`;
  if ((conditions.townLevel || 0) > state.town.level) return `마을 숙련 ${conditions.townLevel} 필요`;
  if ((conditions.population || 0) > state.town.population) return `마을 주민 ${conditions.population}명 필요`;
  if (conditions.regionId && !state.unlockedRegions.includes(conditions.regionId)) return `${data.regions.find(r => r.id === conditions.regionId)?.name} 해금 필요`;
  for (const [id, n] of Object.entries(conditions.buildings || {})) if ((state.town.buildings[id]?.level || 0) < n) return `${data.town.buildings.find(b => b.id === id)?.name} ${n}단계 필요`;
  return '';
}

function missingCost(state, data, cost) {
  for (const [id, n] of Object.entries(cost.resources)) if ((state.town.resources[id] || 0) < n) return `${data.town.resources.find(r => r.id === id)?.name} ${n - (state.town.resources[id] || 0)}개 부족`;
  for (const [id, n] of Object.entries(cost.items)) if ((state.inventory[id] || 0) < n) return `${data.items.find(r => r.id === id)?.name} ${n - (state.inventory[id] || 0)}개 부족`;
  if (state.town.coins < cost.coins) return `마을 주화 ${cost.coins - state.town.coins}개 부족`;
  return '';
}

function scaledCost(cost, count) {
  return { resources: Object.fromEntries(Object.entries(cost.resources || {}).map(([id, n]) => [id, n * count])),
    items: Object.fromEntries(Object.entries(cost.items || {}).map(([id, n]) => [id, n * count])), coins: (cost.coins || 0) * count };
}

function tradeCost(state, data, trade) {
  const discount = basics(state, data).tradeDiscountBps;
  const adjust = map => Object.fromEntries(Object.entries(map || {}).map(([id, n]) => [id, Math.max(1, Math.ceil(n * (1 - discount / 10000)))]));
  return { resources: adjust(trade.cost.resources), items: { ...trade.cost.items }, coins: trade.cost.coins ? Math.max(1, Math.ceil(trade.cost.coins * (1 - discount / 10000))) : 0 };
}

function repairCost(state, data, building) {
  const value = state.town.buildings[building.id];
  const level = buildingLevel(state, building);
  const fraction = data.town.settings.repairCostBps / 10000 * (1 - value.conditionBps / 10000);
  return { resources: Object.fromEntries(Object.entries(level?.cost.resources || {}).map(([id, n]) => [id, Math.max(1, Math.ceil(n * fraction))])), items: {}, coins: Math.max(1, Math.ceil((level?.cost.coins || 0) * fraction)) };
}

export function getTownActionAvailability(state, data, command) {
  if (!record(command)) return answer(false, '마을 명령 형식이 올바르지 않습니다.');
  const growth = getProgressionActionAvailability(state, data, command);
  if (growth) return growth;
  const town = state.town;
  if (command.type === 'townCancelBuild') return town.construction ? answer(true, '예약한 모든 재료와 주화를 반환합니다.') : answer(false, '진행 중인 건설이 없습니다.');
  if (command.type === 'townPriority') {
    const ids = data.town.resources.map(r => r.id);
    return Array.isArray(command.resourceIds) && command.resourceIds.length === ids.length && new Set(command.resourceIds).size === ids.length && command.resourceIds.every(id => ids.includes(id)) ? answer(true, '이 순서대로 실제 생산물을 창고에 넣습니다.') : answer(false, '모든 자원을 중복 없이 지정해야 합니다.');
  }
  if (['townDiscard', 'townDonate'].includes(command.type)) {
    const resource = data.town.resources.find(r => r.id === command.resourceId);
    if (!resource) return answer(false, '알 수 없는 마을 자원입니다.');
    const n = command.count;
    const maxCount = town.resources[resource.id] || 0;
    if (!Number.isSafeInteger(n) || n <= 0) return answer(false, '수량은 1 이상의 정수여야 합니다.', { maxCount });
    if (n > maxCount) return answer(false, '예약되지 않은 마을 자원이 부족합니다.', { maxCount });
    if (command.type === 'townDonate' && town.coins + (town.construction?.reserved.coins || 0) + Math.floor(n / data.town.settings.donationUnitsPerCoin) > 1e9) return answer(false, '마을 주화를 더 보관할 수 없습니다.', { maxCount });
    return answer(true, command.type === 'townDonate' ? '잉여 자원을 기부해 마을 주화와 숙련을 얻습니다.' : '선택한 자원을 버려 창고를 비웁니다.', { maxCount, cost: { ...emptyCost(), resources: { [resource.id]: n } } });
  }
  if (command.type === 'townAutoSupply') {
    if (typeof command.enabled !== 'boolean') return answer(false, '자동 보급 설정이 올바르지 않습니다.');
    if (command.tradeId !== undefined && !data.town.trades.some(t => t.id === command.tradeId && t.quality)) return answer(false, '음식 교역만 자동 보급에 사용할 수 있습니다.');
    if (command.targetStock !== undefined && (!Number.isSafeInteger(command.targetStock) || command.targetStock < 1 || command.targetStock > data.town.settings.maxAutoSupplyStock)) return answer(false, `목표 재고는 1~${data.town.settings.maxAutoSupplyStock}개입니다.`);
    if (!command.enabled) return answer(true, '자동 보급을 끕니다.');
    const trade = data.town.trades.find(t => t.id === command.tradeId);
    if (!trade || !trade.quality) return answer(false, '음식 교역만 자동 보급에 사용할 수 있습니다.');
    const locked = conditionsMessage(state, data, trade.requirements);
    if (locked) return answer(false, locked);
    if (!Number.isSafeInteger(command.targetStock) || command.targetStock < 1 || command.targetStock > data.town.settings.maxAutoSupplyStock) return answer(false, `목표 재고는 1~${data.town.settings.maxAutoSupplyStock}개입니다.`);
    return answer(true, '다음 마을 생산부터 목표 이상이 되도록 음식 묶음을 실제 비용으로 교역합니다. 한 묶음 미만의 여유분이 생깁니다.', { cost: tradeCost(state, data, trade) });
  }
  if (command.type === 'townTrade') {
    const trade = data.town.trades.find(t => t.id === command.tradeId);
    if (!trade) return answer(false, '알 수 없는 교역입니다.');
    const cost = tradeCost(state, data, trade);
    const locked = conditionsMessage(state, data, trade.requirements);
    if (locked) return answer(false, locked, { cost, maxCount: 0 });
    if ((town.tradeReadyAt[trade.id] || 0) > state.time) return answer(false, '상인이 다음 교역을 준비하고 있습니다.', { cost, maxCount: 0, durationMs: town.tradeReadyAt[trade.id] - state.time });
    let maxCount = 1e9;
    for (const [id, n] of Object.entries(cost.resources)) maxCount = Math.min(maxCount, Math.floor((town.resources[id] || 0) / n));
    for (const [id, n] of Object.entries(cost.items)) maxCount = Math.min(maxCount, Math.floor((state.inventory[id] || 0) / n));
    if (cost.coins) maxCount = Math.min(maxCount, Math.floor(town.coins / cost.coins));
    for (const [id, n] of Object.entries(trade.outputs.items)) maxCount = Math.min(maxCount, Math.floor((1e9 - (state.inventory[id] || 0) - (state.activity?.reserved?.[id] || 0) - (town.construction?.reserved.items?.[id] || 0)) / n));
    const count = command.count ?? 1;
    if (!Number.isSafeInteger(count) || count < 1) return answer(false, '교역 횟수는 1 이상의 정수여야 합니다.', { cost, maxCount });
    const total = scaledCost(cost, count);
    if (count > maxCount) return answer(false, missingCost(state, data, total) || '교역 결과를 보관할 수 없습니다.', { cost: total, maxCount });
    return answer(true, '표시한 비용을 소비하고 실제 아이템을 받습니다.', { cost: total, maxCount, durationMs: trade.cooldownMs });
  }
  if (['townBuild', 'townRepair'].includes(command.type)) {
    const building = data.town.buildings.find(b => b.id === command.buildingId);
    if (!building) return answer(false, '알 수 없는 시설입니다.');
    const value = town.buildings[building.id];
    if (command.type === 'townRepair') {
      if (!value.level) return answer(false, '시설을 먼저 지어야 합니다.');
      if (value.conditionBps >= 10000) return answer(false, '이미 완전한 상태입니다.');
      const cost = repairCost(state, data, building);
      const missing = missingCost(state, data, cost);
      return answer(!missing, missing || '시설 효율을 100%로 수리합니다.', { cost });
    }
    const next = building.levels.find(l => l.level === value.level + 1);
    if (!next) return answer(false, '최고 단계 시설입니다.');
    const extra = { cost: next.cost, durationMs: next.durationMs, targetLevel: next.level };
    if (town.construction) return answer(false, '현재 건설을 마치거나 취소한 뒤 시작할 수 있습니다.', extra);
    const locked = conditionsMessage(state, data, next.requirements);
    if (locked) return answer(false, locked, extra);
    const missing = missingCost(state, data, next.cost);
    return answer(!missing, missing || '거점에서 건설하며 여행자의 활동은 계속됩니다.', extra);
  }
  return answer(false, '알 수 없는 마을 명령입니다.');
}

export function getTownStats(state, data) {
  const stats = basics(state, data, true);
  const storage = getTownStorageState(state, data);
  return { ...stats,
    buildings: data.town.buildings.map(building => {
      const value = state.town.buildings[building.id];
      const level = buildingLevel(state, building);
      const nextLevel = building.levels.find(l => l.level === value.level + 1) || null;
      return { id: building.id, name: building.name, icon: building.icon, category: building.category, description: building.description,
        level: value.level, maxLevel: building.levels.length, conditionBps: value.conditionBps,
        outputs: level?.outputs || {}, inputs: level?.inputs || {}, bonuses: level?.bonuses || {}, nextLevel,
        nextEffects: nextLevel ? { outputs: nextLevel.outputs, inputs: nextLevel.inputs, storage: nextLevel.storage, populationCapacity: nextLevel.populationCapacity, education: nextLevel.education, happiness: nextLevel.happiness, health: nextLevel.health, bonuses: nextLevel.bonuses } : null,
        unlockMessage: nextLevel ? conditionsMessage(state, data, nextLevel.requirements) : '', productionReason: stats.productionReasons[building.id] || null,
        upgradeAvailability: getTownActionAvailability(state, data, { type: 'townBuild', buildingId: building.id }),
        repairAvailability: getTownActionAvailability(state, data, { type: 'townRepair', buildingId: building.id }) };
    }),
    resources: state.town.priority.map((id, priority) => ({ ...data.town.resources.find(r => r.id === id), amount: state.town.resources[id] || 0, priority,
      capacity: storage.resourceCapacity[id], storageShareBps: data.town.settings.priorityStorageSharesBps[priority], reserved: storage.reservedResources[id] || 0 })),
    trades: data.town.trades.map(trade => ({ ...trade, cost: tradeCost(state, data, trade), nextReadyAt: state.town.tradeReadyAt[trade.id] || state.time,
      availability: getTownActionAvailability(state, data, { type: 'townTrade', tradeId: trade.id, count: 1 }) })),
    autoSupply: { ...state.town.autoSupply, nextAt: state.town.nextTickAt, trade: data.town.trades.find(t => t.id === state.town.autoSupply.tradeId) || null,
      cost: state.town.autoSupply.tradeId ? tradeCost(state, data, data.town.trades.find(t => t.id === state.town.autoSupply.tradeId)) : emptyCost() }
  };
}

export function grantTownResources(state, data, outputs) {
  const storage = getTownStorageState(state, data);
  let available = storage.free;
  const accepted = {}; const overflow = {};
  for (const id of state.town.priority) {
    const amount = outputs[id] || 0;
    if (!amount) continue;
    const weight = data.town.resources.find(r => r.id === id).weight;
    const perResourceFree = Math.max(0, storage.resourceCapacity[id] - (state.town.resources[id] || 0) - (storage.reservedResources[id] || 0));
    const actual = Math.min(amount, Math.floor(available / weight), perResourceFree);
    if (actual) { accepted[id] = actual; state.town.resources[id] += actual; available -= actual * weight; }
    if (amount > actual) overflow[id] = amount - actual;
  }
  add(state.town.totals.produced, accepted); add(state.town.totals.overflow, overflow);
  return { produced: accepted, overflow };
}

function payCost(state, cost, services, escrow = false) {
  for (const [id, n] of Object.entries(cost.resources)) state.town.resources[id] -= n;
  if (!escrow) add(state.town.totals.consumed, cost.resources);
  state.town.coins -= cost.coins;
  if (escrow) for (const [id, n] of Object.entries(cost.items)) state.inventory[id] -= n;
  else services.consume(state, cost.items);
}

function executeTrade(state, data, trade, count, cost, services, automatic = false) {
  payCost(state, cost, services);
  const output = Object.fromEntries(Object.entries(trade.outputs.items).map(([id, n]) => [id, n * count]));
  services.produce(state, output);
  state.town.totals.trades += count;
  if (trade.cooldownMs > 0) state.town.tradeReadyAt[trade.id] = state.time + trade.cooldownMs;
  services.event(state, data, 'trade', `${trade.name} ${count}회 ${automatic ? '자동 보급' : '교역'}`);
}

export function handleTownCommand(state, data, command, services) {
  if (typeof command.type !== 'string' || !command.type.startsWith('town')) return null;
  const availability = getTownActionAvailability(state, data, command);
  if (!availability.ok) return availability;
  const town = state.town;
  if (command.type === 'townBuild') {
    payCost(state, availability.cost, services, true);
    town.construction = { buildingId: command.buildingId, targetLevel: availability.targetLevel, startedAt: state.time, endsAt: state.time + availability.durationMs,
      reserved: structuredClone(availability.cost) };
    services.event(state, data, 'town-build', `${data.town.buildings.find(b => b.id === command.buildingId).name} ${availability.targetLevel}단계 건설 시작`);
  } else if (command.type === 'townCancelBuild') {
    const reserved = town.construction.reserved;
    add(town.resources, reserved.resources); add(state.inventory, reserved.items); town.coins += reserved.coins;
    town.construction = null;
    services.event(state, data, 'town-build', '건설 취소 · 예약한 모든 재료와 주화 반환');
  } else if (command.type === 'townRepair') {
    payCost(state, availability.cost, services);
    town.buildings[command.buildingId].conditionBps = 10000; town.totals.repairs++;
    services.event(state, data, 'town-repair', `${data.town.buildings.find(b => b.id === command.buildingId).name} 수리 완료`);
  } else if (command.type === 'townTrade') {
    executeTrade(state, data, data.town.trades.find(t => t.id === command.tradeId), command.count ?? 1, availability.cost, services);
  } else if (command.type === 'townPriority') town.priority = [...command.resourceIds];
  else if (command.type === 'townAutoSupply') {
    town.autoSupply = { enabled: command.enabled, tradeId: command.tradeId ?? town.autoSupply.tradeId, targetStock: command.targetStock ?? town.autoSupply.targetStock };
  } else if (['townDiscard', 'townDonate'].includes(command.type)) {
    town.resources[command.resourceId] -= command.count;
    add(town.totals.consumed, { [command.resourceId]: command.count });
    if (command.type === 'townDonate') { const coins = Math.floor(command.count / data.town.settings.donationUnitsPerCoin); town.coins += coins; gainTownXp(state, data, coins); }
    services.event(state, data, 'town-resource', `${data.town.resources.find(r => r.id === command.resourceId).name} ${command.count}개 ${command.type === 'townDonate' ? '기부' : '정리'}`);
  }
  return { ok: true, message: '영구 거점을 관리했습니다. 여행자의 활동은 계속됩니다.' };
}

function autoSupply(state, data, services) {
  const supply = state.town.autoSupply;
  if (!supply.enabled) return;
  const trade = data.town.trades.find(t => t.id === supply.tradeId);
  const [itemId, perTrade] = Object.entries(trade.outputs.items)[0];
  const need = Math.max(0, supply.targetStock - (state.inventory[itemId] || 0));
  if (!need) return;
  const availability = getTownActionAvailability(state, data, { type: 'townTrade', tradeId: trade.id, count: 1 });
  const count = Math.min(availability.maxCount, Math.ceil(need / perTrade));
  if (!availability.ok || count <= 0) return;
  executeTrade(state, data, trade, count, scaledCost(tradeCost(state, data, trade), count), services, true);
}

function tick(state, data, services) {
  const town = state.town; const settings = data.town.settings;
  const before = basics(state, data);
  const consumed = {}; const potential = {}; const reasons = {};
  const food = Math.min(town.resources.food, before.foodCost);
  const fuel = Math.min(town.resources.fuel, before.fuelCost);
  town.resources.food -= food; town.resources.fuel -= fuel;
  add(consumed, { food, fuel });
  town.lastTick.foodSatisfied = food >= before.foodCost; town.lastTick.fuelSatisfied = fuel >= before.fuelCost;
  const stats = basics(state, data);
  // Factories share the pre-output stock. New outputs become available next tick.
  for (const building of data.town.buildings) {
    const level = buildingLevel(state, building);
    if (!level) continue;
    const missing = Object.entries(level.inputs).find(([id, n]) => (town.resources[id] || 0) < n);
    if (missing) { reasons[building.id] = `${data.town.resources.find(r => r.id === missing[0]).name} 부족`; continue; }
    for (const [id, n] of Object.entries(level.inputs)) town.resources[id] -= n;
    add(consumed, level.inputs);
    const remainders = town.productionRemainders[building.id] ||= {};
    for (const [id, n] of Object.entries(level.outputs)) {
      const numerator = n * stats.efficiencyBps * town.buildings[building.id].conditionBps + (remainders[id] || 0);
      const amount = Math.floor(numerator / 1e8);
      remainders[id] = numerator % 1e8;
      if (amount) add(potential, { [id]: amount });
    }
  }
  add(town.totals.consumed, consumed);
  const accepted = grantTownResources(state, data, potential);
  const taxes = Math.min(1e9 - town.coins - (town.construction?.reserved.coins || 0), town.population * (settings.taxPerResident + stats.taxBonus));
  town.coins += taxes; town.totals.taxes += taxes;
  gainTownXp(state, data, town.population);
  if (town.lastTick.foodSatisfied && town.lastTick.fuelSatisfied) town.population = Math.min(stats.populationCapacity, town.population + settings.populationGrowth);
  for (const building of data.town.buildings) {
    const value = town.buildings[building.id];
    if (value.level && building.id !== 'storehouse') value.conditionBps = Math.max(settings.conditionFloorBps, value.conditionBps - settings.conditionDecayBps);
  }
  town.lastTick = { ...accepted, consumed, foodSatisfied: food >= before.foodCost, fuelSatisfied: fuel >= before.fuelCost, efficiencyBps: stats.efficiencyBps, reasons };
  town.totals.ticks++;
  town.nextTickAt += data.town.tickMs;
  autoSupply(state, data, services);
}

export function nextTownEventTime(state) { return Math.min(state.town.nextTickAt, state.town.construction?.endsAt ?? Infinity); }

export function processTownDue(state, data, services) {
  const construction = state.town.construction;
  if (construction && construction.endsAt <= state.time) {
    const value = state.town.buildings[construction.buildingId];
    if (value.level) state.town.totals.upgrades++; else state.town.totals.builds++;
    value.level = construction.targetLevel; value.conditionBps = 10000;
    add(state.town.totals.consumed, construction.reserved.resources);
    add(state.totals.consumed, construction.reserved.items);
    state.town.construction = null;
    gainTownXp(state, data, construction.targetLevel * 10);
    services.event(state, data, 'town-build', `${data.town.buildings.find(b => b.id === construction.buildingId).name} ${value.level}단계 완공`);
  }
  if (state.town.nextTickAt <= state.time) tick(state, data, services);
}

export function validateTownContent(data) {
  const t = data.town;
  requireValue(record(t) && integer(t.tickMs) && t.tickMs >= 1000 && integer(t.baseStorage) && t.baseStorage > 0, '마을 시간/창고');
  const sets = {};
  for (const key of ['resources', 'buildings', 'trades']) {
    requireValue(Array.isArray(t[key]) && t[key].length, `마을 ${key}`);
    sets[key] = new Set();
    for (const entry of t[key]) { requireValue(typeof entry.id === 'string' && entry.id && typeof entry.name === 'string' && !sets[key].has(entry.id), `마을 ${key} ID`); sets[key].add(entry.id); }
  }
  for (const resource of t.resources) requireValue(integer(resource.weight) && resource.weight > 0, '창고 자원 무게');
  for (const id of ['food', 'fuel']) requireValue(sets.resources.has(id), '주민 식량/연료');
  const items = new Set(data.items.map(i => i.id)); const regions = new Set(data.regions.map(r => r.id));
  const amounts = (map, ids) => { requireValue(record(map), '자원 목록'); for (const [id, n] of Object.entries(map)) requireValue(ids.has(id) && integer(n) && n > 0, `자원 ${id}`); };
  const cost = c => { requireValue(record(c) && integer(c.coins), '거점 비용'); amounts(c.resources, sets.resources); amounts(c.items, items); };
  const conditions = c => {
    requireValue(record(c), '거점 해금');
    if (c.regionId) requireValue(regions.has(c.regionId), '거점 해금 지역');
    for (const key of ['clearedRegions', 'townLevel', 'population']) if (c[key] !== undefined) requireValue(integer(c[key]) && (key !== 'clearedRegions' || c[key] <= regions.size), `해금 ${key}`);
    for (const [id, n] of Object.entries(c.buildings || {})) requireValue(sets.buildings.has(id) && integer(n) && n > 0, '시설 해금 참조');
  };
  amounts(t.initialResources, sets.resources);
  requireValue(integer(t.initialCoins) && integer(t.initialPopulation) && t.initialPopulation > 0 && record(t.settings), '마을 초기값');
  for (const key of ['xpDivisor', 'maxLevel', 'basePopulationCapacity', 'populationGrowth', 'foodPerResidents', 'fuelPerResidents', 'minEfficiencyBps', 'shortageEfficiencyBps', 'baseHealth', 'baseHappiness', 'conditionDecayBps', 'conditionFloorBps', 'repairCostBps', 'taxPerResident', 'maxAutoSupplyStock', 'donationUnitsPerCoin', 'seedDropEveryCycles', 'baseEfficiencyBps', 'healthEfficiencyBps', 'happinessEfficiencyBps', 'educationEfficiencyBps', 'maxTradeDiscountBps']) requireValue(integer(t.settings[key]) && t.settings[key] > 0, `마을 설정 ${key}`);
  requireValue(integer(t.settings.baseEducation), '기본 교육');
  requireValue(Array.isArray(t.settings.priorityStorageSharesBps) && t.settings.priorityStorageSharesBps.length === t.resources.length && t.settings.priorityStorageSharesBps.every(n => integer(n) && n > 0) && t.settings.priorityStorageSharesBps.reduce((n, x) => n + x, 0) === 10000, '자원별 창고 배분');
  for (const key of ['minEfficiencyBps', 'shortageEfficiencyBps', 'conditionFloorBps', 'repairCostBps']) requireValue(t.settings[key] <= 10000, '마을 배율');
  for (const building of t.buildings) {
    requireValue(Array.isArray(building.levels) && building.levels.length, '시설 단계');
    building.levels.forEach((level, i) => {
      requireValue(level.level === i + 1 && integer(level.durationMs) && level.durationMs >= 1000, '시설 순서/시간');
      cost(level.cost); conditions(level.requirements); amounts(level.outputs, sets.resources); amounts(level.inputs, sets.resources);
      for (const key of ['storage', 'populationCapacity', 'education', 'happiness', 'health', 'taxBonus', 'tradeDiscountBps']) requireValue(integer(level[key]), `시설 ${key}`);
      requireValue(record(level.bonuses) && Object.entries(level.bonuses).every(([key, n]) => ['attack', 'defense', 'warmth', 'maxHp', 'workSpeedBps'].includes(key) && Number.isFinite(n) && n >= 0), '시설 보너스');
      requireValue(level.tradeDiscountBps <= 5000, '교역 할인 상한');
    });
  }
  for (const [id, n] of Object.entries(t.initialBuildings)) requireValue(sets.buildings.has(id) && integer(n) && n <= t.buildings.find(b => b.id === id).levels.length, '초기 시설');
  for (const trade of t.trades) { cost(trade.cost); conditions(trade.requirements); amounts(trade.outputs.items, items); requireValue(Object.keys(trade.outputs.items).length && integer(trade.cooldownMs), '교역 산출/주기');
    if (trade.quality !== undefined) requireValue(integer(trade.quality) && trade.quality > 0 && Object.keys(trade.outputs.items).length === 1 && data.items.find(i => i.id === Object.keys(trade.outputs.items)[0])?.kind === 'food', '자동 보급 음식'); }
  return true;
}

export function validateTownState(state, data) {
  const t = state.town;
  requireValue(record(t) && integer(t.createdAt) && t.createdAt <= state.time && integer(t.nextTickAt) && t.nextTickAt >= state.time && t.nextTickAt > t.createdAt && (t.nextTickAt - t.createdAt) % data.town.tickMs === 0, '마을 시각');
  const resourceIds = new Set(data.town.resources.map(r => r.id)); const itemIds = new Set(data.items.map(r => r.id)); const tradeIds = new Set(data.town.trades.map(r => r.id));
  const amounts = (map, ids) => { requireValue(record(map), '마을 수량'); for (const [id, n] of Object.entries(map)) requireValue(ids.has(id) && integer(n) && n <= 1e9, `마을 자원 ${id}`); };
  amounts(t.resources, resourceIds); requireValue(Object.keys(t.resources).length === resourceIds.size, '마을 자원 목록');
  requireValue(integer(t.coins) && t.coins <= 1e9 && integer(t.population) && t.population >= 1 && integer(t.xp) && t.level === levelOf(t.xp, data), '마을 성장');
  requireValue(record(t.buildings) && Object.keys(t.buildings).length === data.town.buildings.length, '마을 시설 목록');
  for (const [id, value] of Object.entries(t.buildings)) {
    const def = data.town.buildings.find(b => b.id === id);
    requireValue(def && record(value) && integer(value.level) && value.level <= def.levels.length && integer(value.conditionBps) && value.conditionBps >= data.town.settings.conditionFloorBps && value.conditionBps <= 10000, '시설 상태');
    if (value.level) requireValue(!conditionsMessage(state, data, def.levels[value.level - 1].requirements) || (data.town.initialBuildings[id] || 0) >= value.level, '시설 해금');
  }
  requireValue(Array.isArray(t.priority) && t.priority.length === resourceIds.size && new Set(t.priority).size === resourceIds.size && t.priority.every(id => resourceIds.has(id)), '창고 우선순위');
  requireValue(record(t.autoSupply) && typeof t.autoSupply.enabled === 'boolean' && integer(t.autoSupply.targetStock) && t.autoSupply.targetStock >= 1 && t.autoSupply.targetStock <= data.town.settings.maxAutoSupplyStock && data.town.trades.some(tr => tr.id === t.autoSupply.tradeId && tr.quality), '자동 보급 설정');
  requireValue(record(t.tradeReadyAt), '교역 시간');
  for (const [id, time] of Object.entries(t.tradeReadyAt)) requireValue(tradeIds.has(id) && integer(time), '교역 타이머');
  requireValue(record(t.productionRemainders), '생산 잔여분');
  for (const [id, map] of Object.entries(t.productionRemainders)) {
    const building = data.town.buildings.find(b => b.id === id);
    requireValue(building && record(map), '생산 잔여 시설');
    for (const [resourceId, amount] of Object.entries(map)) requireValue(Object.hasOwn(building.levels[0].outputs, resourceId) && integer(amount) && amount < 1e8, '생산 잔여 자원/수치');
  }
  if (t.construction !== null) {
    const c = t.construction; const b = data.town.buildings.find(b => b.id === c.buildingId); const l = b?.levels.find(l => l.level === c.targetLevel);
    requireValue(record(c) && b && l && c.targetLevel === t.buildings[b.id].level + 1 && integer(c.startedAt) && c.startedAt >= t.createdAt && c.startedAt <= state.time && integer(c.endsAt) && c.endsAt >= state.time && c.endsAt === c.startedAt + l.durationMs, '건설 시간/단계');
    requireValue(record(c.reserved) && c.reserved.coins === l.cost.coins, '건설 주화 예약');
    for (const key of ['resources', 'items']) requireValue(record(c.reserved[key]) && Object.keys(c.reserved[key]).length === Object.keys(l.cost[key]).length && Object.entries(c.reserved[key]).every(([id, n]) => l.cost[key][id] === n), '건설 재료 예약');
  }
  const stats = basics(state, data);
  requireValue(stats.storageUsed <= stats.storageCapacity && t.population <= stats.populationCapacity, '창고/주민 수용량');
  requireValue(record(t.lastTick) && typeof t.lastTick.foodSatisfied === 'boolean' && typeof t.lastTick.fuelSatisfied === 'boolean' && integer(t.lastTick.efficiencyBps) && t.lastTick.efficiencyBps >= data.town.settings.minEfficiencyBps && t.lastTick.efficiencyBps <= 10000 && record(t.lastTick.reasons), '마을 생산 결과');
  for (const map of [t.lastTick.produced, t.lastTick.consumed, t.lastTick.overflow]) amounts(map, resourceIds);
  for (const [id, reason] of Object.entries(t.lastTick.reasons)) requireValue(Object.hasOwn(t.buildings, id) && typeof reason === 'string', '시설 중단 이유');
  requireValue(record(t.totals), '마을 누적');
  for (const key of ['produced', 'consumed', 'overflow']) { requireValue(record(t.totals[key]), '마을 누적 자원'); for (const [id, n] of Object.entries(t.totals[key])) requireValue(resourceIds.has(id) && integer(n), '마을 누적 수량'); }
  for (const key of ['trades', 'builds', 'upgrades', 'taxes', 'repairs', 'ticks']) requireValue(integer(t.totals[key]), `마을 누적 ${key}`);
  requireValue(t.nextTickAt === t.createdAt + (t.totals.ticks + 1) * data.town.tickMs, '마을 틱 순서');
  return true;
}
