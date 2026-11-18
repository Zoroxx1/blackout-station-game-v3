const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  await E(page, () => window.__bs.startRun('Q1')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await E(page, () => { const g = window.__bs, R = g.run; g.ai.x = 4; g.ai.z = 4; g.ai.headT = 9999; R.cards.blue = true; R.power = 50; R.read = { ana: true, bix: true, chen: true }; R.flash = false; R.crew = { ana: true, bix: true, chen: true }; const p = g.world.pod.pos, w = g.world.pod.wall; g.player.pos.x = p.x; g.player.pos.z = p.z; g.player.yaw = Math.atan2(-(w.x - p.x), -(w.z - p.z)); g.simulate(0.2); g.interactPress = true; g.simulate(0.2); });
  await page.waitForFunction(() => window.__bs.state === 'ended', null, { timeout: 60000 }); await page.waitForTimeout(4000);
  console.log('LOG:quiet => ' + await E(page, () => document.querySelector('.ending-title')?.textContent + ' ' + window.__bs.state));
  await shot('ending');
}
