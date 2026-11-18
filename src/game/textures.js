// Procedural PBR texture sets (albedo / normal / ORM / emissive), generated on canvas at load time.
// ORM packing (glTF style): R = ambient occlusion, G = roughness, B = metalness.
// Upgraded for Halcyon Deep offshore oil rig: salt-stained steel, calm panel dominance (70/25/5 mix),
// rain-streaked surfaces, and full room sign atlas for all 17 oil rig room types.
import * as THREE from 'three';
import { RNG } from './rng.js';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const gray = (v) => { v = Math.max(0, Math.min(255, v | 0)); return `rgb(${v},${v},${v})`; };

class PBR {
  constructor(w, h, { base = '#46525e', rough = 0.65, metal = 0.0, seed = 1 } = {}) {
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
  grad(x, y, w, h, horizontal, stops, o) {
    for (const k of ['c', 'h']) {
      if (o[k] === undefined) continue;
      const c = this.ctx[k]; c.save(); if (this.clip) { c.beginPath(); c.rect(...this.clip); c.clip(); } c.translate(this.ox, this.oy);
      const g = horizontal ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
      for (const [t, col, hv] of stops) g.addColorStop(t, k === 'c' ? col : gray(hv));
      c.fillStyle = g; c.fillRect(x, y, w, h); c.restore();
    }
  }
  grunge(x, y, w, h, { rust = 0.5, dirt = 0.5, scratches = 10, speckle = 0.8, wetStreaks = true } = {}) {
    const r = this.rng;
    for (let i = 0; i < 10 * dirt; i++) {
      const bx = x + r.next() * w, by = y + r.next() * h, br = (0.05 + r.next() * 0.18) * Math.min(w, h);
      this.paint({ c: `rgba(10,14,18,${0.05 + r.next() * 0.11})`, r: 0.85, a: 1 }, (c, k) => {
        if (k !== 'c' && k !== 'o') return;
        const g = c.createRadialGradient(bx, by, 0, bx, by, br); const col = k === 'c' ? '10,14,18' : '255,210,0';
        g.addColorStop(0, `rgba(${col},0.32)`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(bx - br, by - br, br * 2, br * 2);
      });
    }
    // Salt and rust streaks running down + wet low-roughness vertical tracks
    for (let i = 0; i < 14 * rust; i++) {
      const sx = x + r.next() * w, sy = y + r.next() * h * 0.65, sl = 24 + r.next() * h * 0.42, sw = 1 + r.next() * 4;
      const isSalt = r.chance(0.28);
      const col = isSalt ? '210,220,228' : r.chance(0.65) ? '118,58,24' : '24,30,36';
      this.paint({ c: 'rgba(0,0,0,0)', a: 1 }, (c, k) => {
        if (k === 'c') {
          const g = c.createLinearGradient(0, sy, 0, sy + sl);
          g.addColorStop(0, `rgba(${col},0.0)`);
          g.addColorStop(0.18, `rgba(${col},${isSalt ? 0.18 : 0.28})`);
          g.addColorStop(1, `rgba(${col},0)`);
          c.fillStyle = g; c.fillRect(sx, sy, sw, sl);
        } else if (k === 'o' && wetStreaks) {
          c.fillStyle = 'rgb(255,75,200)';
          c.globalAlpha = 0.35;
          c.fillRect(sx, sy, sw, sl);
        }
      });
    }
    for (let i = 0; i < scratches; i++) {
      const sx = x + r.next() * w, sy = y + r.next() * h, a = r.next() * 6.28, l = 6 + r.next() * 26;
      this.line(sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, 0.8, { c: 'rgba(195,205,215,0.3)', h: 95, a: 0.55 });
    }
    const n = ((w * h) / 45) * speckle;
    const cc = this.ctx.c, ch = this.ctx.h;
    for (let i = 0; i < n; i++) {
      const px = x + r.next() * w, py = y + r.next() * h, v = r.next();
      cc.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.07 + r.next() * 0.08})` : `rgba(230,240,250,${0.025 + r.next() * 0.04})`;
      cc.fillRect(px, py, 1, 1);
      if (i % 3 === 0) { ch.fillStyle = gray(112 + r.next() * 36); ch.globalAlpha = 0.35; ch.fillRect(px, py, 1, 1); ch.globalAlpha = 1; }
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
    return { map: mk(this.cvs.c, true), normalMap: mk(nc, false), orm: mk(this.cvs.o, false), emissiveMap: mk(this.cvs.e, srgbEmissive), canvas: this.cvs.c };
  }
}

// -------- wall panel atlas (8 designs: 0,1 = calm painted steel [70%]; 2..6 = accent [25%]; 7 = heavy pipe manifold [5%]) --------
export const WALL_DESIGNS = ['plain', 'striped', 'hazard', 'monitor', 'funnel', 'diagonal', 'vent', 'pipes'];
function wallAtlas(renderer, S) {
  const cw = Math.round(384 * S), ch = Math.round(576 * S), cols = 4, rows = 2, M = cw / 2;
  const pb = new PBR(cw * cols, ch * rows, { base: '#46525e', rough: 0.48, metal: 0.62, seed: 11 });
  const base = (i, col) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch; pb.cell(ox, oy, cw, ch);
    pb.rect(0, 0, cw, ch, { c: col, h: 128, r: 0.46, m: 0.62 });
    // Calm offshore steel panel seams + subtle rivets
    for (const y of [ch / 3, (2 * ch) / 3]) {
      pb.rect(0, y - 1.5, cw, 3, { c: '#182028', h: 48, r: 0.85, ao: 0.45 });
      for (let x = 0.18 * M; x < cw; x += 0.36 * M) pb.circle(x, y - 6, 0.024 * M, { c: '#7a8896', h: 220, r: 0.38, m: 0.88 });
    }
    pb.rect(cw / 2 - 1.5, 0, 3, ch, { c: '#182028', h: 52, r: 0.85, ao: 0.5 });
    pb.rect(0, ch - 0.26 * M, cw, 0.26 * M, { c: '#1e262e', h: 155, r: 0.6, m: 0.65 }); // baseboard
    pb.rect(0, ch - 0.26 * M - 2, cw, 3, { c: '#7c8a98', h: 195, r: 0.38, m: 0.8 });
    pb.rect(0, 0, cw, 0.1 * M, { c: '#1b222a', h: 165, r: 0.55, m: 0.65 }); // top trim
  };
  const done = (rust = 0.75) => pb.grunge(pb.clip[0], pb.clip[1], cw, ch, { rust, dirt: 0.85, scratches: 14, wetStreaks: true });

  // 0: Calm Panel A - plain painted offshore blue-grey steel with subtle safety yellow datum line
  base(0, '#495664');
  pb.rect(0, ch * 0.54, cw, 0.045 * M, { c: '#d89b20', h: 134, r: 0.65 });
  pb.text('SEC-04', cw * 0.5, ch * 0.49, `bold ${0.22 * M}px Silkscreen, monospace`, { c: 'rgba(220,230,240,0.45)', h: 132, r: 0.8 }, 'center');
  done(0.65);

  // 1: Calm Panel B - plain steel with muted sea-green band (calm, uncluttered)
  base(1, '#4d5a66');
  pb.rect(0, ch * 0.46, cw, 0.22 * M, { c: '#2d4b52', h: 132, r: 0.48, m: 0.45 });
  pb.rect(0, ch * 0.46 + 0.22 * M, cw, 0.04 * M, { c: '#d86a20', h: 134, r: 0.5 });
  done(0.65);

  // 2: Accent - Safety yellow & black hazard band + caged bulkhead lamp
  base(2, '#475360');
  const hy = ch * 0.56;
  pb.rect(0, hy, cw, ch - hy - 0.26 * M, { c: '#181c20', h: 120, r: 0.55, m: 0.4 });
  for (let x = -ch; x < cw + ch; x += 0.42 * M) {
    pb.poly([[x, ch - 0.26 * M], [x + 0.21 * M, ch - 0.26 * M], [x + 0.21 * M + (ch - hy), hy], [x + (ch - hy), hy]], { c: '#e2a018', h: 135, r: 0.5, m: 0.2 });
  }
  const lx = cw / 2, ly = ch * 0.22;
  pb.circle(lx, ly, 0.28 * M, { c: '#1c2228', h: 190, r: 0.4, m: 0.8 });
  pb.circle(lx, ly, 0.18 * M, { c: '#ffbe58', h: 150, r: 0.2, e: '#ff8818' });
  for (let i = -2; i <= 2; i++) pb.line(lx + i * 0.07 * M, ly - 0.2 * M, lx + i * 0.07 * M, ly + 0.2 * M, 2, { c: '#181c22', h: 220, m: 0.8, r: 0.5 });
  done(0.8);

  // 3: Accent - Rig telemetry & CCTV monitor panel
  base(3, '#36404a');
  const txts = ['BOP SEAL OK', 'WAVE 18.4M', 'WIND 62 KT', 'GEN BUS 2', 'CH 16 HOLD', 'CREW: 4', 'BILGE HIGH', 'HELIDECK'];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const mx = cw * (0.1 + c * 0.46), my = ch * (0.12 + r * 0.2), mw = cw * 0.38, mh = ch * 0.17; const dead = (r + c) === 3;
    pb.rect(mx - 4, my - 4, mw + 8, mh + 8, { c: '#151a20', h: 190, r: 0.4, m: 0.7 });
    pb.rect(mx, my, mw, mh, { c: dead ? '#050709' : '#061e26', h: 110, r: 0.15, e: dead ? '#020406' : '#08242e' });
    if (!dead) for (let i = 0; i < 5; i++) pb.text(txts[(r * 4 + c * 2 + i) % 8], mx + 6, my + 8 + i * (mh / 5.4), `${Math.max(6, 0.1 * M)}px monospace`, { c: '#58e4ff', h: 118, e: i === 0 ? '#78f0ff' : '#2898b8' });
    else pb.line(mx, my, mx + mw, my + mh, 2, { c: '#223', h: 100 });
  }
  pb.rect(cw * 0.1, ch * 0.62, cw * 0.84, 0.12 * M, { c: '#161c22', h: 190, m: 0.8 });
  for (let i = 0; i < 7; i++) pb.circle(cw * 0.15 + i * 0.22 * M, ch * 0.62 + 0.06 * M, 0.025 * M, { c: i % 3 ? '#38e06a' : '#ff3a2a', e: i % 3 ? '#20c050' : '#e02010' });
  done(0.6);

  // 4: Accent - Cable tray & stenciled bulkhead panel
  base(4, '#4e5b68');
  pb.rect(cw * 0.14, ch * 0.14, cw * 0.72, ch * 0.56, { c: '#3d4854', h: 114, r: 0.55, m: 0.55 });
  pb.text('HALCYON DEEP', cw / 2, ch * 0.76, `${0.18 * M}px Silkscreen, monospace`, { c: '#e09a24', h: 140 }, 'center');
  done(0.75);

  // 5: Accent - Safety yellow brace & stencil
  base(5, '#4c5866');
  pb.poly([[0, ch * 0.85], [0, ch * 0.3], [cw, ch * 0.7], [cw, ch * 0.85]], { c: '#3a4450', h: 118, r: 0.58, m: 0.55 });
  pb.paint({ c: '#e09a1c', h: 150, r: 0.5 }, (c) => { c.lineWidth = 0.08 * M; c.setLineDash([0.16 * M, 0.12 * M]); c.beginPath(); c.moveTo(0, ch * 0.3); c.lineTo(cw, ch * 0.7); c.stroke(); });
  done(0.8);

  // 6: Accent - Offshore ventilation grille
  base(6, '#485462');
  const vx = cw * 0.16, vy = ch * 0.18, vw = cw * 0.68, vh = ch * 0.38;
  pb.rect(vx - 6, vy - 6, vw + 12, vh + 12, { c: '#202830', h: 200, r: 0.45, m: 0.8 });
  pb.rect(vx, vy, vw, vh, { c: '#050709', h: 40, r: 0.9, ao: 0.1 });
  for (let y = vy + 4; y < vy + vh - 4; y += 0.11 * M) pb.rect(vx + 3, y, vw - 6, 0.06 * M, { c: '#36424e', h: 215, r: 0.5, m: 0.7 });
  done(0.75);

  // 7: Heavy detail (5% mix, only in Pump & Engine rooms) - high-pressure pipe manifold
  base(7, '#3f4a56');
  const pipes = [[0.18, 0.09, '#884e2e'], [0.4, 0.07, '#52606e'], [0.62, 0.11, '#8c5430'], [0.85, 0.06, '#46585c']];
  for (const [px, pr, col] of pipes) {
    const x0 = px * cw - pr * cw, w = pr * cw * 2;
    pb.grad(x0, 0, w, ch, true, [[0, '#101214', 90], [0.3, col, 200], [0.55, col, 230], [1, '#0a0c0e', 80]], { c: 1, h: 1 });
    for (const fy of [0.12, 0.45, 0.78]) pb.rect(x0 - 5, fy * ch, w + 10, 0.1 * M, { c: '#222a32', h: 230, r: 0.5, m: 0.8 });
  }
  pb.circle(cw * 0.5, ch * 0.3, 0.2 * M, { c: '#b82820', h: 200, r: 0.5, m: 0.4 });
  done(1.0);

  pb.clip = null; pb.ox = pb.oy = 0;
  const t = pb.finish(renderer, { strength: 2.4 });
  t.cols = cols; t.rows = rows; t.cw = cw; t.ch = ch;
  t.uv = (i, inset = 0.004) => { const c = i % cols, r = Math.floor(i / cols); return [c / cols + inset, 1 - (r + 1) / rows + inset * 1.5, (c + 1) / cols - inset, 1 - r / rows - inset * 1.5]; };
  return t;
}

// -------- floor atlas 2x2: grating, tread plate, guide-line plates, concrete+hazard --------
function floorAtlas(renderer, S) {
  const s = Math.round(512 * S), pb = new PBR(s * 2, s * 2, { base: '#343c44', rough: 0.45, metal: 0.65, seed: 21 }), u = s / 2;
  const cellOf = (i) => pb.cell((i % 2) * s, Math.floor(i / 2) * s, s, s);
  // 0 grating
  cellOf(0); pb.rect(0, 0, s, s, { c: '#080b0e', h: 20, r: 0.85, ao: 0.1 });
  for (let k = 0; k < s; k += u / 8) { pb.rect(k, 0, u / 40, s, { c: '#4e5864', h: 235, r: 0.36, m: 0.85 }); pb.rect(0, k, s, u / 48, { c: '#444e5a', h: 225, r: 0.4, m: 0.85 }); }
  pb.rect(0, 0, s, u * 0.1, { c: '#343c46', h: 240, m: 0.8 }); pb.rect(0, s - u * 0.1, s, u * 0.1, { c: '#343c46', h: 240, m: 0.8 });
  pb.rect(0, s * 0.5 - u * 0.04, s, u * 0.08, { c: '#d8a41c', h: 200, r: 0.6, m: 0.2 }); pb.grunge(0, 0, s, s, { rust: 0.35, dirt: 0.6, scratches: 6, speckle: 0.5 });
  // 1 diamond tread
  cellOf(1); pb.rect(0, 0, s, s, { c: '#3e4852', h: 120, r: 0.42, m: 0.68 });
  for (let y = 0; y < s; y += u / 4) for (let x = 0; x < s; x += u / 4) { const o = (Math.round(y / (u / 4)) % 2) * u / 8; pb.poly([[x + o, y + u * 0.03], [x + o + u * 0.1, y + u * 0.125], [x + o, y + u * 0.22], [x + o - u * 0.1, y + u * 0.125]], { c: '#586470', h: 235, r: 0.32, m: 0.78 }); }
  pb.grunge(0, 0, s, s, { rust: 0.5, dirt: 1.1, scratches: 14, speckle: 0.6 });
  // 2 plates with guide lines
  cellOf(2); pb.rect(0, 0, s, s, { c: '#444e58', h: 128, r: 0.44, m: 0.65 });
  pb.rect(0, s / 2 - 2, s, 4, { c: '#14181e', h: 50, ao: 0.4 }); pb.rect(s / 2 - 2, 0, 4, s, { c: '#14181e', h: 50, ao: 0.4 });
  for (const [x, y] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]]) pb.circle(x * s, y * s, u * 0.04, { c: '#828e9c', h: 240, m: 0.9, r: 0.38 });
  pb.rect(0, u * 0.06, s, u * 0.1, { c: '#e0a61c', h: 135, r: 0.6 }); pb.rect(0, s - u * 0.16, s, u * 0.1, { c: '#e0a61c', h: 135, r: 0.6 });
  pb.grunge(0, 0, s, s, { rust: 0.6, dirt: 1.1, scratches: 14, speckle: 0.6 });
  // 3 nonslip deck + hazard edge
  cellOf(3); pb.rect(0, 0, s, s, { c: '#464a4e', h: 128, r: 0.78, m: 0.15 });
  for (let i = 0; i < 1800; i++) { const x = pb.rng.next() * s, y = pb.rng.next() * s; pb.circle(x, y, 0.6 + pb.rng.next() * 1.8, { c: pb.rng.chance(0.5) ? '#34383c' : '#5e6468', h: 90 + pb.rng.next() * 80, a: 0.5 }); }
  for (let x = -s; x < s * 2; x += u * 0.3) pb.poly([[x, 0], [x + u * 0.15, 0], [x + u * 0.15 + u * 0.2, u * 0.2], [x + u * 0.2, u * 0.2]], { c: '#e0981c', h: 140, r: 0.65 });
  pb.rect(0, u * 0.2, s, 3, { c: '#111', h: 80 }); pb.grunge(0, 0, s, s, { rust: 0.3, dirt: 1.4, scratches: 10, speckle: 0.3 });
  pb.clip = null; pb.ox = pb.oy = 0;
  const t = pb.finish(renderer, { strength: 3 });
  t.uv = (i, inset = 0.003) => { const c = i % 2, r = Math.floor(i / 2); return [c / 2 + inset, 1 - (r + 1) / 2 + inset, (c + 1) / 2 - inset, 1 - r / 2 - inset]; };
  return t;
}

function tilingSets(renderer, S) {
  const s = Math.round(512 * S), u = s / 2, out = {};
  let pb = new PBR(s, s, { base: '#343a42', rough: 0.82, metal: 0.2, seed: 31 });
  pb.rect(0, 0, s, s, { c: '#3a4048', h: 120, r: 0.84 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { pb.rect(i * u + 6, j * u + 6, u - 12, u - 12, { c: '#424852', h: 135, r: 0.85 }); }
  pb.rect(0, 0, s, 6, { c: '#181c22', h: 200, m: 0.7 }); pb.rect(0, u - 3, s, 6, { c: '#181c22', h: 200, m: 0.7 }); pb.rect(0, 0, 6, s, { c: '#181c22', h: 200, m: 0.7 }); pb.rect(u - 3, 0, 6, s, { c: '#181c22', h: 200, m: 0.7 });
  pb.grunge(0, 0, s, s, { rust: 0.4, dirt: 1.2, scratches: 4 }); out.ceiling = pb.finish(renderer, { tiling: true, strength: 2 });

  pb = new PBR(s, s, { base: '#b2bcc6', rough: 0.42, metal: 0.68, seed: 32 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { pb.rect(i * u + 3, j * u + 3, u - 6, u - 6, { c: '#b2bcc6', h: 135, r: 0.42, m: 0.68 }); for (let k = 0; k < 8; k++) { const a = (k / 8) * u; for (const [x, y] of [[a + u / 16, 14], [a + u / 16, u - 14], [14, a + u / 16], [u - 14, a + u / 16]]) pb.circle(i * u + x, j * u + y, 0.025 * u * 1.3, { c: '#dce4ec', h: 235, m: 0.9, r: 0.35 }); } }
  pb.rect(0, u - 2, s, 4, { c: '#1c2228', h: 40, ao: 0.4 }); pb.rect(u - 2, 0, 4, s, { c: '#1c2228', h: 40, ao: 0.4 });
  pb.grunge(0, 0, s, s, { rust: 0.7, dirt: 1, scratches: 22 }); out.plate = pb.finish(renderer, { tiling: true, strength: 2.4 });

  pb = new PBR(s, s, { base: '#6e4a34', rough: 0.78, metal: 0.55, seed: 33 });
  for (let i = 0; i < 700; i++) pb.circle(pb.rng.next() * s, pb.rng.next() * s, 1 + pb.rng.next() * 7, { c: pb.rng.chance(0.5) ? '#8c4c22' : '#3a281e', h: 80 + pb.rng.next() * 120, a: 0.45 });
  pb.rect(0, s * 0.48, s, 10, { c: '#262024', h: 230, m: 0.8, r: 0.5 });
  pb.grunge(0, 0, s, s, { rust: 1.5, dirt: 1.2, scratches: 10 }); out.rust = pb.finish(renderer, { tiling: true, strength: 3 });

  pb = new PBR(s, s, { base: '#545c48', rough: 0.68, metal: 0.38, seed: 34 });
  pb.rect(0, 0, s, s, { c: '#565e4a', h: 128, r: 0.62, m: 0.35 }); pb.strokeRect(10, 10, s - 20, s - 20, 22, { c: '#383e32', h: 200, m: 0.6, r: 0.6 });
  for (let k = 1; k < 5; k++) pb.rect(32, 32 + k * ((s - 64) / 5) - 1.5, s - 64, 3, { c: '#282c22', h: 60 });
  pb.line(32, 32, s - 32, s - 32, 14, { c: '#404638', h: 190, m: 0.5 }); pb.line(s - 32, 32, 32, s - 32, 14, { c: '#404638', h: 190, m: 0.5 });
  pb.text('HALCYON', s / 2, s * 0.5, `bold ${u * 0.28}px Silkscreen, monospace`, { c: 'rgba(235,155,30,0.85)', h: 140 }, 'center');
  pb.rect(s * 0.1, s * 0.82, s * 0.8, 10, { c: '#e09822', h: 140, r: 0.7 });
  pb.grunge(0, 0, s, s, { rust: 0.8, dirt: 1.2, scratches: 16 }); out.crate = pb.finish(renderer, { tiling: true, strength: 2.4 });

  pb = new PBR(s, s, { base: '#14161a', rough: 0.55, metal: 0.3, seed: 35 });
  for (let x = -s; x < s * 2; x += u * 0.5) pb.poly([[x, s], [x + u * 0.25, s], [x + u * 0.25 + s, 0], [x + s, 0]], { c: '#e49e1c', h: 135, r: 0.5 });
  pb.grunge(0, 0, s, s, { rust: 0.6, dirt: 1, scratches: 12 }); out.hazard = pb.finish(renderer, { tiling: true, strength: 2 });

  pb = new PBR(s, s, { base: '#484c50', rough: 0.92, metal: 0, seed: 36 });
  for (let i = 0; i < 2200; i++) pb.circle(pb.rng.next() * s, pb.rng.next() * s, 0.6 + pb.rng.next() * 2.2, { c: pb.rng.chance(0.5) ? '#363a3e' : '#64686c', h: 80 + pb.rng.next() * 100, a: 0.5 });
  pb.grunge(0, 0, s, s, { rust: 0.3, dirt: 2, scratches: 8 }); out.concrete = pb.finish(renderer, { tiling: true, strength: 3 });
  return out;
}

// -------- decals (color + alpha only) --------
export const DECAL = { blood: 0, pool: 1, drag: 2, hand: 3, claw: 4, scorch: 5, stain: 6, warn: 7, silence: 8, poster: 9, note0: 10, note1: 11, note2: 12, puddle: 13, exit: 14, bio: 15 };
function decalAtlas(renderer, S, notes) {
  const s = Math.round(256 * S), c = cv(s * 4, s * 4), g = c.getContext('2d'); const rng = new RNG(77);
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * s, Math.floor(i / 4) * s); g.beginPath(); g.rect(0, 0, s, s); g.clip(); fn(); g.restore(); };
  const blot = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(0.7, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); };
  cell(0, () => { for (let i = 0; i < 10; i++) blot(s * (0.15 + i * 0.07), s * (0.2 + 0.5 * Math.abs(Math.sin(i))), s * (0.05 + rng.next() * 0.07), 'rgba(70,6,8,0.85)'); });
  cell(1, () => { blot(s / 2, s / 2, s * 0.4, 'rgba(20,38,48,0.85)'); });
  cell(2, () => { g.strokeStyle = 'rgba(30,45,55,0.8)'; g.lineCap = 'round'; for (let k = 0; k < 3; k++) { g.lineWidth = s * (0.06 + 0.02 * k); g.beginPath(); g.moveTo(0, s * (0.35 + 0.12 * k)); g.bezierCurveTo(s * 0.4, s * (0.2 + 0.15 * k), s * 0.6, s * (0.6 + 0.05 * k), s, s * (0.4 + 0.1 * k)); g.stroke(); } });
  cell(3, () => { g.fillStyle = 'rgba(180,195,205,0.55)'; g.beginPath(); g.ellipse(s / 2, s * 0.62, s * 0.2, s * 0.24, 0, 0, 6.3); g.fill(); });
  cell(4, () => { g.strokeStyle = 'rgba(12,10,12,0.85)'; g.lineCap = 'round'; for (let k = 0; k < 4; k++) { g.lineWidth = s * 0.028; g.beginPath(); g.moveTo(s * (0.25 + k * 0.14), s * 0.08); g.quadraticCurveTo(s * (0.3 + k * 0.14), s * 0.5, s * (0.2 + k * 0.15), s * 0.95); g.stroke(); } });
  cell(5, () => { for (let i = 0; i < 30; i++) blot(s / 2 + (rng.next() - 0.5) * s * 0.6, s / 2 + (rng.next() - 0.5) * s * 0.6, s * (0.04 + rng.next() * 0.16), `rgba(8,10,12,${0.12 + rng.next() * 0.2})`); });
  cell(6, () => { g.strokeStyle = 'rgba(25,45,55,0.55)'; g.lineWidth = s * 0.06; for (let k = 0; k < 5; k++) { g.globalAlpha = 0.35; g.beginPath(); g.moveTo(s * (0.15 + k * 0.17), 0); g.lineTo(s * (0.15 + k * 0.17 + (rng.next() - 0.5) * 0.06), s * (0.5 + rng.next() * 0.5)); g.stroke(); } g.globalAlpha = 1; blot(s / 2, s * 0.9, s * 0.2, 'rgba(25,45,55,0.35)'); });
  cell(7, () => { g.fillStyle = '#e0b020'; g.beginPath(); g.moveTo(s / 2, s * 0.1); g.lineTo(s * 0.92, s * 0.85); g.lineTo(s * 0.08, s * 0.85); g.closePath(); g.fill(); g.strokeStyle = '#111'; g.lineWidth = s * 0.05; g.stroke(); g.fillStyle = '#111'; g.font = `bold ${s * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', s / 2, s * 0.58); });
  cell(8, () => { g.fillStyle = '#182028'; g.fillRect(s * 0.05, s * 0.25, s * 0.9, s * 0.5); g.strokeStyle = '#e09a24'; g.lineWidth = s * 0.02; g.strokeRect(s * 0.07, s * 0.27, s * 0.86, s * 0.46); g.fillStyle = '#ffd060'; g.font = `${s * 0.13}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AVOID GAZE', s / 2, s * 0.42); g.fillText('LOOK DOWN', s / 2, s * 0.6); });
  cell(9, () => { g.fillStyle = '#d6ccb0'; g.fillRect(s * 0.15, s * 0.05, s * 0.7, s * 0.9); g.fillStyle = '#1e4a6a'; g.fillRect(s * 0.2, s * 0.1, s * 0.6, s * 0.3); g.fillStyle = '#222'; g.font = `bold ${s * 0.11}px monospace`; g.textAlign = 'center'; g.fillText('DIVER MISSING', s / 2, s * 0.55); g.font = `${s * 0.07}px monospace`; g.fillText('ELI VANCE', s / 2, s * 0.68); g.fillText('MOON POOL // DAY 11', s / 2, s * 0.78); });
  for (let k = 0; k < 3; k++) cell(10 + k, () => { g.fillStyle = '#d8d0b2'; g.save(); g.translate(s / 2, s / 2); g.rotate((k - 1) * 0.12); g.fillRect(-s * 0.4, -s * 0.46, s * 0.8, s * 0.92); g.fillStyle = '#2a2420'; g.font = `${s * 0.068}px monospace`; g.textAlign = 'left'; g.textBaseline = 'top'; const words = notes[(k * 2 + 1) % notes.length].split(' '); let line = '', y = -s * 0.4; for (const w of words) { if ((line + w).length > 22) { g.fillText(line, -s * 0.34, y); y += s * 0.09; line = ''; } line += w + ' '; } g.fillText(line, -s * 0.34, y); g.restore(); });
  cell(13, () => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45); gr.addColorStop(0, 'rgba(18,34,48,0.68)'); gr.addColorStop(1, 'rgba(18,34,48,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  cell(14, () => { g.fillStyle = '#143020'; g.fillRect(s * 0.05, s * 0.3, s * 0.9, s * 0.4); g.fillStyle = '#58ff98'; g.font = `bold ${s * 0.14}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TO HELIDECK ->', s / 2, s * 0.5); });
  cell(15, () => { g.strokeStyle = '#e09820'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, 6.3); g.stroke(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  t.uv = (i) => [(i % 4) / 4 + 0.002, 1 - (Math.floor(i / 4) + 1) / 4 + 0.002, (i % 4 + 1) / 4 - 0.002, 1 - Math.floor(i / 4) / 4 - 0.002];
  return t;
}

export const SIGN_NAMES = [
  'Crew Quarters', 'Mess & Galley', 'Locker & Shower', 'Medical Bay',
  'Control Room', 'Radio Room', 'Geolab', 'Platform Office',
  'Engine & Generator', 'Pump Room', 'Switchgear Room', 'Machine Workshop',
  'Cold Storage', 'Deck Storage', 'Pipe Deck', 'Moon Pool',
  'Lifeboat Station', 'Helideck Vestibule', 'Helideck', 'Deck Corridor',
];
function signAtlas(renderer) {
  const cols = 2, rows = Math.ceil(SIGN_NAMES.length / cols);
  const cw = 512, ch = 112, c = cv(cw * cols, ch * rows), g = c.getContext('2d');
  const e = cv(cw * cols, ch * rows), ge = e.getContext('2d');
  SIGN_NAMES.forEach((n, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.fillStyle = '#161e26'; g.fillRect(x, y, cw, ch);
    g.strokeStyle = '#e09b24'; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    ge.fillStyle = '#000'; ge.fillRect(x, y, cw, ch);
    const fs = n.length > 14 ? 36 : n.length > 10 ? 44 : 56;
    for (const [ctx, col] of [[g, '#ffd068'], [ge, '#a86414']]) {
      ctx.fillStyle = col;
      ctx.font = `bold ${fs}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.toUpperCase(), x + cw / 2, y + ch / 2 + 2);
    }
  });
  const mk = (cc, srgb) => { const t = new THREE.CanvasTexture(cc); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const t = { map: mk(c, true), emissiveMap: mk(e, true) };
  t.uv = (name) => {
    let i = SIGN_NAMES.indexOf(name);
    if (i < 0) i = 0;
    const col = i % cols, row = Math.floor(i / cols);
    return [col / cols + 0.004, 1 - (row + 1) / rows + 0.004, (col + 1) / cols - 0.004, 1 - row / rows - 0.004];
  };
  return t;
}

export function buildTextures(renderer, texScale, notes) {
  const S = texScale;
  return { walls: wallAtlas(renderer, S), floor: floorAtlas(renderer, S), ...tilingSets(renderer, S), decals: decalAtlas(renderer, S, notes), signs: signAtlas(renderer) };
}

export function makeScreen(w = 256, h = 192) {
  const c = cv(w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { canvas: c, ctx: c.getContext('2d'), tex: t };
}
export function makeLabelTexture(text, { w = 256, h = 64, bg = '#1b1a20', fg = '#ffb55a', font = 'bold 34px Silkscreen, monospace', border = null } = {}) {
  const c = cv(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
