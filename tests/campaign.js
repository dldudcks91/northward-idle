// A normal-command player used by automated balance and full-campaign verification.
// Fast forwarding advances the same simulation as the live game; no state is edited.
import { createGame, applyCommand, advanceGame } from '../src/simulation/engine.js';

export function playCampaign(data, seed = 1, options = {}) {
  const state = options.initialState ?? createGame(data, { seed });
  const steps = [];
  const commands = [];
  const advance = (ms = 1000) => advanceGame(state, data, ms);
  const safe = () => {
    let ticks = 0;
    while (['defending', 'recovering'].includes(state.phase)) {
      advance();
      if (++ticks > 600) throw new Error('수비 또는 회복이 끝나지 않습니다.');
    }
  };
  const command = value => {
    safe();
    const result = applyCommand(state, data, value);
    if (!result.ok) throw new Error(`${JSON.stringify(value)}: ${result.message}`);
    commands.push({ time: state.time, ...value });
  };
  const gather = (activity, itemId, target) => {
    command({ type: 'gather', id: activity.id });
    let ticks = 0;
    while ((state.inventory[itemId] || 0) < target) {
      advance();
      if (++ticks > 1800) throw new Error(`채집 시간 초과: ${itemId}`);
    }
    safe();
    command({ type: 'stop' });
  };
  const ensure = (itemId, target, stack = []) => {
    if ((state.inventory[itemId] || 0) >= target) return;
    if (stack.includes(itemId)) throw new Error(`제작 순환 참조: ${itemId}`);
    const gatherActivity = data.activities.find(work => work.outputs[itemId] > 0 && state.unlockedRegions.includes(work.regionId));
    if (gatherActivity) {
      gather(gatherActivity, itemId, target);
      return;
    }
    const recipe = data.recipes.find(work => work.outputs[itemId] > 0 && state.unlockedRegions.includes(work.regionId));
    if (!recipe) throw new Error(`얻을 수 없는 재료: ${itemId}`);
    const count = Math.ceil((target - (state.inventory[itemId] || 0)) / recipe.outputs[itemId]);
    make(recipe, count, [...stack, itemId]);
  };
  const make = (recipe, count, stack = []) => {
    for (const [itemId, amount] of Object.entries(recipe.inputs)) ensure(itemId, amount * count, stack);
    command({ type: 'craft', id: recipe.id, count });
    let ticks = 0;
    while (state.activity?.id === recipe.id || ['defending', 'recovering'].includes(state.phase)) {
      advance();
      if (++ticks > 1800) throw new Error(`제작 시간 초과: ${recipe.id}`);
    }
  };
  for (const region of [...data.regions].sort((a, b) => a.index - b.index)) {
    const before = state.time;
    const defenseBefore = state.totals.defenseWins;
    const lossBefore = state.totals.defenseLosses;
    command({ type: 'travel', regionId: region.id });
    options.beforeRegion?.({ state, region, command, advance, safe, ensure, make });
    // The region is entered with the previous chapter's gear. Food and new gear
    // are then made from that chapter's own activities and processing recipes.
    ensure(region.recommendedFood, 24);
    for (const itemId of region.recommendedGear) {
      ensure(itemId, 1);
      command({ type: 'equip', itemId });
    }
    const preparedAt = state.time;
    command({ type: 'explore', regionId: region.id });
    let ticks = 0;
    while (!state.clearedRegions.includes(region.id)) {
      advance();
      if (!state.activity && state.phase === 'idle') throw new Error(`${region.name} 탐험 중단: ${state.stopReason}`);
      if (++ticks > 1200) throw new Error(`돌파 시간 초과: ${region.id}`);
    }
    safe();
    command({ type: 'stop' });
    options.afterRegion?.({ state, region, command, advance, safe, ensure, make });
    steps.push({ regionId: region.id, preparationMs: preparedAt - before, expeditionMs: state.time - preparedAt, elapsedMs: state.time - before, defenseWins: state.totals.defenseWins - defenseBefore, defenseLosses: state.totals.defenseLosses - lossBefore, foodLeft: state.inventory[region.recommendedFood] || 0, combatLevel: state.skills.combat.level });
  }
  return { state, steps, commands, elapsedMs: state.time };
}
