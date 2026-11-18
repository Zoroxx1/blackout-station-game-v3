// World builder: turns level data into real 3D geometry (merged per room), plus animated doors, lockers, terminals, generators, pod.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CEILING, DOOR_H, CFG } from './config.js';
import { T_FLOOR, T_WALL, T_BLOCK, T_DOOR, DX, DY, GRID } from './levelgen.js';
import { RNG, hashSeed } from './rng.js';
import { DECAL, makeScreen, makeLabelTexture } from './textures.js';
import story from './story.json';

const V3 = THREE.Vector3, EUL = new THREE.Euler(), QQ = new THREE.Quaternion();
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { EUL.set(rx, ry, rz, 'YXZ'); QQ.setFromEuler(EUL); return new THREE.Matrix4().compose(new V3(x, y, z), QQ.clone(), new V3(sx, sy, sz)); };
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const KEEP = ['position', 'normal', 'uv'];

function boxGeo(sx, sy, sz, k = 0.5) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv, d = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * d[f][0] * k, uv.getY(i) * d[f][1] * k); }
  return g;
}
function cylGeo(r, h, seg = 12, k = 0.5, rt = r) {
  const g = new THREE.CylinderGeometry(rt, r, h, seg, 1), uv = g.attributes.uv;
  for (let i = 0; i < (seg + 1) * 2; i++) uv.setXY(i, uv.getX(i) * 6.283 * r * k, uv.getY(i) * h * k);
  return g;
}
function setUV(g, rect, rot = 0) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { let u = uv.getX(i), v = uv.getY(i); if (rot) { const t = u; u = v; v = 1 - t; } uv.setXY(i, rect[0] + (rect[2] - rect[0]) * u, rect[1] + (rect[3] - rect[1]) * v); }
  return g;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffc928'; g.beginPath(); g.arc(128, 128, 120, 0, 6.3); g.fill(); g.fillStyle = '#ffe680'; g.beginPath(); g.arc(128, 128, 96, 0, 6.3); g.fill();
  g.strokeStyle = '#a06800'; g.lineWidth = 6; for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283; g.beginPath(); g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke(); }
  g.fillStyle = '#ff9d00'; g.beginPath(); g.arc(128, 128, 38, 0, 6.3); g.fill(); g.fillStyle = '#fff4b0'; g.beginPath(); g.arc(128, 128, 16, 0, 6.3); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const PALETTE = { Medbay: [1, 4, 0, 1], Comms: [3, 3, 0, 6], Lab: [3, 4, 5, 0], Reactor: [7, 2, 7, 5], Cargo: [2, 5, 0, 2], Storage: [6, 2, 0, 1], Quarters: [0, 1, 5, 0], 'Pod Bay': [2, 0, 6, 0], Mess: [1, 0, 4, 5], Engineering: [7, 6, 2, 3] };

export class World {
  constructor(level, tex, renderer, quality, hooks = {}) {
    this.L = level; this.tex = tex; this.q = quality; this.hooks = hooks; this.renderer = renderer;
    this.rng = new RNG(hashSeed('world' + level.seed));
    this.root = new THREE.Group(); this.sources = []; this.doors = []; this.lockers = []; this.terminals = []; this.generators = []; this.pod = null;
    this.emitters = { steam: [], spark: [], drip: [] }; this.flickerMats = []; this.shadowMeshes = [];
    this.glowTex = glowTexture(); this.dialTex = dialTexture();
    this.makeMaterials();
    this.batches = level.rooms.map(() => new Map());
    this.inst = level.rooms.map(() => ({ crate: [], barrel: [] }));
    this.roomGroups = level.rooms.map((r) => { const g = new THREE.Group(); g.name = 'room' + r.id; this.root.add(g); r.aabb = new THREE.Box3(new V3(r.x0 * 2, 0, r.y0 * 2), new V3((r.x0 + GRID.N) * 2, 3, (r.y0 + GRID.N) * 2)); return g; });
    for (const r of level.rooms) this.buildRoom(r);
    for (const l of level.links) this.buildDoor(l);
    for (const t of level.terminals) this.buildTerminal(t);
    for (const l of level.lockers) this.buildLocker(l);
    for (const g of level.generators) this.buildGenerator(g);
    this.buildPod(level.pod);
    for (const p of level.props) this.buildProp(p);
    this.buildDecals();
    for (const r of level.rooms) this.flush(r);
    this.visible = new Set();
  }

  // ------------------------------------------------------------ materials
  makeMaterials() {
    const t = this.tex, S = THREE.MeshStandardMaterial;
    const pbr = (set, o = {}) => new S({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(o.ns ?? 1, o.ns ?? 1), aoMap: set.orm, roughnessMap: set.orm, metalnessMap: set.orm, roughness: o.rough ?? 1, metalness: o.metal ?? 1, color: o.color ?? 0xffffff, emissive: set.emissiveMap && o.emit ? 0xffffff : 0x000000, emissiveMap: o.emit ? set.emissiveMap : null, emissiveIntensity: o.emit ?? 1, side: o.side ?? THREE.FrontSide });
    this.pbr = pbr;
    const env = this.makeEnv();
    const m = this.mats = {
      wall: pbr(t.walls, { emit: 2.2, ns: 1.2 }), floor: pbr(t.floor, { ns: 1.2 }), floorWet: pbr(t.floor, { rough: 0.38, metal: 1, ns: 0.7 }), ceiling: pbr(t.ceiling),
      rust: pbr(t.rust), crate: pbr(t.crate), hazard: pbr(t.hazard), concrete: pbr(t.concrete),
      plateBase: pbr(t.plate), fixtureDead: new S({ color: 0x4a4a52, roughness: 0.6, metalness: 0.5 }),
      sign: new S({ map: t.signs.map, emissiveMap: t.signs.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.6, metalness: 0.4 }),
      decal: new S({ map: t.decals, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      emerg: new S({ color: 0x1a0a02, emissive: 0xff6a10, emissiveIntensity: 3, fog: false }),
      pink: new S({ color: 0x401030, emissive: 0xff2fb0, emissiveIntensity: 3.5, fog: false }),
      pinkDim: new S({ color: 0x301028, emissive: 0xb0207c, emissiveIntensity: 0.55, fog: false }),
      green: new S({ color: 0x041a08, emissive: 0x25ff60, emissiveIntensity: 3, fog: false }),
      red: new S({ color: 0x1a0404, emissive: 0xff2418, emissiveIntensity: 3, fog: false }),
      lampOff: new S({ color: 0x1a1414, emissive: 0x200404, emissiveIntensity: 0.5 }),
      dark: new S({ color: 0x050507, roughness: 0.9, metalness: 0.3 }), rubber: new S({ color: 0x0c0c10, roughness: 0.7, metalness: 0.2 }),
      glass: new S({ color: 0x05080c, emissive: 0x0a3c52, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.6 }),
      spent: new S({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.5 }),
      screenDead: new S({ color: 0x020606, emissive: 0x04302c, emissiveIntensity: 0.6, roughness: 0.2 }),
    };
    m.floorWet.envMap = env; m.floorWet.envMapIntensity = 1.3;
    this.plateCache = new Map();
    this.labelTex = { ready: makeLabelTexture('READY', { w: 256, h: 64, fg: '#ffd040', border: '#c9a21a' }), spent: makeLabelTexture('SPENT', { w: 256, h: 64, fg: '#6a6a6a', border: '#444' }), gen: makeLabelTexture('GENERATOR', { w: 384, h: 64, fg: '#ffb55a', border: '#d98324', font: 'bold 38px Silkscreen, monospace' }), pod: makeLabelTexture('ESCAPE POD', { w: 512, h: 96, fg: '#58ff98', bg: '#10241a', border: '#35c070', font: 'bold 56px Silkscreen, monospace' }) };
  }
  makeEnv() {
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.BoxGeometry(60, 20, 60), new THREE.MeshBasicMaterial({ color: 0x07070c, side: THREE.BackSide })));
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0xff7a20 : 0xcfd8ff).multiplyScalar(i % 2 ? 7 : 3), side: THREE.DoubleSide })); m.position.set(Math.cos(i * 1.05) * 12, 9, Math.sin(i * 1.05) * 12); m.lookAt(0, 0, 0); sc.add(m); }
    const pm = new THREE.PMREMGenerator(this.renderer); const rt = pm.fromScene(sc, 0.04); pm.dispose(); return rt.texture;
  }
  plate(hex, rough = 1, metal = 1) {
    const k = hex + rough + metal; if (this.plateCache.has(k)) return this.plateCache.get(k);
    const m = this.mats.plateBase.clone(); m.color = new THREE.Color(hex); m.roughness = rough; m.metalness = metal; this.plateCache.set(k, m); return m;
  }

  // ------------------------------------------------------------ batching
  add(room, key, geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (!KEEP.includes(n)) g.deleteAttribute(n);
    g.applyMatrix4(matrix);
    const b = this.batches[room]; if (!b.has(key)) b.set(key, []); b.get(key).push(g);
  }
  addPlate(room, hex, geo, matrix, rough, metal) { const k = 'plate:' + hex + ':' + (rough ?? 1) + ':' + (metal ?? 1); if (!this.mats[k]) this.mats[k] = this.plate(hex, rough, metal); this.add(room, k, geo, matrix); }
  flush(r) {
    const grp = this.roomGroups[r.id];
    for (const [key, list] of this.batches[r.id]) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false); geo.computeBoundingSphere(); list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geo, this.mats[key]); mesh.name = key;
      const isDecal = key === 'decal'; mesh.castShadow = !isDecal && key !== 'sign'; mesh.receiveShadow = !isDecal; if (isDecal) mesh.renderOrder = 2;
      grp.add(mesh); if (mesh.castShadow) this.shadowMeshes.push(mesh);
    }
    const ins = this.inst[r.id];
    if (ins.crate.length) { const im = new THREE.InstancedMesh(this.crateGeo ??= new THREE.BoxGeometry(1, 1, 1), this.mats.crate, ins.crate.length); ins.crate.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; grp.add(im); }
    if (ins.barrel.length) {
      if (!this.barrelGeo) {
        const parts = [cylGeo(0.34, 0.9, 14, 0.8)]; for (const y of [-0.3, 0, 0.3]) { const t = new THREE.TorusGeometry(0.345, 0.018, 4, 14); t.rotateX(Math.PI / 2); t.translate(0, y, 0); parts.push(t); }
        this.barrelGeo = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const n of Object.keys(q.attributes)) if (!KEEP.includes(n)) q.deleteAttribute(n); return q; }));
      }
      const mat = this.plate('#ffffff'); const im = new THREE.InstancedMesh(this.barrelGeo, mat, ins.barrel.length); const cols = [0xb86a2a, 0x3c6a9a, 0x7a7a3a, 0x9a3a32, 0x4a7a5a];
      ins.barrel.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; grp.add(im);
    }
  }
  hold(roomId, obj) { this.roomGroups[roomId].add(obj); return obj; }
  sprite(mat, size, x, y, z, parent) { const s = new THREE.Sprite(mat); s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s; }
  glowMat(color, op = 0.9) { return new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); }

  // ------------------------------------------------------------ rooms
  buildRoom(r) {
    const L = this.L, W = L.W, N = GRID.N, rng = this.rng, id = r.id, tl = (x, y) => L.tiles[y * W + x];
    const pal = PALETTE[r.name] || [0, 1, 2, 3];
    const floorBase = rng.pick([0, 1, 1, 3, 2]), cross = [3, 4];
    const wallFace = (roomId, tx, ty, d, forced) => {
      const run = d === 0 || d === 2 ? Math.floor(ty / 2) : Math.floor(tx / 2);
      const hr = new RNG(hashSeed(`${tx >> 1}|${ty >> 1}|${d}|${run}|${this.L.seed}`));
      const design = forced ?? (hr.chance(0.28) ? hr.int(0, 7) : hr.pick(pal));
      const cx = (tx + 0.5) * 2 + DX[d], cz = (ty + 0.5) * 2 + DY[d], th = Math.atan2(-DX[d], -DY[d]);
      this.add(roomId, 'wall', setUV(new THREE.PlaneGeometry(2, CEILING), this.tex.walls.uv(design)), M(cx, CEILING / 2, cz, 0, th, 0));
    };
    this.wallFace = wallFace;
    const tileCommon = (tx, ty, i, j) => {
      const cx = (tx + 0.5) * 2, cz = (ty + 0.5) * 2, onRow = cross.includes(j), onCol = cross.includes(i);
      const variant = onRow || onCol ? 2 : (rng.chance(0.2) ? rng.pick([0, 1, 3]) : floorBase);
      const rot = onCol && !onRow ? 1 : onRow ? 0 : rng.int(0, 1);
      if (tl(tx, ty) !== T_BLOCK) this.add(id, r.wet ? 'floorWet' : 'floor', setUV(new THREE.PlaneGeometry(2, 2), this.tex.floor.uv(variant), rot), M(cx, 0, cz, -Math.PI / 2, 0, 0));
      this.add(id, 'ceiling', new THREE.PlaneGeometry(2, 2), M(cx, CEILING, cz, Math.PI / 2, 0, 0));
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = r.x0 + i, ty = r.y0 + j, t = tl(tx, ty);
      if (t === T_WALL) continue;
      tileCommon(tx, ty, i, j);
      if (t === T_FLOOR) for (let d = 0; d < 4; d++) if (tl(tx + DX[d], ty + DY[d]) === T_WALL) wallFace(id, tx, ty, d);
    }
    // wall run lists for decor
    this.faces = this.faces || {}; const faces = []; 
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const tx = r.x0 + i, ty = r.y0 + j; if (tl(tx, ty) === T_FLOOR) for (let d = 0; d < 4; d++) if (tl(tx + DX[d], ty + DY[d]) === T_WALL) faces.push({ tx, ty, d, i, j }); }
    this.faces[id] = faces;
    // obstacle blocks: stacked machinery/crate blocks
    for (const b of r.blocks) {
      const w = b.w * 2, h = b.h * 2, ht = rng.pick([1.2, 1.8, 2.2, 2.4]), cx = b.tx * 2 + w / 2, cz = b.ty * 2 + h / 2;
      this.add(id, 'crate', boxGeo(w - 0.04, ht, h - 0.04, 0.5), M(cx, ht / 2, cz));
      this.add(id, 'concrete', boxGeo(w, 0.25, h, 0.5), M(cx, 0.125, cz));
      this.add(id, 'hazard', boxGeo(w + 0.02, 0.18, h + 0.02, 1), M(cx, ht - 0.12, cz));
      if (ht < 2.3) this.add(id, 'concrete', boxGeo(w - 0.5, 0.2, h - 0.5, 0.5), M(cx, ht + 0.1, cz));
    }
    // ceiling fixtures (dead grey), flicker rooms get live ones
    const fixtures = [[2, 2], [5.5, 2], [2, 5.5], [5.5, 5.5], [3.6, 3.6]];
    let live = null;
    if (r.flicker) { live = new THREE.MeshStandardMaterial({ color: 0x555560, emissive: 0xd8e4ff, emissiveIntensity: 0, roughness: 0.4 }); this.flickerMats.push({ mat: live, room: id, ph: rng.next() * 50 }); }
    fixtures.forEach(([fi, fj], k) => {
      const tx = r.x0 + Math.floor(fi), ty = r.y0 + Math.floor(fj); if (tl(tx, ty) !== T_FLOOR) return;
      const cx = (r.x0 + fi + 0.5) * 2 - 1, cz = (r.y0 + fj + 0.5) * 2 - 1;
      const g = boxGeo(1.4, 0.1, 0.42, 0.5), f = new THREE.Mesh(g, live && k < 3 ? live : this.mats.fixtureDead); f.position.set(cx, CEILING - 0.05, cz); f.rotation.y = k % 2 ? 0 : Math.PI / 2; this.hold(id, f);
      const frame = boxGeo(1.5, 0.04, 0.5, 0.5); this.add(id, 'rust', frame, M(cx, CEILING - 0.02, cz, 0, k % 2 ? 0 : Math.PI / 2, 0));
    });
    if (live) this.sources.push({ x: (r.x0 + 4) * 2, y: 2.6, z: (r.y0 + 4) * 2, color: 0xcfe0ff, intensity: 0, base: 9, dist: 15, room: id, flick: this.flickerMats[this.flickerMats.length - 1] });
    // ceiling pipes along cross lines + cable runs
    for (const j of [2.1, 5.9]) if (rng.chance(0.7)) {
      const tx = r.x0 + Math.floor(j), ty = r.y0 + Math.floor(j); const along = rng.chance(0.5);
      const len = 14, p = new THREE.CylinderGeometry(0.09, 0.09, len, 8, 1); p.rotateZ(Math.PI / 2);
      const cx = (r.x0 + 4) * 2, cz = (r.y0 + j + 0.5) * 2 - (j > 3 ? 0.3 : -0.3);
      const m1 = along ? M(cx, 2.72, (r.y0 + j) * 2) : M((r.x0 + j) * 2, 2.72, (r.y0 + 4) * 2, 0, Math.PI / 2, 0);
      const uv = p.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 6, uv.getY(q) * 28);
      this.add(id, 'rust', p, m1);
      for (let k = -3; k <= 3; k++) { const fl = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8); fl.rotateZ(Math.PI / 2); const m2 = along ? M(cx + k * 2, 2.72, (r.y0 + j) * 2) : M((r.x0 + j) * 2, 2.72, (r.y0 + 4) * 2 + k * 2, 0, Math.PI / 2, 0); this.add(id, 'plate:#7a7068:1:1', fl, m2); if (!this.mats['plate:#7a7068:1:1']) this.mats['plate:#7a7068:1:1'] = this.plate('#7a7068'); }
      if (rng.chance(0.4)) this.emitters.steam.push({ x: (r.x0 + 2 + rng.int(0, 4)) * 2 + 1, y: 2.6, z: (r.y0 + j) * 2, room: id, ph: rng.next() * 9 });
    }
    for (let k = 0; k < 3; k++) if (rng.chance(0.6)) {
      const i0 = rng.int(0, 5), j0 = rng.int(0, 7), tx = r.x0 + i0, ty = r.y0 + j0; if (tl(tx, ty) !== T_FLOOR) continue;
      const pts = [new V3(tx * 2 + 0.5, CEILING, ty * 2 + 1), new V3(tx * 2 + 1.5, CEILING - 0.55 - rng.next() * 0.3, ty * 2 + 1), new V3(tx * 2 + 3.2, CEILING - 0.1, ty * 2 + 1.2)];
      this.add(id, 'rubber', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 5), new THREE.Matrix4());
      if (k === 0 && rng.chance(0.35)) this.emitters.spark.push({ x: pts[1].x, y: pts[1].y, z: pts[1].z, room: id, next: rng.next() * 6 });
    }
    if (rng.chance(0.5)) { const x = (r.x0 + rng.int(1, 6) + 0.5) * 2, z = (r.y0 + rng.int(1, 6) + 0.5) * 2; if (tl(Math.floor(x / 2), Math.floor(z / 2)) === T_FLOOR) this.emitters.drip.push({ x, y: CEILING - 0.1, z, room: id, next: rng.next() * 4 }); }
    // emergency strips + one orange source
    if (r.emergency || r.kind === 'pod') {
      const f = rng.shuffle(faces.slice()).slice(0, 6);
      for (const q of f) { const cx = (q.tx + 0.5) * 2 + DX[q.d] * 0.97, cz = (q.ty + 0.5) * 2 + DY[q.d] * 0.97, th = Math.atan2(-DX[q.d], -DY[q.d]); this.add(id, 'emerg', boxGeo(1.7, 0.07, 0.05, 1), M(cx, 2.72, cz, 0, th, 0)); this.add(id, 'emerg', boxGeo(1.7, 0.07, 0.05, 1), M(cx, 0.45, cz, 0, th, 0)); }
      this.sources.push({ x: (r.x0 + 3.6) * 2, y: 2.4, z: (r.y0 + 3.6) * 2, color: r.kind === 'pod' ? 0x40ff90 : 0xff7a22, intensity: 0, base: r.kind === 'pod' ? 8 : 11, dist: 16, room: id });
    }
    // monitors lights etc: small red beacon in non-emergency rooms near start
    // room name faces for doors handled in buildDoor
  }

  // ------------------------------------------------------------ doors
  buildDoor(link) {
    const L = this.L, rooms = L.rooms; const hatch = link.kind === 'hatch';
    const g = new THREE.Group(); g.position.set((link.tx + 0.5) * 2, 0, (link.ty + 0.5) * 2); g.rotation.y = link.axis === 'x' ? Math.PI / 2 : 0;
    const col = hatch ? 0xd18a1c : link.lock === 'red' ? 0xc22a2a : link.lock === 'blue' ? 0x2f60d0 : 0x3f9a58;
    const frameMat = this.plate(col, 0.7, 0.6);
    const mk = (geo, mat, x, y, z, sh = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = sh; m.receiveShadow = true; g.add(m); return m; };
    // side walls of the door cell (plain panels) & lintel filler
    const cellRoom = link.a;
    for (const s of [-1, 1]) this.add(cellRoom, 'wall', setUV(new THREE.PlaneGeometry(2, CEILING), this.tex.walls.uv(0)), M((link.tx + 0.5) * 2 + (link.axis === 'x' ? 0 : -s), CEILING / 2, (link.ty + 0.5) * 2 + (link.axis === 'x' ? -s : 0), 0, link.axis === 'x' ? (s > 0 ? 0 : Math.PI) : (s > 0 ? -Math.PI / 2 : Math.PI / 2), 0));
    // floor/ceiling of the cell
    this.add(cellRoom, 'floor', setUV(new THREE.PlaneGeometry(2, 2), this.tex.floor.uv(2), link.axis === 'x' ? 0 : 1), M((link.tx + 0.5) * 2, 0, (link.ty + 0.5) * 2, -Math.PI / 2, 0, 0));
    this.add(cellRoom, 'ceiling', new THREE.PlaneGeometry(2, 2), M((link.tx + 0.5) * 2, CEILING, (link.ty + 0.5) * 2, Math.PI / 2, 0, 0));
    const studs = [];
    const stud = (x, y, z, ry) => { const c = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 6); c.rotateX(Math.PI / 2); const gg = c.toNonIndexed(); for (const n of Object.keys(gg.attributes)) if (!KEEP.includes(n)) gg.deleteAttribute(n); gg.translate(x, y, z); studs.push(gg); };
    let leaves = [], pivot = null;
    if (!hatch) {
      mk(boxGeo(0.24, DOOR_H, 0.5), frameMat, -0.88, DOOR_H / 2, 0); mk(boxGeo(0.24, DOOR_H, 0.5), frameMat, 0.88, DOOR_H / 2, 0);
      mk(boxGeo(2, CEILING - DOOR_H, 0.5), frameMat, 0, DOOR_H + (CEILING - DOOR_H) / 2, 0);
      for (const z of [-0.26, 0.26]) { for (let k = 0; k < 8; k++) { stud(-0.88, 0.2 + k * 0.28, z); stud(0.88, 0.2 + k * 0.28, z); } for (let k = 0; k < 7; k++) stud(-0.8 + k * 0.27, 2.85, z); }
      mk(new THREE.BoxGeometry(1.52, DOOR_H, 0.1), this.mats.dark, 0, DOOR_H / 2, 0, false);
      const leafMat = this.plate('#706e7c', 0.6, 0.8);
      for (const s of [-1, 1]) {
        const lf = new THREE.Group(); lf.position.set(s * 0.38, 0, 0); g.add(lf);
        const b = new THREE.Mesh(boxGeo(0.75, DOOR_H - 0.04, 0.16, 0.5), leafMat); b.position.y = DOOR_H / 2; b.castShadow = b.receiveShadow = true; lf.add(b);
        const hz = new THREE.Mesh(boxGeo(0.75, 0.3, 0.02, 1), this.mats.hazard); hz.position.set(0, 0.2, 0.09); lf.add(hz); const hz2 = hz.clone(); hz2.position.z = -0.09; lf.add(hz2);
        for (const zz of [0.085, -0.085]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.015), this.mats.dark); st.position.set(0, 1.2, zz); lf.add(st); const st2 = st.clone(); st2.position.y = 1.5; lf.add(st2); }
        leaves.push({ g: lf, s });
      }
    } else {
      const sh = new THREE.Shape(); sh.moveTo(-1, 0); sh.lineTo(1, 0); sh.lineTo(1, CEILING); sh.lineTo(-1, CEILING); sh.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 1.1, 0.93, 0, Math.PI * 2, true); sh.holes.push(hole);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: false, curveSegments: 28 }); eg.translate(0, 0, -0.17);
      const uv = eg.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 0.5, uv.getY(q) * 0.5);
      mk(eg, frameMat, 0, 0, 0);
      const ring = new THREE.TorusGeometry(0.95, 0.075, 8, 40); for (const z of [-0.18, 0.18]) mk(ring, this.plate('#e8a030', 0.5, 0.7), 0, 1.1, z);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283; for (const z of [-0.2, 0.2]) { const gg = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 6); gg.rotateX(Math.PI / 2); const q2 = gg.toNonIndexed(); for (const n of Object.keys(q2.attributes)) if (!KEEP.includes(n)) q2.deleteAttribute(n); q2.translate(Math.cos(a) * 1.0, 1.1 + Math.sin(a) * 1.0, z); studs.push(q2); } }
      pivot = new THREE.Group(); pivot.position.set(-0.93, 1.1, 0); g.add(pivot);
      const discMat = this.plate('#d9962a', 0.55, 0.7);
      const disc = new THREE.Mesh(cylGeo(0.89, 0.24, 28, 0.5), discMat); disc.rotation.x = Math.PI / 2; disc.position.x = 0.93; disc.castShadow = disc.receiveShadow = true; pivot.add(disc);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20), this.mats.dark); wheel.position.set(0.93, 0, 0.16); pivot.add(wheel);
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), this.mats.dark); sp.position.set(0.93, 0, 0.16); sp.rotation.z = (k * Math.PI) / 3; pivot.add(sp); }
      const dr = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 6, 28), this.plate('#f0b24a', 0.5, 0.8)); dr.position.set(0.93, 0, 0.13); pivot.add(dr);
    }
    if (studs.length) { const sm = new THREE.Mesh(mergeGeometries(studs), this.plate('#c9c5d4', 0.4, 0.9)); g.add(sm); }
    // status light (both faces) + name signs
    const lights = [];
    for (const z of [-0.285, 0.285]) {
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), link.lock ? this.mats.red : this.mats.green); lm.position.set(0, hatch ? 2.35 : 2.4, z); g.add(lm); lights.push(lm);
      lights.push(this.sprite(this.glowMat(0xffffff, 0.0), 0.7, 0, hatch ? 2.35 : 2.4, z * 1.5, g));
    }
    for (const [z, rm] of [[0.27, link.b], [-0.27, link.a]]) { // sign on each face shows the room you are walking into
      const sg = new THREE.Mesh(setUV(new THREE.PlaneGeometry(1.3, 0.325), this.tex.signs.uv(rooms[rm].name)), this.mats.sign); sg.position.set(0, hatch ? 2.7 : 2.68, z * (hatch ? 0.8 : 1)); if (z < 0) sg.rotation.y = Math.PI; g.add(sg);
    }
    const door = {
      type: 'door', link, g, leaves, pivot, hatch, axis: link.axis, tx: link.tx, ty: link.ty, lock: link.lock, progress: 0, t: 0, opening: false, lights,
      dur: hatch ? CFG.door.hatchOpenTime : CFG.door.openTime,
      pos: new V3((link.tx + 0.5) * 2, 1.2, (link.ty + 0.5) * 2), state: null,
      blocking() { return this.progress < 0.78; },
      open() { if (this.opening) return false; this.opening = true; return true; },
      setState(ok) { if (this.state === ok) return; this.state = ok; const mat = ok ? this.w.mats.green : this.w.mats.red; for (const l of this.lights) { if (l.isSprite) { l.material.color.set(ok ? 0x30ff70 : 0xff3020); l.material.opacity = 0.55; } else l.material = mat; } },
      w: this,
    };
    door.setState(!link.lock);
    this.hold(link.a, g); this.doors.push(door); g.userData.rooms = [link.a, link.b];
    door.update = function (dt) {
      if (this.opening && this.progress < 1) { this.t += dt / this.dur; this.progress = Math.min(1, this.t); }
      const e = ease(this.progress);
      if (this.hatch) { const bounce = this.progress > 0.8 ? Math.sin((this.progress - 0.8) * 40) * 0.06 * (1 - this.progress) * 5 : 0; this.pivot.rotation.y = -(1.85 * e + bounce); }
      else for (const l of this.leaves) l.g.position.x = l.s * (0.38 + 0.95 * e);
    };
  }

  // ------------------------------------------------------------ lockers / terminals / generators / pod
  slotGroup(s, room) { const g = new THREE.Group(); g.position.set(s.cx, 0, s.cz); g.rotation.y = Math.atan2(-DX[s.dir], -DY[s.dir]); this.hold(room, g); return g; }
  buildLocker(s) {
    const g = this.slotGroup(s, s.room), bodyM = this.plate('#566b74', 0.6, 0.7), doorM = this.plate('#6a8590', 0.55, 0.7);
    const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    mk(boxGeo(0.98, 1.05, 0.66, 0.5), bodyM, 0, 0.525, 0); mk(new THREE.BoxGeometry(0.84, 0.95, 0.02), this.mats.dark, 0, 0.52, 0.32);
    const pivot = new THREE.Group(); pivot.position.set(-0.46, 0, 0.34); g.add(pivot);
    mk(boxGeo(0.92, 0.97, 0.04, 0.5), doorM, 0.46, 0.52, 0, pivot);
    for (let k = 0; k < 4; k++) mk(new THREE.BoxGeometry(0.5, 0.02, 0.02), this.mats.dark, 0.46, 0.85 + k * 0.035, 0.025, pivot);
    const handle = mk(new THREE.BoxGeometry(0.06, 0.32, 0.06), this.mats.pink, 0.78, 0.52, 0.06, pivot);
    const top = mk(new THREE.BoxGeometry(0.52, 0.045, 0.14), this.mats.pink, 0, 1.075, 0.12);
    const gl = this.sprite(this.glowMat(0xff30b8, 0.8), 1.15, 0, 1.35, 0.15, g);
    const lk = { type: 'locker', s, g, pivot, handle, top, gl, content: s.content, opened: false, t: 0, id: s.id, pos: new V3(s.cx - DX[s.dir] * 0, 0.7, s.cz) };
    lk.pos.set(s.cx + -DX[s.dir] * 0.9, 0.7, s.cz + -DY[s.dir] * 0.9);
    lk.open = function () { if (this.opened) return null; this.opened = true; this.handle.material = this.top.material = this.w.mats.pinkDim; this.gl.material.opacity = 0.18; return this.content; };
    lk.w = this; lk.update = function (dt) { const target = this.opened ? 1 : 0; this.t += (target - this.t) * Math.min(1, dt * 4); this.pivot.rotation.y = -1.15 * this.t; };
    this.lockers.push(lk);
  }
  buildTerminal(s) {
    const g = this.slotGroup(s, s.room), bodyM = this.plate('#4d5362', 0.6, 0.7);
    const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    mk(boxGeo(1.1, 0.85, 0.7, 0.5), bodyM, 0, 0.425, 0); mk(boxGeo(1.16, 0.06, 0.76, 0.5), this.plate('#2a2a32', 0.5, 0.8), 0, 0.88, 0);
    const panel = new THREE.Group(); panel.position.set(0, 1.2, -0.12); panel.rotation.x = -0.28; g.add(panel);
    mk(boxGeo(1.0, 0.66, 0.1, 0.5), this.plate('#25252d', 0.5, 0.8), 0, 0, 0, panel);
    const scr = makeScreen(256, 160); const sm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 1.8, roughness: 0.2, fog: false });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.55), sm); sp.position.z = 0.052; panel.add(sp);
    mk(new THREE.BoxGeometry(0.7, 0.03, 0.22), this.mats.dark, 0, 0.93, 0.2); mk(new THREE.BoxGeometry(0.06, 0.4, 0.06), this.mats.dark, 0, 0.92, -0.15);
    const gl = this.sprite(this.glowMat(0x30ffe0, 0.55), 1.4, 0, 1.25, 0.25, g);
    const tm = { type: 'terminal', s, g, scr, sm, gl, id: s.id, used: false, pos: new V3(s.cx - DX[s.dir] * 0.9, 1.0, s.cz - DY[s.dir] * 0.9), lines: story.terminals[s.id].log, lastDraw: 0 };
    tm.draw = function (t) {
      const { ctx, canvas, tex } = this.scr; ctx.fillStyle = '#031412'; ctx.fillRect(0, 0, 256, 160); ctx.font = '10px monospace'; ctx.textBaseline = 'top';
      if (this.used) { ctx.fillStyle = '#1c5a54'; ctx.fillText('> LOG ARCHIVED', 10, 10); ctx.fillText('> TERMINAL LOCKED', 10, 24); }
      else { const off = (t * 14) % 180; ctx.fillStyle = '#4ff0e0'; const all = [...this.lines, '', ...this.lines]; let y = 8 - off; for (const ln of all) { const words = ln.split(' '); let line = ''; for (const w of words) { if ((line + w).length > 36) { if (y > -12 && y < 160) ctx.fillText(line, 8, y); y += 12; line = ''; } line += w + ' '; } if (y > -12 && y < 160) ctx.fillText(line, 8, y); y += 16; } }
      for (let y = 0; y < 160; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, y, 256, 1); } tex.needsUpdate = true;
    };
    tm.setUsed = function () { this.used = true; this.sm.emissiveIntensity = 0.5; this.gl.material.opacity = 0.1; this.draw(0); };
    tm.draw(0); this.terminals.push(tm);
  }
  buildGenerator(s) {
    const g = new THREE.Group(); g.position.set(s.fx, 0, s.fz); g.rotation.y = Math.atan2(-DX[s.dir], -DY[s.dir]); this.hold(s.room, g);
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const fm = this.plate('#7f7a6c', 0.6, 0.8);
    mk(boxGeo(0.16, 2.3, 0.2, 0.5), fm, -0.9, 1.2, 0.1); mk(boxGeo(0.16, 2.3, 0.2, 0.5), fm, 0.9, 1.2, 0.1); mk(boxGeo(1.96, 0.16, 0.2, 0.5), fm, 0, 2.32, 0.1); mk(boxGeo(1.96, 0.16, 0.2, 0.5), fm, 0, 0.1, 0.1);
    mk(boxGeo(1.68, 0.1, 0.02, 1), this.mats.hazard, 0, 2.2, 0.205); mk(new THREE.BoxGeometry(1.64, 2.1, 0.05), this.plate('#1a1920', 0.5, 0.8), 0, 1.2, 0.02);
    mk(new THREE.TorusGeometry(0.56, 0.06, 8, 32), this.plate('#4a4750', 0.4, 0.9), 0, 1.4, 0.09);
    const dm = new THREE.MeshStandardMaterial({ color: 0x241804, emissive: 0xffffff, emissiveMap: this.dialTex, emissiveIntensity: 1.2, roughness: 0.3, fog: false });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), dm); dial.position.set(0, 1.4, 0.075); g.add(dial);
    const lm = new THREE.MeshStandardMaterial({ map: this.labelTex.ready, emissiveMap: this.labelTex.ready, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.175), lm); label.position.set(0, 0.62, 0.055); g.add(label);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.17), new THREE.MeshStandardMaterial({ map: this.labelTex.gen, emissiveMap: this.labelTex.gen, emissive: 0xffffff, emissiveIntensity: 0.6 })); title.position.set(0, 2.05, 0.055); g.add(title);
    mk(new THREE.BoxGeometry(0.1, 0.4, 0.14), this.mats.red, 0.55, 0.62, 0.08);
    for (const sx of [-1, 1]) { const pts = [new V3(sx * 0.6, 2.3, 0.1), new V3(sx * 0.95, 2.7, 0.35), new V3(sx * 0.8, 3.0, 0.1)]; mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.045, 6), this.mats.rubber, 0, 0, 0); }
    const gl = this.sprite(this.glowMat(0xffc020, 0.7), 3.2, 0, 1.4, 0.4, g);
    const nx = -DX[s.dir], nz = -DY[s.dir];
    const ob = { type: 'generator', s, g, dm, lm, gl, id: s.id, spent: false, charging: false, pos: new V3(s.fx + nx * 1.0, 1.4, s.fz + nz * 1.0), wallPos: new V3(s.fx, 1.4, s.fz), nx, nz, ph: this.rng.next() * 6, labelTex: this.labelTex, w: this };
    ob.setSpent = function () { this.spent = true; this.charging = false; this.dm.emissiveIntensity = 0; this.dm.emissiveMap = null; this.dm.emissive.set(0x000000); this.dm.needsUpdate = true; this.gl.visible = false; this.lm.map = this.lm.emissiveMap = this.labelTex.spent; this.lm.emissiveIntensity = 0.4; this.lm.needsUpdate = true; };
    ob.animate = function (t) { if (this.spent) return; const k = this.charging ? 1.9 + Math.sin(t * 22) * 0.4 : 0.9 + Math.sin(t * 2.4 + this.ph) * 0.45; this.dm.emissiveIntensity = k; this.gl.material.opacity = 0.18 + k * 0.1; };
    this.sources.push({ x: s.fx + nx * 1.2, y: 1.6, z: s.fz + nz * 1.2, color: 0xffb020, intensity: 0, base: 3.5, dist: 9, room: s.room, gen: ob });
    this.generators.push(ob);
  }
  buildPod(p) {
    const g = new THREE.Group(); g.position.set(p.cx, 0, p.cz); g.rotation.y = Math.atan2(-DX[p.dir], -DY[p.dir]); this.hold(p.room, g);
    const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    const fm = this.plate('#8e96a0', 0.5, 0.8);
    mk(boxGeo(0.3, 2.9, 0.4, 0.5), fm, -1.75, 1.45, 0.2); mk(boxGeo(0.3, 2.9, 0.4, 0.5), fm, 1.75, 1.45, 0.2); mk(boxGeo(3.8, 0.3, 0.4, 0.5), fm, 0, 2.75, 0.2); mk(boxGeo(3.8, 0.2, 0.4, 0.5), fm, 0, 0.1, 0.2);
    mk(new THREE.BoxGeometry(3.2, 2.5, 0.06), this.plate('#14161c', 0.5, 0.8), 0, 1.4, 0.03);
    const door = mk(cylGeo(1.05, 0.22, 36, 0.5), this.plate('#a9b0ba', 0.45, 0.85), 0, 1.35, 0.18); door.rotation.x = Math.PI / 2;
    mk(new THREE.TorusGeometry(1.1, 0.07, 8, 40), this.plate('#e0b040', 0.5, 0.7), 0, 1.35, 0.3);
    mk(new THREE.TorusGeometry(0.4, 0.06, 8, 24), this.plate('#4a505a', 0.4, 0.9), 0, 1.5, 0.32); mk(new THREE.CircleGeometry(0.34, 24), this.mats.glass, 0, 1.5, 0.325);
    mk(new THREE.BoxGeometry(0.1, 0.5, 0.06), this.mats.green, -1.45, 1.35, 0.4); mk(new THREE.BoxGeometry(0.1, 0.5, 0.06), this.mats.green, 1.45, 1.35, 0.4);
    for (const x of [-0.7, 0, 0.7]) mk(new THREE.BoxGeometry(0.4, 0.07, 0.06), this.mats.green, x, 0.45, 0.4);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), new THREE.MeshStandardMaterial({ map: this.labelTex.pod, emissiveMap: this.labelTex.pod, emissive: 0xffffff, emissiveIntensity: 1.4 })); lab.position.set(0, 2.5, 0.41); g.add(lab);
    this.sprite(this.glowMat(0x30ff80, 0.6), 4.2, 0, 1.4, 0.6, g);
    const nx = -DX[p.dir], nz = -DY[p.dir];
    this.pod = { type: 'pod', g, pos: new V3(p.cx + nx * 1.1, 1.3, p.cz + nz * 1.1), wall: new V3(p.cx, 1.4, p.cz) };
    this.sources.push({ x: p.cx + nx * 1.5, y: 1.6, z: p.cz + nz * 1.5, color: 0x40ff90, intensity: 0, base: 6, dist: 10, room: p.room });
  }

  // ------------------------------------------------------------ props
  buildProp(s) {
    const id = s.room, rng = new RNG(s.seed), base = M(s.cx, 0, s.cz, 0, Math.atan2(-DX[s.dir], -DY[s.dir]), 0);
    const loc = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => base.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
    const P = (hex, geo, m, rough, metal) => this.addPlate(id, hex, geo, m, rough, metal);
    const f = s.kind2;
    if (f === 'crate') { const sz = 0.9 + rng.next() * 0.2; this.inst[id].crate.push(base.clone().multiply(M(0, sz / 2, 0, 0, (rng.next() - 0.5) * 0.15, 0, sz, sz, sz))); if (rng.chance(0.5)) this.inst[id].crate.push(base.clone().multiply(M((rng.next() - 0.5) * 0.15, sz + 0.3, 0, 0, rng.next(), 0, 0.6, 0.6, 0.6))); }
    else if (f === 'barrel') { this.inst[id].barrel.push(base.clone().multiply(M(0, 0.45, 0))); if (rng.chance(0.5)) this.inst[id].barrel.push(base.clone().multiply(M(0.75 * (rng.chance(0.5) ? 1 : -1), 0.45, 0.2))); }
    else if (f === 'shelf') {
      for (const x of [-0.8, 0.8]) for (const z of [-0.22, 0.22]) P('#6d6a78', new THREE.BoxGeometry(0.05, 2, 0.05), loc(x, 1, z));
      for (let k = 0; k < 4; k++) { P('#7a7788', boxGeo(1.7, 0.04, 0.55, 0.5), loc(0, 0.25 + k * 0.5, 0)); for (let q = 0; q < 3; q++) if (rng.chance(0.7)) this.add(id, 'crate', new THREE.BoxGeometry(1, 1, 1), loc(-0.55 + q * 0.5, 0.25 + k * 0.5 + 0.12 + 0.1, 0, 0, rng.next() * 0.4, 0, 0.3 + rng.next() * 0.1, 0.2 + rng.next() * 0.15, 0.3)); }
    } else if (f === 'bench') {
      P('#8a8796', boxGeo(1.7, 0.07, 0.85, 0.5), loc(0, 0.9, 0)); P('#55525f', boxGeo(1.6, 0.04, 0.75, 0.5), loc(0, 0.25, 0));
      for (const x of [-0.78, 0.78]) for (const z of [-0.36, 0.36]) P('#55525f', new THREE.BoxGeometry(0.06, 0.9, 0.06), loc(x, 0.45, z));
      for (let k = 0; k < 3; k++) P(['#3b6a62', '#8a4a30', '#5a6a8a'][k], new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), loc(-0.5 + k * 0.25 + rng.next() * 0.1, 1.02, -0.1 + rng.next() * 0.2));
      this.add(id, 'decal', setUV(new THREE.PlaneGeometry(0.3, 0.3), this.tex.decals.uv(DECAL.note0 + rng.int(0, 2))), loc(0.5, 0.94, 0.1, -Math.PI / 2, rng.next() * 3, 0));
    } else if (f === 'chair') { const tilt = rng.chance(0.3); const b2 = loc(0, tilt ? 0.25 : 0, 0.1, tilt ? -1.35 : 0, rng.next() * 6, 0); P('#4a4856', boxGeo(0.46, 0.06, 0.46, 0.5), b2.clone().multiply(M(0, 0.46, 0))); P('#4a4856', boxGeo(0.46, 0.5, 0.05, 0.5), b2.clone().multiply(M(0, 0.75, -0.22))); for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) P('#2c2b33', new THREE.BoxGeometry(0.04, 0.46, 0.04), b2.clone().multiply(M(x, 0.23, z))); }
    else if (f === 'console') {
      P('#4d5362', boxGeo(1.5, 0.95, 0.65, 0.5), loc(0, 0.475, 0)); P('#25252d', boxGeo(1.5, 0.08, 0.5, 0.5), loc(0, 1.0, 0.1, -0.5)); this.add(id, 'screenDead', new THREE.PlaneGeometry(0.5, 0.32), loc(-0.35, 1.38, -0.18, -0.2)); this.add(id, 'screenDead', new THREE.PlaneGeometry(0.5, 0.32), loc(0.35, 1.38, -0.18, -0.2));
      for (let k = 0; k < 6; k++) this.add(id, rng.chance(0.5) ? 'green' : 'red', new THREE.BoxGeometry(0.06, 0.03, 0.06), loc(-0.6 + k * 0.24, 1.07, 0.18, -0.5));
    } else if (f === 'tank') { P('#5a6a7a', new THREE.CylinderGeometry(0.4, 0.4, 1.7, 14), loc(0, 0.95, 0), 0.5, 0.8); P('#5a6a7a', new THREE.SphereGeometry(0.4, 12, 6, 0, 6.3, 0, 1.57), loc(0, 1.8, 0)); this.add(id, 'hazard', new THREE.CylinderGeometry(0.405, 0.405, 0.2, 14), loc(0, 0.7, 0)); for (const y of [0.4, 1.4]) P('#2a2a30', new THREE.TorusGeometry(0.41, 0.03, 4, 14).rotateX(Math.PI / 2), loc(0, y, 0)); }
    else if (f === 'debris') { for (let k = 0; k < 5; k++) P(['#6d6a78', '#4a4856', '#5a4a3a'][k % 3], boxGeo(0.2 + rng.next() * 0.4, 0.06 + rng.next() * 0.1, 0.15 + rng.next() * 0.3, 0.5), loc((rng.next() - 0.5) * 0.9, 0.05, (rng.next() - 0.3) * 0.7, rng.next() * 0.4, rng.next() * 6, rng.next() * 0.3)); this.add(id, 'decal', setUV(new THREE.PlaneGeometry(0.3, 0.3), this.tex.decals.uv(DECAL.note0 + rng.int(0, 2))), loc(0.1, 0.012, 0.1, -Math.PI / 2, rng.next() * 6, 0)); }
    else if (f === 'broken') { P('#8a8796', boxGeo(1.2, 1.7, 0.05, 0.5), loc(0, 0.85, 0.12, -0.18)); for (let k = 0; k < 5; k++) this.add(id, 'rubber', new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), loc(-0.4 + k * 0.2, 1.65, 0.2, 0.6 + rng.next(), 0, rng.next() - 0.5)); this.emitters.spark.push({ x: s.cx, y: 1.6, z: s.cz, room: id, next: rng.next() * 5 }); }
    else if (f === 'scanner') { P('#3a3a42', boxGeo(0.28, 0.06, 0.4, 1), loc(0, 0.04, 0.1, 0, rng.next() * 6, 0)); this.add(id, 'screenDead', new THREE.PlaneGeometry(0.2, 0.2), loc(0, 0.075, 0.1, -Math.PI / 2, 0, 0)); this.emitters.spark.push({ x: s.cx, y: 0.2, z: s.cz, room: id, next: rng.next() * 3 }); }
  }

  // ------------------------------------------------------------ decals & signs
  buildDecals() {
    const rng = new RNG(hashSeed('decal' + this.L.seed)), L = this.L, T = this.tex.decals;
    const wallDecal = (room, q, idx, w, h, y, off = 0) => { const cx = (q.tx + 0.5) * 2 + DX[q.d] * 0.99 + (-DY[q.d]) * off, cz = (q.ty + 0.5) * 2 + DY[q.d] * 0.99 + DX[q.d] * off, th = Math.atan2(-DX[q.d], -DY[q.d]); this.add(room, 'decal', setUV(new THREE.PlaneGeometry(w, h), T.uv(idx)), M(cx, y, cz, 0, th, rng.range(-0.08, 0.08))); };
    const floorDecal = (room, tx, ty, idx, w, rot) => this.add(room, 'decal', setUV(new THREE.PlaneGeometry(w, w), T.uv(idx)), M((tx + rng.range(0.2, 0.8)) * 2, 0.012 + rng.next() * 0.003, (ty + rng.range(0.2, 0.8)) * 2, -Math.PI / 2, 0, rot));
    for (const r of L.rooms) {
      const faces = this.faces[r.id]; if (!faces.length) continue;
      const nearDoor = faces.filter((f) => r.links.some((l) => Math.abs(l.tx - f.tx) + Math.abs(l.ty - f.ty) <= 4));
      const n = r.kind === 'start' ? 2 : rng.int(5, 9);
      for (let k = 0; k < n; k++) {
        const q = rng.pick(faces), roll = rng.next();
        if (roll < 0.14) wallDecal(r.id, q, DECAL.blood, 1.6, 1.6, rng.range(0.8, 2), rng.range(-0.5, 0.5));
        else if (roll < 0.26) wallDecal(r.id, q, DECAL.hand, 0.45, 0.45, rng.range(1.0, 1.7), rng.range(-0.6, 0.6));
        else if (roll < 0.38) wallDecal(r.id, rng.pick(nearDoor.length ? nearDoor : faces), DECAL.claw, 1.1, 1.4, rng.range(0.9, 1.5), rng.range(-0.5, 0.5));
        else if (roll < 0.5) wallDecal(r.id, q, DECAL.scorch, 1.5, 1.5, rng.range(0.8, 1.8));
        else if (roll < 0.6) wallDecal(r.id, q, DECAL.stain, 1.6, 1.8, 1.5);
        else if (roll < 0.7) wallDecal(r.id, q, rng.pick([DECAL.warn, DECAL.silence, DECAL.exit, DECAL.bio]), 0.6, 0.6, rng.range(1.4, 1.9), rng.range(-0.5, 0.5));
        else if (roll < 0.77) wallDecal(r.id, q, DECAL.poster, 0.6, 0.9, 1.5);
        else if (roll < 0.9) wallDecal(r.id, q, DECAL.note0 + rng.int(0, 2), 0.35, 0.35, rng.range(1.1, 1.6), rng.range(-0.5, 0.5));
        else wallDecal(r.id, q, DECAL.drag, 1.4, 1.4, 0.6);
      }
      for (let k = 0; k < (r.kind === 'start' ? 1 : 5); k++) {
        const q = rng.pick(faces), tx = q.tx, ty = q.ty, roll = rng.next();
        floorDecal(r.id, tx, ty, roll < 0.25 ? DECAL.blood : roll < 0.4 ? DECAL.pool : roll < 0.6 ? DECAL.puddle : roll < 0.75 ? DECAL.drag : DECAL.scorch, rng.range(1, 1.9), rng.next() * 6.28);
      }
    }
    // blood trail leading toward the red door and a pool near the pod (story hints)
    const rr = L.rooms[L.redRoom]; for (const l of rr.links) for (let k = 0; k < 3; k++) { const tx = l.tx + (l.axis === 'x' ? (rr.x0 > l.tx ? 1 + k : -1 - k) : 0), ty = l.ty + (l.axis === 'z' ? (rr.y0 > l.ty ? 1 + k : -1 - k) : 0); if (L.tiles[ty * L.W + tx] === T_FLOOR) floorDecal(rr.id, tx, ty, DECAL.drag, 1.6, l.axis === 'x' ? 0 : 1.57); }
  }

  // ------------------------------------------------------------ runtime
  roomAtPos(x, z) { const L = this.L; const tx = Math.floor(x / 2), ty = Math.floor(z / 2); const i = (tx - 1) % GRID.STEP, j = (ty - 1) % GRID.STEP; if (tx < 1 || ty < 1 || i >= GRID.N || j >= GRID.N) { const d = L.links.find((l) => l.tx === tx && l.ty === ty); return d ? d.a : -1; } const rx = Math.floor((tx - 1) / GRID.STEP), ry = Math.floor((ty - 1) / GRID.STEP); return L.rooms.find((q) => q.rx === rx && q.ry === ry)?.id ?? -1; }
  updateVisibility(px, pz, extraRoom = -1) {
    const L = this.L; let pr = this.roomAtPos(px, pz); if (pr < 0) pr = extraRoom;
    this.playerRoom = pr; const maxHops = this.q.rooms + 1;
    for (const r of L.rooms) {
      const hops = pr < 0 ? 0 : L.dist[pr][r.id];
      const dx = Math.max(r.aabb.min.x - px, 0, px - r.aabb.max.x), dz = Math.max(r.aabb.min.z - pz, 0, pz - r.aabb.max.z);
      const vis = hops <= maxHops && Math.hypot(dx, dz) < 44; this.roomGroups[r.id].visible = vis; if (vis) this.visible.add(r.id); else this.visible.delete(r.id);
    }
    for (const d of this.doors) d.g.visible = this.visible.has(d.link.a) || this.visible.has(d.link.b);
  }
  updateDoorLights(hasKey) { for (const d of this.doors) d.setState(!d.lock || hasKey(d.lock)); }
  update(dt, t, frame) {
    for (const d of this.doors) if (d.g.visible) d.update(dt); else if (d.opening && d.progress < 1) d.update(dt);
    for (const l of this.lockers) if (this.visible.has(l.s.room)) l.update(dt);
    const pulse = 3.2 + Math.sin(t * 2.6) * 1.0; this.mats.pink.emissiveIntensity = pulse * (1 + (frame.nearLocker ? 0.5 : 0));
    this.mats.emerg.emissiveIntensity = 2.6 + Math.sin(t * 1.4) * 0.5; this.mats.red.emissiveIntensity = 2.4 + Math.sin(t * 5) * 0.8;
    for (const g of this.generators) if (this.visible.has(g.s.room)) g.animate(t);
    for (const f of this.flickerMats) { const n = Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2) + Math.sin(t * 31 + f.ph); f.k = n > 0.9 ? 0 : n > 0.2 ? 1 : 0.35 + 0.2 * Math.sin(t * 50); f.mat.emissiveIntensity = f.k * 1.4; if (Math.sin(t * 0.37 + f.ph) > 0.8) { f.k = 0; f.mat.emissiveIntensity = 0; } }
    for (const tm of this.terminals) if (this.visible.has(tm.s.room) && frame.px !== undefined && Math.hypot(tm.pos.x - frame.px, tm.pos.z - frame.pz) < 12 && t - tm.lastDraw > 0.07) { tm.lastDraw = t; if (!tm.used) tm.draw(t); }
  }
  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.root.parent?.remove(this.root); }
}
