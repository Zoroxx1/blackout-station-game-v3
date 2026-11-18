// Audio engine for Halcyon Deep (Prompt 4):
// - 6 buses (music, ambience, monster, sfx, foot, ui) -> master compressor & limiter
// - 3D HRTF positional audio with 100ms grid propagation, wall/door occlusion:
//   occlusion = min(1, walls * 0.35 + closedDoors * 0.5), lowpass = lerp(20000, 600, occlusion),
//   and virtual doorway routing via the room graph when direct LOS is blocked
// - Room tone crossfading (1.5s) and 5-space convolution reverb (small, hall, corridor, outdoor)
// - Monster spatial audio bands (12-25m sobbing, 6-12m wet breathing + periodic growl, 0-6m continuous growl + breathing)
// - Storm thunder delay (dist / 343 m/s), wave swells, and non-proximity adaptive tension with silence drops
import { SOUNDS, renderSound, normalize } from './synth.js';
import { CFG } from './config.js';
import { T_WALL, T_BLOCK, T_DOOR } from './levelgen.js';

const SUPPLIED = typeof import.meta.glob === 'function'
  ? import.meta.glob('/src/assets/audio/*.{ogg,mp3,wav,opus}', { query: '?url', import: 'default' })
  : {};
const BUS_TRIM = { music: 0.55, ambience: 0.55, monster: 1.0, sfx: 0.9, foot: 0.55, ui: 0.7 };
const SUBS = {
  'monster-sob': 'Weeping',
  'monster-breath-wet': 'Wet breathing',
  'monster-growl': 'Low growl',
  'monster-scream': 'SCREAM',
  'monster-bash': 'Door bashed!',
  'monster-nora': '"...Nora..."',
  'wave-crash': 'Wave slams the rig',
  'thunder-close': 'Thunder crack',
  'thunder-mid': 'Rolling thunder',
  creak: 'Steel groans',
  'vent-scrape': 'Scraping in the vents',
  'distant-thud': 'Hollow thud',
  'door-open': 'Door opens',
  'hatch-open': 'Hatch clangs',
  'escape-gate': 'Blast gate cycling',
  'decoy-clatter': 'Decoy clatters',
  'generator-done': 'Generator charged',
  'pipe-groan': 'Risers groan',
  'locker-open': 'Supply chest opens',
  'scanner-ping': 'Scanner ping',
};
const LEVEL = { sfx: -16, music: -20 };
const lerp = (a, b, t) => a + (b - a) * t;

export class AudioEngine {
  constructor(settings) {
    this.s = settings; this.bank = new Map(); this.voices = new Set(); this.ctx = null;
    this.lastPick = new Map(); this.onSub = null; this.phys = null; this.level = null;
    this.L = { x: 0, y: 1.7, z: 0, yaw: 0 };
    this.ready = false; this.muted = false; this.loops = new Map(); this.bankDone = false;
    this.roomToneVoice = null; this.currentRoomTone = null;
  }

  async buildBank(onProgress) {
    const dummy = new OfflineAudioContext(1, 1, 22050);
    const names = Object.keys(SOUNDS);
    const lateNames = new Set([
      'tension-rise', 'sting-win', 'sting-lose', 'chase-music',
      'layer-strings', 'layer-perc', 'layer-pulse', 'layer-drone', 'ambience-loop',
      'tone-engine', 'tone-control', 'tone-galley', 'tone-storage', 'tone-pump',
      'tone-medbay', 'tone-quarters', 'tone-cold', 'tone-workshop', 'tone-lab',
      'tone-lifeboat', 'tone-moonpool', 'tone-corridor', 'tone-helideck',
    ]);
    const order = names.filter((n) => !lateNames.has(n));
    const late = names.filter((n) => lateNames.has(n));
    const total = order.length; let done = 0;
    const doOne = async (n) => {
      const def = SOUNDS[n]; const arr = [];
      for (let i = 0; i < def.n; i++) {
        try {
          arr.push(normalize(await renderSound(dummy, n, def, i), def.sr === 22050 ? LEVEL.music : LEVEL.sfx, true, !!def.loop || !!def.loopExact));
        } catch (e) { console.warn('synth fail', n, e); }
      }
      this.bank.set(n, arr);
    };
    await doOne('menu_music');
    for (const n of order) {
      if (n === 'menu_music') { done++; continue; }
      await doOne(n);
      done++;
      onProgress && onProgress(done / total);
    }
    this.coreReady = true;
    await this.loadSupplied();
    (async () => {
      for (const n of late) await doOne(n);
      await this.loadSupplied();
      this.bankDone = true;
    })();
  }

  async loadSupplied() {
    const keys = Object.keys(SUPPLIED); if (!keys.length || !this.ctx) return;
    const groups = {};
    for (const k of keys) {
      const base = k.split('/').pop().replace(/\.[a-z0-9]+$/, '');
      const g = base.replace(/-\d+$/, '');
      (groups[g] ||= []).push(k);
    }
    for (const g in groups) {
      if (this.suppliedLoaded?.has(g)) continue;
      (this.suppliedLoaded ||= new Set()).add(g);
      try {
        const bufs = [];
        for (const k of groups[g]) {
          const url = await SUPPLIED[k]();
          const ab = await (await fetch(url)).arrayBuffer();
          bufs.push(normalize(await this.ctx.decodeAudioData(ab), /music|ambience|chase|tension|tone/.test(g) ? LEVEL.music : LEVEL.sfx, true, /loop|music|hum|tone/.test(g)));
        }
        this.bank.set(g, bufs);
      } catch (e) { console.warn('supplied audio failed', g, e); }
    }
  }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new C({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.limiter = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20; this.comp.knee.value = 24; this.comp.ratio.value = 3.5; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.limiter.threshold.value = -2.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.05;
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(ctx.destination);

    this.buses = {};
    for (const n of Object.keys(BUS_TRIM)) {
      const input = ctx.createGain(), duck = ctx.createGain();
      input.connect(duck); duck.connect(this.master);
      this.buses[n] = { input, duck };
    }
    this.reverbIn = ctx.createGain(); this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.85; this.reverbOut.connect(this.master);
    this.rev = {};
    for (const [k, dur, decay, ring] of [['small', 0.45, 3.2, 0], ['hall', 2.4, 2.3, 0], ['corridor', 1.5, 2.6, 1], ['outdoor', 0.15, 6.0, 0]]) {
      const cv = ctx.createConvolver(); cv.buffer = this.makeIR(dur, decay, ring);
      const g = ctx.createGain(); g.gain.value = k === 'corridor' ? 0.5 : 0;
      this.reverbIn.connect(cv); cv.connect(g); g.connect(this.reverbOut);
      this.rev[k] = g;
    }
    this.applyVolumes();
    this.loadSupplied();
    this.ready = true;
  }

  makeIR(dur, decay, ring) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n, a = Math.pow(1 - x, decay), k = 0.15 + 0.7 * x;
        lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
        d[i] = lp * a * 2.1;
        if (ring && i % Math.floor(sr * 0.037) === 0) d[i] += 0.28 * a * (ch ? 1 : -1);
      }
    }
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.s, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || s.mute ? 0 : (s.master ?? 0.8), t, 0.05);
    for (const n in this.buses) {
      const busSetting = s[n] ?? (n === 'music' ? s.music : n === 'ambience' ? (s.ambience ?? s.sfx) : s.sfx) ?? 0.85;
      this.buses[n].input.gain.setTargetAtTime(BUS_TRIM[n] * busSetting, t, 0.05);
    }
  }

  // Prompt 4 Section 2: Crossfade to room tone over 1.5s and change reverb by room type
  setRoomReverb(room) {
    if (!this.ctx || !room) return;
    const t = this.ctx.currentTime;
    const revType = room.reverb || (room.roomType === 'helideck' ? 'outdoor' : room.sizeClass === 'large' ? 'hall' : room.roomType === 'corridor' ? 'corridor' : 'small');
    for (const k of ['small', 'hall', 'corridor', 'outdoor']) {
      if (this.rev[k]) this.rev[k].gain.setTargetAtTime(k === revType ? (k === 'outdoor' ? 0.08 : 0.75) : 0.05, t, 0.45);
    }
    const toneName = room.roomTone || 'tone-corridor';
    if (toneName !== this.currentRoomTone && this.bank.has(toneName)) {
      this.currentRoomTone = toneName;
      if (this.roomToneVoice) this.roomToneVoice.stop(1.5);
      this.roomToneVoice = this.play(toneName, { bus: 'ambience', vol: 0.42, loop: true, jitter: 0, fade: 1.5, send: 0.15, sub: false });
    }
  }

  duck(amount = 0.45, hold = 1.6, release = 1.5, which = ['music', 'ambience']) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of which) {
      if (!this.buses[n]) continue;
      const p = this.buses[n].duck.gain;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(amount, t, 0.03);
      p.setTargetAtTime(1, t + hold, Math.max(0.05, release / 3));
    }
  }

  pick(name) {
    const arr = this.bank.get(name); if (!arr || !arr.length) return null;
    if (arr.length === 1) return arr[0];
    let i = Math.floor(Math.random() * arr.length);
    if (i === this.lastPick.get(name)) i = (i + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length;
    this.lastPick.set(name, i);
    return arr[i];
  }

  dirHint(p) {
    const dx = p.x - this.L.x, dz = p.z - this.L.z, fx = -Math.sin(this.L.yaw), fz = -Math.cos(this.L.yaw), rx = -fz, rz = fx;
    const f = dx * fx + dz * fz, r = dx * rx + dz * rz, dist = Math.hypot(dx, dz); if (dist < 1.5) return '';
    const a = Math.atan2(r, f), deg = Math.abs(a) * 57.3, side = a > 0 ? 'right' : 'left';
    return deg < 25 ? '(ahead)' : deg > 155 ? '(behind)' : deg < 70 ? `(ahead ${side})` : deg > 110 ? `(behind ${side})` : `(${side})`;
  }

  // Prompt 4 Section 3.3: Trace sound propagation through level grid (walls, closed doors, and doorway virtual source)
  tracePropagation(srcPos) {
    if (!this.phys || !this.phys.L) return { occ: 0, freq: 20000, gainMult: 1, virtualPos: srcPos };
    const L = this.phys.L, W = L.W;
    const x0 = this.L.x, z0 = this.L.z, x1 = srcPos.x, z1 = srcPos.z;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.45));
    let walls = 0, closedDoors = 0, lastKey = -1;
    for (let i = 1; i < steps; i++) {
      const tx = Math.floor((x0 + (dx * i) / steps) / 2);
      const tz = Math.floor((z0 + (dz * i) / steps) / 2);
      const k = tz * W + tx;
      if (k === lastKey) continue;
      lastKey = k;
      const t = this.phys.tile(tx, tz);
      if (t === T_WALL || t === T_BLOCK) walls++;
      else if (t === T_DOOR) {
        const d = this.phys.doorAt.get(k);
        if (d && d.blocking()) closedDoors++;
      }
    }

    // Front/back clarity: gentle high-frequency cut when sound is behind listener
    const fx = -Math.sin(this.L.yaw), fz = -Math.cos(this.L.yaw);
    const dot = len > 0.2 ? ((dx * fx + dz * fz) / len) : 1;
    const behindCut = dot < -0.2 ? 0.72 : 1.0;

    // Virtual doorway source when direct line is blocked by walls
    let virtualPos = srcPos;
    if (walls > 0 && L.roomGrid && L.links) {
      const listenerRoom = L.roomGrid[Math.floor(z0 / 2) * W + Math.floor(x0 / 2)];
      const sourceRoom = L.roomGrid[Math.floor(z1 / 2) * W + Math.floor(x1 / 2)];
      if (listenerRoom >= 0 && sourceRoom >= 0 && listenerRoom !== sourceRoom && L.rooms[listenerRoom]) {
        // Find doorway of listenerRoom that leads shortest toward sourceRoom
        let bestDoor = null, bestHops = 999;
        for (const lk of L.rooms[listenerRoom].links) {
          const neighbor = lk.a === listenerRoom ? lk.b : lk.a;
          const h = L.dist[neighbor]?.[sourceRoom] ?? 999;
          if (h < bestHops) { bestHops = h; bestDoor = lk; }
        }
        if (bestDoor) {
          const doorX = (bestDoor.tx + 0.5) * 2, doorZ = (bestDoor.ty + 0.5) * 2;
          const dirX = doorX - x0, dirZ = doorZ - z0, dirD = Math.hypot(dirX, dirZ) || 1;
          const pathDist = Math.max(len, dirD + bestHops * 8);
          virtualPos = {
            x: x0 + (dirX / dirD) * pathDist,
            y: srcPos.y ?? 1.5,
            z: z0 + (dirZ / dirD) * pathDist,
          };
        }
      }
    }

    const occlusion = Math.min(1, walls * CFG.audio.occlusionWallWeight + closedDoors * CFG.audio.occlusionDoorWeight);
    const freq = lerp(20000, 600, occlusion) * behindCut;
    const gainMult = 1 - 0.5 * occlusion;
    return { occ: occlusion, freq, gainMult, virtualPos };
  }

  play(name, o = {}) {
    if (!this.ready || !this.ctx) return null;
    const buf = this.pick(name); if (!buf) return null;
    const ctx = this.ctx;
    const { bus = 'sfx', pos = null, vol = 1, rate = 1, jitter = 0.07, loop = false, send = 0.25, occlude = true, delay = 0, fade = 0, follow = null, sub = true } = o;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = loop;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain();
    const baseVol = vol * (1 + (Math.random() * 2 - 1) * 0.08);
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(fade ? 0.0001 : baseVol, t0);
    if (fade) g.gain.linearRampToValueAtTime(baseVol, t0 + fade);

    let node = src, filt = null, panner = null;
    if (pos) {
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000;
      node.connect(filt); node = filt;
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      const dc = CFG.audio.distanceClasses[bus] || CFG.audio.distanceClasses.sfx;
      panner.refDistance = dc.refDistance;
      panner.rolloffFactor = dc.rolloffFactor;
      panner.maxDistance = dc.maxDistance;
      this.setPos(panner, pos);
    }
    node.connect(g);
    let g2 = g;
    if (panner) { g.connect(panner); g2 = panner; }
    g2.connect((this.buses[bus] || this.buses.sfx).input);

    let sendG = null;
    if (send > 0) {
      sendG = ctx.createGain(); sendG.gain.value = send;
      g2.connect(sendG); sendG.connect(this.reverbIn);
    }
    const v = { name, bus, src, g, filt, panner, pos: pos ? { ...pos } : null, follow, baseVol, occ: 0, gainMult: 1, loop, t0, sendG, occlude, dead: false };
    v.stop = (fadeOut = 0.05) => {
      if (v.dead) return;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, Math.max(0.01, fadeOut / 3));
      try { src.stop(t + fadeOut + 0.1); } catch { /* */ }
    };
    v.setVol = (x, tc = 0.2) => {
      v.baseVol = x;
      g.gain.setTargetAtTime(x * v.gainMult, ctx.currentTime, tc);
    };
    src.onended = () => {
      v.dead = true;
      this.voices.delete(v);
      try { g.disconnect(); sendG && sendG.disconnect(); panner && panner.disconnect(); } catch { /* */ }
    };
    src.start(t0);
    this.voices.add(v);
    if (sub && this.s.subtitles && this.onSub && SUBS[name] && (bus === 'monster' || vol > 0.35)) {
      this.onSub(SUBS[name] + (pos ? ' ' + this.dirHint(pos) : ''));
    }
    return v;
  }

  setPos(p, pos) {
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y ?? 1.5;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y ?? 1.5, pos.z);
  }

  loop(name, { bus = 'ambience', vol = 0, fade = 0, pos = null } = {}) {
    const v = this.play(name, { bus, vol: Math.max(vol, 0.0001), loop: true, jitter: 0, send: 0.05, sub: false, fade, pos });
    if (v) v.baseVol = vol;
    return v;
  }

  stopAll(fade = 0.5) {
    for (const v of this.voices) v.stop(fade);
    this.roomToneVoice = null;
    this.currentRoomTone = null;
  }

  // Trigger thunder after distance / 343 m/s delay (Prompt 4 Section 5)
  scheduleThunder(distMeters = 400) {
    const delaySec = Math.max(0.2, Math.min(6.0, distMeters / 343));
    const kind = delaySec < 1.0 ? 'thunder-close' : delaySec < 2.8 ? 'thunder-mid' : 'thunder-far';
    setTimeout(() => {
      if (this.ready) this.play(kind, { bus: 'ambience', vol: delaySec < 1.0 ? 0.95 : 0.75, send: 0.3 });
    }, delaySec * 1000);
  }

  update(dt, listener) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    Object.assign(this.L, listener);
    const L = this.L, l = ctx.listener;
    const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw);
    if (l.positionX) {
      l.positionX.value = L.x; l.positionY.value = L.y; l.positionZ.value = L.z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(L.x, L.y, L.z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    // 100 ms propagation & occlusion trace (Prompt 4 Section 3.3)
    this.occTimer = (this.occTimer || 0) - dt;
    const doOcc = this.occTimer <= 0;
    if (doOcc) this.occTimer = 0.10;
    for (const v of this.voices) {
      if (!v.panner) continue;
      if (v.follow) {
        const p = v.follow();
        if (p) v.pos = p;
      }
      if (doOcc && v.occlude && v.pos) {
        const prop = this.tracePropagation(v.pos);
        v.occ = prop.occ;
        v.gainMult = prop.gainMult;
        this.setPos(v.panner, prop.virtualPos);
        v.filt.frequency.setTargetAtTime(prop.freq, ctx.currentTime, 0.1);
        v.g.gain.setTargetAtTime(v.baseVol * prop.gainMult, ctx.currentTime, 0.1);
      } else if (v.pos) {
        this.setPos(v.panner, v.pos);
      }
    }
  }

  debugList() {
    return [...this.voices].map((v) => {
      const d = v.pos ? Math.hypot(v.pos.x - this.L.x, v.pos.z - this.L.z).toFixed(1) + 'm' : '2D';
      return `${v.name.padEnd(18)} [${v.bus}] vol=${(v.baseVol * v.gainMult).toFixed(2)} occ=${v.occ.toFixed(2)} ${d}`;
    });
  }
}

// ---------------- Adaptive Tension, Storm Swells & Monster Spatial Bands (Prompt 4 Sections 4, 5, 6) ----------------
export class Adaptive {
  constructor(audio) {
    this.a = audio;
    this.L = {};
    this.started = false;
    this.eventT = 10;
    this.waveT = 28;
    this.silenceTimer = 95;
    this.silenceHold = 0;
    this.growlT = 7;
    this.t = 0;
    this.riser = null;
    this.tension = 0.15;
    this.monsterPos = { x: 0, y: 1.5, z: 0 };
  }

  start() {
    const a = this.a;
    this.t = 0;
    this.eventT = 8;
    this.waveT = 25 + Math.random() * 25;
    this.silenceTimer = 90 + Math.random() * 45;
    this.silenceHold = 0;
    const mk = (n, bus, v = 0) => (this.L[n] = a.loop(n, { bus, vol: v, fade: 3 }));
    mk('ambience-loop', 'ambience', 0.45);
    mk('layer-drone', 'music', 0.35);
    mk('layer-pulse', 'music', 0);
    mk('layer-strings', 'music', 0);
    mk('layer-perc', 'music', 0);
    mk('heartbeat_slow', 'sfx', 0);
    mk('heartbeat_fast', 'sfx', 0);
    mk('rumble', 'ambience', 0.2);
    mk('buzz', 'ambience', 0);
    mk('alarm-hull', 'ambience', 0);

    // Positional 3D monster loops (sobbing + wet breathing) attached to monster's real world position
    const mFollow = () => ({
      x: this.monsterPos.x + (Math.random() - 0.5) * 0.3,
      y: 1.5,
      z: this.monsterPos.z + (Math.random() - 0.5) * 0.3,
    });
    this.L.monsterSob = a.play('monster-sob', { bus: 'monster', vol: 0.001, loop: true, pos: mFollow(), follow: mFollow, send: 0.35, sub: false });
    this.L.monsterBreath = a.play('monster-breath-wet', { bus: 'monster', vol: 0.001, loop: true, pos: mFollow(), follow: mFollow, send: 0.25, sub: false });

    this.started = true;
    this.riser = null;
  }

  stop(fade = 2.0) {
    for (const k in this.L) this.L[k]?.stop(fade);
    this.L = {};
    this.riser?.stop(fade);
    this.riser = null;
    this.started = false;
  }

  set(n, v, tc = 0.6) {
    const l = this.L[n];
    if (l && !l.dead) l.setVol(v, tc);
  }

  // g: { stage, timeLeft, mdist (tiles), monsterState, powerPct, power, darkT, draining, caught, monsterPos, playerPos, running, health, unhelpedCrew, recentlyChased }
  update(dt, g) {
    if (!this.started) return;
    this.t += dt;
    if (g.monsterPos) {
      this.monsterPos.x = g.monsterPos.x;
      this.monsterPos.z = g.monsterPos.z;
    }

    // Prompt 4 Section 6: Tension (0..1) comes ONLY from storm intensity (stage), player stress (low health, power out, recently chased, darkT), and unhelped crew — NEVER from monster proximity!
    const st = g.stage || 0;
    const stormStress = st * 0.18;
    const healthStress = g.health < 50 ? (1 - g.health / 50) * 0.28 : 0;
    const powerStress = g.power <= 0 ? 0.25 : g.powerPct < 25 ? 0.12 : 0;
    const darkStress = Math.min(0.22, (g.darkT || 0) / 180);
    const chaseStress = g.recentlyChased ? 0.25 : 0;
    const crewStress = ((g.unhelpedCrew ?? 4) / 4) * 0.12;
    this.tension = Math.min(1, stormStress + healthStress + powerStress + darkStress + chaseStress + crewStress);

    // Silence moments every 90..150s for 8..12s (Prompt 4 Section 6)
    if (this.silenceHold > 0) {
      this.silenceHold -= dt;
    } else {
      this.silenceTimer -= dt;
      if (this.silenceTimer <= 0) {
        this.silenceTimer = 90 + Math.random() * 60;
        this.silenceHold = 8 + Math.random() * 4;
      }
    }
    const silMult = this.silenceHold > 0 ? 0.22 : 1.0;

    // Adaptive ambient & music layers driven by tension (NOT monster proximity)
    this.set('ambience-loop', (0.45 + this.tension * 0.45) * silMult, 1.0);
    this.set('layer-drone', (0.35 + this.tension * 0.4) * silMult, 1.0);
    this.set('layer-pulse', this.tension > 0.35 ? (this.tension - 0.35) * 0.7 * silMult : 0, 1.0);
    this.set('layer-strings', this.tension > 0.55 ? (this.tension - 0.55) * 0.8 * silMult : 0, 1.0);
    this.set('layer-perc', this.tension > 0.75 ? (this.tension - 0.75) * 0.9 * silMult : 0, 1.0);

    // Prompt 3 Section 4: Heartbeat follows ONLY the player's own stress (health low, power out, recently chased) — NEVER monster proximity!
    const playerStress = Math.max(healthStress * 2.5, powerStress * 2.2, chaseStress * 2.5);
    this.set('heartbeat_slow', playerStress > 0.2 && playerStress <= 0.55 ? playerStress : 0, 0.4);
    this.set('heartbeat_fast', playerStress > 0.55 ? playerStress : 0, 0.3);

    this.set('buzz', g.powerPct < 20 ? (g.power <= 0 ? 0.42 : 0.25) : 0, 0.8);
    this.set('rumble', (0.2 + st * 0.15) * silMult, 1.5);
    this.set('alarm-hull', st === 3 ? 0.5 : st === 2 ? 0.18 : 0, 1.5);
    if (st === 3 && !this.riser && g.timeLeft > 0) {
      this.riser = this.a.play('tension-rise', { bus: 'music', vol: 0.75, jitter: 0, send: 0.05, sub: false, fade: 2 });
    }

    // Prompt 4 Section 4: Monster Spatial Sound Bands (based on real 3D distance in meters)
    const distMeters = (g.mdist ?? 50) * 2;
    const mState = g.monsterState || 'ROAM';
    if (mState === 'ROAM' || mState === 'INVESTIGATE' || mState === 'RECOVER') {
      // 12 to 25m: faint whimpering/sobbing only
      const sobVol = distMeters <= 25 ? Math.max(0.08, (1 - distMeters / 25) * 0.72) : 0.001;
      // 0 to 12m: wet breathing
      const breathVol = distMeters <= 12 ? Math.max(0.05, (1 - distMeters / 12) * 0.8) : 0.001;
      this.set('monsterSob', sobVol, 0.25);
      this.set('monsterBreath', breathVol, 0.25);

      // 6 to 12m: low growl every 6..12s; 0 to 6m: more frequent & louder low growl
      if (distMeters <= 12) {
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = distMeters <= 6 ? (2.2 + Math.random() * 1.8) : (6 + Math.random() * 6);
          const gVol = distMeters <= 6 ? lerp(0.95, 0.65, distMeters / 6) : 0.5;
          this.a.play('monster-growl', { bus: 'monster', vol: gVol, pos: { ...this.monsterPos } });
        }
      }
    } else {
      // In DISTRESS or RAGE: loud sobs/screams
      this.set('monsterSob', 0.85, 0.15);
      this.set('monsterBreath', 0.9, 0.15);
    }

    // Prompt 4 Section 5: Wave swells every 25..60 seconds
    this.waveT -= dt;
    if (this.waveT <= 0 && !g.caught) {
      this.waveT = CFG.audio.waveInterval[0] + Math.random() * (CFG.audio.waveInterval[1] - CFG.audio.waveInterval[0]);
      this.a.play('wave-crash', { bus: 'ambience', vol: 0.7 + st * 0.08, pos: this.rndPos(g, 10, 22), send: 0.4 });
      this.onWaveHit?.();
    }

    // Random structural events (creak, pipe groan, distant thud) scheduled by tension
    const S = CFG.monster.stages[st];
    this.eventT -= dt * (0.8 + this.tension * 0.8);
    if (this.eventT <= 0 && !g.caught) {
      this.eventT = S.soundMin + Math.random() * (S.soundMax - S.soundMin);
      const pool = ['creak', 'creak', 'pipe-groan', 'vent-scrape', 'distant-thud', 'drip'];
      const n = pool[(Math.random() * pool.length) | 0];
      this.a.play(n, { bus: 'sfx', vol: 0.48 + this.tension * 0.25, pos: this.rndPos(g, 6, 16) });
    }

    // Player breathing & dark health drain gasps
    if (g.draining && (!this.painT || this.t - this.painT > 4)) {
      this.painT = this.t;
      this.a.play('breath-pain', { bus: 'sfx', vol: 0.7, sub: false });
      this.a.play('gasp', { bus: 'sfx', vol: 0.6, sub: false });
    }
    this.breathT = (this.breathT || 0) - dt;
    if (this.breathT <= 0) {
      if (g.running) {
        this.breathT = 1.6;
        this.a.play('breath-heavy', { bus: 'foot', vol: 0.48, send: 0.05, sub: false });
      } else if (playerStress > 0.35) {
        this.breathT = 3.5;
        this.a.play('breath-calm', { bus: 'foot', vol: 0.32, send: 0.05, sub: false });
      } else this.breathT = 0.5;
    }
  }

  rndPos(g, min = 5, max = 16) {
    const a = Math.random() * 6.283, d = min + Math.random() * (max - min);
    return { x: g.playerPos.x + Math.cos(a) * d, y: 1.5, z: g.playerPos.z + Math.sin(a) * d };
  }
}
