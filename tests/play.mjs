// Browser test harness: node tests/play.mjs <name> [query] [script.js]
import { chromium } from 'playwright';
const [,, name='shot', query='', scriptPath=''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
const mobile = query.includes('mobile');
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: query.includes('small') ? { width: 640, height: 360 } : { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); if (m.text().startsWith('LOG:')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto('http://localhost:4173/?' + query.replace('mobile', '').replace('small',''));
await page.waitForFunction(() => window.__bs && window.__bs.state && window.__bs.state !== 'loading', null, { timeout: 120000 }).catch((e) => console.log('wait fail', e.message));
if (scriptPath) { const fn = (await import('file://' + process.cwd() + '/' + scriptPath)).default; await fn(page, { shot: async (n) => { await page.screenshot({ path: `/tmp/${name}_${n}.png` }); console.log('shot', n); } }); }
else { await page.waitForTimeout(3000); await page.screenshot({ path: `/tmp/${name}.png` }); }
console.log('state', await page.evaluate(() => window.__bs?.state));
console.log('ERRORS', errors.length); errors.slice(0, 15).forEach((e) => console.log(e));
await browser.close();
