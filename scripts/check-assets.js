// Fails if any asset file under src/assets, public, or assets/scp-derived is not listed in assets/manifest.json
import fs from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(fs.readFileSync('assets/manifest.json', 'utf8'));
const listed = manifest.assets.map((a) => a.path);
const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
    : [];
const files = [...walk('src/assets'), ...walk('public'), ...walk('assets/scp-derived')].filter((f) => !f.endsWith('.gitkeep'));
const missing = files.filter((f) => !listed.some((p) => p.includes(f) || p.includes(path.basename(f))));
if (missing.length) {
  console.error('Assets missing from assets/manifest.json:\n' + missing.join('\n'));
  process.exit(1);
}
console.log(`asset manifest OK (${files.length} files checked, ${manifest.assets.length} manifest entries)`);
