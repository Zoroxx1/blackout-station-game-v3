// Multi-touch controls: left joystick (push fully to run), right-side drag to look, USE/TOOL/SWAP/LIGHT/RUN buttons.
export function setupTouch(root, input) {
  const el = document.createElement('div'); el.id = 'touch'; el.className = 'bs-hide';
  el.innerHTML = `<div class="zone" id="joyzone"></div><div id="joybase"></div><div id="joystick"></div><div class="zone" id="lookzone"></div>
  <div class="tbtn" id="b-use">USE</div><div class="tbtn" id="b-tool">TOOL</div><div class="tbtn" id="b-swap">SWAP</div><div class="tbtn" id="b-light">LIGHT</div><div class="tbtn" id="b-run">RUN</div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s); const joy = $('#joyzone'), look = $('#lookzone'), base = $('#joybase'), stick = $('#joystick');
  let joyId = null, jx = 0, jy = 0, lookId = null, lx = 0, ly = 0; const R = 55;
  joy.addEventListener('pointerdown', (e) => { if (joyId !== null) return; joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch { /* ok */ } jx = e.clientX; jy = e.clientY; for (const n of [base, stick]) { n.style.display = 'block'; n.style.left = jx + 'px'; n.style.top = jy + 'px'; } });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId !== joyId) return; let dx = e.clientX - jx, dy = e.clientY - jy; const m = Math.hypot(dx, dy); if (m > R * 1.25) { jx = e.clientX - (dx / m) * R * 1.25; jy = e.clientY - (dy / m) * R * 1.25; base.style.left = jx + 'px'; base.style.top = jy + 'px'; dx = e.clientX - jx; dy = e.clientY - jy; }
    const k = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx); input.moveX = Math.cos(a) * k; input.moveY = -Math.sin(a) * k; stick.style.left = jx + Math.cos(a) * k * R + 'px'; stick.style.top = jy + Math.sin(a) * k * R + 'px'; });
  const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.moveX = input.moveY = 0; base.style.display = stick.style.display = 'none'; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  look.addEventListener('pointerdown', (e) => { if (lookId !== null) return; lookId = e.pointerId; try { look.setPointerCapture(e.pointerId); } catch { /* ok */ } lx = e.clientX; ly = e.clientY; });
  look.addEventListener('pointermove', (e) => { if (e.pointerId !== lookId) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (Math.abs(dx) < 140 && Math.abs(dy) < 140) { input.lookX += dx * 1.6; input.lookY += dy * 1.6; } });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; }; look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
  const tap = (sel, fn) => { const b = $(sel); b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* ok */ } b.classList.add('on'); fn(true); }); const up = (e) => { b.classList.remove('on'); fn(false); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
  tap('#b-use', (d) => { input.touchUse = d; if (d) input.emit('interactDown'); else input.emit('interactUp'); });
  tap('#b-tool', (d) => { if (d) input.emit('use'); }); tap('#b-swap', (d) => { if (d) input.emit('swap'); }); tap('#b-light', (d) => { if (d) input.emit('light'); });
  tap('#b-run', (d) => { input.touchRun = d; });
  return { show(v) { el.classList.toggle('bs-hide', !v); if (!v) { input.moveX = input.moveY = 0; input.touchRun = input.touchUse = false; joyId = lookId = null; base.style.display = stick.style.display = 'none'; } } };
}
