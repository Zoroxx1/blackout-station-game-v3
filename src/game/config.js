// =====================================================================
// BLACKOUT STATION - gameplay config. EVERY tunable number lives here.
// Distances marked "tiles" are in grid tiles (1 tile = 2 meters).
// =====================================================================
export const TILE = 2;          // meters per tile
export const CEILING = 3;       // ceiling height (m)
export const DOOR_H = 2.2;      // door height (m)

export const CFG = {
  run: { length: 600 },                       // seconds; at 0:00 the hull fails
  start: { health: 100, power: 100, decoys: 1, flashlightOn: true },

  player: {
    height: 1.7,                // eye height (m)
    radius: 0.3,                // collision circle (m)
    walk: 2,                    // tiles / second
    run: 3.4,                   // tiles / second
    accel: 14,                  // m/s^2 style smoothing
    bobWalk: 0.035, bobRun: 0.06, bobFreqWalk: 7.5, bobFreqRun: 10.5,
    mouseSpikeLimit: 220,       // ignore mouse deltas bigger than this (px)
    keyTurnSpeed: 2.0,          // rad/s for arrow keys
  },

  // ---- Power: one shared budget (0..max) ----
  power: {
    max: 100,
    flashlightPerSec: 0.22,
    door: 4, terminal: 3, scan: 8, pod: 10, hatch: 0,
    lowPct: 20,                 // below this % the flashlight flickers + electrical hum
    generatorGain: 30, anaSiphon: 20, chenCut: 25,
    anaFree: 15, chenSeal: 20,
    podMin: 10,
  },

  // ---- Noise (0..100) ----
  noise: {
    max: 100, decay: 10, still: 0, walk: 5, run: 32,
    door: 22, hatch: 45, scan: 35, terminal: 10, generatorPerSec: 22,
    powerOutFloor: 60,          // at 0 power noise never drops below this
    powerOutHearing: 90,        // hearing range (tiles) at 0 power
    bixDistress: 100,
  },

  // ---- Health / darkness ----
  dark: {
    warnAfter: 40,              // seconds with flashlight off -> warning
    drainAfter: 60,             // seconds -> start losing health
    drainAmount: 5, drainEvery: 3,
    recoverMult: 3,             // flashlight on recovers 3x faster than it builds
  },

  // ---- Generators ----
  generator: {
    holdSeconds: 8, powerGain: 30,
    maxDistance: 2,             // tiles; farther cancels charging
    startReach: 1.5,            // tiles to begin
    facingDot: 0.55,            // cos of max facing angle
  },

  interact: { reach: 1.35, facingDot: 0.62 },       // tiles, cos(angle)
  door: { openTime: 1.5, hatchOpenTime: 1.9 },

  // ---- Items ----
  scanner: { duration: 4, radiusTiles: 12 },
  decoy: { ignoreSeconds: 6, playerOverrideTiles: 2.5, throwSpeed: 9, gravity: 14 },

  // ---- Terminal consequences ----
  terminals: { bixHuntSeconds: 8 },

  // ---- Monster ----
  monster: {
    killDistance: 0.55,         // tiles: contact = instant kill
    flashlightNoiseBonus: 18,   // effective noise bonus while flashlight is on
    noiseThreshold: 30,         // effective noise above this + in range -> hunts
    flashlightSeeTiles: 3,      // flashlight on + closer than this -> hunts
    noiseHuntSeconds: 3.5,      // hunt linger after the last trigger (tunable)
    searchSeconds: 9,           // search pattern time at last heard position
    pathRepath: 0.3,
    height: 2.7,
    // Stages driven by time left (seconds). Order = escalation.
    stages: [
      { id: 'calm',       from: 300,  hearing: 40, chase: 3.1,  wander: 1.6, headEvery: 40, headHunt: 3, soundMin: 14, soundMax: 26, msg: null },
      { id: 'aggressive', from: 150,  hearing: 50, chase: 3.2,  wander: 2.0, headEvery: 22, headHunt: 3, soundMin: 9,  soundMax: 16, msg: 'The station groans. Something is getting restless.' },
      { id: 'very',       from: 60,   hearing: 60, chase: 3.3,  wander: 2.5, headEvery: 10, headHunt: 6, soundMin: 6,  soundMax: 11, msg: 'A howl shakes the station. It is hunting you now.' },
      { id: 'frenzy',     from: 0,    hearing: 75, chase: 3.38, wander: 3.0, headEvery: 6,  headHunt: 8, soundMin: 3,  soundMax: 6,  msg: 'The creature is frenzied. One minute left.' },
    ],
    chaseMusicTiles: 16,        // within this while hunting: chase music/panic
    heartSlowTiles: 16, heartFastTiles: 7,
    startRoomsMin: 2, startRoomsMax: 3.5,
    hardWanderMult: 1.15, hardChaseMult: 1.05, hardHeadMult: 0.7,
  },

  hard: { startPower: 70, generatorGain: 25 },

  // ---- Visual feel ----
  fx: {
    flashlight: { color: 0xfff1d6, intensity: 55, angle: 0.62, penumbra: 0.65, distance: 28, decay: 1.6 },
    fogDensity: 0.055,
    ambient: 0.35,              // very dim hemisphere fill
    shakeScale: 1,
  },

  quality: {
    low:    { pixelRatio: 0.7, shadow: 512,  shadows: true,  pointLights: 3, bloom: false, ao: false, tex: 0.6,  msaa: 0, rooms: 1, particles: 80 },
    medium: { pixelRatio: 1.0, shadow: 1024, shadows: true,  pointLights: 5, bloom: true,  ao: false, tex: 0.85, msaa: 0, rooms: 2, particles: 160 },
    high:   { pixelRatio: 1.5, shadow: 2048, shadows: true,  pointLights: 7, bloom: true,  ao: true,  tex: 1.0,  msaa: 4, rooms: 2, particles: 260 },
  },

  audio: { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8 },
};

// Default key bindings (rebindable in Settings). Values are KeyboardEvent.code
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', light: 'KeyL', swap: 'KeyQ', use: 'Space', interact: 'KeyE',
  choice1: 'Digit1', choice2: 'Digit2',
};

export function stageFor(timeLeft) {
  const s = CFG.monster.stages;
  if (timeLeft > s[0].from) return 0;
  if (timeLeft > s[1].from) return 1;
  if (timeLeft > s[2].from) return 2;
  return 3;
}
