// scripts/sanitize-mlb.js
// Optional backup sanitizer (the inline prebuild already handles this)

import fs from 'fs';

const p = 'src/MLB.jsx';
if (!fs.existsSync(p)) {
  console.log('[sanitize-mlb] missing');
  process.exit(0);
}
let b = fs.readFileSync(p);
if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
  b = b.slice(3);
}
let t = b.toString('utf8');
const L = t.split(/\r?\n/);
let s = 0;
for (let i = 0; i < L.length; i++) {
  const x = L[i].trimStart();
  if (x.startsWith('import ') || x.startsWith('//') || x.startsWith('/*')) {
    s = i;
    break;
  }
}
if (s > 0) {
  fs.writeFileSync(p, L.slice(s).join('\n'), 'utf8');
  console.log('[sanitize-mlb] removed ' + s + ' leading garbage line(s).');
} else {
  console.log('[sanitize-mlb] clean');
}
