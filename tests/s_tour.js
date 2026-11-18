const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  await E(page, () => window.__bs.startRun('TOUR7')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await E(page, () => { const g = window.__bs; g.ai.headT = 9999; g.ai.x = 2; g.ai.z = 2; g.ai.state = 'wander'; g.ai.wanderWait = 9999; g.ai.goal = null; });
  const rooms = [5, 11, 16, 22, 26];
  for (let i = 0; i < rooms.length; i++) {
    await E(page, ([id, i]) => { const g = window.__bs, r = g.level.rooms[id]; g.player.pos.x = (r.x0 + 2.5) * 2; g.player.pos.z = (r.y0 + 3.5) * 2; g.player.yaw = i * 1.3 + 0.4; g.player.pitch = -0.05; g.simulate(0.3); }, [rooms[i], i]);
    await page.waitForTimeout(500); await shot('room' + i);
  }
  // monster in front, lit by the flashlight
  await E(page, () => { const g = window.__bs, P = g.player, f = P.forward(); g.ai.x = P.pos.x + f.x * 6; g.ai.z = P.pos.z + f.z * 6; g.ai.yaw = Math.atan2(f.x, f.z) + Math.PI; g.ai.goal = null; g.ai.state = 'wander'; g.ai.wanderWait = 9999; g.simulate(0.4); });
  await page.waitForTimeout(500); await shot('monster');
  // walking test
  await E(page, () => { window.T = 0; const g = window.__bs; g.ai.x = 2; g.ai.z = 2; g.input.keys.add('KeyW'); window.__p0 = { ...g.player.pos }; g.simulate(0.5); g.input.keys.delete('KeyW'); });
  console.log('LOG:walk 0.5s dist(m)=' + await E(page, () => Math.hypot(window.__bs.player.pos.x - window.__p0.x, window.__bs.player.pos.z - window.__p0.z).toFixed(2)));
}
