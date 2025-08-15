// src/utils/odds_estimator.js
// Odds helpers used across pages

export function probToAmerican(p, priceFactor=0.90){
  p = clamp(p, 0.0001, 0.9999);
  const fair = (1/p) - 1;
  const adj = fair * priceFactor;
  const dec = 1 + adj;
  const american = decToAmerican(dec);
  return { decimal: dec, american };
}

export function americanFromProb(p, priceFactor=0.90){
  // Convenience wrapper to return only the American line
  return probToAmerican(p, priceFactor).american;
}

export function decToAmerican(dec){
  if(dec <= 1.0) return -100000;
  const profit = dec - 1;
  if(dec >= 2.0){
    return Math.round(profit * 100);   // +150, +500, etc
  }else{
    return Math.round(-100 / profit);  // -110, -135, etc
  }
}

export function americanToDec(american){
  if(american >= 100) return 1 + american/100;
  if(american <= -100) return 1 + (100/Math.abs(american));
  return 1 + american/100;
}

function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
