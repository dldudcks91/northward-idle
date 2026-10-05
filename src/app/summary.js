// Merge successive exact simulation slices and unacknowledged return summaries.
const PLAYER_COUNTERS = ['elapsedMs', 'raids', 'defenseWins', 'defenseLosses', 'explorationWins', 'explorationLosses', 'interruptedMs', 'offlinePausedMs', 'workCycles', 'tripsCompleted', 'excludedMs', 'awayMs'];
const TOWN_COUNTERS = ['elapsedMs', 'trades', 'builds', 'upgrades', 'taxes', 'repairs', 'ticks'];
const FARM_COUNTERS = ['planted', 'harvested', 'autoReplanted'];

function addMap(a = {}, b = {}) {
  const result = { ...a };
  for (const [id, amount] of Object.entries(b)) result[id] = (result[id] ?? 0) + amount;
  return result;
}

function addLedger(a = {}, b = {}, counters, maps) {
  const result = {};
  for (const key of counters) result[key] = (a[key] ?? 0) + (b[key] ?? 0);
  for (const key of maps) result[key] = addMap(a[key], b[key]);
  return result;
}

export function combineSummary(a, b) {
  if (!a && !b) return null;
  if (!a) return structuredClone(b);
  if (!b) return structuredClone(a);
  const result = { ...a, ...addLedger(a, b, PLAYER_COUNTERS, ['produced', 'consumed', 'lost']) };
  result.clearedRegions = [...new Set([...(a.clearedRegions ?? []), ...(b.clearedRegions ?? [])])];
  result.firstExplorationPaused = Boolean(a.firstExplorationPaused || b.firstExplorationPaused);
  result.completed = Boolean(a.completed || b.completed);
  result.stopReason = b.stopReason ?? a.stopReason ?? null;
  if (a.town || b.town) result.town = addLedger(a.town, b.town, TOWN_COUNTERS, ['produced', 'consumed', 'overflow']);
  if (a.farm || b.farm) result.farm = addLedger(a.farm, b.farm, FARM_COUNTERS, ['produced', 'consumed']);
  if (a.mastery || b.mastery) {
    const levels = new Map();
    for (const value of [...(a.mastery?.levels ?? []), ...(b.mastery?.levels ?? [])]) {
      const previous = levels.get(value.id);
      levels.set(value.id, previous ? { ...value, from: Math.min(previous.from, value.from), to: Math.max(previous.to, value.to) } : { ...value });
    }
    result.mastery = { xp: addMap(a.mastery?.xp, b.mastery?.xp), levels: [...levels.values()] };
  }
  if (a.objectives || b.objectives) result.objectives = { claimed: [...new Set([...(a.objectives?.claimed ?? []), ...(b.objectives?.claimed ?? [])])] };
  return result;
}
