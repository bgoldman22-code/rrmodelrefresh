
// src/models/hr_scoring.js
// Calibrated HR scorer with concise WHY tags and safe outputs.
// This file does not depend on frontend; it enriches candidate rows.
// It is safe to call early (before live odds).
//
// Exports:
//   - scoreHRPick(candidate): returns fields merged into the row
//
// Returned fields:
//   model_hr_pa     (per PA baseline, 0..1)
//   model_pa        (expected PA estimate)
//   model_hr_prob   (per-game HR probability, 0..1)
//   model_american  (fair American odds, e.g. "+275")
//   why_tags        (Array<string>)
//   why_text        (string, "short; tag; tag")
//   ev_1u           (number|null)    -> null when live odds missing
//   ev_from         ("live"|"model")  -> "model" if live odds missing
//
// NOTE: EV needs a live odds price to be meaningful. If live odds are not
// available on the row at scoring time, ev_1u is returned as null and ev_from="model".
// The UI can render "—" in that case.

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function pct(x){ return Math.round(x * 1000) / 10; } // 0.1% precision

function toAmerican(prob){
  // Convert probability to American odds (fair), guardrails 0.5%..80%
  const p = clamp(prob, 0.005, 0.80);
  const dec = 1 / p;
  if (dec >= 2) {
    const plus = Math.round((dec - 1) * 100);
    return `+${plus}`;
  } else {
    const minus = Math.round(100 / (dec - 1));
    return `-${minus}`;
  }
}

// Lightweight context extraction with fallbacks
function ctxTag(candidate){
  const tags = [];
  // platoon
  if (candidate.platoon && typeof candidate.platoon === 'string'){
    if (/adv|edge|plus/i.test(candidate.platoon)) tags.push("platoon+");
    else if (/dis|minus/i.test(candidate.platoon)) tags.push("platoon-");
  }
  // park
  if (typeof candidate.park_factor === 'number'){
    if (candidate.park_factor >= 1.05) tags.push("park+");
    else if (candidate.park_factor <= 0.95) tags.push("park-");
  }
  // pitcher HR trait
  if (typeof candidate.pitcher_hr_per9 === 'number'){
    if (candidate.pitcher_hr_per9 >= 1.3) tags.push("P:HR+");
    else if (candidate.pitcher_hr_per9 <= 0.9) tags.push("P:HR-");
  }
  // recent barrels / form
  if (typeof candidate.recent_barrel_rate === 'number'){
    if (candidate.recent_barrel_rate >= 10) tags.push("barrels↑");
    else if (candidate.recent_barrel_rate <= 4) tags.push("barrels↓");
  }
  // lineup slot
  if (typeof candidate.lineup_slot === 'number'){
    if (candidate.lineup_slot <= 3) tags.push("top-order");
    else if (candidate.lineup_slot >= 7) tags.push("bottom-order");
  }
  return tags;
}

// Production-weight multiplier (log1p normalized around ~12 HR)
function productionWeight(season_hr){
  const hr = Math.max(0, Number(season_hr) || 0);
  const w = Math.log1p(hr) / Math.log1p(12);
  return clamp(w, 0.5, 1.75);
}

function expectedPA(candidate){
  // Use candidate provided PA estimate if present, else 4.0 default
  const pa = Number(candidate.est_pa ?? candidate.exp_pa ?? 4);
  return clamp(pa, 2.8, 5.5);
}

function perGameProbFromPerPA(p_hr_pa, pa){
  // P(HR in game) = 1 - (1 - p)^pa
  const p = clamp(Number(p_hr_pa) || 0.035, 0.002, 0.20); // 0.2 upper guard
  const n = expectedPA({exp_pa: pa});
  const stay = Math.pow(1 - p, n);
  return 1 - stay;
}

function scoreHRPick(candidate){
  // Baseline per-PA HR rate
  const base_hr_pa =
    (typeof candidate.hr_pa === 'number' ? candidate.hr_pa :
    typeof candidate.model_hr_pa === 'number' ? candidate.model_hr_pa :
    0.035); // safe default

  // Small contextual multipliers (deterministic)
  let mult = 1.0;

  // park
  if (typeof candidate.park_factor === 'number') {
    mult *= clamp(1 + (candidate.park_factor - 1) * 0.6, 0.85, 1.15);
  }
  // pitcher HR trait
  if (typeof candidate.pitcher_hr_per9 === 'number'){
    const adj = (candidate.pitcher_hr_per9 - 1.1) * 0.25; // ~±0.05 @ extremes
    mult *= clamp(1 + adj, 0.85, 1.15);
  }
  // platoon
  if (candidate.platoon){
    if (/(adv|edge|\+)/i.test(candidate.platoon)) mult *= 1.05;
    else if (/(dis|minus|-)/i.test(candidate.platoon)) mult *= 0.95;
  }
  // barrels recent
  if (typeof candidate.recent_barrel_rate === 'number'){
    const b = candidate.recent_barrel_rate;
    if (b >= 12) mult *= 1.06;
    else if (b <= 4) mult *= 0.96;
  }

  // production weight (log1p)
  const prod_mult = productionWeight(candidate.season_hr);
  mult *= clamp(prod_mult, 0.85, 1.30); // cap its influence in-game

  const pa_est = expectedPA(candidate);
  const hr_pa_adj = clamp(base_hr_pa * mult, 0.003, 0.22);
  const prob_game = perGameProbFromPerPA(hr_pa_adj, pa_est);

  // WHY tags
  const tags = ctxTag(candidate);
  // Always include a compact base marker
  tags.unshift(`base ${pct(prob_game)}%`);

  const modelAmerican = toAmerican(prob_game);

  // EV requires live odds; default to null if not available yet
  const ev_1u = null; // UI should show "—" until live odds join
  const ev_from = "model";

  return {
    model_hr_pa: hr_pa_adj,
    model_pa: pa_est,
    model_hr_prob: prob_game,
    model_american: modelAmerican,
    why_tags: tags,
    why_text: tags.join("; "),
    ev_1u,
    ev_from
  };
}

export { scoreHRPick };
export default scoreHRPick;
