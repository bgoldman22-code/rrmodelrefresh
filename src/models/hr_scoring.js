// src/models/hr_scoring.js
// Context-aware HR probability + WHY + correct EV(1u) from odds.
// Zero-edit drop-in: returns { prob_pp, model_odds, why, ev_1u }.
// If your UI already uses scoreHRPick, this will immediately fix
// unrealistic probabilities and EV mirroring probability.

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

function americanFromProb(p){
  p = clamp(p, 1e-6, 0.999999);
  const dec = (1 - p) / p;
  const am = dec >= 1 ? Math.round(dec * 100) : Math.round(-100 / dec);
  return (am > 0 ? "+" : "") + String(am);
}

function decimalFromAmerican(a){
  if (a == null || a === "-" ) return null;
  const s = String(a).trim();
  const n = Number(s.replace("+",""));
  if (!isFinite(n) || n === 0) return null;
  return (n >= 100) ? (1 + n/100) : (1 + 100/Math.abs(n));
}

function ev1u(p, american){
  const dec = decimalFromAmerican(american);
  if (!dec) return null;
  // EV for staking 1 unit: p*(dec-1) - (1-p)
  const ev = p*(dec-1) - (1-p);
  return Math.round((ev + Number.EPSILON) * 1000) / 1000; // 3 dp
}

function perGameFromHRPA(hr_pa, pas){
  // Convert per-PA HR rate to per-game
  const pa = Math.max(1, Math.round(pas || 4));
  const q = clamp(1 - (hr_pa || 0.035), 0.0001, 0.9999);
  const p_game = 1 - Math.pow(q, pa);
  return clamp(p_game, 0.003, 0.40);
}

// --- Context multipliers (soft, capped) ---
function multFromPark(f){
  if (f == null || isNaN(f)) return 1.0;
  const adj = 0.5 + 0.5 * clamp(f, 0.7, 1.3);
  return clamp(adj, 0.9, 1.1);
}
function multFromPitcherHR9(hr9){
  if (hr9 == null || isNaN(hr9)) return 1.0;
  const rel = hr9 / 1.2;
  const m = 1 + clamp(rel - 1, -0.4, 0.4) * 0.6; // ±24% cap pre-clamp
  return clamp(m, 0.76, 1.24);
}
function multFromPlatoon(bats, throws){
  if (!bats || !throws) return 1.0;
  const same = (bats[0].toUpperCase() === throws[0].toUpperCase());
  return same ? 0.95 : 1.10;
}
function multFromBarrels(barrelRate){
  if (barrelRate == null || isNaN(barrelRate)) return 1.0;
  const rel = clamp((barrelRate - 0.07) / 0.06, -1.5, 1.5);
  return clamp(1 + rel * 0.10, 0.85, 1.15);
}
function multFromLineup(spot){
  if (spot == null || isNaN(spot)) return 1.0;
  if (spot <= 4) return 1.05;
  if (spot <= 6) return 1.02;
  return 1.00;
}

function pickSignals(detail){
  const entries = [
    ["park", detail.park_mult, (v)=> v>1.02 ? "park boost" : (v<0.98 ? "park dampener" : null)],
    ["pitcher", detail.pitcher_mult, (v)=> v>1.05 ? "pitcher HR-prone" : (v<0.95 ? "tough pitcher" : null)],
    ["platoon", detail.platoon_mult, (v)=> v>1.02 ? "platoon edge" : (v<0.98 ? "same-hand" : null)],
    ["barrels", detail.barrel_mult, (v)=> v>1.03 ? "barrels trending up" : (v<0.97 ? "barrels cooler" : null)],
    ["lineup", detail.lineup_mult, (v)=> v>1.01 ? "prime lineup spot" : null],
  ];
  const out = [];
  for (const [k,m,lab] of entries){
    if (m == null) continue;
    const tag = lab(m);
    if (tag) out.push({k, tag, m});
  }
  out.sort((a,b)=> Math.abs(b.m-1)-Math.abs(a.m-1));
  return out.slice(0,3).map(x=>x.tag);
}

function buildWhy(c){
  const { batter_name, game, detail } = c;
  const shortGame = game || (c.opp_team && c.team ? `${c.team}@${c.opp_team}` : "AWY@HOM");
  const approxPAs = Math.max(1, Math.round(c.pas || 4));

  const tags = pickSignals(detail);
  const fun = [];
  if (detail.pitcher_hr9 != null){
    fun.push(`opposing pitcher at ${detail.pitcher_hr9.toFixed(2)} HR/9 (${detail.pitcher_mult>1? "above":"below"} avg)`);
  }
  if (detail.park_factor != null){
    fun.push(`park factor ~${detail.park_factor.toFixed(2)} for HRs`);
  }
  if (detail.barrel_rate != null){
    fun.push(`recent barrel rate ${Math.round(detail.barrel_rate*100)}%`);
  }
  if (detail.lineup_spot != null){
    fun.push(`projected lineup spot ${detail.lineup_spot}`);
  }

  const lead = `${batter_name || c.player || "—"} (${shortGame}) — ~${approxPAs} PAs`;
  const tagLine = tags.length ? `Context: ${tags.join(", ")}.` : "";
  const funLine = fun.length ? `Notes: ${fun.slice(0,2).join("; ")}.` : "";
  return [lead, tagLine, funLine].filter(Boolean).join(" ");
}

// Optional conservative shrink if your upstream skipped calibration.
// This keeps top bats in a realistic 10–18% most days.
function shrink(p){ return clamp(p * 0.65, 0.003, 0.40); }

export function scoreHRPick(cand){
  const hr_pa = cand.base_hr_pa ?? cand.hr_pa ?? 0.035;
  const pas = cand.pas ?? cand.pa_est ?? 4;
  const baseProb = perGameFromHRPA(hr_pa, pas);

  const park_mult   = multFromPark(cand.park_hr_factor);
  const pitcher_mult= multFromPitcherHR9(cand.pitcher_hr9);
  const platoon_mult= multFromPlatoon(cand.batter_bats, cand.pitcher_throws);
  const barrel_mult = multFromBarrels(cand.barrel_rate_50pa ?? cand.barrel_rate);
  const lineup_mult = multFromLineup(cand.lineup_spot);

  const finalMult = clamp(park_mult * pitcher_mult * platoon_mult * barrel_mult * lineup_mult, 0.75, 1.25);
  const prob_raw = clamp(baseProb * finalMult, 0.003, 0.40);
  const prob = shrink(prob_raw); // temporary realism clamp until full calibration restored

  const model_odds = americanFromProb(prob);

  const detail = {
    park_factor: cand.park_hr_factor ?? null,
    pitcher_hr9: (cand.pitcher_hr9 ?? null),
    batter_bats: cand.batter_bats ?? null,
    pitcher_throws: cand.pitcher_throws ?? null,
    barrel_rate: cand.barrel_rate_50pa ?? cand.barrel_rate ?? null,
    lineup_spot: cand.lineup_spot ?? null,
    park_mult, pitcher_mult, platoon_mult, barrel_mult, lineup_mult,
  };

  const why = buildWhy({
    batter_name: cand.player || cand.batter_name,
    team: cand.team,
    opp_team: cand.opp,
    game: cand.game,
    pas,
    detail
  });

  // If your pipeline injects live odds onto the candidate (cand.live_odds),
  // compute EV right here so UI shows correct value without any extra code.
  const chosenOdds = (cand.live_odds ?? cand.model_odds ?? model_odds);
  const ev = ev1u(prob, chosenOdds);

  return {
    prob_pp: Math.round(prob*1000)/10,  // percentage points with 0.1 precision
    model_odds,
    why,
    ev_1u: ev
  };
}
