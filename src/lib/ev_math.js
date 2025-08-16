
// src/lib/ev_math.js
export function americanToDecimal(american){
  if (american == null) return null;
  const s = (''+american).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 1 + n/100;
  return 1 + 100/Math.abs(n);
}

export function ev1u(prob, american){
  const dec = americanToDecimal(american);
  if (dec == null) return null;
  const p = Math.max(0, Math.min(1, Number(prob)||0));
  // Expected profit on 1u stake: p*(dec-1) - (1-p)*1
  const val = p * (dec - 1) - (1 - p);
  return Math.round(val * 1000) / 1000; // 0.001 precision
}
