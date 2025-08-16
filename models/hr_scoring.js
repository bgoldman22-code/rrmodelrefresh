\
// models/hr_scoring.js
function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function toAmerican(p){
  const x = clamp(p, 1e-6, 0.999999);
  if (x >= 0.5) return -Math.round(100 * x / (1-x));
  return Math.round(100 * (1-x) / x);
}

export function scoreHRPick(p){
  const name = String(p.name||"");
  const ANCHORS = new Set(["Kyle Schwarber","Shohei Ohtani","Cal Raleigh","Juan Soto","Aaron Judge","Yordan Alvarez","Pete Alonso","Gunnar Henderson","Matt Olson","Corey Seager","Marcell Ozuna","Kyle Tucker","Rafael Devers"]);
  const anchor = ANCHORS.has(name);
  let base_pa = anchor ? 0.045 : 0.035;

  if (p.iso != null && Number.isFinite(Number(p.iso))){
    const iso = Number(p.iso);
    const adj = clamp((iso - 0.170) * 0.025, -0.005, 0.005);
    base_pa += adj;
  }
  if (p.barrelRate != null && Number.isFinite(Number(p.barrelRate))){
    const br = Number(p.barrelRate);
    const adj = clamp((br - 0.07) * 0.04, -0.004, 0.004);
    base_pa += adj;
  }
  if (p.recentHRperPA != null && Number.isFinite(Number(p.recentHRperPA))){
    const r = Number(p.recentHRperPA);
    const diff = r - base_pa;
    base_pa += clamp(diff * 0.35, -0.004, 0.004);
  }
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

  const facts = [];
  if (p.barrelRate != null && Number.isFinite(Number(p.barrelRate))) facts.push(`barrel ~${(p.barrelRate*100).toFixed(1)}%`);
  if (p.iso != null && Number.isFinite(Number(p.iso))) facts.push(`ISO ${(Number(p.iso)).toFixed(3)}`);
  if (p.recentHRperPA != null && Number.isFinite(Number(p.recentHRperPA))) facts.push(`L15 HR/PA ${(p.recentHRperPA*100).toFixed(1)}%`);
  if (p.starterHR9 != null && Number.isFinite(Number(p.starterHR9))) facts.push(`opp ${Number(p.starterHR9).toFixed(2)} HR/9`);
  const ctx = [];
  if (p.game) ctx.push(p.game);
  if (p.venue) ctx.push(p.venue);
  if (p.expPA) ctx.push(`~${p.expPA} PA`);
  out.why2 = `${name}${p.oppThrows?` vs ${String(p.oppThrows).toUpperCase()}HP`:''} — ${ctx.join(' | ')} — ${facts.slice(0,3).join(' • ')}`;

  return out;
}
