// A complete Township player: normal commands and the real event loop only.
// This module also provides reproducible browser fixtures without inventory edits.
import { applyCommand, advanceGame, getTownStats, getTownActionAvailability, getObjectives } from '../src/simulation/engine.js';
import { playCampaign } from './campaign.js';

export function playTownshipCampaign(data, seed = 1) {
  const townCommands = [];
  const milestones = [];
  let tools;
  const command = value => {
    const result = applyCommand(tools.state, data, value);
    if (!result.ok) throw new Error(`Township ${JSON.stringify(value)}: ${result.message}`);
    townCommands.push({ time: tools.state.time, ...value });
  };
  const claimReady = () => {
    for (const objective of getObjectives(tools.state, data)) {
      if (objective.claimed || !objective.unlocked || !objective.progress.every(p => p.current >= p.target)) continue;
      const available = () => getTownActionAvailability(tools.state, data, { type: 'claimObjective', objectiveId: objective.id });
      if (!available().ok && available().message.includes('보상')) {
        // Deliberate one-time reward room, rather than babysitting warehouse
        // production every minute. Normal resource caps sustain passive inputs.
        const stats = getTownStats(tools.state, data);
        for (const [id, n] of Object.entries(objective.rewards.resources || {})) {
          const resource = stats.resources.find(r => r.id === id);
          const excess = resource.amount + resource.reserved - (objective.cost.resources?.[id] || 0) + n - resource.capacity;
          if (excess > 0 && excess <= resource.amount) command({ type: 'townDonate', resourceId: id, count: excess });
        }
      }
      if (available().ok) command({ type: 'claimObjective', objectiveId: objective.id });
    }
  };
  const tick = () => { tools.advance(60_000); claimReady(); };
  const build = (id, target) => {
    while (tools.state.town.buildings[id].level < target) {
      const startedAt = tools.state.time;
      let availability;
      while (!(availability = getTownActionAvailability(tools.state, data, { type: 'townBuild', buildingId: id })).ok) {
        const next = data.town.buildings.find(b => b.id === id).levels[tools.state.town.buildings[id].level];
        if (next.requirements.clearedRegions > tools.state.clearedRegions.length) throw new Error(`Premature region gate: ${id}`);
        tick(availability.cost.resources);
        if (tools.state.time - startedAt > 2 * 3_600_000) throw new Error(`Unreachable construction ${id}: ${availability.message}`);
      }
      command({ type: 'townBuild', buildingId: id });
      tools.advance(availability.durationMs);
      claimReady();
      if (getTownActionAvailability(tools.state, data, { type: 'townRepair', buildingId: 'woodcutters' }).ok) command({ type: 'townRepair', buildingId: 'woodcutters' });
    }
  };
  const plantEmpty = regionId => {
    const crops = data.farming.crops.find(c => c.regionId === regionId);
    for (const plot of data.farming.plots) {
      if (plot.requirements.clearedRegions > tools.state.clearedRegions.length || tools.state.farm.plots[plot.id].status !== 'empty') continue;
      const seedId = Object.keys(crops.inputs)[0];
      if (!(tools.state.inventory[seedId] > 0)) command({ type: 'townTrade', tradeId: `seed-${regionId}`, count: 6 });
      command({ type: 'farmPlant', plotId: plot.id, cropId: crops.id, autoReplant: true });
    }
  };
  const result = playCampaign(data, seed, {
    beforeRegion(context) {
      tools = context;
      if (context.region.index === 0) {
        for (const id of ['sawmill', 'herbalist', 'kitchen', 'smithy', 'market', 'weaver', 'watchtower']) build(id, 1);
        command({ type: 'townAutoSupply', enabled: true, tradeId: 'supply-rime-shore', targetStock: 24 });
      }
      plantEmpty(context.region.id);
    },
    afterRegion(context) {
      tools = context;
      claimReady();
      // The construction economy follows each restored beacon rather than
      // starting over at region changes. Storage and raw production lead factories.
      const target = Math.min(6, context.region.index + 2);
      for (const id of ['storehouse', 'housing', 'woodcutters', 'quarry', 'fishery', 'herbalist', 'sawmill', 'smithy', 'weaver', 'kitchen', 'market', 'watchtower']) build(id, target);
      for (const suffix of ['saw', 'cook']) {
        const recipe = data.recipes.find(r => r.id === `${context.region.id}-${suffix}`);
        const needed = Math.max(0, Math.ceil((200 - tools.state.progression.mastery[recipe.id].xp) / data.mastery.xpPerCycle));
        if (needed) tools.make(recipe, needed);
      }
      if (context.region.index === 0) tools.ensure('rime-shore-wood', 16);
      tools.ensure(`${context.region.id}-plank`, 4);
      tools.ensure(context.region.recommendedFood, 3);
      claimReady();
      command({ type: 'townAutoSupply', enabled: true, tradeId: `supply-${context.region.id}`, targetStock: 24 });
      plantEmpty(context.region.id);
      milestones.push({ regionId: context.region.id, time: tools.state.time, townLevel: tools.state.town.level, population: tools.state.town.population, storage: getTownStats(tools.state, data).storageCapacity, harvested: tools.state.farm.totals.harvested, claimed: tools.state.progression.claimedObjectives.length });
    }
  });
  const state = result.state;
  // Final delivery uses two actually earned boss trophies, with repeat exploration
  // and costed automatic supplies. First-clear objectives consumed earlier trophies.
  tools.command({ type: 'explore', regionId: 'aurora-ruins' });
  let ticks = 0;
  while ((state.inventory['aurora-ruins-trophy'] || 0) < 2) {
    tools.advance(1000);
    if (!state.activity && state.phase === 'idle') tools.command({ type: 'explore', regionId: 'aurora-ruins' });
    if (++ticks > 3600) throw new Error('Repeat boss trophies are unreachable');
  }
  tools.command({ type: 'stop' });
  while (state.farm.totals.harvested < 20) { plantEmpty('aurora-ruins'); tick({ provisions: 100 }); }
  let finalTicks = 0;
  while (!state.progression.claimedObjectives.includes('northward-completion')) {
    tick({ provisions: 100 });
    if (++finalTicks > 120) throw new Error(`Final delivery unreachable: ${getObjectives(state, data).find(o => o.id === 'northward-completion').availability.message}`);
  }
  claimReady();
  return { ...result, state, elapsedMs: state.time, townCommands, milestones };
}
