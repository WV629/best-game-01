// The simulation: one fixed-step world that knows nothing about the DOM. It
// owns the player, bullets, enemies, orbs, shards, particles and texts, moves
// them, resolves collisions, keeps score and combo, and runs the wave flow.
// The main loop feeds it input and sound; the renderer only reads it.

import { COMBO, FIELD, FX, PLAYER, WAVE } from './config.js';
import {
  burst, makeBullet, makeEnemy, makeOrb, makeParticle, makePlayer, makeShard,
  makeText, playerStats, stepBullets, stepEnemy, stepOrbs, stepParticles,
  stepShards, stepTexts,
} from './entities.js';
import { applyUpgrade, buildQueue, rollUpgrades } from './waves.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_SHARD = 16;
export const EVENT_UPGRADE = 32;

import { createRandom } from './random.js';

export function createWorld(seed) {
  const rng = createRandom(seed);

  const world = {
    rng,
    seed,
    time: 0,
    score: 0,
    kills: 0,
    wave: 0,
    combo: 0,
    comboTimer: 0,
    player: makePlayer(),
    bullets: [],
    enemies: [],
    orbs: [],
    particles: [],
    shards: [],
    texts: [],
    queue: [],
    spawnTimer: 0,
    clearTimer: 0,
    shake: 0,
    flash: 0,
    banner: null,
    bannerTimer: 0,
    choices: [],
    over: false,
    stats: { shots: 0, hits: 0 },
  };

  world.reset = () => resetWorld(world);
  world.startWave = (n) => startWave(world, n);
  world.step = (dt, input, sfx) => stepWorld(world, dt, input, sfx);
  world.applyUpgrade = (id) => applyUpgrade(world.player, id);
  world.rollUpgrades = () => rollUpgrades(world.player, world.rng);
  world.multiplier = () => 1 + Math.min(world.combo, COMBO.max) * COMBO.perKill;
  return world;
}

function resetWorld(world) {
  const player = makePlayer();
  world.time = 0;
  world.score = 0;
  world.kills = 0;
  world.wave = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.player = player;
  world.bullets.length = 0;
  world.enemies.length = 0;
  world.orbs.length = 0;
  world.particles.length = 0;
  world.shards.length = 0;
  world.texts.length = 0;
  world.queue.length = 0;
  world.spawnTimer = 0;
  world.clearTimer = 0;
  world.shake = 0;
  world.flash = 0;
  world.banner = null;
  world.bannerTimer = 0;
  world.choices = [];
  world.over = false;
  world.stats = { shots: 0, hits: 0 };
}

function startWave(world, n) {
  world.wave = n;
  world.queue = buildQueue(n, world.rng);
  world.spawnTimer = 0.5;
  world.clearTimer = 0;
  world.banner = { text: `WAVE ${n}`, sub: n % WAVE.bossEvery === 0 ? 'THE SHARDLORD APPROACHES' : `${world.queue.length} hostiles inbound` };
  world.bannerTimer = 2.2;
}

function spawnPoint(world) {
  // Any edge point at least 260px from the player.
  for (let tries = 0; tries < 12; tries += 1) {
    const edge = world.rng.int(0, 3);
    let x = 0;
    let y = 0;
    if (edge === 0) { x = world.rng.range(40, FIELD.width - 40); y = 40; }
    if (edge === 1) { x = world.rng.range(40, FIELD.width - 40); y = FIELD.height - 40; }
    if (edge === 2) { x = 40; y = world.rng.range(40, FIELD.height - 40); }
    if (edge === 3) { x = FIELD.width - 40; y = world.rng.range(40, FIELD.height - 40); }
    const dx = x - world.player.x;
    const dy = y - world.player.y;
    if (Math.hypot(dx, dy) > 260) return { x, y };
  }
  return { x: 40, y: 40 };
}

function killEnemy(world, enemy, sfx) {
  const def = enemy.def;
  const mult = world.multiplier();
  const points = Math.round(def.score * mult);
  world.score += points;
  world.kills += 1;
  world.combo = Math.min(COMBO.max, world.combo + 1);
  world.comboTimer = COMBO.decay;
  burst(world.particles, FX.particles, enemy.x, enemy.y, def.color, enemy.kind === 'boss' ? 48 : 16, 320, 0.7, 3, world.rng);
  burst(world.particles, FX.particles, enemy.x, enemy.y, '#ffffff', 6, 180, 0.35, 2, world.rng);
  world.texts.push(makeText(enemy.x, enemy.y - 10, `+${points}`, '#ffd166', 16));
  world.shake = Math.max(world.shake, enemy.kind === 'boss' ? 14 : 5);
  sfx.explode();
  if (enemy.kind === 'boss') {
    world.flash = 0.35;
  }
  const shardCount = WAVE.shards[enemy.kind] ?? 1;
  for (let i = 0; i < shardCount; i += 1) {
    world.shards.push(makeShard(enemy.x, enemy.y, 'shard', WAVE.shardScore, world.rng));
  }
  if (world.rng.chance(WAVE.hullCellChance)) {
    world.shards.push(makeShard(enemy.x, enemy.y, 'hull', WAVE.hullCellHeal, world.rng));
  }
  if (def.splits) {
    for (let i = 0; i < def.splits; i += 1) {
      const a = world.rng.angle();
      const child = makeEnemy('shardling', enemy.x + Math.cos(a) * 24, enemy.y + Math.sin(a) * 24, world.wave, world.rng);
      world.enemies.push(child);
    }
  }
}

function hurtPlayer(world, damage, sfx) {
  const p = world.player;
  if (p.invuln > 0 || !p.alive) return false;
  p.hull -= damage;
  p.invuln = PLAYER.invulnerable;
  world.flash = 0.3;
  world.shake = Math.max(world.shake, 9);
  world.combo = 0;
  world.comboTimer = 0;
  burst(world.particles, FX.particles, p.x, p.y, '#ff3b30', 14, 260, 0.6, 3, world.rng);
  sfx.hurt();
  if (p.hull <= 0) {
    p.hull = 0;
    p.alive = false;
    world.over = true;
    burst(world.particles, FX.particles, p.x, p.y, '#37e6ff', 60, 420, 1.1, 4, world.rng);
    burst(world.particles, FX.particles, p.x, p.y, '#ffffff', 24, 260, 0.8, 3, world.rng);
    world.shake = 18;
    world.flash = 0.5;
    sfx.over();
    return true;
  }
  return false;
}

function stepWorld(world, dt, input, sfx) {
  let events = 0;
  const p = world.player;
  const stats = playerStats(p);
  world.time += dt;

  if (world.bannerTimer > 0) world.bannerTimer -= dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - 40 * dt);
  if (world.flash > 0) world.flash = Math.max(0, world.flash - dt);

  if (world.comboTimer > 0) {
    world.comboTimer -= dt;
    if (world.comboTimer <= 0) world.combo = 0;
  }

  // --- Player ------------------------------------------------------------
  if (p.alive) {
    p.fireTimer -= dt;
    p.dashCooldown -= dt;
    p.invuln -= dt;
    if (input.dash && p.dashCooldown <= 0) {
      // Dash in the movement direction; standing still, dash toward the aim.
      let dx = input.mx;
      let dy = input.my;
      if (dx === 0 && dy === 0) {
        dx = input.aimX - p.x;
        dy = input.aimY - p.y;
      }
      const len = Math.hypot(dx, dy) || 1;
      p.dashTimer = PLAYER.dashTime;
      p.dashCooldown = stats.dashCooldown;
      p.dashX = dx / len;
      p.dashY = dy / len;
      p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.15);
      sfx.dash();
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vx = p.dashX * PLAYER.dashSpeed;
      p.vy = p.dashY * PLAYER.dashSpeed;
      if (world.particles.length < FX.particles) {
        world.particles.push(makeParticle(p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, 0.3, 3, '#37e6ff'));
      }
    } else {
      p.vx += input.mx * PLAYER.accel * dt;
      p.vy += input.my * PLAYER.accel * dt;
      const damp = Math.exp(-PLAYER.damping * dt);
      p.vx *= damp;
      p.vy *= damp;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > stats.maxSpeed) {
        p.vx = (p.vx / speed) * stats.maxSpeed;
        p.vy = (p.vy / speed) * stats.maxSpeed;
      }
    }
    p.x = Math.max(p.radius, Math.min(FIELD.width - p.radius, p.x + p.vx * dt));
    p.y = Math.max(p.radius, Math.min(FIELD.height - p.radius, p.y + p.vy * dt));
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);

    if (input.firing && p.fireTimer <= 0) {
      p.fireTimer = stats.fireInterval;
      const n = stats.projectiles;
      for (let i = 0; i < n; i += 1) {
        const spread = (i - (n - 1) / 2) * 0.11;
        const crit = world.rng.chance(stats.crit);
        const bullet = makeBullet(
          p.x + Math.cos(p.angle) * 20,
          p.y + Math.sin(p.angle) * 20,
          p.angle + spread,
          stats.bulletSpeed,
          stats.damage * (crit ? 2 : 1),
          crit,
        );
        world.bullets.push(bullet);
      }
      world.stats.shots += 1;
      sfx.shoot();
    }
  }

  // --- Spawning ----------------------------------------------------------
  if (world.queue.length > 0) {
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      world.spawnTimer = WAVE.spawnInterval(world.wave);
      const kind = world.queue.shift();
      const at = spawnPoint(world);
      world.enemies.push(makeEnemy(kind, at.x, at.y, world.wave, world.rng));
    }
  }

  // --- Enemies -----------------------------------------------------------
  for (const enemy of world.enemies) {
    if (!p.alive) break;
    stepEnemy(enemy, p, dt);
    if (enemy.def.ranged) {
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = enemy.def.shotInterval;
        if (enemy.kind === 'boss') {
          const burstCount = enemy.def.burst;
          for (let i = 0; i < burstCount; i += 1) {
            const a = (i / burstCount) * Math.PI * 2 + world.time * 0.4;
            world.orbs.push(makeOrb(enemy.x, enemy.y, a, enemy.def.shotSpeed));
          }
          sfx.shoot();
        } else {
          const a = Math.atan2(p.y - enemy.y, p.x - enemy.x);
          world.orbs.push(makeOrb(enemy.x, enemy.y, a, enemy.def.shotSpeed));
          sfx.shoot();
        }
      }
    }
    if (enemy.kind === 'boss') {
      enemy.spawnTimer -= dt;
      if (enemy.spawnTimer <= 0) {
        enemy.spawnTimer = 6;
        for (let i = 0; i < 2; i += 1) {
          const a = world.rng.angle();
          world.enemies.push(makeEnemy('drifter', enemy.x + Math.cos(a) * 70, enemy.y + Math.sin(a) * 70, world.wave, world.rng));
        }
      }
    }
  }

  // --- Bullets vs enemies -------------------------------------------------
  stepBullets(world.bullets, dt);
  for (let bi = world.bullets.length - 1; bi >= 0; bi -= 1) {
    const b = world.bullets[bi];
    let spent = false;
    for (let ei = world.enemies.length - 1; ei >= 0; ei -= 1) {
      const e = world.enemies[ei];
      const dx = b.x - e.x;
      const dy = b.y - e.y;
      const rr = b.r + e.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      e.hull -= b.damage;
      e.flash = 0.08;
      world.stats.hits += 1;
      burst(world.particles, FX.particles, b.x, b.y, '#aef7ff', 3, 160, 0.25, 2, world.rng);
      sfx.hit();
      if (b.crit) {
        world.texts.push(makeText(e.x, e.y - e.radius - 6, 'CRIT', '#ff9f1c', 15));
      }
      if (e.hull <= 0) {
        killEnemy(world, e, sfx);
        world.enemies.splice(ei, 1);
        events |= EVENT_KILL;
      }
      spent = true;
      break;
    }
    if (spent) world.bullets.splice(bi, 1);
  }

  // --- Enemy contact and orbs vs player ----------------------------------
  if (p.alive) {
    for (const enemy of world.enemies) {
      const dx = p.x - enemy.x;
      const dy = p.y - enemy.y;
      const rr = p.radius + enemy.radius - 2;
      if (dx * dx + dy * dy < rr * rr) {
        if (hurtPlayer(world, enemy.def.damage, sfx)) events |= EVENT_OVER;
        events |= EVENT_HIT;
        // Shove the enemy back so one touch is one hit, not a grind.
        const dist = Math.hypot(dx, dy) || 1;
        enemy.x -= (dx / dist) * 30;
        enemy.y -= (dy / dist) * 30;
        break;
      }
    }
    stepOrbs(world.orbs, dt);
    for (let i = world.orbs.length - 1; i >= 0; i -= 1) {
      const o = world.orbs[i];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const rr = p.radius + o.r - 2;
      if (dx * dx + dy * dy < rr * rr) {
        if (hurtPlayer(world, 10, sfx)) events |= EVENT_OVER;
        events |= EVENT_HIT;
        world.orbs.splice(i, 1);
      }
    }
  } else {
    stepOrbs(world.orbs, dt);
  }

  // --- Shards -------------------------------------------------------------
  if (p.alive) {
    stepShards(world.shards, p, stats.pickupRadius, dt);
    for (let i = world.shards.length - 1; i >= 0; i -= 1) {
      const s = world.shards[i];
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (dx * dx + dy * dy < (p.radius + s.r + 6) * (p.radius + s.r + 6)) {
        if (s.kind === 'hull') {
          p.hull = Math.min(p.maxHull, p.hull + s.value);
          world.texts.push(makeText(p.x, p.y - 24, `+${s.value} HULL`, '#7dff5e', 15));
        } else {
          world.score += Math.round(s.value * world.multiplier());
          world.texts.push(makeText(s.x, s.y, `+${s.value}`, '#ffd166', 13));
        }
        sfx.pickup();
        events |= EVENT_SHARD;
        world.shards.splice(i, 1);
      }
    }
  }

  // --- FX -----------------------------------------------------------------
  stepParticles(world.particles, dt);
  stepTexts(world.texts, dt);

  // --- Wave cleared --------------------------------------------------------
  if (!world.over && world.queue.length === 0 && world.enemies.length === 0 && world.wave > 0) {
    world.clearTimer += dt;
    if (world.clearTimer > 1.1) {
      world.clearTimer = 0;
      events |= EVENT_WAVE_CLEAR;
    }
  }

  return events;
}
