const E = (page, f, a) => page.evaluate(f, a);
const log = (m) => console.log('LOG:' + m);
async function fresh(page, seed = 'END1') {
  await E(page, (s) => { if (window.__bs.state === 'playing') window.__bs.quit(); return window.__bs.startRun(s); }, seed);
  await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await E(page, () => { const g = window.__bs; window.T = { calm() { g.ai.x = 4; g.ai.z = 4; g.ai.huntT = 0; g.ai.forceT = 0; g.ai.headT = 9999; g.ai.state = 'wander'; g.ai.goal = null; g.ai.wanderWait = 9999; } }; T.calm(); });
}
async function ending(page, label, wait = 3200) {
  await page.waitForFunction(() => window.__bs.state === 'ended', null, { timeout: 30000 }).catch(() => log(label + ': NOT ENDED state=' + page.evaluate(() => window.__bs.state)));
  await page.waitForTimeout(wait);
  log(label + ' => ' + await E(page, () => document.querySelector('.ending-title')?.textContent + ' | ' + document.querySelector('.stats')?.textContent));
}
export default async function (page, { shot }) {
  // hull
  await fresh(page); await E(page, () => { window.__bs.run.timeLeft = 0.3; window.__bs.simulate(1); }); await ending(page, 'hull', 800);
  // dark
  await fresh(page); await E(page, () => { const R = window.__bs.run; R.flash = false; R.darkT = 59; R.health = 6; window.__bs.simulate(0.2); });
  log('dark warn msg: ' + await E(page, () => window.__bs.ui.$('#msg').textContent));
  await E(page, () => { window.T.calm(); window.__bs.simulate(8); }); log('health after drain sim: ' + await E(page, () => window.__bs.run?.health + ' state=' + window.__bs.state)); await ending(page, 'dark', 800);
  // dark recovery rate
  await fresh(page); await E(page, () => { const R = window.__bs.run; R.flash = false; window.__bs.simulate(30); R.flash = true; window.__bs.simulate(5); });
  log('dark timer 30s dark then 5s light (expect ~15): ' + await E(page, () => window.__bs.run.darkT.toFixed(1)));
  // power out
  await fresh(page); await E(page, () => { const R = window.__bs.run; R.power = 0.1; window.__bs.simulate(2.5); });
  log('power out: msg=' + await E(page, () => window.__bs.ui.$('#msg').textContent + ' noise=' + window.__bs.run.noise.toFixed(0) + ' flash=' + window.__bs.run.flash));
  await E(page, () => window.__bs.toggleLight()); log('light after toggle at 0 power: ' + await E(page, () => window.__bs.run.flash + ' msg=' + window.__bs.ui.$('#msg').textContent));
  // stages
  await fresh(page); for (const t of [299, 149, 59]) { await E(page, (t) => { window.__bs.run.timeLeft = t; window.T.calm(); window.__bs.simulate(0.3); }, t); log('stage t=' + t + ' -> ' + await E(page, () => window.__bs.run.stageIdx + ': ' + window.__bs.ui.$('#msg').textContent)); }
  // monster hunting & speeds
  await fresh(page); await E(page, () => { const g = window.__bs, P = g.player, M = g.ai; M.x = P.pos.x + 16; M.z = P.pos.z; M.state = 'wander'; g.run.noise = 100; g.simulate(1); });
  log('noise 100 near: monster state=' + await E(page, () => window.__bs.ai.state + ' speed(tiles/s)=' + (window.__bs.ai.speed / 2).toFixed(2)));
  await E(page, () => { window.__bs.run.timeLeft = 30; window.__bs.simulate(0.5); }); log('frenzy chase speed: ' + await E(page, () => (window.__bs.ai.speed / 2).toFixed(2)));
  // caught
  await fresh(page); await E(page, () => { const g = window.__bs, P = g.player, M = g.ai; M.x = P.pos.x + 0.8; M.z = P.pos.z; g.simulate(0.5); });
  log('state after contact: ' + await E(page, () => window.__bs.state)); await page.waitForTimeout(1200); await shot('caught'); await ending(page, 'caught', 200);
  // pod endings
  for (const [label, setup] of [['pod crew3', () => { const R = window.__bs.run; R.crew = { ana: true, bix: true, chen: true }; }], ['pod crew1', () => { window.__bs.run.crew.ana = true; }], ['pod alone', () => {}], ['pod QUIET', () => { const R = window.__bs.run; R.read = { ana: true, bix: true, chen: true }; R.flash = false; }]]) {
    await fresh(page); await E(page, (fn) => { const g = window.__bs, R = g.run; R.cards.blue = true; R.power = 50; (new Function('return ' + fn))()(); const p = g.world.pod.pos, w = g.world.pod.wall; g.player.pos.x = p.x; g.player.pos.z = p.z; g.player.yaw = Math.atan2(-(w.x - p.x), -(w.z - p.z)); g.simulate(0.2); g.interactPress = true; g.simulate(0.2); }, setup.toString());
    log(label + ' state=' + await E(page, () => window.__bs.state + ' power=' + window.__bs.run.power.toFixed(1)));
    if (label === 'pod crew3') await shot('launch'); await ending(page, label, 500);
  }
  // pod without blue card / power
  await fresh(page); await E(page, () => { const g = window.__bs, p = g.world.pod.pos, w = g.world.pod.wall; g.player.pos.x = p.x; g.player.pos.z = p.z; g.player.yaw = Math.atan2(-(w.x - p.x), -(w.z - p.z)); g.simulate(0.2); g.interactPress = true; g.simulate(0.2); });
  log('pod w/o card: state=' + await E(page, () => window.__bs.state + ' msg=' + window.__bs.ui.$('#msg').textContent));
}
