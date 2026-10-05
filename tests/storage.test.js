import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, advanceGame, applyCommand } from '../src/simulation/engine.js';
import { returnWindow } from '../src/app/clock.js';
import { SAVE_KEY, BACKUP_KEY, ORIGINAL_KEY, SCHEMA_VERSION, encodeSave, decodeSave, readSave, writeSave, preserveOriginal, checksum, SaveError } from '../src/storage/save.js';

const data = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
function memory(values = {}) {
  const map = new Map(Object.entries(values));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
function resign(value) {
  delete value.checksum;
  return JSON.stringify({ ...value, checksum: checksum(JSON.stringify(value)) });
}

test('empty storage is a new journey without a write', () => {
  const store = memory();
  assert.equal(readSave(store, data), null);
  assert.equal(store.map.size, 0);
});

test('save round trip preserves unfinished work, randomness, and pending summary', () => {
  const state = createGame(data, { seed: 919, now: 0 });
  applyCommand(state, data, { type: 'gather', id: data.activities[0].id });
  advanceGame(state, data, 1777);
  const summary = { elapsedMs: 1777, raids: 1, produced: {} };
  const raw = encodeSave(state, 100000, { pendingSummary: summary, writerId: 'test' });
  const loaded = decodeSave(raw, data);
  assert.deepEqual(loaded.state, state);
  assert.deepEqual(loaded.pendingSummary, summary);
  assert.equal(loaded.savedAt, 100000);
  assert.equal(loaded.migrated, false);
});

test('truncated or altered save is rejected and primary remains untouched', () => {
  const raw = encodeSave(createGame(data), 100);
  const corrupt = raw.slice(0, -6);
  const store = memory({ [SAVE_KEY]: corrupt });
  assert.throws(() => readSave(store, data), SaveError);
  assert.equal(store.getItem(SAVE_KEY), corrupt);
  const altered = JSON.parse(raw);
  altered.savedAt += 1;
  assert.throws(() => decodeSave(JSON.stringify(altered), data), error => error.code === 'checksum');
});

test('future versions and another game are not silently replaced', () => {
  const raw = encodeSave(createGame(data), 100);
  const future = JSON.parse(raw);
  future.schemaVersion = 999;
  const store = memory({ [SAVE_KEY]: JSON.stringify(future) });
  assert.throws(() => readSave(store, data), error => error.code === 'future');
  assert.equal(store.getItem(SAVE_KEY), JSON.stringify(future));
  const other = { ...future, game: 'another-game' };
  assert.throws(() => decodeSave(JSON.stringify(other), data), SaveError);
});

test('unknown items, negative resources, invalid equipment and unsafe state fail validation', () => {
  for (const mutate of [
    state => { state.inventory.unknown = 1; },
    state => { state.inventory[data.items[0].id] = -1; },
    state => { state.equipment.weapon = data.items.find(i => i.kind === 'food').id; },
    state => { state.phase = 'not-a-phase'; },
    state => { state.rng = 'bad-random'; },
    state => { state.unlockedRegions = []; },
  ]) {
    const value = JSON.parse(encodeSave(createGame(data), 100));
    mutate(value.state);
    assert.throws(() => decodeSave(resign(value), data), SaveError);
  }
});

test('v1 migration preserves progress and can preserve original separately', () => {
  const state = createGame(data, { seed: 912 });
  applyCommand(state, data, { type: 'gather', id: data.activities[0].id });
  advanceGame(state, data, 5000);
  const previous = structuredClone(state);
  delete previous.schemaVersion;
  delete previous.autoFood;
  const raw = JSON.stringify({ game: 'northward-idle', version: 1, savedAt: 100, state: previous });
  const store = memory({ [SAVE_KEY]: raw });
  const migrated = readSave(store, data);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.rng, state.rng);
  assert.deepEqual(migrated.state.inventory, state.inventory);
  assert.equal(migrated.state.autoFood, true);
  assert.equal(store.getItem(SAVE_KEY), raw);
  preserveOriginal(store, raw);
  writeSave(store, encodeSave(migrated.state, 100));
  assert.equal(store.getItem(ORIGINAL_KEY), raw);
  assert.equal(store.getItem(BACKUP_KEY), raw);
});

test('backup precedes primary write and quota failure preserves prior progress', () => {
  const previous = encodeSave(createGame(data), 100);
  const next = encodeSave(createGame(data), 200);
  const store = memory({ [SAVE_KEY]: previous });
  writeSave(store, next);
  assert.equal(store.getItem(BACKUP_KEY), previous);
  assert.equal(store.getItem(SAVE_KEY), next);
  const unavailable = { getItem: () => previous, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => writeSave(unavailable, next), error => error.code === 'quota');
  assert.equal(unavailable.getItem(SAVE_KEY), previous);
});

test('clock rollback never reapplies an already processed span', () => {
  assert.deepEqual(returnWindow(2000, 1000, 10000), { awayMs: 0, elapsedMs: 0, excludedMs: 0, appliedAt: 2000 });
  assert.equal(returnWindow(2000, 2000, 10000).elapsedMs, 0);
  assert.equal(returnWindow(2000, 3000, 10000).elapsedMs, 1000);
});

test('long absence applies the cap once and explains the excluded time', () => {
  const plan = returnWindow(1000, 100000, 10000);
  assert.deepEqual(plan, { awayMs: 99000, elapsedMs: 10000, excludedMs: 89000, appliedAt: 100000 });
  assert.equal(returnWindow(plan.appliedAt, 100000, 10000).elapsedMs, 0);
});

test('persisted return cannot award the same work again', () => {
  const state = createGame(data, { seed: 929 });
  applyCommand(state, data, { type: 'gather', id: data.activities[0].id });
  const store = memory({ [SAVE_KEY]: encodeSave(state, 1000) });
  let loaded = readSave(store, data);
  const plan = returnWindow(loaded.savedAt, 30000, 100000);
  advanceGame(loaded.state, data, plan.elapsedMs, { offline: true });
  writeSave(store, encodeSave(loaded.state, plan.appliedAt));
  const after = structuredClone(loaded.state.inventory);
  loaded = readSave(store, data);
  advanceGame(loaded.state, data, returnWindow(loaded.savedAt, 30000, 100000).elapsedMs, { offline: true });
  assert.deepEqual(loaded.state.inventory, after);
});

test('saving during an unfinished battle preserves its eventual outcome', () => {
  const state = createGame(data, { seed: 4401 });
  const region = data.regions[0];
  for (const itemId of region.recommendedGear) {
    state.inventory[itemId] = 1;
    assert.equal(applyCommand(state, data, { type: 'equip', itemId }).ok, true);
  }
  state.inventory[region.recommendedFood] = 30;
  assert.equal(applyCommand(state, data, { type: 'explore', regionId: region.id }).ok, true);
  advanceGame(state, data, region.travelMs + 1000);
  assert.ok(state.battle);
  const reload = decodeSave(encodeSave(state, 9000), data).state;
  advanceGame(state, data, 100000);
  advanceGame(reload, data, 100000);
  assert.deepEqual(reload, state);
});

test('corrupt timers and craft escrow cannot enter the simulation', () => {
  for (const mutate of [
    state => { state.nextRaidAt = 'later'; },
    state => { state.nextHealAt = -1; },
    state => { state.pendingRaids = -2; },
    state => { state.recoveryUntil = 'later'; },
    state => { state.totals.produced.unknown = 2; },
  ]) {
    const value = JSON.parse(encodeSave(createGame(data), 100));
    mutate(value.state);
    assert.throws(() => decodeSave(resign(value), data), SaveError);
  }
  const state = createGame(data);
  const recipe = data.recipes[0];
  for (const [id, amount] of Object.entries(recipe.inputs)) state.inventory[id] = amount;
  assert.equal(applyCommand(state, data, { type: 'craft', id: recipe.id }).ok, true);
  state.activity.reserved[Object.keys(recipe.inputs)[0]] += 1;
  assert.throws(() => decodeSave(encodeSave(state, 100), data), SaveError);
});

test('all seven original v2 states migrate without changing the unfinished journey', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  for (const [name, envelope] of Object.entries(legacy.fixtures)) {
    const raw = JSON.stringify(envelope);
    const loaded = decodeSave(raw, data);
    assert.equal(loaded.migrated, true, name);
    assert.equal(loaded.state.schemaVersion, SCHEMA_VERSION);
    for (const [key, value] of Object.entries(envelope.state)) if (key !== 'schemaVersion') assert.deepEqual(loaded.state[key], value, `${name}: ${key}`);
    assert.equal(loaded.savedAt, envelope.savedAt);
    assert.equal(loaded.raw, raw);
    assert.equal(loaded.state.town.createdAt, envelope.state.time);
    assert.ok(loaded.state.town.nextTickAt > envelope.state.time);
    assert.ok(loaded.state.town.totals.ticks === 0);
    const replay = decodeSave(encodeSave(loaded.state, loaded.savedAt), data);
    advanceGame(loaded.state, data, 600001, { offline: name === 'offlinePaused' });
    advanceGame(replay.state, data, 600001, { offline: name === 'offlinePaused' });
    assert.deepEqual(replay.state, loaded.state, `${name}: resumed outcome`);
  }
});

test('migration verifies the old v2 checksum before applying defaults', () => {
  const old = JSON.parse(readFileSync(new URL('./fixtures/pre-redesign-v2-save.json', import.meta.url), 'utf8'));
  old.state.inventory['rime-shore-wood'] = 999;
  const raw = JSON.stringify(old);
  const store = memory({ [SAVE_KEY]: raw });
  assert.throws(() => readSave(store, data), error => error.code === 'checksum');
  assert.equal(store.getItem(SAVE_KEY), raw);
  assert.equal(store.getItem(BACKUP_KEY), null);
});

test('migration preserves proof of obtained items without inventing enemy kills', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  const envelope = legacy.fixtures.completed;
  const migrated = decodeSave(JSON.stringify(envelope), data).state;
  for (const [id, amount] of Object.entries(envelope.state.totals.produced)) assert.ok(migrated.progression.collection.obtained[id] >= amount);
  assert.equal(Object.keys(migrated.progression.collection.kills).length, envelope.state.clearedRegions.length);
  for (const region of data.regions) assert.equal(migrated.progression.collection.kills[region.bossId], 1);
});

test('v2 migration does not report newly introduced seeds as already collected', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  for (const value of Object.values(legacy.fixtures)) {
    const migrated = decodeSave(JSON.stringify(value), data).state;
    for (const seedId of Object.keys(data.farming.initialSeeds)) {
      assert.equal(migrated.inventory[seedId] || 0, 0);
      assert.equal(migrated.progression.collection.obtained[seedId] || 0, 0);
    }
  }
});

test('missing battle counters and inconsistent skill levels are rejected before ticking', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  for (const mutate of [
    state => { delete state.battle.playerTurns; },
    state => { state.battle.turns = -1; },
    state => { state.battle.guardNext = 'yes'; },
    state => { state.battle.nextActionAt += 1; },
    state => { state.skills.combat.level = 999; },
    state => { state.phase = 'idle'; },
    state => { state.activity.regionId = data.regions[1].id; },
  ]) {
    const state = decodeSave(JSON.stringify(legacy.fixtures.explorationBattle), data).state;
    mutate(state);
    assert.throws(() => decodeSave(encodeSave(state, 100), data), SaveError);
  }
});

test('malformed pending return results never replace a valid save', () => {
  for (const pendingSummary of [
    { elapsedMs: -1 },
    { produced: { unknown: 1 } },
    { town: { produced: { unknown: 3 } } },
    { town: { ticks: 'one' } },
    { farm: { harvested: -1 } },
    { mastery: { xp: { unknown: 4 }, levels: [] } },
    { objectives: { claimed: ['unknown'] } },
    { events: 'broken' },
    { events: [null] },
    { events: { length: 1 } },
    { firstExplorationPaused: 'false' },
    { completed: 1 },
    { stopReason: {} },
  ]) {
    const raw = encodeSave(createGame(data), 100, { pendingSummary });
    assert.throws(() => decodeSave(raw, data), SaveError);
  }
});

test('earlier optional event summaries remain valid and readable after migration', () => {
  const pendingSummary = { elapsedMs: 5000, events: ['기록된 수비', { text: '기록된 채집', time: 4000 }] };
  const state = createGame(data);
  const restored = decodeSave(encodeSave(state, 100, { pendingSummary }), data);
  assert.deepEqual(restored.pendingSummary, pendingSummary);
});

test('construction escrow, growing crops and automatic supplies survive a saved interruption', () => {
  const state = createGame(data, { seed: 57 });
  assert.equal(applyCommand(state, data, { type: 'townBuild', buildingId: 'kitchen' }).ok, true);
  advanceGame(state, data, 30_000);
  assert.equal(applyCommand(state, data, { type: 'townAutoSupply', enabled: true, tradeId: 'supply-rime-shore', targetStock: 24 }).ok, true);
  for (const command of [{ type: 'townBuild', buildingId: 'sawmill' }, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: true }, { type: 'gather', id: 'rime-shore-logging' }]) assert.equal(applyCommand(state, data, command).ok, true);
  advanceGame(state, data, 12_345);
  const restored = decodeSave(encodeSave(state, 9876), data).state;
  assert.deepEqual(restored, state);
  assert.deepEqual(advanceGame(restored, data, 600_001, { offline: true }), advanceGame(state, data, 600_001, { offline: true }));
  assert.deepEqual(restored, state);
  assert.ok(state.town.totals.builds > 0 && state.farm.totals.harvested > 0);
});

test('a mature unharvested crop is paid once across save and reload', () => {
  const state = createGame(data, { seed: 5 });
  assert.equal(applyCommand(state, data, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: false }).ok, true);
  advanceGame(state, data, 180_001, { offline: true });
  assert.equal(state.farm.plots['plot-1'].status, 'ready');
  const restored = decodeSave(encodeSave(state, 345), data).state;
  const before = restored.inventory['rime-shore-raw'] || 0;
  assert.equal(applyCommand(restored, data, { type: 'farmHarvest', plotId: 'plot-1' }).ok, true);
  assert.equal(restored.inventory['rime-shore-raw'] - before, 8);
  const paid = decodeSave(encodeSave(restored, 346), data).state;
  const snapshot = structuredClone(paid);
  assert.equal(applyCommand(paid, data, { type: 'farmHarvest', plotId: 'plot-1' }).ok, false);
  assert.deepEqual(paid, snapshot);
});

test('corrupt town ledgers, construction escrow and crop timers never enter the event loop', () => {
  const base = createGame(data, { seed: 4 });
  applyCommand(base, data, { type: 'townBuild', buildingId: 'sawmill' });
  applyCommand(base, data, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore' });
  for (const mutate of [
    state => { delete state.town; },
    state => { state.town.resources.food = -1; },
    state => { state.town.resources.unknown = 1; },
    state => { state.town.coins = -1; },
    state => { state.town.level = 999; },
    state => { state.town.nextTickAt += 1; },
    state => { state.town.construction.reserved.resources.wood += 1; },
    state => { state.town.construction.endsAt += 1; },
    state => { state.town.priority[0] = state.town.priority[1]; },
    state => { state.town.autoSupply.targetStock = 0; },
    state => { state.progression.mastery['rime-shore-logging'].level = 999; },
    state => { state.progression.claimedObjectives = ['first-timber', 'first-timber']; },
    state => { state.progression.yieldRemainders['rime-shore-logging'] = { 'rime-shore-wood': 10000 }; },
    state => { state.farm.plots['plot-1'].readyAt = 0; },
    state => { state.farm.plots['plot-1'].outputs['rime-shore-raw'] = 999; },
    state => { state.farm.totals.harvested = 2; },
  ]) {
    const state = structuredClone(base);
    mutate(state);
    assert.throws(() => decodeSave(encodeSave(state, 100), data), SaveError);
  }
});

test('missing craft escrow and malformed battle town bonuses are rejected', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  const craft = decodeSave(JSON.stringify(legacy.fixtures.crafting), data).state;
  delete craft.activity.reserved;
  assert.throws(() => decodeSave(encodeSave(craft, 1), data), SaveError);
  const battle = decodeSave(JSON.stringify(legacy.fixtures.explorationBattle), data).state;
  for (const bonuses of [{ attack: -1 }, { unknown: 4 }, 'broken']) {
    battle.battle.townBonuses = bonuses;
    assert.throws(() => decodeSave(encodeSave(battle, 1), data), SaveError);
  }
});

test('a first-clear battle paused for a long offline return can be saved and resumed', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-township-v2-states.json', import.meta.url), 'utf8'));
  const state = decodeSave(JSON.stringify(legacy.fixtures.explorationBattle), data).state;
  const summary = advanceGame(state, data, 3_600_000, { offline: true });
  assert.equal(state.offlineBlocked, true);
  assert.ok(state.suspendedBattle && state.suspendedBattle.nextPlayerAt < state.time);
  const restored = decodeSave(encodeSave(state, 555, { pendingSummary: summary }), data).state;
  assert.deepEqual(restored, state);
  assert.deepEqual(advanceGame(restored, data, 60_000), advanceGame(state, data, 60_000));
  assert.deepEqual(restored, state);
  for (const mutate of [
    value => { delete value.suspendedBattle.remainingPlayerMs; },
    value => { value.suspendedBattle.remainingEnemyMs = -1; },
    value => { value.suspendedBattle.kind = 'raid'; },
  ]) {
    const value = decodeSave(JSON.stringify(legacy.fixtures.explorationBattle), data).state;
    advanceGame(value, data, 3_600_000, { offline: true });
    mutate(value);
    assert.throws(() => decodeSave(encodeSave(value, 555), data), SaveError);
  }
});
