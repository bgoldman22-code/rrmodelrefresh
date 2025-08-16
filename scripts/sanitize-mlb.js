// scripts/sanitize-mlb.js
// Keeps prior behavior (remove stray first-line garbage) AND injects scoreHRPick usage.
// Safe to run repeatedly; it won't double-inject.

import fs from "fs";
import path from "path";
const MLB = path.join(process.cwd(), "src", "MLB.jsx");

function stripGarbageHead(src){
  const lines = src.split(/\r?\n/);
  // Remove leading line if it starts with a quote or unexpected token like the Netlify header
  if (lines.length && (/^["']\s?account_id=/.test(lines[0]) || /^<\!doctype/i.test(lines[0]) )){
    lines.shift();
    return {text: lines.join("\n"), removed: 1};
  }
  return {text: src, removed: 0};
}

function ensureImport(text){
  if (text.includes('from "./models/hr_scoring.js"')) return {text, added: false};
  const lines = text.split(/\r?\n/);
  let lastImportIdx = -1;
  for (let i=0;i<lines.length;i++){
    if (/^\s*import\s+/.test(lines[i])) lastImportIdx = i;
  }
  const importLine = 'import { scoreHRPick } from "./models/hr_scoring.js";';
  if (lastImportIdx >= 0){
    lines.splice(lastImportIdx+1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return {text: lines.join("\n"), added: true};
}

function injectScorer(text){
  if (text.includes("scoreHRPick(") && text.includes("...scoreHRPick")) {
    return {text, injected: false};
  }
  // Look for a line that declares cands from normalize or similar usage.
  const candDecl = /(\b(?:let|const)\s+cands\s*=\s*[^;]+;)/;
  const m = candDecl.exec(text);
  if (!m) return {text, injected: false};
  const insert = '\n  // ⬇︎ Injected: apply calibrated scorer to each candidate\n  cands = cands.map(c => ({ ...c, ...scoreHRPick(c) }));\n';
  const newText = text.replace(candDecl, (full)=> full + insert);
  return {text: newText, injected: true};
}

try{
  let src = fs.readFileSync(MLB, "utf8");
  const res1 = stripGarbageHead(src);
  let out = res1.text;

  const res2 = ensureImport(out);
  out = res2.text;

  const res3 = injectScorer(out);
  out = res3.text;

  fs.writeFileSync(MLB, out, "utf8");

  const msgs = [];
  if (res1.removed) msgs.push(`[sanitize] removed ${res1.removed} leading garbage line(s)`);
  msgs.push(`[sanitize] import ${res2.added ? "added" : "kept"}`);
  msgs.push(`[sanitize] scorer ${res3.injected ? "injected" : "kept"}`);
  console.log(msgs.join(" • "));
} catch (e){
  console.error("[sanitize] failed:", e?.message || e);
  process.exit(0); // don't fail the build on sanitize
}
