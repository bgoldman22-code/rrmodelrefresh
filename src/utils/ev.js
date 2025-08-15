// src/utils/ev.js
export function americanFromProb(p){
  const q = Math.min(0.999, Math.max(0.001, Number(p)||0));
  const dec = 1 / q;
  if(dec >= 2){ return Math.round((dec - 1) * 100); }
  return Math.round(-100 / (dec - 1));
}
export function impliedFromAmerican(american){
  const a = Number(american);
  if(isNaN(a)) return null;
  if(a > 0) return 100 / (a + 100);
  return -a / (-a + 100);
}
export function evFromProbAndOdds(p, american){
  const q = Math.min(0.999, Math.max(0.001, Number(p)||0));
  const dec = (a => a>0 ? (1 + a/100) : (1 + 100/(-a)))(american);
  return (q * dec) - (1 - q);
}
