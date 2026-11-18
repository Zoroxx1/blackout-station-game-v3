// Post-processing, flashlight light shaft, dust motes, sparks & steam.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, tDirt: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.07 }, uVig: { value: 0.0 }, uCA: { value: 0.0022 }, uPanic: { value: 0 }, uFlick: { value: 1 }, uRed: { value: 0 }, uPurple: { value: 0 }, uPink: { value: 0 }, uDirt: { value: 0.5 }, uFocus: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uSat: { value: 1 }, uGlitch: { value: 0 }, uCB: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
  uniform sampler2D tDiffuse, tDirt; uniform float uTime,uGrain,uVig,uCA,uPanic,uFlick,uRed,uPurple,uPink,uDirt,uFocus,uSat,uGlitch,uCB; uniform vec2 uRes; varying vec2 vUv;
  float hash(vec2 p){ p=fract(p*vec2(443.897,441.423)); p+=dot(p,p+19.19); return fract(p.x*p.y); }
  void main(){
    vec2 uv=vUv; vec2 c=uv-0.5; float r2=dot(c,c);
    if(uGlitch>0.0){ float band=step(0.97, hash(vec2(floor(uv.y*40.0), floor(uTime*20.0)))); uv.x+=band*uGlitch*0.04*(hash(vec2(uTime,uv.y))-0.5)*4.0; }
    vec2 dir=normalize(c+vec2(1e-5)); float ca=uCA*(0.2+r2*5.0)*(1.0+uPanic*1.4+uGlitch*3.0);
    vec3 col; col.r=texture2D(tDiffuse, uv-dir*ca).r; col.g=texture2D(tDiffuse, uv).g; col.b=texture2D(tDiffuse, uv+dir*ca).b;
    if(uFocus>0.0){ vec2 o=dir*uFocus*(0.4+r2*3.0)/uRes.x*6.0; col=(col*2.0+texture2D(tDiffuse,uv+o).rgb+texture2D(tDiffuse,uv-o).rgb+texture2D(tDiffuse,uv+vec2(-o.y,o.x)).rgb)/5.0; }
    float l=dot(col,vec3(0.2126,0.7152,0.0722));
    col=mix(vec3(l),col,0.8*uSat*(1.0-uPanic*0.55));
    col*=mix(vec3(0.93,0.97,1.06),vec3(1.1,1.02,0.9),smoothstep(0.3,0.85,l));
    col=(col-0.5)*1.07+0.5;
    float vig=smoothstep(0.92,0.18,length(c)*(1.0+uPanic*0.85+uVig)); col*=mix(1.0,vig,0.92);
    col*=uFlick;
    col+=texture2D(tDirt,uv).rgb*smoothstep(0.45,1.0,l)*uDirt*0.22;
    col=mix(col,vec3(0.5,0.02,0.06)*(0.5+l),clamp(uRed,0.0,1.0)*0.8); col+=vec3(0.28,0.0,0.45)*uPurple*(0.4+r2*2.0);
    col+=vec3(0.45,0.04,0.3)*uPink*smoothstep(0.15,0.75,length(c))*0.35;
    if(uCB>0.5){ col=vec3(col.r*0.9+col.g*0.1, col.g*0.8+col.b*0.2+col.r*0.1, col.b*0.7+col.g*0.3); }
    col+=(hash(uv*uRes+uTime*vec2(37.0,17.0))-0.5)*uGrain*(1.0+uPanic*0.6);
    gl_FragColor=vec4(max(col,0.0),1.0);
  }`,
};

function dirtTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 2 + Math.random() * 24, gr = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.15 + Math.random() * 0.5; gr.addColorStop(0, `rgba(255,240,220,${a})`); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const PointVS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
  void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uScale/max(0.1,-mv.z); vA=aAlpha; vC=aColor; }`;
const PointFS = `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d); gl_FragColor=vec4(vC, a*a*vA); }`;

class PointCloud {
  constructor(n, additive) {
    this.n = n; this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.col = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1)); this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({ vertexShader: PointVS, fragmentShader: PointFS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 400 } } });
    this.mesh = new THREE.Points(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  dirty() { for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[k].needsUpdate = true; }
}

export class Effects {
  constructor(renderer, scene, camera, hands, q) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.hands = hands; this.q = q; this.t = 0;
    this.dirt = dirtTexture();
    this.beamOn = true; this.beamK = 1;
    // ---- flashlight beam shaft ----
    const L = 15, ang = 0.5, geo = new THREE.ConeGeometry(Math.tan(ang) * L, L, 28, 1, true); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -L / 2); // apex at origin, opens toward -z
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).map((_, i) => Math.min(1, -geo.attributes.position.getZ(i) / L)), 1));
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uI: { value: 0.07 }, uCol: { value: new THREE.Color(1.0, 0.92, 0.78) } },
      vertexShader: 'attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT=aT; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform float uI; uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float e=1.0-abs(dot(normalize(vN),normalize(vV))); float a=uI*pow(1.0-vT,1.6)*smoothstep(0.0,0.08,vT)*(0.35+0.65*e); gl_FragColor=vec4(uCol*a,a); }',
    });
    this.beam = new THREE.Mesh(geo, this.beamMat); this.beam.frustumCulled = false; this.beam.renderOrder = 4; camera.add(this.beam); this.beam.position.set(-0.2, -0.13, -0.28);
    // ---- dust motes ----
    const nd = q.particles; this.dust = new PointCloud(nd, true); this.dustV = [];
    for (let i = 0; i < nd; i++) { this.dust.pos[i * 3] = (Math.random() - 0.5) * 16; this.dust.pos[i * 3 + 1] = Math.random() * 3; this.dust.pos[i * 3 + 2] = (Math.random() - 0.5) * 16; this.dust.size[i] = 0.008 + Math.random() * 0.016; this.dust.col.set([1, 0.93, 0.8], i * 3); this.dustV.push([(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.12]); }
    this.scene.add(this.dust.mesh);
    // ---- sparks + steam ----
    this.sparks = new PointCloud(120, true); this.steam = new PointCloud(90, false); this.sp = []; this.st = [];
    for (let i = 0; i < 120; i++) this.sp.push({ life: 0 }); for (let i = 0; i < 90; i++) this.st.push({ life: 0 });
    this.scene.add(this.sparks.mesh, this.steam.mesh);
    this.build(1, 1);
  }
  build(w, h) {
    const q = this.q, r = this.r;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt); this.composer.setPixelRatio(1); this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) { try { this.gtao = new GTAOPass(this.scene, this.camera, w, h); this.gtao.blendIntensity = 0.85; this.gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, samples: 10, distanceFallOff: 1, screenSpaceRadius: false }); this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 8 }); this.composer.addPass(this.gtao); } catch (e) { console.warn('GTAO unavailable', e); this.gtao = null; } }
    const hp = new RenderPass(this.hands.scene, this.hands.cam); hp.clear = false; hp.clearDepth = true; this.composer.addPass(hp);
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.6, 0.55, 0.85); this.composer.addPass(this.bloom); }
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader); this.final.uniforms.tDirt.value = this.dirt; this.final.uniforms.uRes.value.set(w, h); this.composer.addPass(this.final);
    this.u = this.final.uniforms;
  }
  resize(w, h) { this.composer.setSize(w, h); this.u.uRes.value.set(w, h); this.dust.mat.uniforms.uScale.value = this.sparks.mat.uniforms.uScale.value = this.steam.mat.uniforms.uScale.value = h * 0.69; this.hands.resize(w / h); }
  setQuality(q) { this.q = q; const sz = this.r.getSize(new THREE.Vector2()); this.composer.dispose(); this.build(sz.x * this.r.getPixelRatio(), sz.y * this.r.getPixelRatio()); this.resize(sz.x, sz.y); }
  burstSpark(x, y, z) { let n = 8 + (Math.random() * 8 | 0); for (const p of this.sp) { if (p.life > 0 || n <= 0) continue; n--; p.life = 0.4 + Math.random() * 0.5; p.max = p.life; p.x = x; p.y = y; p.z = z; const a = Math.random() * 6.283, s = 1 + Math.random() * 3; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = Math.random() * 2.5; } }
  puffSteam(x, y, z) { for (const p of this.st) { if (p.life > 0) continue; p.life = 2 + Math.random() * 1.5; p.max = p.life; p.x = x + (Math.random() - 0.5) * 0.2; p.y = y; p.z = z + (Math.random() - 0.5) * 0.2; p.vx = (Math.random() - 0.5) * 0.4; p.vy = -0.2 - Math.random() * 0.4; p.vz = (Math.random() - 0.5) * 0.4; p.s = 0.6; break; } }
  update(dt, cam, light) { // light: {on, flick, dirX,dirZ}
    this.t += dt; const t = this.t;
    // dust: keep around camera
    const d = this.dust, cx = cam.x, cz = cam.z;
    for (let i = 0; i < d.n; i++) {
      const v = this.dustV[i]; d.pos[i * 3] += (v[0] + Math.sin(t * 0.5 + i) * 0.04) * dt; d.pos[i * 3 + 1] += (v[1] + Math.sin(t * 0.3 + i * 2) * 0.02) * dt; d.pos[i * 3 + 2] += (v[2] + Math.cos(t * 0.4 + i) * 0.04) * dt;
      let dx = d.pos[i * 3] - cx, dz = d.pos[i * 3 + 2] - cz; if (dx > 9) d.pos[i * 3] -= 18; else if (dx < -9) d.pos[i * 3] += 18; if (dz > 9) d.pos[i * 3 + 2] -= 18; else if (dz < -9) d.pos[i * 3 + 2] += 18; if (d.pos[i * 3 + 1] > 3) d.pos[i * 3 + 1] = 0.1; else if (d.pos[i * 3 + 1] < 0) d.pos[i * 3 + 1] = 2.9;
      // lit only inside the flashlight cone
      const px = d.pos[i * 3] - cam.x, py = d.pos[i * 3 + 1] - cam.y, pz = d.pos[i * 3 + 2] - cam.z, dist = Math.hypot(px, py, pz) + 1e-4;
      const dot = (px * light.fx + py * light.fy + pz * light.fz) / dist;
      const cone = light.on ? Math.max(0, (dot - 0.84) / 0.16) : 0; d.alpha[i] = (cone * Math.max(0, 1 - dist / 11) * 0.8 + 0.03) * (light.flick ?? 1);
    }
    d.dirty();
    for (let i = 0; i < this.sp.length; i++) { const p = this.sp[i]; if (p.life > 0) { p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; } const k = Math.max(0, p.life / p.max); this.sparks.pos.set([p.x, p.y, p.z], i * 3); this.sparks.alpha[i] = k; this.sparks.size[i] = 0.035; this.sparks.col.set([1, 0.5 + k * 0.4, 0.15 + k * 0.3], i * 3); } else { this.sparks.alpha[i] = 0; } }
    this.sparks.dirty();
    for (let i = 0; i < this.st.length; i++) { const p = this.st[i]; if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 0.1 * dt; p.s += dt * 1.1; const k = p.life / p.max; this.steam.pos.set([p.x, p.y, p.z], i * 3); this.steam.alpha[i] = Math.sin(k * 3.14) * 0.16; this.steam.size[i] = 0.9 * p.s; this.steam.col.set([0.75, 0.78, 0.85], i * 3); } else this.steam.alpha[i] = 0; }
    this.steam.dirty();
  }
  dispose() { this.scene.remove(this.dust.mesh, this.sparks.mesh, this.steam.mesh); this.camera.remove(this.beam); this.composer.dispose(); this.dust.geo.dispose(); this.sparks.geo.dispose(); this.steam.geo.dispose(); }
  render() { this.u.uTime.value = this.t; this.r.info.autoReset = false; this.r.info.reset(); this.composer.render(); }
}
