// SCP-096 Style Sea Creature AI State Machine (Prompt 3 Section 2 & Section 3):
// States: ROAM, INVESTIGATE, FACE_SEEN, DISTRESS, RAGE, RECOVER
// - 30 Hz face-seen test with 6 strict conditions (frustum, ray LOS, lit check, face dot > 0.2 & uncovered, range <= 40m, dwell time)
// - 4 Difficulty levels (easy, medium, hard, extreme) + 4 storm stage multipliers
// - Respects door state split: never opens red/blue/escape doors; bashes closed normal doors in RAGE without altering lockState
import { CFG, stageFor } from './config.js';
import { GRID } from './levelgen.js';

const D8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

// Pure, unit-testable 6-condition Face-Seen check (Prompt 3 Section 2.3):
// Returns { seen, reasons: { inFrustum, clearLOS, isLit, facingCamera, inRange, uncovered } }
export function evaluateFaceSeen(params) {
  const {
    inFrustum,        // (a) head sphere (r=0.25m) inside camera frustum
    losBlocked,       // (b) ray from camera to head blocked by walls/doors/props (0 = clear)
    inFlashlightCone, // (c1) inside player's flashlight cone
    distMeters,       // distance from camera to head in meters
    ambientLight,     // (c3) room ambient light at head
    faceDot,          // (d) dot(faceForward, directionToCamera)
    isFaceCovered,    // covered by hands during idle_weep / distress / sit_sob never triggers
    visionRange = CFG.monster.visionRangeMeters,
    faceDotMin = CFG.monster.faceDotMin,
    closeLitMeters = CFG.monster.closeLitMeters,
    ambientThreshold = CFG.monster.ambientLightThreshold,
  } = params;

  const condFrustum = !!inFrustum;
  const condLOS = losBlocked === 0;
  const condLit = !!inFlashlightCone || distMeters <= closeLitMeters || (ambientLight ?? 0) >= ambientThreshold;
  const condFacing = !isFaceCovered && faceDot > faceDotMin;
  const condRange = distMeters <= visionRange;

  return {
    seen: condFrustum && condLOS && condLit && condFacing && condRange,
    reasons: {
      inFrustum: condFrustum,
      clearLOS: condLOS,
      isLit: condLit,
      facingCamera: condFacing,
      inRange: condRange,
      uncovered: !isFaceCovered,
    },
  };
}

export class MonsterAI {
  constructor(level, physics, difficultyOrHard = 'medium', rng) {
    this.L = level;
    this.phys = physics;
    const diffKey = typeof difficultyOrHard === 'string'
      ? (CFG.difficulties[difficultyOrHard] ? difficultyOrHard : 'medium')
      : (difficultyOrHard ? 'hard' : 'medium');
    this.setDifficulty(diffKey);
    this.rng = rng;

    this.x = (level.monsterStart.tx + 0.5) * 2;
    this.z = (level.monsterStart.ty + 0.5) * 2;
    this.yaw = 0;

    this.state = 'ROAM';
    this.stateTimer = 0;
    this.speed = 0;
    this.goal = null;
    this.field = null;
    this.fieldGoal = -1;
    this.repath = 0;

    // Timers & tracking
    this.huntT = 0;
    this.forceT = 0;
    this.headT = this.rng ? this.rng.range(CFG.monster.roamLookupMin, CFG.monster.roamLookupMax) : 25;
    this.lookupTimer = 0;
    this.lookupYaw = 0;
    this.faceSeenDwellAcc = 0;
    this.checkAccum = 0;
    this.outOfSightTimer = 0;
    this.bashingDoor = null;
    this.bashTimer = 0;
    this.flinchCooldown = 0;
    this.whispersUsed = 0;
    this.whisperCooldown = 15;

    this.lastHeard = null;
    this.lastKnownPlayerPos = null;
    this.decoyT = 0;
    this.decoyPos = null;
    this.searchT = 0;
    this.searchPick = 0;
    this.stageIdx = 0;
    this.mode = 'normal';
    this.clip = 'idle_weep';
    this.audioState = 'roam';
    this.transitionLog = [];
    this.lastFaceTest = { seen: false, reasons: {}, dwell: 0 };

    this.W = level.W;
    this.H = level.H;
    this.wanderWait = 0;
    this.dist = new Int16Array(this.W * this.H);
    this.queue = new Int32Array(this.W * this.H);
  }

  setDifficulty(diffKey) {
    this.difficultyKey = CFG.difficulties[diffKey] ? diffKey : 'medium';
    this.diff = { ...CFG.difficulties[this.difficultyKey] };
    this.hard = this.difficultyKey === 'hard' || this.difficultyKey === 'extreme';
  }

  transitionTo(nextState, reason = '') {
    if (this.state === nextState) return;
    const prev = this.state;
    this.state = nextState;
    this.stateTimer = 0;
    this.transitionLog.push({ t: Number((this.elapsed || 0).toFixed(2)), from: prev, to: nextState, reason });
    if (this.transitionLog.length > 30) this.transitionLog.shift();

    // Entry actions
    if (nextState === 'FACE_SEEN') {
      this.speed = 0;
      this.clip = 'flinch_face_seen';
      this.audioState = 'distress';
    } else if (nextState === 'DISTRESS') {
      const mult = CFG.monster.stageMultipliers.distressTime[this.stageIdx] ?? 1;
      this.distressRemaining = this.diff.distressTime * mult;
      this.speed = 0;
      this.clip = 'distress_crouch';
      this.audioState = 'distress';
    } else if (nextState === 'RAGE') {
      this.outOfSightTimer = 0;
      this.clip = 'rage_run';
      this.audioState = 'rage';
      this.mode = 'lunge';
    } else if (nextState === 'RECOVER') {
      this.recoverRemaining = this.diff.recoverTime;
      this.speed = 0;
      this.clip = 'recover_sit';
      this.audioState = 'recover';
      this.mode = 'normal';
    } else if (nextState === 'INVESTIGATE') {
      this.clip = 'roam_walk';
      this.audioState = 'roam';
      this.mode = 'normal';
    } else if (nextState === 'ROAM') {
      this.clip = 'roam_walk';
      this.audioState = 'roam';
      this.mode = 'normal';
      this.faceSeenDwellAcc = 0;
    }
  }

  // Compatibility getters
  get hunting() {
    return this.state === 'RAGE' || this.state === 'DISTRESS' || this.state === 'FACE_SEEN';
  }
  get tx() { return Math.floor(this.x / 2); }
  get tz() { return Math.floor(this.z / 2); }
  get position() { return { x: this.x, y: 0, z: this.z }; }
  get distance() { return (this.distTiles ?? 99) * 2; }

  stage() { return CFG.monster.stages[this.stageIdx]; }
  navOk(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.L.nav[ty * this.W + tx] === 1; }

  buildField(gx, gy) {
    const { W, H, dist, queue } = this;
    dist.fill(-1);
    let qh = 0, qt = 0;
    const g = gy * W + gx;
    dist[g] = 0;
    queue[qt++] = g;
    while (qh < qt) {
      const c = queue[qh++], cx = c % W, cy = (c / W) | 0, cd = dist[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + D8[k][0], ny = cy + D8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (dist[n] !== -1 || this.L.nav[n] !== 1) continue;
        if (k >= 4 && (!this.navOk(cx + D8[k][0], cy) || !this.navOk(cx, cy + D8[k][1]))) continue;
        dist[n] = cd + 1;
        queue[qt++] = n;
      }
    }
    this.fieldGoal = g;
  }

  nearestNav(tx, ty) {
    if (this.navOk(tx, ty)) return [tx, ty];
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.navOk(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
    }
    return [this.tx, this.tz];
  }

  los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.5);
    for (let i = 1; i <= n; i++) {
      if (!this.navOk(Math.floor((x0 + (dx * i) / n) / 2), Math.floor((z0 + (dz * i) / n) / 2))) return false;
    }
    return true;
  }

  setGoal(x, z) {
    const [tx, ty] = this.nearestNav(Math.floor(x / 2), Math.floor(z / 2));
    this.goal = { x: (tx + 0.5) * 2, z: (ty + 0.5) * 2, tx, ty };
    this.fieldGoal = -1;
  }

  setGoalSoft(x, z) {
    const gx = Math.floor(x / 2), gy = Math.floor(z / 2);
    if (!this.goal || this.goal.tx !== gx || this.goal.tz !== gy) {
      this.setGoal(x, z);
    }
  }

  pickWanderGoal() {
    const L = this.L;
    // Choose a room that is reachable (not pod or red locked rooms)
    const validRooms = L.rooms.filter((r) => r.id !== L.podRoom && r.id !== L.redRoom);
    const r = validRooms[this.rng.int(0, validRooms.length - 1)];
    const tx = r.x0 + this.rng.int(2, 5), ty = r.y0 + this.rng.int(2, 5);
    this.setGoal((tx + 0.5) * 2, (ty + 0.5) * 2);
  }

  roomIdx() {
    const tx = this.tx, ty = this.tz;
    if (this.L.roomGrid) {
      const rid = this.L.roomGrid[ty * this.W + tx];
      if (rid >= 0) return rid;
    }
    const rx = Math.floor((tx - 1) / GRID.STEP), ry = Math.floor((ty - 1) / GRID.STEP);
    const r = this.L.rooms.find((q) => q.rx === rx && q.ry === ry);
    return r ? r.id : 0;
  }

  // Decoys work in ROAM and INVESTIGATE, but are ignored in RAGE/DISTRESS (Prompt 3 Section 2.2 & 2.5)
  decoy(x, z) {
    if (this.state === 'RAGE' || this.state === 'DISTRESS' || this.state === 'FACE_SEEN') return false;
    this.decoyPos = { x, z };
    this.decoyT = CFG.decoy.ignoreSeconds;
    this.setGoal(x, z);
    this.transitionTo('INVESTIGATE', 'decoy');
    return true;
  }

  // Triggered by tests or terminal events to enter RAGE immediately
  forceHunt(seconds = 10) {
    this.forceT = Math.max(this.forceT, seconds);
    this.transitionTo('RAGE', 'forced');
  }

  update(dt, c) {
    // c: { px, pz, noise, light, timeLeft, powerOut, bixHunt, faceSeenInput, doors }
    this.elapsed = (this.elapsed || 0) + dt;
    this.stateTimer += dt;
    if (this.flinchCooldown > 0) this.flinchCooldown -= dt;
    if (this.whisperCooldown > 0) this.whisperCooldown -= dt;
    if (this.decoyT > 0) this.decoyT -= dt;

    const stIdx = stageFor(c.timeLeft);
    this.stageIdx = stIdx;
    const mc = CFG.monster;
    const mults = mc.stageMultipliers;
    const roamSpeed = this.diff.roamSpeed * (mults.roamSpeed[stIdx] ?? 1) * 2; // m/s
    const rageSpeed = this.diff.rageSpeed * 2; // m/s
    const hearingTiles = (c.powerOut ? Math.max(this.diff.hearingRange, CFG.noise.powerOutHearing) : this.diff.hearingRange) * (mults.hearingRange[stIdx] ?? 1);

    const dx = c.px - this.x, dz = c.pz - this.z, distMeters = Math.hypot(dx, dz), distT = distMeters / 2;
    this.distTiles = distT;

    // 1. 30 Hz Face-Seen Check (in ROAM, INVESTIGATE, or RECOVER)
    if (c.faceSeenInput && (this.state === 'ROAM' || this.state === 'INVESTIGATE' || this.state === 'RECOVER')) {
      const res = evaluateFaceSeen(c.faceSeenInput);
      this.lastFaceTest = { ...res, dwell: this.faceSeenDwellAcc };
      if (res.seen) {
        this.faceSeenDwellAcc += dt;
        this.lastFaceTest.dwell = this.faceSeenDwellAcc;
        if (this.faceSeenDwellAcc >= this.diff.faceSeenDwell) {
          this.lastKnownPlayerPos = { x: c.px, z: c.pz };
          this.transitionTo('FACE_SEEN', 'player_saw_face');
        }
      } else {
        this.faceSeenDwellAcc = Math.max(0, this.faceSeenDwellAcc - dt * 2);
      }
    }

    // Legacy compatibility: if a test sets noise=100 right next to monster without camera frustum input, or bixHunt
    if (c.bixHunt) {
      this.lastKnownPlayerPos = { x: c.px, z: c.pz };
      this.forceHunt(CFG.terminals.bixHuntSeconds);
    } else if (!c.faceSeenInput && c.noise >= 95 && distT <= hearingTiles && this.state !== 'RAGE') {
      this.lastKnownPlayerPos = { x: c.px, z: c.pz };
      this.transitionTo('RAGE', 'extreme_noise_legacy');
    }

    // 2. Hearing Check for INVESTIGATE (and updating lastKnownPlayerPos in RAGE)
    const canHear = this.decoyT <= 0 || distT <= CFG.decoy.playerOverrideTiles;
    const loudNoise = canHear && c.noise >= this.diff.loudNoiseTrigger && distT <= hearingTiles;
    if (loudNoise) {
      this.lastHeard = { x: c.px, z: c.pz };
      this.lastKnownPlayerPos = { x: c.px, z: c.pz };
      if (this.state === 'ROAM') {
        this.setGoal(c.px, c.pz);
        this.transitionTo('INVESTIGATE', 'heard_loud_noise');
      }
    }

    // 3. State Machine Execution
    if (this.state === 'FACE_SEEN') {
      this.speed = 0;
      this.clip = 'flinch_face_seen';
      if (this.stateTimer >= 0.5) {
        this.transitionTo('DISTRESS', 'flinch_complete');
      }
    } else if (this.state === 'DISTRESS') {
      this.speed = 0;
      this.clip = 'distress_crouch';
      this.distressRemaining -= dt;
      // Keep tracking player position if visible/audible during wind-up
      if (this.diff.rageTracking === 'exact' || this.phys.blockedBetween(this.x, this.z, c.px, c.pz, true) === 0 || c.noise > 25) {
        this.lastKnownPlayerPos = { x: c.px, z: c.pz };
      }
      if (this.distressRemaining <= 0) {
        this.transitionTo('RAGE', 'distress_windup_done');
      }
    } else if (this.state === 'RAGE') {
      this.clip = 'rage_run';
      const hasLOS = this.phys.blockedBetween(this.x, this.z, c.px, c.pz, true) === 0;
      const hearsPlayer = c.noise > 15 && distT <= hearingTiles;
      if (this.diff.rageTracking === 'exact' || hasLOS || hearsPlayer || this.forceT > 0) {
        this.lastKnownPlayerPos = { x: c.px, z: c.pz };
      }
      if (this.forceT > 0) this.forceT -= dt;
      if (!hasLOS && !hearsPlayer && this.forceT <= 0) {
        this.outOfSightTimer += dt;
      } else {
        this.outOfSightTimer = 0;
      }

      if (this.lastKnownPlayerPos) {
        this.setGoalSoft(this.lastKnownPlayerPos.x, this.lastKnownPlayerPos.z);
      }

      // Check if blocked by a closed normal door that must be bashed (Prompt 3 Section 2.5)
      if (this.bashingDoor) {
        this.speed = 0;
        this.clip = 'door_bash';
        this.bashTimer -= dt;
        if (this.bashTimer <= 0) {
          this.bashingDoor.monsterBash();
          this.justBashedDoor = this.bashingDoor;
          this.bashingDoor = null;
        }
      } else {
        const blockingDoor = this.findClosedDoorAhead(c.doors);
        if (blockingDoor) {
          this.bashingDoor = blockingDoor;
          this.bashTimer = this.diff.doorBashTime;
          this.speed = 0;
          this.clip = 'door_bash';
        } else {
          this.move(dt, rageSpeed, true);
        }
      }

      // Instant kill on contact in RAGE (Prompt 3 Section 2.5)
      if (distT <= mc.killDistance && this.phys.blockedBetween(this.x, this.z, c.px, c.pz, false) === 0) {
        this.caught = true;
        return true;
      }

      if (this.outOfSightTimer >= this.diff.loseSightTime) {
        this.transitionTo('RECOVER', 'lost_player');
      }
    } else if (this.state === 'RECOVER') {
      this.speed = 0;
      this.clip = this.stateTimer < 3.0 ? 'recover_sit' : 'sit_sob';
      this.recoverRemaining -= dt;
      if (this.recoverRemaining <= 0) {
        this.transitionTo('ROAM', 'recovered');
      }
    } else if (this.state === 'INVESTIGATE') {
      this.clip = 'roam_walk';
      this.openPassableDoorsAhead(c.doors);
      this.move(dt, roamSpeed, false);
      if (!this.goal || Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.4) {
        this.transitionTo('ROAM', 'investigation_complete');
      }
    } else {
      // ROAM (default)
      // Every 20..45s pause and look up toward a random direction for 1.5s
      this.headT -= dt;
      if (this.headT <= 0) {
        this.headT = this.rng.range(mc.roamLookupMin, mc.roamLookupMax);
        this.lookupTimer = mc.roamLookupHold;
        this.lookupYaw = this.rng.range(-1.2, 1.2);
      }

      if (this.lookupTimer > 0) {
        this.lookupTimer -= dt;
        this.speed = 0;
        this.clip = 'roam_pause_lookup';
      } else if (this.wanderWait > 0) {
        this.wanderWait -= dt;
        this.speed = 0;
        this.clip = 'idle_weep';
      } else {
        if (!this.goal || Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.4) {
          if (this.goal) this.wanderWait = this.rng.range(1.2, 3.0);
          this.pickWanderGoal();
        }
        this.openPassableDoorsAhead(c.doors);
        this.move(dt, roamSpeed, true);
        this.clip = this.speed > 0.2 ? 'roam_walk' : 'idle_weep';
      }

      // Prompt 3 Section 2.1: If it touches the player in ROAM while its face is not seen, it does NOT hurt them:
      // it flinches, stumbles and shuffles away.
      if (distT <= mc.flinchDistance && this.flinchCooldown <= 0) {
        this.flinchCooldown = 4.0;
        this.justFlinchedFromPlayer = true;
        this.pickWanderGoal();
      }

      // Prompt 5 Section 1.3: Rarely (at most twice per run, only in ROAM and within 3m) whisper "Nora..."
      if (distMeters <= mc.whisperRadiusMeters && this.whispersUsed < mc.whisperMaxPerRun && this.whisperCooldown <= 0) {
        this.whispersUsed++;
        this.whisperCooldown = 90;
        this.justWhisperedNora = true;
      }
    }

    return false;
  }

  findClosedDoorAhead(doors) {
    if (!doors) return null;
    for (const d of doors) {
      if (d.lockType !== 'none') continue; // Red, blue, and escape doors are impassable
      if (d.physical === 'closed' || d.physical === 'closing') {
        if (Math.hypot(d.pos.x - this.x, d.pos.z - this.z) < 2.2) return d;
      }
    }
    return null;
  }

  openPassableDoorsAhead(doors) {
    if (!doors) return;
    for (const d of doors) {
      if (d.lockType !== 'none') continue;
      if (Math.hypot(d.pos.x - this.x, d.pos.z - this.z) < 2.4) {
        if (d.monsterOpen()) {
          this.justOpenedDoor = d;
        }
      }
    }
  }

  move(dt, speed, faceMovement = true) {
    this.speed = 0;
    if (!this.goal || speed <= 0) return;
    const { W } = this;
    this.repath -= dt;
    if (this.fieldGoal !== this.goal.ty * W + this.goal.tx || this.repath <= 0) {
      if (this.fieldGoal !== this.goal.ty * W + this.goal.tx) this.buildField(this.goal.tx, this.goal.ty);
      this.repath = CFG.monster.pathRepath;
    }
    let ax = this.goal.x, az = this.goal.z;
    const dgoal = Math.hypot(ax - this.x, az - this.z);
    if (!(dgoal < 10 && this.los(this.x, this.z, ax, az))) {
      const cx = this.tx, cy = this.tz;
      let best = this.dist[cy * W + cx], bx = -1, by = -1;
      if (best < 0) {
        const [nx, ny] = this.nearestNav(cx, cy);
        ax = (nx + 0.5) * 2;
        az = (ny + 0.5) * 2;
      } else {
        for (let k = 0; k < 8; k++) {
          const nx = cx + D8[k][0], ny = cy + D8[k][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
          const d = this.dist[ny * W + nx];
          if (d < 0) continue;
          if (k >= 4 && (!this.navOk(cx + D8[k][0], cy) || !this.navOk(cx, cy + D8[k][1]))) continue;
          if (d < best) { best = d; bx = nx; by = ny; }
        }
        if (bx >= 0) { ax = (bx + 0.5) * 2; az = (by + 0.5) * 2; }
      }
    }
    const dx = ax - this.x, dz = az - this.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      this.speed = step / dt;
      if (faceMovement) {
        const ty = Math.atan2(-dx, -dz);
        let df = ty - this.yaw;
        while (df > Math.PI) df -= 6.283;
        while (df < -Math.PI) df += 6.283;
        this.yaw += df * Math.min(1, dt * 7);
      }
    }
  }
}
