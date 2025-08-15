// src/models/hr_scoring.js
import { venueHRFactor } from "../utils/mlb_today.js";

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

export function scoreHRPick(c){
  // Base from skill: prefer provided baseHRPA; else derive from ISO/barrel; else fallback
  let base = c.baseHRPA;
  if (base == null){
    if (c.iso && c.barrelRate){
      base = clamp(0.03 + 0.8*(c.iso||0) + 0.6*(c.barrelRate||0), 0.02, 0.25);
    } else if (c.iso){
      base = clamp(0.035 + 0.9*(c.iso||0), 0.02, 0.23);
    } else {
      base = 0.045; // conservative population base HR/PA
    }
  }

  // Park factor
  const park = c.parkFactor != null ? c.parkFactor : venueHRFactor(c.venueName || c.venue || "");
  const parkAdj = clamp(park, 0.92, 1.12);

  // Starter factor (small weight around league ~1.10 HR/9)
  let starterHR9 = c.starterHR9;
  if (starterHR9 == null || isNaN(starterHR9)) starterHR9 = 1.10;
  const starterAdj = clamp(0.9 + 0.2*(starterHR9 - 1.10), 0.85, 1.15);

  // Recent form (14-day HR rate vs base, small)
  let recentRate = 0;
  if (c.recentHR14 && c.recentPA14 && c.recentPA14 > 10){
    recentRate = c.recentHR14 / c.recentPA14;
  }
  const formAdj = clamp(1.0 + (recentRate - base)*2.0, 0.92, 1.08);

  // BvP small, shrunk
  let bvpAdj = 1.0;
  if (c.bvpHR != null && c.bvpPA != null && c.bvpPA >= 6){
    const bvpRate = c.bvpHR / Math.max(1,c.bvpPA);
    const delta = bvpRate - base;
    bvpAdj = clamp(1.0 + 0.8*delta, 0.95, 1.08);
  }

  // Pitch/zone compatibility (if provided from your upstream)
  const pitchAdj = clamp(c.pitchCompat || 1.0, 0.95, 1.08);
  const zoneAdj  = clamp(c.zoneCompat  || 1.0, 0.95, 1.08);

  const p = clamp(base * parkAdj * starterAdj * formAdj * bvpAdj * pitchAdj * zoneAdj, 0.02, 0.35);

  // Blended could include implied odds if present
  const p_blended = p;

  // Reasons (two sentences variant)
  const parts = [];
  parts.push(`${c.name||"This batter"} projects from a ${(base*100).toFixed(1)}% HR/PA base with ~${c.expPA||4} PAs.`);
  const ctx = [];
  ctx.push(`park ${parkAdj.toFixed(2)}x`);
  ctx.push(`starter HR/9 ${starterHR9.toFixed(2)} → ${starterAdj.toFixed(2)}x`);
  if (recentRate>0) ctx.push(`form ${formAdj.toFixed(2)}x`);
  if (c.bvpPA>=6) ctx.push(`BvP ${bvpAdj.toFixed(2)}x`);
  const why2 = parts.join(" ") + " Context: " + ctx.join("; ") + ".";

  return {
    ...c,
    p_model: p,
    p_blended,
    reasons: [`base ${(base*100).toFixed(1)}%`, `park×${parkAdj.toFixed(2)}`, `starter×${starterAdj.toFixed(2)}`, recentRate>0?`form×${formAdj.toFixed(2)}`:null, (c.bvpPA>=6)?`BvP×${bvpAdj.toFixed(2)}`:null].filter(Boolean),
    why2
  };
}
