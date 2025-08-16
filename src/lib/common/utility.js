// src/lib/common/utility.js
// Utility function for selection (not pure EV).
// U(S) = λ * Σ log(dec_odds_i) + (1−λ) * Σ logit(p_i) + γ * Σ p_i + δ * Σ latent_i − penalties(S)
import { getWeights } from "./calibration.js";

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function logit(p){ const q = clamp(p, 1e-6, 1-1e-6); return Math.log(q/(1-q)); }

export function americanToDecimal(a){
  if (a == null || isNaN(a)) return null;
  const x = Number(a);
  return x >= 0 ? 1 + x/100 : 1 + 100/Math.abs(x);
}

export function scoreSetUtility(set){
  const { lambda, gamma, delta } = getWeights();
  let sumLogDec = 0, sumLogitP = 0, sumP = 0, sumLatent = 0;
  for (const x of set){
    const dec = americanToDecimal(x.oddsAmerican);
    const p = x.p_final ?? x.p_model ?? x.p_blended ?? 0;
    const latent = x.latentScore ?? 0;
    if (dec) sumLogDec += Math.log(dec);
    if (p) sumLogitP += logit(p);
    sumP += (p||0);
    sumLatent += latent;
  }
  // Basic penalties; more handled by selector constraints.
  const penalty = 0;
  return lambda*sumLogDec + (1-lambda)*sumLogitP + gamma*sumP + delta*sumLatent - penalty;
}
