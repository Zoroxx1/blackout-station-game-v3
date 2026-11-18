// Unified input: keyboard (rebindable), mouse (pointer lock w/ drag fallback), touch writes into the same state.
import { DEFAULT_KEYS, CFG } from './config.js';

export class Input {
  constructor(el, settings) {
    this.el = el; this.settings = settings; this.keys = new Set(); this.handlers = {};
    this.lookX = 0; this.lookY = 0; this.moveX = 0; this.moveY = 0; this.touchRun = false; this.touchUse = false;
    this.locked = false; this.dragFallback = false; this.dragging = false; this.enabled = false; this.isTouch = false; this.lastPointerErr = 0;
    this.rebinding = null;
    addEventListener('keydown', (e) => this.onKey(e, true)); addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys.clear(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.el; this.emit('lockchange', this.locked); });
    document.addEventListener('pointerlockerror', () => { this.dragFallback = true; this.emit('lockerror'); });
    el.addEventListener('mousedown', (e) => { if (this.enabled && !this.locked && this.dragFallback) { this.dragging = true; } });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && !(this.dragFallback && this.dragging))) return;
      const L = CFG.player.mouseSpikeLimit; if (Math.abs(e.movementX) > L || Math.abs(e.movementY) > L) return; // ignore spikes
      this.lookX += e.movementX; this.lookY += e.movementY;
    });
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, v) { (this.handlers[name] || []).forEach((f) => f(v)); }
  get bind() { return this.settings.keys || DEFAULT_KEYS; }
  down(action) { return this.keys.has(this.bind[action]); }
  onKey(e, isDown) {
    if (this.rebinding && isDown) { e.preventDefault(); const cb = this.rebinding; this.rebinding = null; cb(e.code); return; }
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.code !== 'Escape') return;
    if (isDown) { if (this.keys.has(e.code)) { if (['Tab'].includes(e.code)) e.preventDefault(); return; } this.keys.add(e.code); } else this.keys.delete(e.code);
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!isDown) { if (e.code === this.bind.interact) this.emit('interactUp'); return; }
    const b = this.bind;
    if (e.code === b.light) this.emit('light'); else if (e.code === b.swap || e.code === 'Tab') this.emit('swap');
    else if (e.code === b.use) this.emit('use'); else if (e.code === b.interact) this.emit('interactDown');
    else if (e.code === b.choice1) this.emit('choice', 0); else if (e.code === b.choice2) this.emit('choice', 1);
    else if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause');
    else if (e.code === 'F3' || e.code === 'Backquote') this.emit('debug'); else if (e.code === 'F4') this.emit('audiodebug');
    else if (e.code === 'KeyF') this.emit('fullscreen');
  }
  requestLock() {
    if (this.isTouch || this.locked) return; this.dragFallback = false;
    try { const p = this.el.requestPointerLock?.(); if (p && p.catch) p.catch(() => { this.dragFallback = true; }); else if (!this.el.requestPointerLock) this.dragFallback = true; } catch { this.dragFallback = true; }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock?.(); this.dragging = false; }
  // Called once per frame by the game
  axes() {
    let x = 0, y = 0;
    if (this.down('left')) x -= 1; if (this.down('right')) x += 1; if (this.down('forward')) y += 1; if (this.down('back')) y -= 1;
    x += this.moveX; y += this.moveY; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    const joy = Math.hypot(this.moveX, this.moveY);
    return { x, y, mag: Math.hypot(x, y), run: this.down('run') || this.keys.has('ShiftRight') || this.touchRun || joy > 0.93 };
  }
  turnKeys() { return (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0); }
  pitchKeys() { return (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0); }
  consumeLook() { const r = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return r; }
  get interactHeld() { return this.down('interact') || this.touchUse; }
}
