// Procedural PBR texture sets (albedo / normal / ORM / emissive), generated on canvas at load time.
// ORM packing (glTF style): R = ambient occlusion, G = roughness, B = metalness.
import * as THREE from 'three';
import { RNG } from './rng.js';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const gray = (v) => { v = Math.max(0, Math.min(255, v | 0)); return `rgb(${v},${v},${v})`; };

class PBR {
  constructor(w, h, { base = '#555', rough = 0.7, metal = 0.0, seed = 1 } = {}) {
    this.w = w; this.h = h; this.ox = 0; this.oy = 0; this.clip = null; this.rng = new RNG(seed);
    this.cvs = { c: cv(w, h), h: cv(w, h), o: cv(w, h), e: cv(w, h) };
    this.ctx = {}; for (const k in this.cvs) this.ctx[k] = this.cvs[k].getContext('2d', { willReadFrequently: k === 'h' });
    this.ctx.c.fillStyle = base; this.ctx.c.fillRect(0, 0, w, h);
    this.ctx.h.fillStyle = gray(128); this.ctx.h.fillRect(0, 0, w, h);
    this.ctx.o.fillStyle = `rgb(255,${(rough * 255) | 0},${(metal * 255) | 0})`; this.ctx.o.fillRect(0, 0, w, h);
    this.ctx.e.fillStyle = '#000'; this.ctx.e.fillRect(0, 0, w, h);
  }
  cell(ox, oy, cw, ch) { this.ox = ox; this.oy = oy; this.clip = [ox, oy, cw, ch]; }
  paint(o, fn) {
    for (const k of ['c', 'h', 'o', 'e']) {
      let style;
      if (k === 'c') style = o.c; else if (k === 'e') style = o.e;
      else if (k === 'h') style = o.h === undefined ? undefined : gray(o.h);
      else if (o.r !== undefined || o.m !== undefined || o.ao !== undefined) style = `rgb(${((o.ao ?? 1) * 255) | 0},${((o.r ?? 0.7) * 255) | 0},${((o.m ?? 0) * 255) | 0})`;
      if (style === undefined) continue;
      const c = this.ctx[k]; c.save();
      if (this.clip) { c.beginPath(); c.rect(...this.clip); c.clip(); }
      c.translate(this.ox, this.oy); c.fillStyle = style; c.strokeStyle = style; c.globalAlpha = o.a ?? 1;
      fn(c, k); c.restore();
    }
  }
  rect(x, y, w, h, o) { this.paint(o, (c) => c.fillRect(x, y, w, h)); }
  circle(x, y, r, o) { this.paint(o, (c) => { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }); }
  line(x1, y1, x2, y2, lw, o) { this.paint(o, (c) => { c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }); }
  poly(pts, o) { this.paint(o, (c) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); }); }
  strokeRect(x, y, w, h, lw, o) { this.paint(o, (c) => { c.lineWidth = lw; c.strokeRect(x, y, w, h); }); }
  text(str, x, y, font, o, align = 'left') { this.paint(o, (c) => { c.font = font; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(str, x, y); }); }
  grad(x, y, w, h, horizontal, stops, o) { // gradient fill on color+height+orm
    for (const k of ['c', 'h']) {
      if (o[k] === undefined) continue;
      const c = this.ctx[k]; c.save(); if (this.clip) { c.beginPath(); c.rect(...this.clip); c.clip(); } c.translate(this.ox, this.oy);
      const g = horizontal ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
      for (const [t, col, hv] of stops) g.addColorStop(t, k === 'c' ? col : gray(hv));
      c.fillStyle = g; c.fillRect(x, y, w, h); c.restore();
    }
  }
  grunge(x, y, w, h, { rust = 0.5, dirt = 0.5, scratches = 12, speckle = 1 } = {}) {
    const r = this.rng;
    // dirt blotches
    for (let i = 0; i < 10 * dirt; i++) {
      const bx = x + r.next() * w, by = y + r.next() * h, br = (0.05 + r.next() * 0.18) * Math.min(w, h);
      this.paint({ c: `rgba(10,8,12,${0.05 + r.next() * 0.12})`, r: 0.9, a: 1 }, (c, k) => {
        if (k !== 'c' && k !== 'o') return;
        const g = c.createRadialGradient(bx, by, 0, bx, by, br); const col = k === 'c' ? '10,8,12' : '255,230,0';
        g.addColorStop(0, `rgba(${col},0.35)`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(bx - br, by - br, br * 2, br * 2);
      });
    }
    // rust / grime streaks running down
    for (let i = 0; i < 14 * rust; i++) {
      const sx = x + r.next() * w, sy = y + r.next() * h * 0.7, sl = 20 + r.next() * h * 0.4, sw = 1 + r.next() * 5;
      const col = r.chance(0.6) ? '110,56,24' : '30,26,24';
      this.paint({ c: 'rgba(0,0,0,0)', a: 1 }, (c, k) => {
        if (k !== 'c') return;
        const g = c.createLinearGradient(0, sy, 0, sy + sl); g.addColorStop(0, `rgba(${col},0.0)`); g.addColorStop(0.15, `rgba(${col},${0.25 + r.next() * 0.25})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(sx, sy, sw, sl);
      });
    }
    // scratches
    for (let i = 0; i < scratches; i++) {
      const sx = x + r.next() * w, sy = y + r.next() * h, a = r.next() * 6.28, l = 6 + r.next() * 30;
      this.line(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, 0.8, { c: 'rgba(200,196,210,0.35)', h: 95, a: 0.6 });
    }
    // speckle
    const n = ((w * h) / 40) * speckle;
    const cc = this.ctx.c, ch = this.ctx.h;
    for (let i = 0; i < n; i++) {
      const px = x + r.next() * w, py = y + r.next() * h, v = r.next();
      cc.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.08 + r.next() * 0.1})` : `rgba(255,255,255,${0.03 + r.next() * 0.05})`;
      cc.fillRect(px, py, 1 + (r.next() < 0.2), 1);
      if (i % 3 === 0) { ch.fillStyle = gray(110 + r.next() * 40); ch.globalAlpha = 0.4; ch.fillRect(px, py, 1, 1); ch.globalAlpha = 1; }
    }
  }
  finish(renderer, { strength = 2.2, tiling = false, srgbEmissive = true } = {}) {
    const { w, h } = this;
    const id = this.ctx.h.getImageData(0, 0, w, h), src = id.data;
    const out = this.ctx.h.createImageData(w, h), d = out.data;
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength * 4, dy = (H(x, y + 1) - H(x, y - 1)) * strength * 4;
      let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    const nc = cv(w, h); nc.getContext('2d').putImageData(out, 0, 0);
    const mk = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true;
      if (tiling) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
    };
    const res = { map: mk(this.cvs.c, true), normalMap: mk(nc, false), orm: mk(this.cvs.o, false), emissiveMap: mk(this.cvs.e, srgbEmissive), canvas: this.cvs.c };
    return res;
  }
}

// -------- wall panel atlas (8 designs, each cell = 2 m x 3 m) --------
export const WALL_DESIGNS = ['plain', 'striped', 'hazard', 'monitor', 'funnel', 'diagonal', 'vent', 'pipes'];
function wallAtlas(renderer, S) {
  const cw = Math.round(384 * S), ch = Math.round(576 * S), cols = 4, rows = 2, M = cw / 2;
  const pb = new PBR(cw * cols, ch * rows, { base: '#4d4a58', rough: 0.55, metal: 0.55, seed: 11 });
  const base = (i, col) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch; pb.cell(ox, oy, cw, ch);
    pb.rect(0, 0, cw, ch, { c: col, h: 128, r: 0.5, m: 0.55 });
    // seams + rivets
    for (const y of [ch / 3, (2 * ch) / 3]) { pb.rect(0, y - 1.5, cw, 3, { c: '#17151c', h: 40, r: 0.9, ao: 0.4 }); for (let x = 0.15 * M; x < cw; x += 0.3 * M) pb.circle(x, y - 6, 0.03 * M, { c: '#8d8a99', h: 230, r: 0.4, m: 0.9 }); }
    pb.rect(cw / 2 - 1.5, 0, 3, ch, { c: '#17151c', h: 50, r: 0.9, ao: 0.5 });
    pb.rect(0, ch - 0.28 * M, cw, 0.28 * M, { c: '#25222b', h: 160, r: 0.7, m: 0.6 }); // baseboard
    pb.rect(0, ch - 0.28 * M - 2, cw, 3, { c: '#8a8695', h: 200, r: 0.4, m: 0.8 });
    pb.rect(0, 0, cw, 0.1 * M, { c: '#201d26', h: 170, r: 0.6, m: 0.6 }); // top trim
  };
  const done = () => pb.grunge(pb.clip[0], pb.clip[1], cw, ch, { rust: 0.8, dirt: 1, scratches: 22 });
  // 0 plain
  base(0, '#5b5768'); pb.text('B-14', cw * 0.5, ch * 0.33, `bold ${0.5 * M}px Silkscreen, monospace`, { c: 'rgba(224,128,40,0.7)', h: 135, r: 0.9 }, 'center');
  pb.rect(cw * 0.2, ch * 0.5, cw * 0.6, 0.06 * M, { c: '#d98324', h: 140, r: 0.8 }); done();
  // 1 striped band + chevrons
  base(1, '#58546a');
  pb.rect(0, ch * 0.34, cw, 0.5 * M, { c: '#2c8650', h: 135, r: 0.45, m: 0.3 }); pb.rect(0, ch * 0.34 + 0.5 * M, cw, 0.5 * M, { c: '#a8302d', h: 135, r: 0.45, m: 0.3 });
  for (let x = 0.15 * M; x < cw; x += 0.38 * M) { const y0 = ch * 0.34 + 0.07 * M; pb.poly([[x, y0], [x + 0.14 * M, y0 + 0.18 * M], [x, y0 + 0.36 * M], [x + 0.08 * M, y0 + 0.36 * M], [x + 0.22 * M, y0 + 0.18 * M], [x + 0.08 * M, y0]], { c: '#e8e4c8', h: 150, r: 0.5 }); }
  pb.rect(0, ch * 0.34 - 3, cw, 3, { c: '#111', h: 60 }); pb.rect(0, ch * 0.34 + M, cw, 3, { c: '#111', h: 60 }); done();
  // 2 hazard + lamp
  base(2, '#575368'); const hy = ch * 0.5; pb.rect(0, hy, cw, ch - hy - 0.28 * M, { c: '#1b1a1f', h: 120, r: 0.6, m: 0.4 });
  for (let x = -ch; x < cw + ch; x += 0.42 * M) pb.poly([[x, ch - 0.28 * M], [x + 0.21 * M, ch - 0.28 * M], [x + 0.21 * M + (ch - hy), hy], [x + (ch - hy), hy]], { c: '#e0861c', h: 135, r: 0.55, m: 0.2 });
  const lx = cw / 2, ly = ch * 0.22; pb.circle(lx, ly, 0.3 * M, { c: '#201e25', h: 190, r: 0.4, m: 0.8 });
  pb.circle(lx, ly, 0.2 * M, { c: '#ffb04a', h: 150, r: 0.2, e: '#ff7a10' });
  for (let i = -2; i <= 2; i++) pb.line(lx + i * 0.07 * M, ly - 0.2 * M, lx + i * 0.07 * M, ly + 0.2 * M, 2, { c: '#1a181e', h: 220, m: 0.8, r: 0.5 }); done();
  // 3 monitor wall
  base(3, '#3b3945'); const txts = ['SYS 04 OK', 'O2 LOW', 'DOOR 12 ERR', 'PWR 31%', 'NO SIGNAL', 'CREW? ---', 'HULL 42%', 'RUN QUIET'];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const mx = cw * (0.1 + c * 0.46), my = ch * (0.12 + r * 0.2), mw = cw * 0.38, mh = ch * 0.17; const dead = (r + c) === 3;
    pb.rect(mx - 4, my - 4, mw + 8, mh + 8, { c: '#15141a', h: 190, r: 0.4, m: 0.7 });
    pb.rect(mx, my, mw, mh, { c: dead ? '#050505' : '#2a1604', h: 110, r: 0.15, e: dead ? '#050301' : '#2a1204' });
    if (!dead) for (let i = 0; i < 5; i++) pb.text(txts[(r * 4 + c * 2 + i) % 8], mx + 6, my + 8 + i * (mh / 5.4), `${Math.max(6, 0.1 * M)}px monospace`, { c: '#ffa24a', h: 118, e: i === 0 ? '#ffb45c' : '#d96f12' });
    else pb.line(mx, my, mx + mw, my + mh, 2, { c: '#222', h: 100 });
  }
  pb.rect(cw * 0.1, ch * 0.62, cw * 0.84, 0.12 * M, { c: '#1a1920', h: 190, m: 0.8 }); for (let i = 0; i < 7; i++) pb.circle(cw * 0.15 + i * 0.22 * M, ch * 0.62 + 0.06 * M, 0.025 * M, { c: i % 3 ? '#38e06a' : '#ff3a2a', e: i % 3 ? '#20c050' : '#e02010' }); done();
  // 4 funnel outline
  base(4, '#625d71'); pb.rect(cw * 0.12, ch * 0.12, cw * 0.76, ch * 0.62, { c: '#4a4658', h: 112, r: 0.6, m: 0.5 });
  const fp = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.26], [0.58, 0.46], [0.58, 0.64], [0.42, 0.64], [0.42, 0.46], [0.2, 0.26]].map(([x, y]) => [x * cw, y * ch]);
  pb.paint({ c: '#dedaea', h: 190, r: 0.4 }, (c) => { c.lineWidth = 0.05 * M; c.lineJoin = 'round'; c.beginPath(); fp.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.stroke(); });
  pb.text('INTAKE', cw / 2, ch * 0.78, `${0.22 * M}px Silkscreen, monospace`, { c: '#d98324', h: 140 }, 'center'); done();
  // 5 diagonal cut
  base(5, '#615c73'); pb.poly([[0, ch * 0.85], [0, ch * 0.2], [cw, ch * 0.7], [cw, ch * 0.85]], { c: '#46424f', h: 118, r: 0.65, m: 0.5 });
  pb.paint({ c: '#e0861c', h: 150, r: 0.55 }, (c) => { c.lineWidth = 0.1 * M; c.setLineDash([0.16 * M, 0.12 * M]); c.beginPath(); c.moveTo(0, ch * 0.2); c.lineTo(cw, ch * 0.7); c.stroke(); });
  pb.line(0, ch * 0.2 + 7, cw, ch * 0.7 + 7, 3, { c: '#111', h: 50, ao: 0.4 }); for (const [x, y] of [[0.12, 0.62], [0.88, 0.2], [0.5, 0.8]]) pb.circle(x * cw, y * ch, 0.05 * M, { c: '#9b97a8', h: 230, m: 0.9, r: 0.4 }); done();
  // 6 vent grille
  base(6, '#56526a'); const vx = cw * 0.15, vy = ch * 0.18, vw = cw * 0.7, vh = ch * 0.4;
  pb.rect(vx - 6, vy - 6, vw + 12, vh + 12, { c: '#26232d', h: 200, r: 0.45, m: 0.8 }); pb.rect(vx, vy, vw, vh, { c: '#050507', h: 40, r: 0.9, ao: 0.1 });
  for (let y = vy + 4; y < vy + vh - 4; y += 0.11 * M) pb.rect(vx + 3, y, vw - 6, 0.06 * M, { c: '#3d3a48', h: 215, r: 0.5, m: 0.7 });
  pb.rect(cw * 0.46, ch * 0.62, cw * 0.08, ch * 0.2, { c: '#3a3745', h: 170, m: 0.8 }); done();
  // 7 pipe wall
  base(7, '#4d4a58'); const pipes = [[0.18, 0.09, '#7a4a30'], [0.4, 0.07, '#5c5668'], [0.62, 0.11, '#80502f'], [0.85, 0.06, '#4b5a58']];
  for (const [px, pr, col] of pipes) {
    const x0 = px * cw - pr * cw, w = pr * cw * 2;
    pb.grad(x0, 0, w, ch, true, [[0, '#120e0c', 90], [0.3, col, 200], [0.55, col, 230], [1, '#0c0908', 80]], { c: 1, h: 1 });
    for (const fy of [0.12, 0.45, 0.78]) pb.rect(x0 - 5, fy * ch, w + 10, 0.1 * M, { c: '#2a2630', h: 230, r: 0.5, m: 0.8 });
  }
  pb.circle(cw * 0.5, ch * 0.3, 0.2 * M, { c: '#a02a24', h: 200, r: 0.5, m: 0.4 }); pb.line(cw * 0.5 - 0.2 * M, ch * 0.3, cw * 0.5 + 0.2 * M, ch * 0.3, 3, { c: '#400', h: 230 }); pb.line(cw * 0.5, ch * 0.3 - 0.2 * M, cw * 0.5, ch * 0.3 + 0.2 * M, 3, { c: '#400', h: 230 }); done();
  pb.clip = null; pb.ox = pb.oy = 0;
  const t = pb.finish(renderer, { strength: 2.4 });
  t.cols = cols; t.rows = rows; t.cw = cw; t.ch = ch;
  t.uv = (i, inset = 0.004) => { const c = i % cols, r = Math.floor(i / cols); return [c / cols + inset, 1 - (r + 1) / rows + inset * 1.5, (c + 1) / cols - inset, 1 - r / rows - inset * 1.5]; };
  return t;
}

// -------- floor atlas 2x2: grating, tread plate, guide-line plates, concrete+hazard --------
function floorAtlas(renderer, S) {
  const s = Math.round(512 * S), pb = new PBR(s * 2, s * 2, { base: '#38353f', rough: 0.55, metal: 0.6, seed: 21 }), u = s / 2; // u = px per meter
  const cellOf = (i) => pb.cell((i % 2) * s, Math.floor(i / 2) * s, s, s);
  // 0 grating
  cellOf(0); pb.rect(0, 0, s, s, { c: '#09090c', h: 20, r: 0.9, ao: 0.1 });
  for (let k = 0; k < s; k += u / 8) { pb.rect(k, 0, u / 40, s, { c: '#55525f', h: 235, r: 0.4, m: 0.85 }); pb.rect(0, k, s, u / 48, { c: '#4a4755', h: 225, r: 0.45, m: 0.85 }); }
  pb.rect(0, 0, s, u * 0.1, { c: '#3a3743', h: 240, m: 0.8 }); pb.rect(0, s - u * 0.1, s, u * 0.1, { c: '#3a3743', h: 240, m: 0.8 });
  pb.rect(0, s * 0.5 - u * 0.04, s, u * 0.08, { c: '#c9a21a', h: 200, r: 0.7, m: 0.2 }); pb.grunge(0, 0, s, s, { rust: 0.3, dirt: 0.6, scratches: 6, speckle: 0.5 });
  // 1 diamond tread
  cellOf(1); pb.rect(0, 0, s, s, { c: '#46424f', h: 120, r: 0.5, m: 0.6 });
  for (let y = 0; y < s; y += u / 4) for (let x = 0; x < s; x += u / 4) { const o = (Math.round(y / (u / 4)) % 2) * u / 8; pb.poly([[x + o, y + u * 0.03], [x + o + u * 0.1, y + u * 0.125], [x + o, y + u * 0.22], [x + o - u * 0.1, y + u * 0.125]], { c: '#625e6f', h: 235, r: 0.35, m: 0.75 }); }
  pb.grunge(0, 0, s, s, { rust: 0.5, dirt: 1.2, scratches: 14, speckle: 0.6 });
  // 2 plates with guide lines
  cellOf(2); pb.rect(0, 0, s, s, { c: '#4f4b5a', h: 128, r: 0.5, m: 0.6 });
  pb.rect(0, s / 2 - 2, s, 4, { c: '#15131a', h: 50, ao: 0.4 }); pb.rect(s / 2 - 2, 0, 4, s, { c: '#15131a', h: 50, ao: 0.4 });
  for (const [x, y] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) pb.circle(x * s, y * s, u * 0.04, { c: '#8c889a', h: 240, m: 0.9, r: 0.4 });
  pb.rect(0, u * 0.06, s, u * 0.1, { c: '#d9a21f', h: 135, r: 0.7 }); pb.rect(0, s - u * 0.16, s, u * 0.1, { c: '#d9a21f', h: 135, r: 0.7 });
  pb.grunge(0, 0, s, s, { rust: 0.6, dirt: 1.2, scratches: 14, speckle: 0.6 });
  // 3 concrete + hazard edge
  cellOf(3); pb.rect(0, 0, s, s, { c: '#504d52', h: 128, r: 0.92, m: 0 });
  for (let i = 0; i < 1800; i++) { const x = pb.rng.next() * s, y = pb.rng.next() * s; pb.circle(x, y, 0.6 + pb.rng.next() * 1.8, { c: pb.rng.chance(0.5) ? '#3a383d' : '#68656b', h: 90 + pb.rng.next() * 80, a: 0.5 }); }
  for (let x = -s; x < s * 2; x += u * 0.3) pb.poly([[x, 0], [x + u * 0.15, 0], [x + u * 0.15 + u * 0.2, u * 0.2], [x + u * 0.2, u * 0.2]], { c: '#d9921c', h: 140, r: 0.75 });
  pb.rect(0, u * 0.2, s, 3, { c: '#111', h: 80 }); pb.grunge(0, 0, s, s, { rust: 0.2, dirt: 1.5, scratches: 10, speckle: 0.3 });
  pb.clip = null; pb.ox = pb.oy = 0;
  const t = pb.finish(renderer, { strength: 3 });
  t.uv = (i, inset = 0.003) => { const c = i % 2, r = Math.floor(i / 2); return [c / 2 + inset, 1 - (r + 1) / 2 + inset, (c + 1) / 2 - inset, 1 - r / 2 - inset]; };
  return t;
}

function tilingSets(renderer, S) {
  const s = Math.round(512 * S), u = s / 2, out = {};
  // ceiling tile (2 m)
  let pb = new PBR(s, s, { base: '#3a3842', rough: 0.85, metal: 0.1, seed: 31 });
  pb.rect(0, 0, s, s, { c: '#403e48', h: 120, r: 0.88 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { pb.rect(i * u + 6, j * u + 6, u - 12, u - 12, { c: '#47454f', h: 135, r: 0.9 }); for (let k = 0; k < 90; k++) pb.circle(i * u + 10 + pb.rng.next() * (u - 20), j * u + 10 + pb.rng.next() * (u - 20), 1.2, { c: '#2a2830', h: 90 }); }
  pb.rect(0, 0, s, 6, { c: '#1a1920', h: 200, m: 0.7 }); pb.rect(0, u - 3, s, 6, { c: '#1a1920', h: 200, m: 0.7 }); pb.rect(0, 0, 6, s, { c: '#1a1920', h: 200, m: 0.7 }); pb.rect(u - 3, 0, 6, s, { c: '#1a1920', h: 200, m: 0.7 });
  pb.grunge(0, 0, s, s, { rust: 0.4, dirt: 1.3, scratches: 4 }); out.ceiling = pb.finish(renderer, { tiling: true, strength: 2 });
  // riveted light plate
  pb = new PBR(s, s, { base: '#b9b5c2', rough: 0.45, metal: 0.65, seed: 32 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { pb.rect(i * u + 3, j * u + 3, u - 6, u - 6, { c: '#b9b5c2', h: 135, r: 0.45, m: 0.65 }); for (let k = 0; k < 8; k++) { const a = (k / 8) * u; for (const [x, y] of [[a + u / 16, 14], [a + u / 16, u - 14], [14, a + u / 16], [u - 14, a + u / 16]]) pb.circle(i * u + x, j * u + y, 0.025 * u * 1.3, { c: '#e0dce8', h: 235, m: 0.9, r: 0.35 }); } }
  pb.rect(0, u - 2, s, 4, { c: '#201e26', h: 40, ao: 0.4 }); pb.rect(u - 2, 0, 4, s, { c: '#201e26', h: 40, ao: 0.4 }); pb.rect(0, 0, s, 3, { c: '#201e26', h: 40, ao: 0.4 }); pb.rect(0, 0, 3, s, { c: '#201e26', h: 40, ao: 0.4 });
  pb.grunge(0, 0, s, s, { rust: 0.7, dirt: 1, scratches: 28 }); out.plate = pb.finish(renderer, { tiling: true, strength: 2.4 });
  // rusted pipe
  pb = new PBR(s, s, { base: '#6a4a38', rough: 0.8, metal: 0.55, seed: 33 });
  for (let i = 0; i < 700; i++) pb.circle(pb.rng.next() * s, pb.rng.next() * s, 1 + pb.rng.next() * 7, { c: pb.rng.chance(0.5) ? '#8a4a22' : '#3e2a20', h: 80 + pb.rng.next() * 120, a: 0.45 });
  pb.rect(0, s * 0.48, s, 10, { c: '#2a2128', h: 230, m: 0.8, r: 0.5 });
  pb.grunge(0, 0, s, s, { rust: 1.5, dirt: 1.2, scratches: 10 }); out.rust = pb.finish(renderer, { tiling: true, strength: 3 });
  // crate
  pb = new PBR(s, s, { base: '#5a5a48', rough: 0.7, metal: 0.35, seed: 34 });
  pb.rect(0, 0, s, s, { c: '#5b5d4d', h: 128, r: 0.65, m: 0.3 }); pb.strokeRect(10, 10, s - 20, s - 20, 22, { c: '#3d3f34', h: 200, m: 0.6, r: 0.6 });
  for (let k = 1; k < 5; k++) pb.rect(32, 32 + k * ((s - 64) / 5) - 1.5, s - 64, 3, { c: '#2a2b24', h: 60 });
  pb.line(32, 32, s - 32, s - 32, 14, { c: '#44463a', h: 190, m: 0.5 }); pb.line(s - 32, 32, 32, s - 32, 14, { c: '#44463a', h: 190, m: 0.5 });
  pb.text('SUPPLY', s / 2, s * 0.5, `bold ${u * 0.3}px Silkscreen, monospace`, { c: 'rgba(230,140,30,0.8)', h: 140 }, 'center');
  pb.rect(s * 0.1, s * 0.82, s * 0.8, 10, { c: '#d98a22', h: 140, r: 0.7 });
  for (const [x, y] of [[20, 20], [s - 20, 20], [20, s - 20], [s - 20, s - 20]]) pb.circle(x, y, 7, { c: '#9a9684', h: 240, m: 0.9 });
  pb.grunge(0, 0, s, s, { rust: 0.8, dirt: 1.2, scratches: 16 }); out.crate = pb.finish(renderer, { tiling: true, strength: 2.4 });
  // hazard
  pb = new PBR(s, s, { base: '#14131a', rough: 0.6, metal: 0.3, seed: 35 });
  for (let x = -s; x < s * 2; x += u * 0.5) pb.poly([[x, s], [x + u * 0.25, s], [x + u * 0.25 + s, 0], [x + s, 0]], { c: '#e0861c', h: 135, r: 0.55 });
  pb.grunge(0, 0, s, s, { rust: 0.6, dirt: 1, scratches: 12 }); out.hazard = pb.finish(renderer, { tiling: true, strength: 2 });
  // concrete
  pb = new PBR(s, s, { base: '#4e4b50', rough: 0.95, metal: 0, seed: 36 });
  for (let i = 0; i < 2200; i++) pb.circle(pb.rng.next() * s, pb.rng.next() * s, 0.6 + pb.rng.next() * 2.2, { c: pb.rng.chance(0.5) ? '#38363b' : '#6a676d', h: 80 + pb.rng.next() * 100, a: 0.5 });
  pb.grunge(0, 0, s, s, { rust: 0.3, dirt: 2, scratches: 8 }); out.concrete = pb.finish(renderer, { tiling: true, strength: 3 });
  return out;
}

// -------- decals (color + alpha only) --------
export const DECAL = { blood: 0, pool: 1, drag: 2, hand: 3, claw: 4, scorch: 5, stain: 6, warn: 7, silence: 8, poster: 9, note0: 10, note1: 11, note2: 12, puddle: 13, exit: 14, bio: 15 };
function decalAtlas(renderer, S, notes) {
  const s = Math.round(256 * S), c = cv(s * 4, s * 4), g = c.getContext('2d'); const rng = new RNG(77);
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * s, Math.floor(i / 4) * s); g.beginPath(); g.rect(0, 0, s, s); g.clip(); fn(); g.restore(); };
  const blot = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(0.7, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); };
  cell(0, () => { for (let i = 0; i < 10; i++) blot(s * (0.15 + i * 0.07), s * (0.2 + 0.5 * Math.abs(Math.sin(i))), s * (0.05 + rng.next() * 0.07), 'rgba(70,6,8,0.85)'); g.strokeStyle = 'rgba(60,4,6,0.8)'; g.lineWidth = s * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.1, s * 0.3); g.bezierCurveTo(s * 0.4, s * 0.1, s * 0.6, s * 0.8, s * 0.92, s * 0.6); g.stroke(); });
  cell(1, () => { blot(s / 2, s / 2, s * 0.4, 'rgba(60,4,6,0.9)'); for (let i = 0; i < 12; i++) blot(s * rng.next(), s * rng.next(), s * 0.05, 'rgba(70,6,8,0.8)'); });
  cell(2, () => { g.strokeStyle = 'rgba(64,5,7,0.85)'; g.lineCap = 'round'; for (let k = 0; k < 3; k++) { g.lineWidth = s * (0.06 + 0.02 * k); g.beginPath(); g.moveTo(0, s * (0.35 + 0.12 * k)); g.bezierCurveTo(s * 0.4, s * (0.2 + 0.15 * k), s * 0.6, s * (0.6 + 0.05 * k), s, s * (0.4 + 0.1 * k)); g.stroke(); } });
  cell(3, () => { g.fillStyle = 'rgba(78,8,10,0.88)'; g.beginPath(); g.ellipse(s / 2, s * 0.62, s * 0.2, s * 0.24, 0, 0, 6.3); g.fill(); for (let i = 0; i < 5; i++) { const a = -2.2 + i * 0.45; g.save(); g.translate(s / 2 + Math.cos(a) * s * 0.14, s * 0.46 + Math.sin(a) * s * 0.1 - (i === 0 || i === 4 ? 0 : s * 0.08)); g.rotate(a + 1.57); g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.045, s * 0.14, 0, 0, 6.3); g.fill(); g.restore(); } for (let i = 0; i < 6; i++) blot(s * (0.35 + rng.next() * 0.3), s * (0.85 + rng.next() * 0.15), s * 0.03, 'rgba(78,8,10,0.7)'); });
  cell(4, () => { g.strokeStyle = 'rgba(12,10,12,0.85)'; g.lineCap = 'round'; for (let k = 0; k < 4; k++) { g.lineWidth = s * 0.028; g.beginPath(); g.moveTo(s * (0.25 + k * 0.14), s * 0.08); g.quadraticCurveTo(s * (0.3 + k * 0.14), s * 0.5, s * (0.2 + k * 0.15), s * 0.95); g.stroke(); g.strokeStyle = 'rgba(210,205,200,0.18)'; g.lineWidth = s * 0.008; g.beginPath(); g.moveTo(s * (0.26 + k * 0.14), s * 0.1); g.quadraticCurveTo(s * (0.31 + k * 0.14), s * 0.5, s * (0.21 + k * 0.15), s * 0.93); g.stroke(); g.strokeStyle = 'rgba(12,10,12,0.85)'; } });
  cell(5, () => { for (let i = 0; i < 30; i++) blot(s / 2 + (rng.next() - 0.5) * s * 0.6, s / 2 + (rng.next() - 0.5) * s * 0.6, s * (0.04 + rng.next() * 0.16), `rgba(8,7,8,${0.12 + rng.next() * 0.2})`); });
  cell(6, () => { g.strokeStyle = 'rgba(25,40,45,0.5)'; g.lineWidth = s * 0.06; for (let k = 0; k < 5; k++) { g.globalAlpha = 0.35; g.beginPath(); g.moveTo(s * (0.15 + k * 0.17), 0); g.lineTo(s * (0.15 + k * 0.17 + (rng.next() - 0.5) * 0.06), s * (0.5 + rng.next() * 0.5)); g.stroke(); } g.globalAlpha = 1; blot(s / 2, s * 0.9, s * 0.2, 'rgba(25,40,45,0.35)'); });
  cell(7, () => { g.fillStyle = '#e0b020'; g.beginPath(); g.moveTo(s / 2, s * 0.1); g.lineTo(s * 0.92, s * 0.85); g.lineTo(s * 0.08, s * 0.85); g.closePath(); g.fill(); g.strokeStyle = '#111'; g.lineWidth = s * 0.05; g.stroke(); g.fillStyle = '#111'; g.font = `bold ${s * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', s / 2, s * 0.58); });
  cell(8, () => { g.fillStyle = '#1b1a1f'; g.fillRect(s * 0.05, s * 0.25, s * 0.9, s * 0.5); g.strokeStyle = '#d98324'; g.lineWidth = s * 0.02; g.strokeRect(s * 0.07, s * 0.27, s * 0.86, s * 0.46); g.fillStyle = '#e8b050'; g.font = `${s * 0.14}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SILENCE', s / 2, s * 0.42); g.fillText('SAVES LIVES', s / 2, s * 0.6); });
  cell(9, () => { g.fillStyle = '#d6ccb0'; g.fillRect(s * 0.15, s * 0.05, s * 0.7, s * 0.9); g.fillStyle = '#7a1e1e'; g.fillRect(s * 0.2, s * 0.1, s * 0.6, s * 0.3); g.fillStyle = '#222'; g.font = `bold ${s * 0.12}px monospace`; g.textAlign = 'center'; g.fillText('MISSING', s / 2, s * 0.55); g.font = `${s * 0.07}px monospace`; g.fillText('CAPT. I. VOSS', s / 2, s * 0.68); g.fillText('LAST SEEN: REACTOR', s / 2, s * 0.78); });
  for (let k = 0; k < 3; k++) cell(10 + k, () => { g.fillStyle = '#d8d0b2'; g.save(); g.translate(s / 2, s / 2); g.rotate((k - 1) * 0.12); g.fillRect(-s * 0.4, -s * 0.46, s * 0.8, s * 0.92); g.fillStyle = '#2a2420'; g.font = `${s * 0.068}px monospace`; g.textAlign = 'left'; g.textBaseline = 'top'; const words = notes[(k * 2 + 1) % notes.length].split(' '); let line = '', y = -s * 0.4; for (const w of words) { if ((line + w).length > 22) { g.fillText(line, -s * 0.34, y); y += s * 0.09; line = ''; } line += w + ' '; } g.fillText(line, -s * 0.34, y); g.restore(); });
  cell(13, () => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45); gr.addColorStop(0, 'rgba(20,30,40,0.55)'); gr.addColorStop(1, 'rgba(20,30,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  cell(14, () => { g.fillStyle = '#16301e'; g.fillRect(s * 0.05, s * 0.3, s * 0.9, s * 0.4); g.fillStyle = '#58ff98'; g.font = `bold ${s * 0.16}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PODS', s / 2, s * 0.5); });
  cell(15, () => { g.strokeStyle = '#b3a020'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, 6.3); g.stroke(); g.fillStyle = '#b3a020'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s / 2 + Math.cos(i * 2.09) * s * 0.17, s / 2 + Math.sin(i * 2.09) * s * 0.17, s * 0.1, 0, 6.3); g.fill(); } });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  t.uv = (i) => [(i % 4) / 4 + 0.002, 1 - (Math.floor(i / 4) + 1) / 4 + 0.002, (i % 4 + 1) / 4 - 0.002, 1 - Math.floor(i / 4) / 4 - 0.002];
  return t;
}

export const SIGN_NAMES = ['Medbay', 'Comms', 'Lab', 'Reactor', 'Cargo', 'Storage', 'Quarters', 'Pod Bay', 'Mess', 'Engineering'];
function signAtlas(renderer) {
  const cw = 512, ch = 128, c = cv(cw * 2, ch * 5), g = c.getContext('2d'); const e = cv(cw * 2, ch * 5), ge = e.getContext('2d');
  SIGN_NAMES.forEach((n, i) => {
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    g.fillStyle = '#1d1b22'; g.fillRect(x, y, cw, ch); g.strokeStyle = '#d98324'; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    ge.fillStyle = '#000'; ge.fillRect(x, y, cw, ch);
    for (const [ctx, col] of [[g, '#ffb55a'], [ge, '#a85a14']]) { ctx.fillStyle = col; ctx.font = `${n.length > 7 ? 56 : 70}px Silkscreen, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.toUpperCase(), x + cw / 2, y + ch / 2 + 4); }
  });
  const mk = (cc, srgb) => { const t = new THREE.CanvasTexture(cc); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const t = { map: mk(c, true), emissiveMap: mk(e, true) };
  t.uv = (name) => { const i = Math.max(0, SIGN_NAMES.indexOf(name)); const col = i % 2, row = Math.floor(i / 2); return [col / 2 + 0.004, 1 - (row + 1) / 5 + 0.004, (col + 1) / 2 - 0.004, 1 - row / 5 - 0.004]; };
  return t;
}

export function buildTextures(renderer, texScale, notes) {
  const S = texScale;
  return { walls: wallAtlas(renderer, S), floor: floorAtlas(renderer, S), ...tilingSets(renderer, S), decals: decalAtlas(renderer, S, notes), signs: signAtlas(renderer) };
}

// Screen texture helper for terminals (dynamic scrolling text)
export function makeScreen(w = 256, h = 192) {
  const c = cv(w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { canvas: c, ctx: c.getContext('2d'), tex: t };
}
export function makeLabelTexture(text, { w = 256, h = 64, bg = '#1b1a20', fg = '#ffb55a', font = 'bold 34px Silkscreen, monospace', border = null } = {}) {
  const c = cv(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
