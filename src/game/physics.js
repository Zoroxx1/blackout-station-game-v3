// Circle-vs-grid + AABB collision (player capsule is a circle in plan view).
import { T_WALL, T_BLOCK, T_DOOR } from './levelgen.js';

export class Physics {
  constructor(level) {
    this.L = level; this.W = level.W;
    this.doorAt = new Map();
    this.rects = new Map();
    for (const r of level.colliders) {
      for (let tz = Math.floor(r.z0 / 2); tz <= Math.floor(r.z1 / 2); tz++) for (let tx = Math.floor(r.x0 / 2); tx <= Math.floor(r.x1 / 2); tx++) {
        const k = tz * this.W + tx; if (!this.rects.has(k)) this.rects.set(k, []); this.rects.get(k).push(r);
      }
    }
  }
  registerDoor(d) { this.doorAt.set(d.ty * this.W + d.tx, d); }
  tile(tx, ty) { const L = this.L; return tx < 0 || ty < 0 || tx >= L.W || ty >= L.H ? T_WALL : L.tiles[ty * L.W + tx]; }
  // Push a circle out of an AABB.
  static push(p, r, x0, x1, z0, z1) {
    const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
    let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 < 1e-9) { // center inside: push along shortest axis
      const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b);
      if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
      return true;
    }
    const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; return true;
  }
  resolve(p, r) {
    for (let it = 0; it < 3; it++) {
      const tx0 = Math.floor((p.x - r) / 2), tx1 = Math.floor((p.x + r) / 2), tz0 = Math.floor((p.z - r) / 2), tz1 = Math.floor((p.z + r) / 2);
      let hit = false;
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tile(tx, tz);
        if (t === T_WALL || t === T_BLOCK) hit = Physics.push(p, r, tx * 2, tx * 2 + 2, tz * 2, tz * 2 + 2) || hit;
        else if (t === T_DOOR) {
          const d = this.doorAt.get(tz * this.W + tx);
          if (d && d.blocking()) { // thin slab in the middle of the cell
            const cx = tx * 2 + 1, cz = tz * 2 + 1;
            hit = (d.axis === 'x' ? Physics.push(p, r, cx - 0.12, cx + 0.12, tz * 2, tz * 2 + 2) : Physics.push(p, r, tx * 2, tx * 2 + 2, cz - 0.12, cz + 0.12)) || hit;
          }
        }
        const rs = this.rects.get(tz * this.W + tx);
        if (rs) for (const q of rs) hit = Physics.push(p, r, q.x0, q.x1, q.z0, q.z1) || hit;
      }
      if (!hit) break;
    }
    return p;
  }
  // Is the segment blocked by walls/blocks/closed doors? (sampled; used for LOS, interaction, audio occlusion)
  blockedBetween(x0, z0, x1, z1, countDoors = true) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.4)); let cnt = 0, lastKey = -1;
    for (let i = 1; i < n; i++) {
      const x = x0 + (dx * i) / n, z = z0 + (dz * i) / n, tx = Math.floor(x / 2), tz = Math.floor(z / 2), k = tz * this.W + tx;
      if (k === lastKey) continue; lastKey = k;
      const t = this.tile(tx, tz);
      if (t === T_WALL || t === T_BLOCK) return 99;
      if (t === T_DOOR && countDoors) { const d = this.doorAt.get(k); if (d && d.blocking()) cnt++; }
    }
    return cnt;
  }
}
