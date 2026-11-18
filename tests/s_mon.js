const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  await E(page, () => window.__bs.startRun('TOUR7')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  for (const [d, label] of [[6, 'far'], [3.2, 'near']]) {
    await E(page, (d) => { const g = window.__bs, P = g.player, r = g.level.rooms[g.world.playerRoom]; g.ai.update = () => false; g.ai.speed = 0; P.yaw = 0.4; const f = P.forward(); g.ai.x = P.pos.x + f.x * d; g.ai.z = P.pos.z + f.z * d; g.ai.yaw = Math.atan2(f.x, f.z) + Math.PI; g.simulate(0.4); }, d);
    await page.waitForTimeout(600); await shot(label);
  }
  console.log('LOG:walk: ' + await E(page, () => { const g = window.__bs; g.player.yaw = g.level.start.yaw; g.input.keys.add('KeyW'); const p0 = { ...g.player.pos }; g.simulate(0.5); g.input.keys.delete('KeyW'); return Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z).toFixed(2) + ' m in 0.5s (walk=4 m/s => 2.0)'; }));
}
