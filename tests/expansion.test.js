import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGame, applyCommand, advanceGame, validateContent, validateExpansionState, getActivityAvailability, getDerivedStats, getTownStats, getTownActionAvailability, getMasteryInfo, getFarmPlots, getObjectives, getCollectionStats } from '../src/simulation/engine.js';
import { playCampaign } from './campaign.js';

const data = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const clone = structuredClone;
const command = (state, value) => { const r = applyCommand(state, data, value); assert.equal(r.ok, true, `${JSON.stringify(value)}: ${r.message}`); return r; };
const preparedCampaign = playCampaign(data, 1009).state;

function townFixture(level = 1) {
  const state = clone(preparedCampaign);
  command(state, { type: 'stop' });
  for (const b of data.town.buildings) state.town.buildings[b.id] = { level, conditionBps: 10000 };
  state.town.xp = (level - 1) ** 2 * data.town.settings.xpDivisor;
  state.town.level = level;
  state.town.population = 2 + 8 * level;
  state.town.construction = null;
  const stats = getTownStats(state, data);
  for (const r of stats.resources) state.town.resources[r.id] = Math.floor(r.capacity / 2);
  state.town.coins = 10000;
  state.inventory['rime-shore-food'] = 1000;
  return state;
}

function firstGear(seed = 1) {
  const state = createGame(data, { seed });
  for (const id of data.regions[0].recommendedGear) { state.inventory[id] = 1; command(state, { type: 'equip', itemId: id }); }
  state.inventory['rime-shore-food'] = 1000;
  return state;
}

test('the permanent town, crops, mastery, objectives and collection have valid fresh v3 state', () => {
  const state = createGame(data, { seed: 45, now: 1729 });
  assert.equal(state.schemaVersion, 3);
  assert.equal(validateContent(data), true);
  assert.equal(validateExpansionState(state, data), true);
  assert.equal(getTownStats(state, data).buildings.length, 12);
  assert.equal(data.town.buildings.reduce((n, b) => n + b.levels.length, 0), 72);
  assert.equal(getFarmPlots(state, data).filter(p => p.unlocked).length, 1);
  assert.equal(getObjectives(state, data).length, 18);
  assert.equal(getCollectionStats(state, data).discoveredItems, 5);
  assert.equal(getCollectionStats(state, data).defeatedEnemies, 0);
  assert.equal(getMasteryInfo(state, data, 'rime-shore-saw').progressXp, 0);
});

test('refunded craft inputs are reported consistently by UI availability and the actual swap', () => {
  const state = createGame(data);
  state.inventory['rime-shore-wood'] = 4; state.inventory['rime-shore-ore'] = 4;
  command(state, { type: 'craft', id: 'rime-shore-saw' });
  assert.equal(getActivityAvailability(state, data, 'craft', 'rime-shore-smelt').ok, true);
  command(state, { type: 'craft', id: 'rime-shore-smelt' });
  assert.equal(state.inventory['rime-shore-wood'], 3);
  assert.equal(state.activity.reserved['rime-shore-ore'], 4);
});

test('town construction is independent and cancellation refunds all escrow after production fills available space', () => {
  const state = createGame(data);
  command(state, { type: 'gather', id: 'rime-shore-logging' });
  const activity = clone(state.activity); const inventory = clone(state.inventory);
  const before = clone(state.town.resources); const coins = state.town.coins;
  command(state, { type: 'townBuild', buildingId: 'herbalist' });
  assert.deepEqual(state.activity, activity); assert.deepEqual(state.inventory, inventory);
  assert.equal(getTownStats(state, data).reservedStorage, 13);
  const other = Object.entries(state.town.resources).filter(([id]) => id !== 'food').reduce((n, [, amount]) => n + amount, 0);
  state.town.resources.food = getTownStats(state, data).storageCapacity - other - 13;
  command(state, { type: 'townCancelBuild' });
  assert.equal(state.town.resources.wood, before.wood);
  assert.equal(state.town.resources.stone, before.stone);
  assert.equal(state.town.coins, coins);
  assert.equal(getTownStats(state, data).storageUsed, getTownStats(state, data).storageCapacity);
  assert.equal(validateExpansionState(state, data), true);
});

test('construction finishing at a production timestamp contributes exactly once to that tick', () => {
  const state = createGame(data);
  advanceGame(state, data, 30000);
  command(state, { type: 'townBuild', buildingId: 'herbalist' });
  const herbs = state.town.resources.herbs;
  advanceGame(state, data, 29999);
  assert.equal(state.town.buildings.herbalist.level, 0);
  assert.equal(state.town.resources.herbs, herbs);
  advanceGame(state, data, 1);
  assert.equal(state.town.buildings.herbalist.level, 1);
  assert.equal(state.town.totals.ticks, 1);
  assert.ok(state.town.resources.herbs > herbs);
  assert.equal(state.town.totals.builds, 1);
  const after = clone(state);
  advanceGame(state, data, 0);
  assert.deepEqual(state, after);
});

test('eight hours of unmanaged default town keeps fuel and multiple construction materials', () => {
  const state = createGame(data);
  advanceGame(state, data, 8 * 3600000, { offline: true });
  assert.ok(state.town.resources.food > 0);
  assert.ok(state.town.resources.fuel > 0);
  assert.ok(state.town.resources.wood >= data.town.buildings.find(b => b.id === 'storehouse').levels[1].cost.resources.wood);
  assert.ok(state.town.resources.stone > 0);
  assert.ok(state.town.resources.ore > 0);
  assert.equal(state.town.lastTick.foodSatisfied, true);
  assert.equal(state.town.lastTick.fuelSatisfied, true);
  assert.equal(validateExpansionState(state, data), true);
});

test('warehouse priority changes actual allocation without deleting existing stock or reserved construction', () => {
  const state = createGame(data);
  advanceGame(state, data, 120000);
  const original = getTownStats(state, data).resources.find(r => r.id === 'wood').capacity;
  const before = clone(state.town.resources);
  command(state, { type: 'townPriority', resourceIds: ['wood', ...state.town.priority.filter(id => id !== 'wood')] });
  assert.ok(getTownStats(state, data).resources.find(r => r.id === 'wood').capacity > original);
  assert.deepEqual(state.town.resources, before);
  const stock = state.town.resources.wood;
  advanceGame(state, data, 60000);
  assert.ok(state.town.resources.wood > stock);
  assert.equal(validateExpansionState(state, data), true);
  const invalid = clone(state);
  assert.equal(applyCommand(state, data, { type: 'townPriority', resourceIds: ['food'] }).ok, false);
  assert.deepEqual(state, invalid);
});

test('all seventy-two stage costs fit preceding default warehouse allocations and every tier sustains upstream inputs', () => {
  const warehouse = data.town.buildings.find(b => b.id === 'storehouse');
  for (const building of data.town.buildings) for (const level of building.levels) {
    const capacity = data.town.baseStorage + warehouse.levels[Math.max(0, level.level - 2)].storage;
    for (const [id, amount] of Object.entries(level.cost.resources)) {
      const rank = data.town.resources.findIndex(r => r.id === id);
      assert.ok(amount <= Math.floor(capacity * data.town.settings.priorityStorageSharesBps[rank] / 10000), `${building.id} L${level.level} ${id} storage`);
    }
  }
  for (let level = 1; level <= 6; level++) {
    const state = townFixture(level);
    for (const value of Object.values(state.town.buildings)) value.conditionBps = data.town.settings.conditionFloorBps;
    const stats = getTownStats(state, data);
    for (const id of ['food', 'fuel', 'wood', 'ore', 'herbs']) assert.ok(stats.production[id] >= stats.consumption[id], `tier ${level} ${id}: ${stats.production[id]} vs ${stats.consumption[id]}`);
    assert.equal(validateExpansionState(state, data), true);
  }
});

test('fractional factory output accumulates rather than consuming inputs forever for zero rewards', () => {
  const tuned = clone(data);
  tuned.town.settings.baseEfficiencyBps = 2500;
  tuned.town.settings.healthEfficiencyBps = 1; tuned.town.settings.happinessEfficiencyBps = 1; tuned.town.settings.educationEfficiencyBps = 1;
  tuned.town.settings.conditionDecayBps = 1;
  const state = createGame(tuned);
  state.town.buildings.sawmill.level = 1;
  state.town.buildings.sawmill.conditionBps = 8000;
  const half = clone(state);
  advanceGame(state, tuned, 5 * 60000);
  for (let i = 0; i < 5; i++) advanceGame(half, tuned, 60000);
  assert.deepEqual(half, state);
  assert.ok((state.town.totals.produced.plank || 0) >= 3);
  assert.ok(state.town.productionRemainders.sawmill.plank >= 0 && state.town.productionRemainders.sawmill.plank < 1e8);
  assert.equal(validateExpansionState(state, tuned), true);
});

test('town auto supply arrives before a player attack at the same timestamp and spends the actual food', () => {
  const state = firstGear(73);
  state.town.buildings.kitchen.level = 1;
  state.town.resources.provisions = 3;
  command(state, { type: 'townAutoSupply', enabled: true, tradeId: 'supply-rime-shore', targetStock: 3 });
  state.nextRaidAt = 55000;
  advanceGame(state, data, 55000);
  state.inventory['rime-shore-food'] = 0;
  state.hp = Math.floor(getDerivedStats(state, data).maxHp * 0.4);
  const hp = state.hp;
  state.battle.enemyHp = 1000; state.battle.enemyMaxHp = 1000;
  state.battle.nextPlayerAt = 60000; state.battle.nextEnemyAt = 65000; state.battle.nextActionAt = 60000;
  const summary = advanceGame(state, data, 5000);
  assert.equal(summary.town.trades, 1);
  assert.equal(summary.consumed['rime-shore-food'], 1);
  assert.equal(state.inventory['rime-shore-food'], 2);
  assert.ok(state.hp > hp);
  assert.equal(state.battle.lastAction.time, 60000);
  assert.equal(state.battle.lastAction.actor, 'player');
});

test('food auto supply reaches its target by whole trade bundles with at most one bundle of surplus', () => {
  const state = townFixture(1);
  state.inventory['rime-shore-food'] = 0;
  state.town.resources.provisions = 24;
  command(state, { type: 'townAutoSupply', enabled: true, tradeId: 'supply-rime-shore', targetStock: 20 });
  const delta = state.town.nextTickAt - state.time;
  advanceGame(state, data, delta);
  assert.equal(state.inventory['rime-shore-food'], 21);
  assert.ok(state.inventory['rime-shore-food'] < 23);
  const before = clone(state);
  assert.equal(applyCommand(state, data, { type: 'townAutoSupply', enabled: false, tradeId: 'unknown' }).ok, false);
  assert.deepEqual(state, before);
});

test('automatic crops consume finite seeds, yield only at maturity and stop safely when replant seeds run out', () => {
  const state = createGame(data);
  command(state, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: true });
  assert.equal(state.inventory['seed-rime-shore'], 2);
  const ends = state.farm.plots['plot-1'].readyAt;
  advanceGame(state, data, ends - 1);
  assert.equal(state.farm.totals.harvested, 0);
  advanceGame(state, data, 1);
  assert.equal(state.farm.totals.harvested, 1);
  assert.equal(state.farm.plots['plot-1'].status, 'growing');
  advanceGame(state, data, 2 * ends);
  assert.equal(state.farm.totals.harvested, 3);
  assert.equal(state.farm.totals.planted, 3);
  assert.equal(state.farm.totals.autoReplanted, 2);
  assert.equal(state.inventory['seed-rime-shore'], 0);
  assert.equal(state.farm.plots['plot-1'].status, 'empty');
  assert.match(state.farm.plots['plot-1'].stopReason, /부족/);
  assert.equal(validateExpansionState(state, data), true);
  command(state, { type: 'townTrade', tradeId: 'seed-rime-shore', count: 1 });
  command(state, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore' });
  assert.equal(state.farm.plots['plot-1'].autoReplant, true);
});

test('manual harvest and once-only objectives retain rewards when warehouse space is unavailable', () => {
  const state = createGame(data);
  command(state, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: false });
  advanceGame(state, data, 180000);
  assert.equal(state.farm.plots['plot-1'].status, 'ready');
  assert.equal(getFarmPlots(state, data)[0].harvestAvailability.ok, true);
  command(state, { type: 'farmHarvest', plotId: 'plot-1' });
  const harvested = clone(state);
  assert.equal(applyCommand(state, data, { type: 'farmHarvest', plotId: 'plot-1' }).ok, false);
  assert.deepEqual(state, harvested);
  command(state, { type: 'gather', id: 'rime-shore-logging' });
  advanceGame(state, data, 50000);
  const cap = getTownStats(state, data).resources.find(r => r.id === 'plank').capacity;
  state.town.resources.plank = cap;
  const full = clone(state);
  assert.equal(getTownActionAvailability(state, data, { type: 'claimObjective', objectiveId: 'first-timber' }).ok, false);
  assert.equal(applyCommand(state, data, { type: 'claimObjective', objectiveId: 'first-timber' }).ok, false);
  assert.deepEqual(state, full);
  command(state, { type: 'townDiscard', resourceId: 'plank', count: 12 });
  const wood = state.inventory['rime-shore-wood'];
  command(state, { type: 'claimObjective', objectiveId: 'first-timber' });
  assert.equal(state.inventory['rime-shore-wood'], wood - 8);
  assert.equal(state.town.resources.plank, cap);
  const claimed = clone(state);
  assert.equal(applyCommand(state, data, { type: 'claimObjective', objectiveId: 'first-timber' }).ok, false);
  assert.deepEqual(state, claimed);
  assert.equal(validateExpansionState(state, data), true);
});

test('objective rewards and trade bundles refuse bag-limit overflow before consuming costs', () => {
  const objective = createGame(data);
  objective.inventory['seed-rime-shore'] = 1e9;
  objective.inventory['rime-shore-wood'] = 8;
  objective.progression.collection.obtained['rime-shore-wood'] = 16;
  const claim = { type: 'claimObjective', objectiveId: 'first-timber' };
  const beforeClaim = clone(objective);
  assert.equal(getTownActionAvailability(objective, data, claim).ok, false);
  assert.equal(applyCommand(objective, data, claim).ok, false);
  assert.deepEqual(objective, beforeClaim);
  objective.inventory['seed-rime-shore'] = 1e9 - 2;
  command(objective, claim);
  assert.equal(objective.inventory['seed-rime-shore'], 1e9);
  assert.equal(objective.inventory['rime-shore-wood'], 0);

  const trade = createGame(data);
  trade.inventory['seed-rime-shore'] = 1e9;
  trade.town.coins = 20;
  const buy = { type: 'townTrade', tradeId: 'seed-rime-shore', count: 1 };
  const beforeTrade = clone(trade);
  assert.equal(getTownActionAvailability(trade, data, buy).maxCount, 0);
  assert.equal(applyCommand(trade, data, buy).ok, false);
  assert.deepEqual(trade, beforeTrade);
  trade.inventory['seed-rime-shore']--;
  const bounded = clone(trade);
  assert.equal(getTownActionAvailability(trade, data, buy).maxCount, 1);
  assert.equal(applyCommand(trade, data, { ...buy, count: 2 }).ok, false);
  assert.deepEqual(trade, bounded);
  command(trade, buy);
  assert.equal(trade.inventory['seed-rime-shore'], 1e9);
  assert.equal(trade.town.coins, 16);
});

test('mastery bonuses and collection reflect actual earned actions and actual enemy kills', () => {
  const state = createGame(data);
  command(state, { type: 'gather', id: 'rime-shore-logging' });
  advanceGame(state, data, 70000);
  const mastery = getMasteryInfo(state, data, 'rime-shore-logging');
  assert.ok(mastery.level >= 2 && mastery.speedBonusBps > 0 && mastery.yieldBonusBps > 0);
  assert.equal(mastery.progressXp, mastery.xp - mastery.levelStartXp);
  assert.ok(getCollectionStats(state, data).items.find(i => i.id === 'rime-shore-wood').obtained >= 20);
  assert.ok(Object.values(preparedCampaign.progression.collection.kills).reduce((n, count) => n + count, 0) > preparedCampaign.totals.tripsCompleted);
  assert.equal(getCollectionStats(preparedCampaign, data).defeatedEnemies, 18);
});

test('town improvements cannot change an already running battle or reset the protagonist activity', () => {
  const state = firstGear(89);
  command(state, { type: 'townBuild', buildingId: 'watchtower' });
  command(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 8000);
  state.battle.enemyHp = 1000; state.battle.enemyMaxHp = 1000;
  const before = getDerivedStats(state, data).attack;
  advanceGame(state, data, 22000);
  assert.equal(state.town.buildings.watchtower.level, 1);
  assert.equal(getDerivedStats(state, data).attack, before);
  assert.equal(state.activity.type, 'explore');
  command(state, { type: 'stop' });
  assert.ok(getDerivedStats(state, data).attack > before);
});

test('raid defeat recovery restores older exploration bonuses without exceeding its original HP cap', () => {
  const state = firstGear(98);
  state.skills.combat = { xp: 1000, level: 7 };
  command(state, { type: 'townBuild', buildingId: 'watchtower' });
  command(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 8000);
  state.battle.enemyHp = 1000; state.battle.enemyMaxHp = 1000;
  state.nextRaidAt = 30000;
  advanceGame(state, data, 22000);
  assert.equal(state.battle.kind, 'raid');
  assert.equal(state.battle.townBonuses.maxHp, 2);
  assert.equal(state.suspendedBattle.townBonuses.maxHp, 0);
  state.autoFood = false; state.hp = 1;
  state.battle.nextEnemyAt = state.time + 1; state.battle.nextActionAt = state.time + 1;
  advanceGame(state, data, 1);
  assert.equal(state.phase, 'recovering');
  advanceGame(state, data, data.settings.recoveryMs);
  assert.equal(state.phase, 'exploring');
  assert.equal(state.battle.townBonuses.maxHp, 0);
  assert.equal(state.hp, getDerivedStats(state, data).maxHp);
  assert.equal(validateExpansionState(state, data), true);
});

test('all new invalid command shapes are atomic, including real costs and unsupported IDs', () => {
  const state = createGame(data);
  for (const c of [{ type: 'townBuild', buildingId: 'unknown' }, { type: 'townBuild', buildingId: 'housing' }, { type: 'townTrade', tradeId: 'seed-pinewood', count: 1 }, { type: 'townDiscard', resourceId: 'wood', count: -1 }, { type: 'townDonate', resourceId: 'wood', count: 100000 }, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-pinewood' }, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: 'yes' }, { type: 'farmHarvest', plotId: 'plot-1' }, { type: 'claimObjective', objectiveId: 'northward-completion' }, { type: 37 }]) {
    const before = clone(state);
    assert.equal(applyCommand(state, data, c).ok, false, JSON.stringify(c));
    assert.deepEqual(state, before);
  }
});

test('expansion validators reject impossible timers, crop payouts, mastery levels, priorities and escrow', () => {
  for (const mutate of [s => { s.town.nextTickAt = -1; }, s => { s.town.resources.unknown = 1; }, s => { s.town.level = 6; }, s => { s.town.priority[0] = s.town.priority[1]; }, s => { s.town.productionRemainders.woodcutters = { fuel: 1e8 }; }, s => { s.progression.mastery['rime-shore-logging'].level = 99; }, s => { s.progression.collection.kills.unknown = 1; }, s => { s.progression.claimedObjectives = ['unknown']; }, s => { s.farm.plots['plot-1'].readyAt = 1; }]) {
    const state = createGame(data); mutate(state);
    assert.throws(() => validateExpansionState(state, data));
  }
  const building = createGame(data); command(building, { type: 'townBuild', buildingId: 'herbalist' });
  building.town.construction.reserved.resources.wood++;
  assert.throws(() => validateExpansionState(building, data));
  const growing = createGame(data); command(growing, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore' });
  growing.farm.plots['plot-1'].outputs['rime-shore-raw'] = 100000;
  assert.throws(() => validateExpansionState(growing, data));
});

test('town, four automatic crops and supply remain identical for 24 hours online, offline and split', () => {
  const state = townFixture(6);
  for (const plot of data.farming.plots) {
    state.inventory['seed-aurora-ruins'] = 2000;
    command(state, { type: 'farmPlant', plotId: plot.id, cropId: 'crop-aurora-ruins', autoReplant: true });
  }
  command(state, { type: 'townAutoSupply', enabled: true, tradeId: 'supply-aurora-ruins', targetStock: 30 });
  const offline = clone(state); const split = clone(state);
  const summary = advanceGame(state, data, 86400000);
  advanceGame(offline, data, 86400000, { offline: true });
  for (let i = 0; i < 288; i++) advanceGame(split, data, 300000, { offline: true });
  assert.deepEqual(offline, state); assert.deepEqual(split, state);
  assert.ok(summary.farm.harvested > 500);
  assert.ok(summary.town.produced.metal > 0);
  assert.ok(summary.mastery.xp['crop-aurora-ruins'] > 0);
  assert.equal(validateExpansionState(state, data), true);
});

test('first-breakthrough pause leaves passive farms, town and defenses running without consuming exploration RNG', () => {
  const state = firstGear(19);
  command(state, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: true });
  command(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 9500);
  const original = clone(state.battle); const split = clone(state);
  const summary = advanceGame(state, data, 86400000, { offline: true });
  for (let i = 0; i < 288; i++) advanceGame(split, data, 300000, { offline: true });
  assert.deepEqual(split, state);
  assert.equal(state.clearedRegions.length, 0);
  assert.equal(state.suspendedBattle.enemyHp, original.enemyHp);
  assert.ok(summary.raids > 100 && summary.town.ticks === 1440 && summary.farm.harvested === 3);
  assert.equal(validateExpansionState(state, data), true);
});

test('seven days of town and finite farms have exact split state and keep accumulated growth', () => {
  const state = createGame(data);
  command(state, { type: 'gather', id: 'rime-shore-logging' });
  command(state, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: true });
  const split = clone(state);
  const started = performance.now();
  const summary = advanceGame(state, data, 7 * 86400000, { offline: true });
  for (let i = 0; i < 168; i++) advanceGame(split, data, 3600000, { offline: true });
  assert.deepEqual(split, state);
  assert.ok(state.town.resources.fuel > 0 && state.town.resources.wood > 0);
  assert.equal(summary.farm.harvested, 3);
  assert.equal(summary.town.ticks, 10080);
  assert.ok(state.progression.mastery['rime-shore-logging'].level > 1);
  assert.equal(validateExpansionState(state, data), true);
  console.log('EXPANSION_SEVEN_DAY_SINGLE_AND_SPLIT_MS', Math.round(performance.now() - started));
});
