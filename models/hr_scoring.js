// src/models/hr_scoring.js
import { venueHRFactor } from "../utils/mlb_today.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function americanFromProb(p){
  const adj = clamp(p, 0.001, 0.999);
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}

export function scoreHRPick(c){
  // Normalize inputs / aliases
  const iso = c.iso ?? c.ISO ?? c.seasonISO ?? c.season_iso;
  const barrel = c.barrelRate ?? c.barrel_rate ?? c.brls_pa ?? c.barrels_per_pa;
  const recent = c.recentHRperPA ?? c.recent_hr_pa ?? c.hr_per_pa_l15 ?? c.l15_hr_pa ?? 0;
  const bvpPA = c.bvpPA ?? c.bvp_pa ?? 0;
  const bvpHR = c.bvpHR ?? c.bvp_hr ?? 0;
  const platoon = c.platoonFlag ?? c.platoon ?? null;
  const expPA = c.expPA ?? c.pa ?? 4;

  // Base skill: prefer provided baseHRPA; else derive; else conservative fallback
  let base = c.baseHRPA;
  if (base == null){
    if (iso != null && barrel != null){
      base = clamp(0.02 + 0.85*(iso||0) + 0.60*(barrel||0), 0.015, 0.28);
    } else if (iso != null){
      base = clamp(0.03 + 0.90*(iso||0), 0.02, 0.24);
    } else {
      base = 0.045;
    }
  }

  // Contextual multipliers
  const parkMult = venueHRFactor(c.venue || c.park || c.venueName || c.venue_name || "");

  let starterHR9 = c.starterHR9 ?? c.pitcherHR9 ?? c.oppStarterHR9;
  if (starterHR9 == null) starterHR9 = 1.10; // neutral-ish
  // Convert 9-inning HR rate into a multiplier ~ around 1.0
  const starterAdj = clamp((starterHR9 / 1.10), 0.70, 1.40);

  const formAdj = recent > 0 ? clamp(0.40 + 8*recent, 0.70, 1.50) : 1.0;
  const bvpAdj = (bvpPA >= 6 && bvpHR > 0) ? clamp(1.0 + (bvpHR / bvpPA) * 2.0, 1.00, 1.25) : 1.0;
  const platoonAdj = (platoon === "adv" || platoon === "LvsR" || platoon === "RvsL") ? 1.10 : 1.00;

  // Per-PA HR chance then blended to something useable per game
  const p_perPA = clamp(base * parkMult * starterAdj * formAdj * bvpAdj * platoonAdj, 0.003, 0.40);
  // Blend recent + base lightly for a final modeling prob (heuristic)
  const p_model = clamp(p_perPA * (expPA / 4.0), 0.01, 0.60);

  // Optional EV if odds present
  const implied = c.oddsAmerican != null ? (c.oddsAmerican > 0 ? (100/(c.oddsAmerican+100)) : (Math.abs(c.oddsAmerican)/(Math.abs(c.oddsAmerican)+100))) : null;
  const ev = (implied != null) ? (p_model * (c.oddsAmerican>0?c.oddsAmerican:100) - (1-p_model)*(c.oddsAmerican>0?100:Math.abs(c.oddsAmerican))) : null;

  // Build a more unique "why" string
  const pieces = [];
  if (iso != null) pieces.push(`ISO ${(iso).toFixed(3)}`);
  if (barrel != null) pieces.push(`Barrel% ${(barrel*100).toFixed(1)}%`);
  if (recent > 0) pieces.push(`L15 HR/PA ${(recent*100).toFixed(1)}%`);
  pieces.push(`Park ×${parkMult.toFixed(2)}`);
  pieces.push(`Starter HR/9 ${starterHR9.toFixed(2)} → ×${starterAdj.toFixed(2)}`);
  if (bvpPA >= 6) pieces.push(`BvP ${bvpHR}/${bvpPA} → ×${bvpAdj.toFixed(2)}`);
  if (platoonAdj > 1.0) pieces.push(`Platoon ×${platoonAdj.toFixed(2)}`);
  pieces.push(`Exp PA ${expPA}`);

  const why2 = pieces.join(" • ");

  return {
    ...c,
    p_model,
    p_blended: p_model,
    modelAmerican: americanFromProb(p_model),
    ev,
    reasons: pieces,
    why2
  };
}
