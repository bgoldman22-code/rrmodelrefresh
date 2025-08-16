
// scripts/sanitize-mlb.js
import fs from "fs";
import path from "path";

const mlbPath = path.join("src","MLB.jsx");

function stripGarbage(filePath){
  if (!fs.existsSync(filePath)) return { changed:false, removed:0 };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  let removed = 0;
  if (lines.length && /^[<"\uFEFF]/.test(lines[0])){ lines.shift(); removed++; }
  const cleaned = lines.join("\n");
  if (cleaned !== raw){ fs.writeFileSync(filePath, cleaned, "utf8"); }
  return { changed: cleaned !== raw, removed };
}

function ensureImportScorer(filePath){
  let src = fs.readFileSync(filePath, "utf8");
  let changed = false;
  if (!/from\s+["']\.\/models\/hr_scoring\.js["']/.test(src)){
    src = src.replace(
      /(import\s+React[^;]+;\s*)/,
      `$1\nimport { scoreHRPick } from "./models/hr_scoring.js";\n`
    );
    changed = true;
  }
  if (!/from\s+["']\.\/lib\/ev_math\.js["']/.test(src)){
    src = src.replace(
      /(import\s+React[^;]+;\s*(?:\n.*)*)/,
      `$1\nimport { ev1u } from "./lib/ev_math.js";\n`
    );
    changed = true;
  }
  if (changed) fs.writeFileSync(filePath, src, "utf8");
  return changed;
}

function injectScorerAndEV(filePath){
  let src = fs.readFileSync(filePath, "utf8");
  let changed = false;

  // After: let cands = normalizeCandidates(...);
  if (!/scoreHRPick\(/.test(src)){
    src = src.replace(
      /(let\s+cands\s*=\s*[^;]+;\s*)/,
      `$1\n// attach calibrated fields + WHY\ncands = cands.map(c => ({ ...c, ...scoreHRPick(c) }));\n`
    );
    changed = true;
  }

  // Ensure EV uses live odds when present; otherwise stays null
  if (!/ev1u\(/.test(src) || !/ev_1u/.test(src)){
    src = src.replace(
      /(cands\s*=\s*cands\.map\(c\s*=>\s*\(\{\s*\.\.\.c[^}]*\}\)\)\s*;)?/m,
      (m) => m + `\n// compute EV from live odds if present\ncands = cands.map(c => {\n  const live = c.live_american || c.liveOdds || c.american || c.live;\n  const ev = ev1u(c.model_hr_prob, live);\n  return { ...c, ev_1u: (ev === null || Number.isNaN(ev)) ? null : ev };\n});\n`
    );
    changed = true;
  }

  // Ensure WHY string is present for UI that reads 'row.why'
  if (!/why:\s*c\.why_text/.test(src)){
    src = src.replace(
      /(cands\s*=\s*cands\.map\(c\s*=>\s*\(\{\s*\.\.\.c[^}]*\}\)\s*;)?/m,
      (m) => m + `\n// mirror why_text into why for legacy UI\ncands = cands.map(c => ({ ...c, why: c.why_text || c.why || (Array.isArray(c.why_tags) ? c.why_tags.join('; ') : '') }));\n`
    );
    changed = true;
  }

  if (changed) fs.writeFileSync(filePath, src, "utf8");
  return changed;
}

function run(){
  const gar = stripGarbage(mlbPath);
  const imp = ensureImportScorer(mlbPath);
  const inj = injectScorerAndEV(mlbPath);
  console.log(`[sanitize] MLB.jsx garbageRemoved=${gar.removed} importChanged=${imp} mappingChanged=${inj}`);
}
run();
