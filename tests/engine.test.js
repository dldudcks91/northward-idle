import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createGame, applyCommand, advanceGame, validateContent, getDerivedStats, getSkillLevel, getRegionRequirements } from '../src/simulation/engine.js';
import { playCampaign } from './campaign.js';
import { validateState, encodeSave, decodeSave } from '../src/storage/save.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const cmd = (state, value) => assert.equal(applyCommand(state, data, value).ok, true, JSON.stringify(value));
const sum = map => Object.values(map).reduce((a, b) => a + b, 0);

function gearedFirst(seed = 1) {
  const state = createGame(data, { seed });
  for (const itemId of data.regions[0].recommendedGear) {
    state.inventory[itemId] = 1;
    cmd(state, { type: 'equip', itemId });
  }
  state.inventory['rime-shore-food'] = 1000;
  return state;
}

test('content has a connected six-chapter campaign and validates all references', () => {
  assert.equal(validateContent(data), true);
  assert.equal(data.regions.length, 6);
  assert.equal(data.activities.length, 18);
  assert.equal(data.recipes.length, 36);
  const malformed = clone(data);
  malformed.recipes[0].outputs.unknown = 1;
  assert.throws(() => validateContent(malformed), /unknown/);
  const duplicate = clone(data);
  duplicate.items.push(duplicate.items[0]);
  assert.throws(() => validateContent(duplicate), /중복/);
  const negative = clone(data);
  negative.regions[0].raidIntervalMs = -1;
  assert.throws(() => validateContent(negative), /raidIntervalMs/);
});

test('a fresh game is serializable, seeded and independent of wall clock', () => {
  const one = createGame(data, { seed: 42, now: 1000 });
  assert.deepEqual(one, createGame(data, { seed: 42, now: 1000 }));
  assert.deepEqual(one, clone(one));
  assert.equal(one.schemaVersion, 3);
  assert.equal(one.unlockedRegions.length, 1);
  assert.equal(one.hp, getDerivedStats(one, data).maxHp);
  assert.equal(getSkillLevel(0), 1);
  assert.equal(getSkillLevel(24), 1);
  assert.equal(getSkillLevel(25), 2);
});

test('changing the content XP curve changes earned skill levels', () => {
  const tuned = clone(data);
  tuned.settings.skillXpDivisor = 1;
  const state = createGame(tuned);
  assert.equal(applyCommand(state, tuned, { type: 'gather', id: 'rime-shore-logging' }).ok, true);
  advanceGame(state, tuned, 12000);
  assert.equal(state.skills.woodcutting.level, getSkillLevel(state.skills.woodcutting.xp, 1));
  assert.ok(state.skills.woodcutting.level > getSkillLevel(state.skills.woodcutting.xp, 25));
});

test('invalid commands are atomic and return useful reasons', () => {
  const state = createGame(data);
  for (const value of [{ type: 'craft', id: 'rime-shore-saw' }, { type: 'gather', id: 'pinewood-logging' }, { type: 'equip', itemId: 'aurora-ruins-weapon' }, { type: 'craft', id: 'rime-shore-saw', count: 0 }, { type: 'travel', regionId: 'unknown' }, { type: 'combatStyle', id: 'unknown' }]) {
    const before = clone(state);
    const result = applyCommand(state, data, value);
    assert.equal(result.ok, false);
    assert.ok(result.message);
    assert.deepEqual(state, before);
  }
  assert.equal(getRegionRequirements(state, data, 'rime-shore').ok, false);
});

test('crafting escrows inputs, refunds cancellation and pays each completed cycle once', () => {
  const state = createGame(data);
  state.inventory['rime-shore-wood'] = 12;
  cmd(state, { type: 'craft', id: 'rime-shore-saw', count: 2 });
  assert.equal(state.inventory['rime-shore-wood'], 8);
  const duration = state.activity.durationMs;
  advanceGame(state, data, duration - 1);
  assert.equal(state.inventory['rime-shore-plank'] || 0, 0);
  advanceGame(state, data, 1);
  assert.equal(state.inventory['rime-shore-plank'], 2);
  assert.equal(state.totals.consumed['rime-shore-wood'], 4);
  cmd(state, { type: 'stop' });
  assert.equal(state.inventory['rime-shore-wood'], 8);
  cmd(state, { type: 'craft', id: 'rime-shore-saw', count: 2 });
  advanceGame(state, data, 30000);
  assert.equal(state.inventory['rime-shore-wood'], 0);
  assert.equal(state.inventory['rime-shore-plank'], 6);
  assert.equal(state.activity, null);
  assert.equal(state.totals.consumed['rime-shore-wood'], 12);
});

test('input exhaustion stops safely and the current command does not reset a cycle', () => {
  const state = createGame(data);
  state.inventory['rime-shore-wood'] = 4;
  cmd(state, { type: 'craft', id: 'rime-shore-saw' });
  advanceGame(state, data, 4500);
  const before = clone(state.activity);
  cmd(state, { type: 'craft', id: 'rime-shore-saw' });
  assert.deepEqual(state.activity, before);
  advanceGame(state, data, 10000);
  assert.equal(state.inventory['rime-shore-plank'], 2);
  assert.equal(state.activity, null);
  assert.match(state.stopReason, /부족/);
});

test('work finishing at the raid timestamp pays first and preserves the new cycle', () => {
  const state = gearedFirst();
  cmd(state, { type: 'gather', id: 'rime-shore-logging' });
  state.nextRaidAt = state.activity.durationMs;
  advanceGame(state, data, state.activity.durationMs);
  assert.equal(state.inventory['rime-shore-wood'], 4);
  assert.equal(state.phase, 'defending');
  assert.equal(state.activity.progressMs, 0);
  assert.equal(state.totals.raids, 1);
  const before = clone(state);
  const result = applyCommand(state, data, { type: 'equip', itemId: 'starter-spear' });
  assert.equal(result.ok, false);
  assert.deepEqual(state, before);
});

test('a raid preserves an unfinished recipe exactly and resumes it once', () => {
  const state = gearedFirst();
  state.inventory['rime-shore-wood'] = 4;
  cmd(state, { type: 'craft', id: 'rime-shore-saw', count: 1 });
  state.nextRaidAt = 4000;
  advanceGame(state, data, 4000);
  assert.equal(state.activity.progressMs, 4000);
  advanceGame(state, data, 2000);
  assert.equal(state.activity.progressMs, 4000);
  advanceGame(state, data, 60000);
  assert.equal(state.inventory['rime-shore-plank'], 2);
  assert.equal(state.totals.consumed['rime-shore-wood'], 4);
  assert.equal(state.totals.defenseWins, 1);
  assert.equal(state.activity, null);
});

test('a single protagonist suspends exploration combat to defend and restores the damaged enemy', () => {
  const state = gearedFirst();
  cmd(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 8000);
  const nextHit = state.battle.nextPlayerAt;
  state.nextRaidAt = nextHit + 1;
  advanceGame(state, data, nextHit + 1 - state.time);
  assert.equal(state.battle.kind, 'raid');
  assert.ok(state.suspendedBattle);
  assert.ok(state.suspendedBattle.enemyHp < state.suspendedBattle.enemyMaxHp);
  const held = clone(state.suspendedBattle);
  while (state.phase === 'defending') advanceGame(state, data, 1);
  assert.equal(state.battle.id, held.id);
  assert.equal(state.battle.enemyHp, held.enemyHp);
  assert.equal(state.battle.nextPlayerAt - state.time, held.remainingPlayerMs);
  assert.equal(state.battle.nextEnemyAt - state.time, held.remainingEnemyMs);
});

test('new-region combat pauses offline, raids continue and the exact combat resumes online', () => {
  const state = gearedFirst();
  cmd(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 9500);
  const battle = clone(state.battle);
  const playerRemaining = battle.nextPlayerAt - state.time;
  const summary = advanceGame(state, data, 1200000, { offline: true });
  assert.equal(state.clearedRegions.length, 0);
  assert.equal(state.activity.encounters, 0);
  assert.equal(state.suspendedBattle.enemyHp, battle.enemyHp);
  assert.equal(state.suspendedBattle.remainingPlayerMs, playerRemaining);
  assert.equal(summary.firstExplorationPaused, true);
  assert.ok(summary.raids >= 3);
  assert.equal(summary.explorationWins, 0);
  assert.equal(state.activity.status, 'offline-paused');
  while (state.phase === 'defending') advanceGame(state, data, 1, { offline: true });
  advanceGame(state, data, 0);
  assert.equal(state.battle.id, battle.id);
  assert.equal(state.battle.nextPlayerAt - state.time, playerRemaining);
  assert.equal(state.offlineBlocked, false);
});

test('offline first exploration is identical across differently sized time chunks', () => {
  const single = gearedFirst(19);
  cmd(single, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(single, data, 10000);
  const split = clone(single);
  advanceGame(single, data, 86400000, { offline: true });
  for (let i = 0; i < 288; i++) advanceGame(split, data, 300000, { offline: true });
  assert.deepEqual(split, single);
});

test('24-hour gathering preserves all state across chunks and online versus offline', () => {
  const initial = createGame(data, { seed: 81 });
  cmd(initial, { type: 'gather', id: 'rime-shore-logging' });
  const single = clone(initial), split = clone(initial), offline = clone(initial);
  advanceGame(single, data, 86400000);
  for (let i = 0; i < 864; i++) advanceGame(split, data, 100000);
  advanceGame(offline, data, 86400000, { offline: true });
  assert.deepEqual(split, single);
  assert.deepEqual(offline, single);
  assert.ok(single.inventory['rime-shore-wood'] > 10000);
});

test('cleared-region repeat exploration continues offline with identical RNG, rewards and timings', () => {
  const online = gearedFirst(991);
  cmd(online, { type: 'explore', regionId: 'rime-shore' });
  while (!online.clearedRegions.length) advanceGame(online, data, 1000);
  const offline = clone(online), split = clone(online);
  advanceGame(online, data, 3600000);
  advanceGame(offline, data, 3600000, { offline: true });
  for (let i = 0; i < 720; i++) advanceGame(split, data, 5000, { offline: true });
  assert.deepEqual(offline, online);
  assert.deepEqual(split, online);
  assert.ok(online.totals.tripsCompleted > 1);
});

test('repeat expeditions return when supplies are gone and do not grant free encounters', () => {
  const state = gearedFirst();
  state.clearedRegions.push('rime-shore');
  state.inventory['rime-shore-food'] = 1;
  cmd(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 200000, { offline: true });
  assert.equal(state.activity, null);
  assert.match(state.stopReason, /보급/);
  assert.equal(state.totals.explorationWins, 1);
});

test('consecutive defense losses cap material damage while retaining gear, skills and unlocks', () => {
  const state = createGame(data, { seed: 11 });
  state.regionId = data.regions[5].id;
  state.unlockedRegions = data.regions.map(region => region.id);
  state.inventory['rime-shore-food'] = 0;
  state.inventory['aurora-ruins-wood'] = 100;
  state.inventory['aurora-ruins-trophy'] = 12;
  state.autoFood = false;
  state.nextRaidAt = 1;
  const equipment = clone(state.equipment);
  const skills = clone(state.skills);
  const unlocked = clone(state.unlockedRegions);
  const summary = advanceGame(state, data, 86400000, { offline: true });
  assert.ok(summary.defenseLosses > 100);
  assert.ok(sum(summary.lost) <= data.settings.lossStreakCap);
  assert.ok(state.inventory['aurora-ruins-wood'] >= 75);
  assert.equal(state.inventory['aurora-ruins-trophy'], 12);
  assert.deepEqual(state.equipment, equipment);
  assert.deepEqual(state.skills, skills);
  assert.deepEqual(state.unlockedRegions, unlocked);
  assert.ok(state.hp >= 1);
});

test('defeat recovery automatically resumes protected crafting', () => {
  const state = createGame(data);
  state.unlockedRegions = data.regions.map(region => region.id);
  state.regionId = data.regions[5].id;
  state.inventory['rime-shore-wood'] = 4;
  state.inventory['rime-shore-food'] = 0;
  state.autoFood = false;
  cmd(state, { type: 'craft', id: 'rime-shore-saw', count: 1 });
  state.nextRaidAt = 1000;
  advanceGame(state, data, 120000);
  assert.equal(state.inventory['rime-shore-plank'], 2);
  assert.equal(state.totals.consumed['rime-shore-wood'], 4);
  assert.equal(state.totals.defenseLosses, 1);
  assert.equal(state.activity, null);
});

test('battle serialization round trips without changing future events', () => {
  const one = gearedFirst(821);
  cmd(one, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(one, data, 13000);
  assert.ok(one.battle);
  const two = clone(one);
  advanceGame(one, data, 86400000, { offline: true });
  advanceGame(two, data, 86400000, { offline: true });
  assert.deepEqual(two, one);
});

test('three combat styles have distinct stats and deterministic automatic techniques', () => {
  const state = gearedFirst(4);
  const balanced = getDerivedStats(state, data);
  cmd(state, { type: 'combatStyle', id: 'power' });
  const power = getDerivedStats(state, data);
  assert.ok(power.attack > balanced.attack);
  assert.equal(power.attackMs, balanced.attackMs + 350);
  cmd(state, { type: 'combatStyle', id: 'guard' });
  assert.ok(getDerivedStats(state, data).defense > balanced.defense);
  cmd(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 100000);
  assert.ok(state.events.some(value => value.type === 'skill'));
  const before = clone(state);
  if (state.battle) {
    assert.equal(applyCommand(state, data, { type: 'combatStyle', id: 'power' }).ok, false);
    assert.deepEqual(state, before);
  }
});

test('Focus Stop serializes simultaneous attacks and pauses the other action clock', () => {
  const state = gearedFirst(73);
  cmd(state, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(state, data, 8000);
  state.battle.enemyHp = 1000;
  state.battle.enemyMaxHp = 1000;
  const same = state.time + 1000;
  state.battle.nextPlayerAt = same;
  state.battle.nextEnemyAt = same;
  const split = clone(state);
  advanceGame(state, data, 1000);
  assert.equal(state.battle.lastAction.actor, 'player');
  assert.equal(state.battle.nextEnemyAt, same + data.settings.focusStopMs);
  const actionId = state.battle.lastAction.id;
  advanceGame(state, data, data.settings.focusStopMs - 1);
  assert.equal(state.battle.lastAction.id, actionId);
  advanceGame(state, data, 1);
  assert.equal(state.battle.lastAction.actor, 'enemy');
  assert.equal(state.battle.lastAction.time - same, data.settings.focusStopMs);
  advanceGame(split, data, 1000 + data.settings.focusStopMs);
  assert.deepEqual(split, state);
});

test('all six chapters and ending are reached from a fresh save using only normal commands', () => {
  const measurements = [];
  for (const seed of [1, 7, 91]) {
    const run = playCampaign(data, seed);
    assert.equal(run.state.completed, true);
    assert.equal(run.state.clearedRegions.length, 6);
    assert.equal(run.state.unlockedRegions.length, 6);
    assert.ok(run.state.endingAt > 0);
    assert.ok(run.state.events.some(value => value.type === 'ending'));
    assert.ok(run.steps.every(step => step.foodLeft > 0));
    measurements.push({ seed, totalMinutes: Math.round(run.elapsedMs / 600) / 100, defenseWins: run.state.totals.defenseWins, defenseLosses: run.state.totals.defenseLosses, steps: run.steps });
    cmd(run.state, { type: 'explore', regionId: data.regions[0].id });
    const post = advanceGame(run.state, data, 120000, { offline: true });
    assert.equal(run.state.completed, true);
    assert.ok(post.explorationWins > 0);
  }
  console.log('CAMPAIGN_BALANCE', JSON.stringify(measurements));
});

test('seven-day calculation completes and ignores negative elapsed time without rewinding', () => {
  const state = createGame(data);
  cmd(state, { type: 'gather', id: 'rime-shore-mining' });
  const started = performance.now();
  const summary = advanceGame(state, data, 7 * 86400000, { offline: true });
  const elapsed = performance.now() - started;
  assert.equal(summary.elapsedMs, 7 * 86400000);
  assert.ok(elapsed < 10000, `7일 계산 ${elapsed}ms`);
  const before = clone(state);
  const negative = advanceGame(state, data, -1000, { offline: true });
  assert.equal(negative.elapsedMs, 0);
  assert.deepEqual(state, before);
  console.log('SEVEN_DAY_CALCULATION_MS', Math.round(elapsed));
});

test('last-chapter repeat exploration matches exactly for 24 hours online, offline and split', () => {
  const run = playCampaign(data, 404);
  const one = run.state;
  // Campaign and gear were earned through normal commands; this isolated
  // long-run fixture adds ample food so exhaustion cannot end the comparison.
  one.inventory['aurora-ruins-food'] = 100000;
  cmd(one, { type: 'explore', regionId: 'aurora-ruins' });
  const offline = clone(one), split = clone(one);
  advanceGame(one, data, 86400000);
  advanceGame(offline, data, 86400000, { offline: true });
  for (let i = 0; i < 864; i++) advanceGame(split, data, 100000, { offline: true });
  assert.deepEqual(offline, one);
  assert.deepEqual(split, one);
  assert.ok(one.totals.tripsCompleted > 100);
  assert.equal(one.activity?.type, 'explore');
  assert.equal(validateState(one, data), one);
});

test('active work, escrow, suspended exploration, raid, recovery and ending states all pass save validation', () => {
  const states = [];
  const working = createGame(data);
  cmd(working, { type: 'gather', id: 'rime-shore-logging' });
  advanceGame(working, data, 1777);
  states.push(clone(working));
  working.inventory['rime-shore-wood'] = 8;
  cmd(working, { type: 'craft', id: 'rime-shore-saw', count: 2 });
  advanceGame(working, data, 1234);
  states.push(clone(working));
  const exploration = gearedFirst(713);
  cmd(exploration, { type: 'explore', regionId: 'rime-shore' });
  advanceGame(exploration, data, 9999);
  states.push(clone(exploration));
  advanceGame(exploration, data, 1, { offline: true });
  assert.ok(exploration.suspendedBattle);
  states.push(clone(exploration));
  exploration.nextRaidAt = exploration.time + 1;
  advanceGame(exploration, data, 1, { offline: true });
  assert.equal(exploration.phase, 'defending');
  states.push(clone(exploration));
  const recovering = createGame(data);
  recovering.unlockedRegions = data.regions.map(region => region.id);
  recovering.regionId = 'aurora-ruins';
  recovering.inventory['rime-shore-food'] = 0;
  recovering.autoFood = false;
  recovering.nextRaidAt = 1;
  while (recovering.phase !== 'recovering') advanceGame(recovering, data, 1000);
  states.push(clone(recovering));
  states.push(playCampaign(data, 303).state);
  for (const state of states) {
    assert.equal(validateState(state, data), state);
    const loaded = decodeSave(encodeSave(state, 10000000), data).state;
    assert.deepEqual(loaded, state);
    const copy = clone(state);
    advanceGame(copy, data, 3600000, { offline: true });
    advanceGame(loaded, data, 3600000, { offline: true });
    assert.deepEqual(copy, loaded);
  }
});

test('twenty fixed seeds measure preparation effects on defense and bounded losses', () => {
  const report = [];
  const seeds = Array.from({ length: 20 }, (_, i) => 101 + i * 17);
  for (const ready of [false, true]) {
    const samples = [];
    for (const seed of seeds) {
      const state = createGame(data, { seed });
      // Explicit controlled fixtures: identical region, skill and raid schedule;
      // equipment and supplies are the only preparation differences.
      state.regionId = 'aurora-ruins';
      state.unlockedRegions = data.regions.map(region => region.id);
      state.skills.combat = { xp: 3025, level: 12 };
      state.inventory['rime-shore-food'] = 0;
      state.inventory['aurora-ruins-wood'] = 100;
      state.inventory['aurora-ruins-ore'] = 100;
      state.nextRaidAt = 60000;
      if (ready) {
        state.inventory['aurora-ruins-food'] = 100;
        for (const itemId of data.regions[5].recommendedGear) {
          state.inventory[itemId] = 1;
          cmd(state, { type: 'equip', itemId });
        }
      } else state.autoFood = false;
      state.hp = getDerivedStats(state, data).maxHp;
      cmd(state, { type: 'gather', id: 'aurora-ruins-logging' });
      const result = advanceGame(state, data, 3600000, { offline: true });
      assert.equal(validateState(state, data), state);
      assert.ok(sum(result.lost) <= data.settings.lossStreakCap);
      samples.push({ seed, raids: result.raids, wins: result.defenseWins, losses: result.defenseLosses, lost: sum(result.lost), foodUsed: result.consumed['aurora-ruins-food'] || 0, interruptedMs: result.interruptedMs, woodProduced: result.produced['aurora-ruins-wood'] || 0 });
    }
    const mean = key => samples.reduce((total, sample) => total + sample[key], 0) / samples.length;
    const standardDeviation = key => Math.sqrt(samples.reduce((total, sample) => total + (sample[key] - mean(key)) ** 2, 0) / samples.length);
    const row = { ready, sampleCount: samples.length, meanWins: mean('wins'), meanLosses: mean('losses'), meanLost: mean('lost'), meanFoodUsed: mean('foodUsed'), meanInterruptionPercent: Math.round(mean('interruptedMs') / 36000 * 100) / 100, interruptionStdDevMs: Math.round(standardDeviation('interruptedMs')), meanWoodProduced: mean('woodProduced'), samples };
    if (ready) assert.equal(row.meanLosses, 0);
    else assert.ok(row.meanLosses > 10);
    report.push(row);
  }
  console.log('DEFENSE_BALANCE', JSON.stringify(report));
});
