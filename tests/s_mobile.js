const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  console.log('LOG:touch class: ' + await E(page, () => document.getElementById('bs-root').className));
  await shot('title_mobile');
  await E(page, () => window.__bs.startRun('')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('LOG:touch visible: ' + await E(page, () => !document.getElementById('touch').classList.contains('bs-hide')));
  // simulate joystick touch with pointer events
  await E(page, () => { const z = document.getElementById('joyzone'); const mk = (t, x, y) => z.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: x, clientY: y, bubbles: true })); window.__ev = mk; mk('pointerdown', 100, 300); mk('pointermove', 100, 220); });
  await page.waitForTimeout(300);
  console.log('LOG:joystick input: ' + await E(page, () => window.__bs.input.moveX.toFixed(2) + ',' + window.__bs.input.moveY.toFixed(2) + ' run=' + window.__bs.input.axes().run));
  await E(page, () => window.__bs.simulate(1)); console.log('LOG:player speed(tiles/s)=' + await E(page, () => (window.__bs.player.speed / 2).toFixed(2) + ' running=' + window.__bs.player.running));
  await E(page, () => { window.__ev('pointerup', 100, 220); const l = document.getElementById('lookzone'); const yaw0 = window.__bs.player.yaw; window.__yaw0 = yaw0; l.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, clientX: 600, clientY: 200, bubbles: true })); l.dispatchEvent(new PointerEvent('pointermove', { pointerId: 6, clientX: 660, clientY: 200, bubbles: true })); l.dispatchEvent(new PointerEvent('pointerup', { pointerId: 6, clientX: 660, clientY: 200, bubbles: true })); window.__bs.simulate(0.1); });
  console.log('LOG:look yaw delta: ' + await E(page, () => (window.__bs.player.yaw - window.__yaw0).toFixed(3)));
  await E(page, () => { const b = document.getElementById('b-light'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true })); });
  console.log('LOG:light after LIGHT btn: ' + await E(page, () => window.__bs.run.flash)); await E(page, () => window.__bs.simulate(0.2)); await shot('play_mobile');
  
}
