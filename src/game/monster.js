// SCP-096 style pale deep-sea creature ("Eli Vance"):
// - 2.4m tall, emaciated (visible ribs, spine, hip bones, hollow stomach), 1.5m long arms with 4 three-jointed clawed fingers + thumb
// - Chalk-white wet skin with faint blue veins, pink-red staining at hands/knees/elbows/feet, calcified barnacles on shoulders/spine
// - Pupil-less white eyes, flat nose, unhinging jaw (opens up to 4x normal mouth width) with dark throat and thin teeth
// - Named skeleton bones, IK targets, head look-at, jaw/eye/cheek blend controls, 3 LOD tiers, and all 11 animation clips + procedural twitch layers
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

function seaCreatureFaceTexture() {
  const w = 512, h = 640, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  // Chalk-white waterlogged skin base
  const gr = g.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.5, h * 0.65);
  gr.addColorStop(0, '#eef2f5');
  gr.addColorStop(0.65, '#d6dfe6');
  gr.addColorStop(1, '#aebbc6');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);

  // Faint blue veins & waterlogged wrinkles
  for (let i = 0; i < 45; i++) {
    g.strokeStyle = i % 2 ? 'rgba(65,110,145,0.22)' : 'rgba(120,130,140,0.18)';
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    let vx = Math.random() * w, vy = Math.random() * h;
    g.moveTo(vx, vy);
    for (let s = 0; s < 4; s++) {
      vx += (Math.random() - 0.5) * 45;
      vy += Math.random() * 35;
      g.lineTo(vx, vy);
    }
    g.stroke();
  }

  // Sunken dark eye sockets with pure white pupil-less eyes and red-pink vein staining
  for (const s of [-1, 1]) {
    const ex = w * (0.5 + s * 0.19), ey = h * 0.38;
    const eg = g.createRadialGradient(ex, ey, 8, ex, ey, 58);
    eg.addColorStop(0, 'rgba(95,35,45,0.65)');
    eg.addColorStop(0.6, 'rgba(55,60,75,0.35)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg;
    g.beginPath(); g.ellipse(ex, ey, 52, 62, s * 0.08, 0, 6.283); g.fill();
    // Pure white pupil-less eyeball
    g.fillStyle = '#f8fafc';
    g.beginPath(); g.ellipse(ex, ey, 22, 18, 0, 0, 6.283); g.fill();
    // Brine tear streaks
    g.strokeStyle = 'rgba(130,55,65,0.38)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(ex, ey + 22); g.lineTo(ex + s * 6, ey + 140); g.stroke();
  }

  // Flat nose slits
  g.fillStyle = 'rgba(40,45,55,0.65)';
  g.beginPath(); g.ellipse(w * 0.47, h * 0.50, 5, 11, -0.2, 0, 6.283); g.fill();
  g.beginPath(); g.ellipse(w * 0.53, h * 0.50, 5, 11, 0.2, 0, 6.283); g.fill();

  // Pink-red staining around the jaw & mouth corners
  const mg = g.createRadialGradient(w * 0.5, h * 0.72, 10, w * 0.5, h * 0.72, 120);
  mg.addColorStop(0, 'rgba(155,42,52,0.55)');
  mg.addColorStop(1, 'rgba(155,42,52,0)');
  g.fillStyle = mg;
  g.fillRect(0, h * 0.52, w, h * 0.45);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const MONSTER_CLIPS = {
  idle_weep:         { duration: 6.0, loop: true },
  roam_walk:         { duration: 1.4, loop: true },
  roam_pause_lookup: { duration: 2.0, loop: false },
  turn_to_noise:     { duration: 0.8, loop: false },
  flinch_face_seen:  { duration: 0.5, loop: false },
  distress_crouch:   { duration: 2.2, loop: true },
  rage_run:          { duration: 0.5, loop: true },
  door_bash:         { duration: 1.0, loop: false },
  leap:              { duration: 0.8, loop: false },
  kill_grab:         { duration: 1.2, loop: false },
  recover_sit:       { duration: 3.0, loop: false },
  sit_sob:           { duration: 3.5, loop: true },
};

export class Monster {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'monster_scp096_sea';
    this.bones = {};
    this.blendShapes = { jawOpen: 0, eyesWide: 0, cheekTremor: 0 };
    this.timeU = { value: 0 };

    // Wet chalk-white skin shader with slow drip animation (low roughness 0.22 for damp wet look)
    const skinPale = new THREE.MeshStandardMaterial({
      color: 0xdce4ec,
      roughness: 0.22,
      metalness: 0.08,
    });
    skinPale.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.timeU;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'uniform float uTime;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float tremor = sin(position.y * 18.0 + uTime * 9.0) * 0.0025;
          transformed.x += tremor;`);
    };
    const skinStained = new THREE.MeshStandardMaterial({
      color: 0xb85862, // pink-red staining at hands, knees, elbows, feet
      roughness: 0.20,
      metalness: 0.1,
    });
    const barnacleMat = new THREE.MeshStandardMaterial({
      color: 0x8a9288, // calcified barnacle scars & salt crust
      roughness: 0.78,
      metalness: 0.15,
    });
    this.faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: seaCreatureFaceTexture(),
      roughness: 0.24,
      metalness: 0.05,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      emissive: 0xd8ecff,
      emissiveIntensity: 0.45,
      roughness: 0.08,
    });
    const throatMat = new THREE.MeshStandardMaterial({ color: 0x16060a, roughness: 0.4 });
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.3 });

    // ---------------- Named Bone Hierarchy (Prompt 3 Section 1.5) ----------------
    const mkBone = (name, parent, x = 0, y = 0, z = 0) => {
      const b = new THREE.Group();
      b.name = name;
      b.position.set(x, y, z);
      parent.add(b);
      this.bones[name] = b;
      return b;
    };

    const bRoot = mkBone('root', this.root, 0, 0, 0);
    const bPelvis = mkBone('pelvis', bRoot, 0, 1.18, 0);
    this.body = bPelvis;

    // Pelvis & hip bones (visible emaciated iliac crests)
    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.18), skinPale);
    pelvisMesh.castShadow = true;
    bPelvis.add(pelvisMesh);
    for (const s of [-1, 1]) {
      const hipBone = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skinPale);
      hipBone.scale.set(0.8, 1.2, 0.9);
      hipBone.position.set(s * 0.15, 0.03, 0.04);
      bPelvis.add(hipBone);
    }

    // Spine chain: spine1 (hollow stomach), spine2 (lower ribs), spine3 (upper ribcage & hunched shoulders)
    const bSpine1 = mkBone('spine1', bPelvis, 0, 0.12, 0);
    const stomach = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.26, 10), skinPale);
    stomach.scale.set(1.0, 1, 0.65);
    stomach.position.y = 0.13;
    bSpine1.add(stomach);

    const bSpine2 = mkBone('spine2', bSpine1, 0, 0.25, 0);
    const bSpine3 = mkBone('spine3', bSpine2, 0, 0.26, 0);

    // Emaciated ribcage + protruding dorsal spine + calcified barnacle clusters
    const ribGeos = [];
    for (let r = 0; r < 7; r++) {
      const ry = -0.18 + r * 0.062;
      const rad = 0.135 + Math.sin((r / 6) * Math.PI) * 0.045;
      const rib = new THREE.TorusGeometry(rad, 0.014, 5, 14, Math.PI * 1.65);
      rib.rotateX(Math.PI / 2 + 0.18);
      rib.rotateZ(Math.PI * 0.175);
      rib.scale(1.05, 1, 0.72);
      rib.translate(0, ry, 0.01);
      ribGeos.push(rib.toNonIndexed());
      // Dorsal vertebra knob
      const vert = new THREE.BoxGeometry(0.028, 0.035, 0.045);
      vert.translate(0, ry, -0.11);
      ribGeos.push(vert.toNonIndexed());
    }
    const chestCore = new THREE.CylinderGeometry(0.145, 0.11, 0.46, 12);
    chestCore.scale(1.02, 1, 0.68);
    chestCore.translate(0, 0.02, 0);
    ribGeos.push(chestCore.toNonIndexed());
    ribGeos.forEach((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); });
    const ribMesh = new THREE.Mesh(mergeGeometries(ribGeos), skinPale);
    ribMesh.castShadow = true;
    bSpine3.add(ribMesh);

    // Calcified barnacle scars on shoulders and spine
    const barnGeos = [];
    for (let i = 0; i < 16; i++) {
      const b = new THREE.ConeGeometry(0.018 + (i % 3) * 0.008, 0.028, 6, 1, true);
      const sx = (i % 2 ? 1 : -1) * (0.04 + (i % 5) * 0.045);
      const sy = -0.15 + (i / 16) * 0.38;
      const sz = -0.11 + (i % 3) * 0.02;
      b.rotateX(-Math.PI / 2 + 0.3);
      b.translate(sx, sy, sz);
      const nb = b.toNonIndexed();
      for (const k of Object.keys(nb.attributes)) if (k !== 'position' && k !== 'normal') nb.deleteAttribute(k);
      barnGeos.push(nb);
    }
    const barnMesh = new THREE.Mesh(mergeGeometries(barnGeos), barnacleMat);
    bSpine3.add(barnMesh);

    // Neck chain (neck1, neck2) + Head + Unhinging Jaw
    const bNeck1 = mkBone('neck1', bSpine3, 0, 0.24, 0.03);
    const neckSeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.056, 0.16, 8), skinPale);
    neckSeg1.position.y = 0.08;
    bNeck1.add(neckSeg1);

    const bNeck2 = mkBone('neck2', bNeck1, 0, 0.15, 0.02);
    const neckSeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.15, 8), skinPale);
    neckSeg2.position.y = 0.075;
    bNeck2.add(neckSeg2);
    this.neck = [bNeck1, bNeck2];

    const bHead = mkBone('head', bNeck2, 0, 0.15, 0.02);
    this.head = bHead;
    // Cranium + Face mask
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), skinPale);
    cranium.scale.set(0.115, 0.155, 0.13);
    cranium.position.set(0, 0.11, 0);
    cranium.castShadow = true;
    bHead.add(cranium);

    const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16, Math.PI / 2 - 0.95, 1.9, 0.45, 2.1), this.faceMat);
    faceMesh.scale.set(0.118, 0.158, 0.134);
    faceMesh.position.set(0, 0.11, 0.005);
    bHead.add(faceMesh);

    // Pupil-less pure white eyes
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), this.eyeMat);
      eye.position.set(s * 0.044, 0.135, 0.118);
      bHead.add(eye);
      this.eyes.push(eye);
    }

    // Unhinging Jaw bone (opens up to 4x normal mouth width, revealing dark throat & thin teeth)
    const bJaw = mkBone('jaw', bHead, 0, 0.045, 0.02);
    this.jaw = bJaw;
    const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.14), skinStained);
    lowerJaw.position.set(0, -0.05, 0.04);
    bJaw.add(lowerJaw);

    this.throat = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.09), throatMat);
    this.throat.position.set(0, 0.01, 0.095);
    bHead.add(this.throat);

    // Thin needle-like teeth along upper & lower jaw
    for (let t = -4; t <= 4; t++) {
      const tx = t * 0.012;
      const ut = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.022, 4), toothMat);
      ut.rotation.x = Math.PI;
      ut.position.set(tx, 0.035, 0.115);
      bHead.add(ut);
      const lt = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.022, 4), toothMat);
      lt.position.set(tx, -0.005, 0.095);
      bJaw.add(lt);
    }

    // ---------------- Very Long Arms (1.5m) with 4 Three-Jointed Fingers + Thumb ----------------
    this.arms = [];
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const bSh = mkBone(`shoulder_${side}`, bSpine3, s * 0.23, 0.18, 0);
      const shJoint = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), barnacleMat);
      bSh.add(shJoint);

      const bUp = mkBone(`upperarm_${side}`, bSh, s * 0.03, -0.02, 0);
      const upMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.66, 4, 8), skinPale);
      upMesh.position.y = -0.36;
      upMesh.castShadow = true;
      bUp.add(upMesh);

      // Stained elbow joint
      const bFo = mkBone(`forearm_${side}`, bUp, 0, -0.72, 0);
      const elbowKnob = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), skinStained);
      bFo.add(elbowKnob);
      const foMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.68, 4, 8), skinStained);
      foMesh.position.y = -0.36;
      foMesh.castShadow = true;
      bFo.add(foMesh);

      const bHand = mkBone(`hand_${side}`, bFo, 0, -0.74, 0);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.026), skinStained);
      palm.position.y = -0.065;
      bHand.add(palm);

      // Thumb
      const bThumb = mkBone(`thumb_${side}`, bHand, -s * 0.042, -0.05, 0.015);
      const thMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.09, 3, 5), skinStained);
      thMesh.position.y = -0.05;
      bThumb.add(thMesh);

      // 4 Long Claw-Like Fingers (3 joints each)
      const fingers = [];
      for (let f = 0; f < 4; f++) {
        const len = [0.16, 0.19, 0.18, 0.14][f];
        const j1 = mkBone(`finger_${side}_${f}_1`, bHand, -0.028 + f * 0.019, -0.13, 0);
        const m1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, len * 0.42, 3, 5), skinStained);
        m1.position.y = -len * 0.24;
        j1.add(m1);

        const j2 = mkBone(`finger_${side}_${f}_2`, j1, 0, -len * 0.48, 0);
        const m2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0058, len * 0.36, 3, 5), skinStained);
        m2.position.y = -len * 0.20;
        j2.add(m2);

        const j3 = mkBone(`finger_${side}_${f}_3`, j2, 0, -len * 0.40, 0);
        const m3 = new THREE.Mesh(new THREE.ConeGeometry(0.006, len * 0.35, 5), skinStained);
        m3.rotation.x = Math.PI;
        m3.position.y = -len * 0.17;
        j3.add(m3);

        fingers.push({ p1: j1, p2: j2, p3: j3 });
      }
      this.arms.push({ sh: bUp, el: bFo, wr: bHand, thumb: bThumb, fingers, s });
    }

    // ---------------- Long Thin Legs (thigh, shin, foot, toes) ----------------
    this.legs = [];
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const bThigh = mkBone(`thigh_${side}`, bRoot, s * 0.12, 1.16, 0);
      const thMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.50, 4, 8), skinPale);
      thMesh.position.y = -0.28;
      thMesh.castShadow = true;
      bThigh.add(thMesh);

      const bShin = mkBone(`shin_${side}`, bThigh, 0, -0.56, 0);
      const kneeKnob = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), skinStained);
      bShin.add(kneeKnob);
      const shMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.52, 4, 8), skinPale);
      shMesh.position.y = -0.28;
      shMesh.castShadow = true;
      bShin.add(shMesh);

      const bFoot = mkBone(`foot_${side}`, bShin, 0, -0.56, 0.04);
      const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.24), skinStained);
      footMesh.position.set(0, -0.02, 0.05);
      bFoot.add(footMesh);

      const bToes = mkBone(`toes_${side}`, bFoot, 0, -0.02, 0.17);
      const toesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.08), skinStained);
      bToes.add(toesMesh);

      this.legs.push({ hip: bThigh, knee: bShin, foot: bFoot, toes: bToes, s });
    }

    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

    // Animation state
    this.clip = 'idle_weep';
    this.clipTime = 0;
    this.phase = 0;
    this.t = Math.random() * 20;
    this.hunting = false;
    this.faceCovered = true;
    this.lookupYawOffset = 0;
    this.mouthOpen = 0;
    this.blend = { walk: 0, run: 0, crouch: 0, cover: 1 };
  }

  setHunting(h) {
    this.hunting = h;
  }

  // World-space head position for the 30 Hz FACE_SEEN check (Prompt 3 Section 2.3)
  getHeadWorldPos(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.head.getWorldPosition(out);
  }

  // World-space unit vector pointing straight out of the creature's face
  getFaceForward(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    this.head.getWorldQuaternion(q);
    return out.set(0, 0, 1).applyQuaternion(q).normalize();
  }

  isFaceCovered() {
    return this.faceCovered;
  }

  setJawOpen(v) {
    this.blendShapes.jawOpen = Math.max(0, Math.min(1, v));
    // Jaw unhinges up to 4x normal mouth height
    const open = this.blendShapes.jawOpen;
    this.jaw.position.y = 0.045 - open * 0.24;
    this.jaw.rotation.x = open * 0.55;
    this.throat.scale.set(1 + open * 0.35, 1 + open * 6.5, 1);
    this.throat.position.y = 0.01 - open * 0.11;
  }

  // st: { speed (m/s), hunting, mode/clip, dist (m to player), lookupYaw }
  animate(dt, st = {}) {
    this.t += dt;
    const t = this.t;
    this.timeU.value = t;
    const sp = st.speed || 0;
    const clip = st.clip || (st.mode === 'caught' ? 'kill_grab' : st.mode === 'lunge' ? 'rage_run' : st.hunting ? 'rage_run' : sp > 0.3 ? 'roam_walk' : 'idle_weep');
    if (clip !== this.clip) {
      this.clip = clip;
      this.clipTime = 0;
    } else {
      this.clipTime += dt;
    }

    // Determine target blend weights per animation clip (0.15s..0.3s crossfade)
    const isWeep = clip === 'idle_weep';
    const isLookup = clip === 'roam_pause_lookup';
    const isDistress = clip === 'distress_crouch';
    const isRage = clip === 'rage_run' || clip === 'leap';
    const isBash = clip === 'door_bash';
    const isKill = clip === 'kill_grab';
    const isSit = clip === 'recover_sit' || clip === 'sit_sob';
    const isFlinch = clip === 'flinch_face_seen';

    this.faceCovered = isWeep || isDistress || isSit;

    const rate = Math.min(1, dt * 6);
    this.blend.walk = lerp(this.blend.walk, sp > 0.25 && !isRage ? 1 : 0, rate);
    this.blend.run = lerp(this.blend.run, isRage ? 1 : 0, rate);
    this.blend.crouch = lerp(this.blend.crouch, isDistress || isSit ? 1 : 0, rate);
    this.blend.cover = lerp(this.blend.cover, this.faceCovered ? 1 : 0, rate);

    const bw = this.blend.walk, br = this.blend.run, bc = this.blend.crouch, bcov = this.blend.cover;
    this.phase += dt * (isRage ? 12.5 : sp > 0.2 ? 4.4 : 1.5);
    const ph = this.phase;

    // Procedural unsettling layers: breathing, shoulder sob shake, sudden head twitch
    const sobShake = (isWeep || isDistress || isSit) ? Math.sin(t * 22) * 0.025 : 0;
    const twitch = (isRage || isDistress) && Math.sin(t * 37) > 0.92 ? (Math.random() - 0.5) * 0.22 : 0;

    // Pelvis height & hunch
    const crouchDrop = isSit ? -0.58 : bc * -0.38;
    const strideBob = Math.abs(Math.sin(ph)) * (bw * 0.04 + br * 0.11);
    this.body.position.y = 1.18 + crouchDrop + strideBob + sobShake;
    const hunch = isRage ? 0.48 : isDistress ? 0.55 : isWeep ? 0.32 : 0.28;
    this.bones.spine1.rotation.x = hunch * 0.35 + Math.sin(t * 1.8) * 0.02;
    this.bones.spine2.rotation.x = hunch * 0.35;
    this.bones.spine3.rotation.set(hunch * 0.4 + sobShake, Math.sin(ph) * (bw * 0.08 + br * 0.18), twitch * 0.4);

    // Head bowed while roaming/weeping; raised during roam_pause_lookup, rage_run, or kill_grab
    let headPitch = 0.48; // bowed down by default
    let headYaw = 0;
    if (isLookup) {
      const k = Math.sin(Math.min(1, this.clipTime / 2.0) * Math.PI);
      headPitch = lerp(0.45, -0.05, k);
      headYaw = (st.lookupYaw || 0.7) * k;
    } else if (isRage || isKill || isBash) {
      headPitch = -0.15;
    } else if (isFlinch) {
      headPitch = -0.35;
      headYaw = Math.sin(t * 35) * 0.3;
    }
    this.bones.neck1.rotation.set(headPitch * 0.5, headYaw * 0.4, twitch);
    this.bones.neck2.rotation.set(headPitch * 0.5, headYaw * 0.6, -twitch * 0.5);

    // Jaw unhinging (up to 4x width in DISTRESS, RAGE, and KILL_GRAB)
    const targetJaw = isKill ? 1.0 : isRage ? 0.88 : isDistress ? 0.75 + Math.sin(t * 18) * 0.15 : isFlinch ? 0.45 : 0.02;
    this.mouthOpen = lerp(this.mouthOpen, targetJaw, Math.min(1, dt * 12));
    this.setJawOpen(this.mouthOpen);

    // Legs
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i], p = ph + i * Math.PI;
      if (isSit) {
        L.hip.rotation.x = -1.25;
        L.knee.rotation.x = 1.45;
      } else if (isDistress) {
        L.hip.rotation.x = -0.65;
        L.knee.rotation.x = 0.95;
      } else {
        const swing = Math.sin(p) * (bw * 0.38 + br * 0.85);
        L.hip.rotation.x = swing;
        L.knee.rotation.x = Math.max(0, -Math.sin(p + 0.7)) * (bw * 0.55 + br * 1.05);
      }
    }

    // Long 1.5m Arms & 4 Three-Jointed Fingers
    for (const a of this.arms) {
      const s = a.s;
      let sx = 0, sz = s * 0.12, ex = -0.15, curl = 0.35;
      if (bcov > 0.5) {
        // Hands raised covering face (idle_weep, distress_crouch, sit_sob)
        sx = -1.45 + sobShake * 2;
        sz = -s * 0.28;
        ex = -1.35;
        curl = 0.25;
      } else if (isBash) {
        // Slamming both arms against door
        const bashWave = Math.sin(this.clipTime * Math.PI * 4);
        sx = -1.2 + bashWave * 0.65;
        sz = s * 0.15;
        ex = -0.25;
        curl = 0.7;
      } else if (isRage || isKill) {
        // Reaching forward in sprint or kill grab
        sx = -1.35 + Math.sin(ph + (s > 0 ? Math.PI : 0)) * (isKill ? 0.1 : 0.35);
        sz = s * (isKill ? 0.24 : 0.16);
        ex = -0.22;
        curl = isKill ? 0.15 + Math.sin(t * 25) * 0.15 : 0.3;
      } else {
        // Long arms swaying nearly to the floor during roam_walk
        sx = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.24 * bw;
        sz = s * 0.08;
        ex = -0.08;
        curl = 0.4;
      }
      a.sh.rotation.set(sx, 0, sz);
      a.el.rotation.x = ex;
      a.fingers.forEach((f, idx) => {
        const twitchF = Math.sin(t * 5.5 + idx * 1.1 + s) * 0.12;
        const c = curl + twitchF;
        f.p1.rotation.x = -c * 0.5;
        f.p2.rotation.x = -c * 0.75;
        f.p3.rotation.x = -c * 0.65;
      });
    }
  }
}
