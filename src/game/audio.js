// Audio engine: buses -> master (compressor + limiter), HRTF positional voices, occlusion, convolution reverb,
// ducking, pitch/volume variation, seamless loops, procedural fallback bank, optional supplied files, adaptive layers.
import { SOUNDS, renderSound, normalize } from './synth.js';
import { CFG } from './config.js';

const SUPPLIED = import.meta.glob('/src/assets/audio/*.{ogg,mp3,wav,opus}', { query: '?url', import: 'default' });
const BUS_TRIM = { music: 0.55, ambience: 0.5, monster: 1.0, sfx: 0.9, foot: 0.55, ui: 0.7 };
const SUBS = { 'monster-growl': 'Growl', 'monster-howl': 'Howl shakes the station', 'monster-whisper': 'Whispers', 'monster-screech': 'Screech', 'monster-rasp': 'Rasping breath', creak: 'Metal creaks', 'vent-scrape': 'Scraping in the vents', 'distant-thud': 'Distant thud', 'door-open': 'Door grinds open', 'hatch-open': 'Hatch clangs', 'decoy-clatter': 'Clatter', 'alarm-hull': 'Hull alarm', 'generator-done': 'Generator charged', 'pipe-groan': 'Pipes groan', 'far-steps': 'Distant footsteps', 'monster-caught': 'SCREAM', spark: 'Sparks', 'locker-open': 'Locker opens', 'scanner-ping': 'Scanner ping' };
const LEVEL = { sfx: -17, music: -22 };

export class AudioEngine {
  constructor(settings) {
    this.s = settings; this.bank = new Map(); this.voices = new Set(); this.ctx = null; this.lastPick = new Map(); this.onSub = null; this.phys = null;
    this.L = { x: 0, y: 1.7, z: 0, yaw: 0 }; this.ready = false; this.muted = false; this.loops = new Map(); this.progress = 0; this.bankDone = false;
  }
  // ---------------- bank ----------------
  async buildBank(onProgress) {
    const dummy = new OfflineAudioContext(1, 1, 22050);
    const names = Object.keys(SOUNDS); const order = names.filter((n) => !['tension-rise', 'sting-win', 'sting-lose', 'chase-music', 'layer-strings', 'layer-perc', 'layer-pulse', 'layer-drone', 'ambience-loop'].includes(n));
    const late = names.filter((n) => !order.includes(n));
    const total = order.length; let done = 0;
    const doOne = async (n) => {
      const def = SOUNDS[n]; const arr = [];
      for (let i = 0; i < def.n; i++) { try { arr.push(normalize(await renderSound(dummy, n, def, i), def.sr === 22050 ? LEVEL.music : LEVEL.sfx, true, !!def.loop || !!def.loopExact)); } catch (e) { console.warn('synth fail', n, e); } }
      this.bank.set(n, arr);
    };
    await doOne('menu_music'); this.bank.set('menu_music', this.bank.get('menu_music'));
    for (const n of order) { if (n === 'menu_music') { done++; continue; } await doOne(n); done++; onProgress && onProgress(done / total); }
    this.coreReady = true;
    // supplied files override synthesized groups of the same name
    await this.loadSupplied();
    (async () => { for (const n of late) await doOne(n); await this.loadSupplied(); this.bankDone = true; })();
  }
  async loadSupplied() {
    const keys = Object.keys(SUPPLIED); if (!keys.length || !this.ctx) return;
    const groups = {};
    for (const k of keys) { const base = k.split('/').pop().replace(/\.[a-z0-9]+$/, ''); const g = base.replace(/-\d+$/, ''); (groups[g] ||= []).push(k); }
    const alias = { footstep: ['footstep-grate', 'footstep-plate'] };
    for (const g in groups) {
      if (this.suppliedLoaded?.has(g)) continue; (this.suppliedLoaded ||= new Set()).add(g);
      try {
        const bufs = []; for (const k of groups[g]) { const url = await SUPPLIED[k](); const ab = await (await fetch(url)).arrayBuffer(); bufs.push(normalize(await this.ctx.decodeAudioData(ab), /music|ambience|chase|tension/.test(g) ? LEVEL.music : LEVEL.sfx, true, /loop|music|hum/.test(g))); }
        for (const target of alias[g] || [g]) this.bank.set(target, bufs);
      } catch (e) { console.warn('supplied audio failed', g, e); }
    }
  }
  // ---------------- graph ----------------
  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = new C({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.comp = ctx.createDynamicsCompressor(); this.limiter = ctx.createDynamicsCompressor();
    Object.assign(this.comp, {}); this.comp.threshold.value = -20; this.comp.knee.value = 24; this.comp.ratio.value = 3.5; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.06;
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(ctx.destination);
    this.buses = {};
    for (const n of Object.keys(BUS_TRIM)) { const input = ctx.createGain(), duck = ctx.createGain(); input.connect(duck); duck.connect(this.master); this.buses[n] = { input, duck }; }
    // reverb
    this.reverbIn = ctx.createGain(); this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.9; this.reverbOut.connect(this.master);
    this.rev = {};
    for (const [k, dur, decay, ring] of [['small', 0.5, 3.2, 0], ['hall', 2.6, 2.3, 0], ['corridor', 1.6, 2.6, 1]]) {
      const cv = ctx.createConvolver(); cv.buffer = this.makeIR(dur, decay, ring); const g = ctx.createGain(); g.gain.value = k === 'corridor' ? 0.6 : 0; this.reverbIn.connect(cv); cv.connect(g); g.connect(this.reverbOut); this.rev[k] = g;
    }
    this.applyVolumes();
    // supplied files need ctx for decode
    this.loadSupplied();
    this.ready = true;
  }
  makeIR(dur, decay, ring) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const x = i / n, a = Math.pow(1 - x, decay), k = 0.15 + 0.7 * x; lp += ((Math.random() * 2 - 1) - lp) * (1 - k); d[i] = lp * a * 2.2; if (ring && i % Math.floor(sr * 0.037) === 0) d[i] += 0.3 * a * (ch ? 1 : -1); if (ring) d[i] += Math.sin(i / sr * 6.283 * (1100 + ch * 40)) * 0.05 * a * Math.random(); } }
    return b;
  }
  applyVolumes() {
    if (!this.ctx) return; const s = this.s, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || s.mute ? 0 : s.master, t, 0.05);
    for (const n in this.buses) this.buses[n].input.gain.setTargetAtTime(BUS_TRIM[n] * (n === 'music' ? s.music : s.sfx), t, 0.05);
  }
  setRoomReverb(room) { // blend by room size: more insets -> smaller
    if (!this.ctx || !room) return; const ins = room.insets.reduce((a, b) => a + b, 0); const t = this.ctx.currentTime;
    const small = ins >= 6 ? 0.9 : ins >= 4 ? 0.4 : 0, hall = ins <= 1 ? 0.8 : ins <= 3 ? 0.35 : 0, cor = 0.55;
    this.rev.small.gain.setTargetAtTime(small * 0.8, t, 0.4); this.rev.hall.gain.setTargetAtTime(hall * 0.7, t, 0.4); this.rev.corridor.gain.setTargetAtTime(cor * (1 - hall * 0.5), t, 0.4);
  }
  duck(amount = 0.45, hold = 1.6, release = 1.5, which = ['music', 'ambience']) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    for (const n of which) { const p = this.buses[n].duck.gain; p.cancelScheduledValues(t); p.setTargetAtTime(amount, t, 0.08); p.setTargetAtTime(1, t + hold, release / 3); }
  }
  // ---------------- playing ----------------
  pick(name) {
    const arr = this.bank.get(name); if (!arr || !arr.length) return null; if (arr.length === 1) return arr[0];
    let i = Math.floor(Math.random() * arr.length); if (i === this.lastPick.get(name)) i = (i + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length; this.lastPick.set(name, i); return arr[i];
  }
  dirHint(p) {
    const dx = p.x - this.L.x, dz = p.z - this.L.z, fx = -Math.sin(this.L.yaw), fz = -Math.cos(this.L.yaw), rx = -fz, rz = fx;
    const f = dx * fx + dz * fz, r = dx * rx + dz * rz, dist = Math.hypot(dx, dz); if (dist < 1.5) return '';
    const a = Math.atan2(r, f); const deg = Math.abs(a) * 57.3; const side = a > 0 ? 'right' : 'left';
    return deg < 25 ? '(ahead)' : deg > 155 ? '(behind)' : deg < 70 ? `(ahead ${side})` : deg > 110 ? `(behind ${side})` : `(${side})`;
  }
  play(name, o = {}) {
    if (!this.ready || !this.ctx) return null; const buf = this.pick(name); if (!buf) return null; const ctx = this.ctx;
    const { bus = 'sfx', pos = null, vol = 1, rate = 1, jitter = 0.07, loop = false, send = 0.25, occlude = true, delay = 0, fade = 0, follow = null, sub = true } = o;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = loop; src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain(); const baseVol = vol * (1 + (Math.random() * 2 - 1) * 0.08);
    const t0 = ctx.currentTime + delay; g.gain.setValueAtTime(fade ? 0.0001 : baseVol, t0); if (fade) g.gain.linearRampToValueAtTime(baseVol, t0 + fade);
    let node = src, filt = null, panner = null;
    if (pos) {
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000; node.connect(filt); node = filt;
      panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 3.5; panner.rolloffFactor = 1.35; panner.maxDistance = 90;
      this.setPos(panner, pos);
    }
    node.connect(g); let g2 = g; if (panner) { g.connect(panner); g2 = panner; }
    g2.connect(this.buses[bus].input);
    let sendG = null; if (send > 0) { sendG = ctx.createGain(); sendG.gain.value = send; g2.connect(sendG); sendG.connect(this.reverbIn); }
    const v = { name, bus, src, g, filt, panner, pos: pos ? { ...pos } : null, follow, baseVol, occ: 1, loop, t0, sendG, occlude, dead: false };
    v.stop = (fadeOut = 0.05) => { if (v.dead) return; const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, Math.max(0.01, fadeOut / 3)); try { src.stop(t + fadeOut + 0.1); } catch { /* */ } };
    v.setVol = (x, tc = 0.2) => { v.baseVol = x; g.gain.setTargetAtTime(x * v.occ, ctx.currentTime, tc); };
    src.onended = () => { v.dead = true; this.voices.delete(v); try { g.disconnect(); sendG && sendG.disconnect(); panner && panner.disconnect(); } catch { /* */ } };
    src.start(t0); this.voices.add(v);
    if (sub && this.s.subtitles && this.onSub && SUBS[name] && (bus === 'monster' || vol > 0.35)) this.onSub(SUBS[name] + (pos ? ' ' + this.dirHint(pos) : ''));
    return v;
  }
  setPos(p, pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.5; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y ?? 1.5, pos.z); }
  loop(name, { bus = 'ambience', vol = 0, fade = 0 } = {}) {
    const v = this.play(name, { bus, vol: Math.max(vol, 0.0001), loop: true, jitter: 0, send: 0.05, sub: false, fade }); if (v) v.baseVol = vol; return v;
  }
  stopAll(fade = 0.5) { for (const v of this.voices) v.stop(fade); }
  update(dt, listener) {
    if (!this.ctx) return; const ctx = this.ctx; Object.assign(this.L, listener); const L = this.L, l = ctx.listener;
    const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw);
    if (l.positionX) { l.positionX.value = L.x; l.positionY.value = L.y; l.positionZ.value = L.z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(L.x, L.y, L.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
    this.occTimer = (this.occTimer || 0) - dt; const doOcc = this.occTimer <= 0; if (doOcc) this.occTimer = 0.12;
    for (const v of this.voices) {
      if (!v.panner) continue; if (v.follow) { const p = v.follow(); if (p) { v.pos = p; this.setPos(v.panner, p); } }
      if (doOcc && v.occlude && this.phys && v.pos) {
        const n = this.phys.blockedBetween(L.x, L.z, v.pos.x, v.pos.z, true);
        const target = n >= 99 ? { f: 420, g: 0.32 } : n > 0 ? { f: 650, g: 0.5 } : { f: 20000, g: 1 };
        v.occ = target.g; v.filt.frequency.setTargetAtTime(target.f, ctx.currentTime, 0.12); if (!v.loop || true) v.g.gain.setTargetAtTime(v.baseVol * target.g, ctx.currentTime, 0.12);
      }
    }
  }
  debugList() { return [...this.voices].map((v) => `${v.name} [${v.bus}] v=${(v.baseVol * v.occ).toFixed(2)}${v.loop ? ' loop' : ''}${v.pos ? ' 3D' : ''}`); }
}

// ---------------- adaptive layer manager ----------------
export class Adaptive {
  constructor(audio) { this.a = audio; this.L = {}; this.started = false; this.eventT = 8; this.nextStage = -1; this.silence = 0; this.lastScare = 0; this.t = 0; this.riser = null; }
  start() {
    const a = this.a; this.t = 0; this.eventT = 6;
    const mk = (n, bus, v = 0) => (this.L[n] = a.loop(n, { bus, vol: v, fade: 3 }));
    mk('ambience-loop', 'ambience'); mk('layer-drone', 'music'); mk('layer-pulse', 'music'); mk('layer-strings', 'music'); mk('layer-perc', 'music'); mk('chase-music', 'music');
    mk('heartbeat_slow', 'sfx'); mk('heartbeat_fast', 'sfx'); mk('rumble', 'ambience'); mk('buzz', 'ambience'); mk('alarm-hull', 'ambience');
    this.started = true; this.riser = null; this.gain = {};
  }
  stop(fade = 2.5) { for (const k in this.L) this.L[k]?.stop(fade); this.L = {}; this.riser?.stop(fade); this.riser = null; this.started = false; }
  set(n, v, tc = 0.6) { const l = this.L[n]; if (l && !l.dead) l.setVol(v, tc); }
  // g: {stage, timeLeft, mdist, hunting, powerPct, power, darkT, draining, caught, monsterPos, playerPos}
  update(dt, g) {
    if (!this.started) return; this.t += dt;
    const st = g.stage, close = g.mdist < 16 ? 1 - g.mdist / 16 : 0, chase = g.hunting && g.mdist < CFG.monster.chaseMusicTiles;
    const amb = [0.55, 0.7, 0.9, 1.1][st];
    this.set('ambience-loop', amb * (this.silence > 0 ? 0.15 : 1), this.silence > 0 ? 0.15 : 1.2);
    this.set('layer-drone', [0.45, 0.6, 0.7, 0.8][st] * (chase ? 0.6 : 1)); this.set('layer-pulse', [0, 0.45, 0.6, 0.7][st] * (chase ? 0.4 : 1)); this.set('layer-strings', [0, 0, 0.5, 0.65][st] * (chase ? 0.5 : 1)); this.set('layer-perc', [0, 0, 0.0, 0.7][st]);
    this.set('chase-music', chase ? 0.65 : 0, chase ? 0.25 : 2.2);
    // heartbeat
    const hs = g.mdist < CFG.monster.heartSlowTiles ? 0.35 + (1 - g.mdist / CFG.monster.heartSlowTiles) * 0.9 : 0, hf = g.mdist < CFG.monster.heartFastTiles ? 0.4 + (1 - g.mdist / CFG.monster.heartFastTiles) * 0.9 : 0;
    this.set('heartbeat_slow', hf > 0 ? 0 : hs, 0.3); this.set('heartbeat_fast', hf, 0.3);
    // low power / darkness / alarm
    this.set('buzz', g.powerPct < 20 ? (g.power <= 0 ? 0.45 : 0.3) : 0, 0.8);
    this.set('rumble', g.darkT > 40 ? Math.min(1, 0.4 + (g.darkT - 40) / 40) : g.darkT > 15 ? 0.15 : 0, 1.5);
    this.set('alarm-hull', st === 3 ? 0.55 : st === 2 ? 0.2 : 0, 1.5);
    if (st === 3 && !this.riser && g.timeLeft > 0) { this.riser = this.a.play('tension-rise', { bus: 'music', vol: 0.8, jitter: 0, send: 0.05, sub: false, fade: 2 }); }
    // random creepy events from random 3D positions
    const S = CFG.monster.stages[st]; this.eventT -= dt * (1 + close * 1.5); this.silence = Math.max(0, this.silence - dt);
    if (this.eventT <= 0 && !g.caught) {
      this.eventT = S.soundMin + Math.random() * (S.soundMax - S.soundMin);
      this.creepy(g, st, close);
    }
    // gasp / pained breath when health drains in the dark
    if (g.draining && (!this.painT || this.t - this.painT > 4)) { this.painT = this.t; this.a.play('breath-pain', { bus: 'sfx', vol: 0.7, sub: false }); this.a.play('gasp', { bus: 'sfx', vol: 0.6, sub: false }); }
    // player breathing
    this.breathT = (this.breathT || 0) - dt; if (this.breathT <= 0) { if (g.running) { this.breathT = 1.6; this.a.play('breath-heavy', { bus: 'foot', vol: 0.5, send: 0.05, sub: false }); } else if (g.afraid) { this.breathT = 3.5; this.a.play('breath-calm', { bus: 'foot', vol: 0.35, send: 0.05, sub: false }); } else this.breathT = 0.5; }
    // dark whispers
    if (g.darkT > 40 && Math.random() < dt * 0.25) this.a.play('monster-whisper', { bus: 'monster', vol: 0.6, pos: this.rndPos(g, 3, 6) });
  }
  rndPos(g, min = 5, max = 16) { const a = Math.random() * 6.283, d = min + Math.random() * (max - min); return { x: g.playerPos.x + Math.cos(a) * d, y: 1.5, z: g.playerPos.z + Math.sin(a) * d }; }
  creepy(g, st, close) {
    const pool = ['creak', 'creak', 'vent-scrape', 'distant-thud', 'monster-whisper', 'pipe-groan', 'far-steps', 'drip', 'distant-thud']; if (st >= 1) pool.push('monster-growl'); if (st >= 2) pool.push('monster-growl', 'monster-screech');
    const n = pool[(Math.random() * pool.length) | 0]; const loud = n.startsWith('monster'); const monsterish = loud && g.monsterPos;
    const pos = monsterish && Math.random() < 0.6 + close * 0.4 ? { x: g.monsterPos.x, y: 1.6, z: g.monsterPos.z } : this.rndPos(g, 5, 15 - close * 6);
    const vol = (loud ? 0.75 : 0.55) * (0.7 + close * 0.6) * (0.8 + st * 0.1);
    if (loud && Math.random() < 0.5 && this.lastScare + 20 < this.t) { this.silence = 1.8; this.lastScare = this.t; this.a.play(n, { bus: 'monster', vol: vol * 1.1, pos, delay: 1.6 }); this.a.duck(0.5, 2.5, 2); }
    else this.a.play(n, { bus: loud ? 'monster' : 'sfx', vol, pos });
  }
}
