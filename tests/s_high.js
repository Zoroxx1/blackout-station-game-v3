const E = (page, f, a) => page.evaluate(f, a);
export default async function (page, { shot }) {
  await E(page, () => window.__bs.startRun('HIGH1')); await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  console.log('LOG:' + await E(page, () => { const g = window.__bs; return 'quality=' + g.qName + ' gtao=' + !!g.fx.gtao + ' bloom=' + !!g.fx.bloom + '\n' + g.debugText(5); }));
  console.log('LOG:audio bank clips=' + await E(page, () => { const a = window.__bs.audio; return [...a.bank.values()].reduce((s, v) => s + v.length, 0) + ' groups=' + a.bank.size + ' bankDone=' + a.bankDone + ' ctx=' + a.ctx.state + ' voices=' + a.voices.size + ' sample: ' + a.debugList().slice(0, 8).join(' | '); }));
  await E(page, () => { window.__bs.showDebug = true; });
}
