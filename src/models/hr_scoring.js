// src/models/hr_scoring.js
// Bombs-first v2: shrinks baselines, penalizes low-power roles, blends odds lightly.
// Safe fallbacks for missing fields; all inputs optional.

// ---------------- helpers ----------------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function amerToProb(american){
  const a = Number(american);
  if(!isFinite(a)) return null;
  return a>0 ? 100/(a+100) : Math.abs(a)/(Math.abs(a)+100);
}

function pAtLeastOne(perPA, expPA){
  const r = clamp(perPA||0, 0, 0.5);
  const n = clamp(expPA||4, 1, 6);
  return 1 - Math.pow(1 - r, n);
}

// Empirical-Bayes shrinkage for rates (HR/PA)
function ebRate(hr, pa, priorPA=300, priorRate=0.035){
  const H = Math.max(0, Number(hr)||0);
  const P = Math.max(0, Number(pa)||0);
  const alpha = priorRate * priorPA;
  const beta  = (1 - priorRate) * priorPA;
  const post  = (H + alpha) / (P + alpha + beta);
  return post;
}

// Expected PA by lineup slot (rough)
function expectedPAFromSlot(slot){
  const s = Number(slot);
  if(!isFinite(s)) return 4.0;
  if(s<=2) return 4.6;
  if(s<=5) return 4.4;
  if(s<=7) return 4.1;
  return 3.8;
}

function fmtMult(x){
  if(!isFinite(x)) return "×1.00";
  const d = (x>=1 ? "+" : "") + ((x-1)*100).toFixed(0) + "%";
  return `×${x.toFixed(2)} (${d})`;
}

// ---------------- weights / config ----------------
export const HR_WEIGHTS = {
  parkExp: 0.35,
  weatherExp: 0.12,     // smaller weather, per user request
  pitchExp: 0.25,
  zoneExp: 0.25,
  bvpExp: 0.12,

  starterExp: 0.45,     // starter HR/9 matters
  priorRate: 0.035,     // league prior HR/PA
  priorPA: 350,         // shrink small samples harder

  // power gating
  minPowerFloor: 0.028, // per-PA HR floor unless context strongly supports
  catcherPenalty: 0.92, // C are dinged (fatigue, framing priority, etc.)
  lateOrderPenalty: 0.96, // slots 7-9 small penalty
  lightISOThresh: 0.140, // ISO below this dings
  lightISOPenaltyMax: -0.08,

  // hot/cold (14d vs baseline)
  hotMaxBoost: 0.10,
  coldMaxPenalty: -0.07,

  // odds
  blendModel: 0.8,
  blendOdds: 0.2,
  oddsCap: 0.40,

  // sanity clamps
  baseMin: 0.005,
  baseMax: 0.090
};

// ---------------- main scoring ----------------
export function scoreHRPick(c){
  const W = HR_WEIGHTS;

  // Build baseline per-PA from best evidence we have
  // Prefer season -> career -> provided basePerPA -> safe default.
  const seasonRateRaw =
    isFiniteNum(c?.seasonHR) && isFiniteNum(c?.seasonPA) && c.seasonPA>0
      ? (c.seasonHR / c.seasonPA)
      : null;
  const careerRateRaw =
    isFiniteNum(c?.careerHR) && isFiniteNum(c?.careerPA) && c.careerPA>0
      ? (c.careerHR / c.careerPA)
      : null;

  const seasonRate = seasonRateRaw!=null ? clamp(seasonRateRaw, W.baseMin, W.baseMax) : null;
  const careerRate = careerRateRaw!=null ? clamp(careerRateRaw, W.baseMin, W.baseMax) : null;

  // Empirical Bayes shrink each
  const seasonEB = seasonRate!=null ? ebRate(c.seasonHR, c.seasonPA, W.priorPA, W.priorRate) : null;
  const careerEB = careerRate!=null ? ebRate(c.careerHR, c.careerPA, W.priorPA, W.priorRate) : null;

  // Choose baseline: if season PA is decent (>=250), lean season; else blend
  let baseRaw = null;
  if(seasonEB!=null && c.seasonPA>=250){
    baseRaw = seasonEB;
  } else if(seasonEB!=null && careerEB!=null){
    const w = clamp((c.seasonPA||0) / 250, 0, 1); // up to 250 PA weight
    baseRaw = (1-w)*careerEB + w*seasonEB;
  } else if(careerEB!=null){
    baseRaw = careerEB;
  } else if(isFiniteNum(c?.basePerPA)){
    baseRaw = clamp(c.basePerPA, W.baseMin, W.baseMax);
  } else {
    baseRaw = W.priorRate; // safe default league-ish
  }

  // Position and lineup heuristics
  const pos = String(c?.pos||"").toUpperCase();
  const slot = isFiniteNum(c?.lineupSpot) ? Number(c.lineupSpot) : null;
  const expPA = isFiniteNum(c?.expPA) ? Number(c.expPA) : expectedPAFromSlot(slot);

  let roleAdj = 1.0;
  if(pos.includes("C")) roleAdj *= W.catcherPenalty;
  if(isFiniteNum(slot) && slot>=7) roleAdj *= W.lateOrderPenalty;

  // Power via ISO if available; penalize low ISO
  const iso = isFiniteNum(c?.iso) ? Number(c.iso) : null;
  const lightIsoPenalty = (iso!=null && iso < W.lightISOThresh)
    ? 1 + Math.max(W.lightISOPenaltyMax, (iso - W.lightISOThresh)*0.6) // up to -8%
    : 1;

  // Hot/Cold vs baseline (14d)
  const r14 = (Number(c?.recentHR14||0)) / Math.max(1, Number(c?.recentPA14||0));
  const hotRatio = isFiniteNum(r14) && baseRaw>0 ? clamp(r14 / baseRaw, 0.5, 2.0) : 1.0;
  const hotAdj = hotRatio>=1
    ? 1 + Math.min(W.hotMaxBoost, (hotRatio-1)*0.12)
    : 1 + Math.max(W.coldMaxPenalty, (hotRatio-1)*0.10);

  // Context multipliers
  const park = clamp(numDefault(c?.parkMult, 1), 0.7, 1.4);
  const wx   = clamp(numDefault(c?.wxMult, 1), 0.8, 1.25);
  const pitch= clamp(numDefault(c?.pitchMult, 1), 0.8, 1.3);
  const zone = clamp(numDefault(c?.zoneMult, 1), 0.8, 1.3);
  const bvp  = clamp(numDefault(c?.bvpMult, 1), 0.85, 1.25);

  const lgHR9 = numDefault(c?.lgHR9, 1.10);
  const stHR9 = numDefault(c?.starterHR9, lgHR9);
  const starterRatio = clamp(stHR9 / (lgHR9 || 1.10), 0.7, 1.6);

  // Base per-game from per-PA
  const pGame = pAtLeastOne(baseRaw, expPA);

  // Combine
  const mult =
    Math.pow(park,  W.parkExp) *
    Math.pow(wx,    W.weatherExp) *
    Math.pow(pitch, W.pitchExp) *
    Math.pow(zone,  W.zoneExp) *
    Math.pow(bvp,   W.bvpExp) *
    Math.pow(starterRatio, W.starterExp) *
    roleAdj * lightIsoPenalty * hotAdj;

  const pModel = clamp(pGame * mult, 0.01, 0.60);

  // Odds blend (light)
  const pOdds = amerToProb(c?.oddsAmerican);
  const pBlend = pOdds==null
    ? pModel
    : clamp(W.blendModel*pModel + W.blendOdds*Math.min(pOdds, W.oddsCap), 0.01, 0.60);

  // EV tiebreaker
  const a = Number(c?.oddsAmerican ?? NaN);
  const dec = isFinite(a) ? (a>0 ? 1 + a/100 : 1 + 100/Math.abs(a)) : null;
  const ev = dec ? (pBlend*dec - (1 - pBlend)) : null;

  // Power floor gating — smarter allow-through for strong context
  const powerFloorFail = baseRaw < W.minPowerFloor;
  const allow =
    starterRatio >= 1.15 ||
    hotRatio >= 1.35 ||
    (iso!=null && iso >= 0.180);

  const filtered = powerFloorFail && !allow;

  const reasons = [];
  reasons.push(`${c?.name||"This batter"} baseline shrunk to ${(baseRaw*100).toFixed(1)}% HR/PA (EB prior ${Math.round(W.priorPA)} PA @ ${(W.priorRate*100).toFixed(1)}%), ~${expPA.toFixed(1)} PAs → ${(pGame*100).toFixed(1)}% before context.`);
  const ctx = [];
  ctx.push(`park ${fmtMult(park)}`);
  ctx.push(`starter ${fmtMult(starterRatio)}`);
  if (iso!=null) ctx.push(`ISO ${iso.toFixed(3)}`);
  if (hotRatio>1.05) ctx.push("hot 14d");
  if (hotRatio<0.95) ctx.push("cool 14d");
  if (pitch!==1) ctx.push(`pitch ${fmtMult(pitch)}`);
  if (zone!==1) ctx.push(`zone ${fmtMult(zone)}`);
  if (wx!==1) ctx.push(`wx ${fmtMult(wx)}`);
  if (pos.includes("C")) ctx.push("pos C");
  if (isFiniteNum(slot) && slot>=7) ctx.push(`slot ${slot}`);
  reasons.push(`Context → ${ctx.join(", ")}; model ${(pModel*100).toFixed(1)}% • blended ${(pBlend*100).toFixed(1)}%.`);

  return {
    ...c,
    p_model: pModel,
    p_blended: pBlend,
    ev,
    filtered,
    baseRaw,
    expPA,
    iso,
    hotRatio,
    starterRatio,
    reasons
  };
}

function isFiniteNum(x){ return typeof x === "number" && isFinite(x); }
function numDefault(x, d){ const n=Number(x); return isFinite(n)?n:d; }

export default { scoreHRPick, HR_WEIGHTS };
