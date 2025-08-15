// src/utils/hotcold.js
export function hotColdMultiplier({ hr14, pa14, seasonHR, seasonPA }, cap=0.06){
  const r14 = pa14 > 0 ? (hr14 / pa14) : 0;
  const rSeas = seasonPA > 0 ? (seasonHR / seasonPA) : 0;
  if(rSeas <= 0) return 1.0;
  const ratio = r14 / rSeas;
  const boost = Math.max(1 - cap, Math.min(1 + cap, ratio));
  return boost;
}
