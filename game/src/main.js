// Boot and the game loop. The loop steps the world at a fixed 60Hz and draws
// every animation frame. Screens: title, play, upgrade, paused, over.
// ?shot=title|play|upgrade|over&seed=N stages a screenshot scene instead of
// starting the game: it plays the real game forward with a fixed seed, paints
// twice, then sets window.__shotReady so the capture script knows the frame
// is settled.

import { BEST_KEY, STEP } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { autopilot, stageShot } from './shots.js';
import { createWorld, EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Best score is a nicety: play on without it.
  }
}

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 1) || 1;

let best = loadBest();
let newBest = false;
let world = createWorld(shotSeed);
let screen = 'title';

const ui = {
  get best() {
    return best;
  },
  get muted() {
    return audio.muted;
  },
  get newBest() {
    return newBest;
  },
  hoverCard: -1,
};

function setStatus(text) {
  if (statusEl && statusEl.textContent !== text) statusEl.textContent = text;
}

function startRun() {
  newBest = false;
  world.reset();
  world.startWave(1);
  screen = 'play';
  audio.unlock();
  audio.wave();
  setStatus('Wave 1 — survive!');
}

function endRun() {
  if (world.score > best) {
    best = world.score;
    newBest = true;
    saveBest(best);
  }
  screen = 'over';
  setStatus(`Ship destroyed — score ${world.score}, best ${best}.`);
}

function cardAt(fieldX, fieldY) {
  const cardW = 280;
  const cardH = 210;
  const gap = 28;
  const startX = (1280 - (cardW * 3 + gap * 2)) / 2;
  if (fieldY < 240 || fieldY > 240 + cardH) return -1;
  for (let i = 0; i < 3; i += 1) {
    const x = startX + i * (cardW + gap);
    if (fieldX >= x && fieldX <= x + cardW) return i;
  }
  return -1;
}

function stepPlay(dt) {
  const field = renderer.screenToField(input.mouse.x, input.mouse.y);
  const move = input.move();
  const events = world.step(dt, {
    mx: move.x,
    my: move.y,
    aimX: field.x,
    aimY: field.y,
    firing: input.firing,
    dash: input.action(ACTION_DASH),
  }, audio);
  if (events & EVENT_WAVE_CLEAR) {
    world.choices = world.rollUpgrades();
    screen = 'upgrade';
    audio.upgrade();
    setStatus(`Wave ${world.wave} cleared — choose an upgrade.`);
  }
  if (events & EVENT_OVER) {
    endRun();
  }
  if (input.action(ACTION_PAUSE)) {
    screen = 'paused';
    setStatus('Paused.');
  }
  if (input.action(ACTION_MUTE)) audio.toggleMute();
}

function stepTitle(dt) {
  world.step(dt, autopilot(world, 1), audio);
  if (world.over || (world.queue.length === 0 && world.enemies.length === 0)) {
    world.reset();
    world.startWave(1);
  }
  if (input.action(ACTION_CONFIRM)) {
    audio.unlock();
    audio.click();
    startRun();
  }
  if (input.action(ACTION_MUTE)) audio.toggleMute();
}

function stepUpgrade() {
  const field = renderer.screenToField(input.mouse.x, input.mouse.y);
  ui.hoverCard = cardAt(field.x, field.y);
  let pick = input.digit();
  if (pick === 0 && input.mouse.clicked && ui.hoverCard >= 0) pick = ui.hoverCard + 1;
  if (pick >= 1 && pick <= world.choices.length) {
    const choice = world.choices[pick - 1];
    world.applyUpgrade(choice.id);
    audio.click();
    world.startWave(world.wave + 1);
    screen = 'play';
    audio.wave();
    setStatus(`Wave ${world.wave} — survive!`);
  }
  if (input.action(ACTION_MUTE)) audio.toggleMute();
}

function stepPaused() {
  if (input.action(ACTION_PAUSE) || input.action(ACTION_CONFIRM)) {
    screen = 'play';
    setStatus(`Wave ${world.wave} — survive!`);
  }
  if (input.action(ACTION_MUTE)) audio.toggleMute();
}

function stepOver() {
  if (input.action(ACTION_RESTART) || input.action(ACTION_CONFIRM)) {
    audio.click();
    startRun();
  }
  if (input.action(ACTION_MUTE)) audio.toggleMute();
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || STEP);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    if (screen === 'play') stepPlay(STEP);
    else if (screen === 'title') stepTitle(STEP);
    else if (screen === 'upgrade') stepUpgrade();
    else if (screen === 'paused') stepPaused();
    else if (screen === 'over') stepOver();
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;
  renderer.draw(world, screen, ui);
  input.endFrame();
  window.requestAnimationFrame(frame);
}

let last = 0;
let accumulator = 0;

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

if (shotName) {
  // Screenshot mode: stage the scene, paint twice, signal readiness. The
  // status line is hidden here so it never reads "Loading…" in a screenshot.
  if (statusEl) statusEl.style.display = 'none';
  const staged = stageShot(shotName, shotSeed);
  world = staged.world;
  screen = staged.screen;
  ui.hoverCard = screen === 'upgrade' ? 0 : -1;
  renderer.resize();
  renderer.draw(world, screen, ui);
  window.requestAnimationFrame(() => {
    renderer.draw(world, screen, ui);
    window.__shotReady = true;
  });
} else {
  renderer.resize();
  world.startWave(1);
  setStatus('Shardstorm — click or press Enter to start.');
  window.requestAnimationFrame((now) => {
    last = now;
    window.requestAnimationFrame(frame);
  });
}

window.__shardstorm = {
  version: 1,
  get screen() {
    return screen;
  },
  get world() {
    return world;
  },
  get best() {
    return best;
  },
  get muted() {
    return audio.muted;
  },
  state() {
    return {
      screen,
      score: world.score,
      wave: world.wave,
      hull: world.player.hull,
      maxHull: world.player.maxHull,
      enemies: world.enemies.length + world.queue.length,
      kills: world.kills,
      over: world.over,
      best,
    };
  },
};
