import test from 'node:test';
import assert from 'node:assert/strict';
import { combineSummary } from '../src/app/summary.js';

test('return slices keep player, town and farm resource ledgers separate', () => {
  const a = { elapsedMs: 60000, produced: { fish: 3 }, consumed: { seed: 1 }, town: { elapsedMs: 60000, produced: { wood: 4 }, consumed: { fuel: 2 }, overflow: { stone: 1 }, trades: 1, ticks: 1 }, farm: { harvested: 1, produced: { fish: 2 }, consumed: { seed: 1 } } };
  const b = { elapsedMs: 60000, produced: { fish: 5 }, consumed: { seed: 2 }, town: { elapsedMs: 60000, produced: { wood: 6 }, consumed: { fuel: 1 }, overflow: { stone: 3 }, trades: 2, ticks: 1 }, farm: { harvested: 2, produced: { fish: 4 }, consumed: { seed: 2 }, autoReplanted: 2 } };
  const result = combineSummary(a, b);
  assert.equal(result.elapsedMs, 120000);
  assert.deepEqual(result.produced, { fish: 8 });
  assert.deepEqual(result.town.produced, { wood: 10 });
  assert.deepEqual(result.town.consumed, { fuel: 3 });
  assert.deepEqual(result.town.overflow, { stone: 4 });
  assert.equal(result.town.trades, 3);
  assert.equal(result.town.ticks, 2);
  assert.equal(result.farm.harvested, 3);
  assert.deepEqual(result.farm.produced, { fish: 6 });
  assert.deepEqual(result.farm.consumed, { seed: 3 });
  assert.equal(result.farm.autoReplanted, 2);
  assert.deepEqual(a.town.produced, { wood: 4 });
});

test('pending returns retain every mastery gain and a single claim per objective', () => {
  const a = { elapsedMs: 1000, clearedRegions: ['shore'], mastery: { xp: { saw: 10 }, levels: [{ id: 'saw', from: 1, to: 2 }] }, objectives: { claimed: ['home'] } };
  const b = { elapsedMs: 2000, clearedRegions: ['shore', 'woods'], mastery: { xp: { saw: 20, fish: 4 }, levels: [{ id: 'saw', from: 2, to: 4 }, { id: 'fish', from: 1, to: 2 }] }, objectives: { claimed: ['home', 'trade'] }, stopReason: 'seeds exhausted' };
  const result = combineSummary(a, b);
  assert.deepEqual(result.mastery, { xp: { saw: 30, fish: 4 }, levels: [{ id: 'saw', from: 1, to: 4 }, { id: 'fish', from: 1, to: 2 }] });
  assert.deepEqual(result.objectives.claimed, ['home', 'trade']);
  assert.deepEqual(result.clearedRegions, ['shore', 'woods']);
  assert.equal(result.stopReason, 'seeds exhausted');
});

test('summary merging is associative and does not share stored objects', () => {
  const parts = [1, 2, 3].map(value => ({ elapsedMs: value, produced: { ore: value }, town: { ticks: value, produced: { wood: value } }, farm: { harvested: value }, mastery: { xp: { cut: value }, levels: [] } }));
  assert.deepEqual(combineSummary(combineSummary(parts[0], parts[1]), parts[2]), combineSummary(parts[0], combineSummary(parts[1], parts[2])));
  const copy = combineSummary(null, parts[0]);
  copy.town.produced.wood = 99;
  assert.equal(parts[0].town.produced.wood, 1);
  assert.equal(combineSummary(null, null), null);
});
