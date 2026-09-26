/**
 * Cloudflare Pages (wrangler pages deploy) skips every `node_modules` directory, but Expo's
 * web export places package assets such as the icon fonts under `assets/node_modules/...`.
 * Move them to `assets/vendor/...` and rewrite the references so they get uploaded.
 *
 * Usage: node scripts/fix-web-assets.js <export dir>
 */
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/fix-web-assets.js <export dir>');
  process.exit(1);
}

const from = path.join(outDir, 'assets', 'node_modules');
if (!fs.existsSync(from)) {
  console.log('No assets/node_modules in export; nothing to fix.');
  process.exit(0);
}
fs.renameSync(from, path.join(outDir, 'assets', 'vendor'));

let rewritten = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(js|html|css|json)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      const next = text.split('/assets/node_modules/').join('/assets/vendor/');
      if (next !== text) {
        fs.writeFileSync(full, next);
        rewritten += 1;
      }
    }
  }
}
walk(outDir);
console.log(`Moved assets/node_modules -> assets/vendor; rewrote ${rewritten} file(s).`);
