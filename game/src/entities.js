// The things that move: the player ship, bullets, enemies, enemy orbs, shards,
// particles and floating texts. Factories make them; step functions move them.
// Nothing here knows about screens or input: the world drives all of it.

import { BULLET, ENEMIES, FIELD, ORB, PLAYER } from './config.js';

export function makePlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    hull: PLAYER.hull,
    maxHull: PLAYER.hull,
    fireTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashX: 0,
    dashY: 0,
    invuln: 0,
    alive: true,
    upgrades: {
      rapid: 0, heavy: 0, twin: 0, plating: 0, swift: 0,
      magnet: 0, velocity: 0, thrusters: 0, lucky: 0,
    },
  };
}

/** Derived stats from the player's upgrade stacks. */
export function playerStats(player) {
  const u = player.upgrades;
  return {
    fireInterval: PLAYER.fireInterval / (1 + 0.18 * u.rapid),
    damage: PLAYER.bulletDamage * (1 + 0.25 * u.heavy),
    projectiles: 1 + u.twin,
    bulletSpeed: PLAYER.bulletSpeed * (1 + 0.2 * u.velocity),
    maxSpeed: PLAYER.maxSpeed * (1 + 0.12 * u.thrusters),
    dashCooldown: PLAYER.dashCooldown * (1 - 0.3 * u.swift > 0.4 ? 1 - 0.3 * u.swift : 0.4),
    pickupRadius: PLAYER.pickupRadius * (1 + 0.6 * u.magnet),
    crit: 0.15 * u.lucky,
  };
}

export function makeBullet(x, y, angle, speed, damage, crit) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage, crit,
    r: BULLET.radius,
    life: BULLET.life,
  };
}

export function stepBullets(bullets, dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
      bullets.splice(i, 1);
    }
  }
}

export function makeEnemy(kind, x, y, wave, rng) {
  const def = ENEMIES[kind];
  const tough = 1 + Math.max(0, wave - 1) * 0.06;
  return {
    kind,
    def,
    x, y,
    vx: 0, vy: 0,
    angle: 0,
    hull: Math.round(def.hull * tough),
    maxHull: Math.round(def.hull * tough),
    radius: def.radius,
    fireTimer: def.ranged ? 1 + rng.next() * 1.5 : 0,
    spawnTimer: 0,
    lungeTimer: 1.5,
    lunging: 0,
    flash: 0,
  };
}

/** Steer one enemy toward the player for dt seconds. Returns nothing. */
export function stepEnemy(enemy, player, dt) {
  const def = enemy.def;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const want = Math.atan2(dy, dx);
  let turn = def.turn * dt;
  let diff = want - enemy.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  enemy.angle += Math.max(-turn, Math.min(turn, diff));

  let speed = def.speed;
  if (enemy.kind === 'spitter') {
    // Spitters hold a firing distance: close in when far, back off when near.
    if (dist > 340) speed = def.speed;
    else if (dist < 220) speed = -def.speed * 0.7;
    else speed = 0;
  }
  if (enemy.kind === 'dart') {
    enemy.lungeTimer -= dt;
    if (enemy.lunging > 0) {
      enemy.lunging -= dt;
      speed = def.speed * 2.1;
    } else if (enemy.lungeTimer <= 0 && dist < 300) {
      enemy.lunging = 0.45;
      enemy.lungeTimer = 2.2;
    }
  }
  enemy.vx = Math.cos(enemy.angle) * speed;
  enemy.vy = Math.sin(enemy.angle) * speed;
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  enemy.x = Math.max(enemy.radius, Math.min(FIELD.width - enemy.radius, enemy.x));
  enemy.y = Math.max(enemy.radius, Math.min(FIELD.height - enemy.radius, enemy.y));
  if (enemy.flash > 0) enemy.flash -= dt;
}

export function makeOrb(x, y, angle, speed) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: ORB.radius,
    life: ORB.life,
  };
}

export function stepOrbs(orbs, dt) {
  for (let i = orbs.length - 1; i >= 0; i -= 1) {
    const o = orbs[i];
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.life -= dt;
    if (o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20) {
      orbs.splice(i, 1);
    }
  }
}

export function makeParticle(x, y, vx, vy, life, size, color) {
  return { x, y, vx, vy, life, maxLife: life, size, color };
}

export function burst(particles, cap, x, y, color, count, speed, life, size, rng) {
  for (let i = 0; i < count; i += 1) {
    if (particles.length >= cap) return;
    const a = rng.angle();
    const s = speed * (0.3 + rng.next() * 0.7);
    particles.push(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + rng.next() * 0.4), size * (0.6 + rng.next() * 0.8), color));
  }
}

export function stepParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export function makeShard(x, y, kind, value, rng) {
  const a = rng.angle();
  const s = 60 + rng.next() * 140;
  return {
    x, y,
    vx: Math.cos(a) * s,
    vy: Math.sin(a) * s,
    kind, value,
    r: kind === 'hull' ? 9 : 6,
    life: 9,
  };
}

export function stepShards(shards, player, pickupRadius, dt) {
  for (let i = shards.length - 1; i >= 0; i -= 1) {
    const s = shards[i];
    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < pickupRadius) {
      const pull = 900 * (1 - dist / pickupRadius);
      s.vx += (dx / dist) * pull * dt;
      s.vy += (dy / dist) * pull * dt;
    }
    s.vx *= 1 - 1.5 * dt;
    s.vy *= 1 - 1.5 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) shards.splice(i, 1);
  }
}

export function makeText(x, y, text, color, size) {
  return { x, y, text, color, size: size ?? 15, life: 0.9, maxLife: 0.9 };
}

export function stepTexts(texts, dt) {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const t = texts[i];
    t.y -= 34 * dt;
    t.life -= dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
}
