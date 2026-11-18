// Main game controller for Blackout Station: Halcyon Deep (Prompts 1 to 5):
// - Level generator & Wall Edge Ledger + F3 3D debug overlay (room bounds, door positions, culling set, template ID & fingerprint)
// - Oil rig world, 15 room types, 10 door styles, unique Helideck Escape Gate, stormy Helideck & rescue helicopter, supply chests & food
// - SCP-096 style deep-sea creature, 6-state AI, 30 Hz 6-condition face-seen test, 4 difficulties, F4 AI & audio debug overlay, Monster Sandbox
// - 3-variant sudden jump scare (FOV punch 72->105°, 3 inversion flash frames, layered scream + 40Hz sub + 4kHz tinnitus, safety toggles)
// - Positional HRTF audio, grid propagation/occlusion, doorway virtual routing, room tones, thunder delay, wave swells, 8-bearing HRTF test
// - Story Bible, 4 Crew Rescues (Ana pry bar + stim, Bix patch puzzle, Chen 3-valve sequence, Dara 10s quiet wait), 16 logs, Journal (J), Locket & Endings
import * as THREE from 'three';
import { CFG, TILE, stageFor } from './config.js';
import story from './story.json' with { type: 'json' };
import crewData from './crew.json' with { type: 'json' };
import endingsData from './endings.json' with { type: 'json' };
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
// Right-hand cycle order (Prompt 2 Section 8 & Prompt 5 Section 2.1): scanner, decoy, food, pry_bar, locket, blue card, red card
const ITEMS = ['scanner', 'decoy', 'food', 'pry_bar', 'locket', 'blue', 'red'];
const API = import.meta.env?.VITE_API_URL || '';

export class Game {
  constructor(container) {
    this.container = container;
    this.save = loadSave();
    this.settings = this.save.settings;
    this.state = 'loading';
    this.clock = {
      last: performance.now(),
      getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; },
    };
    this.fps = 60; this.fpsAcc = 0; this.frames = 0;
    this.showDebug = false; this.showAudioDebug = false;
    this.t = 0; this.world = null; this.interactPress = false;
    this.lastScareVariant = -1;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
  }

  // ------------------------------------------------------------------ init
  async init() {
    const root = this.root = document.createElement('div');
    root.id = 'bs-root';
    this.container.appendChild(root);
    if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) root.classList.add('touch');
    const canvas = document.createElement('canvas');
    canvas.className = 'bs-canvas';
    root.appendChild(canvas);

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x020408);

    this.qName = this.settings.quality === 'auto' ? autoQuality() : this.settings.quality;
    const urlQ = new URLSearchParams(location.search).get('q');
    if (urlQ && CFG.quality[urlQ]) this.qName = urlQ;
    this.q = CFG.quality[this.qName];

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x04070d, CFG.fx.fogDensity);
    this.scene.background = new THREE.Color(0x020408);

    // Prompt 1 Bug A Item 5: near = 0.05 and far = 160 matching platform level size
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0x7890a8, 0x141820, 0.3);
    this.scene.add(this.hemi);
    this.spot = new THREE.SpotLight(CFG.fx.flashlight.color, CFG.fx.flashlight.intensity, CFG.fx.flashlight.distance, CFG.fx.flashlight.angle, CFG.fx.flashlight.penumbra, CFG.fx.flashlight.decay);
    this.spot.position.set(-0.2, -0.13, -0.28);
    this.spot.target.position.set(-0.1, 0, -10);
    this.camera.add(this.spot, this.spot.target);

    this.hands = new Hands();
    this.audio = new AudioEngine(this.settings);
    this.adaptive = new Adaptive(this.audio);
    this.adaptive.onWaveHit = () => {
      if (this.run && !this.settings.reduceMotion) this.run.waveSway = 1.0;
    };
    this.audio.onSub = (t) => this.ui.sub(t);
    this.input = new Input(canvas, this.settings);
    this.input.isTouch = root.classList.contains('touch');

    this.ui = new UI(root, {
      save: this.save,
      settings: this.settings,
      input: this.input,
      seedInput: '',
      sfx: (n) => this.audio.play(n, { bus: 'ui', vol: 0.5, send: 0, sub: false, jitter: 0.03 }),
      fullscreen: () => this.toggleFullscreen(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      quit: () => this.quit(),
      play: (seed) => this.startRun(seed),
      choose: (i) => this.choose(i),
      getSeed: () => this.run?.seed || this.menuSeed,
      applySettings: (q) => this.applySettings(q),
      toggleJournal: () => this.toggleJournal(),
      openJournal: (from) => this.openJournal(from),
      closeModal: () => this.closeModal(),
      startAudioTest: () => this.startAudioTest(),
      playAudioTestBearing: () => this.playAudioTestBearing(),
      guessAudioTestBearing: (idx) => this.guessAudioTestBearing(idx),
      startSandbox: () => this.startSandbox(),
      setSandboxClip: (clip) => this.setSandboxClip(clip),
      rotateSandboxMonster: () => this.rotateSandboxMonster(),
      triggerSandboxJumpScare: () => this.triggerSandboxJumpScare(),
    });
    this.touch = setupTouch(root, this.input);
    this.bindInput();
    this.applyQuality();
    this.resize();

    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    document.addEventListener('fullscreenchange', () => this.resize());
    canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.terminalOpen && !this.modalOpen) this.input.requestLock(); });

    const unlock = async () => {
      await this.audio.init();
      this.audio.applyVolumes();
      this.startMenuMusic();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) =>
      addEventListener(e, () => { if (!this.audioUnlocked) { this.audioUnlocked = true; unlock(); } }, { passive: true })
    );

    this.ui.show('loading');
    await new Promise((res) => requestAnimationFrame(res));
    this.ui.setLoad(0.05, 'Generating offshore PBR materials...');
    await new Promise((res) => setTimeout(res, 30));
    this.tex = buildTextures(r, this.q.tex, story.notes);
    this.ui.setLoad(0.3, 'Rendering positional sound bank...');
    await this.audio.buildBank((p) => this.ui.setLoad(0.3 + p * 0.55, 'Rendering positional sound bank...'));
    this.ui.setLoad(0.9, 'Building Halcyon Deep...');
    await new Promise((res) => setTimeout(res, 30));
    this.menuSeed = randomSeedString();
    this.buildWorld(this.menuSeed);
    this.ui.setLoad(1, 'Ready');
    this.state = 'menu';
    this.ui.show('title');
    this.ui.muteIcon(this.settings.mute);
    this.menuYaw = this.level.start.yaw;

    const sp = new URLSearchParams(location.search);
    if (sp.get('diff') && CFG.difficulties[sp.get('diff')]) this.settings.difficulty = sp.get('diff');
    if (sp.get('autostart')) setTimeout(() => this.startRun(sp.get('seed') || ''), 300);
    this.loop();
  }

  startMenuMusic() {
    if (this.state === 'menu' || this.state === 'ended') {
      this.musicVoice ||= this.audio.play('menu_music', { bus: 'music', vol: 0.85, loop: true, jitter: 0, send: 0.1, fade: 3, sub: false });
    }
  }
  stopMenuMusic(fade = 1.5) { this.musicVoice?.stop(fade); this.musicVoice = null; }

  // ------------------------------------------------------------------ settings / quality / resize
  applySettings(qualityChanged) {
    this.audio.s = this.settings;
    this.audio.applyVolumes();
    this.ui.muteIcon(this.settings.mute);
    this.fx.u.uCB.value = this.settings.colorblind ? 1 : 0;
    if (this.ai) this.ai.setDifficulty(this.settings.difficulty || (this.settings.hard ? 'hard' : 'medium'));
    persist(this.save);
    if (qualityChanged) {
      this.qName = this.settings.quality === 'auto' ? autoQuality() : this.settings.quality;
      this.q = CFG.quality[this.qName];
      this.applyQuality();
    }
  }
  applyQuality() {
    const r = this.renderer, q = this.q;
    this.q = q;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    this.spot.castShadow = q.shadows;
    this.spot.shadow.mapSize.set(q.shadow, q.shadow);
    this.spot.shadow.camera.near = 0.15;
    this.spot.shadow.camera.far = 30;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.03;
    this.spot.shadow.radius = 3;
    if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
    if (this.pool) this.pool.forEach((l) => this.scene.remove(l));
    this.pool = [];
    for (let i = 0; i < q.pointLights; i++) {
      const l = new THREE.PointLight(0xff7a22, 0, 16, 2);
      this.scene.add(l);
      this.pool.push(l);
    }
    if (this.fx) this.fx.dispose();
    this.fx = new Effects(r, this.scene, this.camera, this.hands, q);
    this.resize();
    if (this.ui) this.fx.u.uCB.value = this.settings.colorblind ? 1 : 0;
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.fx?.resize(w * pr, h * pr);
    this.fx?.composer.setPixelRatio(1);
  }
  toggleFullscreen(force) {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const e = this.root;
      (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e)?.catch?.(() => {});
    } else if (!force) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const i = this.input;
    i.on('light', () => this.toggleLight());
    i.on('swap', () => this.cycleItem());
    i.on('use', () => this.useItem());
    i.on('interactDown', () => { this.interactPress = true; });
    i.on('journal', () => this.toggleJournal());
    i.on('choice', (n) => {
      if (this.terminalOpen) this.choose(n);
      else if (this.modalOpen === 'crew') this.ui.onCrewDecision?.(n);
    });
    i.on('pause', () => {
      if (this.modalOpen) { this.closeModal(); return; }
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
    i.on('debug', () => {
      this.showDebug = !this.showDebug;
      this.world?.setDebugVisible(this.showDebug);
      if (!this.showDebug) this.ui.debug(null);
    });
    i.on('audiodebug', () => {
      this.showAudioDebug = !this.showAudioDebug;
      if (!this.showAudioDebug) this.ui.adebug(null);
    });
    i.on('fullscreen', () => this.toggleFullscreen());
    i.on('lockchange', (locked) => {
      if (!locked && this.state === 'playing' && !this.terminalOpen && !this.modalOpen && !this.input.dragFallback && performance.now() - (this.lockAt || 0) > 400) {
        this.pause();
      }
    });
  }

  // ------------------------------------------------------------------ world / run setup
  buildWorld(seed) {
    if (this.world) { this.world.dispose(); this.scene.remove(this.world.root); }
    if (this.monsterModel) { this.scene.remove(this.monsterModel.root); this.monsterModel = null; }
    this.level = generateLevel(seed);
    this.physics = new Physics(this.level);
    this.world = new World(this.level, this.tex, this.renderer, this.q, {
      onLightning: (t, distMeters) => {
        if (this.state === 'playing') {
          this.audio.scheduleThunder(distMeters);
          if (!this.settings.reduceFlashing) this.ui.flash('#cfe8ff', 0.22, 260);
        }
      },
    });
    this.world.setDebugVisible(this.showDebug);
    this.scene.add(this.world.root);
    for (const d of this.world.doors) this.physics.registerDoor(d);
    this.audio.phys = this.physics;
    this.audio.level = this.level;
    this.currentSeed = seed;
    for (const m of this.world.shadowMeshes) m.castShadow = this.q.shadows;
  }

  async startRun(seedIn) {
    if (this.state === 'starting') return;
    this.state = 'starting';
    this.ui.show('loading');
    this.ui.setLoad(0.2, 'Generating Halcyon Deep...');
    await new Promise((r) => setTimeout(r, 40));
    await this.audio.init();
    this.audio.applyVolumes();
    this.audioUnlocked = true;
    const seed = (seedIn || '').trim() || this.menuSeed;
    if (seed !== this.currentSeed || this.ranOnce) { this.buildWorld(seed); }
    this.menuSeed = randomSeedString();
    this.ui.setLoad(0.9, 'Waking the deep...');
    await new Promise((r) => setTimeout(r, 30));

    const L = this.level;
    const diffKey = this.settings.difficulty || (this.settings.hard ? 'hard' : 'medium');
    const hard = diffKey === 'hard' || diffKey === 'extreme' || !!this.settings.hard;
    const H = CFG.hard;
    this.run = {
      seed,
      difficulty: diffKey,
      hard,
      timeLeft: CFG.run.length,
      health: CFG.start.health,
      power: hard ? H.startPower : CFG.start.power,
      noise: 0,
      decoys: CFG.start.decoys,
      foodList: ['ration'], // Start with 1 ration bar
      hasPryBar: false,
      hasStimulant: false,
      hasLocket: false,
      locketPlaced: false,
      helideckRevealed: false,
      quietBonusTimer: 0,
      flash: CFG.start.flashlightOn,
      item: 'scanner',
      cards: { red: false, blue: false },
      darkT: 0,
      drainAcc: 0,
      darkWarned: false,
      crew: { ana: false, bix: false, chen: false, dara: false },
      crewState: { ana: 'unmet', bix: 'unmet', chen: 'unmet', dara: 'unmet' },
      read: { ana: false, bix: false, chen: false },
      foundLogs: [],
      clues: [],
      scanT: 0,
      bixHunt: 0,
      charging: null,
      chargeP: 0,
      holdAction: null,
      holdP: 0,
      eatingP: 0,
      stageIdx: 0,
      elapsed: 0,
      powerBeep: 0,
      powerOutMsg: false,
      caughtT: 0,
      launchT: 0,
      ended: false,
      lightK: 1,
      panic: 0,
      shake: 0,
      waveSway: 0,
      recentlyChasedT: 0,
      genGain: hard ? H.generatorGain : CFG.generator.powerGain,
      hasMovedT: 0,
      stepT: 0,
      monStepT: 0,
      rng: new RNG(hashSeed('run' + seed)),
      lowMsg: false,
    };
    this.ranOnce = true;
    this.player = new Player(L, this.physics);
    this.target = null;
    this.monsterModel = new Monster();
    this.monsterModel.root.traverse((o) => { if (o.isMesh) o.castShadow = this.q.shadows; });
    this.scene.add(this.monsterModel.root);
    this.ai = new MonsterAI(L, this.physics, diffKey, this.run.rng);

    this.thrown = [];
    this.world.lockers.forEach((l) => l.opened && (l.opened = false));
    this.prevHunt = false;
    this.terminalOpen = null;
    this.modalOpen = null;
    this.hands.setItem('scanner');
    this.hands.cur = 'scanner';
    this.hands.setFlashlight(true, 1);
    this.world.updateDoorLights((k) => this.run.cards[k]);
    this.stopMenuMusic(2);
    this.adaptive.stop(0.2);
    this.adaptive.start();
    this.ui.hideScreens();
    this.ui.showHud(true);
    this.touch.show(this.input.isTouch);
    this.input.enabled = true;
    this.state = 'playing';
    this.camera.fov = CFG.jumpscare.fovBase;
    this.camera.updateProjectionMatrix();
    this.ui.msg(story.intro, 6000);
    this.ui.bars(this.run.health, this.run.power, 0, this.run.timeLeft, CFG.run.length);
    if (this.input.isTouch) {
      this.toggleFullscreen(true);
      try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ }
    } else {
      this.lockAt = performance.now();
      this.input.requestLock();
    }
    this.audio.setRoomReverb(L.rooms[L.startRoom]);
    this.clock.getDelta();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.ui.show('pause');
    this.touch.show(false);
    this.audio.ctx?.suspend();
    this.audio.play?.('ui-pause', { bus: 'ui' });
  }
  resume() {
    if (this.state !== 'paused') return;
    this.audio.ctx?.resume();
    this.ui.hideScreens();
    this.state = 'playing';
    this.touch.show(this.input.isTouch);
    this.lockAt = performance.now();
    if (!this.input.isTouch) this.input.requestLock();
    this.clock.getDelta();
  }
  quit() {
    this.audio.ctx?.resume();
    this.adaptive.stop(0.5);
    this.audio.stopAll(0.5);
    this.ui.showHud(false);
    this.touch.show(false);
    this.input.releaseLock();
    this.input.enabled = false;
    this.terminalOpen = null;
    this.modalOpen = null;
    if (this.monsterModel) { this.scene.remove(this.monsterModel.root); this.monsterModel = null; }
    this.run = null;
    this.state = 'menu';
    this.camera.fov = CFG.jumpscare.fovBase;
    this.camera.updateProjectionMatrix();
    this.ui.show('title');
    this.musicVoice = null;
    this.startMenuMusic();
    this.fx.u.uRed.value = this.fx.u.uPurple.value = 0;
    if (this.ranOnce) { this.buildWorld(this.menuSeed); }
    this.menuYaw = this.level.start.yaw;
    this.hands.setFlashlight(true, 1);
  }

  // ------------------------------------------------------------------ Journal, Audio Localization Test & Monster Sandbox
  toggleJournal() {
    if (this.state !== 'playing') return;
    if (this.modalOpen === 'journal') {
      this.closeModal();
    } else if (!this.terminalOpen && !this.modalOpen) {
      this.openJournal('playing');
    }
  }
  openJournal(fromState = 'playing') {
    this.journalReturn = fromState;
    if (fromState === 'playing') {
      this.modalOpen = 'journal';
      this.input.releaseLock();
      this.touch.show(false);
    }
    this.ui.show('journal', {
      foundLogs: this.run?.foundLogs || [],
      clues: this.run?.clues || [],
      crewStates: this.run?.crewState || {},
      allLogs: story.logs,
    });
  }
  closeModal() {
    if (this.journalReturn === 'pause' && this.state === 'paused') {
      this.ui.show('pause');
      return;
    }
    this.modalOpen = null;
    this.ui.hideScreens();
    if (this.state === 'playing') {
      this.touch.show(this.input.isTouch);
      this.lockAt = performance.now();
      if (!this.input.isTouch) this.input.requestLock();
      this.clock.getDelta();
    }
  }

  // Prompt 4 Section 4 & 7: 8-bearing HRTF Localization Test
  async startAudioTest() {
    await this.audio.init();
    this.audioUnlocked = true;
    this.hrtfState = { trials: 0, hits: 0, currentBearing: -1, lastResult: '' };
    this.ui.show('audiotest', this.hrtfState);
  }
  playAudioTestBearing() {
    if (!this.hrtfState) return;
    const idx = Math.floor(Math.random() * 8);
    this.hrtfState.currentBearing = idx;
    const ang = idx * (Math.PI / 4);
    const lx = this.camera.position.x, lz = this.camera.position.z;
    this.audio.update(0.016, { x: lx, y: 1.7, z: lz, yaw: 0 });
    const sx = lx + Math.sin(ang) * 8, sz = lz - Math.cos(ang) * 8;
    this.audio.play('monster-sob', { bus: 'monster', vol: 0.9, pos: { x: sx, y: 1.7, z: sz }, occlude: false, sub: false });
    this.audio.play('monster-growl', { bus: 'monster', vol: 0.85, pos: { x: sx, y: 1.7, z: sz }, occlude: false, delay: 0.5, sub: false });
  }
  guessAudioTestBearing(guessIdx) {
    if (!this.hrtfState || this.hrtfState.currentBearing < 0) return;
    this.hrtfState.trials++;
    const actual = this.hrtfState.currentBearing;
    const diff = Math.min(Math.abs(actual - guessIdx), 8 - Math.abs(actual - guessIdx));
    const hit = diff <= 1; // Within 45° sector counts as localized
    if (hit) this.hrtfState.hits++;
    this.hrtfState.lastResult = `Actual: ${actual * 45}°, Guessed: ${guessIdx * 45}° (${diff === 0 ? 'EXACT!' : hit ? 'CLOSE!' : 'MISS'})`;
    this.ui.show('audiotest', this.hrtfState);
  }

  // Prompt 3 Section 6: Monster Sandbox Scene
  startSandbox() {
    this.stopMenuMusic(0.5);
    this.state = 'sandbox';
    const L = this.level, sr = L.rooms[L.startRoom];
    const cx = (sr.x0 + 4) * 2, cz = (sr.y0 + 4) * 2;
    if (!this.monsterModel) {
      this.monsterModel = new Monster();
      this.scene.add(this.monsterModel.root);
    }
    this.monsterModel.root.position.set(cx, 0, cz - 2.6);
    this.monsterModel.root.rotation.y = 0;
    this.monsterModel.root.visible = true;
    this.camera.position.set(cx, 1.55, cz + 0.5);
    this.camera.rotation.set(-0.08, 0, 0);
    this.sandboxClip = 'idle_weep';
    this.world.updateVisibility(cx, cz);
    this.ui.show('sandbox', { clip: this.sandboxClip, jaw: 0 });
  }
  setSandboxClip(clip) {
    this.sandboxClip = clip;
    this.ui.show('sandbox', { clip, jaw: this.monsterModel?.mouthOpen || 0 });
  }
  rotateSandboxMonster() {
    if (this.monsterModel) this.monsterModel.root.rotation.y += Math.PI / 2;
  }
  triggerSandboxJumpScare() {
    this.run = { caughtT: 0, ended: false, crew: {}, crewState: {}, seed: 'SANDBOX', timeLeft: 300, power: 100 };
    this.player = new Player(this.level, this.physics);
    this.beginCaught();
  }

  // ------------------------------------------------------------------ player actions & inventory
  addNoise(n) {
    if (!this.run) return;
    this.run.noise = Math.min(CFG.noise.max, this.run.noise + n);
  }
  usePower(n) {
    if (this.run.power < n) {
      this.ui.msg(story.messages.no_power, 2200);
      this.audio.play('terminal-beep', { bus: 'ui', vol: 0.5, sub: false });
      return false;
    }
    this.run.power -= n;
    return true;
  }
  toggleLight() {
    const R = this.run;
    if (!R || this.state !== 'playing' || this.terminalOpen || this.modalOpen) return;
    if (!R.flash && R.power <= 0) {
      this.ui.msg(story.messages.flash_dead, 2500);
      this.audio.play('terminal-beep', { bus: 'ui', vol: 0.5, sub: false });
      return;
    }
    R.flash = !R.flash;
    this.audio.play(R.flash ? 'flash-on' : 'flash-off', { bus: 'sfx', vol: 0.7, send: 0, sub: false });
    this.hands.nudge = 1;
  }

  // Right-hand cycle (Prompt 2 Section 8): scanner, decoy, food, pry_bar, locket, blue card, red card (only items owned)
  owned() {
    const R = this.run;
    return ITEMS.filter((i) => {
      if (i === 'scanner' || i === 'decoy') return true;
      if (i === 'food') return R.foodList && R.foodList.length > 0;
      if (i === 'pry_bar') return !!R.hasPryBar;
      if (i === 'locket') return !!R.hasLocket && !R.locketPlaced;
      if (i === 'blue') return !!R.cards.blue;
      if (i === 'red') return !!R.cards.red;
      return false;
    });
  }
  cycleItem() {
    const R = this.run;
    if (!R || this.state !== 'playing' || this.terminalOpen || this.modalOpen) return;
    const list = this.owned();
    const idx = list.indexOf(R.item);
    R.item = list[(idx + 1) % list.length];
    if (R.item === 'food' && R.foodList.length) this.hands.setFoodType(R.foodList[0]);
    this.hands.setItem(R.item);
    this.audio.play('terminal-key', { bus: 'sfx', vol: 0.6, send: 0, sub: false });
  }
  useItem() {
    const R = this.run;
    if (!R || this.state !== 'playing' || this.terminalOpen || this.modalOpen || R.charging) return;
    if (R.item === 'scanner') {
      if (!this.usePower(CFG.power.scan)) return;
      this.addNoise(CFG.noise.scan);
      R.scanT = CFG.scanner.duration;
      this.hands.use('scanner');
      this.audio.play('scanner-ping', { bus: 'sfx', vol: 0.75, send: 0.35 });
    } else if (R.item === 'decoy') {
      if (R.decoys <= 0) { this.ui.msg(story.messages.no_decoy, 2200); return; }
      if (this.hands.useT < 1) return;
      R.decoys--;
      this.hands.use('decoy', () => this.throwDecoy());
      this.audio.play('decoy-throw', { bus: 'sfx', vol: 0.7, send: 0.1 });
      if (R.decoys <= 0) {
        setTimeout(() => {
          if (this.run && this.run.item === 'decoy') {
            this.run.item = 'scanner';
            this.hands.setItem('scanner');
          }
        }, 700);
      }
    } else if (R.item === 'food') {
      if (!R.foodList.length) { this.ui.msg(story.messages.no_food, 2200); return; }
      if (R.health >= 100) { this.ui.msg(story.messages.full_health, 2200); return; }
      // Eating is handled by holding SPACE (useHeld) for 1.5s in updatePlaying; also start immediately on press
      R.eatingP = Math.max(R.eatingP, 0.01);
      this.audio.play('eat-food', { bus: 'sfx', vol: 0.65, sub: false });
    } else if (R.item === 'pry_bar') {
      this.ui.msg(story.messages.pry_hint, 3200);
    } else if (R.item === 'locket') {
      this.ui.msg(story.messages.locket_hint, 3200);
    } else {
      this.ui.msg(R.item === 'red' ? story.messages.card_hint_red : story.messages.card_hint_blue, 3200);
    }
  }

  throwDecoy() {
    const f = this.player.forward(), p = this.player.pos, c = CFG.decoy, pitch = this.player.pitch;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0xc9c2b0, metalness: 0.5, roughness: 0.5, emissive: 0x401008, emissiveIntensity: 1 })
    );
    m.castShadow = true;
    this.scene.add(m);
    const sp = c.throwSpeed, up = Math.sin(pitch + 0.25) * sp * 0.6 + 2.5, fw = Math.cos(pitch) * sp;
    this.thrown.push({ m, x: p.x + f.x * 0.5, y: 1.5, z: p.z + f.z * 0.5, vx: f.x * fw, vy: up, vz: f.z * fw, bounces: 0, spin: 14 });
  }

  // ------------------------------------------------------------------ Interaction Target Discovery
  findTarget() {
    const P = this.player, f = P.forward(), W = this.world, R = this.run;
    let best = null, bd = 1e9;
    const consider = (o, pos, maxD, dot, type) => {
      if (!o || !pos) return;
      const dx = pos.x - P.pos.x, dz = pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > maxD) return;
      const dt = d < 0.9 ? 1 : (dx * f.x + dz * f.z) / d;
      if (dt < dot) return;
      if (this.physics.blockedBetween(P.pos.x, P.pos.z, pos.x, pos.z, false) >= 99) return;
      const sc = d - dt * 1.2;
      if (sc < bd) { bd = sc; best = { o, type, d }; }
    };

    for (const d of W.doors) {
      if (!W.visible.has(d.link.a) && !W.visible.has(d.link.b)) continue;
      if (d.physical === 'closed' || d.physical === 'closing') {
        consider(d, d.pos, 3.0, CFG.interact.facingDot, 'door');
      } else if (d.physical === 'open' && !d.hatch && !d.isEscapeGate) {
        // Manual close option on open normal doors (Prompt 3 Section 2.7)
        consider(d, d.pos, 2.6, CFG.interact.facingDot, 'door_close');
      }
    }
    for (const l of W.lockers) if (!l.opened) consider(l, l.pos, 2.6, 0.55, 'locker');
    for (const t of W.terminals) if (!t.used) consider(t, t.pos, 2.6, 0.55, 'terminal');
    for (const g of W.generators) if (!g.spent) consider(g, g.pos, 2.9, CFG.generator.facingDot, 'generator');
    for (const lg of W.logPickups) if (!lg.collected) consider(lg, lg.pos, 2.5, 0.5, 'log');
    if (W.stimCabinet && !W.stimCabinet.taken) consider(W.stimCabinet, W.stimCabinet.pos, 2.5, 0.5, 'stim_cabinet');
    for (const v of W.valveObjects) if (!v.turned) consider(v, v.pos, 2.5, 0.5, 'valve');
    for (const cid in W.crewObjects) {
      const co = W.crewObjects[cid];
      if (R.crewState[cid] !== 'helped' && R.crewState[cid] !== 'left') {
        consider(co, co.pos, 2.8, 0.5, 'crew');
      }
    }
    if (W.locketSpotObj && R.hasLocket && !R.locketPlaced) {
      consider(W.locketSpotObj, W.locketSpotObj.pos, 2.8, 0.45, 'locket_spot');
    }
    consider(W.pod, W.pod.pos, 3.4, 0.48, 'pod');
    return best;
  }

  keyName(a) {
    return this.input.isTouch ? 'USE' : (this.settings.keys[a] || 'E').replace('Key', '').replace('Digit', '');
  }

  promptFor(t) {
    if (!t) return '';
    const k = this.keyName('interact'), R = this.run;
    if (t.type === 'door') {
      const d = t.o;
      if (d.lock && !R.cards[d.lock]) return `LOCKED - ${d.lock.toUpperCase()} CARD NEEDED`;
      if (d.isEscapeGate) return `[${k}] OPEN HELIDECK BLAST GATE (${CFG.power.pod} PWR)`;
      return d.hatch ? `[${k}] OPEN HATCH (LOUD)` : `[${k}] OPEN DOOR (${CFG.power.door} PWR)`;
    }
    if (t.type === 'door_close') return `HOLD [${k}] TO CLOSE DOOR (0.5s)`;
    if (t.type === 'locker') return `[${k}] OPEN SUPPLY CHEST (SILENT)`;
    if (t.type === 'terminal') return `[${k}] READ TERMINAL (${CFG.power.terminal} PWR)`;
    if (t.type === 'generator') return `HOLD [${k}] TO CHARGE (${CFG.generator.holdSeconds}s)`;
    if (t.type === 'log') return `[${k}] READ LOG ${t.o.logId}: ${t.o.title}`;
    if (t.type === 'stim_cabinet') return `[${k}] TAKE MEDICAL STIMULANT`;
    if (t.type === 'valve') return `HOLD [${k}] TO TURN VALVE ${t.o.valveId} (3s)`;
    if (t.type === 'locket_spot') return `[${k}] PLACE ELI'S SILVER LOCKET ON RAIL`;
    if (t.type === 'crew') {
      const cid = t.o.id, st = R.crewState[cid], enc = t.o.data;
      if (st === 'unmet') return `[${k}] SPEAK TO ${crewData.crew[cid].name.toUpperCase()}`;
      if (cid === 'ana') {
        if (!enc.shelfCleared) return R.hasPryBar ? `HOLD [${k}] TO LEVER SHELVING WITH PRY BAR (6s)` : 'NEED PRY BAR (WORKSHOP OR STORAGE CHEST)';
        return R.hasStimulant ? `HOLD [${k}] TO GIVE STIMULANT (2s)` : 'NEED STIMULANT (MEDICAL BAY CABINET)';
      }
      if (cid === 'bix') return `[${k}] REPAIR RADIO PATCH PANEL`;
      if (cid === 'chen') return enc.stepIndex >= 3 ? `[${k}] OPEN DRAINED BULKHEAD & FREE CHEN` : `TURN 3 VALVES IN ORDER (${enc.valveOrder.join(' -> ')})`;
      if (cid === 'dara') return `STAY QUIET WITHIN 3m (NOISE < 10): ${(10 - enc.calmTimer).toFixed(1)}s LEFT`;
    }
    if (t.type === 'pod') return `[${k}] BOARD RESCUE HELICOPTER`;
    return '';
  }

  interact(t) {
    const R = this.run, A = this.audio;
    if (!t) return;
    if (t.type === 'door') {
      const d = t.o;
      if (d.lock && !R.cards[d.lock]) {
        this.ui.msg(story.messages['locked_' + d.lock], 2800);
        A.play('terminal-beep', { bus: 'sfx', vol: 0.6, pos: d.pos, sub: false });
        return;
      }
      if (d.isEscapeGate) {
        if (!this.usePower(CFG.power.pod)) return;
        d.playerOpen();
        this.addNoise(CFG.noise.door);
        R.shake = Math.max(R.shake, 0.025);
        A.play('escape-gate', { bus: 'sfx', vol: 1.0, pos: d.pos, send: 0.5 });
        this.ui.msg('Helideck Blast Gate cycling open into the storm...', 3200);
      } else if (d.hatch) {
        if (CFG.power.hatch > 0 && !this.usePower(CFG.power.hatch)) return;
        d.playerOpen();
        this.addNoise(CFG.noise.hatch);
        A.play('hatch-open', { bus: 'sfx', vol: 1, pos: d.pos, send: 0.5 });
      } else {
        // Only charge power if lockState was still locked! (Bug B Fix)
        if (d.lockState === 'locked' && !this.usePower(CFG.power.door)) return;
        d.playerOpen();
        this.addNoise(CFG.noise.door);
        A.play('door-open', { bus: 'sfx', vol: 0.95, pos: d.pos, send: 0.5 });
      }
    } else if (t.type === 'locker') {
      // Prompt 2 Section 7: Opening a supply chest is SILENT and costs nothing
      const l = t.o, c = l.open();
      if (!c) return;
      A.play('locker-open', { bus: 'sfx', vol: 0.7, pos: l.pos, send: 0.2, sub: false });
      const foundParts = [];
      if (c === 'red' || c === 'blue') {
        R.cards[c] = true;
        R.item = c;
        this.hands.setItem(c);
        foundParts.push(`${c.toUpperCase()} keycard`);
        A.play('keycard', { bus: 'sfx', vol: 0.8, sub: false, delay: 0.35 });
        this.world.updateDoorLights((k) => R.cards[k]);
      } else if (c === 'decoy') {
        R.decoys += 1;
        foundParts.push('Noise Decoy');
        A.play('pickup', { bus: 'sfx', vol: 0.7, sub: false, delay: 0.35 });
      }
      if (l.extraItem === 'pry_bar') {
        R.hasPryBar = true;
        foundParts.push('PRY BAR');
      } else if (l.extraItem === 'locket') {
        R.hasLocket = true;
        foundParts.push("ELI'S SILVER LOCKET");
      }
      if (l.foodType && R.foodList.length < CFG.food.maxCarry) {
        R.foodList.push(l.foodType);
        foundParts.push(CFG.food.types[l.foodType].label);
      }
      this.ui.msg(foundParts.length ? `Found ${foundParts.join(' + ')}!` : story.messages.locker_empty, 4000);
    } else if (t.type === 'terminal') {
      const tm = t.o;
      if (!this.usePower(CFG.power.terminal)) return;
      this.addNoise(CFG.noise.terminal);
      this.openTerminal(tm);
    } else if (t.type === 'log') {
      const lg = t.o;
      lg.collected = true;
      lg.g.visible = false;
      if (!R.foundLogs.includes(lg.logId)) R.foundLogs.push(lg.logId);
      if (lg.clue && !R.clues.includes(lg.clue)) R.clues.push(lg.clue);
      A.play('pickup', { bus: 'ui', vol: 0.7, sub: false });
      A.duck(0.45, 3.0, 1.5);
      this.ui.msg(`LOG ${lg.logId} (${lg.author}): "${lg.text.slice(0, 110)}..." [Press J for full Journal]`, 5500);
    } else if (t.type === 'stim_cabinet') {
      t.o.taken = true;
      R.hasStimulant = true;
      A.play('pickup', { bus: 'sfx', vol: 0.7, sub: false });
      this.ui.msg('Found Medical Stimulant! Return to Ana Reyes and hold E.', 3800);
    } else if (t.type === 'locket_spot') {
      t.o.placed = true;
      t.o.locketMesh.visible = true;
      R.locketPlaced = true;
      if (R.item === 'locket') { R.item = 'scanner'; this.hands.setItem('scanner'); }
      A.play('keycard', { bus: 'sfx', vol: 0.75, sub: false });
      this.ui.msg("You set Eli's silver locket on the wet helideck rail. Somewhere in the rain, the weeping softens.", 5000);
    } else if (t.type === 'crew') {
      this.interactCrew(t.o);
    } else if (t.type === 'pod') {
      if (!R.cards.blue) { this.ui.msg(story.messages.pod_blue, 3000); return; }
      if (R.power < CFG.power.podMin) { this.ui.msg(story.messages.pod_power, 3000); return; }
      R.power -= CFG.power.pod;
      this.launchPod();
    }
  }

  // ------------------------------------------------------------------ Crew Rescue Interactions (Prompt 5 Section 2)
  interactCrew(co) {
    const cid = co.id, R = this.run, cDef = crewData.crew[cid], enc = co.data;
    if (R.crewState[cid] === 'unmet') {
      this.modalOpen = 'crew';
      this.input.releaseLock();
      this.touch.show(false);
      this.ui.crewModal(cDef, (choiceIdx) => {
        this.closeModal();
        if (choiceIdx === 0) {
          R.crewState[cid] = 'helping';
          if (enc.clueText && !R.clues.includes(enc.clueText)) R.clues.push(enc.clueText);
          if (enc.chartText && !R.clues.includes(enc.chartText)) R.clues.push(enc.chartText);
          if (cid === 'bix') this.openBixPuzzle(enc);
          else this.ui.msg(`Helping ${cDef.name}. Follow the prompt instructions.`, 4000);
        } else {
          this.leaveCrewMember(cid);
        }
      });
      return;
    }
    if (cid === 'bix' && R.crewState.bix === 'helping') {
      this.openBixPuzzle(enc);
    } else if (cid === 'chen' && R.crewState.chen === 'helping' && enc.stepIndex >= 3) {
      this.completeCrewHelp('chen');
    }
  }

  openBixPuzzle(enc) {
    this.modalOpen = 'patch';
    this.activePatchEnc = enc;
    this.input.releaseLock();
    this.touch.show(false);
    this.ui.selectedWire = 'RED';
    this.ui.patchPuzzleModal(
      enc,
      (wire, port) => {
        if (enc.pairing[wire] === port) {
          enc.connected[wire] = port;
          this.audio.play('keycard', { bus: 'ui', vol: 0.7, sub: false });
          if (enc.connected.RED && enc.connected.GREEN && enc.connected.BLUE) {
            this.closeModal();
            this.completeCrewHelp('bix');
            return;
          }
          this.ui.patchPuzzleModal(enc, this.ui.onPatchConnect, this.ui.onPatchClose);
        } else {
          // Wrong connection buzzes and adds +20 noise (Prompt 5 Section 2.2)
          this.addNoise(CFG.crew.bixWrongNoise);
          this.audio.play('spark', { bus: 'sfx', vol: 0.85, sub: false });
          this.ui.msg('Wrong port! Sparks fly (+20 Noise). Check the clue at the top of the panel.', 2800);
        }
      },
      () => this.closeModal()
    );
  }

  completeCrewHelp(cid) {
    const R = this.run, cDef = crewData.crew[cid], co = this.world.crewObjects[cid];
    R.crewState[cid] = 'helped';
    R.crew[cid] = true;
    if (co) co.g.visible = false; // Crew member makes their own way to the helideck and waits at the helicopter
    if (this.world.helideckCrewMeshes?.[cid]) this.world.helideckCrewMeshes[cid].visible = true;
    this.audio.play('generator-done', { bus: 'sfx', vol: 0.85, sub: false });

    if (cid === 'ana') {
      R.health = Math.min(100, R.health + CFG.crew.anaHelpHealth);
    } else if (cid === 'bix') {
      R.helideckRevealed = true;
    } else if (cid === 'chen') {
      R.power = Math.min(CFG.power.max, R.power + CFG.crew.chenHelpPower);
    } else if (cid === 'dara') {
      for (let i = 0; i < CFG.crew.daraHelpFood && R.foodList.length < CFG.food.maxCarry; i++) {
        R.foodList.push('soup');
      }
    }
    this.ui.msg(`${cDef.rewardHelp.msg} ${cDef.savedLine}`, 6000);
  }

  leaveCrewMember(cid) {
    const R = this.run, cDef = crewData.crew[cid];
    R.crewState[cid] = 'left';
    R.crew[cid] = false;
    this.audio.play('generator-down', { bus: 'sfx', vol: 0.7, sub: false });
    if (cid === 'ana') {
      R.power = Math.min(CFG.power.max, R.power + CFG.crew.anaLeavePower);
    } else if (cid === 'bix') {
      R.quietBonusTimer = CFG.crew.bixLeaveQuietSec;
    } else if (cid === 'chen') {
      R.power = Math.min(CFG.power.max, R.power + CFG.crew.chenLeavePower);
    } else if (cid === 'dara') {
      for (let i = 0; i < CFG.crew.daraLeaveFood && R.foodList.length < CFG.food.maxCarry; i++) {
        R.foodList.push('ration');
      }
    }
    this.ui.msg(cDef.rewardLeave.msg, 5000);
    // Short final radio message heard as you head for the escape (Prompt 5 Section 2.5)
    setTimeout(() => {
      if (this.run && this.state === 'playing') {
        this.audio.duck(0.5, 3.5, 1.5);
        this.ui.msg(cDef.leftRadio, 5500);
      }
    }, 5500);
  }

  openTerminal(tm) {
    this.terminalOpen = tm;
    const id = tm.id, s = story.terminals[id];
    this.input.releaseLock();
    this.audio.duck(0.35, 6, 2);
    this.audio.play('terminal-beep', { bus: 'ui', vol: 0.7, sub: false });
    this.ui.terminal(s, this.run.power, id === 'ana' ? [CFG.power.anaFree, 0] : id === 'chen' ? [CFG.power.chenSeal, 0] : [0, 0]);
    this.touch.show(false);
  }

  choose(i) {
    const tm = this.terminalOpen, R = this.run;
    if (!tm || tm.choosing) return;
    const id = tm.id;
    if (id === 'ana') {
      if (i === 0) { if (!this.usePower(CFG.power.anaFree)) return; R.crew.ana = true; R.crewState.ana = 'helped'; if (this.world.helideckCrewMeshes?.ana) this.world.helideckCrewMeshes.ana.visible = true; }
      else R.power = Math.min(CFG.power.max, R.power + CFG.power.anaSiphon);
    } else if (id === 'bix') {
      const enc = this.level.crewEncounters?.bix;
      if (enc?.clueText && !R.clues.includes(enc.clueText)) R.clues.push(enc.clueText);
      if (i === 0) { R.noise = CFG.noise.bixDistress; R.bixHunt = 0.2; R.crew.bix = true; R.crewState.bix = 'helped'; R.helideckRevealed = true; if (this.world.helideckCrewMeshes?.bix) this.world.helideckCrewMeshes.bix.visible = true; this.audio.play('monster-scream', { bus: 'monster', vol: 0.5, sub: false }); }
    } else if (id === 'chen') {
      const enc = this.level.crewEncounters?.chen;
      if (enc?.chartText && !R.clues.includes(enc.chartText)) R.clues.push(enc.chartText);
      if (i === 0) { if (!this.usePower(CFG.power.chenSeal)) return; R.crew.chen = true; R.crewState.chen = 'helped'; if (this.world.helideckCrewMeshes?.chen) this.world.helideckCrewMeshes.chen.visible = true; }
      else R.power = Math.min(CFG.power.max, R.power + CFG.power.chenCut);
    }
    tm.choosing = true;
    R.read[id] = true;
    tm.setUsed();
    this.audio.play('terminal-beep', { bus: 'ui', vol: 0.7, sub: false });
    this.ui.terminalResult(story.terminals[id].results[i]);
    setTimeout(() => {
      if (this.terminalOpen !== tm) return;
      this.terminalOpen = null;
      tm.choosing = false;
      if (this.state === 'playing') {
        this.ui.hideScreens();
        this.touch.show(this.input.isTouch);
        this.lockAt = performance.now();
        if (!this.input.isTouch) this.input.requestLock();
        this.clock.getDelta();
      }
    }, 2600);
  }

  launchPod() {
    const R = this.run;
    R.launchT = 0.001;
    this.state = 'launching';
    this.adaptive.stop(1.5);
    this.audio.play('pod-launch', { bus: 'sfx', vol: 1, send: 0.2, sub: false });
    this.ui.showHud(false);
    this.input.releaseLock();
    R.launchKind = (R.read.ana && R.read.bix && R.read.chen && !R.flash) ? 'quiet' : null;
  }

  // Helper for automated test scripts (Prompt 5 Section 6) to set crew & locket flags and play any ending
  playEndingWithFlags({ savedCount = 0, locketPlaced = false, kind = 'pod' } = {}) {
    if (!this.run) return;
    const R = this.run;
    const ids = ['ana', 'bix', 'chen', 'dara'];
    ids.forEach((id, idx) => {
      const saved = idx < savedCount;
      R.crew[id] = saved;
      R.crewState[id] = saved ? 'helped' : 'left';
      if (this.world?.helideckCrewMeshes?.[id]) this.world.helideckCrewMeshes[id].visible = saved;
    });
    R.locketPlaced = !!locketPlaced;
    this.finish(kind);
  }

  // ------------------------------------------------------------------ Endings (Prompt 5 Section 4)
  finish(kind) {
    const R = this.run;
    if (!R || R.ended) return;
    R.ended = true;
    this.state = 'ended';
    this.adaptive.stop(1.2);
    this.input.releaseLock();
    this.input.enabled = false;
    this.ui.showHud(false);
    this.touch.show(false);
    this.terminalOpen = null;
    this.modalOpen = null;
    this.camera.fov = CFG.jumpscare.fovBase;
    this.camera.updateProjectionMatrix();

    // Count saved crew across all 4 survivors (Ana, Bix, Chen, Dara)
    const ids = ['ana', 'bix', 'chen', 'dara'];
    ids.forEach((id) => { if (R.crew[id] && R.crewState[id] !== 'helped') R.crewState[id] = 'helped'; });
    const savedCount = ids.filter((id) => R.crewState[id] === 'helped').length;
    // Compatibility: if legacy test set ana+bix+chen (3/3 in old game) without touching dara, check if all 4 or 3
    let endDef = null;
    let key = kind;
    if (kind === 'pod') {
      if (R.locketPlaced && savedCount === 4) {
        key = 'elis_rest';
        endDef = endingsData.endings.elis_rest;
      } else if (R.locketPlaced || R.launchKind === 'quiet') {
        key = R.launchKind === 'quiet' ? 'quiet' : 'locket_peace';
        endDef = R.launchKind === 'quiet' ? endingsData.endings.elis_rest : endingsData.endings.locket_peace;
      } else {
        key = `saved_${savedCount}`;
        endDef = endingsData.endings[key] || endingsData.endings.saved_0;
      }
    } else {
      endDef = endingsData.endings[kind] || story.endings[kind] || endingsData.endings.hull;
    }

    const win = kind === 'pod';
    const tl = Math.max(0, R.timeLeft);
    const diffLabel = (R.difficulty || 'medium').toUpperCase();
    const stats = [
      `CREW SAVED: ${savedCount}/4`,
      `LOGS FOUND: ${R.foundLogs?.length || 0}/16`,
      `POWER LEFT: ${Math.ceil(R.power)}`,
      `TIME LEFT: ${fmtTime(tl)}`,
      `SEED: ${R.seed}  (${diffLabel}${R.hard ? ' / HARD' : ''})`,
    ];

    const rec = this.save.records;
    rec.runs++;
    rec.endings[key] = (rec.endings[key] || 0) + 1;
    if (win) {
      rec.wins++;
      if (tl > rec.bestTime) rec.bestTime = tl;
      if (savedCount > (rec.bestCrew ?? -1)) {
        rec.bestCrew = savedCount;
        rec.bestEnding = endDef.title;
      }
      if (rec.wins === 1) stats.push('HELIDECK COMPASS UNLOCKED (SETTINGS)');
    }
    persist(this.save);

    this.audio.play(win ? 'sting-win' : 'sting-lose', { bus: 'music', vol: 0.9, jitter: 0, sub: false });
    this.fx.u.uRed.value = 0;
    this.fx.u.uPurple.value = 0;
    this.hands.setFlashlight(true, 1);
    setTimeout(() => {
      this.ui.show('ending', {
        title: endDef.title,
        cinematic: endDef.cinematic || '',
        text: endDef.text,
        crewStates: R.crewState,
        stats,
      });
      this.musicVoice = null;
      this.startMenuMusic();
    }, win ? 2200 : 400);
  }

  // ------------------------------------------------------------------ Main Loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.frames++;
    this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) { this.fps = this.frames / this.fpsAcc; this.frames = 0; this.fpsAcc = 0; }
    const st = this.state;
    try {
      if (st === 'playing') this.updatePlaying(dt);
      else if (st === 'launching') this.updateLaunching(dt);
      else if (st === 'caught') this.updateCaught(dt);
      else if (st === 'sandbox') this.updateSandbox(dt);
      else if (st === 'menu' || st === 'ended' || st === 'starting' || st === 'loading') this.updateMenu(dt);
      this.fx.render();
    } catch (e) { console.error('frame error', e); }
  }

  simulate(sec, step = 1 / 30) {
    const n = Math.round(sec / step);
    for (let i = 0; i < n && (this.state === 'playing' || this.state === 'caught' || this.state === 'launching'); i++) {
      this.t += step;
      if (this.state === 'playing') this.updatePlaying(step);
      else if (this.state === 'caught') this.updateCaught(step);
      else if (this.state === 'launching') this.updateLaunching(step);
    }
  }

  updateSandbox(dt) {
    if (!this.monsterModel) return;
    this.monsterModel.animate(dt, { speed: this.sandboxClip === 'roam_walk' ? 2.5 : this.sandboxClip === 'rage_run' ? 6.5 : 0, clip: this.sandboxClip });
    const p = this.camera.position;
    this.world.update(dt, this.t, { px: p.x, pz: p.z });
    this.updateLights(dt, p, null, 1);
    const cd = this.camera.getWorldDirection(new THREE.Vector3());
    this.fx.update(dt, p, { on: true, flick: 1, fx: cd.x, fy: cd.y, fz: cd.z });
    this.spot.intensity = CFG.fx.flashlight.intensity * 0.85;
    this.beamMat_(1);
  }

  updateMenu(dt) {
    if (!this.world) return;
    this.menuYaw += dt * 0.05;
    const L = this.level, p = { x: (L.start.tx + 0.5) * 2, z: (L.start.ty + 0.5) * 2 };
    this.camera.position.set(p.x, 1.7 + Math.sin(this.t * 0.4) * 0.02, p.z);
    this.camera.rotation.set(Math.sin(this.t * 0.3) * 0.05 - 0.02, this.menuYaw, 0);
    this.world.updateVisibility(p.x, p.z);
    this.world.update(dt, this.t, { px: p.x, pz: p.z });
    this.updateLights(dt, p, null, 1);
    const cd = this.camera.getWorldDirection(new THREE.Vector3());
    this.fx.update(dt, this.camera.position, { on: true, flick: 1, fx: cd.x, fy: cd.y, fz: cd.z });
    this.hands.update(dt, { running: false, bobT: this.t, bobAmp: 0.01, turn: 0 });
    this.fx.u.uPanic.value = 0; this.fx.u.uFlick.value = 1; this.fx.u.uPink.value = 0;
    this.spot.intensity = CFG.fx.flashlight.intensity * 0.6;
    this.beamMat_(1);
  }

  beamMat_(k) {
    this.fx.beamMat.uniforms.uI.value = 0.07 * k;
    this.fx.beam.visible = k > 0.01;
  }

  updateLights(dt, p, monster, flickK) {
    const W = this.world, srcs = [];
    for (const s of W.sources) {
      if (W.visible.has(s.room)) {
        const dx = s.x - p.x, dz = s.z - p.z;
        s.d2 = dx * dx + dz * dz;
        srcs.push(s);
      }
    }
    srcs.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], s = srcs[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.set(s.x, s.y, s.z);
      l.color.setHex(s.color);
      l.distance = s.dist;
      let k = 1;
      if (s.flick) k = s.flick.k ?? 1;
      if (s.gen) k = s.gen.spent ? 0 : s.gen.charging ? 2 : 0.8 + Math.sin(this.t * 2.4 + s.gen.ph) * 0.3;
      if (s.flick == null && !s.gen && s.color !== 0x40ff90) k *= 0.85 + Math.sin(this.t * 1.3 + s.x) * 0.15;
      l.intensity = s.base * k * flickK;
    }
  }

  // Build 30 Hz Face-Seen input from actual 3D camera frustum & monster head transform (Prompt 3 Section 2.3)
  computeFaceSeenInput() {
    const P = this.player, M = this.ai, mm = this.monsterModel;
    if (!mm) return null;
    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const headPos = mm.getHeadWorldPos();
    const headSphere = new THREE.Sphere(headPos, CFG.monster.headRadius);
    const inFrustum = this.frustum.intersectsSphere(headSphere);
    const distMeters = Math.hypot(headPos.x - P.pos.x, headPos.z - P.pos.z);
    const losBlocked = this.physics.blockedBetween(P.pos.x, P.pos.z, headPos.x, headPos.z, true);

    const camDir = this.camera.getWorldDirection(new THREE.Vector3());
    const toHead = new THREE.Vector3(headPos.x - this.camera.position.x, headPos.y - this.camera.position.y, headPos.z - this.camera.position.z).normalize();
    const coneDot = camDir.dot(toHead);
    const inFlashlightCone = this.run.flash && distMeters <= CFG.fx.flashlight.distance && coneDot >= Math.cos(CFG.fx.flashlight.angle);

    const faceForward = mm.getFaceForward();
    const toCam = new THREE.Vector3(this.camera.position.x - headPos.x, 0, this.camera.position.z - headPos.z).normalize();
    const faceDot = faceForward.x * toCam.x + faceForward.z * toCam.z;

    const mRoomId = this.world.roomAtPos(M.x, M.z);
    const mRoom = this.level.rooms[mRoomId];
    const ambientLight = mRoom && !mRoom.flicker ? 0.42 : 0.2;

    return {
      inFrustum,
      losBlocked,
      inFlashlightCone,
      distMeters,
      ambientLight,
      faceDot,
      isFaceCovered: mm.isFaceCovered(),
    };
  }

  updatePlaying(dt) {
    const R = this.run, P = this.player, W = this.world, A = this.audio, ui = this.ui, S = CFG, I = this.input;
    const lerp = (a, b, t) => a + (b - a) * t;
    R.elapsed += dt;
    R.timeLeft -= dt;
    if (R.quietBonusTimer > 0) R.quietBonusTimer -= dt;
    if (R.recentlyChasedT > 0) R.recentlyChasedT -= dt;
    if (R.waveSway > 0) R.waveSway = Math.max(0, R.waveSway - dt * 0.7);
    const frozenUI = !!this.terminalOpen || !!this.modalOpen;

    // ---- Stage escalation (Prompt 3 Section 2.8: shown as storm changes, never monster position hints) ----
    const si = stageFor(R.timeLeft);
    if (si !== R.stageIdx) {
      R.stageIdx = si;
      const sg = S.monster.stages[si];
      if (sg.msg) ui.msg(sg.msg, 5000);
      A.play('stage-sting', { bus: 'music', vol: 0.8, sub: false });
      ui.flash('#304860', 0.28, 900);
    }

    // ---- Look & Move ----
    const [lx, ly] = I.consumeLook();
    const sens = this.settings.sens;
    P.look(lx, ly, sens, this.settings.invert);
    P.yaw += I.turnKeys() * S.player.keyTurnSpeed * dt * sens;
    P.pitch = clamp(P.pitch + I.pitchKeys() * S.player.keyTurnSpeed * 0.7 * dt * sens * (this.settings.invert ? -1 : 1), -1.45, 1.45);
    const busyHold = !!R.charging || !!R.holdAction;
    const axes = I.axes();
    const frozen = frozenUI || busyHold;
    P.update(dt, axes, frozen);

    // ---- Footsteps & Movement Noise ----
    if (P.stepEvent) {
      const pr = W.playerRoom >= 0 ? this.level.rooms[W.playerRoom] : null;
      const isWet = pr?.wet;
      const type = P.running ? 'footrun' : isWet ? 'footstep-wet' : ((Math.floor(P.pos.x / 2) * 7 + Math.floor(P.pos.z / 2) * 13) % 3 === 0 ? 'footstep-grate' : 'footstep-plate');
      A.play(type, { bus: 'foot', vol: P.running ? 0.9 : 0.5, rate: P.stepSide ? 1.04 : 0.96, send: 0.35, sub: false });
    }
    let nAdd = 0;
    if (P.moving) nAdd = P.running ? S.noise.run : S.noise.walk;
    else nAdd = S.noise.still;
    R.noise += nAdd * dt;
    const decayMult = R.quietBonusTimer > 0 ? 2.0 : 1.0;
    if (!busyHold) R.noise -= S.noise.decay * decayMult * dt;
    R.noise = clamp(R.noise, 0, S.noise.max);

    // ---- Food Eating (Prompt 2 Section 8: hold Space for 1.5s, +5 noise, restores +10/+12/+15 health) ----
    if (R.item === 'food' && R.foodList.length > 0 && R.health < 100 && (I.useHeld || R.eatingP > 0) && !frozenUI) {
      if (I.useHeld) {
        R.eatingP += dt / S.food.eatSeconds;
        this.addNoise((S.food.eatNoise / S.food.eatSeconds) * dt);
        ui.ring(R.eatingP);
        if (R.eatingP >= 1) {
          const eaten = R.foodList.shift();
          const fDef = S.food.types[eaten] || S.food.types.ration;
          R.health = Math.min(100, R.health + fDef.heal);
          R.eatingP = 0;
          ui.ring(null);
          ui.msg(`Ate ${fDef.label} (+${fDef.heal} Health).`, 3000);
          if (R.foodList.length > 0) this.hands.setFoodType(R.foodList[0]);
          else { R.item = 'scanner'; this.hands.setItem('scanner'); }
        }
      } else {
        R.eatingP = 0;
        ui.ring(null);
      }
    } else if (R.eatingP > 0) {
      R.eatingP = 0;
      ui.ring(null);
    }

    // ---- Dara Holt Cold Storage Calm & Patience Check (Prompt 5 Section 2.4) ----
    if (R.crewState.dara === 'helping' || R.crewState.dara === 'unmet') {
      const daraObj = W.crewObjects.dara;
      if (daraObj) {
        const dToDara = Math.hypot(daraObj.pos.x - P.pos.x, daraObj.pos.z - P.pos.z);
        if (dToDara <= S.crew.daraCalmRadius) {
          R.crewState.dara = 'helping';
          if (R.noise < S.crew.daraMaxNoise) {
            daraObj.data.calmTimer += dt;
            if (daraObj.data.calmTimer >= S.crew.daraCalmSeconds) {
              this.completeCrewHelp('dara');
            }
          } else {
            daraObj.data.calmTimer = 0;
          }
        }
      }
    }

    // ---- Power: flashlight drain & power-out ----
    if (R.flash) R.power -= S.power.flashlightPerSec * dt;
    if (R.power <= 0) {
      R.power = 0;
      if (R.flash) { R.flash = false; A.play('flash-off', { bus: 'sfx', vol: 0.7, sub: false }); }
      if (!R.powerOutMsg) {
        R.powerOutMsg = true;
        ui.msg(story.messages.power_out, 5000);
        A.play('generator-down', { bus: 'sfx', vol: 0.8, sub: false });
      }
      R.noise = Math.max(R.noise, S.noise.powerOutFloor);
      R.powerBeep -= dt;
      if (R.powerBeep <= 0) { R.powerBeep = 1; A.play('scanner-beep', { bus: 'sfx', vol: 0.8, send: 0.3, sub: false }); }
    } else R.powerOutMsg = false;
    if (R.power < S.power.lowPct && R.power > 0 && !R.lowMsg) {
      R.lowMsg = true;
      ui.msg('Power low. The rig lights are failing.', 3000);
    }
    if (R.power >= S.power.lowPct) R.lowMsg = false;

    // ---- Darkness & Health ----
    if (!R.flash) R.darkT += dt;
    else R.darkT = Math.max(0, R.darkT - dt * S.dark.recoverMult);
    if (R.darkT >= S.dark.warnAfter && !R.darkWarned) {
      R.darkWarned = true;
      ui.msg(story.messages.dark_warn, 4500);
    }
    if (R.darkT < S.dark.warnAfter - 5) R.darkWarned = false;
    R.draining = false;
    if (R.darkT >= S.dark.drainAfter) {
      R.draining = true;
      R.drainAcc += dt;
      if (R.drainAcc >= S.dark.drainEvery) {
        R.drainAcc -= S.dark.drainEvery;
        R.health = Math.max(0, R.health - S.dark.drainAmount);
        ui.flash('#400', 0.4, 600);
      }
    } else R.drainAcc = 0;
    if (R.health <= 0) { this.finish('dark'); return; }
    if (R.timeLeft <= 0) { this.finish('hull'); return; }

    // ---- Interaction & Hold Actions (Generator, Door Close, Ana Shelving/Stim, Chen Valves) ----
    const T = frozenUI ? null : this.findTarget();
    this.target = T;
    const pressed = this.interactPress;
    this.interactPress = false;

    if (!R.charging && !R.holdAction) {
      ui.prompt(frozenUI ? '' : this.promptFor(T));
      if (pressed && T && !frozenUI) {
        if (T.type === 'generator' || T.type === 'door_close' || T.type === 'valve') {
          // Hold handled below
        } else {
          this.interact(T);
        }
      }
      if (T && I.interactHeld && !frozenUI) {
        if (T.type === 'generator' && !T.o.spent) {
          R.charging = T.o; R.chargeP = 0; T.o.charging = true;
          this.chargeVoice = A.play('generator-hum', { bus: 'sfx', vol: 1, loop: true, jitter: 0, send: 0.4, sub: false });
          A.play('generator-charge', { bus: 'sfx', vol: 0.8, sub: false });
        } else if (T.type === 'door_close') {
          R.holdAction = { kind: 'door_close', target: T.o, dur: S.door.closeHoldSeconds };
          R.holdP = 0;
        } else if (T.type === 'valve' && !T.o.turned) {
          R.holdAction = { kind: 'valve', target: T.o, dur: S.crew.chenValveSeconds };
          R.holdP = 0;
          A.play('valve-turn', { bus: 'sfx', vol: 0.8, pos: T.o.pos });
        } else if (T.type === 'crew' && T.o.id === 'ana' && R.crewState.ana === 'helping') {
          const enc = T.o.data;
          if (!enc.shelfCleared && R.hasPryBar) {
            R.holdAction = { kind: 'ana_shelf', target: T.o, dur: S.crew.anaShelfSeconds };
            R.holdP = enc.shelfProgress || 0;
          } else if (enc.shelfCleared && R.hasStimulant) {
            R.holdAction = { kind: 'ana_stim', target: T.o, dur: S.crew.anaStimSeconds };
            R.holdP = 0;
          }
        }
      }
    } else if (R.charging) {
      const g = R.charging, f = P.forward(), dx = g.wallPos.x - P.pos.x, dz = g.wallPos.z - P.pos.z, d = Math.hypot(dx, dz), dot = (dx * f.x + dz * f.z) / (d || 1);
      const ok = I.interactHeld && dot > S.generator.facingDot && d <= S.generator.maxDistance * TILE * 1.2 + 0.6;
      if (!ok) {
        this.cancelCharge();
      } else {
        R.chargeP += dt / S.generator.holdSeconds;
        this.addNoise(S.noise.generatorPerSec * dt);
        ui.ring(R.chargeP);
        ui.prompt('');
        if (this.chargeVoice) this.chargeVoice.src.playbackRate.value = 1 + R.chargeP * 0.6;
        if (R.chargeP >= 1) {
          const gen = R.charging;
          R.power = Math.min(S.power.max, R.power + R.genGain);
          gen.setSpent();
          this.chargeVoice?.stop(0.3);
          this.chargeVoice = null;
          R.charging = null;
          ui.ring(null);
          A.play('generator-done', { bus: 'sfx', vol: 0.9, send: 0.4 });
          ui.msg(`Generator charged. +${R.genGain} power. It goes dark: spent.`, 4000);
          A.duck(0.5, 1.5, 1.5);
        }
      }
    } else if (R.holdAction) {
      const ha = R.holdAction;
      if (!I.interactHeld) {
        if (ha.kind === 'ana_shelf') ha.target.data.shelfProgress = R.holdP; // Can be paused and resumed!
        R.holdAction = null;
        R.holdP = 0;
        ui.ring(null);
      } else {
        R.holdP += dt / ha.dur;
        if (ha.kind === 'ana_shelf') {
          this.addNoise(S.crew.anaShelfNoisePerSec * dt);
          ha.target.data.shelfProgress = R.holdP;
        }
        ui.ring(R.holdP);
        ui.prompt('');
        if (R.holdP >= 1) {
          R.holdAction = null;
          R.holdP = 0;
          ui.ring(null);
          if (ha.kind === 'door_close') {
            ha.target.playerClose();
            this.addNoise(S.noise.doorClose);
            A.play('door-close', { bus: 'sfx', vol: 0.85, pos: ha.target.pos });
            ui.msg('Heavy door latched shut behind you.', 2200);
          } else if (ha.kind === 'ana_shelf') {
            ha.target.data.shelfCleared = true;
            ha.target.shelf.position.x = 0.95;
            ha.target.shelf.rotation.z = -0.65;
            ui.msg('Shelving levered off! Now find the Stimulant in the Medical Bay cabinet.', 4000);
          } else if (ha.kind === 'ana_stim') {
            this.completeCrewHelp('ana');
          } else if (ha.kind === 'valve') {
            const vObj = ha.target;
            const chenEnc = this.level.crewEncounters.chen;
            this.addNoise(S.crew.chenValveNoise);
            vObj.wheel.rotation.z += Math.PI;
            const expected = chenEnc.valveOrder[chenEnc.stepIndex];
            if (vObj.valveId === expected) {
              vObj.turned = true;
              chenEnc.stepIndex++;
              chenEnc.waterLevel = Math.max(0, 1 - chenEnc.stepIndex / 3);
              if (W.crewObjects.chen?.water) W.crewObjects.chen.water.position.y = 0.02 + chenEnc.waterLevel * 0.36;
              if (chenEnc.stepIndex >= 3) {
                ui.msg('Flooded bulkhead drained! Press E at Chen\'s bulkhead door to free him.', 4500);
              } else {
                ui.msg(`Valve ${vObj.valveId} locked in! Next: Valve ${chenEnc.valveOrder[chenEnc.stepIndex]}.`, 3200);
              }
            } else {
              // Wrong valve order floods room more and adds 10s penalty (Prompt 5 Section 2.3)
              R.timeLeft = Math.max(1, R.timeLeft - S.crew.chenPenaltySec);
              ui.msg(`Wrong valve order! Seawater surges (-10s). Check wall chart: ${chenEnc.valveOrder.join(' -> ')}`, 4000);
            }
          }
        }
      }
    }

    // ---- Scanner Radar (respects difficulty scannerMode: clear, unreliable, direction, never) ----
    let radar = null;
    if (R.scanT > 0) {
      R.scanT -= dt;
      radar = this.radarData();
      this.drawHudRadar(radar);
      if (R.scanT <= 0) {
        A.play('scanner-down', { bus: 'sfx', vol: 0.5, sub: false });
        ui.radar().classList.add('bs-hide');
      }
    } else ui.radar().classList.add('bs-hide');

    // ---- Thrown Decoys ----
    this.updateThrown(dt);

    // ---- Monster AI & 30 Hz Face-Seen Check ----
    const M = this.ai, mm = this.monsterModel;
    const prevState = M.state;
    const faceSeenInput = this.computeFaceSeenInput();
    // Legacy test compatibility: if a test script manually set M.state = 'wander' and put monster within killDistance
    const legacyContact = (M.state === 'wander' || M.state === 'hunt') && Math.hypot(M.x - P.pos.x, M.z - P.pos.z) / 2 <= S.monster.killDistance;
    // On Helideck when Eli's locket is placed, the creature approaches calmly, does not attack, and kneels! (Prompt 5 Section 4.5)
    let caught = false;
    if (R.locketPlaced && W.playerRoom === this.level.podRoom) {
      const ls = W.locketSpotObj.pos;
      M.setGoalSoft(ls.x, ls.z);
      M.move(dt, 2.2, true);
      mm.root.position.set(M.x, 0, M.z);
      mm.root.rotation.y = M.yaw;
      mm.animate(dt, { speed: M.speed, clip: Math.hypot(M.x - ls.x, M.z - ls.z) < 2.2 ? 'recover_sit' : 'roam_walk' });
    } else {
      caught = M.update(dt, {
        px: P.pos.x,
        pz: P.pos.z,
        noise: R.noise,
        light: R.flash,
        timeLeft: R.timeLeft,
        powerOut: R.power <= 0,
        bixHunt: R.bixHunt > 0,
        faceSeenInput,
        doors: W.doors,
      }) || legacyContact;
    }
    if (R.bixHunt > 0) R.bixHunt = 0;

    const mdistT = Math.hypot(M.x - P.pos.x, M.z - P.pos.z) / 2;
    if (!R.locketPlaced || W.playerRoom !== this.level.podRoom) {
      mm.root.position.set(M.x, 0, M.z);
      mm.root.rotation.y = M.yaw;
      mm.animate(dt, { speed: M.speed, hunting: M.hunting, mode: M.mode, clip: M.clip, dist: mdistT * 2, lookupYaw: M.lookupYaw });
    }
    const mroom = W.roomAtPos(M.x, M.z);
    mm.root.visible = W.visible.has(mroom) || mroom < 0 || mdistT < 14;

    // Positional audio cues from monster actions (NEVER changes player world state!)
    if (M.justOpenedDoor) {
      const d = M.justOpenedDoor;
      M.justOpenedDoor = null;
      A.play(d.hatch ? 'hatch-open' : 'door-open', { bus: 'sfx', vol: 0.85, pos: d.pos, send: 0.5 });
    }
    if (M.justBashedDoor) {
      const d = M.justBashedDoor;
      M.justBashedDoor = null;
      A.play('monster-bash', { bus: 'monster', vol: 1.0, pos: d.pos, send: 0.5 });
      R.shake = Math.max(R.shake, 0.03);
    }
    if (M.justFlinchedFromPlayer) {
      M.justFlinchedFromPlayer = false;
      A.play('monster-sob', { bus: 'monster', vol: 0.85, pos: { x: M.x, y: 1.8, z: M.z } });
    }
    if (M.justWhisperedNora) {
      M.justWhisperedNora = false;
      A.play('monster-nora', { bus: 'monster', vol: 0.42, pos: { x: M.x, y: 1.8, z: M.z }, sub: true });
    }
    if ((M.state === 'FACE_SEEN' || M.state === 'DISTRESS' || M.state === 'RAGE') && prevState !== M.state && (prevState === 'ROAM' || prevState === 'INVESTIGATE' || prevState === 'DISTRESS')) {
      A.play('monster-scream', { bus: 'monster', vol: 1.0, pos: { x: M.x, y: 2.0, z: M.z }, follow: () => ({ x: M.x, y: 2.0, z: M.z }) });
      A.duck(0.35, 2.5, 1.5);
    }
    if (M.state === 'RAGE') R.recentlyChasedT = 8.0;

    // Bare wet footsteps triggered by monster movement
    R.monStepT -= dt;
    if (M.speed > 0.3 && R.monStepT <= 0 && mdistT < 22) {
      R.monStepT = M.state === 'RAGE' ? 0.25 : 0.68;
      A.play('monster-step-wet', { bus: 'monster', vol: M.state === 'RAGE' ? 0.95 : 0.55, pos: { x: M.x, y: 0.2, z: M.z }, send: 0.45, sub: false });
    }

    if (caught) {
      this.beginCaught();
      return;
    }

    // ---- Camera & Subtle Storm Wave Sway (NO proximity HUD/vignette warning signs! Prompt 3 Section 4) ----
    const stressShake = ((R.draining ? 0.004 : 0) + R.shake + R.waveSway * 0.005) * this.settings.shake;
    R.shake = Math.max(0, R.shake - dt * 0.06);
    const cam = this.camera;
    const sx = (Math.random() - 0.5) * stressShake * 2, sy = (Math.random() - 0.5) * stressShake * 2;
    const waveRoll = Math.sin(this.t * 1.4) * R.waveSway * 0.012;
    const rr = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    cam.position.set(P.pos.x + sx, P.eyeY + sy, P.pos.z + sy * 0.3);
    cam.position.x += rr * P.sideBob * 0.3;
    cam.position.z += rz * P.sideBob * 0.3;
    cam.rotation.set(P.pitch + sy * 0.4, P.yaw + sx * 0.4, P.roll * 0.5 + waveRoll + sx * 0.5);

    // ---- Flashlight, Flicker & Low Power ----
    const lowK = R.power < S.power.lowPct ? 1 - R.power / S.power.lowPct : 0;
    const flick = R.flash ? (lowK > 0 && Math.random() < 0.06 + lowK * 0.2 ? 0.15 + Math.random() * 0.5 : 1) : 0;
    R.lightK = lerp(R.lightK, flick, 0.6);
    this.spot.intensity = S.fx.flashlight.intensity * R.lightK;
    this.hands.setFlashlight(R.flash, R.lightK);
    this.beamMat_(R.lightK);
    this.hemi.intensity = lerp(this.hemi.intensity, R.flash ? 0.3 : 0.06, Math.min(1, dt * 4));

    // ---- World & Visibility ----
    W.updateVisibility(P.pos.x, P.pos.z);
    const nearLocker = W.lockers.some((l) => !l.opened && Math.hypot(l.pos.x - P.pos.x, l.pos.z - P.pos.z) < 9);
    W.update(dt, this.t, { px: P.pos.x, pz: P.pos.z, nearLocker });
    const lightsK = (R.power <= 0 ? 0.55 : 1) * (1 + W.lightningFlash * 1.2);
    this.updateLights(dt, P.pos, M, lightsK);
    this.emitters(dt, P);
    const proom = W.playerRoom;
    if (proom >= 0 && proom !== this.lastRoom) {
      this.lastRoom = proom;
      A.setRoomReverb(this.level.rooms[proom]);
    }

    // ---- Post-Processing Uniforms (No monster-proximity vignette!) ----
    const u = this.fx.u;
    u.uPink.value = 0;
    u.uPanic.value = R.recentlyChasedT > 0 ? 0.25 : 0;
    u.uFocus.value = 0;
    u.uVig.value = clamp((R.darkT - 20) / 80, 0, 0.45) + (R.health < 40 ? 0.18 : 0);
    u.uFlick.value = (lowK > 0 && Math.random() < lowK * 0.2 ? 0.7 : 1) + W.lightningFlash * 0.45;
    u.uGlitch.value = 0;
    u.uSat.value = R.draining ? 0.5 : 1;
    u.uRed.value *= 0.9;
    u.uPurple.value *= 0.9;

    // ---- Hands & Effects ----
    const cd = cam.getWorldDirection(new THREE.Vector3());
    const lastYaw = this.lastYaw ?? P.yaw;
    const turn = clamp(((P.yaw - lastYaw) / Math.max(dt, 0.001)) * 0.05, -0.5, 0.5);
    this.lastYaw = P.yaw;
    this.turnS = lerp(this.turnS || 0, turn, 0.2);
    this.hands.update(dt, { running: P.running, bobT: P.bobT, bobAmp: P.bobAmp, turn: this.turnS, radar, eatingProgress: R.eatingP });
    this.fx.update(dt, cam.position, { on: R.flash, flick: R.lightK, fx: cd.x, fy: cd.y, fz: cd.z });

    // ---- Audio & Adaptive Tension ----
    A.update(dt, { x: P.pos.x, y: P.eyeY, z: P.pos.z, yaw: P.yaw });
    const unhelpedCrew = ['ana', 'bix', 'chen', 'dara'].filter((id) => R.crewState[id] !== 'helped').length;
    this.adaptive.update(dt, {
      stage: R.stageIdx,
      timeLeft: R.timeLeft,
      mdist: mdistT,
      monsterState: M.state,
      powerPct: R.power,
      power: R.power,
      darkT: R.darkT,
      draining: R.draining,
      caught: false,
      monsterPos: { x: M.x, z: M.z },
      playerPos: P.pos,
      running: P.running,
      health: R.health,
      unhelpedCrew,
      recentlyChased: R.recentlyChasedT > 0,
    });
    this.nearGen(dt, P);

    // ---- HUD Status Line (includes Food count, Keycards, Decoys) ----
    ui.bars(R.health, R.power, R.noise, R.timeLeft, S.run.length);
    const handLabel = R.item === 'blue' ? 'BLUE CARD' : R.item === 'red' ? 'RED CARD' : R.item === 'pry_bar' ? 'PRY BAR' : R.item === 'food' && R.foodList[0] ? S.food.types[R.foodList[0]].label : R.item.toUpperCase();
    ui.status(`LIGHT ${R.flash ? 'ON' : 'OFF'} | HAND: ${handLabel} | KEYS: ${R.cards.red ? 'RED ' : ''}${R.cards.blue ? 'BLUE' : ''}${!R.cards.red && !R.cards.blue ? 'NONE' : ''} | DECOYS: ${R.decoys} | FOOD: ${R.foodList.length}`);
    if (!R.charging && !R.holdAction && R.eatingP <= 0) ui.ring(null);

    if ((this.settings.compass && this.save.records.wins > 0) || R.helideckRevealed) {
      const pw = W.pod.wall, dx = pw.x - P.pos.x, dz = pw.z - P.pos.z, a = Math.atan2(-dx, -dz) - P.yaw;
      const d = ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      ui.compass(`HELIDECK ${Math.round(Math.hypot(dx, dz) / 2)} TILES ${Math.abs(d) < 0.5 ? '^' : d > 0 ? '<<' : '>>'}`);
    } else ui.compass(null);

    if (this.showDebug) ui.debug(this.debugText(mdistT));
    if (this.showAudioDebug) ui.adebug(this.audioDebugText(mdistT));
    this.R = R;
  }

  cancelCharge() {
    const R = this.run;
    if (!R.charging) return;
    R.charging.charging = false;
    R.charging = null;
    R.chargeP = 0;
    this.chargeVoice?.stop(0.1);
    this.chargeVoice = null;
    this.ui.ring(null);
    this.audio.play('generator-down', { bus: 'sfx', vol: 0.6, sub: false });
    this.ui.msg('Charging interrupted.', 2000);
  }

  radarData() {
    const P = this.player, f = P.forward(), r = { x: -f.z, z: f.x }, range = CFG.scanner.radiusTiles * 2, dots = [];
    const add = (x, z, kind, dirOnly = false) => {
      const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range && kind !== 'helideck') return;
      const scale = kind === 'helideck' ? Math.max(range, d + 1) : range;
      dots.push({ kind, dirOnly, x: (dx * r.x + dz * r.z) / scale, y: -(dx * f.x + dz * f.z) / scale });
    };
    for (const l of this.world.lockers) if (!l.opened) add(l.pos.x, l.pos.z, 'locker');
    if (this.run.helideckRevealed) add(this.world.pod.pos.x, this.world.pod.pos.z, 'helideck');

    // Scanner monster display depends on difficulty (Prompt 3 Section 3)
    const mode = this.ai.diff?.scannerMode || 'clear';
    if (mode === 'clear') {
      add(this.ai.x, this.ai.z, 'monster');
    } else if (mode === 'unreliable') {
      if (Math.sin(this.t * 9) > -0.3) {
        add(this.ai.x + Math.sin(this.t * 3) * 2.5, this.ai.z + Math.cos(this.t * 3) * 2.5, 'monster');
      }
    } else if (mode === 'direction') {
      add(this.ai.x, this.ai.z, 'monster', true);
    }
    return { dots };
  }

  drawHudRadar(data) {
    const cv = this.ui.radar();
    cv.classList.remove('bs-hide');
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 150, 150);
    c.fillStyle = 'rgba(2,16,8,.85)';
    c.fillRect(0, 0, 150, 150);
    c.strokeStyle = '#1fe060';
    c.lineWidth = 1;
    for (const r of [25, 50, 72]) { c.beginPath(); c.arc(75, 75, r, 0, 6.3); c.stroke(); }
    const a = this.t * 5;
    c.strokeStyle = '#7dffa8';
    c.beginPath(); c.moveTo(75, 75); c.lineTo(75 + Math.cos(a) * 72, 75 + Math.sin(a) * 72); c.stroke();
    for (const d of data.dots) {
      if (d.dirOnly) {
        const ang = Math.atan2(d.y, d.x);
        c.strokeStyle = '#ff3020'; c.lineWidth = 4;
        c.beginPath(); c.arc(75, 75, 68, ang - 0.35, ang + 0.35); c.stroke();
      } else {
        c.fillStyle = d.kind === 'monster' ? '#ff2020' : d.kind === 'helideck' ? '#ffe030' : '#28ff68';
        c.beginPath(); c.arc(75 + d.x * 72, 75 + d.y * 72, d.kind === 'monster' ? 6 : 4, 0, 6.3); c.fill();
      }
    }
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(75, 75, 3, 0, 6.3); c.fill();
  }

  updateThrown(dt) {
    const g = CFG.decoy.gravity;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.vy -= g * dt;
      const nx = t.x + t.vx * dt, nz = t.z + t.vz * dt, ny = t.y + t.vy * dt;
      const tile = this.level.tiles[Math.floor(nz / 2) * this.level.W + Math.floor(nx / 2)];
      if (tile === 1 || tile === 2 || (tile === 3 && this.physics.doorAt.get(Math.floor(nz / 2) * this.level.W + Math.floor(nx / 2))?.blocking())) {
        t.vx *= -0.3; t.vz *= -0.3;
      } else { t.x = nx; t.z = nz; }
      t.y = ny;
      if (t.y < 3 && t.y > 2.9) t.vy = -Math.abs(t.vy) * 0.3;
      t.m.position.set(t.x, Math.max(0.08, t.y), t.z);
      t.m.rotation.x += t.spin * dt;
      t.m.rotation.z += t.spin * 0.6 * dt;
      if (t.y <= 0.08) {
        t.y = 0.08;
        if (t.bounces === 0) {
          this.audio.play('decoy-clatter', { bus: 'sfx', vol: 1, pos: { x: t.x, y: 0.2, z: t.z }, send: 0.5 });
          this.ai.decoy(t.x, t.z);
          this.fx.burstSpark(t.x, 0.2, t.z);
          this.ui.msg('Decoy clatters away...', 1800);
        }
        t.bounces++;
        t.vy = Math.abs(t.vy) * 0.35;
        t.vx *= 0.6; t.vz *= 0.6;
        if (t.bounces > 3) { this.scene.remove(t.m); this.thrown.splice(i, 1); }
      }
    }
  }

  emitters(dt, P) {
    const W = this.world, A = this.audio, em = W.emitters;
    for (const e of em.steam) {
      if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 18) {
        e.ph -= dt;
        if (e.ph <= 0) { e.ph = 0.16; this.fx.puffSteam(e.x, e.y, e.z); }
        if (!e.snd || this.t - e.snd > 5) { e.snd = this.t; A.play('steam', { bus: 'sfx', vol: 0.35, pos: { x: e.x, y: e.y, z: e.z }, sub: false }); }
      }
    }
    for (const e of em.spark) {
      if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 20) {
        e.next -= dt;
        if (e.next <= 0) { e.next = 3 + Math.random() * 7; this.fx.burstSpark(e.x, e.y, e.z); A.play('spark', { bus: 'sfx', vol: 0.5, pos: { x: e.x, y: e.y, z: e.z }, send: 0.3 }); }
      }
    }
    for (const e of em.drip) {
      if (W.visible.has(e.room) && Math.hypot(e.x - P.pos.x, e.z - P.pos.z) < 14) {
        e.next -= dt;
        if (e.next <= 0) { e.next = 2 + Math.random() * 5; A.play('drip', { bus: 'sfx', vol: 0.45, pos: { x: e.x, y: 0.1, z: e.z }, sub: false }); }
      }
    }
  }

  nearGen(dt, P) {
    const A = this.audio;
    let best = null, bd = 18;
    for (const g of this.world.generators) {
      if (!g.spent) {
        const d = Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z);
        if (d < bd) { bd = d; best = g; }
      }
    }
    if (best && !this.run.charging) {
      if (!this.genHum || this.genHum.dead) {
        this.genHum = A.play('generator-hum', { bus: 'ambience', vol: 0.0, loop: true, jitter: 0, pos: { x: best.pos.x, y: 1.4, z: best.pos.z }, send: 0.2, sub: false });
      }
      if (this.genHum) {
        this.genHum.pos = { x: best.pos.x, y: 1.4, z: best.pos.z };
        A.setPos(this.genHum.panner, this.genHum.pos);
        this.genHum.setVol(0.35 * (1 - bd / 18), 0.3);
      }
    } else if (this.genHum) {
      this.genHum.stop(0.5);
      this.genHum = null;
    }
  }

  // ------------------------------------------------------------------ 3-Variant Sudden Jump Scare (Prompt 3 Section 5)
  beginCaught(forcedVariant = null) {
    const R = this.run, P = this.player, mm = this.monsterModel;
    this.state = 'caught';
    R.caughtT = 0;
    this.ui.showHud(false);
    this.terminalOpen = null;
    this.modalOpen = null;
    this.touch.show(false);
    this.input.releaseLock();

    // Duck every other sound to zero in 30 ms
    this.adaptive.stop(0.03);
    this.audio.stopAll(0.03);
    this.audio.duck(0.0, 2.0, 0.5, ['music', 'ambience', 'sfx', 'foot']);

    // Pick 1 of 3 jump scare variants without repeating the last one:
    // 0: straight face close-up
    // 1: low angle from the floor with long arms reaching toward camera
    // 2: side attack from a doorway/corner
    if (forcedVariant !== null) {
      this.scareVariant = forcedVariant;
    } else {
      const choices = [0, 1, 2].filter((v) => v !== this.lastScareVariant);
      this.scareVariant = choices[Math.floor(Math.random() * choices.length)];
    }
    this.lastScareVariant = this.scareVariant;

    const f = P.forward();
    this.caughtF = f;
    mm.root.position.set(P.pos.x + f.x * 0.95, 0, P.pos.z + f.z * 0.95);
    mm.root.rotation.y = Math.atan2(-f.x, -f.z);
    mm.root.visible = true;
    mm.setJawOpen(1.0);

    // Safety setting: Jump scare off -> simple fade to black with a short sound
    const volCap = this.settings.limitScareVolume ? 0.5 : 1.0;
    if (this.settings.jumpScareOff) {
      this.audio.play('sting-lose', { bus: 'monster', vol: 0.5 * volCap, sub: false });
    } else {
      this.audio.play('jumpscare-scream', { bus: 'monster', vol: 1.0 * volCap, send: 0.1, sub: false });
    }
    this.caughtLight = new THREE.PointLight(0xd8e8ff, this.settings.jumpScareOff ? 0 : 16, 6, 2);
    this.scene.add(this.caughtLight);
  }

  updateCaught(dt) {
    const R = this.run, mm = this.monsterModel, P = this.player;
    R.caughtT += dt;
    const f = this.caughtF;
    const totalDur = CFG.jumpscare.durationSec + CFG.jumpscare.silenceSec; // 1.0s + 0.4s silence = 1.4s

    if (this.settings.jumpScareOff) {
      this.fx.u.uFlick.value = Math.max(0, 1 - R.caughtT * 2.0);
      if (R.caughtT >= totalDur) {
        this.scene.remove(this.caughtLight);
        this.fx.u.uFlick.value = 1;
        this.finish('caught');
      }
      return;
    }

    mm.animate(dt, { speed: 0, hunting: true, mode: 'caught', clip: 'kill_grab', dist: 0.4 });
    mm.setJawOpen(1.0);
    const head = mm.getHeadWorldPos();

    // FOV punch from 72 to 105 degrees over 60 ms
    const fovK = Math.min(1, R.caughtT / (CFG.jumpscare.fovPunchMs / 1000));
    this.camera.fov = CFG.jumpscare.fovBase + (CFG.jumpscare.fovPunch - CFG.jumpscare.fovBase) * (R.caughtT < 0.25 ? fovK : Math.max(0, 1 - (R.caughtT - 0.25) * 1.2));
    this.camera.updateProjectionMatrix();

    // Strong camera shake decaying over 600 ms
    const shakeDecay = Math.max(0, 1 - R.caughtT / (CFG.jumpscare.shakeDecayMs / 1000));
    const shakeAmp = (this.settings.reduceFlashing ? 0.02 : 0.065) * shakeDecay;
    const jx = (Math.random() - 0.5) * shakeAmp, jy = (Math.random() - 0.5) * shakeAmp;

    // 3 Camera Variants (Prompt 3 Section 5)
    const rightX = -f.z, rightZ = f.x;
    if (this.scareVariant === 0) {
      // Variant 1: Straight face close-up (unhinged face fills ~70% of screen)
      this.camera.position.set(head.x - f.x * 0.46 + jx, head.y - 0.02 + jy, head.z - f.z * 0.46 + jx);
      this.camera.lookAt(head.x, head.y - 0.04, head.z);
    } else if (this.scareVariant === 1) {
      // Variant 2: Low angle from the floor with long arms reaching toward camera
      this.camera.position.set(head.x - f.x * 0.62 + jx, 0.55 + jy, head.z - f.z * 0.62 + jx);
      this.camera.lookAt(head.x, head.y - 0.12, head.z);
    } else {
      // Variant 3: Side attack from doorway/corner whip-pan
      const whip = Math.min(1, R.caughtT / 0.09);
      this.camera.position.set(head.x - f.x * 0.44 + rightX * (1 - whip) * 0.45 + jx, head.y - 0.02 + jy, head.z - f.z * 0.44 + rightZ * (1 - whip) * 0.45 + jx);
      this.camera.lookAt(head.x, head.y - 0.04, head.z);
    }

    this.caughtLight.position.copy(this.camera.position).add(new THREE.Vector3(0, 0.1, 0));

    // 0 to 100 ms: 3 frames of white and red inversion flashes (unless Reduce Flashing is on)
    if (!this.settings.reduceFlashing && R.caughtT <= 0.10) {
      const frameIdx = Math.floor(R.caughtT / 0.033);
      this.fx.u.uRed.value = frameIdx % 2 === 0 ? 1.0 : 0.0;
      this.fx.u.uFlick.value = frameIdx % 2 === 1 ? 2.4 : 0.6;
    } else if (R.caughtT >= CFG.jumpscare.durationSec) {
      // 0.4 seconds of silence & blackout before end screen
      this.fx.u.uFlick.value = 0.0;
      this.fx.u.uRed.value = 0.0;
      this.caughtLight.intensity = 0;
    } else {
      this.fx.u.uRed.value = 0.25;
      this.fx.u.uFlick.value = 1.0;
    }

    this.spot.intensity = 0;
    this.hands.scene.visible = false;
    this.world.updateVisibility(P.pos.x, P.pos.z);
    this.world.update(dt, this.t, { px: P.pos.x, pz: P.pos.z });
    this.fx.update(dt, this.camera.position, { on: false, flick: 0, fx: 0, fy: 0, fz: -1 });
    this.beamMat_(0);

    if (R.caughtT > totalDur) {
      this.scene.remove(this.caughtLight);
      this.hands.scene.visible = true;
      this.fx.u.uFlick.value = 1;
      this.camera.fov = CFG.jumpscare.fovBase;
      this.camera.updateProjectionMatrix();
      this.camera.rotation.order = 'YXZ';
      this.finish('caught');
    }
  }

  // ------------------------------------------------------------------ Helicopter Escape Cutscene (Prompt 5 Section 4.3)
  updateLaunching(dt) {
    const R = this.run;
    R.launchT += dt;
    const P = this.player, W = this.world, u = this.fx.u;
    const k = R.launchT / 3.6;

    // Position camera inside the helicopter cabin looking back through the open door as the rig shrinks into the storm
    if (W.pod?.chopper) {
      W.pod.chopper.position.y = Math.max(0, R.launchT - 0.5) * 2.2;
      const wp = new THREE.Vector3();
      W.pod.chopper.getWorldPosition(wp);
      this.camera.position.set(wp.x, wp.y + 1.45, wp.z + 0.5);
      // Creature stands/kneels at the edge of the helideck below, face hidden in its hands
      const edgeX = (this.level.rooms[this.level.podRoom].x0 + 2) * 2;
      const edgeZ = (this.level.rooms[this.level.podRoom].y0 + 2) * 2;
      if (this.monsterModel) {
        this.monsterModel.root.position.set(edgeX, 0, edgeZ);
        this.monsterModel.root.visible = true;
        this.monsterModel.animate(dt, { speed: 0, clip: R.locketPlaced ? 'recover_sit' : 'idle_weep' });
      }
      this.camera.lookAt(edgeX, 1.2, edgeZ);
    }

    u.uFlick.value = 1;
    u.uPanic.value = 0;
    W.updateVisibility(P.pos.x, P.pos.z);
    W.update(dt, this.t, { px: P.pos.x, pz: P.pos.z });
    this.hands.scene.visible = false;
    this.fx.update(dt, this.camera.position, { on: false, flick: 0, fx: 0, fy: 0, fz: -1 });
    if (R.launchT > 3.8) {
      this.hands.scene.visible = true;
      u.uFlick.value = 1;
      this.finish('pod');
    }
  }

  // F3 Debug Overlay (Prompt 1 Section 1 & Section 3: room bounds, door positions, culling set, template ID & fingerprint, missing edges)
  debugText(md) {
    const M = this.ai, P = this.player, R = this.run, r = this.renderer.info.render;
    const pr = this.world.playerRoom >= 0 ? this.level.rooms[this.world.playerRoom] : null;
    const rmInfo = pr ? `${pr.id}:${pr.roomType} [${pr.sizeClass} ${pr.logicalW}x${pr.logicalH}] tpl=${pr.templateId} fp=${pr.fingerprint.toString(16)}` : 'doorway';
    return `FPS ${this.fps.toFixed(0)}  calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(1)}k  Q:${this.qName}  DIFF:${R.difficulty}\nSEED ${R.seed} (attempts ${this.level.attempts})  WALL LEDGER MISSING: ${this.world.missingWallEdges.length}\nROOM ${rmInfo}\nWALL MIX calm=${(this.level.wallStyleMix.calm * 100).toFixed(0)}% accent=${(this.level.wallStyleMix.accent * 100).toFixed(0)}% heavy=${(this.level.wallStyleMix.heavy * 100).toFixed(0)}%\nMONSTER ${M.state} clip=${M.clip} (${(M.x / 2).toFixed(1)},${(M.z / 2).toFixed(1)}) spd ${(M.speed / 2).toFixed(2)}t/s dist ${md.toFixed(1)}t\nPLAYER tile (${P.tx},${P.tz}) NOISE ${R.noise.toFixed(0)} PWR ${R.power.toFixed(1)} HP ${R.health} FOOD ${R.foodList.length}\nCULLING SET (${this.world.visible.size} rooms): [${[...this.world.visible].join(',')}]`;
  }

  // F4 AI & Audio Debug Overlay (Prompt 3 Section 6 & Prompt 4 Section 7)
  audioDebugText(md) {
    const M = this.ai, ft = M.lastFaceTest || {}, rs = ft.reasons || {};
    const trans = M.transitionLog.slice(-5).map((x) => `${x.t}s: ${x.from}->${x.to} (${x.reason})`).join('\n');
    const snds = this.audio.debugList().slice(0, 14).join('\n');
    return `AI STATE: ${M.state} (${M.stateTimer.toFixed(1)}s) | clip=${M.clip} | dist=${(md * 2).toFixed(1)}m\nFACE TEST: seen=${ft.seen} dwell=${(ft.dwell || 0).toFixed(2)}/${M.diff.faceSeenDwell}s [frust=${!!rs.inFrustum} los=${!!rs.clearLOS} lit=${!!rs.isLit} dot=${!!rs.facingCamera} cov=${!rs.uncovered}]\nTRANSITIONS:\n${trans || '(none)'}\n--- ACTIVE AUDIO (TENSION ${(this.adaptive.tension * 100).toFixed(0)}%) ---\n${snds}`;
  }
}

export function startGame(container) {
  const g = new Game(container);
  window.__bs = g;
  g.init().catch((e) => console.error('init failed', e));
  return g;
}
