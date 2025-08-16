// src/server/learn/weights.js
// Training-time weighting helper (does NOT affect inference).

export function productionWeight(season_hr, normAnchorHR=12, capMin=0.5, capMax=1.75){
  const hr = Math.max(0, Number(season_hr)||0);
  const scale = Math.log1p(hr) / Math.log1p(normAnchorHR);
  return Math.max(capMin, Math.min(capMax, scale));
}
