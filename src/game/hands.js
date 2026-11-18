// First-person gloved hands + held items (flashlight left, item right). Rendered in their own scene to avoid wall clipping.
import * as THREE from 'three';
import { makeLabelTexture } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
function tex(canvasFn, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); canvasFn(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export class Hands {
  constructor() {
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(58, 1, 0.01, 5);
    this.hemi = new THREE.HemisphereLight(0x9aa0c0, 0x2a2024, 0.9); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe2c0, 1.4); this.key.position.set(-0.4, 1, 1); this.scene.add(this.key);
    this.lampLight = new THREE.PointLight(0xfff0d0, 0.5, 1.6, 1.5); this.lampLight.position.set(-0.2, -0.15, -0.9); this.scene.add(this.lampLight);
    this.mats = {
      glove: new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.75, metalness: 0.05 }),
      pad: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }),
      sleeve: new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.95 }),
      cuff: new THREE.MeshStandardMaterial({ color: 0xd98324, roughness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x4a4854, roughness: 0.35, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.5, metalness: 0.4 }),
    };
    this.left = this.makeArm(-1); this.right = this.makeArm(1);
    this.scene.add(this.left.root, this.right.root);
    this.flash = this.makeFlashlight(); this.left.holder.add(this.flash.g);
    this.items = { scanner: this.makeScanner(), decoy: this.makeDecoy(), blue: this.makeCard('BLUE CARD', 0x2a62d8), red: this.makeCard('RED CARD', 0xd02828) };
    for (const k in this.items) { this.right.holder.add(this.items[k].g); this.items[k].g.visible = false; }
    this.cur = 'scanner'; this.items.scanner.g.visible = true; this.target = 'scanner';
    this.raise = 1; this.swapPhase = 0; this.useT = 1; this.useKind = null; this.lampT = 0; this.bobT = 0; this.runBlend = 0; this.t = 0; this.flickerK = 1; this.on = true; this.nudge = 0;
    this.radarActive = false; this.onRelease = null; this.released = true; this.curlL = 1; this.curlR = 1;
    this.setPose(this.left, 'grip'); this.setPose(this.right, 'grip');
  }
  makeArm(side) {
    const M = this.mats, root = new THREE.Group(), arm = new THREE.Group(); root.add(arm);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.068, 0.75, 14), M.sleeve); sl.rotation.x = Math.PI / 2; sl.position.z = 0.4; arm.add(sl);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.06, 14), M.cuff); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.02; arm.add(cuff);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), M.glove); gl.rotation.x = Math.PI / 2; gl.position.z = -0.03; arm.add(gl);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.036, 0.095), M.glove); palm.position.set(0, 0, -0.105); arm.add(palm);
    const knuck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.03), M.pad); knuck.position.set(0, 0.02, -0.13); arm.add(knuck);
    const fingers = [];
    const mkFinger = (x, z, len, thick, ang = 0) => {
      const p1 = new THREE.Group(); p1.position.set(x, 0, z); p1.rotation.y = ang; arm.add(p1);
      const m1 = new THREE.Mesh(new THREE.CapsuleGeometry(thick, len * 0.5, 3, 6), M.glove); m1.rotation.x = Math.PI / 2; m1.position.z = -len * 0.3; p1.add(m1);
      const p2 = new THREE.Group(); p2.position.z = -len * 0.6; p1.add(p2);
      const m2 = new THREE.Mesh(new THREE.CapsuleGeometry(thick * 0.92, len * 0.4, 3, 6), M.glove); m2.rotation.x = Math.PI / 2; m2.position.z = -len * 0.22; p2.add(m2);
      const p3 = new THREE.Group(); p3.position.z = -len * 0.46; p2.add(p3);
      const m3 = new THREE.Mesh(new THREE.CapsuleGeometry(thick * 0.85, len * 0.25, 3, 6), M.glove); m3.rotation.x = Math.PI / 2; m3.position.z = -len * 0.14; p3.add(m3);
      fingers.push({ p1, p2, p3 }); return fingers.length - 1;
    };
    for (let i = 0; i < 4; i++) mkFinger(-0.033 + i * 0.022, -0.15, 0.075 - (i === 3 ? 0.012 : i === 0 ? 0.006 : 0), 0.0105);
    const thumb = mkFinger(side * -0.05, -0.1, 0.07, 0.0115, side * 0.9); // thumb
    const holder = new THREE.Group(); holder.position.set(0, 0.02, -0.1); arm.add(holder);
    return { root, arm, fingers, holder, side, thumb };
  }
  setPose(a, pose, k = 1) {
    const cur = { grip: [-1.15, -1.45, -0.9], open: [-0.25, -0.35, -0.2], pinch: [-0.55, -0.7, -0.5], point: [-0.1, -0.1, -0.1], fist: [-1.45, -1.6, -1.0] }[pose];
    a.fingers.forEach((f, i) => { const th = i === a.thumb ? 0.55 : 1; const s = k * (1 - i * 0.04); f.p1.rotation.x = cur[0] * s * th; f.p2.rotation.x = cur[1] * s * th; f.p3.rotation.x = cur[2] * s * th; });
    if (pose === 'pinch') { const t = a.fingers[a.thumb]; t.p1.rotation.x = -0.35; t.p2.rotation.x = -0.4; }
  }
  makeFlashlight() {
    const g = new THREE.Group(), M = this.mats;
    const label = tex((c, w, h) => { c.fillStyle = '#d98324'; c.fillRect(0, 0, w, h); c.fillStyle = '#16151a'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6); c.font = `bold ${h * 0.52}px Silkscreen, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#16151a'; c.fillText('FLASHLIGHT', w / 2, h / 2 + 3); }, 512, 64);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 20), [new THREE.MeshStandardMaterial({ map: label, roughness: 0.5, metalness: 0.3 }), M.metal, M.metal]);
    body.rotation.x = Math.PI / 2; body.rotation.y = -Math.PI * 0.5; body.position.z = -0.04; g.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.036, 0.075, 20), M.metal); head.rotation.x = Math.PI / 2; head.position.z = -0.165; g.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 6, 20), M.dark); ring.position.z = -0.203; g.add(ring);
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff0d0, emissiveIntensity: 4, roughness: 0.1 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.047, 20), this.lensMat); lens.position.z = -0.2045; lens.rotation.y = Math.PI; g.add(lens);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.03), M.cuff); sw.position.set(0, 0.04, -0.03); g.add(sw);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.03, 16), M.dark); tail.rotation.x = Math.PI / 2; tail.position.z = 0.055; g.add(tail);
    g.position.set(0.0, 0.04, -0.02); g.rotation.set(0.0, 0, 0);
    return { g, lens };
  }
  makeScanner() {
    const g = new THREE.Group(), M = this.mats;
    this.radarCanvas = document.createElement('canvas'); this.radarCanvas.width = this.radarCanvas.height = 128; this.radarCtx = this.radarCanvas.getContext('2d');
    this.radarTex = new THREE.CanvasTexture(this.radarCanvas); this.radarTex.colorSpace = THREE.SRGBColorSpace; this.drawRadar(null, 0);
    const bodyLabel = makeLabelTexture('SCANNER', { w: 256, h: 48, bg: '#d98324', fg: '#16151a', font: 'bold 32px Silkscreen, monospace' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.024, 0.2), new THREE.MeshStandardMaterial({ color: 0x4d4a58, roughness: 0.45, metalness: 0.6 })); g.add(body);
    this.scrMat = new THREE.MeshStandardMaterial({ color: 0x021008, emissive: 0xffffff, emissiveMap: this.radarTex, emissiveIntensity: 0.15, roughness: 0.2 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), this.scrMat); scr.rotation.x = -Math.PI / 2; scr.position.set(0, 0.0125, -0.025); g.add(scr);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.019), new THREE.MeshStandardMaterial({ map: bodyLabel, roughness: 0.6 })); lab.rotation.x = -Math.PI / 2; lab.position.set(0, 0.0125, 0.06); g.add(lab);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), M.metal); ant.position.set(0.045, 0.02, -0.12); ant.rotation.x = 0.3; g.add(ant);
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.014), new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff2010, emissiveIntensity: 1.5 })); btn.position.set(-0.035, 0.016, 0.085); g.add(btn);
    g.position.set(0, 0.075, -0.015); g.rotation.set(-0.35, 0, 0);
    return { g, kind: 'scanner' };
  }
  drawRadar(data, t) {
    const c = this.radarCtx; c.fillStyle = '#021008'; c.fillRect(0, 0, 128, 128);
    if (!data) { c.fillStyle = '#0a3a18'; c.font = '12px monospace'; c.textAlign = 'center'; c.fillText('STANDBY', 64, 68); this.radarTex.needsUpdate = true; return; }
    c.strokeStyle = '#1fe060'; c.lineWidth = 2; for (const r of [20, 40, 60]) { c.beginPath(); c.arc(64, 64, r, 0, 6.3); c.stroke(); }
    c.beginPath(); c.moveTo(64, 4); c.lineTo(64, 124); c.moveTo(4, 64); c.lineTo(124, 64); c.globalAlpha = 0.4; c.stroke(); c.globalAlpha = 1;
    const a = t * 5; c.strokeStyle = '#7dffa8'; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); c.stroke();
    for (const d of data.dots) { c.fillStyle = d.kind === 'monster' ? '#ff2020' : '#ff40c0'; c.beginPath(); c.arc(64 + d.x * 60, 64 + d.y * 60, d.kind === 'monster' ? 6 : 3.5, 0, 6.3); c.fill(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 3, 0, 6.3); c.fill(); this.radarTex.needsUpdate = true;
  }
  makeDecoy() {
    const g = new THREE.Group(), M = this.mats;
    const lab = tex((c, w, h) => { c.fillStyle = '#c9c2b0'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0281c'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); c.fillStyle = '#16151a'; c.font = `bold ${h * 0.42}px Silkscreen, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DECOY', w / 2, h / 2 + 2); }, 256, 96);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 20), [new THREE.MeshStandardMaterial({ map: lab, roughness: 0.5, metalness: 0.4 }), M.metal, M.metal]); body.rotation.y = Math.PI; g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.025, 16), new THREE.MeshStandardMaterial({ color: 0xc0281c, roughness: 0.5 })); cap.position.y = 0.072; g.add(cap);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 10), M.metal); pin.position.set(0.0, 0.092, 0); g.add(pin);
    g.position.set(0, 0.06, -0.01); g.rotation.set(-0.2, 0, 0);
    return { g, kind: 'decoy' };
  }
  makeCard(name, color) {
    const g = new THREE.Group();
    const t = tex((c, w, h) => { c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h * 0.62, w, h * 0.12); c.fillStyle = '#e8d070'; c.fillRect(w * 0.08, h * 0.18, w * 0.18, h * 0.22); c.fillStyle = '#fff'; c.font = `bold ${h * 0.17}px Silkscreen, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, w * 0.58, h * 0.3); c.fillStyle = '#ffffffaa'; c.font = `${h * 0.09}px monospace`; c.fillText('BLACKOUT STATION // ACCESS', w * 0.5, h * 0.85); }, 340, 220);
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.064, 0.004), [this.mats.dark, this.mats.dark, this.mats.dark, this.mats.dark, new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color, roughness: 0.5 })]);
    g.add(card); g.position.set(0.0, 0.07, -0.03); g.rotation.set(-0.6, 0.0, 0.0);
    return { g, kind: 'card' };
  }
  setItem(name) { if (name === this.target) return; this.target = name; this.swapPhase = 1; }
  setFlashlight(on, flicker = 1) { this.on = on; this.flickerK = flicker; }
  use(kind, onRelease) { this.useKind = kind; this.useT = 0; this.released = false; this.onRelease = onRelease; }
  resize(aspect) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
  update(dt, st) {
    this.t += dt; const t = this.t;
    // swap animation: lower -> change -> raise
    if (this.swapPhase > 0) {
      this.raise -= dt * 6; if (this.raise <= 0) { this.raise = 0; this.items[this.cur].g.visible = false; this.cur = this.target; this.items[this.cur].g.visible = true; this.swapPhase = -1; }
    } else if (this.swapPhase < 0) { this.raise += dt * 4.5; if (this.raise >= 1) { this.raise = 1; this.swapPhase = 0; } }
    if (this.useT < 1) this.useT = Math.min(1, this.useT + dt / (this.useKind === 'decoy' ? 0.55 : 0.5));
    if (!this.released && this.useKind === 'decoy' && this.useT >= 0.5) { this.released = true; this.onRelease && this.onRelease(); }
    this.runBlend = lerp(this.runBlend, st.running ? 1 : 0, Math.min(1, dt * 6));
    const bob = st.bobT, amp = st.bobAmp * 5.2, br = Math.sin(t * 1.7) * 0.0035;
    const useK = this.useT < 1 ? Math.sin(this.useT * Math.PI) : 0;
    // flashlight (left)
    const L = this.left.root, lowered = (1 - ease(this.raise)) * 0;
    L.position.set(-0.22 + Math.sin(bob) * amp * 0.012 - this.runBlend * 0.02, -0.205 + Math.abs(Math.cos(bob)) * amp * 0.01 - this.runBlend * 0.035 + br + this.nudge * -0.03, -0.46 + this.runBlend * 0.02);
    L.rotation.set(0.12 + this.runBlend * 0.25 + Math.cos(bob * 2) * amp * 0.004, 0.2 - st.turn * 0.4, -0.06 + Math.sin(bob) * amp * 0.01 + st.turn * 0.1);
    this.nudge = Math.max(0, this.nudge - dt * 4);
    // right hand + item
    const R = this.right.root, raise = ease(this.raise);
    const throwWind = this.useKind === 'decoy' && this.useT < 1 ? (this.useT < 0.5 ? this.useT * 2 : (1 - (this.useT - 0.5) * 2)) : 0;
    const throwSwing = this.useKind === 'decoy' && this.useT >= 0.4 && this.useT < 1 ? Math.sin((this.useT - 0.4) / 0.6 * Math.PI) : 0;
    R.position.set(0.2 + Math.sin(bob + 1.6) * amp * 0.012 + this.runBlend * 0.02, -0.2 - (1 - raise) * 0.4 + Math.abs(Math.cos(bob + 1.6)) * amp * 0.01 - this.runBlend * 0.035 - br + (this.useKind === 'scanner' ? -useK * 0.0 : 0) + throwWind * 0.08, -0.45 - (this.useKind === 'scanner' ? useK * 0.07 : 0) + throwWind * 0.12 - throwSwing * 0.18);
    R.rotation.set(0.1 + this.runBlend * 0.25 + throwWind * 0.7 - throwSwing * 1.1 + (this.useKind === 'scanner' ? useK * 0.2 : 0), -0.2 + st.turn * 0.4, 0.06 - Math.sin(bob) * amp * 0.01 - st.turn * 0.1);
    const cur = this.items[this.cur];
    this.setPose(this.right, cur.kind === 'card' ? 'pinch' : 'grip', 1);
    if (cur.kind === 'decoy' && this.useT >= 0.5 && this.useT < 1) this.setPose(this.right, 'open', 1);
    if (this.cur === 'decoy' && this.released && this.useKind === 'decoy' && this.useT < 1) cur.g.visible = this.useT < 0.5;
    else if (this.cur === 'decoy') cur.g.visible = this.swapPhase !== 1 || true;
    this.scrMat.emissiveIntensity = st.radar ? 2.2 : 0.12;
    if (st.radar) this.drawRadar(st.radar, t); else if (this.radarActive) this.drawRadar(null, t);
    this.radarActive = !!st.radar;
    // flashlight lens
    this.lensMat.emissiveIntensity = this.on ? 4 * this.flickerK : 0.0; this.lampLight.intensity = this.on ? 0.35 * this.flickerK : 0;
    this.hemi.intensity = this.on ? 1.0 : 0.22; this.key.intensity = this.on ? 1.2 : 0.15;
  }
  render(renderer, composerPass) { renderer.render(this.scene, this.cam); }
}
const ease = (t) => t * t * (3 - 2 * t);
