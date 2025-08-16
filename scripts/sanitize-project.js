// scripts/sanitize-project.js
// Ultra-safe prebuild sanitizer: strips BOM and removes any rogue lines
// prepended to entry files (e.g., Netlify log header). Applies to:
//  - vite.config.js
//  - src/**/*.{js,jsx,ts,tsx}
//  - netlify/functions/**/*.{js,jsx,ts,tsx,js}
// It preserves everything from the first "real" JS/TS line.
// Run with: node scripts/sanitize-project.js

import fs from 'fs';
import path from 'path';
const ROOT = process.cwd();

/** Decide whether a trimmed line can be the start of a valid source file. */
function isValidStart(line){
  const L = line.trimStart();
  if (!L) return false;
  return (
    L.startsWith('import ') ||
    L.startsWith('export ') ||
    L.startsWith('const ') ||
    L.startsWith('let ') ||
    L.startsWith('var ') ||
    L.startsWith('function ') ||
    L.startsWith('/*') ||
    L.startsWith('//')
  );
}

/** Sanitize a single file (strip BOM, remove junk lines before first valid token). */
function sanitizeFile(fp){
  if (!fs.existsSync(fp)) return { changed:false, reason:'missing' };
  let buf = fs.readFileSync(fp);
  // Strip UTF-8 BOM if present
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF){
    buf = buf.slice(3);
  }
  let txt = buf.toString('utf8');
  const lines = txt.split(/\r?\n/);
  let start = 0;
  for (let i=0;i<lines.length;i++){
    const t = lines[i].trimStart();
    // ignore any known rogue header beginnings or blank lines
    if (isValidStart(t)) { start = i; break; }
  }
  if (start > 0){
    const cleaned = lines.slice(start).join('\n');
    fs.writeFileSync(fp, cleaned, 'utf8');
    return { changed:true, removed:start };
  }
  return { changed:false, removed:0 };
}

/** Recursively gather files under a dir with allowed extensions. */
function gather(dir, exts){
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length){
    const d = stack.pop();
    for (const name of fs.readdirSync(d)){
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { stack.push(p); continue; }
      const ext = path.extname(name).toLowerCase().replace('.','');
      if (exts.has(ext)) out.push(p);
    }
  }
  return out;
}

const targets = new Set([
  path.join(ROOT, 'vite.config.js'),
  ...gather(path.join(ROOT,'src'), new Set(['js','jsx','ts','tsx'])),
  ...gather(path.join(ROOT,'netlify','functions'), new Set(['js','jsx','ts','tsx']))
]);

let changed = 0;
for (const fp of targets){
  const res = sanitizeFile(fp);
  if (res.changed){
    changed++;
    console.log('[sanitize]', 'removed', res.removed, 'leading junk line(s) from', path.relative(ROOT, fp));
  }else if (res.removed === 0){
    console.log('[sanitize] clean', path.relative(ROOT, fp));
  }
}
console.log(`[sanitize] complete — files changed: ${changed}`);
