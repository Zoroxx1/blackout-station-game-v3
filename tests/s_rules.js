const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  const log = (m) => console.log('LOG:' + m);
  await E(page, () => window.__bs.startRun('RULES1'));
  await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(500);
  // helpers inside page
  await E(page, () => {
    const g = window.__bs; window.T = {
      tp(x, z, yaw) { g.player.pos.x = x; g.player.pos.z = z; if (yaw !== undefined) g.player.yaw = yaw; g.player.pitch = 0; },
      face(x, z) { const p = g.player.pos; g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z)); },
      calm() { g.ai.x = 4; g.ai.z = 4; g.ai.huntT = 0; g.ai.forceT = 0; g.ai.headT = 9999; g.ai.state = 'wander'; g.ai.goal = null; g.ai.wanderWait = 999; },
    };
  });
  // --- locker ---
  const lk = await E(page, () => { const l = window.__bs.world.lockers.find((l) => l.content === 'blue'); return { x: l.pos.x, z: l.pos.z, content: l.content }; });
  await E(page, (l) => { T.calm(); T.tp(l.x, l.z); T.face(l.x - 0 , l.z); }, lk);
  // stand in front of locker facing it
  await E(page, () => { const g = window.__bs; const l = g.world.lockers.find((l) => l.content === 'blue'); const s = l.s; const dx = [1,0,-1,0][s.dir], dz = [0,1,0,-1][s.dir]; T.tp(l.s.cx - dx * 1.4, l.s.cz - dz * 1.4); T.face(l.s.cx, l.s.cz); g.player.pos.x += 0; });
  await page.waitForTimeout(300);
  log('prompt: ' + await E(page, () => window.__bs.ui.$('#prompt').textContent));
  await E(page, () => { window.__bs.interactPress = true; }); await page.waitForTimeout(500);
  log('blue card: ' + await E(page, () => window.__bs.run.cards.blue + ' item=' + window.__bs.run.item));
  await shot('locker');
  // --- door ---
  const door = await E(page, () => { const g = window.__bs; const d = g.world.doors.find((d) => !d.lock && !d.hatch); return { x: d.pos.x, z: d.pos.z, ax: d.axis }; });
  await E(page, (d) => { T.calm(); T.tp(d.ax === 'x' ? d.x - 2.2 : d.x, d.ax === 'x' ? d.z : d.z - 2.2); T.face(d.x, d.z); window.__bs.run.power = 50; window.__bs.run.noise = 0; }, door);
  await page.waitForTimeout(300); log('door prompt: ' + await E(page, () => window.__bs.ui.$('#prompt').textContent));
  await E(page, () => { window.__bs.interactPress = true; }); await page.waitForTimeout(400);
  log('after door: power=' + await E(page, () => window.__bs.run.power.toFixed(1) + ' noise=' + window.__bs.run.noise.toFixed(1)));
  await page.waitForTimeout(1500); await shot('door_open');
  log('door progress: ' + await E(page, () => window.__bs.world.doors.filter((d) => d.opening).map((d) => d.progress.toFixed(2)).join(',')));
  // --- generator charge + interrupt ---
  const gen = await E(page, () => { const g = window.__bs.world.generators[0]; return { x: g.pos.x, z: g.pos.z, wx: g.wallPos.x, wz: g.wallPos.z }; });
  await E(page, (g) => { T.calm(); T.tp(g.x, g.z); T.face(g.wx, g.wz); window.__bs.run.power = 40; }, gen);
  await page.waitForTimeout(400); log('gen prompt: ' + await E(page, () => window.__bs.ui.$('#prompt').textContent)); await shot('generator');
  await E(page, () => window.__bs.input.keys.add('KeyE')); await page.waitForTimeout(2500);
  log('charging: ' + await E(page, () => (window.__bs.run.chargeP).toFixed(2) + ' noise=' + window.__bs.run.noise.toFixed(0)));
  await E(page, () => window.__bs.input.keys.delete('KeyE')); await page.waitForTimeout(400);
  log('after release: charging=' + await E(page, () => !!window.__bs.run.charging + ' power=' + window.__bs.run.power.toFixed(1)));
  await E(page, () => { T.calm(); window.__bs.run.noise = 0; window.__bs.input.keys.add('KeyE'); }); await page.waitForTimeout(9500);
  await E(page, () => window.__bs.input.keys.delete('KeyE'));
  log('after full charge: power=' + await E(page, () => window.__bs.run.power.toFixed(1) + ' spent=' + window.__bs.world.generators[0].spent));
  // --- terminal ---
  const term = await E(page, () => { const t = window.__bs.world.terminals[0]; return { x: t.pos.x, z: t.pos.z, cx: t.s.cx, cz: t.s.cz }; });
  await E(page, (t) => { T.calm(); T.tp(t.x, t.z); T.face(t.cx, t.cz); window.__bs.run.power = 60; }, term);
  await page.waitForTimeout(300); await E(page, () => { window.__bs.interactPress = true; }); await page.waitForTimeout(1800); await shot('terminal');
  await E(page, () => window.__bs.choose(0)); await page.waitForTimeout(800);
  log('terminal choice done: crew=' + await E(page, () => JSON.stringify(window.__bs.run.crew) + ' power=' + window.__bs.run.power.toFixed(1)));
  await page.waitForTimeout(2800);
  // --- scanner & decoy ---
  await E(page, () => { T.calm(); window.__bs.run.power = 80; window.__bs.run.item = 'scanner'; window.__bs.hands.setItem('scanner'); window.__bs.useItem(); });
  await page.waitForTimeout(600); log('scan: power=' + await E(page, () => window.__bs.run.power.toFixed(1) + ' noise=' + window.__bs.run.noise.toFixed(0) + ' scanT=' + window.__bs.run.scanT.toFixed(1))); await shot('scanner');
  await page.waitForTimeout(4000);
  await E(page, () => { const g = window.__bs; g.run.item = 'decoy'; g.hands.setItem('decoy'); });
  await page.waitForTimeout(600); await E(page, () => window.__bs.useItem()); await page.waitForTimeout(2500);
  log('decoy: count=' + await E(page, () => window.__bs.run.decoys + ' decoyT=' + window.__bs.ai.decoyT.toFixed(1) + ' state=' + window.__bs.ai.state));
  await shot('decoy');
}
