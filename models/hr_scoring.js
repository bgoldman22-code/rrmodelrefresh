// models/hr_scoring.js
// Reliability + Value + Latent power blend for HR probability with bounded multipliers.
import { calibrate_R, calibrate_V, getWeights } from "../src/lib/common/calibration.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function americanFromProb(p){
  const adj = clamp(p, 0.001, 0.999);
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}

function probFromAmerican(a){
  if (a == null || isNaN(a)) return null;
  const x = Number(a);
  return x >= 0 ? 100 / (x + 100) : Math.abs(x) / (Math.abs(x) + 100);
}

// Light shrinkage if sample sizes aren't provided.
function shrinkIso(splitISO, seasonISO, leagueISO=0.170){
  if (splitISO != null && seasonISO != null){
    return 0.65*splitISO + 0.35*seasonISO;
  } else if (seasonISO != null){
    return 0.75*seasonISO + 0.25*leagueISO;
  } else {
    return leagueISO;
  }
}

// Park factor — user may have it elsewhere; default ~neutral.
function venueHRFactor(name){
  // Allow caller to pass numeric; otherwise light defaults by name.
  if (typeof name === "number") return clamp(name, 0.85, 1.20);
  const map = {
    "Coors Field": 1.18, "Great American Ball Park": 1.12, "Citizens Bank Park": 1.06,
    "Yankee Stadium": 1.05, "Oriole Park at Camden Yards": 1.04, "Globe Life Field": 1.03,
    "Dodger Stadium": 1.02, "American Family Field": 1.02, "Chase Field": 1.02,
    "T-Mobile Park": 0.98, "Petco Park": 0.98, "LoanDepot Park": 0.97, "Oracle Park": 0.96
  };
  return map[name] ?? 1.00;
}

export function scoreHRPick(c){
  // Aliases / optional inputs
  const bats = (c.bats || c.batterHand || c.handedBat || "").toUpperCase(); // "L" | "R" | "S"
  const oppThrows = (c.oppThrows || c.pitcherThrows || c.starterThrows || "").toUpperCase(); // "L"|"R"
  const iso_vs_r = c.iso_vs_rhp ?? c.iso_v_r ?? c.iso_vr ?? null;
  const iso_vs_l = c.iso_vs_lhp ?? c.iso_v_l ?? c.iso_vl ?? null;
  const seasonISO = c.iso ?? c.ISO ?? c.seasonISO ?? c.season_iso ?? null;
  const barrel = c.barrelRate ?? c.barrel_rate ?? c.brls_pa ?? c.barrels_per_pa ?? null; // fraction
  const pull = c.pullPct ?? c.pull_rate ?? c.pullRate ?? null; // fraction
  const fb   = c.fbPct ?? c.fb_rate ?? c.flyballRate ?? null;  // fraction
  const recent = c.recentHRperPA ?? c.hr_per_pa_l15 ?? c.l15_hr_pa ?? 0;
  const expPA = c.expPA ?? c.pa ?? 4;
  const bvpPA = c.bvpPA ?? c.bvp_pa ?? 0;
  const bvpHR = c.bvpHR ?? c.bvp_hr ?? 0;
  const venue = c.venue || c.park || c.venueName || c.venue_name || null;
  const starterHR9 = c.starterHR9 ?? c.pitcherHR9 ?? c.oppStarterHR9 ?? 1.10;
  const implied_cons = c.implied_consensus ?? probFromAmerican(c.consensusOddsAmerican ?? c.oddsAmerican);
  const { w_R } = getWeights();

  // --- Reliability head (R) ---
  const splitISO = oppThrows === "L" ? iso_vs_l : oppThrows === "R" ? iso_vs_r : null;
  const iso_base = shrinkIso(splitISO, seasonISO, 0.170);
  const base_hr_pa = clamp(0.02 + 0.85*(iso_base||0) + 0.60*(barrel||0), 0.015, 0.28);

  const parkMult     = clamp(venueHRFactor(venue), 0.90, 1.15);
  const starterAdj   = clamp(starterHR9/1.10, 0.80, 1.30);
  const profileAdj   = (pull != null || fb != null) ? clamp(1.0 + Math.max(0,(pull||0)-0.40)*0.25 + Math.max(0,(fb||0)-0.35)*0.35, 0.95, 1.25) : 1.00;
  const recentAdj    = recent > 0 ? clamp(0.90 + 6*recent, 0.90, 1.20) : 1.0;
  const bvpAdj       = (bvpPA >= 6 && bvpHR > 0) ? clamp(1.0 + (bvpHR / bvpPA) * 2.0, 1.00, 1.20) : 1.0;
  const platoonAdv   = (bats==="L" && oppThrows==="R") || (bats==="R" && oppThrows==="L");
  const platoonAdj   = platoonAdv ? 1.07 : 1.00;

  const p_pa_skill = clamp(base_hr_pa * parkMult * starterAdj * profileAdj * recentAdj * bvpAdj * platoonAdj, 0.003, 0.40);
  const p_game_skill = clamp(p_pa_skill * (expPA/4), 0.01, 0.60);

  // market-aware nudge (soft prior toward consensus)
  const alpha = 0.75;
  const p_R_precal = (implied_cons != null)
    ? clamp(alpha*p_game_skill + (1-alpha)*implied_cons, 0.01, 0.60)
    : p_game_skill;
  const p_R = calibrate_R(p_R_precal);

  // --- Latent power score (0..1) ---
  const latentFB   = fb != null ? clamp((fb-0.35)/0.20, 0, 1) : 0;       // 35%→0, 55%→1
  const latentPull = pull != null ? clamp((pull-0.40)/0.20, 0, 1) : 0;   // 40%→0, 60%→1
  const latentRecent = clamp(recent/0.03, 0, 1);                         // 3% L15 HR/PA ~1
  const latentScore = clamp(0.5*latentFB + 0.4*latentPull + 0.3*latentRecent, 0, 1);

  // --- Value head (V): capped boost based on edge + latent context ---
  const edge_quality = (implied_cons != null) ? clamp(p_game_skill - implied_cons, -0.15, 0.15) : 0; // skill vs market
  const stability = c.oddsSourceCount != null ? clamp((c.oddsSourceCount-1)/3, 0, 1) : 0;            // more books → more stable
  const fragility = (bvpPA>0 && bvpPA<6 ? 0.5 : 0) + (recent>0.025 ? 0.1 : 0);                       // tiny BvP, hot streak fragility
  const rawBoost = 1 + 0.6*edge_quality + 0.2*stability + 0.25*latentScore - 0.25*fragility;
  const boost = clamp(rawBoost, 0.90, 1.25);

  const p_V_precal = clamp(p_R * boost, 0.01, 0.60);
  const p_V = calibrate_V(p_V_precal);

  // --- Blend ---
  const p_final = clamp(w_R*p_R + (1-w_R)*p_V, 0.01, 0.60);

  // --- Explain ---
  const reasons = [];
  if (splitISO != null) reasons.push(`Split ISO vs ${oppThrows||"?"} ${(splitISO).toFixed(3)}`);
  if (splitISO == null && seasonISO != null) reasons.push(`Season ISO ${(seasonISO).toFixed(3)}`);
  if (barrel != null) reasons.push(`Barrel% ${(barrel*100).toFixed(1)}%`);
  if (fb != null) reasons.push(`FB% ${(fb*100).toFixed(0)}%`);
  if (pull != null) reasons.push(`Pull% ${(pull*100).toFixed(0)}%`);
  reasons.push(`Park ×${parkMult.toFixed(2)}`);
  reasons.push(`Starter HR/9 ${Number(starterHR9).toFixed(2)} → ×${starterAdj.toFixed(2)}`);
  if (recent > 0) reasons.push(`L15 HR/PA ${(recent*100).toFixed(1)}%`);
  if (bvpPA >= 6) reasons.push(`BvP ${bvpHR}/${bvpPA}`);
  if (platoonAdv) reasons.push(`Platoon adv`);
  if (edge_quality) reasons.push(`Edge vs mkt ${(edge_quality*100).toFixed(1)}%`);
  if (latentScore>0) reasons.push(`Latent ${(latentScore*100).toFixed(0)}%`);

  const why2 = reasons.join(" • ");

  return {
    ...c,
    p_R, p_V, p_final,
    p_model: p_final,
    p_blended: p_final,
    modelAmerican: americanFromProb(p_final),
    latentScore,
    edgeQuality: edge_quality,
    reasons,
    why2
  };
}
