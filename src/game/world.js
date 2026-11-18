// World builder: turns Halcyon Deep oil rig level data into 3D geometry (merged per room),
// provably closed walls from the Wall Edge Ledger, split-state doors (10 door styles + unique Escape Gate),
// modern supply chests, stormy Helideck with rescue helicopter, 4 crew rescue setpieces, and 16 story logs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CEILING, DOOR_H, CFG } from './config.js';
import { T_FLOOR, T_WALL, T_BLOCK, T_DOOR, DX, DY, GRID } from './levelgen.js';
import { RNG, hashSeed } from './rng.js';
import { DECAL, makeScreen, makeLabelTexture } from './textures.js';
import story from './story.json' with { type: 'json' };

const V3 = THREE.Vector3, EUL = new THREE.Euler(), QQ = new THREE.Quaternion();
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  EUL.set(rx, ry, rz, 'YXZ');
  QQ.setFromEuler(EUL);
  return new THREE.Matrix4().compose(new V3(x, y, z), QQ.clone(), new V3(sx, sy, sz));
};
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
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (rot) { const t = u; u = v; v = 1 - t; }
    uv.setXY(i, rect[0] + (rect[2] - rect[0]) * u, rect[1] + (rect[3] - rect[1]) * v);
  }
  return g;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffc928'; g.beginPath(); g.arc(128, 128, 120, 0, 6.3); g.fill();
  g.fillStyle = '#ffe680'; g.beginPath(); g.arc(128, 128, 96, 0, 6.3); g.fill();
  g.strokeStyle = '#a06800'; g.lineWidth = 6;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 6.283;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke();
  }
  g.fillStyle = '#ff9d00'; g.beginPath(); g.arc(128, 128, 38, 0, 6.3); g.fill();
  g.fillStyle = '#fff4b0'; g.beginPath(); g.arc(128, 128, 16, 0, 6.3); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World {
  constructor(level, tex, renderer, quality, hooks = {}) {
    this.L = level; this.tex = tex; this.q = quality; this.hooks = hooks; this.renderer = renderer;
    this.rng = new RNG(hashSeed('world' + level.seed));
    this.root = new THREE.Group();
    this.doorGroup = new THREE.Group(); this.doorGroup.name = 'doors'; this.root.add(this.doorGroup);
    this.debugGroup = new THREE.Group(); this.debugGroup.name = 'debug_f3'; this.debugGroup.visible = false; this.root.add(this.debugGroup);

    this.sources = []; this.doors = []; this.lockers = []; this.chests = this.lockers;
    this.terminals = []; this.generators = []; this.pod = null;
    this.logPickups = []; this.crewObjects = {}; this.valveObjects = []; this.stimCabinet = null; this.locketSpotObj = null;
    this.emitters = { steam: [], spark: [], drip: [] };
    this.flickerMats = []; this.shadowMeshes = []; this.seaWindows = [];
    this.builtWallEdges = new Set(); this.builtDoorLinks = new Set(); this.missingWallEdges = [];
    this.lightningTimer = 12 + this.rng.next() * 14;
    this.lightningFlash = 0;

    this.glowTex = glowTexture(); this.dialTex = dialTexture();
    this.makeMaterials();
    this.batches = level.rooms.map(() => new Map());
    this.inst = level.rooms.map(() => ({ crate: [], barrel: [] }));
    this.roomGroups = level.rooms.map((r) => {
      const g = new THREE.Group();
      g.name = 'room' + r.id;
      this.root.add(g);
      r.aabb = new THREE.Box3(new V3(r.x0 * 2, 0, r.y0 * 2), new V3((r.x0 + GRID.N) * 2, r.ceiling || CEILING, (r.y0 + GRID.N) * 2));
      return g;
    });

    for (const r of level.rooms) this.buildRoom(r);
    this.buildWallsFromLedger();
    for (const l of level.links) this.buildDoor(l);
    for (const t of level.terminals) this.buildTerminal(t);
    for (const l of level.lockers) this.buildLocker(l);
    for (const g of level.generators) this.buildGenerator(g);
    this.buildPod(level.pod);
    if (level.crewEncounters) this.buildCrewEncounters();
    if (level.logs) for (const lg of level.logs) this.buildLogPickup(lg);
    for (const p of level.props) this.buildProp(p);
    this.buildDecals();
    for (const r of level.rooms) this.flush(r);
    this.verifyWallLedger();
    this.buildDebugOverlay();
    this.visible = new Set();
  }

  // ------------------------------------------------------------ materials
  makeMaterials() {
    const t = this.tex, S = THREE.MeshStandardMaterial;
    const pbr = (set, o = {}) => new S({
      map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(o.ns ?? 1, o.ns ?? 1),
      aoMap: set.orm, roughnessMap: set.orm, metalnessMap: set.orm,
      roughness: o.rough ?? 1, metalness: o.metal ?? 1, color: o.color ?? 0xffffff,
      emissive: set.emissiveMap && o.emit ? 0xffffff : 0x000000,
      emissiveMap: o.emit ? set.emissiveMap : null, emissiveIntensity: o.emit ?? 1,
      side: THREE.FrontSide, depthTest: true, depthWrite: true, transparent: false,
    });
    this.pbr = pbr;
    const env = this.makeEnv();
    const m = this.mats = {
      wall: pbr(t.walls, { emit: 2.0, ns: 1.15 }),
      floor: pbr(t.floor, { ns: 1.2 }),
      floorWet: pbr(t.floor, { rough: 0.34, metal: 1, ns: 0.7 }),
      ceiling: pbr(t.ceiling),
      rust: pbr(t.rust),
      crate: pbr(t.crate),
      hazard: pbr(t.hazard),
      concrete: pbr(t.concrete),
      plateBase: pbr(t.plate),
      fixtureDead: new S({ color: 0x3e4650, roughness: 0.55, metalness: 0.6 }),
      sign: new S({ map: t.signs.map, emissiveMap: t.signs.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.55, metalness: 0.4 }),
      decal: new S({ map: t.decals, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      emerg: new S({ color: 0x1a0a02, emissive: 0xff6a10, emissiveIntensity: 3, fog: false }),
      pink: new S({ color: 0x062812, emissive: 0x28ff68, emissiveIntensity: 3.2, fog: false }), // Supply chest active green LED
      pinkDim: new S({ color: 0x14181a, emissive: 0x102818, emissiveIntensity: 0.15, fog: false }), // Opened chest LED off
      green: new S({ color: 0x041a08, emissive: 0x25ff60, emissiveIntensity: 3, fog: false }),
      red: new S({ color: 0x1a0404, emissive: 0xff2418, emissiveIntensity: 3, fog: false }),
      amber: new S({ color: 0x241604, emissive: 0xffb020, emissiveIntensity: 2.8, fog: false }),
      blueGlow: new S({ color: 0x041428, emissive: 0x38a8ff, emissiveIntensity: 2.8, fog: false }),
      lampOff: new S({ color: 0x1a1414, emissive: 0x200404, emissiveIntensity: 0.5 }),
      dark: new S({ color: 0x06080c, roughness: 0.85, metalness: 0.35 }),
      rubber: new S({ color: 0x0c0e12, roughness: 0.7, metalness: 0.2 }),
      glass: new S({ color: 0x081824, emissive: 0x123e58, emissiveIntensity: 0.85, roughness: 0.12, metalness: 0.7 }),
      seaWater: new S({ color: 0x04101a, emissive: 0x061e2e, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.85 }),
      spent: new S({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.5 }),
      screenDead: new S({ color: 0x02080c, emissive: 0x063848, emissiveIntensity: 0.65, roughness: 0.2 }),
      safetyYellow: new S({ color: 0xe6a818, roughness: 0.45, metalness: 0.4 }),
      lifeOrange: new S({ color: 0xe85818, roughness: 0.4, metalness: 0.25 }),
      medWhite: new S({ color: 0xdce4ec, roughness: 0.35, metalness: 0.2 }),
    };
    m.floorWet.envMap = env; m.floorWet.envMapIntensity = 1.35;
    m.seaWater.envMap = env; m.seaWater.envMapIntensity = 1.5;
    this.plateCache = new Map();
    this.labelTex = {
      ready: makeLabelTexture('READY', { w: 256, h: 64, fg: '#ffd040', border: '#c9a21a' }),
      spent: makeLabelTexture('SPENT', { w: 256, h: 64, fg: '#6a6a6a', border: '#444' }),
      gen: makeLabelTexture('GENERATOR', { w: 384, h: 64, fg: '#ffb55a', border: '#d98324', font: 'bold 38px Silkscreen, monospace' }),
      pod: makeLabelTexture('HELIDECK // H', { w: 512, h: 96, fg: '#ffe030', bg: '#141e28', border: '#e09a20', font: 'bold 48px Silkscreen, monospace' }),
      gate: makeLabelTexture('HELIDECK BLAST GATE', { w: 512, h: 80, fg: '#ffe030', bg: '#14181e', border: '#e09a20', font: 'bold 34px Silkscreen, monospace' }),
      supply: makeLabelTexture('SUPPLY', { w: 256, h: 48, fg: '#161a1e', bg: '#e0a01c', font: 'bold 30px Silkscreen, monospace' }),
    };
  }
  makeEnv() {
    const sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.BoxGeometry(60, 20, 60), new THREE.MeshBasicMaterial({ color: 0x05080e, side: THREE.BackSide })));
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0xff9a28 : 0x80c8ff).multiplyScalar(i % 2 ? 6 : 3.5), side: THREE.DoubleSide }));
      m.position.set(Math.cos(i * 1.05) * 12, 9, Math.sin(i * 1.05) * 12); m.lookAt(0, 0, 0); sc.add(m);
    }
    const pm = new THREE.PMREMGenerator(this.renderer); const rt = pm.fromScene(sc, 0.04); pm.dispose(); return rt.texture;
  }
  plate(hex, rough = 0.6, metal = 0.75) {
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
  addPlate(room, hex, geo, matrix, rough, metal) {
    const k = 'plate:' + hex + ':' + (rough ?? 0.6) + ':' + (metal ?? 0.75);
    if (!this.mats[k]) this.mats[k] = this.plate(hex, rough, metal);
    this.add(room, k, geo, matrix);
  }
  flush(r) {
    const grp = this.roomGroups[r.id];
    for (const [key, list] of this.batches[r.id]) {
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      // Prompt 1 Bug A Item 1: compute both boundingBox and boundingSphere after merging
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geo, this.mats[key]);
      mesh.name = key;
      const isDecal = key === 'decal';
      mesh.castShadow = !isDecal && key !== 'sign';
      mesh.receiveShadow = !isDecal;
      // Prompt 1 Bug A Item 1: disable frustum culling on merged room batches so walls never pop out
      mesh.frustumCulled = false;
      if (isDecal) mesh.renderOrder = 2;
      grp.add(mesh);
      if (mesh.castShadow) this.shadowMeshes.push(mesh);
    }
    const ins = this.inst[r.id];
    if (ins.crate.length) {
      const im = new THREE.InstancedMesh(this.crateGeo ??= new THREE.BoxGeometry(1, 1, 1), this.mats.crate, ins.crate.length);
      ins.crate.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = true;
      im.frustumCulled = false;
      grp.add(im);
    }
    if (ins.barrel.length) {
      if (!this.barrelGeo) {
        const parts = [cylGeo(0.34, 0.9, 14, 0.8)];
        for (const y of [-0.3, 0, 0.3]) { const t = new THREE.TorusGeometry(0.345, 0.018, 4, 14); t.rotateX(Math.PI / 2); t.translate(0, y, 0); parts.push(t); }
        this.barrelGeo = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const n of Object.keys(q.attributes)) if (!KEEP.includes(n)) q.deleteAttribute(n); return q; }));
      }
      const mat = this.plate('#ffffff');
      const im = new THREE.InstancedMesh(this.barrelGeo, mat, ins.barrel.length);
      const cols = [0xd87a24, 0x2c6494, 0xd8a820, 0xa83228, 0x3b6e5c];
      ins.barrel.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = true;
      im.frustumCulled = false;
      grp.add(im);
    }
  }
  hold(roomId, obj) { this.roomGroups[roomId].add(obj); return obj; }
  sprite(mat, size, x, y, z, parent) { const s = new THREE.Sprite(mat); s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s; }
  glowMat(color, op = 0.9) { return new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); }

  // ------------------------------------------------------------ Wall Edge Ledger Builder & Verification (Bug A Fix)
  buildWallsFromLedger() {
    const thick = CFG.wall.thickness; // 0.3 m real 3D box thickness
    const gap = CFG.wall.coplanarGap; // 0.01 m gap to prevent coplanar z-fighting
    for (const e of this.L.wallLedger) {
      if (e.kind === 'doorway') continue; // Built by buildDoor
      const ceil = e.ceiling || CEILING;
      // Place 0.3m thick box wall along the tile boundary edge, offset slightly into the wall tile
      const edgeX = (e.tx + 0.5) * 2 + DX[e.dir] * (1.0 + thick * 0.5 - gap);
      const edgeZ = (e.ty + 0.5) * 2 + DY[e.dir] * (1.0 + thick * 0.5 - gap);
      const th = Math.atan2(-DX[e.dir], -DY[e.dir]);
      const wGeo = setUV(boxGeo(2.0, ceil, thick, 0.5), this.tex.walls.uv(e.design ?? 0));
      this.add(e.roomId, 'wall', wGeo, M(edgeX, ceil / 2, edgeZ, 0, th, 0));
      this.builtWallEdges.add(e.edgeId);
    }
  }

  verifyWallLedger() {
    this.missingWallEdges = [];
    for (const e of this.L.wallLedger) {
      if (e.kind === 'doorway') {
        if (!this.builtDoorLinks.has(e.linkId)) this.missingWallEdges.push(e);
      } else {
        if (!this.builtWallEdges.has(e.edgeId)) this.missingWallEdges.push(e);
      }
    }
    if (this.missingWallEdges.length > 0) {
      console.error('Missing wall edges in ledger:', this.missingWallEdges);
    }
    return { ok: this.missingWallEdges.length === 0, missing: this.missingWallEdges.length };
  }

  buildDebugOverlay() {
    while (this.debugGroup.children.length) this.debugGroup.remove(this.debugGroup.children[0]);
    this.debugRoomBoxes = new Map();
    for (const r of this.L.rooms) {
      const box = new THREE.Box3Helper(r.aabb, 0x25ff60);
      this.debugGroup.add(box);
      this.debugRoomBoxes.set(r.id, box);
    }
    const doorGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8);
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffe030, wireframe: true });
    for (const d of this.doors) {
      const m = new THREE.Mesh(doorGeo, doorMat);
      m.position.set(d.pos.x, 1.4, d.pos.z);
      this.debugGroup.add(m);
    }
    // Mark any missing wall edge with a red pillar (Prompt 1 Section 1)
    const errGeo = new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8);
    const errMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (const e of this.missingWallEdges) {
      const m = new THREE.Mesh(errGeo, errMat);
      m.position.set((e.tx + 0.5) * 2 + DX[e.dir], 1.75, (e.ty + 0.5) * 2 + DY[e.dir]);
      this.debugGroup.add(m);
    }
  }

  setDebugVisible(v) {
    this.debugGroup.visible = !!v;
  }

  // ------------------------------------------------------------ rooms
  buildRoom(r) {
    const L = this.L, W = L.W, N = GRID.N, rng = this.rng, id = r.id;
    const tl = (x, y) => L.tiles[y * W + x];
    const rg = (x, y) => (L.roomGrid ? L.roomGrid[y * W + x] : -1);
    const ceil = r.ceiling || CEILING;
    const isHelideck = r.roomType === 'helideck';
    const floorBase = isHelideck ? 3 : r.roomType === 'corridor' || r.roomType === 'pipe_deck' ? 0 : rng.pick([0, 1, 2, 3]);
    const cross = [3, 4];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tx = r.x0 + i, ty = r.y0 + j, t = tl(tx, ty);
        if (rg(tx, ty) !== id) continue;
        const cx = (tx + 0.5) * 2, cz = (ty + 0.5) * 2;
        const onRow = cross.includes(j), onCol = cross.includes(i);
        const variant = isHelideck ? 3 : onRow || onCol ? 2 : floorBase;
        const rot = onCol && !onRow ? 1 : 0;
        if (t !== T_BLOCK) {
          this.add(id, r.wet ? 'floorWet' : 'floor', setUV(new THREE.PlaneGeometry(2, 2), this.tex.floor.uv(variant), rot), M(cx, 0, cz, -Math.PI / 2, 0, 0));
        }
        // Helideck is open to the stormy night sky (high weather ceiling frame)
        if (!isHelideck) {
          this.add(id, 'ceiling', new THREE.PlaneGeometry(2, 2), M(cx, ceil, cz, Math.PI / 2, 0, 0));
        }
      }
    }

    // Collect boundary faces for decals, emergency strips & storm windows
    this.faces = this.faces || {};
    const faces = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tx = r.x0 + i, ty = r.y0 + j;
        if (tl(tx, ty) === T_FLOOR) {
          for (let d = 0; d < 4; d++) {
            if (tl(tx + DX[d], ty + DY[d]) === T_WALL) faces.push({ tx, ty, d, i, j });
          }
        }
      }
    }
    this.faces[id] = faces;

    // Add storm sea windows in living, control, office, and vestibule rooms (Prompt 2 Section 1.6)
    if (!isHelideck && ['crew_quarters', 'mess_galley', 'control_room', 'office', 'escape_vestibule', 'lifeboat_station'].includes(r.roomType) && faces.length > 2) {
      const winFaces = faces.filter((f) => f.i === 2 || f.i === 5 || f.j === 2 || f.j === 5).slice(0, 2);
      for (const wf of winFaces) {
        const wx = (wf.tx + 0.5) * 2 + DX[wf.d] * 0.96;
        const wz = (wf.ty + 0.5) * 2 + DY[wf.d] * 0.96;
        const th = Math.atan2(-DX[wf.d], -DY[wf.d]);
        this.addPlate(id, '#24303c', boxGeo(1.5, 1.05, 0.08, 0.5), M(wx, 1.65, wz, 0, th, 0));
        const winMat = new THREE.MeshStandardMaterial({ color: 0x051422, emissive: 0x123a5a, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.8 });
        const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.86), winMat);
        winMesh.position.set(wx - DX[wf.d] * 0.045, 1.65, wz - DY[wf.d] * 0.045);
        winMesh.rotation.y = th;
        this.hold(id, winMesh);
        this.seaWindows.push({ mat: winMat, room: id });
      }
    }

    // Two-level catwalk with yellow safety rails (Prompt 1 Section 4.2 & Prompt 2 Section 2)
    if (r.hasCatwalk) {
      const cwY = 2.15;
      for (let i = 1; i < N - 1; i++) {
        const cx = (r.x0 + i + 0.5) * 2, cz = (r.y0 + 1.5) * 2;
        this.add(id, 'floor', setUV(new THREE.PlaneGeometry(2, 1.6), this.tex.floor.uv(0)), M(cx, cwY, cz, -Math.PI / 2, 0, 0));
        this.add(id, 'safetyYellow', boxGeo(2.0, 0.05, 0.05), M(cx, cwY + 0.95, cz + 0.78));
        this.add(id, 'safetyYellow', boxGeo(2.0, 0.04, 0.04), M(cx, cwY + 0.5, cz + 0.78));
        this.add(id, 'safetyYellow', boxGeo(0.05, 0.95, 0.05), M(cx - 0.9, cwY + 0.475, cz + 0.78));
      }
    }

    // Obstacle blocks: offshore machinery / tarped supply stacks
    for (const b of r.blocks) {
      const w = b.w * 2, h = b.h * 2, ht = rng.pick([1.3, 1.8, 2.2]), cx = b.tx * 2 + w / 2, cz = b.ty * 2 + h / 2;
      this.add(id, 'crate', boxGeo(w - 0.04, ht, h - 0.04, 0.5), M(cx, ht / 2, cz));
      this.add(id, 'concrete', boxGeo(w, 0.22, h, 0.5), M(cx, 0.11, cz));
      this.add(id, 'hazard', boxGeo(w + 0.02, 0.16, h + 0.02, 1), M(cx, ht - 0.12, cz));
    }

    // Room-specific light mood (Prompt 2 Section 1.5)
    const mood = r.lightMood || { color: '0xcfe0ff', intensity: 7, flicker: r.flicker };
    const moodHex = Number(mood.color || 0xcfe0ff);
    const fixtures = [[2, 2], [5.5, 2], [2, 5.5], [5.5, 5.5], [3.6, 3.6]];
    let live = null;
    if (!isHelideck && (r.flicker || mood.flicker || r.kind === 'start')) {
      live = new THREE.MeshStandardMaterial({ color: 0x444c56, emissive: moodHex, emissiveIntensity: 0.9, roughness: 0.4 });
      this.flickerMats.push({ mat: live, room: id, ph: rng.next() * 50 });
    }
    if (!isHelideck) {
      fixtures.forEach(([fi, fj], k) => {
        const tx = r.x0 + Math.floor(fi), ty = r.y0 + Math.floor(fj);
        if (tl(tx, ty) !== T_FLOOR) return;
        const cx = (r.x0 + fi + 0.5) * 2 - 1, cz = (r.y0 + fj + 0.5) * 2 - 1;
        const g = boxGeo(1.3, 0.1, 0.38, 0.5);
        const f = new THREE.Mesh(g, live && k < 3 ? live : this.mats.fixtureDead);
        f.position.set(cx, ceil - 0.05, cz);
        f.rotation.y = k % 2 ? 0 : Math.PI / 2;
        this.hold(id, f);
        this.add(id, 'rust', boxGeo(1.4, 0.04, 0.46, 0.5), M(cx, ceil - 0.02, cz, 0, k % 2 ? 0 : Math.PI / 2, 0));
      });
    }
    this.sources.push({
      x: (r.x0 + 4) * 2,
      y: Math.min(ceil - 0.4, 2.7),
      z: (r.y0 + 4) * 2,
      color: moodHex,
      intensity: 0,
      base: mood.intensity || 7,
      dist: 16,
      room: id,
      flick: live ? this.flickerMats[this.flickerMats.length - 1] : null,
    });

    // Overhead pipes, cable trays, steam, sparks & water drips
    if (!isHelideck) {
      for (const j of [2.1, 5.9]) if (rng.chance(0.75)) {
        const along = rng.chance(0.5), len = 14, py = ceil - 0.28;
        const p = new THREE.CylinderGeometry(0.09, 0.09, len, 8, 1); p.rotateZ(Math.PI / 2);
        const cx = (r.x0 + 4) * 2;
        const m1 = along ? M(cx, py, (r.y0 + j) * 2) : M((r.x0 + j) * 2, py, (r.y0 + 4) * 2, 0, Math.PI / 2, 0);
        this.add(id, 'rust', p, m1);
        if (rng.chance(0.45)) this.emitters.steam.push({ x: (r.x0 + 2 + rng.int(0, 4)) * 2 + 1, y: py - 0.1, z: (r.y0 + j) * 2, room: id, ph: rng.next() * 9 });
      }
      if (rng.chance(0.65)) {
        const x = (r.x0 + rng.int(1, 6) + 0.5) * 2, z = (r.y0 + rng.int(1, 6) + 0.5) * 2;
        if (tl(Math.floor(x / 2), Math.floor(z / 2)) === T_FLOOR) this.emitters.drip.push({ x, y: ceil - 0.1, z, room: id, next: rng.next() * 4 });
      }
    }

    // Emergency strips
    if (r.emergency || r.kind === 'pod') {
      const f = rng.shuffle(faces.slice()).slice(0, 6);
      for (const q of f) {
        const cx = (q.tx + 0.5) * 2 + DX[q.d] * 0.94, cz = (q.ty + 0.5) * 2 + DY[q.d] * 0.94, th = Math.atan2(-DX[q.d], -DY[q.d]);
        this.add(id, 'emerg', boxGeo(1.6, 0.07, 0.05, 1), M(cx, Math.min(2.7, ceil - 0.25), cz, 0, th, 0));
        this.add(id, 'emerg', boxGeo(1.6, 0.07, 0.05, 1), M(cx, 0.42, cz, 0, th, 0));
      }
    }
  }

  // ------------------------------------------------------------ doors (Bug B Fix + 10 Door Styles + Unique Escape Gate)
  buildDoor(link) {
    const L = this.L, rooms = L.rooms;
    const rA = rooms[link.a], rB = rooms[link.b];
    const ceil = Math.max(rA.ceiling || CEILING, rB.ceiling || CEILING);
    const hatch = link.kind === 'hatch';
    const isEscapeGate = !!link.isEscapeGate;
    const style = link.doorStyle || (hatch ? 'hatch' : 'cabin');

    const g = new THREE.Group();
    g.position.set((link.tx + 0.5) * 2, 0, (link.ty + 0.5) * 2);
    g.rotation.y = link.axis === 'x' ? Math.PI / 2 : 0;

    // Natural entry threshold: floor strip in hazard/tread material + ceiling cap inside door cell
    const cellRoom = link.a;
    this.add(cellRoom, 'hazard', boxGeo(2.0, 0.03, 0.45, 1), M((link.tx + 0.5) * 2, 0.015, (link.ty + 0.5) * 2, 0, link.axis === 'x' ? Math.PI / 2 : 0, 0));
    this.add(cellRoom, 'floor', setUV(new THREE.PlaneGeometry(2, 2), this.tex.floor.uv(2), link.axis === 'x' ? 0 : 1), M((link.tx + 0.5) * 2, 0, (link.ty + 0.5) * 2, -Math.PI / 2, 0, 0));
    this.add(cellRoom, 'ceiling', new THREE.PlaneGeometry(2, 2), M((link.tx + 0.5) * 2, ceil, (link.ty + 0.5) * 2, Math.PI / 2, 0, 0));

    const col = isEscapeGate ? 0xe0a018 : hatch ? 0xd18a1c : link.lock === 'red' ? 0xc22a2a : link.lock === 'blue' ? 0x2f60d0 : 0x3b6e58;
    const frameMat = this.plate(col, 0.6, 0.7);
    const mk = (geo, mat, x, y, z, sh = true, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = sh;
      m.receiveShadow = true;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    };

    let leaves = [], pivot = null, handWheel = null, beaconMesh = null;
    if (isEscapeGate) {
      // Prompt 2 Section 5: THE ESCAPE GATE (unique twin-leaf blast door, hazard chevrons, white H, HELIDECK stencil, rotating beacon)
      mk(boxGeo(0.32, ceil, 0.68), this.mats.hazard, -0.86, ceil / 2, 0);
      mk(boxGeo(0.32, ceil, 0.68), this.mats.hazard, 0.86, ceil / 2, 0);
      mk(boxGeo(2.04, ceil - DOOR_H, 0.68), this.mats.hazard, 0, DOOR_H + (ceil - DOOR_H) / 2, 0);
      const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.26), new THREE.MeshStandardMaterial({ map: this.labelTex.gate, emissiveMap: this.labelTex.gate, emissive: 0xffffff, emissiveIntensity: 1.5 }));
      gateSign.position.set(0, 2.55, -0.35); gateSign.rotation.y = Math.PI; g.add(gateSign);
      const gateSign2 = gateSign.clone(); gateSign2.position.z = 0.35; gateSign2.rotation.y = 0; g.add(gateSign2);
      // Rotating beacon on top
      beaconMesh = mk(new THREE.CylinderGeometry(0.11, 0.14, 0.22, 12), this.mats.red, 0, 2.82, -0.38);
      // Blue keycard status slot panel
      mk(boxGeo(0.22, 0.34, 0.08), this.mats.blueGlow, 0.84, 1.35, -0.35);
      const leafMat = this.plate('#2e3844', 0.45, 0.85);
      for (const s of [-1, 1]) {
        const lf = new THREE.Group(); lf.position.set(s * 0.38, 0, 0); g.add(lf);
        mk(boxGeo(0.76, DOOR_H - 0.02, 0.24, 0.5), leafMat, 0, DOOR_H / 2, 0, true, lf);
        mk(boxGeo(0.76, 0.38, 0.25, 1), this.mats.hazard, 0, 0.35, 0, false, lf);
        // Giant white 'H' half on each leaf
        mk(boxGeo(0.12, 0.75, 0.26), this.mats.medWhite, s * -0.16, 1.35, 0, false, lf);
        mk(boxGeo(0.22, 0.12, 0.26), this.mats.medWhite, s * -0.26, 1.35, 0, false, lf);
        leaves.push({ g: lf, s });
      }
    } else if (!hatch) {
      // Standard door frame (both jambs + full lintel up to ceil)
      mk(boxGeo(0.26, DOOR_H, 0.52), frameMat, -0.88, DOOR_H / 2, 0);
      mk(boxGeo(0.26, DOOR_H, 0.52), frameMat, 0.88, DOOR_H / 2, 0);
      mk(boxGeo(2.02, ceil - DOOR_H, 0.52), frameMat, 0, DOOR_H + (ceil - DOOR_H) / 2, 0);

      // Door style variations (Prompt 2 Section 4)
      const leafColor = style === 'med_double' ? '#dce4ec' : style === 'watertight' ? '#4a5866' : style === 'insulated_latch' ? '#8a98a6' : style === 'roller_shutter' ? '#5c646e' : '#525e6a';
      const leafMat = style === 'glass_sliding' ? this.mats.glass : this.plate(leafColor, 0.55, 0.78);
      for (const s of [-1, 1]) {
        const lf = new THREE.Group(); lf.position.set(s * 0.38, 0, 0); g.add(lf);
        mk(boxGeo(0.76, DOOR_H - 0.04, 0.16, 0.5), leafMat, 0, DOOR_H / 2, 0, true, lf);
        if (style === 'med_double') {
          // Red cross on medical double doors
          mk(boxGeo(0.28, 0.08, 0.18), this.mats.red, 0, 1.45, 0, false, lf);
          mk(boxGeo(0.08, 0.28, 0.18), this.mats.red, 0, 1.45, 0, false, lf);
        } else if (style === 'watertight' && s === -1) {
          // Spinning hand wheel on watertight door
          handWheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 18), this.mats.safetyYellow);
          handWheel.position.set(0.12, 1.2, 0.11);
          lf.add(handWheel);
        } else if (style === 'porthole_swing') {
          const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 16), this.mats.glass);
          ph.rotation.x = Math.PI / 2; ph.position.set(0, 1.5, 0); lf.add(ph);
        } else {
          mk(boxGeo(0.75, 0.26, 0.18, 1), this.mats.hazard, 0, 0.22, 0, false, lf);
        }
        leaves.push({ g: lf, s });
      }
    } else {
      // Round emergency hatch that swings on a heavy hinge
      const sh = new THREE.Shape();
      sh.moveTo(-1, 0); sh.lineTo(1, 0); sh.lineTo(1, ceil); sh.lineTo(-1, ceil); sh.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 1.1, 0.92, 0, Math.PI * 2, true); sh.holes.push(hole);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: false, curveSegments: 24 });
      eg.translate(0, 0, -0.18);
      mk(eg, frameMat, 0, 0, 0);
      const ring = new THREE.TorusGeometry(0.95, 0.075, 8, 32);
      for (const z of [-0.18, 0.18]) mk(ring, this.plate('#e8a030', 0.5, 0.7), 0, 1.1, z);
      pivot = new THREE.Group(); pivot.position.set(-0.92, 1.1, 0); g.add(pivot);
      const disc = mk(cylGeo(0.88, 0.22, 24, 0.5), this.plate('#d9962a', 0.55, 0.7), 0.92, 0, 0, true, pivot);
      disc.rotation.x = Math.PI / 2;
      const wheel = mk(new THREE.TorusGeometry(0.28, 0.035, 6, 18), this.mats.dark, 0.92, 0, 0.15, false, pivot);
      handWheel = wheel;
    }

    // Status lights & room name signs on both sides of doorway (Prompt 1 Section 4.5 & Prompt 2 Section 2)
    const lights = [];
    for (const z of [-0.29, 0.29]) {
      const lm = mk(new THREE.BoxGeometry(0.34, 0.1, 0.05), link.lock ? this.mats.red : this.mats.green, 0, hatch ? 2.32 : 2.38, z, false);
      lights.push(lm);
      lights.push(this.sprite(this.glowMat(0xffffff, 0.0), 0.7, 0, hatch ? 2.32 : 2.38, z * 1.4, g));
    }
    for (const [z, rm] of [[0.28, link.b], [-0.28, link.a]]) {
      const sg = new THREE.Mesh(setUV(new THREE.PlaneGeometry(1.32, 0.30), this.tex.signs.uv(rooms[rm].name)), this.mats.sign);
      sg.position.set(0, hatch ? 2.68 : 2.66, z);
      if (z < 0) sg.rotation.y = Math.PI;
      g.add(sg);
    }

    // Prompt 1 Section 2 (Bug B Fix): Split door state into lockType, lockState, physical, actor, autoCloseTimer
    const lockType = isEscapeGate ? 'escape' : link.lock || 'none';
    const door = {
      type: 'door',
      link,
      g,
      leaves,
      pivot,
      handWheel,
      beaconMesh,
      hatch,
      isEscapeGate,
      doorStyle: style,
      axis: link.axis,
      tx: link.tx,
      ty: link.ty,
      lock: link.lock,
      lockType,
      lockState: 'locked',          // Changes ONLY when PLAYER unlocks/opens
      physical: 'closed',           // 'closed' | 'opening' | 'open' | 'closing' | 'broken'
      actor: 'none',                // 'none' | 'player' | 'creature'
      autoCloseTimer: 0,
      progress: 0,
      t: 0,
      opening: false,
      lights,
      dur: isEscapeGate ? CFG.door.escapeOpenTime : hatch ? CFG.door.hatchOpenTime : CFG.door.openTime,
      pos: new V3((link.tx + 0.5) * 2, 1.2, (link.ty + 0.5) * 2),
      state: null,
      w: this,
      blocking() {
        if (this.physical === 'broken') return false;
        return this.progress < 0.78;
      },
      // Player-initiated open: unlocks lockState and opens permanently
      playerOpen() {
        if (this.physical === 'broken' || (this.physical === 'open' && this.actor === 'player')) return false;
        this.lockState = 'unlocked';
        this.actor = 'player';
        this.physical = 'opening';
        this.opening = true;
        this.autoCloseTimer = 0;
        if (this.beaconMesh) this.beaconMesh.material = this.w.mats.green;
        return true;
      },
      // Alias kept for existing scripts/tests
      open() {
        return this.playerOpen();
      },
      // Player manual close action (Prompt 3 Section 2.7: hold E for 0.5s, +10 noise)
      playerClose() {
        if (this.physical === 'broken' || this.hatch || this.isEscapeGate || this.progress < 0.5) return false;
        this.actor = 'player';
        this.physical = 'closing';
        this.opening = false;
        this.autoCloseTimer = 0;
        return true;
      },
      // Creature-initiated open: NEVER changes lockState, auto-closes after 6s (Prompt 1 Bug B)
      monsterOpen() {
        if (this.lockType !== 'none') return false; // Red, blue, and escape doors are impassable!
        if (this.physical === 'broken') return false;
        this.actor = 'creature';
        this.autoCloseTimer = CFG.door.monsterAutoClose;
        if (this.physical === 'open' || this.physical === 'opening') return false;
        this.physical = 'opening';
        return true;
      },
      // Creature rage bash: breaks physical leaves, keeps lockState unchanged (Prompt 1 Bug B & Prompt 3 Section 2.5)
      monsterBash() {
        if (this.lockType !== 'none') return false;
        this.actor = 'creature';
        this.physical = 'broken';
        this.progress = 1;
        this.t = 1;
        this.autoCloseTimer = 0;
        for (const l of this.leaves) {
          l.g.position.x = l.s * 1.18;
          l.g.rotation.z = l.s * 0.22;
        }
        return true;
      },
      setState(ok) {
        if (this.state === ok) return;
        this.state = ok;
        const mat = ok ? this.w.mats.green : this.w.mats.red;
        for (const l of this.lights) {
          if (l.isSprite) {
            l.material.color.set(ok ? 0x30ff70 : 0xff3020);
            l.material.opacity = 0.55;
          } else l.material = mat;
        }
      },
      update(dt) {
        if (this.physical === 'broken') return;
        if (this.physical === 'opening') {
          this.t = Math.min(1, this.t + dt / this.dur);
          this.progress = this.t;
          if (this.progress >= 1) this.physical = 'open';
        } else if (this.physical === 'closing') {
          this.t = Math.max(0, this.t - dt / CFG.door.closeTime);
          this.progress = this.t;
          if (this.progress <= 0) {
            this.physical = 'closed';
            this.opening = false;
          }
        } else if (this.physical === 'open' && this.actor === 'creature' && this.autoCloseTimer > 0) {
          this.autoCloseTimer -= dt;
          if (this.autoCloseTimer <= 0) {
            this.autoCloseTimer = 0;
            this.physical = 'closing';
          }
        }
        const e = ease(this.progress);
        if (this.handWheel) this.handWheel.rotation.z = e * Math.PI * 2;
        if (this.hatch) {
          const bounce = this.progress > 0.8 ? Math.sin((this.progress - 0.8) * 40) * 0.06 * (1 - this.progress) * 5 : 0;
          this.pivot.rotation.y = -(1.85 * e + bounce);
        } else {
          for (const l of this.leaves) l.g.position.x = l.s * (0.38 + 0.95 * e);
        }
      },
    };

    door.setState(!link.lock);
    this.doorGroup.add(g);
    this.doors.push(door);
    this.builtDoorLinks.add(link.id);
    g.userData.rooms = [link.a, link.b];
  }

  // ------------------------------------------------------------ Supply Chests (Prompt 2 Section 7: replaces old pink boxes)
  slotGroup(s, room) {
    const g = new THREE.Group();
    g.position.set(s.cx, 0, s.cz);
    g.rotation.y = Math.atan2(-DX[s.dir], -DY[s.dir]);
    this.hold(room, g);
    return g;
  }
  buildLocker(s) {
    // Modern steel supply chest (90 x 50 x 45 cm) on a low deck frame, olive/yellow steel, hinged top lid (0.6s anim), blinking green LED
    const g = this.slotGroup(s, s.room);
    const bodyM = this.plate(s.content === 'red' || s.content === 'blue' ? '#5e6b4c' : '#4e5c48', 0.55, 0.65);
    const lidM = this.plate('#c89622', 0.48, 0.7);
    const mk = (geo, mat, x, y, z, parent = g) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // Low steel deck stand (height 0.25m) + chest body (0.90 x 0.45 x 0.50m)
    mk(boxGeo(0.92, 0.24, 0.52, 0.5), this.mats.dark, 0, 0.12, 0);
    mk(boxGeo(0.90, 0.42, 0.50, 0.5), bodyM, 0, 0.45, 0);
    // Interior tray + visible contents (keycard case, decoy cylinder, food tin)
    mk(new THREE.BoxGeometry(0.82, 0.04, 0.42), this.mats.dark, 0, 0.62, 0);
    if (s.content === 'red' || s.content === 'blue') {
      mk(new THREE.BoxGeometry(0.18, 0.02, 0.12), s.content === 'red' ? this.mats.red : this.mats.blueGlow, -0.15, 0.65, 0);
    } else {
      mk(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 10), this.mats.amber, -0.18, 0.66, 0);
    }
    if (s.foodType) {
      mk(new THREE.BoxGeometry(0.14, 0.08, 0.10), this.mats.safetyYellow, 0.18, 0.66, 0);
    }
    // Hinged lid at the back edge (y = 0.66, z = -0.24)
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.66, -0.24);
    g.add(pivot);
    mk(boxGeo(0.92, 0.08, 0.52, 0.5), lidM, 0, 0.04, 0.24, pivot);
    // Faint reflective hazard stripe on lid + SUPPLY stencil
    mk(boxGeo(0.84, 0.015, 0.12, 1), this.mats.hazard, 0, 0.085, 0.24, pivot);
    // Metal latches & front handle
    const handle = mk(new THREE.BoxGeometry(0.24, 0.04, 0.05), this.mats.safetyYellow, 0, 0.02, 0.51, pivot);
    for (const lx of [-0.32, 0.32]) mk(new THREE.BoxGeometry(0.06, 0.10, 0.04), this.mats.plateBase, lx, 0.0, 0.505, pivot);
    // Blinking green LED on front while unopened, turns off when empty
    const top = mk(new THREE.BoxGeometry(0.12, 0.045, 0.04), this.mats.pink, 0, 0.56, 0.26);
    const gl = this.sprite(this.glowMat(0x28ff68, 0.85), 0.95, 0, 0.82, 0.22, g);

    const lk = {
      type: 'locker',
      s,
      g,
      pivot,
      handle,
      top,
      gl,
      content: s.content,
      extraItem: s.extraItem || null,
      foodType: s.foodType || null,
      opened: false,
      t: 0,
      id: s.id,
      pos: new V3(s.cx - DX[s.dir] * 0.85, 0.65, s.cz - DY[s.dir] * 0.85),
      w: this,
      open() {
        if (this.opened) return null;
        this.opened = true;
        this.top.material = this.w.mats.pinkDim;
        this.gl.material.opacity = 0.0;
        return this.content;
      },
      update(dt) {
        const target = this.opened ? 1 : 0;
        // 0.6s lid opening animation (Prompt 2 Section 7)
        this.t = target > this.t ? Math.min(1, this.t + dt / CFG.chest.openTime) : Math.max(0, this.t - dt / CFG.chest.openTime);
        this.pivot.rotation.x = -1.25 * ease(this.t);
      },
    };
    this.lockers.push(lk);
  }

  // ------------------------------------------------------------ Terminals & Generators
  buildTerminal(s) {
    const g = this.slotGroup(s, s.room), bodyM = this.plate('#3e4a58', 0.55, 0.75);
    const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    mk(boxGeo(1.1, 0.85, 0.7, 0.5), bodyM, 0, 0.425, 0);
    mk(boxGeo(1.16, 0.06, 0.76, 0.5), this.plate('#222830', 0.5, 0.8), 0, 0.88, 0);
    const panel = new THREE.Group(); panel.position.set(0, 1.2, -0.12); panel.rotation.x = -0.28; g.add(panel);
    mk(boxGeo(1.0, 0.66, 0.1, 0.5), this.plate('#1c222a', 0.5, 0.8), 0, 0, 0, panel);
    const scr = makeScreen(256, 160);
    const sm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 1.8, roughness: 0.2, fog: false });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.55), sm); sp.position.z = 0.052; panel.add(sp);
    mk(new THREE.BoxGeometry(0.7, 0.03, 0.22), this.mats.dark, 0, 0.93, 0.2);
    const gl = this.sprite(this.glowMat(0x30ffe0, 0.55), 1.4, 0, 1.25, 0.25, g);
    const tm = {
      type: 'terminal', s, g, scr, sm, gl, id: s.id, used: false,
      pos: new V3(s.cx - DX[s.dir] * 0.9, 1.0, s.cz - DY[s.dir] * 0.9),
      lines: story.terminals[s.id].log, lastDraw: 0,
      draw(t) {
        const { ctx, tex } = this.scr;
        ctx.fillStyle = '#031418'; ctx.fillRect(0, 0, 256, 160); ctx.font = '10px monospace'; ctx.textBaseline = 'top';
        if (this.used) { ctx.fillStyle = '#1c5a54'; ctx.fillText('> LOG ARCHIVED', 10, 10); ctx.fillText('> TERMINAL LOCKED', 10, 24); }
        else {
          const off = (t * 14) % 180; ctx.fillStyle = '#4ff0e0';
          const all = [...this.lines, '', ...this.lines]; let y = 8 - off;
          for (const ln of all) {
            const words = ln.split(' '); let line = '';
            for (const w of words) {
              if ((line + w).length > 36) { if (y > -12 && y < 160) ctx.fillText(line, 8, y); y += 12; line = ''; }
              line += w + ' ';
            }
            if (y > -12 && y < 160) ctx.fillText(line, 8, y); y += 16;
          }
        }
        for (let y = 0; y < 160; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, y, 256, 1); }
        tex.needsUpdate = true;
      },
      setUsed() { this.used = true; this.sm.emissiveIntensity = 0.5; this.gl.material.opacity = 0.1; this.draw(0); },
    };
    tm.draw(0);
    this.terminals.push(tm);
  }

  buildGenerator(s) {
    const g = new THREE.Group(); g.position.set(s.fx, 0, s.fz); g.rotation.y = Math.atan2(-DX[s.dir], -DY[s.dir]); this.hold(s.room, g);
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const fm = this.plate('#6e767e', 0.55, 0.8);
    mk(boxGeo(0.16, 2.3, 0.2, 0.5), fm, -0.9, 1.2, 0.1); mk(boxGeo(0.16, 2.3, 0.2, 0.5), fm, 0.9, 1.2, 0.1);
    mk(boxGeo(1.96, 0.16, 0.2, 0.5), fm, 0, 2.32, 0.1); mk(boxGeo(1.96, 0.16, 0.2, 0.5), fm, 0, 0.1, 0.1);
    mk(boxGeo(1.68, 0.1, 0.02, 1), this.mats.hazard, 0, 2.2, 0.205);
    mk(new THREE.BoxGeometry(1.64, 2.1, 0.05), this.plate('#181c22', 0.5, 0.8), 0, 1.2, 0.02);
    mk(new THREE.TorusGeometry(0.56, 0.06, 8, 32), this.plate('#424850', 0.4, 0.9), 0, 1.4, 0.09);
    const dm = new THREE.MeshStandardMaterial({ color: 0x241804, emissive: 0xffffff, emissiveMap: this.dialTex, emissiveIntensity: 1.2, roughness: 0.3, fog: false });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), dm); dial.position.set(0, 1.4, 0.075); g.add(dial);
    const lm = new THREE.MeshStandardMaterial({ map: this.labelTex.ready, emissiveMap: this.labelTex.ready, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.175), lm); label.position.set(0, 0.62, 0.055); g.add(label);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.17), new THREE.MeshStandardMaterial({ map: this.labelTex.gen, emissiveMap: this.labelTex.gen, emissive: 0xffffff, emissiveIntensity: 0.6 }));
    title.position.set(0, 2.05, 0.055); g.add(title);
    mk(new THREE.BoxGeometry(0.1, 0.4, 0.14), this.mats.red, 0.55, 0.62, 0.08);
    const gl = this.sprite(this.glowMat(0xffc020, 0.7), 3.2, 0, 1.4, 0.4, g);
    const nx = -DX[s.dir], nz = -DY[s.dir];
    const ob = {
      type: 'generator', s, g, dm, lm, gl, id: s.id, spent: false, charging: false,
      pos: new V3(s.fx + nx * 1.0, 1.4, s.fz + nz * 1.0),
      wallPos: new V3(s.fx, 1.4, s.fz), nx, nz, ph: this.rng.next() * 6, labelTex: this.labelTex, w: this,
      setSpent() {
        this.spent = true; this.charging = false; this.dm.emissiveIntensity = 0; this.dm.emissiveMap = null;
        this.dm.emissive.set(0x000000); this.dm.needsUpdate = true; this.gl.visible = false;
        this.lm.map = this.lm.emissiveMap = this.labelTex.spent; this.lm.emissiveIntensity = 0.4; this.lm.needsUpdate = true;
      },
      animate(t) {
        if (this.spent) return;
        const k = this.charging ? 1.9 + Math.sin(t * 22) * 0.4 : 0.9 + Math.sin(t * 2.4 + this.ph) * 0.45;
        this.dm.emissiveIntensity = k; this.gl.material.opacity = 0.18 + k * 0.1;
      },
    };
    this.sources.push({ x: s.fx + nx * 1.2, y: 1.6, z: s.fz + nz * 1.2, color: 0xffb020, intensity: 0, base: 3.5, dist: 9, room: s.room, gen: ob });
    this.generators.push(ob);
  }

  // ------------------------------------------------------------ Stormy Helideck & Rescue Helicopter (Prompt 2 Section 6 & Prompt 5 Section 4)
  buildPod(p) {
    const r = this.L.rooms[p.room];
    const g = new THREE.Group();
    g.position.set(p.cx, 0, p.cz);
    g.rotation.y = Math.atan2(-DX[p.dir], -DY[p.dir]);
    this.hold(p.room, g);
    const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

    // Yellow H landing circle on the Helideck center + perimeter green/amber deck lights
    const deckCenter = new THREE.Group();
    deckCenter.position.set((r.x0 + 4) * 2, 0.02, (r.y0 + 4) * 2);
    this.hold(p.room, deckCenter);
    const hRing = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.2, 40), this.mats.safetyYellow);
    hRing.rotation.x = -Math.PI / 2; deckCenter.add(hRing);
    for (const hx of [-1.4, 1.4]) {
      const hBar = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.6), this.mats.safetyYellow);
      hBar.rotation.x = -Math.PI / 2; hBar.position.x = hx; deckCenter.add(hBar);
    }
    const hCross = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), this.mats.safetyYellow);
    hCross.rotation.x = -Math.PI / 2; deckCenter.add(hCross);

    // Perimeter safety net & green/amber helideck lights + surrounding stormy sea plane
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const px = Math.cos(ang) * 7.2, pz = Math.sin(ang) * 7.2;
      const pLight = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), k % 3 === 0 ? this.mats.amber : this.mats.green);
      pLight.position.set(px, 0.1, pz);
      deckCenter.add(pLight);
    }

    // Rescue Helicopter with spinning main & tail rotors, searchlight, open side door, and boarding beacon
    const chopper = new THREE.Group();
    chopper.position.set(0, 0, 1.3);
    g.add(chopper);
    const bodyMat = this.plate('#d85a18', 0.4, 0.65); // Coast Guard orange/white rescue scheme
    const whiteMat = this.mats.medWhite;
    // Skids
    for (const sx of [-1.1, 1.1]) {
      mk(boxGeo(0.12, 0.12, 3.8), this.mats.dark, sx, 0.08, 0, chopper);
      mk(boxGeo(0.1, 0.55, 0.1), this.mats.dark, sx, 0.35, -0.9, chopper);
      mk(boxGeo(0.1, 0.55, 0.1), this.mats.dark, sx, 0.35, 0.9, chopper);
    }
    // Fuselage cabin + open door + nose + tail boom
    mk(boxGeo(2.2, 1.65, 3.6), bodyMat, 0, 1.4, 0, chopper);
    mk(boxGeo(2.24, 0.35, 3.62), whiteMat, 0, 1.55, 0, chopper);
    mk(boxGeo(1.7, 1.1, 1.2), this.mats.glass, 0, 1.45, 2.1, chopper);
    mk(boxGeo(0.55, 0.55, 3.8), bodyMat, 0, 1.65, -3.4, chopper);
    mk(boxGeo(0.14, 1.1, 0.7), whiteMat, 0, 2.1, -5.1, chopper);
    // Open cabin doorway recess (facing player)
    mk(new THREE.BoxGeometry(1.4, 1.25, 0.15), this.mats.dark, 0, 1.35, 1.82, chopper);
    // Main rotor mast & blades
    mk(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 12), this.mats.dark, 0, 2.45, 0, chopper);
    const mainRotor = new THREE.Group(); mainRotor.position.set(0, 2.7, 0); chopper.add(mainRotor);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.04, 0.24), this.mats.dark);
      blade.rotation.y = (b * Math.PI) / 2;
      mainRotor.add(blade);
    }
    const tailRotor = new THREE.Group(); tailRotor.position.set(0.15, 2.15, -5.1); chopper.add(tailRotor);
    for (let b = 0; b < 2; b++) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.14), this.mats.safetyYellow);
      tb.rotation.x = (b * Math.PI) / 2;
      tailRotor.add(tb);
    }
    this.chopperRotors = { main: mainRotor, tail: tailRotor, chopper };

    // Crew figures inside the helicopter cabin (hidden until each crew member is helped!)
    this.helideckCrewMeshes = {};
    const crewColors = { ana: 0xdce8f4, bix: 0x3898d8, chen: 0xe09020, dara: 0x48b878 };
    ['ana', 'bix', 'chen', 'dara'].forEach((cid, idx) => {
      const fig = this.makeHumanFigure(crewColors[cid]);
      fig.position.set(-0.75 + idx * 0.5, 0.62, 0.9);
      fig.visible = false;
      chopper.add(fig);
      this.helideckCrewMeshes[cid] = fig;
    });

    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshStandardMaterial({ map: this.labelTex.pod, emissiveMap: this.labelTex.pod, emissive: 0xffffff, emissiveIntensity: 1.5 }));
    lab.position.set(0, 2.45, 1.85); chopper.add(lab);
    this.sprite(this.glowMat(0x40ff90, 0.65), 4.5, 0, 1.6, 1.2, g);

    const nx = -DX[p.dir], nz = -DY[p.dir];
    this.pod = {
      type: 'pod',
      g,
      chopper,
      pos: new V3(p.cx + nx * 1.1, 1.3, p.cz + nz * 1.1),
      wall: new V3(p.cx, 1.4, p.cz),
    };
    this.sources.push({ x: p.cx + nx * 1.5, y: 2.2, z: p.cz + nz * 1.5, color: 0x80d8ff, intensity: 0, base: 9, dist: 18, room: p.room });

    // Eli's Locket placement spot at the Helideck edge (Prompt 5 Section 4.5)
    if (this.L.locketSpot) {
      const ls = this.L.locketSpot;
      const lg = this.slotGroup(ls, ls.room);
      mk(boxGeo(0.7, 0.95, 0.12), this.mats.safetyYellow, 0, 0.48, 0, lg);
      const locketMesh = mk(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), this.mats.blueGlow, 0, 0.98, 0, lg);
      locketMesh.visible = false;
      this.locketSpotObj = {
        type: 'locket_spot',
        g: lg,
        locketMesh,
        placed: false,
        pos: new V3(ls.cx, 1.0, ls.cz),
      };
    }
  }

  makeHumanFigure(suitHex = 0x3b6e8c) {
    const g = new THREE.Group();
    const suit = this.plate('#' + suitHex.toString(16).padStart(6, '0'), 0.7, 0.2);
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8b49a, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.52, 4, 8), suit); torso.position.y = 0.95; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin); head.position.y = 1.42; g.add(head);
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 3, 6), this.mats.dark);
      leg.position.set(sx, 0.35, 0); g.add(leg);
    }
    return g;
  }

  // ------------------------------------------------------------ Crew Rescues & 16 Story Logs (Prompt 5 Sections 2 & 3)
  buildCrewEncounters() {
    const enc = this.L.crewEncounters;
    // 1. ANA REYES (Medical Bay: pinned under fallen shelving + Stimulant Cabinet)
    if (enc.ana) {
      const a = enc.ana, g = this.slotGroup(a, a.room);
      const fig = this.makeHumanFigure(0xdce8f4);
      fig.rotation.x = -Math.PI / 2; fig.position.set(0, 0.18, 0.1); g.add(fig);
      const shelf = new THREE.Mesh(boxGeo(1.5, 0.35, 0.85, 0.5), this.plate('#5a6672', 0.6, 0.75));
      shelf.position.set(0, 0.42, 0.1); shelf.rotation.z = 0.22; g.add(shelf);
      this.sprite(this.glowMat(0x38d8ff, 0.55), 1.4, 0, 1.1, 0.1, g);
      this.crewObjects.ana = { type: 'crew', id: 'ana', data: a, g, fig, shelf, pos: new V3(a.cx - DX[a.dir] * 0.85, 0.9, a.cz - DY[a.dir] * 0.85) };

      if (a.stimCabinet) {
        const sc = a.stimCabinet, sg = this.slotGroup(sc, sc.room);
        const cab = new THREE.Mesh(boxGeo(0.85, 1.1, 0.38, 0.5), this.mats.medWhite); cab.position.set(0, 1.35, 0); sg.add(cab);
        const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.4), this.mats.red); cross1.position.set(0, 1.35, 0); sg.add(cross1);
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.4), this.mats.red); cross2.position.set(0, 1.35, 0); sg.add(cross2);
        this.stimCabinet = { type: 'stim_cabinet', data: sc, g: sg, taken: false, pos: new V3(sc.cx - DX[sc.dir] * 0.8, 1.3, sc.cz - DY[sc.dir] * 0.8) };
      }
    }

    // 2. BIX OKAFOR (Radio Room: crouched by sparking patch panel)
    if (enc.bix) {
      const b = enc.bix, g = this.slotGroup(b, b.room);
      const fig = this.makeHumanFigure(0x3898d8); fig.position.set(-0.55, 0, 0.1); g.add(fig);
      const rack = new THREE.Mesh(boxGeo(0.95, 1.75, 0.5, 0.5), this.plate('#2c3642', 0.5, 0.8)); rack.position.set(0.15, 0.88, 0); g.add(rack);
      for (const [idx, col] of [[0, this.mats.red], [1, this.mats.green], [2, this.mats.blueGlow]]) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.54), col);
        port.position.set(-0.1 + idx * 0.24, 1.25, 0); g.add(port);
      }
      this.sprite(this.glowMat(0x58e0ff, 0.55), 1.4, 0.15, 1.3, 0.2, g);
      this.crewObjects.bix = { type: 'crew', id: 'bix', data: b, g, fig, pos: new V3(b.cx - DX[b.dir] * 0.85, 1.1, b.cz - DY[b.dir] * 0.85) };
    }

    // 3. CHEN WEI (Engine Room: trapped behind flooded bulkhead + 3 drain valves + wall chart)
    if (enc.chen) {
      const c = enc.chen, g = this.slotGroup(c, c.room);
      const bh = new THREE.Mesh(boxGeo(1.4, 2.2, 0.22, 0.5), this.plate('#4a5866', 0.5, 0.8)); bh.position.set(0, 1.1, 0); g.add(bh);
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18), this.mats.glass); win.position.set(0, 1.55, 0.12); g.add(win);
      // Wall chart showing the randomized valve sequence (e.g. C -> A -> B)
      const chartTex = makeLabelTexture(`DRAIN ORDER: ${c.valveOrder.join(' -> ')}`, { w: 384, h: 64, bg: '#162028', fg: '#ffe040', border: '#e09a20', font: 'bold 28px Silkscreen, monospace' });
      const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.22), new THREE.MeshStandardMaterial({ map: chartTex, emissiveMap: chartTex, emissive: 0xffffff, emissiveIntensity: 1.2 }));
      chart.position.set(0, 2.05, 0.125); g.add(chart);
      // Flood water plane in the Engine Room that lowers as valves are turned
      const r = this.L.rooms[c.room];
      const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.mats.seaWater);
      water.rotation.x = -Math.PI / 2;
      water.position.set((r.x0 + 4) * 2, 0.38, (r.y0 + 4) * 2);
      this.hold(c.room, water);
      this.crewObjects.chen = { type: 'crew', id: 'chen', data: c, g, water, pos: new V3(c.cx - DX[c.dir] * 0.85, 1.2, c.cz - DY[c.dir] * 0.85) };

      for (const vs of c.valves || []) {
        const vg = this.slotGroup(vs, vs.room);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 10), this.mats.rust); post.position.y = 0.55; vg.add(post);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 18), this.mats.red); wheel.position.set(0, 1.1, 0.12); vg.add(wheel);
        const vTex = makeLabelTexture(`VALVE ${vs.valveId}`, { w: 192, h: 48, bg: '#182028', fg: '#ffd040', border: '#e09a20', font: 'bold 28px Silkscreen, monospace' });
        const vSign = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), new THREE.MeshStandardMaterial({ map: vTex, emissiveMap: vTex, emissive: 0xffffff, emissiveIntensity: 1.2 }));
        vSign.position.set(0, 1.5, 0.08); vg.add(vSign);
        this.valveObjects.push({
          type: 'valve',
          valveId: vs.valveId,
          room: vs.room,
          g: vg,
          wheel,
          turned: false,
          pos: new V3(vs.cx - DX[vs.dir] * 0.8, 1.1, vs.cz - DY[vs.dir] * 0.8),
        });
      }
    }

    // 4. DARA HOLT (Cold Storage: hiding behind insulated chiller door)
    if (enc.dara) {
      const d = enc.dara, g = this.slotGroup(d, d.room);
      const chillerDoor = new THREE.Mesh(boxGeo(1.3, 2.1, 0.24, 0.5), this.plate('#8a9aa8', 0.45, 0.75));
      chillerDoor.position.set(0, 1.05, 0); g.add(chillerDoor);
      const latch = new THREE.Mesh(boxGeo(0.28, 0.08, 0.3), this.mats.safetyYellow); latch.position.set(0.42, 1.1, 0.05); g.add(latch);
      this.sprite(this.glowMat(0x88d8ff, 0.55), 1.4, 0, 1.2, 0.2, g);
      this.crewObjects.dara = { type: 'crew', id: 'dara', data: d, g, chillerDoor, pos: new V3(d.cx - DX[d.dir] * 0.85, 1.1, d.cz - DY[d.dir] * 0.85) };
    }
  }

  buildLogPickup(lg) {
    const g = this.slotGroup(lg, lg.room);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.46), this.plate('#24303c', 0.5, 0.7));
    pad.position.set(0, 0.88, 0); g.add(pad);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), this.mats.blueGlow);
    screen.rotation.x = -Math.PI / 2; screen.position.set(0, 0.905, 0); g.add(screen);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.86, 8), this.mats.dark);
    ped.position.set(0, 0.43, 0); g.add(ped);
    const gl = this.sprite(this.glowMat(0x38b8ff, 0.65), 0.9, 0, 1.05, 0, g);
    this.logPickups.push({
      type: 'log',
      logId: lg.logId,
      title: lg.title,
      author: lg.author,
      text: lg.text,
      clue: lg.clue || null,
      room: lg.room,
      g,
      gl,
      collected: false,
      pos: new V3(lg.cx, 0.95, lg.cz),
    });
  }

  // ------------------------------------------------------------ Props (All 15 Oil Rig Room Types)
  buildProp(s) {
    const id = s.room, rng = new RNG(s.seed), base = M(s.cx, 0, s.cz, 0, Math.atan2(-DX[s.dir], -DY[s.dir]), 0);
    const loc = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => base.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz));
    const P = (hex, geo, m, rough, metal) => this.addPlate(id, hex, geo, m, rough, metal);
    const f = s.kind2;

    if (f === 'crate' || f === 'broken_crate' || f === 'tarp_stack' || f === 'frozen_boxes' || f === 'tipped_boxes') {
      const sz = 0.85 + rng.next() * 0.2;
      this.inst[id].crate.push(base.clone().multiply(M(0, sz / 2, 0, 0, (rng.next() - 0.5) * 0.2, 0, sz, sz, sz)));
      if (rng.chance(0.5)) this.inst[id].crate.push(base.clone().multiply(M(0, sz + 0.28, 0, 0, rng.next(), 0, 0.55, 0.55, 0.55)));
    } else if (f === 'barrel' || f === 'gas_bottles' || f === 'dive_tank') {
      this.inst[id].barrel.push(base.clone().multiply(M(0, 0.45, 0)));
      if (rng.chance(0.5)) this.inst[id].barrel.push(base.clone().multiply(M(0.68 * (rng.chance(0.5) ? 1 : -1), 0.45, 0.15)));
    } else if (f === 'bunk_stack' || f === 'bunk_single') {
      const tiers = f === 'bunk_stack' ? [0.42, 1.32] : [0.48];
      for (const x of [-0.82, 0.82]) for (const z of [-0.38, 0.38]) P('#3a4654', new THREE.BoxGeometry(0.06, f === 'bunk_stack' ? 1.85 : 0.95, 0.06), loc(x, f === 'bunk_stack' ? 0.92 : 0.48, z));
      for (const y of tiers) {
        P('#4c5a68', boxGeo(1.72, 0.12, 0.82, 0.5), loc(0, y, 0));
        P('#2b4a62', boxGeo(1.58, 0.09, 0.74, 0.5), loc(0, y + 0.08, 0), 0.85, 0.1);
        P('#dce4ec', boxGeo(0.36, 0.08, 0.55, 0.5), loc(-0.56, y + 0.15, 0), 0.8, 0.1);
      }
    } else if (f === 'personal_locker' || f === 'filing_cabinet' || f === 'switch_cabinet' || f === 'control_cabinet') {
      const col = f === 'switch_cabinet' ? '#384654' : '#4e5c6a';
      P(col, boxGeo(1.05, 1.85, 0.52, 0.5), loc(0, 0.925, 0));
      this.add(id, 'hazard', boxGeo(1.06, 0.1, 0.54, 1), loc(0, 1.45, 0));
    } else if (f === 'mess_table' || f === 'round_table' || f === 'map_table' || f === 'lab_bench' || f === 'office_desk' || f === 'headset_desk' || f === 'transceiver_desk' || f === 'treatment_table') {
      P('#6a7684', boxGeo(1.65, 0.07, 0.85, 0.5), loc(0, 0.82, 0));
      for (const x of [-0.74, 0.74]) for (const z of [-0.35, 0.35]) P('#38424c', new THREE.BoxGeometry(0.06, 0.82, 0.06), loc(x, 0.41, z));
      if (f === 'lab_bench' || f === 'headset_desk' || f === 'transceiver_desk') {
        this.add(id, 'screenDead', new THREE.BoxGeometry(0.45, 0.32, 0.18), loc(0, 1.04, -0.15));
      }
    } else if (f === 'serving_counter' || f === 'galley_stove' || f === 'fume_hood' || f === 'welding_bay' || f === 'lathe_machine') {
      P('#7a8694', boxGeo(1.75, 0.92, 0.72, 0.5), loc(0, 0.46, 0), 0.35, 0.85);
      this.add(id, 'hazard', boxGeo(1.76, 0.08, 0.74, 1), loc(0, 0.88, 0));
    } else if (f === 'vending_machine' || f === 'fridge_door' || f === 'shower_stall' || f === 'shower_line' || f === 'drying_rack') {
      P('#526474', boxGeo(1.0, 1.9, 0.65, 0.5), loc(0, 0.95, 0));
      if (f === 'vending_machine') this.add(id, 'blueGlow', new THREE.PlaneGeometry(0.68, 1.1), loc(0, 1.15, 0.33));
    } else if (f === 'med_bed' || f === 'stretcher') {
      P('#dce4ec', boxGeo(1.75, 0.14, 0.82, 0.5), loc(0, 0.68, 0), 0.6, 0.2);
      for (const x of [-0.78, 0.78]) for (const z of [-0.36, 0.36]) P('#6a7886', new THREE.BoxGeometry(0.05, 0.68, 0.05), loc(x, 0.34, z));
    } else if (f === 'med_cabinet' || f === 'defibrillator' || f === 'iv_stand') {
      P('#dce4ec', boxGeo(0.85, 0.9, 0.32, 0.5), loc(0, 1.25, 0));
      this.add(id, 'red', new THREE.BoxGeometry(0.24, 0.08, 0.34), loc(0, 1.25, 0));
    } else if (f === 'console_bank' || f === 'console_horseshoe' || f === 'cctv_wall' || f === 'radio_rack' || f === 'launch_panel' || f === 'console') {
      P('#384452', boxGeo(1.6, 0.95, 0.68, 0.5), loc(0, 0.475, 0));
      this.add(id, 'screenDead', new THREE.PlaneGeometry(0.52, 0.34), loc(-0.36, 1.32, -0.15, -0.2));
      this.add(id, 'screenDead', new THREE.PlaneGeometry(0.52, 0.34), loc(0.36, 1.32, -0.15, -0.2));
      for (let k = 0; k < 5; k++) this.add(id, k % 2 ? 'green' : 'amber', new THREE.BoxGeometry(0.06, 0.03, 0.06), loc(-0.5 + k * 0.25, 0.98, 0.18));
    } else if (f === 'diesel_generator' || f === 'mud_pump' || f === 'forklift' || f === 'winch_drum' || f === 'deck_crane' || f === 'fire_monitor') {
      P('#d8961c', boxGeo(1.85, 1.35, 0.95, 0.5), loc(0, 0.675, 0));
      this.add(id, 'rust', new THREE.CylinderGeometry(0.38, 0.38, 1.6, 12).rotateZ(Math.PI / 2), loc(0, 1.1, 0));
      this.add(id, 'hazard', boxGeo(1.9, 0.14, 1.0, 1), loc(0, 0.12, 0));
    } else if (f === 'pipe_rack' || f === 'pipe_manifold' || f === 'caged_rack' || f === 'freezer_rack' || f === 'core_tray' || f === 'dive_rack' || f === 'life_jacket_rack' || f === 'shelf') {
      for (const x of [-0.78, 0.78]) for (const z of [-0.24, 0.24]) P('#5a6674', new THREE.BoxGeometry(0.05, 1.9, 0.05), loc(x, 0.95, z));
      for (let k = 0; k < 4; k++) P('#6c7886', boxGeo(1.65, 0.04, 0.54, 0.5), loc(0, 0.25 + k * 0.5, 0));
    } else if (f === 'moon_pool_square' || f === 'moon_pool_round' || f === 'diving_bell' || f === 'gantry_frame') {
      // Moon pool dark moving sea well surrounded by yellow safety curbing
      this.add(id, 'hazard', boxGeo(2.2, 0.28, 2.2, 1), loc(0, 0.14, 0));
      this.add(id, 'seaWater', new THREE.PlaneGeometry(1.9, 1.9), loc(0, 0.29, 0, -Math.PI / 2, 0, 0));
    } else if (f === 'lifeboat_davits') {
      // Enclosed orange offshore lifeboat on steel davits
      this.add(id, 'lifeOrange', boxGeo(2.3, 1.15, 1.1, 0.5), loc(0, 1.15, 0));
      P('#dce4ec', boxGeo(2.32, 0.2, 1.12, 0.5), loc(0, 1.35, 0));
    } else if (f === 'stair_flights') {
      for (let st = 0; st < 5; st++) {
        P('#546270', boxGeo(1.4, 0.12, 0.28, 0.5), loc(0, 0.18 + st * 0.18, -0.4 + st * 0.22));
      }
      this.add(id, 'safetyYellow', boxGeo(0.05, 1.1, 1.2), loc(-0.68, 0.75, 0));
      this.add(id, 'safetyYellow', boxGeo(0.05, 1.1, 1.2), loc(0.68, 0.75, 0));
    } else if (f === 'bench') {
      P('#7a8694', boxGeo(1.6, 0.07, 0.75, 0.5), loc(0, 0.85, 0));
      for (const x of [-0.72, 0.72]) for (const z of [-0.32, 0.32]) P('#46505a', new THREE.BoxGeometry(0.06, 0.85, 0.06), loc(x, 0.425, z));
    } else if (f === 'chair' || f === 'captain_chair' || f === 'tipped_chair') {
      const tilt = f === 'tipped_chair' || rng.chance(0.25);
      const b2 = loc(0, tilt ? 0.25 : 0, 0.1, tilt ? -1.35 : 0, rng.next() * 6, 0);
      P('#424c58', boxGeo(0.46, 0.06, 0.46, 0.5), b2.clone().multiply(M(0, 0.46, 0)));
      P('#424c58', boxGeo(0.46, 0.5, 0.05, 0.5), b2.clone().multiply(M(0, 0.75, -0.22)));
    } else if (f === 'tank') {
      P('#526474', new THREE.CylinderGeometry(0.42, 0.42, 1.7, 14), loc(0, 0.85, 0), 0.5, 0.8);
      this.add(id, 'hazard', new THREE.CylinderGeometry(0.425, 0.425, 0.2, 14), loc(0, 0.7, 0));
    } else if (f === 'life_ring') {
      this.add(id, 'lifeOrange', new THREE.TorusGeometry(0.28, 0.065, 8, 18), loc(0, 1.35, 0.06));
    } else if (f === 'warning_cone') {
      this.add(id, 'safetyYellow', new THREE.ConeGeometry(0.18, 0.48, 10), loc(0, 0.24, 0));
    } else {
      // Small ambient props (papers, mugs, tool_box, boots, clipboard, etc.)
      P('#5c6874', boxGeo(0.32, 0.12, 0.24, 0.5), loc(0, 0.06, 0, 0, rng.next() * 6, 0));
    }
  }

  // ------------------------------------------------------------ decals & signs
  buildDecals() {
    const rng = new RNG(hashSeed('decal' + this.L.seed)), L = this.L, T = this.tex.decals;
    const wallDecal = (room, q, idx, w, h, y, off = 0) => {
      const cx = (q.tx + 0.5) * 2 + DX[q.d] * 0.98 + (-DY[q.d]) * off;
      const cz = (q.ty + 0.5) * 2 + DY[q.d] * 0.98 + DX[q.d] * off;
      const th = Math.atan2(-DX[q.d], -DY[q.d]);
      this.add(room, 'decal', setUV(new THREE.PlaneGeometry(w, h), T.uv(idx)), M(cx, y, cz, 0, th, rng.range(-0.08, 0.08)));
    };
    const floorDecal = (room, tx, ty, idx, w, rot) => {
      this.add(room, 'decal', setUV(new THREE.PlaneGeometry(w, w), T.uv(idx)), M((tx + rng.range(0.2, 0.8)) * 2, 0.012 + rng.next() * 0.003, (ty + rng.range(0.2, 0.8)) * 2, -Math.PI / 2, 0, rot));
    };
    for (const r of L.rooms) {
      if (r.roomType === 'helideck') continue;
      const faces = this.faces[r.id]; if (!faces || !faces.length) continue;
      const nearDoor = faces.filter((f) => r.links.some((l) => Math.abs(l.tx - f.tx) + Math.abs(l.ty - f.ty) <= 4));
      const n = r.kind === 'start' ? 2 : rng.int(4, 7);
      for (let k = 0; k < n; k++) {
        const q = rng.pick(faces), roll = rng.next();
        if (roll < 0.18) wallDecal(r.id, q, DECAL.stain, 1.5, 1.7, 1.4);
        else if (roll < 0.32) wallDecal(r.id, q, DECAL.hand, 0.45, 0.45, rng.range(1.0, 1.7), rng.range(-0.5, 0.5));
        else if (roll < 0.45) wallDecal(r.id, rng.pick(nearDoor.length ? nearDoor : faces), DECAL.claw, 1.1, 1.4, rng.range(0.9, 1.5), rng.range(-0.5, 0.5));
        else if (roll < 0.65) wallDecal(r.id, q, rng.pick([DECAL.warn, DECAL.silence, DECAL.exit, DECAL.bio]), 0.6, 0.6, rng.range(1.4, 1.8), rng.range(-0.4, 0.4));
        else if (roll < 0.78) wallDecal(r.id, q, DECAL.poster, 0.6, 0.9, 1.5);
        else wallDecal(r.id, q, DECAL.note0 + rng.int(0, 2), 0.35, 0.35, rng.range(1.1, 1.6), rng.range(-0.5, 0.5));
      }
      for (let k = 0; k < (r.kind === 'start' ? 2 : 5); k++) {
        const q = rng.pick(faces), tx = q.tx, ty = q.ty, roll = rng.next();
        floorDecal(r.id, tx, ty, roll < 0.55 ? DECAL.puddle : roll < 0.8 ? DECAL.pool : DECAL.scorch, rng.range(1.1, 1.9), rng.next() * 6.28);
      }
    }
  }

  // ------------------------------------------------------------ runtime & room culling (Bug A Item 2 Fix)
  roomAtPos(x, z) {
    const L = this.L;
    const tx = Math.floor(x / 2), ty = Math.floor(z / 2);
    if (tx < 0 || ty < 0 || tx >= L.W || ty >= L.H) return -1;
    if (L.roomGrid) {
      const rid = L.roomGrid[ty * L.W + tx];
      if (rid >= 0) return rid;
    }
    const d = L.links.find((l) => l.tx === tx && l.ty === ty);
    if (d) return d.a;
    const i = (tx - 1) % GRID.STEP, j = (ty - 1) % GRID.STEP;
    if (tx < 1 || ty < 1 || i >= GRID.N || j >= GRID.N) return -1;
    const rx = Math.floor((tx - 1) / GRID.STEP), ry = Math.floor((ty - 1) / GRID.STEP);
    return L.rooms.find((q) => q.rx === rx && q.ry === ry)?.id ?? -1;
  }

  // Prompt 1 Bug A Item 2:
  // Always render the room the player is in, every room that shares a doorway with it,
  // and any room up to 2 portals deep. Visibility NEVER depends on whether a door is open, locked, or used by the monster.
  updateVisibility(px, pz, extraRoom = -1) {
    const L = this.L;
    const tx = Math.floor(px / 2), tz = Math.floor(pz / 2);
    const doorLink = L.links.find((l) => l.tx === tx && l.ty === tz);
    let pr = this.roomAtPos(px, pz);
    if (pr < 0) pr = extraRoom;
    this.playerRoom = pr;
    const maxHops = Math.max(2, (this.q.rooms || 2) + 1);
    for (const r of L.rooms) {
      let hops = pr < 0 ? 0 : L.dist[pr][r.id];
      if (doorLink) hops = Math.min(L.dist[doorLink.a][r.id], L.dist[doorLink.b][r.id]);
      const dx = Math.max(r.aabb.min.x - px, 0, px - r.aabb.max.x);
      const dz = Math.max(r.aabb.min.z - pz, 0, pz - r.aabb.max.z);
      const vis = hops <= 1 || (hops <= maxHops && Math.hypot(dx, dz) < 68);
      this.roomGroups[r.id].visible = vis;
      if (vis) this.visible.add(r.id);
      else this.visible.delete(r.id);
      if (this.debugGroup.visible && this.debugRoomBoxes?.has(r.id)) {
        this.debugRoomBoxes.get(r.id).material.color.setHex(vis ? 0x25ff60 : 0x285080);
      }
    }
    for (const d of this.doors) {
      d.g.visible = this.visible.has(d.link.a) || this.visible.has(d.link.b);
    }
  }

  updateDoorLights(hasKey) {
    for (const d of this.doors) d.setState(!d.lock || hasKey(d.lock));
  }

  update(dt, t, frame) {
    for (const d of this.doors) {
      if (d.g.visible || d.physical === 'opening' || d.physical === 'closing' || d.autoCloseTimer > 0) d.update(dt);
      if (d.beaconMesh) d.beaconMesh.rotation.y += dt * 4.5;
    }
    for (const l of this.lockers) if (this.visible.has(l.s.room) || l.t > 0) l.update(dt);
    // Supply chest green LED blink
    const blink = Math.sin(t * 4.2) > -0.2 ? 3.4 : 0.4;
    this.mats.pink.emissiveIntensity = blink * (1 + (frame.nearLocker ? 0.4 : 0));
    this.mats.emerg.emissiveIntensity = 2.6 + Math.sin(t * 1.4) * 0.5;
    this.mats.red.emissiveIntensity = 2.4 + Math.sin(t * 5) * 0.8;

    // Helicopter rotor spin on Helideck
    if (this.chopperRotors) {
      this.chopperRotors.main.rotation.y += dt * 22;
      this.chopperRotors.tail.rotation.x += dt * 28;
    }

    // Lightning flash through storm windows & Helideck (Prompt 2 Section 1.6)
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = CFG.fx.lightningInterval[0] + Math.random() * (CFG.fx.lightningInterval[1] - CFG.fx.lightningInterval[0]);
      this.lightningFlash = 1.0;
      const distMeters = 120 + Math.random() * 1400;
      this.hooks.onLightning?.(t, distMeters);
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.8);
      for (const sw of this.seaWindows) {
        sw.mat.emissiveIntensity = 0.85 + this.lightningFlash * 4.5;
      }
    }

    for (const g of this.generators) if (this.visible.has(g.s.room)) g.animate(t);
    for (const f of this.flickerMats) {
      const n = Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2) + Math.sin(t * 31 + f.ph);
      f.k = n > 0.9 ? 0 : n > 0.2 ? 1 : 0.35 + 0.2 * Math.sin(t * 50);
      f.mat.emissiveIntensity = f.k * 1.4;
      if (Math.sin(t * 0.37 + f.ph) > 0.8) { f.k = 0; f.mat.emissiveIntensity = 0; }
    }
    for (const tm of this.terminals) {
      if (this.visible.has(tm.s.room) && frame.px !== undefined && Math.hypot(tm.pos.x - frame.px, tm.pos.z - frame.pz) < 12 && t - tm.lastDraw > 0.07) {
        tm.lastDraw = t;
        if (!tm.used) tm.draw(t);
      }
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.root.parent?.remove(this.root);
  }
}
