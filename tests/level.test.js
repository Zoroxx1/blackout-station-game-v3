// Automated level tests: node tests/level.test.js [count]
import { generateLevel, validateLevel, flood, GRID, T_FLOOR, T_DOOR, DX, DY } from '../src/game/levelgen.js';
import LC from '../src/game/level.config.js';

const COUNT = Number(process.argv[2] || 1000);
let fails = 0; const log = (m) => { fails++; if (fails < 25) console.log('FAIL', m); };
let attempts = 0, hatches = 0, extras = 0, t0 = Date.now();
const N = GRID.N, STEP = GRID.STEP;

for (let s = 1; s <= COUNT; s++) {
  let L; try { L = generateLevel('T' + s); } catch (e) { log('seed ' + s + ' ' + e.message); continue; }
  const tag = 'seed T' + s + ': '; attempts += L.attempts;
  const v = validateLevel(L); if (!v.ok) log(tag + v.errors.join(','));
  if (L.rooms.length !== 28) log(tag + 'rooms');
  if (L.W !== 64 || L.H !== 37) log(tag + 'dimensions ' + L.W + 'x' + L.H);
  const W = L.W, T = (x, y) => L.tiles[y * W + x];
  // spanning tree + loops
  const reachN = new Set([0]); const q = [0]; for (let i = 0; i < q.length; i++) for (const n of L.adj[q[i]]) if (!reachN.has(n)) { reachN.add(n); q.push(n); }
  if (reachN.size !== 28) log(tag + 'graph not connected');
  if (L.links.length <= 27) log(tag + 'no loops');
  extras += L.links.filter((l) => l.extra).length; hatches += L.links.filter((l) => l.kind === 'hatch').length;
  // cross path clear + door at wall center
  for (const r of L.rooms) {
    for (const c of LC.crossTiles) for (let k = 0; k < N; k++) {
      if (T(r.x0 + k, r.y0 + c) !== T_FLOOR || T(r.x0 + c, r.y0 + k) !== T_FLOOR) log(tag + 'cross blocked room ' + r.id);
    }
    for (const b of r.blocks) if (b.w > 2 || b.h > 2) log(tag + 'block size');
    if (r.blocks.length > LC.obstaclesMax) log(tag + 'too many blocks');
    r.insets.forEach((x) => { if (x < 0 || x > 2) log(tag + 'inset'); });
  }
  for (const l of L.links) {
    if (T(l.tx, l.ty) !== T_DOOR) log(tag + 'door tile');
    if (l.axis === 'x' ? (l.ty - 1) % STEP !== LC.doorIndex : (l.tx - 1) % STEP !== LC.doorIndex) log(tag + 'door not centered');
  }
  // start room clear
  const sr = L.rooms[L.startRoom];
  if (sr.blocks.length) log(tag + 'start room has blocks');
  // start in corner
  const corner = (sr.rx === 0 || sr.rx === 6) && (sr.ry === 0 || sr.ry === 3); if (!corner) log(tag + 'start not corner');
  // pod: dead end, all blue; farthest dead end
  const pr = L.rooms[L.podRoom]; if (pr.links.length !== 1 || pr.links.some((l) => l.lock !== 'blue')) log(tag + 'pod links');
  const dS = L.dist[L.startRoom];
  const leaves = L.rooms.filter((r) => r.id !== L.startRoom && r.links.length === 1);
  if (leaves.some((r) => dS[r.id] > dS[L.podRoom])) log(tag + 'pod not farthest dead end');
  const rr = L.rooms[L.redRoom];
  if (rr.links.length !== 1 || rr.links[0].lock !== 'red') log(tag + 'red links');
  if (dS[L.redRoom] < 2.5 || L.dist[L.podRoom][L.redRoom] < 2.5) log(tag + 'red room distance');
  if (L.links.filter((l) => l.lock === 'red').length !== 1) log(tag + 'extra red doors');
  // terminals
  const tr = L.terminals; if (tr.length !== 3) log(tag + 'terminals');
  for (let i = 0; i < 3; i++) {
    if (dS[tr[i].room] < 2) log(tag + 'terminal near start');
    for (let j = i + 1; j < 3; j++) if (L.dist[tr[i].room][tr[j].room] < 3) log(tag + 'terminals close');
  }
  if (tr.find((t) => t.id === 'chen').room !== L.redRoom) log(tag + 'chen room');
  // key lockers
  const kr = L.lockers.find((l) => l.content === 'red'), kb = L.lockers.find((l) => l.content === 'blue');
  for (const k of [kr, kb]) for (const t of tr) if (L.dist[k.room][t.room] < 3) log(tag + 'key locker near terminal');
  if (L.dist[kr.room][kb.room] < 3) log(tag + 'key lockers close');
  // lockers on walls, not on cross
  for (const l of L.lockers) {
    const r = L.rooms[l.room]; const i = l.tx - r.x0, j = l.ty - r.y0;
    if (LC.crossTiles.includes(i) || LC.crossTiles.includes(j)) log(tag + 'locker on cross');
    if (T(l.tx + DX[l.dir], l.ty + DY[l.dir]) === T_FLOOR) log(tag + 'locker not against solid');
  }
  // generators in walls
  if (L.generators.length < 1 || L.generators.length > 2) log(tag + 'gens');
  for (const g of L.generators) if (T(g.tx + DX[g.dir], g.ty + DY[g.dir]) !== 1) log(tag + 'generator not in wall');
  // monster start
  const md = dS[L.monsterStart.room]; if (md < 2 || md > 3.5) log(tag + 'monster start dist ' + md);
  // flood checks with all combos
  const f0 = flood(L, ['red', 'blue']); if (!f0[kr.ty * W + kr.tx]) log(tag + 'flood');
  // determinism
  if (s % 100 === 0) { const L2 = generateLevel('T' + s); if (Buffer.compare(Buffer.from(L.tiles), Buffer.from(L2.tiles)) !== 0) log(tag + 'not deterministic'); }
}
console.log(`levels: ${COUNT}  failures: ${fails}  avg attempts: ${(attempts / COUNT).toFixed(2)}  avg extra links: ${(extras / COUNT).toFixed(1)}  hatch share: ${(hatches / extras * 100).toFixed(0)}%  time ${(Date.now() - t0)}ms`);
process.exit(fails ? 1 : 0);
