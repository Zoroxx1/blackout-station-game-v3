// Procedural sound bank rendered offline (OfflineAudioContext) for Halcyon Deep offshore platform.
// Includes: ocean & storm swells, thunder (close/mid/far), steel structure groans/clanks,
// 14 distinct room tones, 10 door styles, supply chest latches, food eating,
// SCP-096 style monster weeping/breathing/growls/screams/wet footsteps, and layered jump-scare audio.
import { RNG, hashSeed } from './rng.js';

const SR = 32000, SRM = 22050;

function noiseBuffer(c) {
  if (c._nb) return c._nb;
  const n = Math.floor(c.sampleRate * 4), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return (c._nb = b);
}
function env(gn, t, d, g, a = 0.01, r = 0.1) {
  const p = gn.gain;
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(g, t + a);
  p.setValueAtTime(g, Math.max(t + a, t + d - r));
  p.linearRampToValueAtTime(0.0001, t + d);
}
function am(c, node, o, t, d) {
  if (!o.am) return node;
  const g = c.createGain(); g.gain.value = 1 - o.am.depth;
  const l = c.createOscillator(); l.frequency.value = o.am.f;
  const lg = c.createGain(); lg.gain.value = o.am.depth;
  l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + d + 0.1);
  node.connect(g); return g;
}
export function N(c, out, o = {}) {
  const { t = 0, d = 1, type = 'bandpass', f = 1000, f2 = null, q = 1, g = 1, a = 0.01, r = 0.1 } = o;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c); s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  fl.Q.value = q;
  const gn = c.createGain(); env(gn, t, d, g, a, r);
  s.connect(fl); am(c, fl, o, t, d).connect(gn); gn.connect(out);
  s.start(t, Math.random() * 3); s.stop(t + d + 0.05);
  return gn;
}
export function O(c, out, o = {}) {
  const { t = 0, d = 1, wave = 'sine', f = 100, f2 = null, g = 1, a = 0.01, r = 0.1, det = 0 } = o;
  const s = c.createOscillator(); s.type = wave; s.frequency.setValueAtTime(f, t);
  if (f2) s.frequency.exponentialRampToValueAtTime(f2, t + d);
  s.detune.value = det;
  if (o.vib) {
    const l = c.createOscillator(); l.frequency.value = o.vib.f;
    const lg = c.createGain(); lg.gain.value = o.vib.cents;
    l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + d + 0.1);
  }
  if (o.fm) {
    const m = c.createOscillator(); m.frequency.setValueAtTime(f * o.fm.ratio, t);
    if (f2) m.frequency.exponentialRampToValueAtTime(f2 * o.fm.ratio, t + d);
    const mg = c.createGain(); mg.gain.value = o.fm.depth;
    m.connect(mg); mg.connect(s.frequency); m.start(t); m.stop(t + d + 0.1);
  }
  let node = s;
  if (o.lp) {
    const fl = c.createBiquadFilter(); fl.type = o.lpType || 'lowpass';
    fl.frequency.setValueAtTime(o.lp, t);
    if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + d);
    fl.Q.value = o.q || 0.7; s.connect(fl); node = fl;
  }
  const gn = c.createGain(); env(gn, t, d, g, a, r);
  am(c, node, o, t, d).connect(gn); gn.connect(out);
  s.start(t); s.stop(t + d + 0.05);
  return gn;
}
function shaper(c, out, k = 40) {
  const w = c.createWaveShaper(), cv = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; cv[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  w.curve = cv; w.oversample = '2x'; w.connect(out); return w;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const SOUNDS = {
  // ---------------- footsteps & player ----------------
  'footstep-grate': { n: 4, dur: 0.28, sr: SR, build: (c, o, i, r) => { N(c, o, { d: 0.12, f: 1500 + r.range(-300, 300), q: 1.2, g: 0.5, a: 0.002, r: 0.1 }); O(c, o, { d: 0.12, f: 95 + i * 6, f2: 50, g: 0.9, a: 0.002, r: 0.1 }); O(c, o, { t: 0.01, d: 0.2, f: 2100 + i * 110, g: 0.05, a: 0.001, r: 0.19, wave: 'triangle' }); } },
  'footstep-plate': { n: 4, dur: 0.25, sr: SR, build: (c, o, i, r) => { N(c, o, { d: 0.1, f: 700 + r.range(-150, 150), q: 0.9, g: 0.55, a: 0.002, r: 0.09 }); O(c, o, { d: 0.14, f: 120 + i * 8, f2: 55, g: 1, a: 0.002, r: 0.12 }); O(c, o, { d: 0.12, f: 900 + i * 60, g: 0.06, wave: 'square', lp: 1400, r: 0.1 }); } },
  'footstep-wet':   { n: 4, dur: 0.30, sr: SR, build: (c, o, i, r) => { N(c, o, { d: 0.18, f: 2200 + r.range(-400, 400), f2: 900, q: 1.5, g: 0.65, a: 0.002, r: 0.15 }); O(c, o, { d: 0.12, f: 110 + i * 10, f2: 60, g: 0.7, a: 0.002, r: 0.1 }); } },
  'footrun':        { n: 4, dur: 0.22, sr: SR, build: (c, o, i, r) => { N(c, o, { d: 0.1, f: 1100 + r.range(-200, 200), q: 0.8, g: 0.85, a: 0.001, r: 0.09 }); O(c, o, { d: 0.12, f: 130 + i * 9, f2: 48, g: 1.1, a: 0.001, r: 0.1 }); N(c, o, { t: 0.01, d: 0.18, f: 3200, type: 'highpass', g: 0.16, r: 0.16 }); } },
  'gasp':           { n: 2, dur: 0.7, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.55, f: 900 + i * 200, f2: 2200, q: 1.5, g: 1, a: 0.12, r: 0.3 }); O(c, o, { d: 0.5, f: 200, f2: 330, g: 0.08, a: 0.1, r: 0.3, wave: 'sawtooth', lp: 600 }); } },
  'breath-calm':    { n: 1, dur: 4, sr: SR, build: (c, o) => { for (const t of [0.2, 2.2]) { N(c, o, { t, d: 1.0, f: 700, f2: 1400, q: 0.8, g: 0.5, a: 0.5, r: 0.5 }); N(c, o, { t: t + 1.0, d: 0.9, f: 1300, f2: 600, q: 0.8, g: 0.45, a: 0.3, r: 0.6 }); } } },
  'breath-heavy':   { n: 1, dur: 1.5, sr: SR, build: (c, o) => { for (const t of [0.05, 0.8]) { N(c, o, { t, d: 0.4, f: 800, f2: 2000, q: 0.9, g: 0.9, a: 0.1, r: 0.2 }); N(c, o, { t: t + 0.38, d: 0.35, f: 1800, f2: 800, q: 0.9, g: 0.8, a: 0.05, r: 0.25 }); } } },
  'breath-pain':    { n: 1, dur: 2.2, sr: SR, build: (c, o) => { N(c, o, { d: 1.0, f: 500, f2: 900, q: 1.5, g: 0.9, a: 0.3, r: 0.4, am: { f: 9, depth: 0.5 } }); O(c, o, { t: 1.1, d: 1.0, f: 320, f2: 200, g: 0.12, wave: 'sawtooth', lp: 700, a: 0.2, r: 0.6, vib: { f: 6, cents: 40 } }); } },
  'heartbeat_slow': { n: 1, dur: 1.2, sr: SR, loopExact: true, build: (c, o) => { for (const [t, g] of [[0, 1], [0.24, 0.7]]) { O(c, o, { t, d: 0.2, f: 62, f2: 38, g, a: 0.005, r: 0.15 }); N(c, o, { t, d: 0.1, type: 'lowpass', f: 180, g: 0.4, r: 0.09 }); } } },
  'heartbeat_fast': { n: 1, dur: 0.6, sr: SR, loopExact: true, build: (c, o) => { for (const [t, g] of [[0, 1], [0.14, 0.75]]) { O(c, o, { t, d: 0.14, f: 70, f2: 42, g, a: 0.004, r: 0.1 }); N(c, o, { t, d: 0.08, type: 'lowpass', f: 220, g: 0.45, r: 0.07 }); } } },

  // ---------------- items, doors & rig interactions ----------------
  'door-open':      { n: 3, dur: 2.0, sr: SR, build: (c, o, i) => { N(c, o, { d: 1.5, f: 380 + i * 60, f2: 180, q: 3, g: 0.55, a: 0.15, r: 0.35, am: { f: 28 + i * 6, depth: 0.55 } }); O(c, o, { d: 1.6, f: 56, g: 0.5, wave: 'sawtooth', lp: 160, a: 0.2, r: 0.4 }); O(c, o, { t: 1.55, d: 0.35, f: 85, f2: 40, g: 0.95, r: 0.25 }); } },
  'door-close':     { n: 2, dur: 1.1, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.7, f: 320 + i * 40, f2: 200, q: 3, g: 0.45, r: 0.25 }); O(c, o, { t: 0.7, d: 0.35, f: 95, f2: 38, g: 1.0, r: 0.25 }); } },
  'hatch-open':     { n: 2, dur: 2.3, sr: SR, build: (c, o, i) => { O(c, o, { d: 0.5, f: 70, f2: 35, g: 1, r: 0.4 }); for (const [f, g] of [[210, 0.4], [340, 0.3], [551, 0.25], [900, 0.2]]) O(c, o, { t: 0.05, d: 1.7, f: f * (1 + i * 0.05), g: g * 0.5, a: 0.002, r: 1.6, wave: 'triangle' }); N(c, o, { t: 0.4, d: 1.5, f: 2800, f2: 800, q: 0.6, g: 0.25, a: 0.2, r: 0.9 }); } },
  'escape-gate':    { n: 1, dur: 3.2, sr: SR, build: (c, o) => { for (const t of [0, 0.5, 1.0]) O(c, o, { t, d: 0.35, f: 880, f2: 660, g: 0.5, wave: 'sawtooth', lp: 1800, r: 0.1 }); N(c, o, { t: 0.3, d: 2.8, f: 450, f2: 1800, q: 0.6, g: 0.85, a: 0.4, r: 0.8 }); O(c, o, { t: 0.2, d: 2.8, f: 48, f2: 36, g: 0.9, wave: 'sawtooth', lp: 180, r: 0.8 }); } },
  'locker-open':    { n: 3, dur: 0.65, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.06, f: 2600 + i * 200, q: 3, g: 0.75, a: 0.001, r: 0.04 }); O(c, o, { t: 0.08, d: 0.45, f: 980 + i * 90, f2: 620, g: 0.16, wave: 'sawtooth', lp: 1800, a: 0.03, r: 0.2, vib: { f: 18, cents: 70 } }); } },
  'eat-food':       { n: 2, dur: 1.5, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.12, f: 2800, q: 2, g: 0.6, a: 0.002, r: 0.08 }); for (const t of [0.25, 0.65, 1.05]) N(c, o, { t, d: 0.22, f: 650 + i * 120, q: 1.8, g: 0.55, a: 0.02, r: 0.12 }); } },
  'valve-turn':     { n: 2, dur: 1.5, sr: SR, build: (c, o, i) => { O(c, o, { d: 1.3, f: 640 + i * 80, f2: 420, g: 0.25, wave: 'sawtooth', lp: 1500, vib: { f: 9, cents: 80 }, a: 0.1, r: 0.3 }); N(c, o, { d: 1.3, f: 1200, q: 4, g: 0.35, a: 0.1, r: 0.3 }); } },
  'keycard':        { n: 1, dur: 0.6, sr: SR, build: (c, o) => { O(c, o, { d: 0.12, f: 880, g: 0.4, wave: 'square', lp: 3000, r: 0.05 }); O(c, o, { t: 0.12, d: 0.3, f: 1320, g: 0.4, wave: 'square', lp: 3000, r: 0.2 }); } },
  'pickup':         { n: 1, dur: 0.5, sr: SR, build: (c, o) => { O(c, o, { d: 0.4, f: 520, f2: 1040, g: 0.35, r: 0.25, wave: 'triangle' }); } },
  'scanner-ping':   { n: 2, dur: 1.6, sr: SR, build: (c, o, i) => { for (const [t, g] of [[0, 0.7], [0.32, 0.3], [0.62, 0.14]]) O(c, o, { t, d: 0.6, f: 1180 + i * 90, g, a: 0.003, r: 0.55 }); } },
  'scanner-down':   { n: 1, dur: 0.9, sr: SR, build: (c, o) => { O(c, o, { d: 0.8, f: 900, f2: 90, g: 0.5, wave: 'triangle', r: 0.4 }); } },
  'scanner-beep':   { n: 1, dur: 0.3, sr: SR, build: (c, o) => { O(c, o, { d: 0.18, f: 1760, g: 0.55, wave: 'square', lp: 2600, a: 0.002, r: 0.06 }); } },
  'decoy-throw':    { n: 2, dur: 0.6, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.4, f: 500, f2: 3000 + i * 400, q: 0.7, g: 0.8, a: 0.12, r: 0.25 }); } },
  'decoy-clatter':  { n: 3, dur: 1.6, sr: SR, build: (c, o, i, r) => { let t = 0; for (let k = 0; k < 9; k++) { t += 0.04 + k * 0.035 + r.next() * 0.05; const f = 600 + r.next() * 2200; N(c, o, { t, d: 0.1, f, q: 6, g: 0.9 / (1 + k * 0.25), a: 0.001, r: 0.09 }); O(c, o, { t, d: 0.18, f: f * 1.5, g: 0.2 / (1 + k * 0.3), a: 0.001, r: 0.17, wave: 'triangle' }); } } },
  'generator-charge': { n: 1, dur: 2.2, sr: SR, build: (c, o) => { O(c, o, { d: 2, f: 60, f2: 220, g: 0.5, wave: 'sawtooth', lp: 600, lp2: 2200, a: 0.2, r: 0.4 }); N(c, o, { d: 2, f: 300, f2: 3000, q: 1, g: 0.3, a: 0.3, r: 0.4 }); } },
  'generator-hum':  { n: 1, dur: 4.5, sr: SR, loop: 1.0, build: (c, o) => { O(c, o, { d: 4.5, f: 55, g: 0.55, wave: 'sawtooth', lp: 400, a: 0.01, r: 0.01 }); O(c, o, { d: 4.5, f: 110.5, g: 0.35, wave: 'sawtooth', lp: 700, a: 0.01, r: 0.01, am: { f: 6, depth: 0.5 } }); } },
  'generator-done': { n: 1, dur: 2.2, sr: SR, build: (c, o) => { [[0, 523], [0.18, 659], [0.36, 784], [0.54, 1046]].forEach(([t, f]) => { O(c, o, { t, d: 1.4, f, g: 0.4, a: 0.004, r: 1.3 }); }); } },
  'generator-down': { n: 1, dur: 1.8, sr: SR, build: (c, o) => { O(c, o, { d: 1.6, f: 160, f2: 25, g: 0.7, wave: 'sawtooth', lp: 500, r: 0.8 }); } },
  'terminal-beep':  { n: 3, dur: 0.4, sr: SR, build: (c, o, i) => { O(c, o, { d: 0.1, f: 1000 + i * 150, g: 0.3, wave: 'square', lp: 2500, r: 0.04 }); O(c, o, { t: 0.13, d: 0.12, f: 1500 + i * 150, g: 0.3, wave: 'square', lp: 2500, r: 0.05 }); } },
  'terminal-key':   { n: 3, dur: 0.1, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.04, f: 3000 + i * 400, q: 3, g: 0.6, a: 0.001, r: 0.03 }); } },
  'flash-on':       { n: 1, dur: 0.2, sr: SR, build: (c, o) => { N(c, o, { d: 0.03, f: 4000, type: 'highpass', g: 0.6, a: 0.001, r: 0.02 }); O(c, o, { d: 0.06, f: 300, f2: 150, g: 0.6, r: 0.05 }); } },
  'flash-off':      { n: 1, dur: 0.2, sr: SR, build: (c, o) => { N(c, o, { d: 0.03, f: 2500, type: 'highpass', g: 0.5, a: 0.001, r: 0.02 }); O(c, o, { d: 0.06, f: 220, f2: 110, g: 0.6, r: 0.05 }); } },
  'pod-launch':     { n: 1, dur: 5, sr: SR, build: (c, o) => { N(c, o, { d: 4.8, f: 180, f2: 1200, q: 0.6, g: 0.9, a: 0.5, r: 1.2, am: { f: 11, depth: 0.55 } }); O(c, o, { d: 4.8, f: 44, f2: 95, g: 0.8, wave: 'sawtooth', lp: 300, a: 0.5, r: 1 }); } },
  'ui-hover':       { n: 1, dur: 0.1, sr: SR, build: (c, o) => { O(c, o, { d: 0.05, f: 1400, g: 0.25, wave: 'square', lp: 2200, r: 0.03 }); } },
  'ui-click':       { n: 1, dur: 0.2, sr: SR, build: (c, o) => { O(c, o, { d: 0.08, f: 700, f2: 1200, g: 0.4, wave: 'square', lp: 2600, r: 0.05 }); } },
  'ui-pause':       { n: 1, dur: 0.4, sr: SR, build: (c, o) => { O(c, o, { d: 0.3, f: 330, f2: 220, g: 0.5, wave: 'triangle', r: 0.2 }); } },
  'stage-sting':    { n: 1, dur: 3, sr: SR, build: (c, o) => { for (const f of [82.4, 110, 146.8]) O(c, o, { d: 2.8, f, g: 0.28, wave: 'sawtooth', lp: 450, lp2: 1600, a: 1.0, r: 1.4 }); N(c, o, { d: 2.8, f: 300, f2: 2400, q: 0.5, g: 0.35, a: 1.2, r: 1.2 }); } },

  // ---------------- SCP-096 Style Sea Creature Sounds (Prompt 3 & Prompt 4 Section 4) ----------------
  'monster-sob': {
    n: 3, dur: 3.6, sr: SR, loop: 0.6,
    build: (c, o, i, r) => {
      // Hushed human-like weeping & whimpering formants
      const baseF = 240 + i * 18;
      for (const t0 of [0.1, 1.2, 2.3]) {
        const d = 0.85 + r.next() * 0.2;
        O(c, o, { t: t0, d, f: baseF * 1.12, f2: baseF * 0.86, g: 0.48, wave: 'sawtooth', lp: 1100, a: 0.14, r: 0.45, vib: { f: 6.5, cents: 45 } });
        N(c, o, { t: t0, d: d * 0.8, f: 1400, f2: 900, q: 3.5, g: 0.32, a: 0.08, r: 0.35 });
      }
    },
  },
  'monster-breath-wet': {
    n: 2, dur: 2.4, sr: SR, loop: 0.4,
    build: (c, o, i) => {
      for (const t0 of [0.1, 1.25]) {
        N(c, o, { t: t0, d: 0.9, f: 950 + i * 150, f2: 1850, q: 2.2, g: 0.65, a: 0.25, r: 0.4, am: { f: 24, depth: 0.45 } });
        O(c, o, { t: t0, d: 0.9, f: 78, f2: 64, g: 0.22, wave: 'sawtooth', lp: 260, a: 0.2, r: 0.4 });
      }
    },
  },
  'monster-growl': {
    n: 4, dur: 2.2, sr: SR,
    build: (c, o, i) => {
      const f = 58 + i * 7;
      O(c, o, { d: 2.0, f, f2: f * 0.72, g: 0.8, wave: 'sawtooth', lp: 360, q: 4, a: 0.3, r: 0.8, am: { f: 16 + i * 3, depth: 0.5 }, vib: { f: 5, cents: 35 } });
      N(c, o, { d: 2.0, f: 320 + i * 70, f2: 680, q: 3, g: 0.55, a: 0.3, r: 0.8, am: { f: 15 + i * 2, depth: 0.6 } });
    },
  },
  'monster-scream': {
    n: 3, dur: 2.6, sr: SR,
    build: (c, o, i) => {
      const w = shaper(c, o, 42);
      const f = 580 + i * 90;
      O(c, w, { d: 2.4, f, f2: f * 1.45, g: 0.45, wave: 'sawtooth', fm: { ratio: 1.41, depth: 420 }, a: 0.03, r: 0.8, vib: { f: 11, cents: 95 } });
      O(c, w, { d: 2.4, f: f * 0.5, f2: f * 0.72, g: 0.45, wave: 'sawtooth', lp: 2200, a: 0.04, r: 0.8, vib: { f: 7, cents: 65 } });
      N(c, o, { d: 2.4, f: 2400, f2: 1400, q: 1.2, g: 0.65, a: 0.02, r: 0.8 });
    },
  },
  'monster-step-wet': {
    n: 4, dur: 0.28, sr: SR,
    build: (c, o, i, r) => {
      N(c, o, { d: 0.14, f: 2400 + r.range(-300, 300), f2: 1100, q: 1.6, g: 0.7, a: 0.002, r: 0.1 });
      O(c, o, { d: 0.12, f: 95 + i * 8, f2: 45, g: 0.85, a: 0.002, r: 0.1 });
    },
  },
  'monster-bash': {
    n: 2, dur: 0.9, sr: SR,
    build: (c, o, i) => {
      O(c, o, { d: 0.45, f: 110 + i * 15, f2: 34, g: 1.0, a: 0.002, r: 0.38 });
      N(c, o, { d: 0.35, f: 950, f2: 280, q: 2.5, g: 0.95, a: 0.002, r: 0.3 });
    },
  },
  'monster-nora': {
    n: 1, dur: 1.8, sr: SR,
    build: (c, o) => {
      // Soft wet formant whisper "No-ra..."
      N(c, o, { t: 0.1, d: 0.65, f: 620, f2: 480, q: 6, g: 0.45, a: 0.12, r: 0.25 });
      N(c, o, { t: 0.75, d: 0.85, f: 880, f2: 520, q: 5, g: 0.42, a: 0.1, r: 0.45 });
    },
  },
  // Prompt 3 Section 5: Jump scare layered scream (pitched up + pitched down + metallic screech + 40 Hz sub-bass hit + 4 kHz tinnitus fade)
  'jumpscare-scream': {
    n: 1, dur: 3.0, sr: SR,
    build: (c, o) => {
      const w = shaper(c, o, 65);
      // 1) Human scream pitched up + pitched down
      O(c, w, { d: 1.05, f: 740, f2: 1280, g: 0.45, wave: 'sawtooth', fm: { ratio: 1.35, depth: 520 }, a: 0.005, r: 0.25, vib: { f: 14, cents: 120 } });
      O(c, w, { d: 1.05, f: 290, f2: 460, g: 0.48, wave: 'sawtooth', lp: 2400, a: 0.005, r: 0.25, vib: { f: 8, cents: 80 } });
      // 2) Metallic screech
      N(c, w, { d: 1.0, f: 3400, f2: 1900, q: 5, g: 0.55, a: 0.004, r: 0.25 });
      // 3) 40 Hz sub-bass hit
      O(c, o, { d: 0.95, f: 44, f2: 36, g: 1.0, a: 0.003, r: 0.45 });
      // 4) 4 kHz tinnitus ring that fades over 2 seconds
      O(c, o, { t: 0.15, d: 2.6, f: 4000, g: 0.18, wave: 'sine', a: 0.05, r: 2.2 });
    },
  },
  // Legacy monster aliases kept so existing calls never miss
  'monster-howl':    { n: 2, dur: 3.2, sr: SR, build: (c, o, i) => { const f = 190 + i * 40; O(c, o, { d: 3.0, f, f2: f * 1.8, g: 0.5, wave: 'sawtooth', lp: 1400, q: 3, a: 0.4, r: 1.2 }); } },
  'monster-whisper': { n: 2, dur: 2.0, sr: SR, build: (c, o, i, r) => { N(c, o, { d: 1.6, f: 1600 + r.next() * 800, q: 5, g: 0.45, a: 0.1, r: 0.5 }); } },
  'monster-screech': { n: 2, dur: 1.4, sr: SR, build: (c, o, i) => { const w = shaper(c, o, 25); O(c, w, { d: 1.2, f: 1200 + i * 300, f2: 2200, g: 0.35, wave: 'sawtooth', a: 0.04, r: 0.5 }); } },
  'monster-rasp':    { n: 2, dur: 2.0, sr: SR, build: (c, o) => { N(c, o, { d: 1.6, f: 1400, f2: 2200, q: 2, g: 0.6, a: 0.2, r: 0.4 }); } },
  'monster-lunge':   { n: 1, dur: 0.9, sr: SR, build: (c, o) => { O(c, o, { d: 0.7, f: 400, f2: 1600, g: 0.45, wave: 'sawtooth', a: 0.02, r: 0.3 }); } },
  'monster-caught':  { n: 1, dur: 2.8, sr: SR, build: (c, o) => { const w = shaper(c, o, 55); O(c, w, { d: 2.4, f: 880, f2: 1800, g: 0.45, wave: 'sawtooth', a: 0.01, r: 0.9 }); O(c, o, { d: 1.2, f: 42, f2: 36, g: 0.95, a: 0.005, r: 0.8 }); } },

  // ---------------- Ocean, Storm, Thunder & Structure (Prompt 4 Sections 1 & 5) ----------------
  'wave-crash':    { n: 3, dur: 4.2, sr: SR, build: (c, o, i) => { O(c, o, { d: 3.8, f: 52 - i * 4, f2: 28, g: 0.9, a: 0.3, r: 2.2 }); N(c, o, { d: 3.8, f: 280, f2: 1400, q: 0.6, g: 0.75, a: 0.4, r: 2.2 }); } },
  'thunder-close': { n: 2, dur: 3.8, sr: SR, build: (c, o, i) => { N(c, o, { d: 0.25, f: 1800, type: 'lowpass', g: 1.0, a: 0.003, r: 0.2 }); O(c, o, { d: 3.4, f: 68 - i * 8, f2: 26, g: 0.95, wave: 'sawtooth', lp: 240, a: 0.02, r: 2.6 }); N(c, o, { t: 0.1, d: 3.4, f: 220, type: 'lowpass', g: 0.85, a: 0.05, r: 2.6 }); } },
  'thunder-mid':   { n: 2, dur: 4.2, sr: SR, build: (c, o, i) => { O(c, o, { d: 3.8, f: 56 - i * 6, f2: 24, g: 0.8, wave: 'sawtooth', lp: 180, a: 0.25, r: 2.8 }); N(c, o, { d: 3.8, f: 180, type: 'lowpass', g: 0.75, a: 0.3, r: 2.8 }); } },
  'thunder-far':   { n: 2, dur: 4.8, sr: SR, build: (c, o) => { N(c, o, { d: 4.4, f: 120, type: 'lowpass', g: 0.65, a: 0.8, r: 3.0 }); O(c, o, { d: 4.4, f: 42, f2: 24, g: 0.65, a: 0.8, r: 3.0 }); } },
  'creak':         { n: 5, dur: 2.6, sr: SR, build: (c, o, i, r) => { const d = 1.6 + r.next() * 0.9; O(c, o, { d, f: 90 + i * 22, f2: 55 + i * 12, g: 0.7, wave: 'sawtooth', lp: 500 + i * 120, lp2: 280, q: 14, a: 0.4, r: 0.8, am: { f: 9 + i * 4, depth: 0.7 }, vib: { f: 3 + i, cents: 160 } }); } },
  'pipe-groan':    { n: 2, dur: 3.0, sr: SR, build: (c, o, i) => { O(c, o, { d: 2.7, f: 62 + i * 10, f2: 44, g: 0.8, a: 0.8, r: 1.2, vib: { f: 2.2, cents: 40 }, am: { f: 3, depth: 0.4 } }); } },
  'vent-scrape':   { n: 3, dur: 2.2, sr: SR, build: (c, o, i) => { N(c, o, { d: 1.8, f: 700 + i * 300, f2: 2400 - i * 300, q: 6, g: 0.55, a: 0.4, r: 0.6, am: { f: 11 + i * 5, depth: 0.7 } }); } },
  'distant-thud':  { n: 4, dur: 1.4, sr: SR, build: (c, o, i) => { O(c, o, { d: 0.5, f: 78 - i * 6, f2: 32, g: 1, a: 0.004, r: 0.35 }); N(c, o, { d: 0.25, type: 'lowpass', f: 260, g: 0.8, r: 0.2 }); } },
  'drip':          { n: 3, dur: 0.6, sr: SR, build: (c, o, i) => { O(c, o, { d: 0.22, f: 1900 - i * 250, f2: 800, g: 0.5, a: 0.001, r: 0.2 }); } },
  'steam':         { n: 2, dur: 2.6, sr: SR, build: (c, o, i) => { N(c, o, { d: 2.4, f: 4000 - i * 800, type: 'highpass', q: 0.4, g: 0.4, a: 0.2, r: 1.4 }); } },
  'spark':         { n: 3, dur: 0.7, sr: SR, build: (c, o, i, r) => { for (let k = 0; k < 7; k++) N(c, o, { t: r.next() * 0.4, d: 0.03 + r.next() * 0.05, f: 3000 + r.next() * 4000, type: 'highpass', g: 0.7, a: 0.001, r: 0.03 }); } },
  'buzz':          { n: 1, dur: 3.0, sr: SR, loop: 0.6, build: (c, o) => { O(c, o, { d: 3, f: 100, g: 0.35, wave: 'sawtooth', lp: 1200, a: 0.01, r: 0.01, am: { f: 50, depth: 0.4 } }); } },
  'rumble':        { n: 1, dur: 5.0, sr: SRM, loop: 1.2, build: (c, o) => { O(c, o, { d: 5, f: 38, g: 0.9, a: 0.01, r: 0.01 }); N(c, o, { d: 5, type: 'lowpass', f: 140, g: 0.7, a: 0.01, r: 0.01 }); } },
  'alarm-hull':    { n: 1, dur: 5.0, sr: SR, loop: 0.2, build: (c, o) => { for (let k = 0; k < 4; k++) { const t = k * 1.25; O(c, o, { t, d: 1.2, f: 220, f2: 330, g: 0.5, wave: 'sawtooth', lp: 700, a: 0.3, r: 0.6 }); } } },
  'far-steps':     { n: 2, dur: 3.0, sr: SR, build: (c, o, i) => { for (let k = 0; k < 4; k++) O(c, o, { t: 0.2 + k * (0.55 + i * 0.1), d: 0.3, f: 80, f2: 45, g: 0.8, r: 0.25 }); } },

  // ---------------- Room Tones (Prompt 4 Section 2) ----------------
  'tone-engine':   { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 54, g: 0.75, wave: 'sawtooth', lp: 180, a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 220, type: 'lowpass', g: 0.55, a: 0.01, r: 0.01 }); } },
  'tone-control':  { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 120, g: 0.25, wave: 'sine', a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 1800, q: 1.5, g: 0.18, a: 0.01, r: 0.01 }); } },
  'tone-galley':   { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 96, g: 0.35, wave: 'triangle', a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 600, q: 1.2, g: 0.2, a: 0.01, r: 0.01 }); } },
  'tone-storage':  { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 46, g: 0.45, a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 380, q: 2, g: 0.22, a: 0.01, r: 0.01 }); } },
  'tone-pump':     { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 68, g: 0.6, wave: 'sawtooth', lp: 240, am: { f: 2.5, depth: 0.45 }, a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 900, q: 1.0, g: 0.35, a: 0.01, r: 0.01 }); } },
  'tone-medbay':   { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 1400, q: 1.5, g: 0.18, a: 0.01, r: 0.01 }); for (const t of [0.5, 2.5]) O(c, o, { t, d: 0.08, f: 1040, g: 0.14, a: 0.005, r: 0.05 }); } },
  'tone-quarters': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 420, q: 1.0, g: 0.25, a: 0.01, r: 0.01 }); } },
  'tone-cold':     { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 88, g: 0.45, wave: 'sawtooth', lp: 300, a: 0.01, r: 0.01 }); N(c, o, { d: 4, f: 2200, q: 2.5, g: 0.18, a: 0.01, r: 0.01 }); } },
  'tone-workshop': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 100, g: 0.3, wave: 'square', lp: 500, a: 0.01, r: 0.01 }); } },
  'tone-lab':      { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { O(c, o, { d: 4, f: 180, g: 0.25, wave: 'triangle', a: 0.01, r: 0.01 }); } },
  'tone-lifeboat': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 520, q: 1.8, g: 0.45, am: { f: 0.4, depth: 0.5 }, a: 0.01, r: 0.01 }); } },
  'tone-moonpool': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 340, q: 1.5, g: 0.5, am: { f: 0.6, depth: 0.55 }, a: 0.01, r: 0.01 }); } },
  'tone-corridor': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 280, q: 1.2, g: 0.3, a: 0.01, r: 0.01 }); } },
  'tone-helideck': { n: 1, dur: 4.0, sr: SRM, loop: 0.8, build: (c, o) => { N(c, o, { d: 4, f: 750, q: 0.7, g: 0.75, am: { f: 9.5, depth: 0.45 }, a: 0.01, r: 0.01 }); O(c, o, { d: 4, f: 48, g: 0.65, a: 0.01, r: 0.01 }); } },

  // ---------------- music / storm ambience (22.05 kHz, seamless loops) ----------------
  'ambience-loop': { n: 1, dur: 28, sr: SRM, loop: 3.5, build: (c, o) => {
    O(c, o, { d: 28, f: 41, g: 0.5, a: 0.1, r: 0.1, am: { f: 0.11, depth: 0.5 } });
    N(c, o, { d: 28, f: 520, q: 0.4, g: 0.25, a: 0.1, r: 0.1, am: { f: 0.15, depth: 0.6 } });
    N(c, o, { d: 28, type: 'lowpass', f: 160, g: 0.45, a: 0.1, r: 0.1 });
  } },
  'layer-drone':   { n: 1, dur: 18, sr: SRM, loop: 2, build: (c, o) => { for (const [f, g] of [[55, 0.5], [55.4, 0.5], [82.4, 0.3], [110.3, 0.2]]) O(c, o, { d: 18, f, g, wave: 'sawtooth', lp: 350, a: 0.1, r: 0.1, am: { f: 0.0625, depth: 0.5 } }); } },
  'layer-pulse':   { n: 1, dur: 18, sr: SRM, loop: 2, build: (c, o) => { for (let k = 0; k < 18; k++) { O(c, o, { t: k, d: 0.9, f: 55, f2: 40, g: 0.9, a: 0.01, r: 0.7 }); } } },
  'layer-strings': { n: 1, dur: 18, sr: SRM, loop: 2, build: (c, o) => { [[233, 0], [277, 0.4], [311, 0.9], [349, 0]].forEach(([f], i) => { O(c, o, { d: 18, f, g: 0.15, wave: 'sawtooth', lp: 1400, a: 0.1, r: 0.1, am: { f: 0.125 * (1 + i * 0.5), depth: 0.8 } }); }); } },
  'layer-perc':    { n: 1, dur: 18, sr: SRM, loop: 2, build: (c, o) => { for (let k = 0; k < 18; k += 2) O(c, o, { t: k, d: 0.4, f: 110, f2: 45, g: 0.8, a: 0.003, r: 0.3 }); } },
  'menu_music':    { n: 1, dur: 36, sr: SRM, loop: 4, build: (c, o) => {
    const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [38, 45, 50, 53], [40, 47, 52, 56]];
    for (let k = 0; k < 5; k++) { const ch = chords[k % 4], t = k * 8; for (const m of ch) O(c, o, { t, d: 10, f: mtof(m), g: 0.2, wave: 'sawtooth', lp: 700, lp2: 1400, a: 3, r: 3.5 }); }
    N(c, o, { d: 36, f: 700, q: 0.3, g: 0.08, a: 0.1, r: 0.1, am: { f: 0.12, depth: 0.65 } });
  } },
  'chase-music':   { n: 1, dur: 8, sr: SRM, loop: 1, build: (c, o) => { O(c, o, { d: 8, f: 55, g: 0.4, a: 0.1, r: 0.1 }); } },
  'tension-rise':  { n: 1, dur: 60, sr: SRM, build: (c, o) => { N(c, o, { d: 60, f: 150, f2: 4000, q: 0.8, g: 0.5, a: 30, r: 8 }); } },
  'sting-win':     { n: 1, dur: 6, sr: SRM, build: (c, o) => { for (const m of [57, 64, 69, 72, 76]) O(c, o, { d: 5.5, f: mtof(m), g: 0.2, wave: 'triangle', a: 1.4, r: 3 }); } },
  'sting-lose':    { n: 1, dur: 6, sr: SRM, build: (c, o) => { for (const m of [33, 40, 46, 52]) O(c, o, { d: 5.5, f: mtof(m), g: 0.3, wave: 'sawtooth', lp: 400, a: 0.05, r: 4 }); } },
};

export function makeSeamless(ctx, buf, overlapSec, linear = false) {
  const sr = buf.sampleRate, ov = Math.min(Math.floor(overlapSec * sr), Math.floor(buf.length / 2)), len = buf.length - ov;
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch); dst.set(src.subarray(0, len));
    for (let i = 0; i < ov; i++) {
      const x = i / ov, a = linear ? 1 - x : Math.cos(x * Math.PI / 2), b = linear ? x : Math.sin(x * Math.PI / 2);
      dst[i] = src[len + i] * a + src[i] * b;
    }
  }
  return out;
}
export function normalize(buf, targetDb, fade = true, loop = false) {
  let sum = 0, n = 0, peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.003) { sum += d[i] * d[i]; n++; } }
  }
  if (n < 10 || peak < 1e-5) return buf;
  const rms = Math.sqrt(sum / n), g = Math.min(Math.pow(10, targetDb / 20) / rms, 0.95 / peak, 8);
  const sr = buf.sampleRate, fi = Math.floor(0.004 * sr), fo = Math.floor(0.02 * sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    if (fade && !loop) {
      for (let i = 0; i < fi; i++) d[i] *= i / fi;
      for (let i = 0; i < fo; i++) d[d.length - 1 - i] *= i / fo;
    }
  }
  return buf;
}
export async function renderSound(ctx, name, def, i) {
  const sr = def.sr || SR, extra = def.loop || 0, dur = def.dur;
  const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  const out = off.createGain(); out.gain.value = 0.9; out.connect(off.destination);
  def.build(off, out, i, new RNG(hashSeed(name + i)));
  let buf = await off.startRendering();
  if (extra) buf = makeSeamless(ctx, buf, extra, !!def.linear);
  return buf;
}
