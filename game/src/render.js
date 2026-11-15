// Every pixel: the starfield backdrop, the ships and shards, the HUD, and the
// title / upgrade / pause / game-over screens. The renderer only reads the
// world; it never changes it. The logical field is 1280x720 and is letterboxed
// into the window, so the game looks the same at any window size.

import { FIELD, FONT, PALETTE } from './config.js';
import { createRandom } from './random.js';

const STARS = (() => {
  const rng = createRandom(20261116);
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({
      x: rng.range(0, FIELD.width),
      y: rng.range(0, FIELD.height),
      r: rng.range(0.6, 2.2),
      speed: rng.range(4, 18),
      phase: rng.range(0, Math.PI * 2),
    });
  }
  return stars;
})();

function polygon(ctx, x, y, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    scale = Math.min(w / FIELD.width, h / FIELD.height);
    offsetX = (w - FIELD.width * scale) / 2;
    offsetY = (h - FIELD.height * scale) / 2;
  }

  function screenToField(x, y) {
    return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
  }

  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, '#0a0e22');
    g.addColorStop(0.6, PALETTE.backdrop);
    g.addColorStop(1, '#0d0716');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (const s of STARS) {
      const x = (s.x + time * s.speed) % FIELD.width;
      const twinkle = 0.45 + 0.35 * Math.sin(time * 1.7 + s.phase);
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = PALETTE.star;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShard(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.life * 2);
    ctx.fillStyle = s.kind === 'hull' ? PALETTE.hullCell : PALETTE.shard;
    if (s.kind === 'hull') {
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const def = e.def;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : def.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    if (def.shape === 'diamond') polygon(ctx, 0, 0, e.radius, 4, Math.PI / 4);
    else if (def.shape === 'triangle') polygon(ctx, 0, 0, e.radius, 3, 0);
    else if (def.shape === 'hexagon') polygon(ctx, 0, 0, e.radius, 6, 0);
    else if (def.shape === 'square') polygon(ctx, 0, 0, e.radius, 4, 0);
    else if (def.shape === 'octagon') polygon(ctx, 0, 0, e.radius, 8, 0);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // A dark core so the shape reads as a craft, not a blob.
    ctx.fillStyle = 'rgba(7,10,24,0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (e.kind === 'boss' || e.hull < e.maxHull) {
      const w = e.radius * 2;
      const y = e.y - e.radius - 12;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(e.x - w / 2, y, w, 5);
      ctx.fillStyle = def.color;
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hull / e.maxHull), 5);
    }
  }

  function drawPlayer(p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.rotate(p.angle);
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 18;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHud(world, ui) {
    const p = world.player;
    const stats = world.stats;
    ctx.textBaseline = 'alphabetic';

    // Hull bar, top left.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(24, 22, 220, 16);
    const hullW = 220 * Math.max(0, p.hull / p.maxHull);
    ctx.fillStyle = p.hull > 50 ? '#37e6ff' : p.hull > 25 ? '#ffd166' : '#ff3b30';
    ctx.fillRect(24, 22, hullW, 16);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 22, 220, 16);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`HULL ${Math.ceil(p.hull)} / ${p.maxHull}`, 252, 35);

    // Dash cooldown, under the hull bar.
    const dashReady = p.dashCooldown <= 0;
    const dashFrac = dashReady ? 1 : 1 - p.dashCooldown / 2.4;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(24, 46, 120, 8);
    ctx.fillStyle = dashReady ? '#7dff5e' : '#8b93a3';
    ctx.fillRect(24, 46, 120 * Math.max(0, Math.min(1, dashFrac)), 8);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(dashReady ? 'DASH READY  [SPACE]' : 'DASH…', 152, 54);

    // Score, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(String(world.score).padStart(6, '0'), FIELD.width - 24, 44);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`BEST ${ui.best}`, FIELD.width - 24, 64);
    const mult = world.multiplier();
    if (mult > 1) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 18px ${FONT}`;
      ctx.fillText(`COMBO x${mult.toFixed(2)}`, FIELD.width - 24, 88);
    }

    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`WAVE ${Math.max(1, world.wave)}`, FIELD.width / 2, 38);
    const remaining = world.enemies.length + world.queue.length;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(remaining > 0 ? `${remaining} hostiles left` : 'wave cleared', FIELD.width / 2, 58);

    // Controls hint, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(139,147,163,0.8)';
    ctx.font = `12px ${FONT}`;
    ctx.fillText('WASD move · mouse aim · hold click to fire · SPACE dash · P pause · M mute', 24, FIELD.height - 16);

    // Wave banner.
    if (world.banner && world.bannerTimer > 0) {
      const a = Math.min(1, world.bannerTimer / 0.6, (2.2 - world.bannerTimer) / 0.4 + 0.6);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(world.banner.text, FIELD.width / 2, 210);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(world.banner.sub, FIELD.width / 2, 244);
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle(world, ui) {
    ctx.fillStyle = 'rgba(7,10,24,0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    const grad = ctx.createLinearGradient(0, 190, 0, 300);
    grad.addColorStop(0, '#37e6ff');
    grad.addColorStop(0.55, '#b388ff');
    grad.addColorStop(1, '#ff4fd8');
    ctx.fillStyle = grad;
    ctx.font = `900 92px ${FONT}`;
    ctx.fillText('SHARDSTORM', FIELD.width / 2, 268);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText('Survive the storm. Shatter the shards. Take their light.', FIELD.width / 2, 312);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('WASD / arrows — move      Mouse — aim      Hold click — fire      SPACE — dash', FIELD.width / 2, 356);
    ctx.fillText('Clear each wave, then pick an upgrade. Every 5th wave, the Shardlord comes.', FIELD.width / 2, 382);
    const pulse = 0.65 + 0.35 * Math.sin(world.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText('CLICK OR PRESS ENTER TO START', FIELD.width / 2, 452);
    ctx.globalAlpha = 1;
    if (ui.best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(`Best score: ${ui.best}`, FIELD.width / 2, 492);
    }
  }

  function drawUpgrade(world, ui) {
    ctx.fillStyle = 'rgba(7,10,24,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(`WAVE ${world.wave} CLEARED`, FIELD.width / 2, 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText('Choose an upgrade', FIELD.width / 2, 188);
    const cardW = 280;
    const cardH = 210;
    const gap = 28;
    const total = cardW * 3 + gap * 2;
    const startX = (FIELD.width - total) / 2;
    world.choices.forEach((choice, i) => {
      const x = startX + i * (cardW + gap);
      const y = 240;
      const hover = ui.hoverCard === i;
      ctx.fillStyle = hover ? '#222c4e' : PALETTE.card;
      ctx.strokeStyle = hover ? PALETTE.gold : PALETTE.cardEdge;
      ctx.lineWidth = hover ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, x + cardW / 2, y + 36);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(choice.name, x + cardW / 2, y + 76);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `16px ${FONT}`;
      ctx.fillText(choice.blurb, x + cardW / 2, y + 112);
      const level = world.player.upgrades[choice.id];
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(level > 0 ? `owned ${level} · max ${choice.max}` : `new · max ${choice.max}`, x + cardW / 2, y + 150);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let p = 0; p < choice.max; p += 1) {
        ctx.beginPath();
        ctx.arc(x + cardW / 2 - ((choice.max - 1) * 11) + p * 22, y + 178, 5, 0, Math.PI * 2);
        ctx.fillStyle = p < level ? PALETTE.gold : 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Click a card or press 1, 2 or 3', FIELD.width / 2, 510);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(7,10,24,0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, 340);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('Press P to resume', FIELD.width / 2, 384);
  }

  function drawOver(world, ui) {
    ctx.fillStyle = 'rgba(7,10,24,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('SHIP DESTROYED', FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`SCORE  ${world.score}`, FIELD.width / 2, 320);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText(`Wave ${world.wave}  ·  ${world.kills} kills`, FIELD.width / 2, 356);
    if (ui.newBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText('★ NEW BEST SCORE ★', FIELD.width / 2, 398);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `16px ${FONT}`;
      ctx.fillText(`Best: ${ui.best}`, FIELD.width / 2, 398);
    }
    const pulse = 0.65 + 0.35 * Math.sin(world.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('PRESS ENTER OR R TO FLY AGAIN', FIELD.width / 2, 462);
    ctx.globalAlpha = 1;
  }

  function draw(world, screen, ui) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const shakeX = world.shake > 0 ? Math.sin(world.time * 91) * world.shake * 0.6 : 0;
    const shakeY = world.shake > 0 ? Math.cos(world.time * 83) * world.shake * 0.6 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offsetX + shakeX * scale), dpr * (offsetY + shakeY * scale));

    drawBackground(world.time);
    for (const s of world.shards) drawShard(s);
    for (const b of world.bullets) {
      ctx.strokeStyle = PALETTE.bullet;
      ctx.lineWidth = 3;
      ctx.shadowColor = PALETTE.bullet;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    for (const e of world.enemies) drawEnemy(e);
    for (const o of world.orbs) {
      ctx.fillStyle = '#ff5d73';
      ctx.shadowColor = '#ff5d73';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of world.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.font = `700 ${t.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if (world.player.alive) drawPlayer(world.player, world.time);

    if (screen === 'play' || screen === 'upgrade' || screen === 'paused') drawHud(world, ui);
    if (screen === 'title') drawTitle(world, ui);
    if (screen === 'upgrade') drawUpgrade(world, ui);
    if (screen === 'paused') drawPaused();
    if (screen === 'over') drawOver(world, ui);

    if (world.flash > 0) {
      ctx.fillStyle = `rgba(255,59,48,${(world.flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (ui.muted) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('MUTED (M)', FIELD.width - 24, FIELD.height - 16);
    }
  }

  return { resize, screenToField, draw };
}
