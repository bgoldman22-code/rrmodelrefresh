\
// scripts/sanitize-mlb.js
// Cleans src/MLB.jsx before build: strips BOM, removes any leading garbage lines
// (like accidental Netlify log strings) so file begins with a valid JS token.

import fs from 'fs';

const path = 'src/MLB.jsx';
if (!fs.existsSync(path)) {
  console.error('[sanitize-mlb] src/MLB.jsx not found; skipping');
  process.exit(0);
}

let buf = fs.readFileSync(path);
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  buf = buf.slice(3); // strip BOM
}
let text = buf.toString('utf8');

// Keep everything from the first line that looks like a JS start:
// - starts with 'import '
// - or starts with '/*' or '//' (a comment header)
// If neither is found, leave file as-is but warn.
const lines = text.split(/\\r?\\n/);
let start = 0;
for (let i = 0; i < lines.length; i++) {
  const L = lines[i].trimStart();
  if (L.startsWith('import ') || L.startsWith('//') || L.startsWith('/*')) {
    start = i;
    break;
  }
}
if (start > 0) {
  const cleaned = lines.slice(start).join('\\n');
  fs.writeFileSync(path, cleaned, 'utf8');
  console.log(`[sanitize-mlb] removed ${start} leading garbage line(s).`);
} else {
  console.log('[sanitize-mlb] no leading garbage detected.');
}
