// =====================================================================
// BLACKOUT STATION: HALCYON DEEP - gameplay config.
// Every tunable number lives here. Distances marked "tiles" are in grid tiles (1 tile = 2 meters).
// =====================================================================
export const TILE = 2;          // meters per tile
export const CEILING = 3;       // default ceiling height (m)
export const DOOR_H = 2.2;      // door height (m)

export const SCP_ATTRIBUTION = 'Content relating to the SCP Foundation, including the SCP Foundation logo, is licensed under Creative Commons Sharealike 3.0 and all concepts originate from scpwiki.com and its authors. Blackout Station: Halcyon Deep, being derived from this content, is hereby also released under Creative Commons Sharealike 3.0.';

export const CFG = {
  run: { length: 600 },                       // seconds; at 0:00 the rig collapses into the sea
  start: { health: 100, power: 100, decoys: 1, food: 1, flashlightOn: true, difficulty: 'medium' },

  ceiling: {
    standard: 3.0,
    large: 4.0,
    corridor: 2.4,
    helideck: 12.0,
  },

  wall: {
    thickness: 0.3,
    coplanarGap: 0.01,
    styleTarget: { calm: 0.70, accent: 0.25, heavy: 0.05 },
  },

  player: {
    height: 1.7,                // eye height (m)
    radius: 0.3,                // collision circle (m)
    walk: 2,                    // tiles / second (4.0 m/s)
    run: 3.4,                   // tiles / second (6.8 m/s)
    accel: 14,                  // smoothing
    bobWalk: 0.035, bobRun: 0.06, bobFreqWalk: 7.5, bobFreqRun: 10.5,
    mouseSpikeLimit: 220,
    keyTurnSpeed: 2.0,
  },

  // ---- Power: one shared budget (0..max) ----
  power: {
    max: 100,
    flashlightPerSec: 0.22,
    door: 4, terminal: 3, scan: 8, pod: 10, hatch: 0,
    lowPct: 20,
    generatorGain: 30,
    anaSiphon: 20, chenCut: 25,
    anaFree: 15, chenSeal: 20,
    podMin: 10,
  },

  // ---- Noise (0..100) ----
  noise: {
    max: 100, decay: 10, still: 0, walk: 5, run: 32,
    door: 22, doorClose: 10, hatch: 45, scan: 35, terminal: 10, generatorPerSec: 22,
    eat: 5,
    powerOutFloor: 60,
    powerOutHearing: 90,
    bixDistress: 100,
  },

  // ---- Health / darkness ----
  dark: {
    warnAfter: 40,
    drainAfter: 60,
    drainAmount: 5, drainEvery: 3,
    recoverMult: 3,
  },

  // ---- Generators ----
  generator: {
    holdSeconds: 8, powerGain: 30,
    maxDistance: 2,
    startReach: 1.5,
    facingDot: 0.55,
  },

  interact: { reach: 1.5, facingDot: 0.58 },
  door: {
    openTime: 1.5,
    closeTime: 0.9,
    closeHoldSeconds: 0.5,
    hatchOpenTime: 1.9,
    escapeOpenTime: 3.0,
    monsterAutoClose: 6.0,
  },

  // ---- Supply Chests & Food ----
  chest: {
    openTime: 0.6,
    countMin: 8,
    countMax: 14,
  },
  food: {
    maxCarry: 4,
    eatSeconds: 1.5,
    eatNoise: 5,
    types: {
      ration: { id: 'ration', label: 'RATION', heal: 10, weight: 0.50 },
      stew:   { id: 'stew',   label: 'STEW',   heal: 12, weight: 0.30 },
      soup:   { id: 'soup',   label: 'SOUP',   heal: 15, weight: 0.20, galleyOnly: true },
    },
  },

  // ---- Items ----
  scanner: { duration: 4, radiusTiles: 14 },
  decoy: { ignoreSeconds: 6, playerOverrideTiles: 2.5, throwSpeed: 9, gravity: 14 },
  terminals: { bixHuntSeconds: 8 },

  // ---- Crew Rescues (Step 5) ----
  crew: {
    anaShelfSeconds: 6,
    anaShelfNoisePerSec: 15,
    anaStimSeconds: 2,
    anaHelpHealth: 20,
    anaLeavePower: 20,
    bixWrongNoise: 20,
    bixLeaveQuietSec: 60,
    chenValveSeconds: 3,
    chenValveNoise: 25,
    chenPenaltySec: 10,
    chenHelpPower: 30,
    chenLeavePower: 25,
    daraCalmRadius: 3.5,
    daraMaxNoise: 10,
    daraCalmSeconds: 10,
    daraHelpFood: 2,
    daraLeaveFood: 3,
  },

  // ---- Four Difficulty Levels (Step 3) ----
  difficulties: {
    easy: {
      id: 'easy',
      label: 'EASY',
      desc: 'Forgiving gaze dwell (0.4s), 25s distress wind-up, slower rage sprint, clear scanner blips.',
      roamSpeed: 1.2,
      hearingRange: 20,
      loudNoiseTrigger: 999, // never triggered by loud noise alone
      faceSeenDwell: 0.4,
      distressTime: 25,
      rageSpeed: 3.0,
      rageTracking: 'last_known',
      loseSightTime: 20,
      doorBashTime: 3.0,
      recoverTime: 40,
      scannerMode: 'clear',
    },
    medium: {
      id: 'medium',
      label: 'MEDIUM',
      desc: 'Standard Halcyon Deep experience. 0.25s gaze dwell, 16s wind-up, unreliable scanner blips.',
      roamSpeed: 1.6,
      hearingRange: 35,
      loudNoiseTrigger: 70,
      faceSeenDwell: 0.25,
      distressTime: 16,
      rageSpeed: 3.4,
      rageTracking: 'last_known',
      loseSightTime: 35,
      doorBashTime: 2.0,
      recoverTime: 30,
      scannerMode: 'unreliable',
    },
    hard: {
      id: 'hard',
      label: 'HARD',
      desc: '0.1s gaze dwell, 10s wind-up, relentless exact tracking in rage, direction pulse scanner.',
      roamSpeed: 2.0,
      hearingRange: 50,
      loudNoiseTrigger: 55,
      faceSeenDwell: 0.1,
      distressTime: 10,
      rageSpeed: 3.9,
      rageTracking: 'exact',
      loseSightTime: 60,
      doorBashTime: 1.2,
      recoverTime: 20,
      scannerMode: 'direction',
    },
    extreme: {
      id: 'extreme',
      label: 'EXTREME',
      desc: 'Instant face trigger (0s), 6s wind-up, 4.4 tiles/s sprint, never loses you until the helicopter.',
      roamSpeed: 2.4,
      hearingRange: 75,
      loudNoiseTrigger: 40,
      faceSeenDwell: 0.0,
      distressTime: 6,
      rageSpeed: 4.4,
      rageTracking: 'exact',
      loseSightTime: 9999,
      doorBashTime: 0.6,
      recoverTime: 12,
      scannerMode: 'never',
    },
  },

  // ---- Monster & SCP-096 Style AI ----
  monster: {
    killDistance: 0.6,          // tiles (1.2 m contact in RAGE)
    flinchDistance: 0.75,       // tiles (1.5 m contact in ROAM -> flinches away harmlessly)
    visionRangeMeters: 40,
    headRadius: 0.25,
    headHeight: 2.18,
    faceDotMin: 0.2,
    ambientLightThreshold: 0.35,
    closeLitMeters: 3.0,
    checkHz: 30,
    cctvTrigger: false,
    roamLookupMin: 20,
    roamLookupMax: 45,
    roamLookupHold: 1.5,
    whisperMaxPerRun: 2,
    whisperRadiusMeters: 3.0,
    flashlightNoiseBonus: 18,
    noiseThreshold: 30,
    flashlightSeeTiles: 3,
    noiseHuntSeconds: 3.5,
    searchSeconds: 9,
    pathRepath: 0.25,
    height: 2.4,
    // Time escalation multipliers (4 storm stages)
    stageMultipliers: {
      roamSpeed:    [1.0, 1.1, 1.2, 1.3],
      hearingRange: [1.0, 1.15, 1.3, 1.5],
      distressTime: [1.0, 0.9, 0.8, 0.7],
    },
    stages: [
      { id: 'calm',       from: 300, hearing: 40, chase: 3.1,  wander: 1.6, headEvery: 40, headHunt: 3, soundMin: 14, soundMax: 26, msg: null },
      { id: 'aggressive', from: 150, hearing: 50, chase: 3.2,  wander: 2.0, headEvery: 22, headHunt: 3, soundMin: 9,  soundMax: 16, msg: 'The storm is getting worse. Waves slam against the rig legs.' },
      { id: 'very',       from: 60,  hearing: 60, chase: 3.3,  wander: 2.5, headEvery: 10, headHunt: 6, soundMin: 6,  soundMax: 11, msg: 'The storm is getting worse. Sleet lashes the steel bulkheads.' },
      { id: 'frenzy',     from: 0,   hearing: 75, chase: 3.38, wander: 3.0, headEvery: 6,  headHunt: 8, soundMin: 3,  soundMax: 6,  msg: 'The storm is getting worse. One minute left.' },
    ],
    chaseMusicTiles: 16,
    heartSlowTiles: 16, heartFastTiles: 7,
    startRoomsMin: 2, startRoomsMax: 5,
    hardWanderMult: 1.15, hardChaseMult: 1.05, hardHeadMult: 0.7,
  },

  jumpscare: {
    flashFrames: 3,
    fovBase: 72,
    fovPunch: 105,
    fovPunchMs: 60,
    shakeDecayMs: 600,
    durationSec: 1.0,
    silenceSec: 0.4,
    volumeCapDb: -6,
  },

  hard: { startPower: 70, generatorGain: 25 },

  // ---- Visual feel ----
  fx: {
    flashlight: { color: 0xfff1d6, intensity: 58, angle: 0.62, penumbra: 0.65, distance: 30, decay: 1.55 },
    fogDensity: 0.042,
    ambient: 0.35,
    shakeScale: 1,
    lightningInterval: [14, 34],
  },

  quality: {
    low:    { pixelRatio: 0.7, shadow: 512,  shadows: true,  pointLights: 3, bloom: false, ao: false, tex: 0.6,  msaa: 0, rooms: 2, particles: 80 },
    medium: { pixelRatio: 1.0, shadow: 1024, shadows: true,  pointLights: 5, bloom: true,  ao: false, tex: 0.85, msaa: 0, rooms: 2, particles: 160 },
    high:   { pixelRatio: 1.5, shadow: 2048, shadows: true,  pointLights: 7, bloom: true,  ao: true,  tex: 1.0,  msaa: 4, rooms: 3, particles: 260 },
  },

  audio: {
    master: 0.8,
    music: 0.7,
    ambience: 0.8,
    monster: 0.95,
    sfx: 0.9,
    foot: 0.8,
    ui: 0.8,
    occlusionWallWeight: 0.35,
    occlusionDoorWeight: 0.5,
    distanceClasses: {
      monster:  { refDistance: 2.0, maxDistance: 50, rolloffFactor: 1.35 },
      sfx:      { refDistance: 3.0, maxDistance: 65, rolloffFactor: 1.3 },
      ambience: { refDistance: 4.0, maxDistance: 80, rolloffFactor: 1.1 },
      foot:     { refDistance: 2.2, maxDistance: 36, rolloffFactor: 1.4 },
    },
    monsterBands: {
      far:  [12, 25],
      mid:  [6, 12],
      near: [0, 6],
    },
    silenceInterval: [90, 150],
    silenceDuration: [8, 12],
    waveInterval: [25, 60],
  },
};

// Default key bindings (rebindable in Settings)
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', light: 'KeyL', swap: 'KeyQ', use: 'Space', interact: 'KeyE',
  journal: 'KeyJ',
  choice1: 'Digit1', choice2: 'Digit2',
};

export function stageFor(timeLeft) {
  const s = CFG.monster.stages;
  if (timeLeft > s[0].from) return 0;
  if (timeLeft > s[1].from) return 1;
  if (timeLeft > s[2].from) return 2;
  return 3;
}
