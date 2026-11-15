// All sound is synthesised with WebAudio: no audio files, nothing to load.
// The context is created on the first user gesture (browsers require it); every
// call before that, or in a headless run, is a silent no-op.

const NOTES = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

export function createAudio() {
  let context = null;
  let master = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  try {
    muted = window.localStorage.getItem('shardstorm.muted') === '1';
  } catch {
    muted = false;
  }

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const t0 = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, cutoff) {
    if (!ensure() || muted) return;
    try {
      const t0 = context.currentTime;
      const len = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, t0);
      filter.frequency.exponentialRampToValueAtTime(120, t0 + dur);
      const gain = context.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t0);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function startMusic() {
    if (musicTimer !== null || !ensure()) return;
    musicTimer = window.setInterval(() => {
      if (muted || !context) return;
      const note = NOTES[musicStep % NOTES.length];
      musicStep += 1;
      tone(note / 2, 1.6, 'sine', 0.05);
      if (musicStep % 4 === 1) tone(note, 0.5, 'triangle', 0.04);
    }, 420);
  }

  return {
    get muted() {
      return muted;
    },
    unlock() {
      if (ensure()) startMusic();
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem('shardstorm.muted', muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() {
      tone(880, 0.06, 'square', 0.05, 240);
    },
    hit() {
      tone(190, 0.07, 'triangle', 0.08, 120);
    },
    explode() {
      noise(0.32, 0.22, 1400);
      tone(120, 0.25, 'sawtooth', 0.1, 40);
    },
    pickup() {
      tone(660, 0.08, 'sine', 0.07, 990);
    },
    dash() {
      noise(0.14, 0.1, 3200);
    },
    hurt() {
      tone(140, 0.22, 'sawtooth', 0.16, 60);
      noise(0.18, 0.12, 900);
    },
    wave() {
      tone(220, 0.16, 'sawtooth', 0.08);
      window.setTimeout(() => tone(330, 0.22, 'sawtooth', 0.08), 140);
    },
    upgrade() {
      [523.25, 659.25, 783.99].forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.14, 'triangle', 0.08), i * 70);
      });
    },
    click() {
      tone(520, 0.05, 'sine', 0.06, 700);
    },
    over() {
      [392, 311, 233, 175].forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.3, 'triangle', 0.09), i * 160);
      });
    },
  };
}
