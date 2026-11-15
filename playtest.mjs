// End-to-end play test: drives the REAL game in headless Chrome with CDP
// keyboard/mouse events and checks the screens a human would see — start,
// move, fire, score, wave-clear upgrade pick, pause, mute, dash, death and
// restart. No in-page cheating: every action goes through Input.* events.
import { spawn } from 'node:child_process';

const CHROME = '/home/hatch/workspace/makefun/chrome/linux-157.0.8103.78/chrome-linux64/chrome';
const PORT = 9334;
const PROFILE = '/tmp/shardstorm-playtest-profile';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(path, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}${path}`);
      if (res.ok) return await res.json();
    } catch {
      // Chrome not up yet.
    }
    await sleep(200);
  }
  throw new Error(`chrome devtools did not answer ${path}`);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });

const errors = [];
try {
  await waitForJson('/json/version');
  const target = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result?.value;
  };
  const key = async (type, code, keyName) => send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: 0 });
  const mouse = async (type, x, y, button = 'left') => send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:8080/' });
  await sleep(1500);

  let state = await evalJs('window.__shardstorm && window.__shardstorm.state()');
  check('title screen on load', state?.screen === 'title', JSON.stringify(state));

  // Start with Enter.
  await key('keyDown', 'Enter', 'Enter');
  await key('keyUp', 'Enter', 'Enter');
  await sleep(500);
  state = await evalJs('window.__shardstorm.state()');
  check('Enter starts wave 1', state?.screen === 'play' && state?.wave === 1, JSON.stringify(state));

  // Hold the mouse down (fire) and steer with the autopilot's logic, reading
  // the real world state each tick.
  await mouse('mousePressed', 640, 400);
  const held = new Set();
  const setKeys = async (want) => {
    for (const code of [...held]) {
      if (!want.has(code)) {
        await key('keyUp', code, code.replace('Key', '').toLowerCase());
        held.delete(code);
      }
    }
    for (const code of want) {
      if (!held.has(code)) {
        await key('keyDown', code, code.replace('Key', '').toLowerCase());
        held.add(code);
      }
    }
  };
  const snap = () => evalJs(`(() => {
    const w = window.__shardstorm.world;
    const p = w.player;
    let e = null; let d = 1e9;
    for (const en of w.enemies) {
      const dd = Math.hypot(en.x - p.x, en.y - p.y);
      if (dd < d) { d = dd; e = en; }
    }
    return { px: p.x, py: p.y, ex: e ? e.x : null, ey: e ? e.y : null, ed: d, dash: p.dashCooldown };
  })()`);

  let sawScore = false;
  let upgraded = false;
  let died = false;
  let dashed = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    state = await evalJs('window.__shardstorm.state()');
    if (state.screen === 'over') { died = true; break; }
    if (state.screen === 'upgrade') {
      await setKeys(new Set());
      await mouse('mouseReleased', 640, 400);
      await sleep(300);
      await key('keyDown', 'Digit1', '1');
      await key('keyUp', 'Digit1', '1');
      await sleep(400);
      state = await evalJs('window.__shardstorm.state()');
      upgraded = state.screen === 'play' && state.wave === 2;
      check('upgrade card 1 starts wave 2', upgraded, JSON.stringify(state));
      if (upgraded) {
        // Dash once, then pause/resume, then mute — all via real keys.
        await key('keyDown', 'Space', ' ');
        await key('keyUp', 'Space', ' ');
        await sleep(200);
        const afterDash = await evalJs('window.__shardstorm.world.player.dashCooldown');
        dashed = afterDash > 0;
        check('Space dashes (cooldown spent)', dashed, `cooldown=${afterDash?.toFixed(2)}`);
        await key('keyDown', 'KeyP', 'p');
        await key('keyUp', 'KeyP', 'p');
        await sleep(300);
        state = await evalJs('window.__shardstorm.state()');
        check('P pauses', state.screen === 'paused', JSON.stringify(state));
        await key('keyDown', 'KeyP', 'p');
        await key('keyUp', 'KeyP', 'p');
        await sleep(300);
        state = await evalJs('window.__shardstorm.state()');
        check('P resumes', state.screen === 'play', JSON.stringify(state));
        const mutedBefore = await evalJs('window.__shardstorm.muted');
        await key('keyDown', 'KeyM', 'm');
        await key('keyUp', 'KeyM', 'm');
        await sleep(200);
        const mutedAfter = await evalJs('window.__shardstorm.muted');
        check('M toggles mute', mutedAfter !== mutedBefore, `before=${mutedBefore} after=${mutedAfter}`);
      }
      // Stop shooting and stand still: the swarm should finish the run,
      // which also proves the death -> restart path.
      break;
    }
    if (state.screen === 'play') {
      if (state.score > 0) sawScore = true;
      const s = await snap();
      if (s.ex !== null) {
        // Aim at the nearest enemy (field coords -> screen coords: +40 y offset).
        await mouse('mouseMoved', s.ex, s.ey + 40);
        const want = new Set();
        if (s.ed < 150) {
          if (s.px < s.ex) want.add('KeyA');
          else want.add('KeyD');
          if (s.py < s.ey) want.add('KeyW');
          else want.add('KeyS');
        } else if (s.ed > 340) {
          if (s.px < s.ex) want.add('KeyD');
          else want.add('KeyA');
          if (s.py < s.ey) want.add('KeyS');
          else want.add('KeyW');
        }
        await setKeys(want);
      }
    }
    await sleep(150);
  }
  check('score rose while firing', sawScore);
  if (!upgraded) check('upgrade card 1 starts wave 2', false, 'wave 1 was not cleared in 90s');

  // Death and restart: stand still with no fire and wait to be rammed.
  if (upgraded && !died) {
    await setKeys(new Set());
    await mouse('mouseReleased', 640, 400);
    const t1 = Date.now();
    while (Date.now() - t1 < 90000) {
      state = await evalJs('window.__shardstorm.state()');
      if (state.screen === 'over') { died = true; break; }
      await sleep(500);
    }
    check('standing still gets you killed', died, JSON.stringify(state));
    if (died) {
      await key('keyDown', 'Enter', 'Enter');
      await key('keyUp', 'Enter', 'Enter');
      await sleep(500);
      state = await evalJs('window.__shardstorm.state()');
      check('Enter restarts a new run', state.screen === 'play' && state.wave === 1 && state.score === 0, JSON.stringify(state));
    }
  }

  ws.close();
} finally {
  chrome.kill('SIGKILL');
}

check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
