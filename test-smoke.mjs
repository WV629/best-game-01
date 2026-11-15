// Node smoke test: stage every screenshot scene and run a 60-second
// autopilot survival check. The game has no DOM dependency below main.js,
// so the whole simulation runs here headlessly.
import { stageShot } from './game/src/shots.js';
import { createWorld, EVENT_WAVE_CLEAR, EVENT_OVER } from './game/src/world.js';
import { autopilot, silent } from './game/src/shots.js';
import { STEP } from './game/src/config.js';

const silentSfx = {
  shoot() {}, hit() {}, explode() {}, pickup() {}, dash() {}, hurt() {},
  wave() {}, upgrade() {}, click() {}, over() {},
};

for (const name of ['title', 'play', 'upgrade', 'over']) {
  const t0 = Date.now();
  const { world, screen } = stageShot(name, 1);
  console.log(
    `${name}: screen=${screen} score=${world.score} wave=${world.wave} ` +
    `hull=${Math.round(world.player.hull)} kills=${world.kills} ` +
    `enemies=${world.enemies.length} choices=${world.choices.length} ` +
    `(${Date.now() - t0}ms)`,
  );
}

// Survival check: a decent pilot should clear wave 1 and reach wave 2.
const world = createWorld(7);
world.reset();
world.startWave(1);
let cleared = false;
let steps = 0;
while (steps < 60 / STEP && !world.over) {
  const events = world.step(STEP, autopilot(world, 1), silentSfx);
  if (events & EVENT_WAVE_CLEAR) { cleared = true; break; }
  steps += 1;
}
console.log(`survival: cleared wave 1=${cleared} over=${world.over} score=${world.score} time=${(steps * STEP).toFixed(1)}s`);

// Boss wave check: wave 5 must contain a boss.
const boss = createWorld(11);
boss.reset();
boss.startWave(5);
const kinds = new Set(boss.queue);
console.log(`wave 5 queue: ${boss.queue.length} enemies, has boss=${kinds.has('boss')}, kinds=${[...kinds].join(',')}`);
