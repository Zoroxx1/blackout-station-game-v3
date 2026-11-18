// The creature: a procedurally rigged character (bone hierarchy of Object3D joints) - tall, thin, black shroud, pale mask face.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function faceTexture() {
  const w = 512, h = 640, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const gr = g.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.5, h * 0.62); gr.addColorStop(0, '#d8d0e6'); gr.addColorStop(0.7, '#b8abd0'); gr.addColorStop(1, '#8c7fa8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(60,40,90,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  // cheek shadow & nose
  g.fillStyle = 'rgba(70,50,110,0.25)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.5, 14, 56, 0, 0, 6.3); g.fill();
  // hollow eyes
  for (const s of [-1, 1]) {
    const ex = w * (0.5 + s * 0.17), ey = h * 0.4;
    const eg = g.createRadialGradient(ex, ey, 4, ex, ey, 70); eg.addColorStop(0, '#000'); eg.addColorStop(0.7, '#050408'); eg.addColorStop(1, 'rgba(10,8,16,0)'); g.fillStyle = eg; g.beginPath(); g.ellipse(ex, ey, 58, 84, s * 0.12, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 9; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.lineWidth = 11 - k * 3; g.beginPath(); g.moveTo(ex + (k - 1) * 14, ey + 70); g.bezierCurveTo(ex + (k - 1) * 20 + s * 8, ey + 160, ex + (k - 1) * 8, ey + 230, ex + (k - 1) * 12 + s * 5, ey + 300 + k * 20); g.stroke(); }
  }
  // faint smile
  g.strokeStyle = 'rgba(40,10,40,0.9)'; g.lineWidth = 6; g.beginPath(); g.moveTo(w * 0.3, h * 0.72); g.quadraticCurveTo(w * 0.5, h * 0.83, w * 0.7, h * 0.72); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(30,10,40,0.6)'; for (let i = 0; i < 14; i++) { const x = w * (0.34 + i * 0.023); g.beginPath(); g.moveTo(x, h * 0.755 + Math.sin(i / 14 * 3.14) * 22); g.lineTo(x, h * 0.775 + Math.sin(i / 14 * 3.14) * 22); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Monster {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'monster';
    const cloth = new THREE.MeshStandardMaterial({ color: 0x0d0c12, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    this.timeU = { value: 0 };
    cloth.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.timeU; sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uTime;\nvoid main() {').replace('#include <begin_vertex>', `#include <begin_vertex>
        float hem = smoothstep(1.0, 0.0, position.y); transformed.x += sin(position.z*7.0 + uTime*1.7 + position.x*4.0) * 0.06 * hem; transformed.z += cos(position.x*6.0 + uTime*1.3) * 0.06 * hem; transformed.y += sin(position.x*9.0 + uTime*2.0) * 0.03 * hem;`);
    };
    const flesh = new THREE.MeshStandardMaterial({ color: 0x8d849c, roughness: 0.65 });
    this.fleshMat = flesh;
    this.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture(), roughness: 0.55, emissive: 0x6a5a90, emissiveIntensity: 0 });
    const black = new THREE.MeshStandardMaterial({ color: 0x050407, roughness: 0.8 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 1.2, fog: false });
    this.body = new THREE.Group(); this.root.add(this.body);
    // legs (mostly hidden by the shroud)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.14, 1.22, 0); this.body.add(hip);
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.5, 3, 6), black); th.position.y = -0.3; hip.add(th);
      const knee = new THREE.Group(); knee.position.y = -0.6; hip.add(knee);
      const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.52, 3, 6), black); sh.position.y = -0.3; knee.add(sh);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.26), flesh); foot.position.set(0, -0.62, 0.07); knee.add(foot);
      this.legs.push({ hip, knee });
    }
    // shroud: bell-shaped lathe with broad shoulders
    const prof = [[0.78, 0.32], [0.7, 0.6], [0.58, 0.95], [0.46, 1.3], [0.38, 1.6], [0.36, 1.85], [0.4, 2.02], [0.34, 2.12], [0.16, 2.2], [0.1, 2.25]].map(([r, y]) => new THREE.Vector2(r, y));
    const shroud = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), cloth); shroud.scale.set(1.0, 1, 0.62); shroud.castShadow = true; this.body.add(shroud);
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.62, 4, 10), cloth); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 2.0; shoulders.scale.set(1, 1, 0.85); shoulders.castShadow = true; this.body.add(shoulders);
    // neck chain
    this.neck = [];
    let parent = this.body, y = 2.08;
    for (let i = 0; i < 4; i++) {
      const j = new THREE.Group(); j.position.y = y; parent.add(j); const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.13, 8), flesh); seg.position.y = 0.065; j.add(seg); this.neck.push(j); parent = j; y = 0.12;
    }
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.16; parent.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), flesh); skull.scale.set(0.125, 0.19, 0.135); skull.position.y = 0.1; skull.castShadow = true; this.head.add(skull);
    const face = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18, Math.PI / 2 - 0.95, 1.9, 0.5, 2.05), this.skin); face.scale.set(0.1275, 0.1925, 0.1375); face.position.y = 0.1; this.head.add(face);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.eyeMat); e.position.set(s * 0.047, 0.1 + 0.025, 0.127); this.head.add(e); }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), black); this.mouth.position.set(0, 0.1 - 0.108, 0.115); this.mouth.scale.set(0.045, 0.001, 0.02); this.head.add(this.mouth);
    this.eyeLight = new THREE.PointLight(0xff2010, 0, 5, 2); this.eyeLight.position.set(0, 0.12, 0.2); this.head.add(this.eyeLight);
    // hair
    const hairGeos = []; const hm = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, len = rnd(0.7, 1.5), r = rnd(0.012, 0.022);
      const front = Math.cos(a) * 0.9 > 0.4 && Math.abs(Math.sin(a)) < 0.3; if (front) continue;
      const geo = new THREE.CylinderGeometry(r * 0.2, r, len, 5, 1); geo.translate(0, -len / 2, 0);
      const px = Math.sin(a) * 0.115, pz = -Math.cos(a) * 0.1 - 0.015 + (Math.abs(Math.sin(a)) > 0.8 ? 0.06 : 0), py = 0.2 - Math.random() * 0.15;
      hm.makeRotationFromEuler(new THREE.Euler(rnd(-0.12, 0.12) + (pz < 0 ? 0.08 : 0), 0, rnd(-0.1, 0.1) + Math.sin(a) * 0.08)); hm.setPosition(px, py, pz);
      const gg = geo.toNonIndexed(); gg.deleteAttribute('uv'); gg.applyMatrix4(hm); hairGeos.push(gg);
    }
    import('three/examples/jsm/utils/BufferGeometryUtils.js').then(({ mergeGeometries }) => { const hair = new THREE.Mesh(mergeGeometries(hairGeos), black); hair.castShadow = true; this.hair.add(hair); });
    this.hair = new THREE.Group(); this.head.add(this.hair);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, 6.3, 0, 1.25), black); cap.scale.set(0.135, 0.205, 0.15); cap.position.set(0, 0.1, -0.01); this.head.add(cap);
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.42, 2.0, 0); this.body.add(sh);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.82, 3, 6), cloth); up.position.y = -0.46; up.castShadow = true; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.92; sh.add(el);
      const fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.82, 3, 6), cloth); fo.position.y = -0.46; fo.castShadow = true; el.add(fo);
      const wr = new THREE.Group(); wr.position.y = -0.92; el.add(wr);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.025), flesh); palm.position.y = -0.06; wr.add(palm);
      const fingers = [];
      for (let f = 0; f < 4; f++) {
        const lens = [0.15, 0.17, 0.16, 0.12][f];
        const p1 = new THREE.Group(); p1.position.set(-0.028 + f * 0.0185, -0.12, 0); wr.add(p1);
        const m1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, lens * 0.9, 2, 5), flesh); m1.position.y = -lens * 0.5; p1.add(m1);
        const p2 = new THREE.Group(); p2.position.y = -lens; p1.add(p2); const m2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, lens * 0.8, 2, 5), flesh); m2.position.y = -lens * 0.42; p2.add(m2);
        const p3 = new THREE.Group(); p3.position.y = -lens * 0.85; p2.add(p3); const m3 = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, lens * 0.6, 2, 5), flesh); m3.position.y = -lens * 0.3; p3.add(m3);
        fingers.push({ p1, p2, p3 });
      }
      this.arms.push({ sh, el, wr, fingers, s });
    }
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.phase = 0; this.t = Math.random() * 20; this.glitch = 0; this.tiltT = 2; this.tilt = 0; this.tiltTarget = 0;
    this.mode = 'idle'; this.hunting = false; this.mouthOpen = 0; this.lungeT = 0; this.howlT = 0; this.blend = { walk: 0, run: 0 };
    this.pose = { lean: 0, headBack: 0 };
  }
  setHunting(h) { this.hunting = h; }
  // st: {speed (m/s), hunting, mode: 'normal'|'howl'|'lunge'|'caught', dist (m to player)}
  animate(dt, st) {
    this.t += dt; const t = this.t; this.timeU.value = t;
    const sp = st.speed; const walk = Math.min(1, sp / 3.5), run = Math.max(0, Math.min(1, (sp - 4.2) / 2.4));
    this.blend.walk += (walk - this.blend.walk) * Math.min(1, dt * 5); this.blend.run += (run - this.blend.run) * Math.min(1, dt * 6);
    const bw = this.blend.walk, br = this.blend.run;
    this.phase += dt * (sp > 0.2 ? (2.4 + br * 5) : 0);
    const ph = this.phase, hunting = st.hunting;
    // glitch frames
    if (hunting && Math.random() < 0.05) this.glitch = 1 + (Math.random() * 3 | 0); this.glitch = Math.max(0, this.glitch - 1);
    const gj = this.glitch > 0 ? 1 : 0;
    // random head tilts (snap)
    this.tiltT -= dt; if (this.tiltT < 0) { this.tiltT = rnd(1.5, 5); this.tiltTarget = rnd(-0.6, 0.6); }
    this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * (hunting ? 10 : 3));
    // body
    const idleSway = Math.sin(t * 0.9) * 0.05, creep = Math.sin(ph * 0.5);
    const lean = bw * 0.1 + br * 0.38 + (st.mode === 'lunge' ? 0.7 : 0);
    this.body.rotation.set(lean + Math.sin(t * 1.3) * 0.02, Math.sin(ph) * 0.12 * bw, idleSway + Math.sin(ph * 0.5) * 0.06 * bw);
    this.body.position.y = Math.abs(Math.sin(ph)) * (0.03 + br * 0.08) * bw + (st.mode === 'howl' ? 0.04 * Math.sin(t * 30) : 0);
    // legs
    for (let i = 0; i < 2; i++) { const L = this.legs[i], p = ph + i * Math.PI; L.hip.rotation.x = Math.sin(p) * (0.35 + br * 0.5) * bw; L.knee.rotation.x = Math.max(0, -Math.sin(p + 0.8)) * (0.6 + br * 0.5) * bw; }
    // neck & head: long, wrong head tilt, slight forward drift
    const lookAt = st.mode === 'howl' ? -0.9 : st.mode === 'lunge' ? 0.15 : 0.15 + Math.sin(t * 0.6) * 0.08 + br * 0.3;
    this.neck.forEach((n, i) => { n.rotation.x += ((lookAt / 4 + Math.sin(ph + i * 0.5) * 0.03 * bw) - n.rotation.x) * Math.min(1, dt * 8); n.rotation.z += ((this.tilt / 4 + (gj ? rnd(-0.3, 0.3) : 0)) - n.rotation.z) * Math.min(1, dt * 14); n.rotation.y = Math.sin(t * 0.4 + i) * 0.1 + (gj ? rnd(-0.4, 0.4) : 0); });
    this.hair.rotation.set(Math.sin(t * 1.2) * 0.04 + bw * 0.08, 0, Math.sin(t * 0.9) * 0.05);
    // mouth + eyes
    const mt = st.mode === 'howl' || st.mode === 'lunge' || st.mode === 'caught' ? 1 : 0; this.mouthOpen += (mt - this.mouthOpen) * Math.min(1, dt * 12);
    this.mouth.scale.set(0.045 + this.mouthOpen * 0.02, 0.001 + this.mouthOpen * 0.075, 0.02 + this.mouthOpen * 0.03); this.mouth.position.z = 0.115 + this.mouthOpen * 0.01;
    this.eyeMat.emissiveIntensity = hunting || st.mode !== 'normal' ? 9 + Math.sin(t * 40) * 2 : 1.4; this.eyeLight.intensity = hunting ? 1.6 : 0;
    const prox = Math.max(0, 1 - (st.dist ?? 99) / 6); this.skin.emissiveIntensity = prox * 0.65 + (st.mode === 'caught' ? 0.55 : 0); this.fleshMat.emissive.setRGB(0.1 * prox, 0.08 * prox, 0.16 * prox);
    // arms
    for (const a of this.arms) {
      const s = a.s; let sx = 0, sz = 0, ex = 0, wz = 0, curl = 0.4;
      if (a.s === 1 && st.mode === 'normal' && !(br > 0.5)) { // right hand raised, waving
        const raise = 1 - Math.min(1, bw * 1.2) * 0.35;
        sz = 2.55 * raise + Math.sin(t * 0.7) * 0.05; sx = 0; ex = -0.15; a.wr.rotation.z = Math.sin(t * 2.2) * 0.45; curl = 0.1 + (Math.sin(t * 4.4) * 0.5 + 0.5) * 0.35;
        a.el.rotation.z = Math.sin(t * 2.2) * 0.35;
      } else a.wr.rotation.z = 0;
      if (a.s !== 1 || st.mode !== 'normal' || br > 0.5) {
        a.el.rotation.z = 0;
        sx = Math.sin(ph + (s > 0 ? Math.PI : 0)) * (0.2 + br * 0.9) * bw; sz = s * (0.08 + Math.sin(t * 0.8 + s) * 0.04 + br * 0.15); ex = -(0.05 + br * 0.9) * (bw > 0.1 ? 1 : 0.2) - Math.sin(t * 1.1 + s) * 0.03; curl = 0.45 + br * 0.4;
        if (st.mode === 'howl') { sz = s * 1.5; sx = -0.2; ex = -0.3; curl = 1.1; }
        if (st.mode === 'lunge' || st.mode === 'caught') { sx = -1.55 + Math.sin(t * 25) * 0.06; sz = s * 0.18; ex = -0.1; curl = 0.1 + Math.sin(t * 20) * 0.2; }
      }
      a.sh.rotation.set(sx + (gj ? rnd(-0.3, 0.3) : 0), 0, sz); a.el.rotation.x = ex;
      a.fingers.forEach((f, i) => { const c = curl + Math.sin(t * 3 + i * 0.7 + s) * 0.12; f.p1.rotation.x = -c * 0.5 + (i - 1.5) * 0.02; f.p2.rotation.x = -c * 0.8; f.p3.rotation.x = -c * 0.7; f.p1.rotation.z = (i - 1.5) * 0.06 * s; });
    }
    if (gj) this.root.children.forEach(() => {}); this.body.position.x = gj ? rnd(-0.06, 0.06) : 0;
  }
}
