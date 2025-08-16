\
// models/hr_scoring.js
import { normalizePlayerName } from "../src/lib/common/name_map.js";

const POWER_ANCHORS = new Set([
  "Kyle Schwarber","Shohei Ohtani","Cal Raleigh","Juan Soto","Aaron Judge",
  "Yordan Alvarez","Pete Alonso","Gunnar Henderson","Matt Olson","Corey Seager",
  "Marcell Ozuna","Kyle Tucker","Rafael Devers"
]);

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function toAmerican(p){
  const x = clamp(p, 1e-6, 0.999999);
  if (x >= 0.5) return -Math.round(100 * x / (1-x));
  return Math.round(100 * (1-x) / x);
}

function pickFacts(p){
  const facts = [];
  // Prefer concrete numbers if present
  if (p.barrelRate != null){
    const br = Number(p.barrelRate);
    if (Number.isFinite(br)) facts.push(`barrel rate ~${(br*100).toFixed(1)}%`);
  }
  if (p.iso != null){
    const iso = Number(p.iso);
    if (Number.isFinite(iso)) facts.push(`ISO ${(iso).toFixed(3)}`);
  }
  if (p.recentHRperPA != null){
    const r = Number(p.recentHRperPA);
    if (Number.isFinite(r)) facts.push(`last-15 HR/PA ${(r*100).toFixed(1)}%`);
  }
  if (p.starterHR9 != null){
    const s = Number(p.starterHR9);
    if (Number.isFinite(s)) facts.push(`opp starter ${s.toFixed(2)} HR/9`);
  }
  if (p.fbPct != null){
    const f = Number(p.fbPct);
    if (Number.isFinite(f)) facts.push(`flyball rate ${(f*100).toFixed(0)}%`);
  }
  if (p.pullPct != null){
    const g = Number(p.pullPct);
    if (Number.isFinite(g)) facts.push(`pull rate ${(g*100).toFixed(0)}%`);
  }
  // Ensure at least one angle
  if (!facts.length){
    const nm = normalizePlayerName(p.name||"");
    if (POWER_ANCHORS.has(nm)) facts.push("established top-tier power");
    else facts.push("solid power baseline with everyday volume");
  }
  // build text, prefer 2-3 items
  const sel = facts.slice(0,3);
  return sel.join(" • ");
}

export function scoreHRPick(p){
  const name = normalizePlayerName(p.name||"");
  const anchor = POWER_ANCHORS.has(name);

  let base_pa = anchor ? 0.045 : 0.035;

  // ISO adjustment (±0.5 pp)
  if (p.iso != null && Number.isFinite(Number(p.iso))){
    const iso = Number(p.iso);
    const adj = clamp((iso - 0.170) * 0.025, -0.005, 0.005);
    base_pa += adj;
  }
  // Barrel rate per PA (±0.4 pp)
  if (p.barrelRate != null && Number.isFinite(Number(p.barrelRate))){
    const br = Number(p.barrelRate); // assume fraction per PA
    const adj = clamp((br - 0.07) * 0.04, -0.004, 0.004);
    base_pa += adj;
  }
  // Recent form (±0.4 pp)
  if (p.recentHRperPA != null && Number.isFinite(Number(p.recentHRperPA))){
    const r = Number(p.recentHRperPA);
    const diff = r - base_pa;
    base_pa += clamp(diff * 0.35, -0.004, 0.004);
  }
  // Handedness split tiny nudge (±0.2 pp)
  if (p.bats && p.oppThrows){
    const batsL = /^L/i.test(String(p.bats));
    const oppR = /^R/i.test(String(p.oppThrows));
    const isoSplit = oppR ? p.iso_vs_rhp : p.iso_vs_lhp;
    if (isoSplit != null && Number.isFinite(Number(isoSplit))){
      const isv = Number(isoSplit);
      const adj = clamp((isv - 0.170) * 0.02, -0.002, 0.002);
      base_pa += adj;
    } else {
      if ((batsL && oppR) || (!batsL && !oppR)) base_pa += 0.0005;
    }
  }
  // Opp starter HR/9 (±0.3 pp)
  if (p.starterHR9 != null && Number.isFinite(Number(p.starterHR9))){
    const hr9 = Number(p.starterHR9);
    const adj = clamp((hr9 - 1.1) * 0.0015, -0.003, 0.003);
    base_pa += adj;
  }

  base_pa = clamp(base_pa, 0.010, 0.080);
  const pa = Number.isFinite(Number(p.expPA)) ? Number(p.expPA) : 4;
  const p_game = 1 - Math.pow(1 - base_pa, clamp(pa, 2, 5));

  const out = { ...p };
  out.p_base_pa = base_pa;
  out.p_game = p_game;
  out.p_final = p_game;
  out.modelAmerican = toAmerican(out.p_final);

  // WHY: human-ish, concise
  const elems = [];
  const vs = (p.oppThrows ? ` vs ${String(p.oppThrows).toUpperCase()}HP` : "");
  elems.push(`${normalizePlayerName(p.name||"")}${vs}`);
  elems.push(pullQuickContext(p));
  const facts = pickFacts(p);
  if (facts) elems.push(facts);
  out.why2 = elems.filter(Boolean).join(" — ");

  return out;
}

function pullQuickContext(p){
  const parts = [];
  if (p.game) parts.push(p.game);
  if (p.venue) parts.push(p.venue);
  const ctx = [];
  if (p.expPA) ctx.push(`~${p.expPA} PA`);
  if (p.home && p.away) ctx.push("park neutral");
  if (ctx.length) parts.push(ctx.join(", "));
  return parts.join(" | ");
}
