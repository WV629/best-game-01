// Screenshot staging: the shots.json manifest asks for a scene by name, and this
// module produces it by actually playing the game forward with a fixed seed.
// The autopilot is a simple bot — move away from what is close, drift toward
// shards, aim at the nearest enemy, fire always, dash out of trouble. The same
// seed always stages the same frame, so the dossier is reproducible.

import { FIELD, STEP } from './config.js';
import { createWorld } from './world.js';

function nearestEnemy(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return { enemy: best, dist: bestD };
}

function nearestShard(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const s of world.shards) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { shard: best, dist: bestD };
}

/** The autopilot's input for this step. `skill` 1 plays well, 0 is suicidal. */
export function autopilot(world, skill) {
  const p = world.player;
  const { enemy, dist } = nearestEnemy(world);
  const { shard, dist: shardDist } = nearestShard(world);
  let mx = 0;
  let my = 0;
  let aimX = p.x + Math.cos(p.angle) * 100;
  let aimY = p.y + Math.sin(p.angle) * 100;
  let dash = false;

  if (skill <= 0) {
    // The game-over shot: fly straight at the nearest enemy and never shoot,
    // so the ramming kills the ship instead of the ship killing the enemy.
    if (enemy) {
      mx = (enemy.x - p.x) / dist;
      my = (enemy.y - p.y) / dist;
      aimX = enemy.x;
      aimY = enemy.y;
    }
    return { mx, my, aimX, aimY, firing: false, dash: false };
  }

  if (enemy) {
    aimX = enemy.x;
    aimY = enemy.y;
    if (dist < 150) {
      // Flee directly away from the threat.
      mx = (p.x - enemy.x) / dist;
      my = (p.y - enemy.y) / dist;
      if (dist < 95 && p.dashCooldown <= 0) dash = true;
    } else if (dist > 340) {
      // Close the distance so the bullets land.
      mx = (enemy.x - p.x) / dist;
      my = (enemy.y - p.y) / dist;
    } else if (shard && shardDist < 240) {
      mx = (shard.x - p.x) / shardDist;
      my = (shard.y - p.y) / shardDist;
    } else {
      // Hold a mid-range orbit: strafe sideways around the enemy.
      const tx = -((enemy.y - p.y) / dist);
      const ty = (enemy.x - p.x) / dist;
      mx = tx;
      my = ty;
    }
  } else if (shard) {
    mx = (shard.x - p.x) / shardDist;
    my = (shard.y - p.y) / shardDist;
  }
  // Stay inside the arena with a margin.
  if (p.x < 90) mx = Math.max(mx, 0.6);
  if (p.x > FIELD.width - 90) mx = Math.min(mx, -0.6);
  if (p.y < 90) my = Math.max(my, 0.6);
  if (p.y > FIELD.height - 90) my = Math.min(my, -0.6);
  const len = Math.hypot(mx, my) || 1;
  return { mx: mx / len, my: my / len, aimX, aimY, firing: true, dash };
}

const silent = {
  shoot() {}, hit() {}, explode() {}, pickup() {}, dash() {}, hurt() {},
  wave() {}, upgrade() {}, click() {}, over() {},
};

function stepFor(world, seconds, skill) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, autopilot(world, skill), silent);
    if (world.over) return false;
  }
  return true;
}

/**
 * Stage one shot and return { world, screen } for the renderer.
 * Retries with later seeds when the pilot dies before the scene is reached.
 */
export function stageShot(name, seed) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const s = seed + attempt * 7919;
    const world = createWorld(s);
    world.reset();
    if (name === 'title') {
      // Attract mode behind the title: a wave running with no player input shown.
      world.startWave(1);
      stepFor(world, 6, 1);
      return { world, screen: 'title' };
    }
    if (name === 'play') {
      // Play through wave 1 into wave 2 so the frame is mid-action, with
      // enemies, bullets and shards on screen — not an emptied arena.
      world.startWave(1);
      let alive = true;
      for (let t = 0; t < 26 / STEP; t += 1) {
        const events = world.step(STEP, autopilot(world, 1), silent);
        if (world.over) {
          alive = false;
          break;
        }
        if (events & 4) {
          const choices = world.rollUpgrades();
          if (choices.length > 0) world.applyUpgrade(choices[0].id);
          world.startWave(world.wave + 1);
        }
      }
      if (!alive) continue;
      return { world, screen: 'play' };
    }
    if (name === 'upgrade') {
      world.startWave(1);
      let cleared = false;
      for (let t = 0; t < 150 / STEP; t += 1) {
        const events = world.step(STEP, autopilot(world, 1), silent);
        if (world.over) break;
        if (events & 4) {
          cleared = true;
          break;
        }
        // Keep the wave going: if the queue drained but enemies remain, wait.
      }
      if (!cleared) continue;
      world.choices = world.rollUpgrades();
      return { world, screen: 'upgrade' };
    }
    if (name === 'over') {
      // Play well through two waves, then go suicidal on wave 3: the game-over
      // screen should show a real run's score, not a first-minute death.
      world.startWave(1);
      let dead = false;
      for (let t = 0; t < 300 / STEP; t += 1) {
        const skill = world.wave >= 3 ? 0 : 1;
        const events = world.step(STEP, autopilot(world, skill), silent);
        if (world.over) {
          dead = true;
          break;
        }
        if (events & 4) {
          const choices = world.rollUpgrades();
          if (choices.length > 0) world.applyUpgrade(choices[0].id);
          world.startWave(world.wave + 1);
        }
      }
      if (!dead) continue;
      // Let the death flash fade and the explosion bloom before the picture.
      for (let t = 0; t < 0.9 / STEP; t += 1) {
        world.step(STEP, autopilot(world, 0), silent);
      }
      return { world, screen: 'over' };
    }
  }
  throw new Error(`could not stage shot ${name} with seed ${seed}`);
}

export { silent };
