// Main game: renderer, scene, game loop and all rules (numbers come from config.js).
import * as THREE from 'three';
import { CFG, TILE, stageFor } from './config.js';
import story from './story.json';
import { generateLevel, GRID } from './levelgen.js';
import { RNG, hashSeed, randomSeedString } from './rng.js';
import { buildTextures } from './textures.js';
import { World } from './world.js';
import { Physics } from './physics.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hands } from './hands.js';
import { Monster } from './monster.js';
import { MonsterAI } from './monsterai.js';
import { AudioEngine, Adaptive } from './audio.js';
import { Effects } from './effects.js';
import { UI, fmtTime } from './ui.js';
import { setupTouch } from './touch.js';
import { loadSave, persist, autoQuality } from './save.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ITEMS = ['scanner', 'decoy', 'blue', 'red'];
const API = import.meta.env?.VITE_API_URL || '';

export class Game {
  constructor(container) {
    this.container = container; this.save = loadSave(); this.settings = this.save.settings; this.state = 'loading'; this.clock = { last: performance.now(), getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; } };
    this.fps = 60; this.fpsAcc = 0; this.frames = 0; this.showDebug = false; this.showAudioDebug = false; this.t = 0; this.world = null; this.interactPress = false;
  }
  // ------------------------------------------------------------------ init
  async init() {
    const root = this.root = document.createElement('div'); root.id = 'bs-root'; this.container.appendChild(root);
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) root.classList.add('touch');
    const canvas = document.createElement('canvas'); canvas.className = 'bs-canvas'; root.appendChild(canvas);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.setClearColor(0x020204);
    this.qName = this.settings.quality === 'auto' ? autoQuality() : this.settings.quality; const urlQ = new URLSearchParams(location.search).get('q'); if (urlQ && CFG.quality[urlQ]) this.qName = urlQ;
    this.q = CFG.quality[this.qName];
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x040407, CFG.fx.fogDensity); this.scene.background = new THREE.Color(0x020204);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0x8a80a8, 0x1c1618, 0.3); this.scene.add(this.hemi);
    this.spot = new THREE.SpotLight(CFG.fx.flashlight.color, CFG.fx.flashlight.intensity, CFG.fx.flashlight.distance, CFG.fx.flashlight.angle, CFG.fx.flashlight.penumbra, CFG.fx.flashlight.decay);
    this.spot.position.set(-0.2, -0.13, -0.28); this.spot.target.position.set(-0.1, 0, -10); this.camera.add(this.spot, this.spot.target);
    this.hands = new Hands();
    this.audio = new AudioEngine(this.settings); this.adaptive = new Adaptive(this.audio); this.audio.onSub = (t) => this.ui.sub(t);
    this.input = new Input(canvas, this.settings); this.input.isTouch = root.classList.contains('touch');
    this.ui = new UI(root, {
      save: this.save, settings: this.settings, input: this.input, seedInput: '',
      sfx: (n) => this.audio.play(n, { bus: 'ui', vol: 0.5, send: 0, sub: false, jitter: 0.03 }),
      fullscreen: () => this.toggleFullscreen(), pause: () => this.pause(), resume: () => this.resume(), quit: () => this.quit(),
      play: (seed) => this.startRun(seed), choose: (i) => this.choose(i), getSeed: () => this.run?.seed || this.menuSeed,
      applySettings: (q) => this.applySettings(q),
    });
    this.touch = setupTouch(root, this.input);
    this.bindInput(); this.applyQuality(); this.resize();
    addEventListener('resize', () => this.resize()); addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200)); window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    document.addEventListener('fullscreenchange', () => this.resize());
    canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.terminalOpen) this.input.requestLock(); });
    // first user gesture unlocks audio and starts menu music
    const unlock = async () => { await this.audio.init(); this.audio.applyVolumes(); this.audio.setPhysics = null; this.startMenuMusic(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, () => { if (!this.audioUnlocked) { this.audioUnlocked = true; unlock(); } }, { passive: true }));
    // loading
    this.ui.show('loading'); await new Promise((res) => requestAnimationFrame(res));
    this.ui.setLoad(0.05, 'Generating PBR materials...'); await new Promise((res) => setTimeout(res, 30));
    this.tex = buildTextures(r, this.q.tex, story.notes);
    this.ui.setLoad(0.3, 'Rendering sound bank...');
    await this.audio.buildBank((p) => this.ui.setLoad(0.3 + p * 0.55, 'Rendering sound bank...'));
    this.ui.setLoad(0.9, 'Building station...'); await new Promise((res) => setTimeout(res, 30));
    this.menuSeed = randomSeedString(); this.buildWorld(this.menuSeed);
    this.ui.setLoad(1, 'Ready'); this.state = 'menu'; this.ui.show('title'); this.ui.muteIcon(this.settings.mute);
    this.menuYaw = this.level.start.yaw;
    // optional URL helpers for testing: ?seed=ABC&autostart
    const sp = new URLSearchParams(location.search); if (sp.get('autostart')) setTimeout(() => this.startRun(sp.get('seed') || ''), 300);
    this.loop();
  }
  startMenuMusic() { if (this.state === 'menu' || this.state === 'ended') this.musicVoice ||= this.audio.play('menu_music', { bus: 'music', vol: 0.9, loop: true, jitter: 0, send: 0.1, fade: 3, sub: false }); }
  stopMenuMusic(fade = 1.5) { this.musicVoice?.stop(fade); this.musicVoice = null; }
  // ------------------------------------------------------------------ settings / quality / resize
  applySettings(qualityChanged) {
    this.audio.s = this.settings; this.audio.applyVolumes(); this.ui.muteIcon(this.settings.mute); this.fx.u.uCB.value = this.settings.colorblind ? 1 : 0;
    persist(this.save); if (qualityChanged) { this.qName = this.settings.quality === 'auto' ? autoQuality() : this.settings.quality; this.q = CFG.quality[this.qName]; this.applyQuality(); }
  }
  applyQuality() {
    const r = this.renderer, q = this.q; this.q = q; r.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    this.spot.castShadow = q.shadows; this.spot.shadow.mapSize.set(q.shadow, q.shadow); this.spot.shadow.camera.near = 0.15; this.spot.shadow.camera.far = 30; this.spot.shadow.bias = -0.0004; this.spot.shadow.normalBias = 0.03; this.spot.shadow.radius = 3;
    if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
    if (this.pool) this.pool.forEach((l) => this.scene.remove(l));
    this.pool = []; for (let i = 0; i < q.pointLights; i++) { const l = new THREE.PointLight(0xff7a22, 0, 16, 2); this.scene.add(l); this.pool.push(l); }
    if (this.fx) this.fx.dispose();
    this.fx = new Effects(r, this.scene, this.camera, this.hands, q); this.resize();
    if (this.ui) this.fx.u.uCB.value = this.settings.colorblind ? 1 : 0;
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio(); this.fx?.resize(w * pr, h * pr); this.fx?.composer.setPixelRatio(1);
  }
  toggleFullscreen(force) {
    const d = document; if (!d.fullscreenElement && !d.webkitFullscreenElement) { const e = this.root; (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e)?.catch?.(() => {}); } else if (!force) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  }
  // ------------------------------------------------------------------ input
  bindInput() {
    const i = this.input;
    i.on('light', () => this.toggleLight()); i.on('swap', () => this.cycleItem()); i.on('use', () => this.useItem()); i.on('interactDown', () => { this.interactPress = true; });
    i.on('interactUp', () => { /* handled via held state */ }); i.on('choice', (n) => { if (this.terminalOpen) this.choose(n); });
    i.on('pause', () => { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); });
    i.on('debug', () => { this.showDebug = !this.showDebug; if (!this.showDebug) this.ui.debug(null); }); i.on('audiodebug', () => { this.showAudioDebug = !this.showAudioDebug; if (!this.showAudioDebug) this.ui.adebug(null); });
    i.on('fullscreen', () => this.toggleFullscreen());
    i.on('lockchange', (locked) => { if (!locked && this.state === 'playing' && !this.terminalOpen && !this.input.dragFallback && performance.now() - (this.lockAt || 0) > 400) this.pause(); });
  }
  // ------------------------------------------------------------------ world / run setup
  buildWorld(seed) {
    if (this.world) { this.world.dispose(); this.scene.remove(this.world.root); }
    if (this.monsterModel) { this.scene.remove(this.monsterModel.root); this.monsterModel = null; }
    this.level = generateLevel(seed); this.physics = new Physics(this.level);
    this.world = new World(this.level, this.tex, this.renderer, this.q, {}); this.scene.add(this.world.root);
    for (const d of this.world.doors) this.physics.registerDoor(d);
    this.audio.phys = this.physics; this.currentSeed = seed;
    for (const m of this.world.shadowMeshes) m.castShadow = this.q.shadows;
  }
  async startRun(seedIn) {
    if (this.state === 'starting') return; this.state = 'starting';
    this.ui.show('loading'); this.ui.setLoad(0.2, 'Generating station...'); await new Promise((r) => setTimeout(r, 40));
    await this.audio.init(); this.audio.applyVolumes(); this.audioUnlocked = true;
    const seed = (seedIn || '').trim() || this.menuSeed;
    if (seed !== this.currentSeed || this.ranOnce) { this.buildWorld(seed); }
    this.menuSeed = randomSeedString();
    this.ui.setLoad(0.9, 'Waking the creature...'); await new Promise((r) => setTimeout(r, 30));
    const L = this.level, hard = !!this.settings.hard, H = CFG.hard;
    this.run = { seed, hard, timeLeft: CFG.run.length, health: CFG.start.health, power: hard ? H.startPower : CFG.start.power, noise: 0, decoys: CFG.start.decoys, flash: CFG.start.flashlightOn, item: 'scanner', cards: { red: false, blue: false }, darkT: 0, drainAcc: 0, darkWarned: false, crew: { ana: false, bix: false, chen: false }, read: { ana: false, bix: false, chen: false }, scanT: 0, bixHunt: 0, charging: null, chargeP: 0, stageIdx: 0, elapsed: 0, powerBeep: 0, powerOutMsg: false, caughtT: 0, launchT: 0, ended: false, lightK: 1, panic: 0, shake: 0, genGain: hard ? H.generatorGain : CFG.generator.powerGain, hasMovedT: 0, stepT: 0, monStepT: 0, rng: new RNG(hashSeed('run' + seed)), lowMsg: false };
    this.ranOnce = true; this.player = new Player(L, this.physics); this.target = null;
    this.monsterModel = new Monster(); this.monsterModel.root.traverse((o) => { if (o.isMesh) o.castShadow = this.q.shadows; }); this.scene.add(this.monsterModel.root);
    this.ai = new MonsterAI(L, this.physics, hard, this.run.rng); this.ai.headT = CFG.monster.stages[0].headEvery * 0.6;
    this.thrown = []; this.world.lockers.forEach((l) => l.opened && (l.opened = false)); this.prevHunt = false; this.monHint = 0; this.terminalOpen = null;
    this.hands.setItem('scanner'); this.hands.cur = 'scanner'; this.hands.setFlashlight(true, 1);
    this.world.updateDoorLights((k) => this.run.cards[k]);
    this.stopMenuMusic(2); this.adaptive.stop(0.2); this.adaptive.start();
    this.ui.hideScreens(); this.ui.showHud(true); this.touch.show(this.input.isTouch); this.input.enabled = true; this.state = 'playing';
    this.ui.msg(story.intro, 6000); this.ui.bars(this.run.health, this.run.power, 0, this.run.timeLeft, CFG.run.length);
    if (this.input.isTouch) { this.toggleFullscreen(true); try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ } } else { this.lockAt = performance.now(); this.input.requestLock(); }
    this.audio.setRoomReverb(L.rooms[L.startRoom]);
    this.clock.getDelta();
  }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.input.releaseLock(); this.ui.show('pause'); this.touch.show(false); this.audio.ctx?.suspend(); this.audio.play?.('ui-pause', { bus: 'ui' }); }
  resume() { if (this.state !== 'paused') return; this.audio.ctx?.resume(); this.ui.hideScreens(); this.state = 'playing'; this.touch.show(this.input.isTouch); this.lockAt = performance.now(); if (!this.input.isTouch) this.input.requestLock(); this.clock.getDelta(); }
  quit() {
    this.audio.ctx?.resume(); this.adaptive.stop(0.5); this.audio.stopAll(0.5); this.ui.showHud(false); this.touch.show(false); this.input.releaseLock(); this.input.enabled = false; this.terminalOpen = null;
    if (this.monsterModel) { this.scene.remove(this.monsterModel.root); this.monsterModel = null; } this.run = null; this.state = 'menu'; this.ui.show('title'); this.musicVoice = null; this.startMenuMusic(); this.fx.u.uRed.value = this.fx.u.uPurple.value = 0;
    if (this.ranOnce) { this.buildWorld(this.menuSeed); } this.menuYaw = this.level.start.yaw; this.hands.setFlashlight(true, 1);
  }
  // ------------------------------------------------------------------ player actions
  addNoise(n) { this.run.noise = Math.min(CFG.noise.max, this.run.noise + n); }
  usePower(n) { if (this.run.power < n) { this.ui.msg(story.messages.no_power, 2200); this.audio.play('terminal-beep', { bus: 'ui', vol: 0.5, sub: false }); return false; } this.run.power -= n; return true; }
  toggleLight() {
    const R = this.run; if (!R || this.state !== 'playing' || this.terminalOpen) return;
    if (!R.flash && R.power <= 0) { this.ui.msg(story.messages.flash_dead, 2500); this.audio.play('terminal-beep', { bus: 'ui', vol: 0.5, sub: false }); return; }
    R.flash = !R.flash; this.audio.play(R.flash ? 'flash-on' : 'flash-off', { bus: 'sfx', vol: 0.7, send: 0, sub: false }); this.hands.nudge = 1;
  }
  owned() { return ITEMS.filter((i) => (i === 'blue' ? this.run.cards.blue : i === 'red' ? this.run.cards.red : true)); }
  cycleItem() {
    const R = this.run; if (!R || this.state !== 'playing' || this.terminalOpen) return; const list = this.owned(), idx = list.indexOf(R.item); R.item = list[(idx + 1) % list.length]; this.hands.setItem(R.item);
    this.audio.play('terminal-key', { bus: 'sfx', vol: 0.6, send: 0, sub: false });
  }
  useItem() {
    const R = this.run; if (!R || this.state !== 'playing' || this.terminalOpen || R.charging) return;
    if (R.item === 'scanner') {
      if (!this.usePower(CFG.power.scan)) return;
      this.addNoise(CFG.noise.scan); R.scanT = CFG.scanner.duration; this.hands.use('scanner'); this.audio.play('scanner-ping', { bus: 'sfx', vol: 0.75, send: 0.35 });
    } else if (R.item === 'decoy') {
      if (R.decoys <= 0) { this.ui.msg(story.messages.no_decoy, 2200); return; }
      if (this.hands.useT < 1) return; R.decoys--; this.hands.use('decoy', () => this.throwDecoy()); this.audio.play('decoy-throw', { bus: 'sfx', vol: 0.7, send: 0.1 });
      if (R.decoys <= 0) setTimeout(() => { if (this.run && this.run.item === 'decoy') { this.run.item = 'scanner'; this.hands.setItem('scanner'); } }, 700);
    } else this.ui.msg(R.item === 'red' ? story.messages.card_hint_red : story.messages.card_hint_blue, 3200);
  }
  throwDecoy() {
    const f = this.player.forward(), p = this.player.pos, c = CFG.decoy, pitch = this.player.pitch;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xc9c2b0, metalness: 0.5, roughness: 0.5, emissive: 0x401008, emissiveIntensity: 1 })); m.castShadow = true; this.scene.add(m);
    const sp = c.throwSpeed, up = Math.sin(pitch + 0.25) * sp * 0.6 + 2.5, fw = Math.cos(pitch) * sp;
    this.thrown.push({ m, x: p.x + f.x * 0.5, y: 1.5, z: p.z + f.z * 0.5, vx: f.x * fw, vy: up, vz: f.z * fw, bounces: 0, spin: 14 });
  }
  // find the interactable the player is facing
  findTarget() {
    const P = this.player, f = P.forward(), W = this.world, R = this.run; let best = null, bd = 1e9;
    const consider = (o, pos, maxD, dot, type) => {
      const dx = pos.x - P.pos.x, dz = pos.z - P.pos.z, d = Math.hypot(dx, dz); if (d > maxD) return;
      const dt = d < 0.9 ? 1 : (dx * f.x + dz * f.z) / d; if (dt < dot) return;
      if (this.physics.blockedBetween(P.pos.x, P.pos.z, pos.x, pos.z, false) >= 99) return;
      const sc = d - dt * 1.2; if (sc < bd) { bd = sc; best = { o, type, d }; }
    };
    for (const d of W.doors) if (!d.opening && W.visible.has(d.link.a) || (!d.opening && W.visible.has(d.link.b))) consider(d, d.pos, 3.0, CFG.interact.facingDot, 'door');
    for (const l of W.lockers) if (!l.opened) consider(l, l.pos, 2.5, 0.6, 'locker');
    for (const t of W.terminals) if (!t.used) consider(t, t.pos, 2.5, 0.6, 'terminal');
    for (const g of W.generators) if (!g.spent) consider(g, g.pos, 2.9, CFG.generator.facingDot, 'generator');
    consider(W.pod, W.pod.pos, 3.2, 0.5, 'pod');
    return best;
  }
  keyName(a) { return this.input.isTouch ? 'USE' : (this.settings.keys[a] || 'E').replace('Key', '').replace('Digit', ''); }
  promptFor(t) {
    if (!t) return ''; const k = this.keyName('interact'), R = this.run;
    if (t.type === 'door') { const d = t.o; if (d.lock && !R.cards[d.lock]) return `LOCKED - ${d.lock.toUpperCase()} CARD NEEDED`; return d.hatch ? `[${k}] OPEN HATCH (LOUD)` : `[${k}] OPEN DOOR (${CFG.power.door} PWR)`; }
    if (t.type === 'locker') return `[${k}] OPEN LOCKER`; if (t.type === 'terminal') return `[${k}] READ TERMINAL (${CFG.power.terminal} PWR)`;
    if (t.type === 'generator') return `HOLD [${k}] TO CHARGE (${CFG.generator.holdSeconds}s)`; if (t.type === 'pod') return `[${k}] LAUNCH POD (${CFG.power.pod} PWR)`; return '';
  }
  interact(t) {
    const R = this.run, A = this.audio; if (!t) return;
    if (t.type === 'door') {
      const d = t.o;
      if (d.lock && !R.cards[d.lock]) { this.ui.msg(story.messages['locked_' + d.lock], 2800); A.play('terminal-beep', { bus: 'sfx', vol: 0.6, pos: d.pos, sub: false }); return; }
      if (d.hatch) { if (CFG.power.hatch > 0 && !this.usePower(CFG.power.hatch)) return; d.open(); this.addNoise(CFG.noise.hatch); A.play('hatch-open', { bus: 'sfx', vol: 1, pos: d.pos, send: 0.5 }); }
      else { if (!this.usePower(CFG.power.door)) return; d.open(); this.addNoise(CFG.noise.door); A.play('door-open', { bus: 'sfx', vol: 0.95, pos: d.pos, send: 0.5 }); }
    } else if (t.type === 'locker') {
      const l = t.o, c = l.open(); A.play('locker-open', { bus: 'sfx', vol: 0.8, pos: l.pos, send: 0.3 });
      if (c === 'red' || c === 'blue') { R.cards[c] = true; R.item = c; this.hands.setItem(c); this.ui.msg(`Found a ${c.toUpperCase()} keycard! Equipped.`, 4000); A.play('keycard', { bus: 'sfx', vol: 0.8, sub: false, delay: 0.4 }); this.world.updateDoorLights((k) => R.cards[k]); }
      else if (c === 'decoy') { R.decoys += 1; this.ui.msg('Found a noise decoy. (Select it with Q, throw with SPACE)', 4000); A.play('pickup', { bus: 'sfx', vol: 0.7, sub: false, delay: 0.4 }); }
      else this.ui.msg(story.messages.locker_empty, 3000);
    } else if (t.type === 'terminal') {
      const tm = t.o; if (!this.usePower(CFG.power.terminal)) return; this.addNoise(CFG.noise.terminal); this.openTerminal(tm);
    } else if (t.type === 'pod') {
      if (!R.cards.blue) { this.ui.msg(story.messages.pod_blue, 3000); return; }
      if (R.power < CFG.power.podMin) { this.ui.msg(story.messages.pod_power, 3000); return; }
      R.power -= CFG.power.pod; this.launchPod();
    }
  }
  openTerminal(tm) {
    this.terminalOpen = tm; const id = tm.id, s = story.terminals[id]; this.input.releaseLock(); this.audio.duck(0.35, 6, 2); this.audio.play('terminal-beep', { bus: 'ui', vol: 0.7, sub: false });
    this.ui.terminal(s, this.run.power, id === 'ana' ? [CFG.power.anaFree, 0] : id === 'chen' ? [CFG.power.chenSeal, 0] : [0, 0]); this.touch.show(false);
  }
  choose(i) {
    const tm = this.terminalOpen, R = this.run; if (!tm || tm.choosing) return; const id = tm.id;
    if (id === 'ana') { if (i === 0) { if (!this.usePower(CFG.power.anaFree)) return; R.crew.ana = true; } else R.power = Math.min(CFG.power.max, R.power + CFG.power.anaSiphon); }
    else if (id === 'bix') { if (i === 0) { R.noise = CFG.noise.bixDistress; R.bixHunt = 0.2; R.crew.bix = true; this.audio.play('monster-screech', { bus: 'monster', vol: 0.5, sub: false }); } }
    else if (id === 'chen') { if (i === 0) { if (!this.usePower(CFG.power.chenSeal)) return; R.crew.chen = true; } else R.power = Math.min(CFG.power.max, R.power + CFG.power.chenCut); }
    tm.choosing = true; R.read[id] = true; tm.setUsed(); this.audio.play('terminal-beep', { bus: 'ui', vol: 0.7, sub: false });
    this.ui.terminalResult(story.terminals[id].results[i]);
    setTimeout(() => { if (this.terminalOpen !== tm) return; this.terminalOpen = null; tm.choosing = false; if (this.state === 'playing') { this.ui.hideScreens(); this.touch.show(this.input.isTouch); this.lockAt = performance.now(); if (!this.input.isTouch) this.input.requestLock(); this.clock.getDelta(); } }, 2600);
  }
  launchPod() {
    const R = this.run; R.launchT = 0.001; this.state = 'launching'; this.adaptive.stop(1.5); this.audio.play('pod-launch', { bus: 'sfx', vol: 1, send: 0.2, sub: false }); this.ui.showHud(false); this.input.releaseLock();
    R.launchKind = R.read.ana && R.read.bix && R.read.chen && !R.flash ? 'quiet' : null;
  }
  // ------------------------------------------------------------------ endings
  finish(kind) {
    const R = this.run; if (!R || R.ended) return; R.ended = true; this.state = 'ended'; this.adaptive.stop(1.2); this.input.releaseLock(); this.input.enabled = false; this.ui.showHud(false); this.touch.show(false); this.terminalOpen = null;
    const crew = Object.values(R.crew).filter(Boolean).length; let key = kind;
    if (kind === 'pod') key = R.launchKind === 'quiet' ? 'quiet' : crew === 3 ? 'everyone' : crew > 0 ? 'some' : 'alone';
    const e = story.endings[key], win = ['everyone', 'some', 'alone', 'quiet'].includes(key); const tl = Math.max(0, R.timeLeft);
    const stats = [`CREW SAVED: ${crew}/3`, `POWER LEFT: ${Math.ceil(R.power)}`, `TIME LEFT: ${fmtTime(tl)}`, `SEED: ${R.seed}${R.hard ? '  (HARD)' : ''}`];
    const rec = this.save.records; rec.runs++; rec.endings[key] = (rec.endings[key] || 0) + 1; const rank = { quiet: 4, everyone: 3, some: 2, alone: 1 };
    if (win) { rec.wins++; if (tl > rec.bestTime) rec.bestTime = tl; if (!rec.bestEnding || (rank[key] || 0) > (rank[Object.keys(rank).find((k) => story.endings[k].title === rec.bestEnding)] || 0)) rec.bestEnding = e.title; if (rec.wins === 1) stats.push('POD COMPASS UNLOCKED (SETTINGS)'); }
    persist(this.save);
    if (API) fetch(API + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'player', outcome: key, crewSaved: crew, timeLeft: Math.round(tl), powerLeft: Math.round(R.power), seed: String(R.seed) }) }).catch(() => {});
    this.audio.play(win ? 'sting-win' : 'sting-lose', { bus: 'music', vol: 0.9, jitter: 0, sub: false });
    this.fx.u.uRed.value = 0; this.fx.u.uPurple.value = 0; this.hands.setFlashlight(true, 1);
    setTimeout(() => { this.ui.show('ending', { title: e.title, text: e.text, stats }); this.musicVoice = null; this.startMenuMusic(); if (API) fetch(API + '/api/leaderboard').then((r) => r.json()).then((lb) => { const el = this.ui.$('#lb'); if (el) el.innerHTML = '<div class="panel"><h3>LEADERBOARD</h3>' + lb.map((x, i) => `${i + 1}. ${String(x.name).slice(0, 12)} - ${x.crewSaved}/3 - ${fmtTime(x.timeLeft)}`).join('<br>') + '</div>'; }).catch(() => {}); }, win ? 2200 : 400);
  }
  // ------------------------------------------------------------------ main loop
  loop() {
    requestAnimationFrame(() => this.loop());
    let dt = Math.min(0.05, this.clock.getDelta()); this.t += dt; this.frames++; this.fpsAcc += dt; if (this.fpsAcc > 0.5) { this.fps = this.frames / this.fpsAcc; this.frames = 0; this.fpsAcc = 0; }
    const st = this.state;
    try {
      if (st === 'playing') this.updatePlaying(dt); else if (st === 'launching') this.updateLaunching(dt); else if (st === 'caught') this.updateCaught(dt); else if (st === 'menu' || st === 'ended' || st === 'starting' || st === 'loading') this.updateMenu(dt); else if (st === 'paused') { /* frozen */ }
      if (st !== 'paused') this.fx.render(); else this.fx.render();
    } catch (e) { console.error('frame error', e); }
  }
  simulate(sec, step = 1 / 30) { const n = Math.round(sec / step); for (let i = 0; i < n && this.state === 'playing'; i++) { this.t += step; this.updatePlaying(step); } }
  updateMenu(dt) {
    if (!this.world) return; this.menuYaw += dt * 0.05; const L = this.level, p = { x: (L.start.tx + 0.5) * 2, z: (L.start.ty + 0.5) * 2 };
    this.camera.position.set(p.x, 1.7 + Math.sin(this.t * 0.4) * 0.02, p.z); this.camera.rotation.set(Math.sin(this.t * 0.3) * 0.05 - 0.02, this.menuYaw, 0);
    this.world.updateVisibility(p.x, p.z); this.world.update(dt, this.t, { px: p.x, pz: p.z }); this.updateLights(dt, p, null, 1);
    const cd = this.camera.getWorldDirection(new THREE.Vector3());
    this.fx.update(dt, this.camera.position, { on: true, flick: 1, fx: cd.x, fy: cd.y, fz: cd.z });
    this.hands.update(dt, { running: false, bobT: this.t, bobAmp: 0.01, turn: 0 }); this.fx.u.uPanic.value = 0; this.fx.u.uFlick.value = 1; this.fx.u.uPink.value = 0;
    this.spot.intensity = CFG.fx.flashlight.intensity * 0.6; this.beamMat_(1);
  }
  beamMat_(k) { this.fx.beamMat.uniforms.uI.value = 0.07 * k; this.fx.beam.visible = k > 0.01; }
  updateLights(dt, p, monster, flickK) {
    const W = this.world, srcs = []; for (const s of W.sources) if (W.visible.has(s.room)) { const dx = s.x - p.x, dz = s.z - p.z; s.d2 = dx * dx + dz * dz; srcs.push(s); }
    srcs.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], s = srcs[i]; if (!s) { l.intensity = 0; continue; }
      l.position.set(s.x, s.y, s.z); l.color.setHex(s.color); l.distance = s.dist;
      let k = 1; if (s.flick) k = s.flick.k ?? 1; if (s.gen) k = s.gen.spent ? 0 : s.gen.charging ? 2 : 0.8 + Math.sin(this.t * 2.4 + s.gen.ph) * 0.3;
      if (s.flick == null && !s.gen && s.color !== 0x40ff90) k *= 0.85 + Math.sin(this.t * 1.3 + s.x) * 0.15;
      l.intensity = s.base * k * flickK;
    }
  }
  updatePlaying(dt) {
    const R = this.run, P = this.player, W = this.world, A = this.audio, ui = this.ui, S = CFG, I = this.input; const lerp = (a, b, t) => a + (b - a) * t;
    R.elapsed += dt; R.timeLeft -= dt; const frozenUI = !!this.terminalOpen;
    // ---- stage escalation ----
    const si = stageFor(R.timeLeft);
    if (si !== R.stageIdx) { R.stageIdx = si; const sg = S.monster.stages[si]; if (sg.msg) ui.msg(sg.msg, 5000); A.play('stage-sting', { bus: 'music', vol: 0.8, sub: false }); ui.flash('#600', 0.35, 900); if (si === 2) { A.play('monster-howl', { bus: 'monster', vol: 1, send: 0.6 }); A.duck(0.35, 4, 3); } if (si === 3) A.duck(0.6, 2, 2); }
    // ---- look & move ----
    const [lx, ly] = I.consumeLook(); const sens = this.settings.sens; P.look(lx, ly, sens, this.settings.invert);
    P.yaw += I.turnKeys() * S.player.keyTurnSpeed * dt * sens; P.pitch = clamp(P.pitch + I.pitchKeys() * S.player.keyTurnSpeed * 0.7 * dt * sens * (this.settings.invert ? -1 : 1), -1.45, 1.45);
    const charging = !!R.charging; const axes = I.axes(); const frozen = frozenUI || charging;
    P.update(dt, axes, frozen);
    // footsteps & movement noise
    if (P.stepEvent) { const onCross = false; const type = P.running ? 'footrun' : ((Math.floor(P.pos.x / 2) * 7 + Math.floor(P.pos.z / 2) * 13) % 3 === 0 ? 'footstep-grate' : 'footstep-plate'); A.play(type, { bus: 'foot', vol: P.running ? 0.9 : 0.5, rate: P.stepSide ? 1.04 : 0.96, send: 0.35, sub: false }); }
    let nAdd = 0; if (P.moving) nAdd = P.running ? S.noise.run : S.noise.walk; else nAdd = S.noise.still;
    R.noise += nAdd * dt; if (!charging) R.noise -= S.noise.decay * dt; R.noise = clamp(R.noise, 0, S.noise.max);
    // ---- power: flashlight drain & power-out ----
    if (R.flash) R.power -= S.power.flashlightPerSec * dt;
    if (R.power <= 0) { R.power = 0; if (R.flash) { R.flash = false; A.play('flash-off', { bus: 'sfx', vol: 0.7, sub: false }); } if (!R.powerOutMsg) { R.powerOutMsg = true; ui.msg(story.messages.power_out, 5000); A.play('generator-down', { bus: 'sfx', vol: 0.8, sub: false }); }
      R.noise = Math.max(R.noise, S.noise.powerOutFloor); R.powerBeep -= dt; if (R.powerBeep <= 0) { R.powerBeep = 1; A.play('scanner-beep', { bus: 'sfx', vol: 0.8, send: 0.3, sub: false }); } } else R.powerOutMsg = false;
    if (R.power < S.power.lowPct && R.power > 0 && !R.lowMsg) { R.lowMsg = true; ui.msg('Power low. The lights are failing.', 3000); } if (R.power >= S.power.lowPct) R.lowMsg = false;
    // ---- darkness & health ----
    if (!R.flash) R.darkT += dt; else R.darkT = Math.max(0, R.darkT - dt * S.dark.recoverMult);
    if (R.darkT >= S.dark.warnAfter && !R.darkWarned) { R.darkWarned = true; ui.msg(story.messages.dark_warn, 4500); } if (R.darkT < S.dark.warnAfter - 5) R.darkWarned = false;
    R.draining = false; if (R.darkT >= S.dark.drainAfter) { R.draining = true; R.drainAcc += dt; if (R.drainAcc >= S.dark.drainEvery) { R.drainAcc -= S.dark.drainEvery; R.health = Math.max(0, R.health - S.dark.drainAmount); ui.flash('#400', 0.4, 600); } } else R.drainAcc = 0;
    if (R.health <= 0) { this.finish('dark'); return; }
    if (R.timeLeft <= 0) { this.finish('hull'); return; }
    // ---- interaction ----
    const T = frozenUI ? null : this.findTarget(); this.target = T; const pressed = this.interactPress; this.interactPress = false;
    if (!charging) {
      ui.prompt(frozenUI ? '' : this.promptFor(T)); if (pressed && T && !frozenUI) { if (T.type === 'generator') { /* hold handled below */ } else this.interact(T); }
      if (T && T.type === 'generator' && I.interactHeld && !frozenUI && !T.o.spent) { R.charging = T.o; R.chargeP = 0; T.o.charging = true; this.chargeVoice = A.play('generator-hum', { bus: 'sfx', vol: 1, loop: true, jitter: 0, send: 0.4, sub: false }); A.play('generator-charge', { bus: 'sfx', vol: 0.8, sub: false }); }
    } else {
      const g = R.charging, f = P.forward(), dx = g.wallPos.x - P.pos.x, dz = g.wallPos.z - P.pos.z, d = Math.hypot(dx, dz), dot = (dx * f.x + dz * f.z) / (d || 1);
      const ok = I.interactHeld && dot > S.generator.facingDot && d <= S.generator.maxDistance * TILE * 1.2 + 0.6;
      if (!ok) { this.cancelCharge(); } else {
        R.chargeP += dt / S.generator.holdSeconds; this.addNoise(S.noise.generatorPerSec * dt); ui.ring(R.chargeP); ui.prompt(''); if (this.chargeVoice) this.chargeVoice.src.playbackRate.value = 1 + R.chargeP * 0.6;
        if (R.chargeP >= 1) { const gen = R.charging; R.power = Math.min(S.power.max, R.power + R.genGain); gen.setSpent(); this.chargeVoice?.stop(0.3); this.chargeVoice = null; R.charging = null; ui.ring(null); A.play('generator-done', { bus: 'sfx', vol: 0.9, send: 0.4 }); ui.msg(`Generator charged. +${R.genGain} power. It goes dark: spent.`, 4000); A.duck(0.5, 1.5, 1.5); }
      }
    }
    // ---- scanner radar ----
    let radar = null; if (R.scanT > 0) { R.scanT -= dt; radar = this.radarData(); this.drawHudRadar(radar); if (R.scanT <= 0) { A.play('scanner-down', { bus: 'sfx', vol: 0.5, sub: false }); ui.radar().classList.add('bs-hide'); } } else ui.radar().classList.add('bs-hide');
    // ---- thrown decoys ----
    this.updateThrown(dt);
    // ---- monster ----
    const M = this.ai, mm = this.monsterModel; const wasHunt = this.prevHunt;
    const caught = M.update(dt, { px: P.pos.x, pz: P.pos.z, noise: R.noise, light: R.flash, timeLeft: R.timeLeft, powerOut: R.power <= 0, bixHunt: R.bixHunt > 0 }); if (R.bixHunt > 0) R.bixHunt = 0;
    const mdistT = Math.hypot(M.x - P.pos.x, M.z - P.pos.z) / 2;
    mm.root.position.set(M.x, 0, M.z); mm.root.rotation.y = M.yaw + Math.PI;
    mm.animate(dt, { speed: M.speed, hunting: M.hunting, mode: M.mode, dist: mdistT * 2 });
    const mroom = W.roomAtPos(M.x, M.z); mm.root.visible = W.visible.has(mroom) || mroom < 0 || mdistT < 14;
    for (const d of W.doors) if (!d.opening && Math.hypot(d.pos.x - M.x, d.pos.z - M.z) < 2.6) { d.open(); A.play(d.hatch ? 'hatch-open' : 'door-open', { bus: 'sfx', vol: 0.9, pos: d.pos, send: 0.5 }); }
    if (M.hunting && !wasHunt) { A.play(mdistT < 14 ? 'monster-screech' : 'monster-growl', { bus: 'monster', vol: 0.95, pos: { x: M.x, y: 1.8, z: M.z }, follow: () => ({ x: M.x, y: 1.8, z: M.z }) }); A.duck(0.5, 1.8, 1.5); }
    this.prevHunt = M.hunting;
    R.monStepT -= dt; if (M.speed > 0.3 && R.monStepT <= 0 && mdistT < 22) { R.monStepT = M.speed > 5 ? 0.3 : 0.62; A.play('footstep-plate', { bus: 'monster', vol: mdistT < 8 ? 0.9 : 0.55, rate: 0.62, pos: { x: M.x, y: 0.2, z: M.z }, send: 0.5, sub: false }); }
    R.rasp = (R.rasp || 0) - dt; if (mdistT < 7 && R.rasp <= 0) { R.rasp = 4 + Math.random() * 3; A.play('monster-rasp', { bus: 'monster', vol: 0.7, pos: { x: M.x, y: 2, z: M.z }, follow: () => ({ x: M.x, y: 2, z: M.z }) }); }
    R.shriekT = (R.shriekT || 0) - dt; if (M.hunting && mdistT < 20 && R.shriekT <= 0) { R.shriekT = 4.5 + Math.random() * 3; A.play(Math.random() < 0.5 ? 'monster-screech' : 'monster-growl', { bus: 'monster', vol: 0.9, pos: { x: M.x, y: 2, z: M.z }, follow: () => ({ x: M.x, y: 2, z: M.z }) }); }
    if (caught) { this.beginCaught(); return; }
    // ---- panic / shake ----
    const chase = M.hunting && mdistT < S.monster.chaseMusicTiles; R.panic = lerp(R.panic, chase ? 1 - mdistT / 20 : 0, Math.min(1, dt * (chase ? 3 : 0.8)));
    const near = Math.max(0, 1 - mdistT / 9); const shakeAmp = (near * 0.012 + R.panic * 0.01 + (R.draining ? 0.004 : 0)) * this.settings.shake;
    // ---- camera ----
    const cam = this.camera, br = Math.sin(this.t * 1.5) * 0.004 * (1 + R.panic * 2.5);
    const sx = (Math.random() - 0.5) * shakeAmp * 2, sy = (Math.random() - 0.5) * shakeAmp * 2;
    const rr = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    cam.position.set(P.pos.x + (-Math.sin(P.yaw + Math.PI / 2)) * P.sideBob * 0.0 + sx, P.eyeY + br + sy, P.pos.z + sy * 0.3); cam.position.x += rr * P.sideBob * 0.3; cam.position.z += rz * P.sideBob * 0.3;
    cam.rotation.set(P.pitch + sy * 0.4 + Math.sin(this.t * 0.9) * 0.002 * (1 + R.panic * 3), P.yaw + sx * 0.4, P.roll * 0.5 + Math.sin(this.t * 1.1) * 0.003 * (1 + R.panic * 3) + sx * 0.6);
    // ---- flashlight, flicker, low power ----
    const lowK = R.power < S.power.lowPct ? 1 - R.power / S.power.lowPct : 0; const flick = R.flash ? (lowK > 0 && Math.random() < 0.06 + lowK * 0.2 ? 0.15 + Math.random() * 0.5 : 1) : 0; R.lightK = lerp(R.lightK, flick, 0.6);
    this.spot.intensity = S.fx.flashlight.intensity * R.lightK; this.hands.setFlashlight(R.flash, R.lightK); this.beamMat_(R.lightK);
    this.hemi.intensity = lerp(this.hemi.intensity, R.flash ? 0.3 : 0.06, Math.min(1, dt * 4));
    // ---- world ----
    W.updateVisibility(P.pos.x, P.pos.z); const nearLocker = W.lockers.some((l) => !l.opened && Math.hypot(l.pos.x - P.pos.x, l.pos.z - P.pos.z) < 10);
    W.update(dt, this.t, { px: P.pos.x, pz: P.pos.z, nearLocker });
    const monsterFlick = mdistT < 7 ? (Math.random() < (1 - mdistT / 7) * 0.5 ? 0.1 : 1) : 1; const lightsK = monsterFlick * (R.power <= 0 ? 0.55 : 1);
    this.updateLights(dt, P.pos, M, lightsK);
    this.emitters(dt, P);
    this.audio.setRoomReverbMaybe?.(); const proom = W.playerRoom; if (proom >= 0 && proom !== this.lastRoom) { this.lastRoom = proom; A.setRoomReverb(this.level.rooms[proom]); }
    // ---- effects uniforms ----
    const u = this.fx.u, wantPink = nearLocker ? 0.8 + Math.sin(this.t * 3) * 0.2 : 0; u.uPink.value = lerp(u.uPink.value, wantPink * (nearLocker ? 1 : 0), Math.min(1, dt * 3));
    u.uPanic.value = R.panic; u.uFocus.value = R.panic * 1.2; u.uVig.value = clamp((R.darkT - 20) / 80, 0, 0.45) + (R.health < 40 ? 0.15 : 0);
    u.uFlick.value = lowK > 0 && Math.random() < lowK * 0.2 ? 0.7 : 1; u.uGlitch.value = M.hunting && mdistT < 8 && Math.random() < 0.1 ? 0.6 : 0; u.uSat.value = R.draining ? 0.5 : 1; u.uRed.value *= 0.9; u.uPurple.value *= 0.9;
    // ---- hands & fx ----
    const cd = cam.getWorldDirection(new THREE.Vector3()); const lastYaw = this.lastYaw ?? P.yaw; const turn = clamp(((P.yaw - lastYaw) / Math.max(dt, 0.001)) * 0.05, -0.5, 0.5); this.lastYaw = P.yaw; this.turnS = lerp(this.turnS || 0, turn, 0.2);
    this.hands.update(dt, { running: P.running, bobT: P.bobT, bobAmp: P.bobAmp + R.panic * 0.01, turn: this.turnS, radar });
    this.fx.update(dt, cam.position, { on: R.flash, flick: R.lightK, fx: cd.x, fy: cd.y, fz: cd.z });
    // ---- audio ----
    A.update(dt, { x: P.pos.x, y: P.eyeY, z: P.pos.z, yaw: P.yaw });
    const hunts = M.hunting;
    this.adaptive.update(dt, { stage: R.stageIdx, timeLeft: R.timeLeft, mdist: mdistT, hunting: hunts, powerPct: R.power, power: R.power, darkT: R.darkT, draining: R.draining, caught: false, monsterPos: { x: M.x, z: M.z }, playerPos: P.pos, running: P.running, afraid: R.panic > 0.2 || mdistT < 12 });
    this.nearGen(dt, P);
    // ---- HUD ----
    ui.bars(R.health, R.power, R.noise, R.timeLeft, S.run.length);
    ui.status(`LIGHT ${R.flash ? 'ON' : 'OFF'} | HAND: ${R.item === 'blue' ? 'BLUE CARD' : R.item === 'red' ? 'RED CARD' : R.item.toUpperCase()} | KEYS: ${R.cards.red ? 'RED ' : ''}${R.cards.blue ? 'BLUE' : ''}${!R.cards.red && !R.cards.blue ? 'NONE' : ''} | DECOYS: ${R.decoys}`);
    if (!R.charging) ui.ring(null);
    if (this.settings.compass && this.save.records.wins > 0) { const pw = W.pod.wall, dx = pw.x - P.pos.x, dz = pw.z - P.pos.z, a = Math.atan2(-dx, -dz) - P.yaw; let d = ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; ui.compass(`POD ${Math.round(Math.hypot(dx, dz) / 2)} TILES ${Math.abs(d) < 0.5 ? '^' : d > 0 ? '<<' : '>>'}`); } else ui.compass(null);
    if (this.showDebug) ui.debug(this.debugText(mdistT)); if (this.showAudioDebug) ui.adebug('AUDIO\n' + A.debugList().slice(0, 24).join('\n'));
    this.R = R;
  }
  cancelCharge() {
    const R = this.run; if (!R.charging) return; R.charging.charging = false; R.charging = null; R.chargeP = 0; this.chargeVoice?.stop(0.1); this.chargeVoice = null; this.ui.ring(null); this.audio.play('generator-down', { bus: 'sfx', vol: 0.6, sub: false }); this.ui.msg('Charging interrupted.', 2000);
  }
  radarData() {
    const P = this.player, f = P.forward(), r = { x: -f.z, z: f.x }, range = CFG.scanner.radiusTiles * 2, dots = [];
    const add = (x, z, kind) => { const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz); if (d > range) return; dots.push({ kind, x: (dx * r.x + dz * r.z) / range, y: -(dx * f.x + dz * f.z) / range }); };
    for (const l of this.world.lockers) if (!l.opened) add(l.pos.x, l.pos.z, 'locker'); add(this.ai.x, this.ai.z, 'monster'); return { dots };
  }
  drawHudRadar(data) {
    const cv = this.ui.radar(); cv.classList.remove('bs-hide'); const c = cv.getContext('2d'); c.clearRect(0, 0, 150, 150); c.fillStyle = 'rgba(2,16,8,.85)'; c.fillRect(0, 0, 150, 150); c.strokeStyle = '#1fe060'; c.lineWidth = 1;
    for (const r of [25, 50, 72]) { c.beginPath(); c.arc(75, 75, r, 0, 6.3); c.stroke(); } c.beginPath(); c.moveTo(75, 3); c.lineTo(75, 147); c.moveTo(3, 75); c.lineTo(147, 75); c.globalAlpha = 0.4; c.stroke(); c.globalAlpha = 1;
    const a = this.t * 5; c.strokeStyle = '#7dffa8'; c.beginPath(); c.moveTo(75, 75); c.lineTo(75 + Math.cos(a) * 72, 75 + Math.sin(a) * 72); c.stroke();
    for (const d of data.dots) { c.fillStyle = d.kind === 'monster' ? '#ff2020' : '#ff40c0'; c.beginPath(); c.arc(75 + d.x * 72, 75 + d.y * 72, d.kind === 'monster' ? 6 : 4, 0, 6.3); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(75, 75, 3, 0, 6.3); c.fill();
  }
  updateThrown(dt) {
    const g = CFG.decoy.gravity;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]; t.vy -= g * dt; const nx = t.x + t.vx * dt, nz = t.z + t.vz * dt, ny = t.y + t.vy * dt;
      const tile = this.level.tiles[Math.floor(nz / 2) * this.level.W + Math.floor(nx / 2)];
      if (tile === 1 || tile === 2 || (tile === 3 && this.physics.doorAt.get(Math.floor(nz / 2) * this.level.W + Math.floor(nx / 2))?.blocking())) { t.vx *= -0.3; t.vz *= -0.3; } else { t.x = nx; t.z = nz; }
      t.y = ny; if (t.y < 3 && t.y > 2.9) t.vy = -Math.abs(t.vy) * 0.3;
      t.m.position.set(t.x, Math.max(0.08, t.y), t.z); t.m.rotation.x += t.spin * dt; t.m.rotation.z += t.spin * 0.6 * dt;
      if (t.y <= 0.08) { t.y = 0.08; if (t.bounces === 0) { this.audio.play('decoy-clatter', { bus: 'sfx', vol: 1, pos: { x: t.x, y: 0.2, z: t.z }, send: 0.5 }); this.ai.decoy(t.x, t.z); this.fx.burstSpark(t.x, 0.2, t.z); this.ui.msg('Decoy clatters away...', 1800); } t.bounces++; t.vy = Math.abs(t.vy) * 0.35; t.vx *= 0.6; t.vz *= 0.6; if (t.bounces > 3) { this.scene.remove(t.m); this.thrown.splice(i, 1); } }
    }
  }
  emitters(dt, P) {
    const W = this.world, A = this.audio, em = W.emitters;
    for (const e of em.steam) if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 18) { e.ph -= dt; if (e.ph <= 0) { e.ph = 0.16; this.fx.puffSteam(e.x, e.y, e.z); } if (!e.snd || this.t - e.snd > 5) { e.snd = this.t; A.play('steam', { bus: 'sfx', vol: 0.35, pos: { x: e.x, y: e.y, z: e.z }, sub: false }); } }
    for (const e of em.spark) if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 20) { e.next -= dt; if (e.next <= 0) { e.next = 3 + Math.random() * 7; this.fx.burstSpark(e.x, e.y, e.z); A.play('spark', { bus: 'sfx', vol: 0.5, pos: { x: e.x, y: e.y, z: e.z }, send: 0.3 }); } }
    for (const e of em.drip) if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 14) { e.next -= dt; if (e.next <= 0) { e.next = 2 + Math.random() * 5; A.play('drip', { bus: 'sfx', vol: 0.45, pos: { x: e.x, y: 0.1, z: e.z }, sub: false }); } }
  }
  nearGen(dt, P) { // subtle positional hum from the nearest unspent generator
    const A = this.audio; let best = null, bd = 18; for (const g of this.world.generators) if (!g.spent) { const d = Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z); if (d < bd) { bd = d; best = g; } }
    if (best && !this.run.charging) { if (!this.genHum || this.genHum.dead) this.genHum = A.play('generator-hum', { bus: 'ambience', vol: 0.0, loop: true, jitter: 0, pos: { x: best.pos.x, y: 1.4, z: best.pos.z }, send: 0.2, sub: false }); if (this.genHum) { this.genHum.pos = { x: best.pos.x, y: 1.4, z: best.pos.z }; A.setPos(this.genHum.panner, this.genHum.pos); this.genHum.setVol(0.35 * (1 - bd / 18), 0.3); } }
    else if (this.genHum) { this.genHum.stop(0.5); this.genHum = null; }
  }
  // ------------------------------------------------------------------ caught / launch
  beginCaught() {
    const R = this.run, P = this.player, M = this.ai, mm = this.monsterModel; this.state = 'caught'; R.caughtT = 0; this.ui.showHud(false); this.terminalOpen = null; this.touch.show(false); this.input.releaseLock();
    this.adaptive.stop(0.3); this.audio.stopAll(0.15); this.audio.duck(0.1, 4, 1, ['music', 'ambience']);
    const f = P.forward(); mm.root.position.set(P.pos.x + f.x * 1.1, 0, P.pos.z + f.z * 1.1); mm.root.rotation.y = Math.atan2(-f.x, -f.z); mm.root.visible = true; this.caughtF = f;
    this.audio.play('monster-lunge', { bus: 'monster', vol: 1, send: 0.1, sub: false }); setTimeout(() => this.audio.play('monster-caught', { bus: 'monster', vol: 1.25, send: 0.15 }), 180);
    this.caughtLight = new THREE.PointLight(0xa070ff, 12, 6, 2); this.scene.add(this.caughtLight); this.fx.u.uFocus.value = 0;
  }
  updateCaught(dt) {
    const R = this.run, mm = this.monsterModel, P = this.player; R.caughtT += dt; const f = this.caughtF;
    mm.animate(dt, { speed: 0, hunting: true, mode: 'caught', dist: 0.5 }); const head = new THREE.Vector3(mm.root.position.x, 2.45, mm.root.position.z);
    const k = Math.min(1, R.caughtT / 0.25), dist = 0.62 - Math.min(0.14, R.caughtT * 0.07);
    this.camera.position.set(head.x - f.x * dist + (Math.random() - 0.5) * 0.04, head.y + 0.02 + (Math.random() - 0.5) * 0.04, head.z - f.z * dist + (Math.random() - 0.5) * 0.04);
    this.camera.lookAt(head.x, head.y + 0.08, head.z); this.camera.rotation.z += (Math.random() - 0.5) * 0.06; this.caughtLight.position.copy(this.camera.position).add(new THREE.Vector3(0, 0.15, 0));
    const flick = Math.sin(R.caughtT * 40) > 0; this.fx.u.uRed.value = flick ? 0.9 : 0.1; this.fx.u.uPurple.value = flick ? 0.2 : 1.1; this.fx.u.uGlitch.value = 0.8; this.fx.u.uPanic.value = 0.6 + k * 0.4;
    this.spot.intensity = 0; this.hands.cam.visible = false; this.hands.scene.visible = false;
    this.world.updateVisibility(P.pos.x, P.pos.z); this.world.update(dt, this.t, { px: P.pos.x, pz: P.pos.z }); this.audio.update(dt, { x: this.camera.position.x, y: 1.7, z: this.camera.position.z, yaw: P.yaw });
    this.fx.update(dt, this.camera.position, { on: false, flick: 0, fx: 0, fy: 0, fz: -1 }); this.beamMat_(0);
    if (R.caughtT > 2.7) { this.scene.remove(this.caughtLight); this.hands.scene.visible = true; this.camera.rotation.order = 'YXZ'; this.finish('caught'); }
  }
  updateLaunching(dt) {
    const R = this.run; R.launchT += dt; const P = this.player, u = this.fx.u; const k = R.launchT / 3.6;
    const sh = Math.min(1, k * 2) * 0.03; this.camera.position.set(P.pos.x + (Math.random() - 0.5) * sh, P.eyeY + (Math.random() - 0.5) * sh, P.pos.z); u.uFlick.value = 1 + Math.max(0, k - 0.6) * 4; u.uPanic.value = 0;
    this.world.updateVisibility(P.pos.x, P.pos.z); this.world.update(dt, this.t, { px: P.pos.x, pz: P.pos.z }); this.audio.update(dt, { x: P.pos.x, y: 1.7, z: P.pos.z, yaw: P.yaw });
    this.hands.update(dt, { running: false, bobT: this.t, bobAmp: 0, turn: 0 }); this.fx.update(dt, this.camera.position, { on: false, flick: 0, fx: 0, fy: 0, fz: -1 });
    if (R.launchT > 4.2) { u.uFlick.value = 1; this.finish('pod'); }
  }
  debugText(md) {
    const M = this.ai, P = this.player, R = this.run, r = this.renderer.info.render;
    return `FPS ${this.fps.toFixed(0)}  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k  Q:${this.qName}\nSEED ${R.seed} (attempts ${this.level.attempts})  flip ${this.level.flip.x ? 'X' : ''}${this.level.flip.y ? 'Y' : ''}\nSTAGE ${CFG.monster.stages[R.stageIdx].id}  timeLeft ${R.timeLeft.toFixed(0)}\nMONSTER ${M.state} (${(M.x / 2).toFixed(1)},${(M.z / 2).toFixed(1)}) spd ${(M.speed / 2).toFixed(2)} dist ${md.toFixed(1)}t head ${M.headT.toFixed(0)} hunt ${M.huntT.toFixed(1)}\nPLAYER tile (${P.tx},${P.tz}) room ${this.world.playerRoom} spd ${(P.speed / 2).toFixed(2)}\nNOISE ${R.noise.toFixed(0)} POWER ${R.power.toFixed(1)} HP ${R.health} DARK ${R.darkT.toFixed(0)}\nVISIBLE ROOMS ${this.world.visible.size}`;
  }
}

export function startGame(container) { const g = new Game(container); window.__bs = g; g.init().catch((e) => console.error('init failed', e)); return g; }
