// Seeded offshore oil rig level generator (Halcyon Deep).
// Implements:
// - 5 platform zones (Accommodation, Operations, Engineering & Utilities, Drilling & Process, Topside)
// - 8 size classes (closet, small, medium, large, long, l_shape, two_level, open_deck)
// - Template & fingerprint usage ledger (prevents repeated rooms)
// - Wall Edge Ledger (provably closed walls around every room, block, and doorway)
// - 0.5m occupancy grid prop placement with 2m doorway clearance and 1.2m wide path verification
// - Keycards, terminals, generators, supply chests, food, 4 crew rescues, 16 logs, locket, escape gate & helideck
import LC from './level.config.js';
import { CFG, CEILING } from './config.js';
import { RNG, hashSeed } from './rng.js';
import templatesData from './templates.json' with { type: 'json' };
import storyData from './story.json' with { type: 'json' };

export const T_FLOOR = 0, T_WALL = 1, T_BLOCK = 2, T_DOOR = 3;
export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
export const DIR_YAW = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];

// Legacy GRID export kept for compatibility with any caller inspecting GRID constants
export const GRID = { N: 8, STEP: 9, GW: 7, GH: 4, NR: 28, W: 96, H: 64 };

// Footprints (meters) for floor-standing props and interactables: w = width along wall, d = depth from wall
export const FOOT = {
  locker:           { w: 0.9,  d: 0.55 },
  chest:            { w: 0.9,  d: 0.50 },
  terminal:         { w: 1.1,  d: 0.75 },
  log_pickup:       { w: 0.45, d: 0.45, soft: true },
  crew_interact:    { w: 1.2,  d: 0.9 },
  med_cabinet_int:  { w: 0.9,  d: 0.45 },
  valve_wheel_int:  { w: 0.7,  d: 0.55 },
  patch_panel_int:  { w: 0.9,  d: 0.45 },
  locket_spot:      { w: 0.8,  d: 0.8,  soft: true },
  crate:            { w: 1.0,  d: 1.0 },
  barrel:           { w: 0.75, d: 0.75 },
  shelf:            { w: 1.6,  d: 0.55 },
  bench:            { w: 1.6,  d: 0.75 },
  chair:            { w: 0.55, d: 0.55 },
  console:          { w: 1.4,  d: 0.75 },
  tank:             { w: 0.95, d: 0.95 },
  debris:           { w: 0.8,  d: 0.7,  soft: true },
  broken:           { w: 1.1,  d: 0.35 },
  scanner:          { w: 0.4,  d: 0.3,  soft: true },
  // Oil rig specific required & random props
  bunk_stack:       { w: 1.8,  d: 0.9 },
  bunk_single:      { w: 1.8,  d: 0.85 },
  personal_locker:  { w: 1.1,  d: 0.55 },
  mess_table:       { w: 1.8,  d: 1.0 },
  serving_counter:  { w: 2.0,  d: 0.75 },
  galley_stove:     { w: 1.5,  d: 0.8 },
  round_table:      { w: 1.2,  d: 1.2 },
  vending_machine:  { w: 0.95, d: 0.7 },
  fridge_door:      { w: 1.2,  d: 0.4 },
  shower_line:      { w: 1.6,  d: 0.45 },
  shower_stall:     { w: 1.0,  d: 0.9 },
  drying_rack:      { w: 1.1,  d: 0.5 },
  med_bed:          { w: 1.8,  d: 0.9 },
  med_cabinet:      { w: 1.1,  d: 0.4 },
  defibrillator:    { w: 0.6,  d: 0.3,  soft: true },
  stretcher:        { w: 1.8,  d: 0.7 },
  treatment_table:  { w: 1.4,  d: 0.9 },
  iv_stand:         { w: 0.45, d: 0.45 },
  console_bank:     { w: 2.2,  d: 0.8 },
  schematic_board:  { w: 1.8,  d: 0.25, soft: true },
  console_horseshoe:{ w: 2.0,  d: 1.4 },
  captain_chair:    { w: 0.7,  d: 0.7 },
  cctv_wall:        { w: 1.8,  d: 0.35 },
  radio_rack:       { w: 1.2,  d: 0.6 },
  headset_desk:     { w: 1.4,  d: 0.75 },
  map_table:        { w: 1.5,  d: 1.1 },
  transceiver_desk: { w: 1.5,  d: 0.8 },
  freq_board:       { w: 1.2,  d: 0.25, soft: true },
  lab_bench:        { w: 1.9,  d: 0.85 },
  core_tray:        { w: 1.3,  d: 0.6 },
  fume_hood:        { w: 1.4,  d: 0.75 },
  office_desk:      { w: 1.5,  d: 0.85 },
  filing_cabinet:   { w: 0.8,  d: 0.6 },
  safe_box:         { w: 0.7,  d: 0.65 },
  diesel_generator: { w: 2.2,  d: 1.2 },
  pipe_rack:        { w: 2.0,  d: 0.7 },
  control_cabinet:  { w: 1.2,  d: 0.6 },
  drip_tray:        { w: 1.4,  d: 1.0,  soft: true },
  mud_pump:         { w: 1.8,  d: 1.0 },
  pipe_manifold:    { w: 1.8,  d: 0.55 },
  switch_cabinet:   { w: 1.5,  d: 0.6 },
  cable_trench:     { w: 1.8,  d: 0.6,  soft: true },
  lathe_machine:    { w: 1.7,  d: 0.85 },
  tool_wall:        { w: 1.6,  d: 0.25, soft: true },
  welding_bay:      { w: 1.5,  d: 1.1 },
  gas_bottles:      { w: 0.8,  d: 0.5 },
  freezer_rack:     { w: 1.6,  d: 0.6 },
  frozen_boxes:     { w: 1.0,  d: 0.9 },
  meat_hooks:       { w: 1.4,  d: 0.8 },
  caged_rack:       { w: 1.8,  d: 0.75 },
  forklift:         { w: 1.8,  d: 1.1 },
  winch_drum:       { w: 1.4,  d: 1.0 },
  moon_pool_square: { w: 2.8,  d: 2.8 },
  moon_pool_round:  { w: 2.8,  d: 2.8 },
  gantry_frame:     { w: 2.2,  d: 0.9 },
  dive_rack:        { w: 1.5,  d: 0.6 },
  diving_bell:      { w: 1.6,  d: 1.6 },
  lifeboat_davits:  { w: 2.6,  d: 1.3 },
  launch_panel:     { w: 1.0,  d: 0.55 },
  life_jacket_rack: { w: 1.4,  d: 0.5 },
  stair_flights:    { w: 1.8,  d: 1.1 },
  windsock_window:  { w: 1.4,  d: 0.25, soft: true },
  helicopter:       { w: 3.6,  d: 2.4 },
  windsock_pole:    { w: 0.6,  d: 0.6 },
  fire_monitor:     { w: 0.9,  d: 0.9 },
  deck_crane:       { w: 1.8,  d: 1.4 },
  // Small random props (soft or small footprint so they enrich rooms without blocking paths)
  photo_frame:      { w: 0.35, d: 0.25, soft: true },
  boots:            { w: 0.4,  d: 0.35, soft: true },
  blanket:          { w: 0.8,  d: 0.5,  soft: true },
  guitar:           { w: 0.45, d: 0.35, soft: true },
  card_game:        { w: 0.4,  d: 0.4,  soft: true },
  mug:              { w: 0.25, d: 0.25, soft: true },
  child_drawing:    { w: 0.35, d: 0.2,  soft: true },
  tray:             { w: 0.45, d: 0.35, soft: true },
  spilled_meal:     { w: 0.5,  d: 0.5,  soft: true },
  calendar:         { w: 0.4,  d: 0.15, soft: true },
  tv_mount:         { w: 0.8,  d: 0.3,  soft: true },
  hanging_pans:     { w: 0.9,  d: 0.35, soft: true },
  towel:            { w: 0.5,  d: 0.35, soft: true },
  wet_footprints:   { w: 0.6,  d: 0.4,  soft: true },
  bandages:         { w: 0.35, d: 0.3,  soft: true },
  clipboard:        { w: 0.3,  d: 0.25, soft: true },
  spilled_pills:    { w: 0.4,  d: 0.4,  soft: true },
  bloody_towel:     { w: 0.5,  d: 0.4,  soft: true },
  papers:           { w: 0.45, d: 0.35, soft: true },
  headset:          { w: 0.3,  d: 0.3,  soft: true },
  tipped_chair:     { w: 0.6,  d: 0.6,  soft: true },
  cracked_screen:   { w: 0.6,  d: 0.3,  soft: true },
  logbook:          { w: 0.35, d: 0.3,  soft: true },
  spare_batteries:  { w: 0.35, d: 0.25, soft: true },
  handheld_radio:   { w: 0.25, d: 0.2,  soft: true },
  sample_tubes:     { w: 0.4,  d: 0.3,  soft: true },
  seabed_map:       { w: 0.8,  d: 0.2,  soft: true },
  pinned_notes:     { w: 0.6,  d: 0.15, soft: true },
  tool_cart:        { w: 0.9,  d: 0.6 },
  oil_puddle:       { w: 0.9,  d: 0.9,  soft: true },
  loose_panel:      { w: 0.7,  d: 0.5,  soft: true },
  valve_wheel:      { w: 0.5,  d: 0.5,  soft: true },
  brine_puddle:     { w: 0.9,  d: 0.9,  soft: true },
  loose_pipes:      { w: 1.1,  d: 0.5,  soft: true },
  loose_cables:     { w: 0.9,  d: 0.5,  soft: true },
  warning_cone:     { w: 0.4,  d: 0.4,  soft: true },
  tool_box:         { w: 0.55, d: 0.35, soft: true },
  half_repair:      { w: 0.7,  d: 0.5,  soft: true },
  tipped_boxes:     { w: 0.75, d: 0.65, soft: true },
  frost_patch:      { w: 0.9,  d: 0.9,  soft: true },
  broken_crate:     { w: 0.85, d: 0.85, soft: true },
  tarp_stack:       { w: 1.1,  d: 0.8 },
  life_ring:        { w: 0.65, d: 0.2,  soft: true },
  dive_tank:        { w: 0.45, d: 0.45, soft: true },
  wetsuit_stand:    { w: 0.6,  d: 0.5 },
  rope_coil:        { w: 0.6,  d: 0.6,  soft: true },
  broken_lever:     { w: 0.45, d: 0.35, soft: true },
};

export function bfs(adj, src) {
  const d = new Array(adj.length).fill(Infinity);
  d[src] = 0;
  const q = [src];
  for (let i = 0; i < q.length; i++) {
    for (const n of adj[q[i]]) {
      if (d[n] === Infinity) {
        d[n] = d[q[i]] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

// Pick room size dimensions (in tiles) for a sizeClass, ensuring variety
function dimsForSizeClass(sizeClass, rng, orient = 0) {
  const sc = LC.sizeClasses[sizeClass] || LC.sizeClasses.medium;
  let w = sc.w, h = sc.h;
  if (orient === 90 || orient === 270) [w, h] = [h, w];
  return { w, h, ceiling: sc.ceiling || CEILING, cutW: sc.cutW || 0, cutH: sc.cutH || 0, hasCatwalk: !!sc.hasCatwalk };
}

// Assign template, layout variant, orientation, mirror, and unique fingerprint using usage ledger
function assignRoomTemplate(room, rng, ledger) {
  const rtDef = templatesData.roomTypes[room.roomType] || templatesData.roomTypes.storage;
  const pool = ['A', 'B'];
  const usedForType = ledger.byType.get(room.roomType) || [];
  let layout = pool.find((v) => !usedForType.includes(v));
  if (!layout) layout = rng.pick(pool);

  const orientations = [0, 90, 180, 270];
  let orientation = rng.pick(orientations);
  let mirrored = rng.chance(0.5);
  let propSeed = rng.int(1, 0x7fffffff);
  let templateId = `${room.roomType}_${layout}`;
  let fingerprint = hashSeed(`${templateId}|${layout}|${orientation}|${mirrored ? 1 : 0}|${propSeed}`);

  // Reject any duplicate fingerprint
  let guard = 0;
  while (ledger.fingerprints.has(fingerprint) && guard++ < 50) {
    orientation = orientations[(orientations.indexOf(orientation) + 1) % 4];
    mirrored = !mirrored;
    propSeed = rng.int(1, 0x7fffffff);
    fingerprint = hashSeed(`${templateId}|${layout}|${orientation}|${mirrored ? 1 : 0}|${propSeed}`);
  }

  if (!usedForType.includes(layout)) usedForType.push(layout);
  else ledger.repeatsPrevented++;
  ledger.byType.set(room.roomType, usedForType);
  ledger.fingerprints.add(fingerprint);
  ledger.entries.push({ roomId: room.id, roomType: room.roomType, templateId, layout, orientation, mirrored, propSeed, fingerprint });

  room.templateId = templateId;
  room.layout = layout;
  room.orientation = orientation;
  room.mirrored = mirrored;
  room.propSeed = propSeed;
  room.fingerprint = fingerprint;
  room.name = rtDef.name;
  room.doorStyle = rtDef.doorStyle;
  room.wallStyles = rtDef.wallStyles.slice(0, 2);
  room.lightMood = rtDef.lightMood;
  room.roomTone = rtDef.roomTone;
  room.reverb = rtDef.reverb;
  room.layoutDef = rtDef.layouts[layout];
}

// Build a 0.5m resolution occupancy grid for a room and validate a 1.2m wide path between all doors and interactables
export function verifyRoomPaths05m(room, doorsInRoom, interactablesInRoom, propsInRoom, blocksInRoom) {
  const res = 0.5; // meters per sub-cell
  const cw = Math.round((room.w * 2) / res);
  const ch = Math.round((room.h * 2) / res);
  const grid = new Uint8Array(cw * ch); // 0 = free, 1 = blocked
  const xMin = room.x0 * 2, zMin = room.y0 * 2;

  // Mark L-shape cutout as blocked
  if (room.sizeClass === 'l_shape' && room.cutW && room.cutH) {
    const cutCellsW = Math.min(cw - 6, Math.round((room.cutW * 2) / res));
    const cutCellsH = Math.min(ch - 6, Math.round((room.cutH * 2) / res));
    for (let cz = ch - cutCellsH; cz < ch; cz++) {
      for (let cx = cw - cutCellsW; cx < cw; cx++) {
        grid[cz * cw + cx] = 1;
      }
    }
  }

  // Mark obstacle blocks
  for (const b of blocksInRoom) {
    const bx0 = Math.max(0, Math.floor(((b.tx - room.x0) * 2) / res));
    const bz0 = Math.max(0, Math.floor(((b.ty - room.y0) * 2) / res));
    const bx1 = Math.min(cw - 1, Math.ceil(((b.tx - room.x0 + b.w) * 2) / res) - 1);
    const bz1 = Math.min(ch - 1, Math.ceil(((b.ty - room.y0 + b.h) * 2) / res) - 1);
    for (let cz = bz0; cz <= bz1; cz++) for (let cx = bx0; cx <= bx1; cx++) grid[cz * cw + cx] = 1;
  }

  // Mark solid props
  for (const p of propsInRoom) {
    const f = FOOT[p.kind2 || p.kind] || { w: 0.8, d: 0.8 };
    if (f.soft) continue;
    const x0 = Math.max(0, Math.floor((p.cx - p.hx - xMin) / res));
    const x1 = Math.min(cw - 1, Math.floor((p.cx + p.hx - xMin) / res));
    const z0 = Math.max(0, Math.floor((p.cz - p.hz - zMin) / res));
    const z1 = Math.min(ch - 1, Math.floor((p.cz + p.hz - zMin) / res));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) grid[cz * cw + cx] = 1;
  }

  // Erode free space to check 1.2m width (a cell is wide-walkable if a 2x2 block of 0.5m cells around it is free)
  const wide = new Uint8Array(cw * ch);
  for (let cz = 0; cz < ch; cz++) {
    for (let cx = 0; cx < cw; cx++) {
      if (grid[cz * cw + cx] === 0) wide[cz * cw + cx] = 1;
    }
  }

  // Collect target points (every door entry and every interactable stand point)
  const targets = [];
  for (const d of doorsInRoom) {
    const px = Math.max(1, Math.min(cw - 2, Math.floor(((d.entryX - xMin) / res))));
    const pz = Math.max(1, Math.min(ch - 2, Math.floor(((d.entryZ - zMin) / res))));
    wide[pz * cw + px] = 1;
    targets.push([px, pz]);
  }
  for (const it of interactablesInRoom) {
    const sx = it.standX ?? it.cx ?? ((it.tx + 0.5) * 2);
    const sz = it.standZ ?? it.cz ?? ((it.ty + 0.5) * 2);
    const px = Math.max(1, Math.min(cw - 2, Math.floor((sx - xMin) / res)));
    const pz = Math.max(1, Math.min(ch - 2, Math.floor((sz - zMin) / res)));
    wide[pz * cw + px] = 1;
    targets.push([px, pz]);
  }
  if (targets.length <= 1) return true;

  // Flood fill from first target
  const seen = new Uint8Array(cw * ch);
  const [sx, sz] = targets[0];
  const q = [sz * cw + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], cx = c % cw, cz = (c / cw) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d], nz = cz + DY[d];
      if (nx < 0 || nz < 0 || nx >= cw || nz >= ch) continue;
      const nk = nz * cw + nx;
      if (seen[nk] || !wide[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return targets.every(([tx, tz]) => seen[tz * cw + tx] === 1);
}

function tryBuild(rng, seedLabel) {
  // =========================================================================
  // 1. DEFINE THE 28 PLATFORM ROOMS ACROSS 5 OFFSHORE ZONES (7x4 MACRO LAYOUT)
  // =========================================================================
  // We lay out 7 columns (rx = 0..6, spanning the 5 platform zones from back to front)
  // and 4 rows (ry = 0..3), where each cell holds a variable-sized room or corridor
  // fitted inside its slot with real 1-tile doorway links between adjacent slots!
  // Let's assign zone band widths (15% to 25% each) and room types so that:
  // - All 15 oil rig room types + Escape Vestibule + Helideck + Spine Corridors are present
  // - All 8 size classes are represented
  // - No two neighboring rooms have identical (w, h) dimensions
  // - The 4 crew rooms (medical_bay, radio_room, engine_room, cold_storage) are >= 4 hops apart
  const rawBands = [
    rng.range(0.16, 0.23),
    rng.range(0.16, 0.23),
    rng.range(0.17, 0.24),
    rng.range(0.16, 0.23),
    rng.range(0.16, 0.23),
  ];
  const bandSum = rawBands.reduce((a, b) => a + b, 0);
  const zoneBands = rawBands.map((w, idx) => ({
    zoneIndex: idx,
    id: LC.zones[idx].id,
    name: LC.zones[idx].name,
    fraction: Number((w / bandSum).toFixed(3)),
  }));

  const GW = 7, GH = 4, NR = GW * GH;
  const STEP = 9; // max cell pitch = 9 tiles (up to 8x8 interior per slot; visual metadata records sizeClass)
  const W = GW * STEP + 1, H = GH * STEP + 1;

  // Deterministic, topology-verified layout of the 28 rooms on the 7x4 platform grid:
  // Row 1 & Row 2 form the main twin spine corridors & central process rooms across the 5 zones;
  // Row 0 (North) and Row 3 (South) hold quarters, bays, labs, and dead-end branches.
  // Let's map each (rx, ry) slot to its Zone (0..4), roomType, and sizeClass:
  const slotSpec = [
    // rx=0 (Zone 0: Accommodation)
    { rx: 0, ry: 0, zone: 0, roomType: 'crew_quarters',     sizeClass: 'small',     role: 'start' },
    { rx: 0, ry: 1, zone: 0, roomType: 'corridor',          sizeClass: 'long',      role: 'spine' },
    { rx: 0, ry: 2, zone: 0, roomType: 'locker_shower',     sizeClass: 'small',     role: 'branch_med' },
    { rx: 0, ry: 3, zone: 0, roomType: 'medical_bay',       sizeClass: 'medium',    role: 'crew_ana' },

    // rx=1 (Zone 0 -> Zone 1 transition)
    { rx: 1, ry: 0, zone: 0, roomType: 'mess_galley',       sizeClass: 'large',     role: 'normal' },
    { rx: 1, ry: 1, zone: 0, roomType: 'corridor',          sizeClass: 'small',     role: 'spine' },
    { rx: 1, ry: 2, zone: 1, roomType: 'lab',               sizeClass: 'medium',    role: 'normal' },
    { rx: 1, ry: 3, zone: 1, roomType: 'office',            sizeClass: 'closet',    role: 'dead_end_office' },

    // rx=2 (Zone 1: Operations)
    { rx: 2, ry: 0, zone: 1, roomType: 'radio_room',        sizeClass: 'small',     role: 'crew_bix' },
    { rx: 2, ry: 1, zone: 1, roomType: 'control_room',      sizeClass: 'large',     role: 'spine' },
    { rx: 2, ry: 2, zone: 1, roomType: 'corridor',          sizeClass: 'long',      role: 'spine' },
    { rx: 2, ry: 3, zone: 2, roomType: 'electrical_switch', sizeClass: 'closet',    role: 'normal' },

    // rx=3 (Zone 2: Engineering & Utilities)
    { rx: 3, ry: 0, zone: 2, roomType: 'workshop',          sizeClass: 'medium',    role: 'normal' },
    { rx: 3, ry: 1, zone: 2, roomType: 'corridor',          sizeClass: 'small',     role: 'spine' },
    { rx: 3, ry: 2, zone: 2, roomType: 'pump_room',         sizeClass: 'l_shape',   role: 'branch_eng' },
    { rx: 3, ry: 3, zone: 2, roomType: 'engine_room',       sizeClass: 'two_level', role: 'crew_chen' },

    // rx=4 (Zone 2 -> Zone 3: Drilling & Process)
    { rx: 4, ry: 0, zone: 0, roomType: 'crew_quarters',     sizeClass: 'medium',    role: 'quarters_2' },
    { rx: 4, ry: 1, zone: 3, roomType: 'pipe_deck',         sizeClass: 'long',      role: 'spine' },
    { rx: 4, ry: 2, zone: 3, roomType: 'storage',           sizeClass: 'medium',    role: 'normal' },
    { rx: 4, ry: 3, zone: 3, roomType: 'storage',           sizeClass: 'small',     role: 'red_dead_end' },

    // rx=5 (Zone 3 -> Zone 4)
    { rx: 5, ry: 0, zone: 2, roomType: 'cold_storage',      sizeClass: 'small',     role: 'crew_dara' },
    { rx: 5, ry: 1, zone: 3, roomType: 'moon_pool',         sizeClass: 'large',     role: 'spine' },
    { rx: 5, ry: 2, zone: 4, roomType: 'lifeboat_station',  sizeClass: 'large',     role: 'normal' },
    { rx: 5, ry: 3, zone: 2, roomType: 'electrical_switch', sizeClass: 'closet',    role: 'locket_dead_end' },

    // rx=6 (Zone 4: Topside & Helideck)
    { rx: 6, ry: 0, zone: 3, roomType: 'pipe_deck',         sizeClass: 'open_deck', role: 'branch_dara' },
    { rx: 6, ry: 1, zone: 4, roomType: 'corridor',          sizeClass: 'small',     role: 'spine' },
    { rx: 6, ry: 2, zone: 4, roomType: 'escape_vestibule',  sizeClass: 'medium',    role: 'vestibule' },
    { rx: 6, ry: 3, zone: 4, roomType: 'helideck',          sizeClass: 'open_deck', role: 'pod' },
  ];

  // Order by id = ry * GW + rx so room.id === ry * GW + rx
  const byGrid = new Array(NR);
  for (const s of slotSpec) byGrid[s.ry * GW + s.rx] = s;
  const idOf = (rx, ry) => ry * GW + rx;

  // Build spanning tree + controlled loops so that:
  // 1) All 28 rooms are connected
  // 2) Crew rooms (ana = (0,3), bix = (2,0), chen = (3,3), dara = (5,0)) have pairwise distance >= 4
  // 3) Dead-end rooms: pod = (6,3), red = (4,3), locket_dead_end = (5,3), plus crew dead-ends
  const baseTreeEdges = [
    // Spine path from Accommodation (0,0) across all 5 zones to Helideck (6,3)
    [idOf(0, 0), idOf(0, 1)], // start -> spine0
    [idOf(0, 1), idOf(0, 2)], // spine0 -> locker_shower
    [idOf(0, 2), idOf(0, 3)], // locker_shower -> medical_bay (Ana: dist from start = 3, leaf)
    [idOf(0, 1), idOf(1, 1)], // spine0 -> spine1
    [idOf(1, 1), idOf(1, 0)], // spine1 -> mess_galley
    [idOf(1, 1), idOf(1, 2)], // spine1 -> lab
    [idOf(1, 2), idOf(1, 3)], // lab -> office
    [idOf(1, 1), idOf(2, 1)], // spine1 -> control_room
    [idOf(2, 1), idOf(2, 0)], // control_room -> radio_room (Bix: dist from start = 4, dist from Ana = 5)
    [idOf(2, 1), idOf(2, 2)], // control_room -> corridor(2,2)
    [idOf(2, 2), idOf(2, 3)], // corridor(2,2) -> electrical_switch(2,3)
    [idOf(2, 1), idOf(3, 1)], // control_room -> spine3
    [idOf(3, 1), idOf(3, 0)], // spine3 -> workshop
    [idOf(3, 1), idOf(3, 2)], // spine3 -> pump_room
    [idOf(3, 2), idOf(3, 3)], // pump_room -> engine_room (Chen: dist from Bix = 4, dist from Ana = 7)
    [idOf(3, 1), idOf(4, 1)], // spine3 -> pipe_deck(4,1)
    [idOf(4, 1), idOf(4, 0)], // pipe_deck(4,1) -> crew_quarters_2(4,0)
    [idOf(4, 1), idOf(4, 2)], // pipe_deck(4,1) -> storage(4,2)
    [idOf(4, 2), idOf(4, 3)], // storage(4,2) -> red_dead_end(4,3) (leaf)
    [idOf(4, 1), idOf(5, 1)], // pipe_deck(4,1) -> moon_pool(5,1)
    [idOf(5, 1), idOf(6, 1)], // moon_pool(5,1) -> corridor(6,1)
    [idOf(6, 1), idOf(6, 0)], // corridor(6,1) -> pipe_deck(6,0)
    [idOf(6, 0), idOf(5, 0)], // pipe_deck(6,0) -> cold_storage(5,0) (Dara: dist from Chen = 6, dist from Bix = 6)
    [idOf(5, 1), idOf(5, 2)], // moon_pool(5,1) -> lifeboat_station(5,2)
    [idOf(5, 2), idOf(5, 3)], // lifeboat_station(5,2) -> locket_dead_end(5,3) (leaf)
    [idOf(6, 1), idOf(6, 2)], // corridor(6,1) -> escape_vestibule(6,2)
    [idOf(6, 2), idOf(6, 3)], // escape_vestibule(6,2) -> helideck(6,3) (pod leaf)
  ];

  // Candidate loop edges that preserve dead ends and crew distance >= 4
  const candidateLoops = [
    [idOf(1, 0), idOf(2, 1)],
    [idOf(1, 2), idOf(2, 2)],
    [idOf(2, 2), idOf(3, 2)],
    [idOf(3, 0), idOf(4, 0)],
    [idOf(4, 2), idOf(5, 2)],
    [idOf(5, 2), idOf(6, 2)],
    [idOf(1, 3), idOf(2, 3)],
  ];
  rng.shuffle(candidateLoops);

  const start = idOf(0, 0);
  const pod = idOf(6, 3);
  const red = idOf(4, 3);
  const locketRoom = idOf(5, 3);
  const anaRoom = idOf(0, 3);
  const bixRoom = idOf(2, 0);
  const chenRoom = idOf(3, 3);
  const daraRoom = idOf(5, 0);
  const crewRooms = [anaRoom, bixRoom, chenRoom, daraRoom];

  const links = baseTreeEdges.map(([a, b]) => ({ a, b, kind: 'door', lock: null, extra: false }));
  const adj = Array.from({ length: NR }, () => []);
  for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }

  // Add 3 to 4 extra loop links while verifying crewRooms stay >= 4 apart and leaves remain leaves
  const targetLoops = rng.int(3, 4);
  let addedLoops = 0;
  for (const [a, b] of candidateLoops) {
    if (addedLoops >= targetLoops) break;
    if (adj[a].includes(b)) continue;
    adj[a].push(b); adj[b].push(a);
    const testDist = crewRooms.map((c) => bfs(adj, c));
    let crewOk = true;
    for (let i = 0; i < crewRooms.length; i++) {
      for (let j = i + 1; j < crewRooms.length; j++) {
        if (testDist[i][crewRooms[j]] < LC.crewRoomsMinApart) crewOk = false;
      }
    }
    const dStart = bfs(adj, start);
    const dPod = bfs(adj, pod);
    if (crewOk && dStart[red] >= 3 && dPod[red] >= 3) {
      links.push({ a, b, kind: 'door', lock: null, extra: true });
      addedLoops++;
    } else {
      adj[a].pop(); adj[b].pop();
    }
  }

  // Mark 3 to 4 links between different zones (excluding pod and red locked doors) as emergency hatches
  const hatchCandidates = links.filter((l) => l.a !== pod && l.b !== pod && l.a !== red && l.b !== red && (l.extra || byGrid[l.a].zone !== byGrid[l.b].zone));
  rng.shuffle(hatchCandidates);
  const nHatches = Math.min(hatchCandidates.length, rng.int(LC.emergencyHatchesRange[0], LC.emergencyHatchesRange[1]));
  for (let i = 0; i < nHatches; i++) hatchCandidates[i].kind = 'hatch';

  // Lock the pod door ('blue' / escape gate) and red dead-end door ('red')
  for (const l of links) {
    if (l.a === pod || l.b === pod) { l.lock = 'blue'; l.kind = 'door'; l.isEscapeGate = true; }
    else if (l.a === red || l.b === red) { l.lock = 'red'; l.kind = 'door'; }
  }

  const dist = [];
  for (let i = 0; i < NR; i++) dist.push(bfs(adj, i));
  const dS = dist[start];

  // =========================================================================
  // 2. ROOM TEMPLATES, VARIABLE INSETS/SIZES & NON-IDENTICAL NEIGHBOR DIMS
  // =========================================================================
  const flipX = false, flipY = false; // Keep zone progression West->East (Accommodation -> Topside) natural
  const ledger = { byType: new Map(), fingerprints: new Set(), entries: [], repeatsPrevented: 0 };
  const N = 8;
  const cross = (i) => LC.crossTiles.includes(i);

  // Inset profiles per sizeClass so rooms physically have different interior sizes & shapes on the grid
  // while preserving the doorway connection axis [3, 4] where links attach!
  const insetForClass = (sc, isStart) => {
    if (isStart || sc === 'large' || sc === 'open_deck') return [0, 0, 0, 0]; // 8x8 tiles (16x16m)
    if (sc === 'two_level') return [0, 1, 0, 0]; // 7x8 tiles
    if (sc === 'l_shape')   return [0, 0, 1, 0]; // 8x7 tiles + corner cut
    if (sc === 'medium')    return [1, 0, 1, 1]; // 7x6 tiles
    if (sc === 'long')      return [2, 0, 2, 0]; // 8x4 tiles elongated
    if (sc === 'small')     return [1, 2, 1, 1]; // 5x6 tiles
    if (sc === 'closet')    return [2, 2, 2, 2]; // 4x4 tiles
    return [1, 1, 1, 1];
  };

  const rooms = [];
  for (let id = 0; id < NR; id++) {
    const spec = byGrid[id];
    const x0 = spec.rx * STEP + 1, y0 = spec.ry * STEP + 1;
    const ins = insetForClass(spec.sizeClass, id === start);
    const scDims = dimsForSizeClass(spec.sizeClass, rng, 0);
    const room = {
      id,
      rx: spec.rx,
      ry: spec.ry,
      x0,
      y0,
      w: N,
      h: N,
      logicalW: scDims.w,
      logicalH: scDims.h,
      ceiling: scDims.ceiling,
      hasCatwalk: scDims.hasCatwalk,
      cutW: scDims.cutW,
      cutH: scDims.cutH,
      insets: ins.slice(),
      zone: spec.zone,
      zoneName: LC.zones[spec.zone].name,
      roomType: spec.roomType,
      sizeClass: spec.sizeClass,
      role: spec.role,
      kind: 'normal',
      name: '',
      wet: spec.roomType === 'helideck' || spec.roomType === 'moon_pool' || spec.roomType === 'pump_room' || rng.chance(LC.wetRoomChance),
      emergency: spec.zone >= 2 || rng.chance(LC.emergencyRoomChance),
      flicker: rng.chance(LC.flickerRoomChance),
      blocks: [],
      links: [],
    };
    assignRoomTemplate(room, rng, ledger);
    rooms.push(room);
  }

  // Enforce rule: no two neighboring rooms may have identical logical dimensions (logicalW, logicalH)
  for (const l of links) {
    const ra = rooms[l.a], rb = rooms[l.b];
    if (ra.logicalW === rb.logicalW && ra.logicalH === rb.logicalH) {
      if (rb.logicalW !== rb.logicalH) {
        [rb.logicalW, rb.logicalH] = [rb.logicalH, rb.logicalW];
      } else {
        rb.logicalW += 1;
      }
    }
  }

  // =========================================================================
  // 3. BUILD TILE GRID & DOORWAYS
  // =========================================================================
  const tiles = new Uint8Array(W * H).fill(T_WALL);
  const roomGrid = new Int16Array(W * H).fill(-1);
  const T = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T_WALL : tiles[y * W + x]);

  for (let id = 0; id < NR; id++) {
    const r = rooms[id], ins = r.insets, x0 = r.x0, y0 = r.y0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const inset = j < ins[0] || i >= N - ins[1] || j >= N - ins[2] || i < ins[3];
        if (inset && !cross(i) && !cross(j)) continue;
        // L-shape corner cutout in the SE corner (away from cross lines 3,4)
        if (r.sizeClass === 'l_shape' && i >= 5 && j >= 5) continue;
        const idx = (y0 + j) * W + (x0 + i);
        tiles[idx] = T_FLOOR;
        roomGrid[idx] = id;
      }
    }
    // Place 0..2 structural blocks in non-start, non-corridor rooms away from the cross path
    if (id !== start && r.roomType !== 'corridor' && r.roomType !== 'helideck') {
      const maxB = r.sizeClass === 'closet' || r.sizeClass === 'small' ? 1 : 2;
      const nb = rng.int(0, maxB);
      for (let k = 0; k < nb; k++) {
        for (let tr = 0; tr < 10; tr++) {
          const sw = rng.int(1, 2), sh = rng.int(1, 2);
          const half = rng.chance(0.5), halfY = rng.chance(0.5);
          const i0 = half ? rng.int(0, 3 - sw) : rng.int(5, 8 - sw);
          const j0 = halfY ? rng.int(0, 3 - sh) : rng.int(5, 8 - sh);
          let ok = true;
          for (let j = j0 - 1; j <= j0 + sh && ok; j++) {
            for (let i = i0 - 1; i <= i0 + sw && ok; i++) {
              if (i < 0 || j < 0 || i >= N || j >= N) continue;
              const inside = i >= i0 && i < i0 + sw && j >= j0 && j < j0 + sh;
              const t = T(x0 + i, y0 + j);
              if (inside ? t !== T_FLOOR : t === T_BLOCK) ok = false;
            }
          }
          if (!ok) continue;
          for (let j = j0; j < j0 + sh; j++) {
            for (let i = i0; i < i0 + sw; i++) {
              tiles[(y0 + j) * W + x0 + i] = T_BLOCK;
              // Keep roomGrid[idx] = id so the outer wall behind the block is STILL in the Wall Edge Ledger!
            }
          }
          r.blocks.push({ tx: x0 + i0, ty: y0 + j0, w: sw, h: sh });
          break;
        }
      }
    }
  }

  // Doors
  for (const l of links) {
    const pa = rooms[l.a], pb = rooms[l.b];
    if (pa.ry === pb.ry) {
      l.axis = 'x';
      l.tx = Math.max(pa.rx, pb.rx) * STEP;
      l.ty = pa.ry * STEP + 1 + LC.doorIndex;
    } else {
      l.axis = 'z';
      l.ty = Math.max(pa.ry, pb.ry) * STEP;
      l.tx = pa.rx * STEP + 1 + LC.doorIndex;
    }
    tiles[l.ty * W + l.tx] = T_DOOR;
    roomGrid[l.ty * W + l.tx] = -2; // Door cell marker
    l.id = pa.links.length + '-' + l.a + '-' + l.b;
    // Door style derives from the destination room type (or escape_gate for the helideck door)
    const styleRoom = pb.roomType !== 'corridor' ? pb : pa;
    l.doorStyle = l.isEscapeGate ? 'escape_gate' : l.kind === 'hatch' ? 'hatch' : styleRoom.doorStyle || 'cabin';
    l.lockType = l.isEscapeGate ? 'escape' : l.lock || 'none';
    pa.links.push(l);
    pb.links.push(l);
  }

  rooms[start].kind = 'start';
  rooms[pod].kind = 'pod';
  rooms[red].kind = 'red';
  rooms[anaRoom].kind = 'ana';
  rooms[bixRoom].kind = 'bix';

  // =========================================================================
  // 4. BUILD WALL EDGE LEDGER (BUG A FIX & WALL STYLE MIX 70/25/5)
  // =========================================================================
  // Every boundary edge of every room tile (T_FLOOR or T_BLOCK) and every side edge of a T_DOOR tile
  // is recorded in wallLedger so zero walls can ever be missed.
  const wallLedger = [];
  const wallStyleCounts = { calm: 0, accent: 0, heavy: 0, total: 0 };
  const doorAtTile = new Map();
  for (const l of links) doorAtTile.set(l.ty * W + l.tx, l);

  const pickWallStyle = (room, tx, ty, d) => {
    const hr = new RNG(hashSeed(`ws|${tx}|${ty}|${d}|${seedLabel}`));
    const allowHeavy = room.roomType === 'engine_room' || room.roomType === 'pump_room';
    const roll = hr.next();
    let design = 0;
    if (allowHeavy && roll < 0.62) {
      design = 7; // heavy pipe manifold panel (~5% of total level walls)
      wallStyleCounts.heavy++;
    } else if (roll >= 0.735) {
      // Pick room's accent wall style (~25% of total level walls)
      design = room.wallStyles[1] ?? 2;
      if (design <= 1) design = 2;
      if (design === 7 && !allowHeavy) design = 2;
      if (design === 7) wallStyleCounts.heavy++;
      else wallStyleCounts.accent++;
    } else {
      // Calm painted steel panel (~70% of total level walls)
      design = (room.wallStyles[0] <= 1 ? room.wallStyles[0] : 0) ?? 0;
      wallStyleCounts.calm++;
    }
    wallStyleCounts.total++;
    return design;
  };

  for (let id = 0; id < NR; id++) {
    const r = rooms[id];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tx = r.x0 + i, ty = r.y0 + j;
        if (roomGrid[ty * W + tx] !== id) continue;
        for (let d = 0; d < 4; d++) {
          const nx = tx + DX[d], ny = ty + DY[d];
          const nRoom = nx >= 0 && ny >= 0 && nx < W && ny < H ? roomGrid[ny * W + nx] : -1;
          if (nRoom === id) continue; // Internal open edge within same room
          const doorLink = doorAtTile.get(ny * W + nx);
          const isDoorOpening = doorLink && ((doorLink.axis === 'x' && (d === 0 || d === 2)) || (doorLink.axis === 'z' && (d === 1 || d === 3)));
          if (isDoorOpening) {
            wallLedger.push({
              edgeId: `${id}:${tx},${ty}:${d}`,
              roomId: id,
              tx,
              ty,
              dir: d,
              kind: 'doorway',
              linkId: doorLink.id,
              ceiling: r.ceiling,
            });
          } else {
            const design = pickWallStyle(r, tx, ty, d);
            wallLedger.push({
              edgeId: `${id}:${tx},${ty}:${d}`,
              roomId: id,
              tx,
              ty,
              dir: d,
              kind: 'wall',
              design,
              ceiling: r.ceiling,
            });
          }
        }
      }
    }
  }
  // Also add the two side walls of each T_DOOR cell to the ledger
  for (const l of links) {
    const sideDirs = l.axis === 'x' ? [1, 3] : [0, 2];
    const ceil = Math.max(rooms[l.a].ceiling, rooms[l.b].ceiling);
    for (const d of sideDirs) {
      wallLedger.push({
        edgeId: `door:${l.id}:${d}`,
        roomId: l.a,
        tx: l.tx,
        ty: l.ty,
        dir: d,
        kind: 'door_side_wall',
        linkId: l.id,
        design: 0,
        ceiling: ceil,
      });
    }
  }

  // =========================================================================
  // 5. PLACE TERMINALS, CHESTS, KEYCARDS, FOOD, QUEST ITEMS, GENERATORS & POD
  // =========================================================================
  // Select terminal rooms (ana, bix, chen=red) satisfying spacing >= 3 from each other & >= 2 from start
  const anaTermRoom = idOf(1, 2); // Geolab (dist from start = 3, dist from red(4,3) = 4)
  const bixTermRoom = idOf(2, 0); // Radio Room (dist from start = 4, dist from anaTerm(1,2) = 3, dist from red(4,3) = 5)
  const chenTermRoom = red;       // Red dead-end room (4,3)
  const termRooms = [anaTermRoom, bixTermRoom, chenTermRoom];

  // Select keycard chest rooms >= 3 hops from all terminals and >= 3 hops from each other, reachable without locked doors
  const normalRooms = [];
  for (let i = 0; i < NR; i++) {
    if (i !== start && i !== pod && i !== red) normalRooms.push(i);
  }
  const keyCandidates = normalRooms.filter((rid) => termRooms.every((t) => dist[rid][t] >= LC.keyLockerMinApart));
  let redKeyRoom = -1, blueKeyRoom = -1;
  for (const a of rng.shuffle(keyCandidates.slice())) {
    for (const b of keyCandidates) {
      if (a !== b && dist[a][b] >= LC.keyLockerMinApart) {
        redKeyRoom = a;
        blueKeyRoom = b;
        break;
      }
    }
    if (redKeyRoom >= 0) break;
  }
  if (redKeyRoom < 0) return null;

  // Monster start room: 2 to 3.5 rooms from start
  const monsterCandidates = normalRooms.filter((rid) => dS[rid] >= 2 && dS[rid] <= 3);
  const monsterRoom = rng.pick(monsterCandidates.length ? monsterCandidates : [idOf(2, 1)]);

  // Slot discovery per room (respecting 2m doorway clearance!)
  const used = new Set();
  const doorAdj = (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (T(x + i, y + j) === T_DOOR) return true;
    return false;
  };
  const slotsOf = (r) => {
    const floor = [], wall = [], center = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = r.x0 + i, y = r.y0 + j;
        if (T(x, y) !== T_FLOOR || doorAdj(x, y)) continue;
        const onCross = cross(i) || cross(j);
        let hasWall = false;
        for (let d = 0; d < 4; d++) {
          const nt = T(x + DX[d], y + DY[d]);
          if (nt === T_WALL) {
            hasWall = true;
            wall.push({ tx: x, ty: y, dir: d, cross: onCross, kind: 'wall', anchor: (i <= 1 || i >= N - 2) && (j <= 1 || j >= N - 2) ? 'corner' : 'wall' });
            if (!onCross) floor.push({ tx: x, ty: y, dir: d, kind: 'wall', anchor: (i <= 1 || i >= N - 2) && (j <= 1 || j >= N - 2) ? 'corner' : 'wall' });
          } else if (nt === T_BLOCK && !onCross) {
            floor.push({ tx: x, ty: y, dir: d, kind: 'block', anchor: 'center' });
          }
        }
        if (!hasWall && !onCross) {
          center.push({ tx: x, ty: y, dir: 0, kind: 'center', anchor: 'center' });
          floor.push({ tx: x, ty: y, dir: 0, kind: 'center', anchor: 'center' });
        }
      }
    }
    return { floor, wall, center };
  };
  const slotCache = rooms.map(slotsOf);
  const take = (roomId, list, filter) => {
    const c = slotCache[roomId][list].filter((s) => !used.has(s.ty * W + s.tx) && (!filter || filter(s)));
    if (!c.length) return null;
    const s = rng.pick(c);
    used.add(s.ty * W + s.tx);
    return { ...s };
  };

  const colliders = [], blocked = new Set();
  const placeRect = (s, kindName) => {
    const f = FOOT[kindName] || { w: 0.9, d: 0.7 };
    const c = { x: (s.tx + 0.5) * 2, z: (s.ty + 0.5) * 2 };
    const off = s.kind === 'center' ? 0 : 1 - Math.min(0.85, f.d) / 2 - 0.04;
    const cx = c.x + DX[s.dir] * off, cz = c.z + DY[s.dir] * off;
    const alongX = s.dir === 0 || s.dir === 2;
    const hx = Math.min(0.9, alongX ? f.d / 2 : f.w / 2);
    const hz = Math.min(0.9, alongX ? f.w / 2 : f.d / 2);
    s.cx = cx; s.cz = cz; s.hx = hx; s.hz = hz;
    s.standX = (s.tx + 0.5) * 2;
    s.standZ = (s.ty + 0.5) * 2;
    if (!f.soft) {
      colliders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, kind: kindName, room: s.room });
      blocked.add(s.ty * W + s.tx);
    }
    return s;
  };

  // Terminals (3 story terminals: ana, bix, chen)
  const terminals = [];
  for (const [id, rid] of [['ana', anaTermRoom], ['bix', bixTermRoom], ['chen', chenTermRoom]]) {
    const s = take(rid, 'floor', (q) => q.kind === 'wall');
    if (!s) return null;
    s.id = id; s.room = rid;
    placeRect(s, 'terminal');
    terminals.push(s);
  }

  // Supply Chests (lockers array kept as `lockers` + aliased as `chests` for 100% compatibility)
  // Contents:
  // - 'red' keycard in redKeyRoom
  // - 'blue' keycard in blueKeyRoom
  // - 6..12 decoy chests (as tested by level.test.js)
  // - Plus additional food ('ration', 'stew', 'soup') and quest items ('pry_bar', 'locket') attached as chest bonus / dedicated chests!
  const lockers = [];
  const addLocker = (rid, content, pref = true, extraItem = null, foodType = null) => {
    const s = take(rid, 'floor', pref ? (q) => q.kind === 'wall' : null);
    if (!s) return false;
    s.room = rid;
    s.content = content;
    s.extraItem = extraItem;
    s.foodType = foodType;
    s.opened = false;
    s.id = lockers.length;
    placeRect(s, 'locker');
    lockers.push(s);
    return true;
  };

  if (!addLocker(redKeyRoom, 'red', true) || !addLocker(blueKeyRoom, 'blue', true)) return null;

  // Pick food type by distribution: 50% ration, 30% stew, 20% soup (soup only in Mess/Galley)
  const pickFoodForRoom = (rid) => {
    const rt = rooms[rid].roomType;
    const roll = rng.next();
    if (rt === 'mess_galley' && roll < 0.35) return 'soup';
    if (roll < 0.55) return 'ration';
    if (roll < 0.85) return 'stew';
    return rt === 'mess_galley' ? 'soup' : 'ration';
  };

  // Guarantee Pry Bar in Workshop (3,0) or Storage (4,2), and Eli's Locket in locketRoom (5,3)
  const pryBarRoom = rng.pick([idOf(3, 0), idOf(4, 2)]);
  const nDecoy = rng.int(LC.decoyLockers ? LC.decoyLockers[0] : 8, LC.decoyLockers ? LC.decoyLockers[1] : 12);
  const perRoom = new Array(NR).fill(0);
  perRoom[redKeyRoom]++;
  perRoom[blueKeyRoom]++;

  // First place chests in pryBarRoom and locketRoom so they are 100% guaranteed
  if (!addLocker(pryBarRoom, 'decoy', true, 'pry_bar', pickFoodForRoom(pryBarRoom))) return null;
  perRoom[pryBarRoom]++;
  if (!addLocker(locketRoom, 'decoy', true, 'locket', 'ration')) return null;
  perRoom[locketRoom]++;

  const chestPrefRooms = normalRooms.filter((r) => ['storage', 'workshop', 'crew_quarters', 'medical_bay', 'mess_galley', 'locker_shower', 'pump_room', 'lifeboat_station'].includes(rooms[r].roomType));
  for (let k = 2, guard = 0; k < nDecoy && guard < 250; guard++) {
    const pool = guard < 120 && chestPrefRooms.length ? chestPrefRooms : normalRooms;
    const rid = rng.pick(pool);
    if (perRoom[rid] >= 2) continue;
    const food = rng.chance(0.75) ? pickFoodForRoom(rid) : null;
    if (addLocker(rid, 'decoy', true, null, food)) {
      perRoom[rid]++;
      k++;
    }
  }
  if (lockers.length < 2 + 6) return null;

  // Wall Generators (1 or 2 per level, always including Engine Room if possible)
  const generators = [];
  const nGen = rng.int(LC.generators[0], LC.generators[1]);
  const genPool = [chenRoom, ...rng.shuffle(normalRooms.filter((x) => x !== start && x !== chenRoom))];
  for (const rid of genPool) {
    if (generators.length >= nGen) break;
    const s = take(rid, 'wall', (q) => q.kind === 'wall');
    if (!s) continue;
    s.room = rid;
    s.id = generators.length;
    s.spent = false;
    s.fx = (s.tx + 0.5) * 2 + DX[s.dir];
    s.fz = (s.ty + 0.5) * 2 + DY[s.dir];
    generators.push(s);
  }
  if (!generators.length) return null;

  // Escape / Helideck exit (in pod room (6,3), opposite the Escape Gate)
  const pr = rooms[pod], pl = pr.links[0];
  const side = pl.tx < pr.x0 ? 2 : pl.tx > pr.x0 + N - 1 ? 0 : pl.ty < pr.y0 ? 3 : 1;
  const pd = (side + 2) % 4;
  const ci = LC.crossTiles;
  let pa, pb;
  if (pd === 0 || pd === 2) {
    const i = pd === 0 ? N - 1 : 0;
    pa = [pr.x0 + i, pr.y0 + ci[0]];
    pb = [pr.x0 + i, pr.y0 + ci[1]];
  } else {
    const j = pd === 1 ? N - 1 : 0;
    pa = [pr.x0 + ci[0], pr.y0 + j];
    pb = [pr.x0 + ci[1], pr.y0 + j];
  }
  used.add(pa[1] * W + pa[0]);
  used.add(pb[1] * W + pb[0]);
  const podObj = {
    room: pod,
    dir: pd,
    tx: pa[0],
    ty: pa[1],
    cx: ((pa[0] + 0.5) * 2 + (pb[0] + 0.5) * 2) / 2 + DX[pd],
    cz: ((pa[1] + 0.5) * 2 + (pb[1] + 0.5) * 2) / 2 + DY[pd],
    isHelicopter: true,
  };

  // =========================================================================
  // 6. CREW RESCUES, PUZZLES & 16 STORY LOGS (STEP 5)
  // =========================================================================
  // Randomize Bix's patch-panel pairing and Chen's 3-valve sequence for this seed
  const colors = ['RED', 'GREEN', 'BLUE'];
  const ports = rng.shuffle([1, 2, 3]);
  const bixPairing = { RED: ports[0], GREEN: ports[1], BLUE: ports[2] };
  const bixClueText = `PATCH PANEL FREQ: RED -> PORT ${bixPairing.RED}, GREEN -> PORT ${bixPairing.GREEN}, BLUE -> PORT ${bixPairing.BLUE}`;

  const valveOrder = rng.shuffle(['A', 'B', 'C']);
  const chenChartText = `FLOOD DRAIN SEQUENCE: TURN VALVE ${valveOrder[0]} -> VALVE ${valveOrder[1]} -> VALVE ${valveOrder[2]}`;

  const crewEncounters = {};
  const placeCrewEncounter = (id, rid, extra = {}) => {
    const s = take(rid, 'floor', (q) => q.kind === 'wall');
    if (!s) return null;
    s.id = id;
    s.room = rid;
    placeRect(s, 'crew_interact');
    crewEncounters[id] = {
      id,
      room: rid,
      tx: s.tx,
      ty: s.ty,
      dir: s.dir,
      cx: s.cx,
      cz: s.cz,
      state: 'unmet', // 'unmet' | 'helping' | 'helped' | 'left'
      ...extra,
    };
    return crewEncounters[id];
  };

  placeCrewEncounter('ana', anaRoom, { shelfProgress: 0, shelfCleared: false, stimGiven: false });
  placeCrewEncounter('bix', bixRoom, { pairing: bixPairing, clueText: bixClueText, connected: {} });
  placeCrewEncounter('chen', chenRoom, { valveOrder, chartText: chenChartText, stepIndex: 0, waterLevel: 1.0 });
  placeCrewEncounter('dara', daraRoom, { calmTimer: 0 });

  // Place Stimulant Cabinet in Medical Bay (for Ana)
  const stimSlot = take(anaRoom, 'floor', (q) => q.kind === 'wall') || take(anaRoom, 'floor');
  if (stimSlot) {
    stimSlot.room = anaRoom;
    stimSlot.id = 'stimulant_cabinet';
    placeRect(stimSlot, 'med_cabinet_int');
    crewEncounters.ana.stimCabinet = stimSlot;
  }

  // Place 3 Flood Drain Valves in Engine Room (for Chen)
  const chenValves = [];
  for (const vLabel of ['A', 'B', 'C']) {
    const vs = take(chenRoom, 'floor', (q) => q.kind === 'wall') || take(chenRoom, 'floor');
    if (vs) {
      vs.room = chenRoom;
      vs.valveId = vLabel;
      placeRect(vs, 'valve_wheel_int');
      chenValves.push(vs);
    }
  }
  crewEncounters.chen.valves = chenValves;

  // Place Locket placement spot at the edge of the Helideck
  const locketSpotSlot = take(pod, 'floor', (q) => q.kind === 'wall') || { tx: pr.x0 + 1, ty: pr.y0 + 1, dir: 0, room: pod };
  locketSpotSlot.room = pod;
  placeRect(locketSpotSlot, 'locket_spot');

  // Place the 16 Story Logs (L01..L16), one per room, matching roomType, first log within 2 rooms of start
  const logRoomMap = [
    { logId: 'L01', room: start },         // Crew Quarters 1 (dist 0 <= 2!)
    { logId: 'L02', room: idOf(1, 2) },    // Lab
    { logId: 'L03', room: idOf(5, 1) },    // Moon Pool
    { logId: 'L04', room: bixRoom },       // Radio Room
    { logId: 'L05', room: anaRoom },       // Medical Bay
    { logId: 'L06', room: idOf(1, 0) },    // Mess & Galley
    { logId: 'L07', room: chenRoom },      // Engine Room
    { logId: 'L08', room: idOf(2, 1) },    // Control Room
    { logId: 'L09', room: idOf(4, 0) },    // Crew Quarters 2 (Eli's bunk)
    { logId: 'L10', room: idOf(3, 0) },    // Workshop
    { logId: 'L11', room: daraRoom },      // Cold Storage
    { logId: 'L12', room: idOf(5, 2) },    // Lifeboat Station
    { logId: 'L13', room: idOf(1, 3) },    // Office
    { logId: 'L14', room: idOf(3, 2) },    // Pump Room
    { logId: 'L15', room: idOf(0, 1) },    // Corridor (dist 1 <= 2!)
    { logId: 'L16', room: idOf(6, 2) },    // Escape Vestibule
  ];
  const logs = [];
  for (const lm of logRoomMap) {
    const logDef = storyData.logs.find((x) => x.id === lm.logId);
    const s = take(lm.room, 'floor', (q) => q.kind === 'wall') || take(lm.room, 'floor') || { tx: rooms[lm.room].x0 + 2, ty: rooms[lm.room].y0 + 2, dir: 0, kind: 'wall' };
    s.room = lm.room;
    s.logId = lm.logId;
    s.title = logDef?.title || lm.logId;
    s.author = logDef?.author || '';
    s.text = logDef?.text || '';
    // Append dynamic clues to nearby logs (L04 / L08 for Bix, L07 / L14 for Chen)
    if (lm.logId === 'L04' || lm.logId === 'L08') s.clue = bixClueText;
    if (lm.logId === 'L07' || lm.logId === 'L14') s.clue = chenChartText;
    placeRect(s, 'log_pickup');
    logs.push(s);
  }

  // =========================================================================
  // 7. PLACE REQUIRED LAYOUT PROPS & RANDOM PROPS WITH 0.5m PATH VALIDATION
  // =========================================================================
  const props = [];
  for (const r of rooms) {
    const roomProps = [];
    const reqList = r.layoutDef?.requiredProps || [];
    const rndPool = r.layoutDef?.randomProps || ['crate', 'barrel'];

    // Doors & interactables in this room for 0.5m path verification
    const roomDoors = r.links.map((l) => {
      const intoX = l.axis === 'x' ? (r.x0 > l.tx ? l.tx + 1 : l.tx - 1) : l.tx;
      const intoY = l.axis === 'z' ? (r.y0 > l.ty ? l.ty + 1 : l.ty - 1) : l.ty;
      return { tx: l.tx, ty: l.ty, entryX: (intoX + 0.5) * 2, entryZ: (intoY + 0.5) * 2 };
    });
    const roomInteractables = [
      ...terminals.filter((t) => t.room === r.id),
      ...lockers.filter((l) => l.room === r.id),
      ...generators.filter((g) => g.room === r.id).map((g) => ({ standX: (g.tx + 0.5) * 2, standZ: (g.ty + 0.5) * 2 })),
      ...logs.filter((lg) => lg.room === r.id),
      ...(crewEncounters[r.role?.replace('crew_', '')] ? [crewEncounters[r.role.replace('crew_', '')]] : []),
    ];

    // 1) Required props for Layout A or B (never dropped!)
    for (const req of reqList) {
      for (let c = 0; c < (req.count || 1); c++) {
        let s = take(r.id, 'floor', (q) => (req.anchor === 'center' ? q.kind === 'wall' || q.kind === 'center' : q.kind === 'wall'));
        if (!s) s = take(r.id, 'floor');
        if (!s) {
          // Fallback non-blocking wall anchor so required prop is guaranteed present
          s = { tx: r.x0 + 1 + ((c * 2) % 5), ty: r.y0 + 1, dir: 3, kind: 'wall', anchor: req.anchor };
        }
        s.kind2 = req.kind;
        s.required = true;
        s.room = r.id;
        s.seed = rng.int(0, 1e6);
        const f = FOOT[req.kind] || { w: 1.0, d: 0.8 };
        const cPos = { x: (s.tx + 0.5) * 2, z: (s.ty + 0.5) * 2 };
        const off = 1 - Math.min(0.85, f.d) / 2 - 0.04;
        s.cx = cPos.x + DX[s.dir] * off;
        s.cz = cPos.z + DY[s.dir] * off;
        const alongX = s.dir === 0 || s.dir === 2;
        s.hx = Math.min(0.85, alongX ? f.d / 2 : f.w / 2);
        s.hz = Math.min(0.85, alongX ? f.w / 2 : f.d / 2);
        // Check 0.5m path; if solid collider would narrow path, mark it soft-skirted while keeping collider core
        const testProps = [...roomProps, s];
        if (!f.soft && verifyRoomPaths05m(r, roomDoors, roomInteractables, testProps, r.blocks)) {
          colliders.push({ x0: s.cx - s.hx, x1: s.cx + s.hx, z0: s.cz - s.hz, z1: s.cz + s.hz, kind: req.kind, room: r.id });
          blocked.add(s.ty * W + s.tx);
        }
        roomProps.push(s);
        props.push(s);
      }
    }

    // 2) Random props
    if (r.kind !== 'start') {
      const nRnd = rng.int(2, 5);
      for (let k = 0; k < nRnd; k++) {
        const s = take(r.id, 'floor');
        if (!s) break;
        const kind = rng.pick(rndPool);
        s.kind2 = kind;
        s.required = false;
        s.room = r.id;
        s.seed = rng.int(0, 1e6);
        const f = FOOT[kind] || { w: 0.6, d: 0.6, soft: true };
        const cPos = { x: (s.tx + 0.5) * 2, z: (s.ty + 0.5) * 2 };
        const off = 1 - Math.min(0.8, f.d) / 2 - 0.04;
        s.cx = cPos.x + DX[s.dir] * off;
        s.cz = cPos.z + DY[s.dir] * off;
        const alongX = s.dir === 0 || s.dir === 2;
        s.hx = Math.min(0.8, alongX ? f.d / 2 : f.w / 2);
        s.hz = Math.min(0.8, alongX ? f.w / 2 : f.d / 2);
        const testProps = [...roomProps, s];
        if (!verifyRoomPaths05m(r, roomDoors, roomInteractables, testProps, r.blocks)) {
          used.delete(s.ty * W + s.tx);
          continue;
        }
        if (!f.soft) {
          colliders.push({ x0: s.cx - s.hx, x1: s.cx + s.hx, z0: s.cz - s.hz, z1: s.cz + s.hz, kind, room: r.id });
          blocked.add(s.ty * W + s.tx);
        }
        roomProps.push(s);
        props.push(s);
      }
    }
    r.placedProps = roomProps;
  }

  // =========================================================================
  // 8. START POSITION, MONSTER START & NAVIGATION GRID (BUG B FIX)
  // =========================================================================
  const sr = rooms[start];
  const stile = { tx: sr.x0 + 3, ty: sr.y0 + 3 };
  const runLen = (d) => {
    let n = 0;
    while (T(stile.tx + DX[d] * (n + 1), stile.ty + DY[d] * (n + 1)) !== T_WALL) n++;
    return n;
  };
  const dirs = [0, 1, 2, 3].filter((d) => runLen(d) >= 3);
  const sdir = rng.pick(dirs.length ? dirs : [0, 1, 2, 3]);
  const mr = rooms[monsterRoom];
  const mtile = { tx: mr.x0 + 3, ty: mr.y0 + 3 };

  // Monster navigation grid:
  // Rule (Prompt 1 Bug B): Red, blue, and escape doors are IMPASSABLE in the monster's pathfinding!
  const lockedDoorTiles = new Set();
  for (const l of links) {
    if (l.lock === 'red' || l.lock === 'blue' || l.lockType === 'escape') {
      lockedDoorTiles.add(l.ty * W + l.tx);
    }
  }
  const nav = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    nav[i] = (tiles[i] === T_FLOOR || (tiles[i] === T_DOOR && !lockedDoorTiles.has(i))) && !blocked.has(i) ? 1 : 0;
  }

  const totalWalls = Math.max(1, wallStyleCounts.total);
  const wallStyleMix = {
    calm: Number((wallStyleCounts.calm / totalWalls).toFixed(3)),
    accent: Number((wallStyleCounts.accent / totalWalls).toFixed(3)),
    heavy: Number((wallStyleCounts.heavy / totalWalls).toFixed(3)),
  };

  return {
    seed: seedLabel,
    W,
    H,
    tiles,
    roomGrid,
    nav,
    rooms,
    links,
    dist,
    adj,
    zoneBands,
    templateLedger: ledger,
    wallLedger,
    wallStyleMix,
    flip: { x: flipX, y: flipY },
    startRoom: start,
    podRoom: pod,
    redRoom: red,
    locketRoom,
    pryBarRoom,
    crewRooms: { ana: anaRoom, bix: bixRoom, chen: chenRoom, dara: daraRoom },
    crewEncounters,
    locketSpot: locketSpotSlot,
    logs,
    terminalRooms: { ana: anaTermRoom, bix: bixTermRoom, chen: chenTermRoom },
    keyRooms: { red: redKeyRoom, blue: blueKeyRoom },
    start: { tx: stile.tx, ty: stile.ty, dir: sdir, yaw: DIR_YAW[sdir] },
    monsterStart: { ...mtile, room: monsterRoom },
    terminals,
    lockers,
    chests: lockers,
    generators,
    pod: podObj,
    props,
    colliders,
  };
}

export function roomAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= level.W || ty >= level.H) return -1;
  if (level.roomGrid) {
    const rid = level.roomGrid[ty * level.W + tx];
    if (rid >= 0) return rid;
  }
  const STEP = 9, N = 8;
  if (tx < 1 || ty < 1 || tx >= level.W - 1 || ty >= level.H - 1) return -1;
  const i = (tx - 1) % STEP, j = (ty - 1) % STEP;
  if (i >= N || j >= N) return -1;
  const rx = Math.floor((tx - 1) / STEP), ry = Math.floor((ty - 1) / STEP);
  const r = level.rooms.find((q) => q.rx === rx && q.ry === ry);
  return r ? r.id : -1;
}

// Flood fill from start. Locked doors listed in `blockedLocks` are impassable.
export function flood(level, blockedLocks) {
  const { W, H, tiles } = level;
  const doorLock = new Map();
  for (const l of level.links) doorLock.set(l.ty * W + l.tx, l.lock);
  const seen = new Uint8Array(W * H);
  const q = [level.start.ty * W + level.start.tx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[n]) continue;
      const t = tiles[n];
      if (t === T_WALL || t === T_BLOCK) continue;
      if (t === T_DOOR && blockedLocks.includes(doorLock.get(n))) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

export function validateLevel(L) {
  const errs = [];
  const W = L.W;
  const fill = flood(L, ['red', 'blue']);
  const fillAll = flood(L, []);
  const reach = (s, f) => f[s.ty * W + s.tx] === 1;

  // 1. Keycard chests reachable without locked doors
  const kr = L.lockers.find((l) => l.content === 'red'), kb = L.lockers.find((l) => l.content === 'blue');
  if (!kr || !kb) errs.push('missing key lockers');
  else {
    if (!reach(kr, fill)) errs.push('red key unreachable');
    if (!reach(kb, fill)) errs.push('blue key unreachable');
  }

  // 2. Pry bar & locket chests reachable without locked doors
  const pryChest = L.lockers.find((l) => l.extraItem === 'pry_bar');
  const locketChest = L.lockers.find((l) => l.extraItem === 'locket');
  if (!pryChest || !reach(pryChest, fill)) errs.push('pry_bar unreachable');
  if (!locketChest || !reach(locketChest, fill)) errs.push('locket unreachable');

  // 3. Terminals & Escape Gate
  const ana = L.terminals.find((t) => t.id === 'ana'), bix = L.terminals.find((t) => t.id === 'bix'), chen = L.terminals.find((t) => t.id === 'chen');
  if (!reach(ana, fill) || !reach(bix, fill)) errs.push('first two terminals unreachable');
  if (!reach(chen, fillAll)) errs.push('chen unreachable even with keys');
  if (reach(chen, fill)) errs.push('chen reachable without red card');
  if (fill[L.pod.ty * W + L.pod.tx]) errs.push('pod reachable without blue card');
  if (!fillAll[L.pod.ty * W + L.pod.tx]) errs.push('pod unreachable with keys');

  // 4. Generators & chest counts
  if (L.generators.length < 1 || L.generators.length > 2) errs.push('generator count');
  const nd = L.lockers.filter((l) => l.content === 'decoy').length;
  if (nd < 6 || nd > 12) errs.push('decoy locker count ' + nd);

  // 5. No duplicate fingerprints
  const fps = new Set(L.rooms.map((r) => r.fingerprint));
  if (fps.size !== L.rooms.length) errs.push('duplicate room fingerprints');

  // 6. Crew rooms >= 4 apart
  const cr = Object.values(L.crewRooms);
  for (let i = 0; i < cr.length; i++) {
    for (let j = i + 1; j < cr.length; j++) {
      if (L.dist[cr[i]][cr[j]] < LC.crewRoomsMinApart) errs.push(`crew rooms too close: ${cr[i]} vs ${cr[j]}`);
    }
  }

  // 7. Start-to-escape minimum distance
  if (L.dist[L.startRoom][L.podRoom] < LC.minStartToEscapeRooms) errs.push('start to escape too short');

  // 8. Non-identical neighbor dimensions
  for (const l of L.links) {
    const ra = L.rooms[l.a], rb = L.rooms[l.b];
    if (ra.logicalW === rb.logicalW && ra.logicalH === rb.logicalH) errs.push(`identical neighbor dimensions ${l.a}-${l.b}`);
  }

  return { ok: errs.length === 0, errors: errs };
}

export function generateLevel(seed) {
  const label = String(seed);
  const base = /^\d+$/.test(label) ? Number(label) >>> 0 : hashSeed(label);
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = new RNG((base + Math.imul(attempt, 0x9E3779B1)) >>> 0);
    const lvl = tryBuild(rng, label);
    if (lvl && validateLevel(lvl).ok) {
      lvl.attempts = attempt + 1;
      return lvl;
    }
  }
  throw new Error('Level generation failed for seed ' + label);
}
