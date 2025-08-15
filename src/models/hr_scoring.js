
// src/models/hr_scoring.js
// Lightweight "bombs-first" scorer with transparent reasons.
//
// Expected candidate shape (fields are optional; scorer is defensive):
// {
//   name, team, opponent, game, // strings
//   odds,                       // american integer, e.g. +450
//   impliedProb,                // 0..1 (if odds provided; we can derive)
//   baseHRPA,                   // baseline HR per PA (season/career power) 0..1
//   expPA,                      // expected plate appearances (default 4)
//   parkFactor,                 // 0.8..1.3 HR index (1.00 neutral)
//   weatherFactor,              // 0.9..1.1 small effect
//   starterHR9,                 // opposing starter HR per 9 (0..3)
//   bvpHR, bvpPA,               // batter vs pitcher historical sample
//   iso, barrelRate,            // quality-of-contact measures 0..1
//   recentHR14, recentPA14,     // hot/cold streak over last 14 days
//   pitchCompat, zoneCompat,    // 0.9..1.1 modest multipliers
//   lineupPos,                  // 1..9 expected order
//   id, eventId, gameId
// }
//
// Returns { ...candidate, p_model, p_blended, why2, reasons[], filtered }
//
export function americanToProb(odds){
  if (odds === undefined || odds === null || isNaN(odds)) return null;
  const o = Number(odds);
  return o > 0 ? (100 / (o + 100)) : (Math.abs(o) / (Math.abs(o) + 100));
}

export function probToAmerican(p){
  if (!p || p<=0) return 0;
  if (p>=0.9999) return -100000;
  return p>=0.5 ? Math.round(-100 * p/(1-p)) : Math.round(100 * (1-p)/p);
}

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

function ebShrink(rate, n, prior=0.035, priorN=200){
  // Empirical Bayes shrinkage for sparse baselines.
  const num = rate * n + prior * priorN;
  const den = n + priorN;
  return den > 0 ? num / den : prior;
}

export function scoreHRPick(c){
  const reasons = [];
  const copy = { ...c };

  // Baselines & defaults
  const leagueHRPA = 0.035;
  const baseHRPA = c.baseHRPA ?? (c.iso ? clamp(0.12 + 0.8*(c.iso-0.140), 0.01, 0.15) : leagueHRPA);
  const basePA = c.expPA ?? 4;
  const park = clamp(c.parkFactor ?? 1.00, 0.80, 1.30);
  const wx = clamp(c.weatherFactor ?? 1.00, 0.90, 1.10); // intentionally small
  const pitchCompat = clamp(c.pinchCompat ?? c.pitchCompat ?? 1.00, 0.90, 1.10);
  const zoneCompat  = clamp(c.zoneCompat ?? 1.00, 0.90, 1.10);
  const starterHR9 = c.starterHR9 ?? 1.10; // league-ish
  const starterMult = clamp( (starterHR9 / 1.10), 0.70, 1.30 );

  // BvP small-sample boost
  const bvpPA = c.bvpPA ?? 0;
  const bvpHR = c.bvpHR ?? 0;
  const bvpRate = bvpPA > 0 ? bvpHR / bvpPA : 0;
  const bvpAdj = clamp( ebShrink(bvpRate, bvpPA, baseHRPA, 40) / baseHRPA, 0.85, 1.15 );

  // Recent form (14-day HR rate vs baseline), capped
  const rPA = c.recentPA14 ?? 0;
  const rHR = c.recentHR14 ?? 0;
  const rRate = rPA > 0 ? rHR / rPA : baseHRPA;
  const hotAdj = clamp( ebShrink(rRate, rPA, baseHRPA, 60) / baseHRPA, 0.90, 1.12 );

  // Contact quality lift if we have it
  let qAdj = 1.00;
  if (typeof c.barrelRate === "number"){
    // league barrel ~7%; normalize to mild +/-
    qAdj *= clamp(1 + (c.barrelRate - 0.07) * 1.2, 0.90, 1.15);
  }
  if (typeof c.iso === "number"){
    qAdj *= clamp(1 + (c.iso - 0.170) * 0.9, 0.88, 1.14);
  }

  // Compose model probability per PA
  const p_pa = clamp(
    ebShrink(baseHRPA, (c.seasonPA ?? 300), leagueHRPA, 200)
    * park * wx * pitchCompat * zoneCompat * starterMult * bvpAdj * hotAdj * qAdj,
    0.003, 0.15
  );

  // Convert per-PA to per-game with  ~independent trials approx: 1 - (1 - p)^PA
  const PA = clamp(basePA, 3, 5.5);
  const p_game = 1 - Math.pow(1 - p_pa, PA);

  // Blend a touch of odds (if present) for sanity
  const implied = c.impliedProb ?? americanToProb(c.odds);
  const p_blended = (implied && isFinite(implied)) ? (0.75 * p_game + 0.25 * implied) : p_game;

  // Build reasons (human-readable)
  reasons.push(`base ${(100*baseHRPA).toFixed(1)}% HR/PA`);
  if (Math.abs(park-1) > 0.02) reasons.push(`park×${park.toFixed(2)}`);
  if (Math.abs(wx-1) > 0.02) reasons.push(`wx×${wx.toFixed(2)}`);
  if (Math.abs(starterMult-1) > 0.05) reasons.push(`starter×${starterMult.toFixed(2)}`);
  if (Math.abs(qAdj-1) > 0.06) reasons.push(`quality×${qAdj.toFixed(2)}`);
  if (Math.abs(hotAdj-1) > 0.05) reasons.push(`trend×${hotAdj.toFixed(2)}`);
  if (Math.abs(bvpAdj-1) > 0.05) reasons.push(`BvP×${bvpAdj.toFixed(2)}`);
  if (Math.abs(pitchCompat-1) > 0.04) reasons.push(`pitch×${pitchCompat.toFixed(2)}`);
  if (Math.abs(zoneCompat-1) > 0.04) reasons.push(`zone×${zoneCompat.toFixed(2)}`);

  const why2 = `${c.name||"—"} projects from a ${(100*baseHRPA).toFixed(1)}% HR/PA base and ~${PA.toFixed(0)} PAs. Context: ${park>=1.02?"hitter":"neutral"} park${Math.abs(wx-1)>0.02?`, weather adj ${wx.toFixed(2)}`:""}; starter factor ${starterMult.toFixed(2)}; ${rPA>8?"recent form":"baseline form"};${bvpPA>0?` BvP n=${bvpPA}`:""}${implied?"; odds blended":""}.`;

  const odds = (typeof c.odds === "number" ? c.odds : (implied ? probToAmerican(implied) : null));
  const ev = (odds && isFinite(odds)) ? ((p_blended * (odds>0 ? (1 + odds/100) : (1 + 100/Math.abs(odds)))) - (1 - p_blended)) : null;

  const filtered = false; // let hr_select.js decide

  return {
    ...copy,
    p_pa,
    p_model: p_game,
    p_blended,
    impliedProb: implied ?? null,
    odds: odds ?? null,
    ev,
    reasons,
    why2,
    filtered
  };
}
