const E = (page, f, a) => page.evaluate(f, a);
const log = (m) => console.log('LOG:' + m);
export default async function (page, { shot }) {
  for (const act of ['settings', 'credits', 'howto']) { await E(page, (a) => document.querySelector(`[data-act="${a}"]`).click(), act); await page.waitForTimeout(300); log(act + ' screen: ' + await E(page, () => document.querySelector('.screen')?.id)); if (act === 'settings') await shot('settings'); await E(page, () => document.querySelector('[data-act="back"]').click()); }
  await E(page, () => window.__bs.startRun('UI1')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await E(page, () => { window.__bs.pause(); }); log('paused: ' + await E(page, () => window.__bs.state + ' ' + !!document.querySelector('#scr-pause')));
  await E(page, () => window.__bs.resume()); log('resumed: ' + await E(page, () => window.__bs.state));
  // locked red door message + hatch
  await E(page, () => { const g = window.__bs; g.ai.update = () => false; const d = g.world.doors.find((d) => d.lock === 'red'); const x = d.pos.x, z = d.pos.z; const ox = d.axis === 'x' ? -2 : 0, oz = d.axis === 'x' ? 0 : -2; g.player.pos.x = x + ox; g.player.pos.z = z + oz; g.player.yaw = Math.atan2(-(x - g.player.pos.x), -(z - g.player.pos.z)); g.simulate(0.3); g.interactPress = true; g.simulate(0.2); });
  log('red door: ' + await E(page, () => window.__bs.ui.$('#msg').textContent + ' | prompt=' + window.__bs.ui.$('#prompt').textContent));
  const h = await E(page, () => { const g = window.__bs; const d = g.world.doors.find((d) => d.hatch); if (!d) return null; const x = d.pos.x, z = d.pos.z; const ox = d.axis === 'x' ? -2 : 0, oz = d.axis === 'x' ? 0 : -2; g.run.noise = 0; g.player.pos.x = x + ox; g.player.pos.z = z + oz; g.player.yaw = Math.atan2(-(x - g.player.pos.x), -(z - g.player.pos.z)); g.simulate(0.3); const p0 = g.run.power; g.interactPress = true; g.simulate(0.2); const n = g.run.noise; g.simulate(2.2); return { noise: n.toFixed(0), powerSpent: (p0 - g.run.power).toFixed(2), progress: d.progress.toFixed(2) }; });
  log('hatch: ' + JSON.stringify(h)); await shot('hatch');
  await E(page, () => { const g = window.__bs; g.player.yaw += 0.0; });
}
