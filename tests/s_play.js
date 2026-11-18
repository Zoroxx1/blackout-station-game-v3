export default async function (page, { shot }) {
  await page.evaluate(() => window.__bs.startRun(''));
  await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot('start');
  // look around
  for (let k = 1; k <= 3; k++) { await page.evaluate((k) => { window.__bs.player.yaw += Math.PI / 2; }, k); await page.waitForTimeout(1200); await shot('look' + k); }
  console.log('LOG:' + await page.evaluate(() => window.__bs.debugText(5)));
}
