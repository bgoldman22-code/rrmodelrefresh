
// src/models/hr_scoring.js
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function pct(x){ return Math.round(x * 1000) / 10; }

function toAmerican(prob){
  const p = clamp(prob, 0.005, 0.80);
  const dec = 1 / p;
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `-${Math.round(100 / (dec - 1))}`;
}

function ctxTag(candidate){
  const tags = [];
  if (candidate.platoon && typeof candidate.platoon === 'string'){
    if (/adv|edge|\+/i.test(candidate.platoon)) tags.push("platoon+");
    else if (/dis|minus|-/i.test(candidate.platoon)) tags.push("platoon-");
  }
  if (typeof candidate.park_factor === 'number'){
    if (candidate.park_factor >= 1.05) tags.push("park+");
    else if (candidate.park_factor <= 0.95) tags.push("park-");
  }
  if (typeof candidate.pitcher_hr_per9 === 'number'){
    if (candidate.pitcher_hr_per9 >= 1.3) tags.push("P:HR+");
    else if (candidate.pitcher_hr_per9 <= 0.9) tags.push("P:HR-");
  }
  if (typeof candidate.recent_barrel_rate === 'number'){
    if (candidate.recent_barrel_rate >= 10) tags.push("barrels↑");
    else if (candidate.recent_barrel_rate <= 4) tags.push("barrels↓");
  }
  if (typeof candidate.lineup_slot === 'number'){
    if (candidate.lineup_slot <= 3) tags.push("top-order");
    else if (candidate.lineup_slot >= 7) tags.push("bottom-order");
  }
  return tags;
}

function productionWeight(season_hr){
  const hr = Math.max(0, Number(season_hr) || 0);
  const w = Math.log1p(hr) / Math.log1p(12);
  return clamp(w, 0.5, 1.75);
}

function expectedPA(candidate){
  const pa = Number(candidate.est_pa ?? candidate.exp_pa ?? 4);
  return clamp(pa, 2.8, 5.5);
}

function perGameProbFromPerPA(p_hr_pa, pa){
  const p = clamp(Number(p_hr_pa) || 0.035, 0.002, 0.20);
  const n = expectedPA({exp_pa: pa});
  const stay = Math.pow(1 - p, n);
  return 1 - stay;
}

function scoreHRPick(candidate){
  const base_hr_pa =
    (typeof candidate.hr_pa === 'number' ? candidate.hr_pa :
    typeof candidate.model_hr_pa === 'number' ? candidate.model_hr_pa :
    0.035);

  let mult = 1.0;
  if (typeof candidate.park_factor === 'number') {
    mult *= clamp(1 + (candidate.park_factor - 1) * 0.6, 0.85, 1.15);
  }
  if (typeof candidate.pitcher_hr_per9 === 'number'){
    const adj = (candidate.pitcher_hr_per9 - 1.1) * 0.25;
    mult *= clamp(1 + adj, 0.85, 1.15);
  }
  if (candidate.platoon){
    if (/(adv|edge|\+)/i.test(candidate.platoon)) mult *= 1.05;
    else if (/(dis|minus|-)/i.test(candidate.platoon)) mult *= 0.95;
  }
  if (typeof candidate.recent_barrel_rate === 'number'){
    const b = candidate.recent_barrel_rate;
    if (b >= 12) mult *= 1.06;
    else if (b <= 4) mult *= 0.96;
  }

  const prod_mult = productionWeight(candidate.season_hr);
  mult *= clamp(prod_mult, 0.85, 1.30);

  const pa_est = expectedPA(candidate);
  const hr_pa_adj = clamp(base_hr_pa * mult, 0.003, 0.22);
  const prob_game = perGameProbFromPerPA(hr_pa_adj, pa_est);

  const tags = ctxTag(candidate);
  tags.unshift(`base ${pct(prob_game)}%`);

  const modelAmerican = toAmerican(prob_game);

  return {
    model_hr_pa: hr_pa_adj,
    model_pa: pa_est,
    model_hr_prob: prob_game,
    model_american: modelAmerican,
    why_tags: tags,
    why_text: tags.join("; "),
    // Mirror into "why" so existing UI shows it immediately
    why: tags.join("; "),
    ev_1u: null,
    ev_from: "model"
  };
}

export { scoreHRPick };
export default scoreHRPick;
