// src/models/hr_scoring.js
// Bombs-first v2: shrinks baselines, penalizes low-power roles, blends odds lightly.

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

function ebRate(hr, pa, priorPA=300, priorRate=0.035){
  const H = Math.max(0, Number(hr)||0);
  const P = Math.max(0, Number(pa)||0);
  const alpha = priorRate * priorPA;
  const beta  = (1 - priorRate) * priorPA;
  return (H + alpha) / (P + alpha + beta);
}

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

export const HR_WEIGHTS = {
  parkExp: 0.35,
  weatherExp: 0.12,
  pitchExp: 0.25,
  zoneExp: 0.25,
  bvpExp: 0.12,

  starterExp: 0.45,
  priorRate: 0.035,
  priorPA: 350,

  minPowerFloor: 0.028,
  catcherPenalty: 0.92,
  lateOrderPenalty: 0.96,
  lightISOThresh: 0.140,
  lightISOPenaltyMax: -0.08,

  hotMaxBoost: 0.10,
  coldMaxPenalty: -0.07,

  blendModel: 0.8,
  blendOdds: 0.2,
  oddsCap: 0.40,

  baseMin: 0.005,
  baseMax: 0.090
};

export function scoreHRPick(c){
  const W = HR_WEIGHTS;
  const isFin = (x)=> typeof x === "number" && isFinite(x);
  const numDef = (x,d)=> isFin(Number(x)) ? Number(x) : d;

  const seasonRateRaw = (isFin(c?.seasonHR)&&isFin(c?.seasonPA)&&c.seasonPA>0) ? (c.seasonHR/c.seasonPA) : null;
  const careerRateRaw = (isFin(c?.careerHR)&&isFin(c?.careerPA)&&c.careerPA>0) ? (c.careerHR/c.careerPA) : null;

  const seasonEB = seasonRateRaw!=null ? ebRate(c.seasonHR, c.seasonPA, W.priorPA, W.priorRate) : null;
  const careerEB = careerRateRaw!=null ? ebRate(c.careerHR, c.careerPA, W.priorPA, W.priorRate) : null;

  let baseRaw = null;
  if(seasonEB!=null && c.seasonPA>=250){
    baseRaw = seasonEB;
  } else if(seasonEB!=null && careerEB!=null){
    const w = clamp((c.seasonPA||0)/250, 0, 1);
    baseRaw = (1-w)*careerEB + w*seasonEB;
  } else if(careerEB!=null){
    baseRaw = careerEB;
  } else if(isFin(c?.basePerPA)){
    baseRaw = clamp(c.basePerPA, W.baseMin, W.baseMax);
  } else {
    baseRaw = W.priorRate;
  }

  const pos = String(c?.pos||"").toUpperCase();
  const slot = isFin(c?.lineupSpot) ? Number(c.lineupSpot) : null;
  const expPA = isFin(c?.expPA) ? Number(c.expPA) : expectedPAFromSlot(slot);

  let roleAdj = 1.0;
  if(pos.includes("C")) roleAdj *= W.catcherPenalty;
  if(isFin(slot) && slot>=7) roleAdj *= W.lateOrderPenalty;

  const iso = isFin(c?.iso) ? Number(c.iso) : null;
  const isoAdj = (iso!=null && iso < W.lightISOThresh)
    ? 1 + Math.max(W.lightISOPenaltyMax, (iso - W.lightISOThresh)*0.6)
    : 1;

  const r14 = (Number(c?.recentHR14||0)) / Math.max(1, Number(c?.recentPA14||0));
  const hotRatio = (isFin(r14) && baseRaw>0) ? clamp(r14/baseRaw, 0.5, 2.0) : 1.0;
  const hotAdj = hotRatio>=1
    ? 1 + Math.min(W.hotMaxBoost, (hotRatio-1)*0.12)
    : 1 + Math.max(W.coldMaxPenalty, (hotRatio-1)*0.10);

  const park = clamp(numDef(c?.parkMult, 1), 0.7, 1.4);
  const wx   = clamp(numDef(c?.wxMult, 1), 0.8, 1.25);
  const pitch= clamp(numDef(c?.pitchMult, 1), 0.8, 1.3);
  const zone = clamp(numDef(c?.zoneMult, 1), 0.8, 1.3);
  const bvp  = clamp(numDef(c?.bvpMult, 1), 0.85, 1.25);

  const lgHR9 = numDef(c?.lgHR9, 1.10);
  const stHR9 = numDef(c?.starterHR9, lgHR9);
  const starterRatio = clamp(stHR9 / (lgHR9 || 1.10), 0.7, 1.6);

  const pGame = pAtLeastOne(clamp(baseRaw, W.baseMin, W.baseMax), expPA);

  const mult =
    Math.pow(park,  W.parkExp) *
    Math.pow(wx,    W.weatherExp) *
    Math.pow(pitch, W.pitchExp) *
    Math.pow(zone,  W.zoneExp) *
    Math.pow(bvp,   W.bvpExp) *
    Math.pow(starterRatio, W.starterExp) *
    roleAdj * isoAdj * hotAdj;

  const pModel = clamp(pGame * mult, 0.01, 0.60);

  const pOdds = amerToProb(c?.oddsAmerican);
  const pBlend = pOdds==null
    ? pModel
    : clamp(W.blendModel*pModel + W.blendOdds*Math.min(pOdds, W.oddsCap), 0.01, 0.60);

  const a = Number(c?.oddsAmerican ?? NaN);
  const dec = isFinite(a) ? (a>0 ? 1 + a/100 : 1 + 100/Math.abs(a)) : null;
  const ev = dec ? (pBlend*dec - (1 - pBlend)) : null;

  const powerFloorFail = baseRaw < W.minPowerFloor;
  const allow = starterRatio >= 1.15 || hotRatio >= 1.35 || (iso!=null && iso >= 0.180);
  const filtered = powerFloorFail && !allow;

  const reasons = [];
  reasons.push(`${c?.name||"This batter"} baseline shrunk to ${(baseRaw*100).toFixed(1)}% HR/PA, ~${expPA.toFixed(1)} PAs → ${(pGame*100).toFixed(1)}% before context.`);
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
  if (isFin(slot) && slot>=7) ctx.push(`slot ${slot}`);
  reasons.push(`Context → ${ctx.join(", ")}; model ${(pModel*100).toFixed(1)}% • blended ${(pBlend*100).toFixed(1)}%.`);

  return {
    ...c,
    p_model: pModel,
    p_blended: pBlend,
    ev,
    filtered,
    baseRaw,
    iso,
    reasons
  };
}

export default { scoreHRPick, HR_WEIGHTS };
