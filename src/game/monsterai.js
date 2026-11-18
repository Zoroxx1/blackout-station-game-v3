// Blind-monster AI: hears noise, grid pathfinding (BFS distance fields), wanders, investigates, searches, hunts.
import { CFG, stageFor } from './config.js';
import { GRID } from './levelgen.js';

const D8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

export class MonsterAI {
  constructor(level, physics, hard, rng) {
    this.L = level; this.phys = physics; this.hard = hard; this.rng = rng;
    this.x = (level.monsterStart.tx + 0.5) * 2; this.z = (level.monsterStart.ty + 0.5) * 2; this.yaw = 0;
    this.state = 'wander'; this.speed = 0; this.goal = null; this.field = null; this.fieldGoal = -1; this.repath = 0;
    this.huntT = 0; this.forceT = 0; this.headT = 20; this.lastHeard = null; this.decoyT = 0; this.decoyPos = null; this.searchT = 0; this.searchPick = 0;
    this.soundT = 10; this.stageIdx = 0; this.mode = 'normal'; this.stuck = 0; this.catchT = 0;
    this.W = level.W; this.H = level.H; this.wanderWait = 0; this.dist = new Int16Array(this.W * this.H); this.queue = new Int32Array(this.W * this.H);
  }
  get hunting() { return this.state === 'hunt'; }
  get tx() { return Math.floor(this.x / 2); } get tz() { return Math.floor(this.z / 2); }
  stage() { return CFG.monster.stages[this.stageIdx]; }
  navOk(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.L.nav[ty * this.W + tx] === 1; }
  // BFS distance field from goal tile (8-neighbor, no corner cutting)
  buildField(gx, gy) {
    const { W, H, dist, queue } = this; dist.fill(-1); let qh = 0, qt = 0; const g = gy * W + gx; dist[g] = 0; queue[qt++] = g;
    while (qh < qt) {
      const c = queue[qh++], cx = c % W, cy = (c / W) | 0, cd = dist[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + D8[k][0], ny = cy + D8[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (dist[n] !== -1) continue;
        if (this.L.nav[n] !== 1) continue;
        if (k >= 4 && (!this.navOk(cx + D8[k][0], cy) || !this.navOk(cx, cy + D8[k][1]))) continue;
        dist[n] = cd + 1; queue[qt++] = n;
      }
    }
    this.fieldGoal = g;
  }
  nearestNav(tx, ty) {
    if (this.navOk(tx, ty)) return [tx, ty];
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.navOk(tx + dx, ty + dy)) return [tx + dx, ty + dy];
    return [this.tx, this.tz];
  }
  los(x0, z0, x1, z1) { const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.5); for (let i = 1; i <= n; i++) { if (!this.navOk(Math.floor((x0 + (dx * i) / n) / 2), Math.floor((z0 + (dz * i) / n) / 2))) return false; } return true; }
  setGoal(x, z) { const [tx, ty] = this.nearestNav(Math.floor(x / 2), Math.floor(z / 2)); this.goal = { x: (tx + 0.5) * 2, z: (ty + 0.5) * 2, tx, ty }; this.fieldGoal = -1; }
  pickWanderGoal() {
    const L = this.L, cur = this.roomIdx(); const r = L.rooms[this.rng.int(0, L.rooms.length - 1)];
    const tx = r.x0 + this.rng.int(2, 5), ty = r.y0 + (this.rng.chance(0.5) ? 3 + this.rng.int(0, 1) : this.rng.int(2, 5));
    this.setGoal((tx + 0.5) * 2, (ty + 0.5) * 2);
  }
  roomIdx() { const tx = this.tx, ty = this.tz; const rx = Math.floor((tx - 1) / GRID.STEP), ry = Math.floor((ty - 1) / GRID.STEP); const r = this.L.rooms.find((q) => q.rx === rx && q.ry === ry); return r ? r.id : 0; }
  decoy(x, z) { this.decoyPos = { x, z }; this.decoyT = CFG.decoy.ignoreSeconds; this.state = 'investigate'; this.setGoal(x, z); this.huntT = 0; this.forceT = 0; }
  forceHunt(seconds) { this.forceT = Math.max(this.forceT, seconds); this.knows = true; }
  update(dt, c) {
    // c: {px,pz, noise, light, timeLeft, powerOut, bixHunt}
    const stIdx = stageFor(c.timeLeft); this.stageIdx = stIdx; const S = CFG.monster.stages[stIdx], mc = CFG.monster;
    const chase = S.chase * (this.hard ? mc.hardChaseMult : 1) * 2, wander = S.wander * (this.hard ? mc.hardWanderMult : 1) * 2;
    this.headT -= dt; if (this.headT <= 0) { this.headT = S.headEvery * (this.hard ? mc.hardHeadMult : 1); this.forceHunt(S.headHunt); }
    const dx = c.px - this.x, dz = c.pz - this.z, distT = Math.hypot(dx, dz) / 2; this.distTiles = distT;
    const eff = c.noise + (c.light ? mc.flashlightNoiseBonus : 0), hearing = c.powerOut ? Math.max(S.hearing, CFG.noise.powerOutHearing) : S.hearing;
    if (this.decoyT > 0) this.decoyT -= dt;
    const canHear = this.decoyT <= 0 || distT <= CFG.decoy.playerOverrideTiles;
    const trig = canHear && ((eff > mc.noiseThreshold && distT <= hearing) || (c.light && distT <= mc.flashlightSeeTiles));
    if (c.bixHunt) this.forceHunt(CFG.terminals.bixHuntSeconds);
    if (trig) { this.huntT = mc.noiseHuntSeconds; this.lastHeard = { x: c.px, z: c.pz }; if (this.state !== 'hunt') { this.state = 'hunt'; this.fieldGoal = -1; } }
    if (this.forceT > 0) { this.forceT -= dt; this.lastHeard = { x: c.px, z: c.pz }; if (this.state !== 'hunt') { this.state = 'hunt'; this.fieldGoal = -1; } this.huntT = Math.max(this.huntT, 0.5); }
    let speed = wander;
    if (this.state === 'hunt') {
      speed = chase; if (!trig && this.forceT <= 0) this.huntT -= dt;
      if (this.lastHeard) this.setGoalSoft(this.lastHeard.x, this.lastHeard.z);
      const arrived = this.goal && Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.4;
      if (this.huntT <= 0 || (arrived && !trig && this.forceT <= 0)) { this.state = 'search'; this.searchT = mc.searchSeconds; this.searchPick = 0; this.searchCenter = { x: this.x, z: this.z }; }
    } else if (this.state === 'investigate') {
      speed = chase;
      if (this.goal && Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.4) { this.state = 'search'; this.searchT = mc.searchSeconds; this.searchCenter = { x: this.x, z: this.z }; this.searchPick = 0; }
    } else if (this.state === 'search') {
      speed = wander; this.searchT -= dt;
      if (!this.goal || Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.2) {
        // search pattern: sweep around the heard position in a rough ring
        const a = this.searchPick++ * 1.9 + this.rng.next(), rad = 3 + (this.searchPick % 3) * 2.5, cx = this.searchCenter.x, cz = this.searchCenter.z;
        this.setGoal(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad); this.wanderWait = 0.8;
      }
      if (this.searchT <= 0) { this.state = 'wander'; this.goal = null; }
    } else { // wander
      speed = wander;
      if (!this.goal || Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.4) { if (this.wanderWait > 0) { this.wanderWait -= dt; speed = 0; } else { if (this.goal) this.wanderWait = this.rng.range(0.5, 2.5); this.pickWanderGoal(); } }
    }
    if (this.wanderWait > 0 && this.state !== 'hunt' && this.state !== 'investigate') { this.wanderWait -= dt; speed = 0; }
    this.move(dt, speed);
    // catch
    this.mode = 'normal';
    if (distT <= mc.killDistance && this.phys.blockedBetween(this.x, this.z, c.px, c.pz, false) === 0) this.caught = true;
    else if (distT < 2.2 && this.state === 'hunt') this.mode = 'lunge';
    return this.caught;
  }
  setGoalSoft(x, z) { const gx = Math.floor(x / 2), gy = Math.floor(z / 2); if (!this.goal || this.goal.tx !== gx || this.goal.tz !== gy) { this.setGoal(x, z); this.goal.tz = gy; } }
  move(dt, speed) {
    this.speed = 0; if (!this.goal || speed <= 0) return;
    const { W } = this; this.repath -= dt;
    if (this.fieldGoal !== this.goal.ty * W + this.goal.tx || this.repath <= 0) {
      if (this.fieldGoal !== this.goal.ty * W + this.goal.tx) this.buildField(this.goal.tx, this.goal.ty); this.repath = CFG.monster.pathRepath;
    }
    let ax = this.goal.x, az = this.goal.z;
    const dgoal = Math.hypot(ax - this.x, az - this.z);
    if (!(dgoal < 10 && this.los(this.x, this.z, ax, az))) {
      const cx = this.tx, cy = this.tz; let best = this.dist[cy * W + cx], bx = -1, by = -1;
      if (best < 0) { const [nx, ny] = this.nearestNav(cx, cy); ax = (nx + 0.5) * 2; az = (ny + 0.5) * 2; }
      else {
        for (let k = 0; k < 8; k++) {
          const nx = cx + D8[k][0], ny = cy + D8[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue; const d = this.dist[ny * W + nx]; if (d < 0) continue;
          if (k >= 4 && (!this.navOk(cx + D8[k][0], cy) || !this.navOk(cx, cy + D8[k][1]))) continue;
          if (d < best) { best = d; bx = nx; by = ny; }
        }
        if (bx >= 0) { ax = (bx + 0.5) * 2; az = (by + 0.5) * 2; }
      }
    }
    const dx = ax - this.x, dz = az - this.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt); this.x += (dx / d) * step; this.z += (dz / d) * step; this.speed = step / dt;
      const ty = Math.atan2(-dx, -dz); let df = ty - this.yaw; while (df > Math.PI) df -= 6.283; while (df < -Math.PI) df += 6.283; this.yaw += df * Math.min(1, dt * 7);
    }
  }
}
