// src/models/hr_scoring.js
// Dialed-in HR scoring focused on BOMBS, not EV fishing.
// Safe with missing fields; everything has sane defaults.

// ---------- small helpers ----------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const amerToProb = (american) => {
  const a = Number(american);
  if (!isFinite(a)) return null;
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
};

// Probability of >=1 HR in N PA with per-PA HR prob r
const pAtLeastOne = (r, pa) => 1 - Math.pow(1 - clamp(r, 0, 0.5), clamp(pa || 4, 1, 6));

// ---------- weights / config ----------
export const HR_WEIGHTS = {
  // Request: smaller weather effect; park meaningful; keep noise in check
  parkExp: 0.35,
  weatherExp: 0.15,
  pitchExp: 0.25,
  zoneExp: 0.25,
  bvpExp: 0.15,     // small tap for BvP
  starterExp: 0.40, // how much starter HR/9 matters
  powerMaxBoost: 0.12, // cap extra for true sluggers
  powerMaxPenalty: -0.08, // cap penalty for light hitters
  hotColdMaxBoost: 0.10, // 10% bump if scorching
  hotColdMaxPenalty: -0.07, // 7% if ice cold
  blendModel: 0.8,  // p_final = 0.8 * model + 0.2 * odds (shrunk)
  blendOdds: 0.2,
  oddsCap: 0.40,    // don't trust lines > 40% for HR props
  minPowerFloor: 0.030, // per-PA HR% power floor to avoid backup Cs, etc.
  allowIfSupportAny: { park: 1.05, starter: 1.10, hot: 1.5 }, // override floor if any condition strong
};

// ---------- main score ----------
export function scoreHRPick(candidate) {
  // expected inputs (optional, will default):
  // candidate: {
  //   name, team, gameId, oddsAmerican,
  //   basePerPA,        // per-PA HR rate baseline (season/career blend)
  //   expPA,            // expected PA (default 4)
  //   parkMult, wxMult, pitchMult, zoneMult, bvpMult, // all default 1.0
  //   starterHR9, lgHR9, // for matchup vs starter (defaults neutral)
  //   recentHR14, recentPA14, // hot/cold
  //   iso, barrels,     // power hints (optional)
  // }

  const W = HR_WEIGHTS;

  const perPA = Number(candidate?.basePerPA ?? candidate?.hr_base ?? candidate?.hr_prob_sim ?? 0.06); // sane default ~6%
  const expPA = Number(candidate?.expPA ?? 4);

  let pGame = pAtLeastOne(perPA, expPA);

  const park = clamp(Number(candidate?.parkMult ?? 1), 0.7, 1.4);
  const wx   = clamp(Number(candidate?.wxMult ?? 1), 0.8, 1.3);
  const pitch= clamp(Number(candidate?.pitchMult ?? 1), 0.8, 1.3);
  const zone = clamp(Number(candidate?.zoneMult ?? 1), 0.8, 1.3);
  const bvp  = clamp(Number(candidate?.bvpMult ?? 1), 0.8, 1.25);

  const lgHR9 = Number(candidate?.lgHR9 ?? 1.10); // MLB-ish baseline
  const stHR9 = Number(candidate?.starterHR9 ?? lgHR9);
  const starterRatio = clamp(stHR9 / (lgHR9 || 1.10), 0.7, 1.5);

  // Power: prefer actual ISO/barrels, else proxy from per-PA
  const iso = Number(candidate?.iso ?? NaN);
  const barrels = Number(candidate?.barrels ?? NaN);
  const powerProxy = isFinite(iso) ? (0.6*iso + 0.4*(perPA*3.0)) : (perPA*2.5);
  const powerAdj = clamp((powerProxy - 0.15) * 0.8, W.powerMaxPenalty, W.powerMaxBoost) + 1.0;

  // Hot/cold from last 14 days vs season baseline
  const r14 = (Number(candidate?.recentHR14||0)) / Math.max(1, Number(candidate?.recentPA14||0));
  const hotRatio = isFinite(r14) && perPA>0 ? clamp((r14 / perPA), 0.5, 2.0) : 1.0;
  const hotAdj = hotRatio>=1
    ? 1 + Math.min(W.hotColdMaxBoost, (hotRatio-1)*0.10)
    : 1 + Math.max(W.hotColdMaxPenalty, (hotRatio-1)*0.10);

  // Multiply controlled by exponents to reduce noise
  const mult =
    Math.pow(park,  W.parkExp) *
    Math.pow(wx,    W.weatherExp) *
    Math.pow(pitch, W.pitchExp) *
    Math.pow(zone,  W.zoneExp) *
    Math.pow(bvp,   W.bvpExp) *
    Math.pow(starterRatio, W.starterExp) *
    powerAdj * hotAdj;

  const pModel = clamp(pGame * mult, 0.01, 0.60);

  // odds blend (shrunken) — used lightly
  const pOdds = amerToProb(candidate?.oddsAmerican);
  const pBlend = pOdds==null
    ? pModel
    : clamp(W.blendModel*pModel + W.blendOdds*Math.min(pOdds, W.oddsCap), 0.01, 0.60);

  // EV (as tie-breaker)
  const a = Number(candidate?.oddsAmerican ?? NaN);
  const dec = isFinite(a) ? (a>0 ? 1 + a/100 : 1 + 100/Math.abs(a)) : null;
  const ev = dec ? (pBlend*dec - (1 - pBlend)) : null;

  // power floor filter (avoid low-power longshots unless supported by context)
  const powerFloorFail = perPA < HR_WEIGHTS.minPowerFloor;
  const allow =
    (park >= HR_WEIGHTS.allowIfSupportAny.park) ||
    (starterRatio >= HR_WEIGHTS.allowIfSupportAny.starter) ||
    (hotRatio >= HR_WEIGHTS.allowIfSupportAny.hot);

  const filtered = powerFloorFail && !allow;

  // reason text (2 sentences)
  const reasons = [];
  reasons.push(`${candidate?.name||"This batter"}’s baseline suggests ~${(perPA*100).toFixed(1)}% HR per PA and ~${expPA} expected PAs; park ${fmtMult(park)} and starter HR profile ${fmtMult(starterRatio)} adjust the game-long chance to ${(pModel*100).toFixed(1)}%.`);
  const ctxPieces = [];
  if (hotRatio>1.05) ctxPieces.push("hot last 14d");
  if (hotRatio<0.95) ctxPieces.push("cool last 14d");
  if (pitch!==1) ctxPieces.push(`pitch mix ${fmtMult(pitch)}`);
  if (zone!==1) ctxPieces.push(`zone fit ${fmtMult(zone)}`);
  if (bvp!==1) ctxPieces.push(`BvP ${fmtMult(bvp)}`);
  if (wx!==1) ctxPieces.push(`weather ${fmtMult(wx)}`);
  if (powerAdj!==1) ctxPieces.push(`power ${fmtMult(powerAdj)}`);
  reasons.push(ctxPieces.length ? `Context: ${ctxPieces.join(", ")}.` : "Context: neutral factors.");

  return {
    ...candidate,
    p_model: pModel,
    p_blended: pBlend,
    ev,
    filtered,
    hotRatio,
    starterRatio,
    park,
    wx,
    pitch,
    zone,
    bvp,
    reasons
  };
}

function fmtMult(x){
  if (!isFinite(x)) return "×1.00";
  const d = (x>=1 ? "+" : "") + ((x-1)*100).toFixed(0) + "%";
  return `×${x.toFixed(2)} (${d})`;
}
