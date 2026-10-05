import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playTownshipCampaign } from './township-campaign.js';
import { createGame, advanceGame, applyCommand, validateExpansionState } from '../src/simulation/engine.js';
import { combineSummary } from '../src/app/summary.js';
import { encodeSave, decodeSave } from '../src/storage/save.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
let completed;

test('three normal-command Township campaigns reach all facilities and every long-term goal', () => {
  const reports = [];
  for (const seed of [1, 7, 91]) {
    const result = playTownshipCampaign(data, seed);
    const state = result.state;
    assert.equal(state.completed, true);
    assert.equal(state.clearedRegions.length, 6);
    assert.ok(Object.values(state.town.buildings).every(b => b.level === 6));
    assert.deepEqual([...state.progression.claimedObjectives].sort(), data.objectives.map(o => o.id).sort());
    assert.ok(state.farm.totals.harvested >= 20);
    assert.ok(state.town.totals.trades > 0 && state.town.totals.repairs > 0 && state.town.totals.taxes > 0);
    assert.equal(validateExpansionState(state, data), true);
    assert.deepEqual(decodeSave(encodeSave(state, 1234), data).state, state);
    assert.ok(result.commands.length > 100 && result.townCommands.length > 100);
    reports.push({ seed, gameHours: result.elapsedMs / 3_600_000, facilities: Object.keys(state.town.buildings).length,
      facilityUpgrades: state.town.totals.upgrades, claimed: state.progression.claimedObjectives.length,
      harvests: state.farm.totals.harvested, trades: state.town.totals.trades,
      defenseWins: state.totals.defenseWins, defenseLosses: state.totals.defenseLosses,
      townCommands: result.townCommands.length, milestones: result.milestones });
    if (seed === 91) completed = structuredClone(state);
  }
  fs.mkdirSync(new URL('../artifacts/township/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../artifacts/township/campaign.json', import.meta.url), JSON.stringify({ mode: 'normal commands; exact logical time; no inventory/state editing', reports }, null, 2));
  fs.writeFileSync(new URL('../artifacts/township/completed-state.json', import.meta.url), JSON.stringify(completed));
  console.log('TOWNSHIP_CAMPAIGN', JSON.stringify(reports.map(({ milestones, ...report }) => report)));
});

test('actual town/farm/mastery summaries match exact five-minute return slices', () => {
  const state = createGame(data, { seed: 43 });
  for (const command of [{ type: 'gather', id: 'rime-shore-logging' }, { type: 'farmPlant', plotId: 'plot-1', cropId: 'crop-rime-shore', autoReplant: true }, { type: 'townBuild', buildingId: 'sawmill' }]) assert.equal(applyCommand(state, data, command).ok, true);
  const whole = structuredClone(state), split = structuredClone(state);
  const elapsed = 2 * 3_600_000;
  const summary = advanceGame(whole, data, elapsed, { offline: true });
  let merged = null;
  for (let remaining = elapsed; remaining; remaining -= 300_000) merged = combineSummary(merged, advanceGame(split, data, 300_000, { offline: true }));
  assert.deepEqual(split, whole);
  assert.deepEqual(merged, { ...summary, awayMs: 0, excludedMs: 0 });
  assert.ok(summary.town.builds > 0 && summary.town.ticks === 120 && summary.farm.harvested === 3);
  assert.ok(summary.mastery.xp['rime-shore-logging'] > 0);
  assert.deepEqual(decodeSave(encodeSave(whole, 12, { pendingSummary: merged }), data).pendingSummary, merged);
});

test('a mature village survives seven offline days without deleting permanent growth', () => {
  assert.ok(completed, 'normal campaign fixture must have completed first');
  const state = structuredClone(completed);
  while (['defending', 'recovering'].includes(state.phase)) advanceGame(state, data, 1000);
  const before = structuredClone(state);
  assert.equal(applyCommand(state, data, { type: 'gather', id: 'aurora-ruins-logging' }).ok, true);
  const began = performance.now();
  const summary = advanceGame(state, data, 7 * 86_400_000, { offline: true });
  const milliseconds = performance.now() - began;
  assert.equal(state.town.population, before.town.population);
  assert.deepEqual(Object.fromEntries(Object.entries(state.town.buildings).map(([id, b]) => [id, b.level])), Object.fromEntries(Object.entries(before.town.buildings).map(([id, b]) => [id, b.level])));
  assert.equal(state.completed, true);
  assert.deepEqual(state.clearedRegions, before.clearedRegions);
  assert.deepEqual(state.progression.claimedObjectives, before.progression.claimedObjectives);
  assert.ok(state.town.xp >= before.town.xp);
  assert.ok(Object.values(state.town.resources).every(n => Number.isSafeInteger(n) && n >= 0));
  assert.equal(validateExpansionState(state, data), true);
  assert.deepEqual(decodeSave(encodeSave(state, 1234), data).state, state);
  assert.equal(summary.town.ticks, 10_080);
  console.log('TOWNSHIP_SEVEN_DAY', JSON.stringify({ milliseconds, ticks: summary.town.ticks, tradeCount: summary.town.trades, overflow: summary.town.overflow, conditions: Object.fromEntries(Object.entries(state.town.buildings).map(([id, b]) => [id, b.conditionBps])) }));
});

test('costed town food extends real offline repeat expeditions across ten fixed random seeds', () => {
  assert.ok(completed);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const seed = 101 + i * 17;
    const base = structuredClone(completed);
    while (['defending', 'recovering'].includes(base.phase)) advanceGame(base, data, 1000);
    // A controlled RNG comparison on the same legitimately earned endgame.
    base.rng = seed;
    const disabled = structuredClone(base), enabled = structuredClone(base);
    for (const [state, supply] of [[disabled, false], [enabled, true]]) {
      assert.equal(applyCommand(state, data, { type: 'townAutoSupply', enabled: supply, tradeId: 'supply-aurora-ruins', targetStock: 24 }).ok, true);
      assert.equal(applyCommand(state, data, { type: 'explore', regionId: 'aurora-ruins' }).ok, true);
    }
    const without = advanceGame(disabled, data, 86_400_000, { offline: true });
    const withSupply = advanceGame(enabled, data, 86_400_000, { offline: true });
    assert.ok(withSupply.town.trades > 0);
    assert.ok(withSupply.town.consumed.provisions > 0);
    assert.ok(withSupply.produced['aurora-ruins-food'] > 0);
    assert.ok(withSupply.explorationWins > without.explorationWins);
    assert.ok(Object.values(enabled.town.resources).every(n => n >= 0));
    assert.equal(validateExpansionState(enabled, data), true);
    assert.deepEqual(decodeSave(encodeSave(enabled, 567), data).state, enabled);
    samples.push({ seed, without: { wins: without.explorationWins, stop: without.stopReason }, withSupply: { wins: withSupply.explorationWins, stop: withSupply.stopReason, trades: withSupply.town.trades, provisionsUsed: withSupply.town.consumed.provisions, foodProduced: withSupply.produced['aurora-ruins-food'], foodConsumed: withSupply.consumed['aurora-ruins-food'], raidWins: withSupply.defenseWins, raidLosses: withSupply.defenseLosses } });
  }
  fs.writeFileSync(new URL('../artifacts/township/supply-balance.json', import.meta.url), JSON.stringify({ elapsedMs: 86_400_000, controlledSeeds: 10, stateSource: 'normal-command Township campaign seed 91; RNG only varied for experiment', samples }, null, 2));
  console.log('TOWNSHIP_SUPPLY_BALANCE', JSON.stringify(samples));
});
