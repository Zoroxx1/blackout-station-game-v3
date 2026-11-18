// Seeded level generator: 7x4 rooms, spanning tree + loops, keycards, terminals, generators, pod.
// Tile types: 0 floor, 1 wall, 2 block (obstacle), 3 door cell (in a shared wall).
import LC from './level.config.js';
import { RNG, hashSeed } from './rng.js';

export const T_FLOOR = 0, T_WALL = 1, T_BLOCK = 2, T_DOOR = 3;
export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
export const DIR_YAW = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];
const N = LC.interior, STEP = N + 1, GW = LC.grid.w, GH = LC.grid.h, NR = GW * GH;
export const GRID = { N, STEP, GW, GH, NR, W: GW * STEP + 1, H: GH * STEP + 1 };

// Footprints (meters) for floor-standing things: w = lateral width, d = depth from wall.
export const FOOT = {
  locker: { w: 1.0, d: 0.7 }, terminal: { w: 1.2, d: 0.85 }, crate: { w: 1.1, d: 1.1 }, barrel: { w: 0.75, d: 0.75 },
  shelf: { w: 1.7, d: 0.55 }, bench: { w: 1.7, d: 0.85 }, chair: { w: 0.55, d: 0.55 }, console: { w: 1.5, d: 0.85 },
  tank: { w: 0.95, d: 0.95 }, debris: { w: 0.9, d: 0.7, soft: true }, broken: { w: 1.2, d: 0.35 }, scanner: { w: 0.4, d: 0.3, soft: true },
};
const PROP_KINDS = ['crate', 'crate', 'barrel', 'barrel', 'shelf', 'bench', 'chair', 'console', 'tank', 'debris', 'broken', 'scanner'];

function bfs(adj, src) {
  const d = new Array(adj.length).fill(Infinity); d[src] = 0; const q = [src];
  for (let i = 0; i < q.length; i++) for (const n of adj[q[i]]) if (d[n] === Infinity) { d[n] = d[q[i]] + 1; q.push(n); }
  return d;
}

function tryBuild(rng, seedLabel) {
  // ---- 1. graph ----
  const edges = [];
  for (let ry = 0; ry < GH; ry++) for (let rx = 0; rx < GW; rx++) {
    const id = ry * GW + rx;
    if (rx < GW - 1) edges.push([id, id + 1]);
    if (ry < GH - 1) edges.push([id, id + GW]);
  }
  rng.shuffle(edges);
  const par = Array.from({ length: NR }, (_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const tree = [], rest = [];
  for (const e of edges) { const a = find(e[0]), b = find(e[1]); if (a !== b) { par[a] = b; tree.push(e); } else rest.push(e); }
  rng.shuffle(rest);
  const nExtra = Math.min(rest.length, Math.round(LC.extraLinkFractionOfTree * (NR - 1)));
  const links = tree.map(([a, b]) => ({ a, b, kind: 'door', lock: null, extra: false }));
  for (let i = 0; i < nExtra; i++) links.push({ a: rest[i][0], b: rest[i][1], kind: rng.chance(LC.hatchFraction) ? 'hatch' : 'door', lock: null, extra: true });
  const adj = Array.from({ length: NR }, () => []);
  for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }

  // ---- 2. start corner, flips ----
  const flipX = rng.chance(0.5), flipY = rng.chance(0.5);
  const start = rng.pick([0, GW - 1, (GH - 1) * GW, NR - 1]);
  const dist = []; for (let i = 0; i < NR; i++) dist.push(bfs(adj, i));
  const dS = dist[start];

  // ---- 3. pod & red room (dead ends) ----
  const leaves = []; for (let i = 0; i < NR; i++) if (i !== start && adj[i].length === 1) leaves.push(i);
  if (leaves.length < 2) return null;
  const maxD = Math.max(...leaves.map((l) => dS[l]));
  const pod = rng.pick(leaves.filter((l) => dS[l] === maxD));
  const redC = leaves.filter((l) => l !== pod && dS[l] >= LC.minDeadEndFromStartRooms && dist[pod][l] >= LC.minDeadEndFromStartRooms);
  if (!redC.length) return null;
  const red = rng.pick(redC);
  for (const l of links) { if (l.a === pod || l.b === pod) l.lock = 'blue'; else if (l.a === red || l.b === red) l.lock = 'red'; }

  // ---- 4. terminals ----
  const normal = []; for (let i = 0; i < NR; i++) if (i !== start && i !== pod && i !== red) normal.push(i);
  let ana = -1, bix = -1;
  for (let t = 0; t < 60 && ana < 0; t++) {
    const a = rng.pick(normal), b = rng.pick(normal);
    if (a === b) continue;
    const ok = [a, b].every((x) => dS[x] >= LC.terminalMinFromStart && dist[x][red] >= LC.terminalMinApart) && dist[a][b] >= LC.terminalMinApart;
    if (ok) { ana = a; bix = b; }
  }
  if (ana < 0) return null;
  const termRooms = [ana, bix, red];
  // ---- 5. keycard lockers ----
  let redKeyRoom = -1, blueKeyRoom = -1;
  const kc = normal.filter((x) => termRooms.every((t) => dist[x][t] >= LC.keyLockerMinApart));
  if (kc.length < 2) return null;
  for (let t = 0; t < 60 && redKeyRoom < 0; t++) {
    const a = rng.pick(kc), b = rng.pick(kc);
    if (a !== b && dist[a][b] >= LC.keyLockerMinApart) { redKeyRoom = a; blueKeyRoom = b; }
  }
  if (redKeyRoom < 0) return null;
  // ---- monster start ----
  const mc = normal.filter((x) => dS[x] >= LC.monsterStartRooms[0] && dS[x] <= LC.monsterStartRooms[1]);
  if (!mc.length) return null;
  const monsterRoom = rng.pick(mc);

  // ---- 6. tiles ----
  const W = GRID.W, H = GRID.H;
  const tiles = new Uint8Array(W * H).fill(T_WALL);
  const posOf = (id) => ({ rx: flipX ? GW - 1 - (id % GW) : id % GW, ry: flipY ? GH - 1 - Math.floor(id / GW) : Math.floor(id / GW) });
  const rooms = [];
  const cross = (i) => LC.crossTiles.includes(i);
  const T = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T_WALL : tiles[y * W + x]);
  for (let id = 0; id < NR; id++) {
    const p = posOf(id);
    const x0 = p.rx * STEP + 1, y0 = p.ry * STEP + 1;
    const ins = id === start ? [0, 0, 0, 0] : [rng.int(0, LC.insetMax), rng.int(0, LC.insetMax), rng.int(0, LC.insetMax), rng.int(0, LC.insetMax)]; // N E S W
    const room = { id, rx: p.rx, ry: p.ry, x0, y0, insets: ins, kind: 'normal', name: '', wet: rng.chance(LC.wetRoomChance), emergency: rng.chance(LC.emergencyRoomChance), flicker: rng.chance(LC.flickerRoomChance), blocks: [], links: [] };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const inset = j < ins[0] || i >= N - ins[1] || j >= N - ins[2] || i < ins[3];
      if (inset && !cross(i) && !cross(j)) continue;
      tiles[(y0 + j) * W + x0 + i] = T_FLOOR;
    }
    if (id !== start) {
      const nb = rng.int(0, LC.obstaclesMax);
      for (let k = 0; k < nb; k++) for (let tr = 0; tr < 12; tr++) {
        const sw = rng.int(1, LC.obstacleMaxSize), sh = rng.int(1, LC.obstacleMaxSize);
        const half = rng.chance(0.5), halfY = rng.chance(0.5);
        const i0 = half ? rng.int(0, 3 - sw) : rng.int(5, 8 - sw);
        const j0 = halfY ? rng.int(0, 3 - sh) : rng.int(5, 8 - sh);
        let ok = true;
        for (let j = j0 - 1; j <= j0 + sh && ok; j++) for (let i = i0 - 1; i <= i0 + sw && ok; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const inside = i >= i0 && i < i0 + sw && j >= j0 && j < j0 + sh;
          const t = T(x0 + i, y0 + j);
          if (inside ? t !== T_FLOOR : t === T_BLOCK) ok = false;
        }
        if (!ok) continue;
        for (let j = j0; j < j0 + sh; j++) for (let i = i0; i < i0 + sw; i++) tiles[(y0 + j) * W + x0 + i] = T_BLOCK;
        room.blocks.push({ tx: x0 + i0, ty: y0 + j0, w: sw, h: sh });
        break;
      }
    }
    rooms.push(room);
  }
  // doors
  for (const l of links) {
    const pa = rooms[l.a], pb = rooms[l.b];
    if (pa.ry === pb.ry) { l.axis = 'x'; l.tx = Math.max(pa.rx, pb.rx) * STEP; l.ty = pa.ry * STEP + 1 + LC.doorIndex; }
    else { l.axis = 'z'; l.ty = Math.max(pa.ry, pb.ry) * STEP; l.tx = pa.rx * STEP + 1 + LC.doorIndex; }
    tiles[l.ty * W + l.tx] = T_DOOR;
    l.id = rooms[l.a].links.length + '-' + l.a + '-' + l.b;
    rooms[l.a].links.push(l); rooms[l.b].links.push(l);
    // side wall panels beside door cell must be walls (they are)
  }
  rooms[start].kind = 'start'; rooms[pod].kind = 'pod'; rooms[red].kind = 'red';
  rooms[pod].name = 'Pod Bay'; rooms[red].name = 'Reactor'; rooms[ana].name = 'Medbay'; rooms[bix].name = 'Comms';
  for (const r of rooms) if (!r.name) r.name = rng.pick(LC.fillerNames);
  rooms[ana].kind = 'ana'; rooms[bix].kind = 'bix';

  // ---- 7. slots ----
  const used = new Set();
  const doorAdj = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (T(x + i, y + j) === T_DOOR) return true; return false; };
  const slotsOf = (r) => {
    const floor = [], wall = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = r.x0 + i, y = r.y0 + j;
      if (T(x, y) !== T_FLOOR || doorAdj(x, y)) continue;
      const onCross = cross(i) || cross(j);
      for (let d = 0; d < 4; d++) {
        const nt = T(x + DX[d], y + DY[d]);
        if (nt === T_WALL) { wall.push({ tx: x, ty: y, dir: d, cross: onCross, kind: 'wall' }); if (!onCross) floor.push({ tx: x, ty: y, dir: d, kind: 'wall' }); }
        else if (nt === T_BLOCK && !onCross) floor.push({ tx: x, ty: y, dir: d, kind: 'block' });
      }
    }
    return { floor, wall };
  };
  const slotCache = rooms.map(slotsOf);
  const take = (roomId, list, filter) => {
    const c = slotCache[roomId][list].filter((s) => !used.has(s.ty * W + s.tx) && (!filter || filter(s)));
    if (!c.length) return null;
    const s = rng.pick(c); used.add(s.ty * W + s.tx);
    return { ...s };
  };
  const colliders = [], blocked = new Set();
  const placeRect = (s, kindName) => {
    const f = FOOT[kindName], c = { x: (s.tx + 0.5) * 2, z: (s.ty + 0.5) * 2 };
    const off = 1 - f.d / 2 - 0.04;
    const cx = c.x + DX[s.dir] * off, cz = c.z + DY[s.dir] * off;
    const alongX = s.dir === 0 || s.dir === 2;
    const hx = alongX ? f.d / 2 : f.w / 2, hz = alongX ? f.w / 2 : f.d / 2;
    s.cx = cx; s.cz = cz; s.hx = hx; s.hz = hz;
    if (!f.soft) { colliders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, kind: kindName }); blocked.add(s.ty * W + s.tx); }
    return s;
  };

  const terminals = [];
  const tspec = [['ana', ana], ['bix', bix], ['chen', red]];
  for (const [id, rid] of tspec) {
    const s = take(rid, 'floor', (q) => q.kind === 'wall'); if (!s) return null;
    s.id = id; s.room = rid; placeRect(s, 'terminal'); terminals.push(s);
  }
  const lockers = [];
  const addLocker = (rid, content, pref) => {
    const s = take(rid, 'floor', pref ? (q) => q.kind === 'wall' : null); if (!s) return false;
    s.room = rid; s.content = content; s.opened = false; s.id = lockers.length; placeRect(s, 'locker'); lockers.push(s); return true;
  };
  if (!addLocker(redKeyRoom, 'red', true) || !addLocker(blueKeyRoom, 'blue', true)) return null;
  const nDecoy = rng.int(LC.decoyLockers[0], LC.decoyLockers[1]);
  const perRoom = new Array(NR).fill(0);
  for (let k = 0, guard = 0; k < nDecoy && guard < 200; guard++) {
    const rid = rng.pick(normal); if (perRoom[rid] >= 2) continue;
    if (addLocker(rid, 'decoy', true)) { perRoom[rid]++; k++; }
    if (guard === 199) return null;
  }
  if (lockers.length < 2 + LC.decoyLockers[0]) return null;
  // generators (built into walls)
  const generators = [];
  const nGen = rng.int(LC.generators[0], LC.generators[1]);
  const genRooms = rng.shuffle(normal.concat([pod]).filter((x) => x !== start)).slice(0, nGen);
  for (const rid of genRooms) {
    const s = take(rid, 'wall', (q) => q.kind === 'wall'); if (!s) return null;
    s.room = rid; s.id = generators.length; s.spent = false;
    s.fx = (s.tx + 0.5) * 2 + DX[s.dir]; s.fz = (s.ty + 0.5) * 2 + DY[s.dir]; // wall-face point
    generators.push(s);
  }
  if (!generators.length) return null;
  // pod (wall mounted, two tiles wide, opposite the only door)
  const pr = rooms[pod], pl = pr.links[0];
  const side = pl.tx < pr.x0 ? 2 : pl.tx > pr.x0 + N - 1 ? 0 : pl.ty < pr.y0 ? 3 : 1;
  const pd = (side + 2) % 4;
  const ci = LC.crossTiles;
  let pa, pb;
  if (pd === 0 || pd === 2) { const i = pd === 0 ? N - 1 : 0; pa = [pr.x0 + i, pr.y0 + ci[0]]; pb = [pr.x0 + i, pr.y0 + ci[1]]; }
  else { const j = pd === 1 ? N - 1 : 0; pa = [pr.x0 + ci[0], pr.y0 + j]; pb = [pr.x0 + ci[1], pr.y0 + j]; }
  used.add(pa[1] * W + pa[0]); used.add(pb[1] * W + pb[0]);
  const podObj = {
    room: pod, dir: pd, tx: pa[0], ty: pa[1],
    cx: ((pa[0] + 0.5) * 2 + (pb[0] + 0.5) * 2) / 2 + DX[pd], cz: ((pa[1] + 0.5) * 2 + (pb[1] + 0.5) * 2) / 2 + DY[pd],
  };
  // props
  const props = [];
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    const n = rng.int(LC.propsPerRoom[0], LC.propsPerRoom[1]);
    for (let k = 0; k < n; k++) {
      const s = take(r.id, 'floor'); if (!s) break;
      const kind = rng.pick(PROP_KINDS); s.kind2 = kind; s.room = r.id; s.seed = rng.int(0, 1e6);
      placeRect(s, kind); props.push(s);
    }
  }
  // ---- 8. start & monster ----
  const sr = rooms[start];
  const stile = { tx: sr.x0 + 3, ty: sr.y0 + 3 };
  const runLen = (d) => { let n = 0; while (T(stile.tx + DX[d] * (n + 1), stile.ty + DY[d] * (n + 1)) !== T_WALL) n++; return n; };
  const dirs = [0, 1, 2, 3].filter((d) => runLen(d) >= 3);
  const sdir = rng.pick(dirs.length ? dirs : [0, 1, 2, 3]);
  const mr = rooms[monsterRoom];
  const mtile = { tx: mr.x0 + 3, ty: mr.y0 + 3 };

  const nav = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) nav[i] = (tiles[i] === T_FLOOR || tiles[i] === T_DOOR) && !blocked.has(i) ? 1 : 0;

  const lvl = {
    seed: seedLabel, W, H, tiles, nav, rooms, links, dist, adj, flip: { x: flipX, y: flipY },
    startRoom: start, podRoom: pod, redRoom: red, terminalRooms: { ana, bix, chen: red }, keyRooms: { red: redKeyRoom, blue: blueKeyRoom },
    start: { tx: stile.tx, ty: stile.ty, dir: sdir, yaw: DIR_YAW[sdir] },
    monsterStart: { ...mtile, room: monsterRoom },
    terminals, lockers, generators, pod: podObj, props, colliders,
  };
  return lvl;
}

export function roomAt(level, tx, ty) {
  if (tx < 1 || ty < 1 || tx >= GRID.W - 1 || ty >= GRID.H - 1) return -1;
  const i = (tx - 1) % STEP, j = (ty - 1) % STEP;
  if (i >= N || j >= N) return -1;
  const rx = Math.floor((tx - 1) / STEP), ry = Math.floor((ty - 1) / STEP);
  const r = level.rooms.find((q) => q.rx === rx && q.ry === ry);
  return r ? r.id : -1;
}

// Flood fill from start. Locked doors listed in `blockedLocks` are impassable.
export function flood(level, blockedLocks) {
  const { W, H, tiles } = level;
  const doorLock = new Map(); for (const l of level.links) doorLock.set(l.ty * W + l.tx, l.lock);
  const seen = new Uint8Array(W * H); const q = [level.start.ty * W + level.start.tx]; seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[n]) continue;
      const t = tiles[n]; if (t === T_WALL || t === T_BLOCK) continue;
      if (t === T_DOOR && blockedLocks.includes(doorLock.get(n))) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}

export function validateLevel(L) {
  const errs = []; const W = L.W;
  const fill = flood(L, ['red', 'blue']); const fillAll = flood(L, []);
  const reach = (s, f) => f[s.ty * W + s.tx] === 1;
  const kr = L.lockers.find((l) => l.content === 'red'), kb = L.lockers.find((l) => l.content === 'blue');
  if (!kr || !kb) errs.push('missing key lockers');
  else { if (!reach(kr, fill)) errs.push('red key unreachable'); if (!reach(kb, fill)) errs.push('blue key unreachable'); }
  const ana = L.terminals.find((t) => t.id === 'ana'), bix = L.terminals.find((t) => t.id === 'bix'), chen = L.terminals.find((t) => t.id === 'chen');
  if (!reach(ana, fill) || !reach(bix, fill)) errs.push('first two terminals unreachable');
  if (!reach(chen, fillAll)) errs.push('chen unreachable even with keys');
  if (reach(chen, fill)) errs.push('chen reachable without red card');
  if (fill[L.pod.ty * W + L.pod.tx]) errs.push('pod reachable without blue card');
  if (!fillAll[L.pod.ty * W + L.pod.tx]) errs.push('pod unreachable with keys');
  if (L.generators.length < 1 || L.generators.length > 2) errs.push('generator count');
  const nd = L.lockers.filter((l) => l.content === 'decoy').length; if (nd < 6 || nd > 12) errs.push('decoy locker count ' + nd);
  return { ok: errs.length === 0, errors: errs };
}

export function generateLevel(seed) {
  const label = String(seed);
  const base = /^\d+$/.test(label) ? Number(label) >>> 0 : hashSeed(label);
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = new RNG((base + Math.imul(attempt, 0x9E3779B1)) >>> 0);
    const lvl = tryBuild(rng, label);
    if (lvl && validateLevel(lvl).ok) { lvl.attempts = attempt + 1; return lvl; }
  }
  throw new Error('Level generation failed for seed ' + label);
}
