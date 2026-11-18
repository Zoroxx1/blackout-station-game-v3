// First-person controller: acceleration, collision, head bob.
import { CFG } from './config.js';

export class Player {
  constructor(level, physics) {
    this.physics = physics;
    this.pos = { x: (level.start.tx + 0.5) * 2, z: (level.start.ty + 0.5) * 2 };
    this.yaw = level.start.yaw; this.pitch = 0; this.vx = 0; this.vz = 0;
    this.speed = 0; this.running = false; this.moving = false; this.bobT = 0; this.bobAmp = 0; this.stepT = 0; this.stepSide = 0; this.stepEvent = false;
    this.eye = CFG.player.height; this.roll = 0;
  }
  get tx() { return Math.floor(this.pos.x / 2); }
  get tz() { return Math.floor(this.pos.z / 2); }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  look(dx, dy, sens, invert) {
    this.yaw -= dx * sens * 0.0022; this.pitch -= dy * sens * 0.0022 * (invert ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }
  update(dt, axes, frozen) {
    const c = CFG.player; this.stepEvent = false;
    let wx = 0, wz = 0, run = false;
    if (!frozen && axes.mag > 0.05) {
      const f = this.forward(), r = { x: -f.z, z: f.x }; // right vector
      wx = f.x * axes.y + r.x * axes.x; wz = f.z * axes.y + r.z * axes.x; run = axes.run;
    }
    const mag = Math.hypot(wx, wz);
    const maxTiles = run ? c.run : c.walk;
    const tgt = mag > 0.001 ? (maxTiles * 2 * Math.min(1, mag)) : 0;
    const dirx = mag > 0.001 ? wx / mag : 0, dirz = mag > 0.001 ? wz / mag : 0;
    const k = Math.min(1, dt * (mag > 0.001 ? 9 : 12));
    this.vx += (dirx * tgt - this.vx) * k; this.vz += (dirz * tgt - this.vz) * k;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; this.physics.resolve(this.pos, c.radius);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.speed = moved; this.moving = moved > 0.5 && !frozen; this.running = this.moving && run && moved > c.walk * 2 * 1.15;
    // bob + footsteps
    const freq = this.running ? c.bobFreqRun : c.bobFreqWalk, amp = this.running ? c.bobRun : c.bobWalk;
    const targetAmp = this.moving ? amp : 0; this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * 8);
    if (this.moving) {
      const prev = this.bobT; this.bobT += dt * freq * Math.min(1.2, moved / (c.walk * 2));
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobT / Math.PI)) { this.stepSide ^= 1; this.stepEvent = true; }
    }
    this.eyeY = this.eye + Math.abs(Math.sin(this.bobT)) * this.bobAmp - this.bobAmp * 0.5;
    this.sideBob = Math.cos(this.bobT) * this.bobAmp * (this.running ? 0.9 : 0.6);
    this.roll += (-(this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw)) * 0.0 + Math.cos(this.bobT) * this.bobAmp * (this.running ? 0.5 : 0.2) - this.roll) * Math.min(1, dt * 8);
  }
}
