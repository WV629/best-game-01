// The wave director: what spawns in wave N, and which three upgrade cards are
// offered when a wave is cleared. Composition shifts as waves rise: darts show
// up from wave 2, splitters from 3, spitters from 4, and a boss every 5th wave.

import { UPGRADES, WAVE } from './config.js';

/** The spawn queue for wave n: a shuffled list of enemy kinds. */
export function buildQueue(n, rng) {
  const queue = [];
  if (n % WAVE.bossEvery === 0) {
    queue.push('boss');
    for (let i = 0; i < n; i += 1) queue.push('drifter');
    for (let i = 0; i < Math.floor(n / 2); i += 1) queue.push('dart');
  } else {
    let budget = WAVE.budget(n);
    const pool = ['drifter'];
    if (n >= 2) pool.push('dart', 'dart');
    if (n >= 3) pool.push('splitter');
    if (n >= 4) pool.push('spitter');
    while (budget > 0) {
      const kind = rng.pick(pool);
      const cost = WAVE.cost[kind];
      if (cost > budget) break;
      queue.push(kind);
      budget -= cost;
    }
  }
  // Shuffle, but keep the boss first on boss waves.
  const head = queue[0] === 'boss' ? ['boss'] : [];
  const rest = head.length ? queue.slice(1) : queue;
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return head.concat(rest);
}

/** Roll three distinct upgrade cards the player can still take. */
export function rollUpgrades(player, rng) {
  const available = UPGRADES.filter((u) => player.upgrades[u.id] < u.max);
  const picks = [];
  while (picks.length < 3 && available.length > 0) {
    const i = Math.floor(rng.next() * available.length);
    picks.push(available.splice(i, 1)[0]);
  }
  return picks;
}

/** Apply one upgrade card to the player. */
export function applyUpgrade(player, id) {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return;
  player.upgrades[id] += 1;
  if (id === 'plating') {
    player.maxHull += 25;
    player.hull = Math.min(player.maxHull, player.hull + 25);
  }
}
