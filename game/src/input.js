// Keyboard and mouse, read fresh every frame. Movement is a -1..1 vector from
// WASD or the arrow keys; aiming follows the mouse; firing is held mouse button.
// Edge-triggered actions (dash, confirm, pause, mute) are consumed once per press.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_DASH = 'dash';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    /** Movement vector from the held keys, normalised. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const dir = MOVE_KEYS[code];
        if (dir) {
          x += dir[0];
          y += dir[1];
        }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    get firing() {
      return mouse.down || keys.has('KeyJ');
    },
    /** True once per physical press of the named action; consumed by reading. */
    action(name) {
      if (name === ACTION_DASH) {
        return this.take('ShiftLeft', 'ShiftRight', 'Space');
      }
      if (name === ACTION_CONFIRM) {
        return this.take('Enter') || mouse.clicked;
      }
      if (name === ACTION_PAUSE) {
        return this.take('KeyP', 'Escape');
      }
      if (name === ACTION_MUTE) {
        return this.take('KeyM');
      }
      if (name === ACTION_RESTART) {
        return this.take('KeyR', 'Enter');
      }
      return false;
    },
    take(...codes) {
      for (const code of codes) {
        if (pressed.has(code)) {
          pressed.delete(code);
          return true;
        }
      }
      return false;
    },
    /** Number keys 1..3 for the upgrade cards, consumed once per press. */
    digit() {
      for (const code of ['Digit1', 'Digit2', 'Digit3']) {
        if (pressed.has(code)) {
          pressed.delete(code);
          return Number(code.slice(-1));
        }
      }
      return 0;
    },
    /** Call at the end of each frame: clears the frame's edge triggers. */
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
