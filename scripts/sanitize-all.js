// scripts/sanitize-all.js
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.netlify']);
const EXT_OK = new Set(['.js', '.jsx', '.ts', '.tsx']);

function isValidStart(line) {
  const L = line.trimStart();
  return (
    L.startsWith('import ') ||
    L.startsWith('export ') ||
    L.startsWith('//') ||
    L.startsWith('/*') ||
    L.startsWith('/**') ||
    L.startsWith('const ') ||
    L.startsWith('let ') ||
    L.startsWith('var ') ||
    L.startsWith('function ') ||
    L.startsWith('class ') ||
    L.startsWith('#!')
  );
}
function stripBOM(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3);
  return buf;
}
function sanitizeFile(filePath) {
  try {
    let buf = fs.readFileSync(filePath);
    buf = stripBOM(buf);
    let text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
      if (isValidStart(lines[i])) { start = i; break; }
    }
    if (start > 0) {
      const cleaned = lines.slice(start).join('\n');
      fs.writeFileSync(filePath, cleaned, 'utf8');
      console.log(`[sanitize] fixed ${filePath} (removed ${start} leading line(s))`);
      return true;
    }
  } catch (e) {
    console.log(`[sanitize] skip ${filePath}: ${e.message}`);
  }
  return false;
}
function walk(dir, outChanged) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(p, outChanged);
    } else {
      const ext = path.extname(ent.name).toLowerCase();
      if (EXT_OK.has(ext)) {
        const changed = sanitizeFile(p);
        if (changed) outChanged.push(p);
      }
    }
  }
}
const changed = [];
walk(ROOT, changed);
['src/MLB.jsx','vite.config.js','src/lib/common/name_map.js','netlify/functions/get_model_log.ts'].forEach(p=>{
  try{ const t = fs.readFileSync(p,'utf8').split(/\r?\n/).slice(0,2).join('\n'); console.log(`[HEAD] ${p}\n${t}`);}catch{}
});
console.log(`[sanitize] done. Files changed: ${changed.length}`);
