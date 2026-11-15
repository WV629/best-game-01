// Shardstorm: every tuning number and colour in one place. The arena is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size. All speeds are pixels per second, all times seconds.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  accel: 2400,
  maxSpeed: 340,
  damping: 6.5,
  hull: 100,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletDamage: 1,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 2.4,
  invulnerable: 0.9,
  pickupRadius: 90,
};

export const BULLET = { radius: 4, life: 1.1 };

/** Enemy kinds: shape, colour, size, speed, hull, contact damage, score, behaviour. */
export const ENEMIES = {
  drifter: {
    label: 'Drifter', shape: 'diamond', color: '#ff4fd8', radius: 16,
    speed: 95, hull: 3, damage: 12, score: 50, turn: 2.2,
  },
  dart: {
    label: 'Dart', shape: 'triangle', color: '#ff9f1c', radius: 12,
    speed: 265, hull: 1, damage: 8, score: 80, turn: 5.0, lunge: true,
  },
  splitter: {
    label: 'Splitter', shape: 'hexagon', color: '#b388ff', radius: 22,
    speed: 70, hull: 6, damage: 16, score: 120, turn: 1.6, splits: 3,
  },
  shardling: {
    label: 'Shardling', shape: 'triangle', color: '#d0a2ff', radius: 8,
    speed: 210, hull: 1, damage: 6, score: 30, turn: 6.0,
  },
  spitter: {
    label: 'Spitter', shape: 'square', color: '#7dff5e', radius: 15,
    speed: 80, hull: 4, damage: 10, score: 110, turn: 1.8,
    ranged: true, shotInterval: 2.4, shotSpeed: 220,
  },
  boss: {
    label: 'Shardlord', shape: 'octagon', color: '#ff3b30', radius: 52,
    speed: 55, hull: 130, damage: 25, score: 2000, turn: 1.2,
    ranged: true, shotInterval: 1.6, shotSpeed: 260, burst: 10,
  },
};

/** Enemy orbs fired by spitters and the boss. */
export const ORB = { radius: 6, damage: 10, life: 5 };

/** Wave N (1-based) buys enemies from this budget; composition shifts as N grows. */
export const WAVE = {
  budget: (n) => 6 + n * 4,
  cost: { drifter: 1, dart: 2, splitter: 3, spitter: 3, boss: 0 },
  /** seconds between spawns at the wave's start; shrinks as the wave goes on. */
  spawnInterval: (n) => Math.max(0.35, 1.1 - n * 0.06),
  bossEvery: 5,
  /** shards an enemy drops (score each, small chance of a hull cell). */
  shards: { drifter: 2, dart: 1, splitter: 4, shardling: 0, spitter: 3, boss: 24 },
  shardScore: 5,
  hullCellChance: 0.08,
  hullCellHeal: 12,
};

/** Combo: each kill raises it, it decays after this many seconds without a kill. */
export const COMBO = { decay: 3.0, max: 8, perKill: 0.25 };

/** Upgrades offered between waves: id, name, blurb, max stacks, apply. */
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Fire', blurb: '+18% fire rate', max: 5 },
  { id: 'heavy', name: 'Heavy Rounds', blurb: '+25% bullet damage', max: 5 },
  { id: 'twin', name: 'Twin Shot', blurb: '+1 projectile per shot', max: 3 },
  { id: 'plating', name: 'Hull Plating', blurb: '+25 max hull, repair 25', max: 5 },
  { id: 'swift', name: 'Swift Dash', blurb: 'Dash recharges 30% faster', max: 4 },
  { id: 'magnet', name: 'Shard Magnet', blurb: '+60% shard pickup radius', max: 3 },
  { id: 'velocity', name: 'Velocity Rounds', blurb: '+20% bullet speed', max: 4 },
  { id: 'thrusters', name: 'Thrusters', blurb: '+12% move speed', max: 4 },
  { id: 'lucky', name: 'Lucky Core', blurb: '+15% critical chance (2x damage)', max: 4 },
];

/** Particle and floating-text budgets; pools are allocated once, at boot. */
export const FX = { particles: 320, texts: 24 };

export const PALETTE = {
  backdrop: '#070a18',
  grid: '#121832',
  star: '#8fa3d9',
  player: '#37e6ff',
  playerCore: '#e8feff',
  bullet: '#aef7ff',
  orb: '#ff5d73',
  shard: '#ffd166',
  hullCell: '#7dff5e',
  panel: '#12172b',
  panelEdge: '#2a3557',
  text: '#eef1f5',
  muted: '#8b93a3',
  danger: '#ff3b30',
  gold: '#ffd166',
  card: '#181f38',
  cardEdge: '#3b4a7d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shardstorm.best';
