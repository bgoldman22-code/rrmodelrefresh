
// scripts/sanitize-mlb.js
// 1) remove any stray junk first line that Netlify occasionally prepends
// 2) ensure MLB.jsx imports scoreHRPick
// 3) ensure candidates are mapped through scoreHRPick
// Idempotent: running multiple times won't duplicate injections.

import fs from "fs";
import path from "path";

function stripGarbage(filePath){
  if (!fs.existsSync(filePath)) return { changed:false, removed:0 };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  let removed = 0;
  // If first line looks like garbage (starts with a quote or angle bracket), drop it
  if (lines.length && /^[<"\uFEFF]/.test(lines[0])){
    lines.shift(); removed++;
  }
  const cleaned = lines.join("\n");
  if (cleaned !== raw){
    fs.writeFileSync(filePath, cleaned, "utf8");
    return { changed:true, removed };
  }
  return { changed:false, removed:0 };
}

function ensureImport(filePath){
  let src = fs.readFileSync(filePath, "utf8");
  if (!/from\s+["']\.\/models\/hr_scoring\.js["']/.test(src)){
    // Place after React import
    src = src.replace(
      /(import\s+React[^;]+;\s*)/,
      `$1\nimport { scoreHRPick } from "./models/hr_scoring.js";\n`
    );
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

function injectScorerMap(filePath){
  let src = fs.readFileSync(filePath, "utf8");
  if (/\.map\s*\(\s*c\s*=>\s*\(\s*{\s*\.\.\.c\s*,\s*model_hr_prob/.test(src)){
    // Already injected
    return false;
  }
  // Find a normalization line like: let cands = normalizeCandidates(...)
  const pat = /(let\s+cands\s*=\s*[^;]+;)/;
  if (pat.test(src)){
    src = src.replace(pat, `$1\n// Inject scorer mapping (idempotent)\ncands = cands.map(c => ({ ...c, ...scoreHRPick(c) }));`);
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

function run(){
  const mlbPath = path.join("src","MLB.jsx");
  const garbage = stripGarbage(mlbPath);
  const imp = ensureImport(mlbPath);
  const inj = injectScorerMap(mlbPath);

  console.log(`[sanitize] MLB.jsx: garbageRemoved=${garbage.removed} importAdded=${imp} scorerInjected=${inj}`);
}

run();
