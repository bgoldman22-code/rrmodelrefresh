// src/lib/common/calibration.js
// Lightweight calibration utilities. Cal params can be updated nightly by a learner job.
// Default identity calibration; reads params from src/utils/learning_params.json at build/runtime.

import params from "../../../utils/learning_params.json";

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function logistic(z){ return 1 / (1 + Math.exp(-z)); }
function logit(p){ const q = clamp(p, 1e-6, 1-1e-6); return Math.log(q/(1-q)); }

export function calibrate_R(p){
  const a = params?.calibration?.R?.a ?? 0;
  const b = params?.calibration?.R?.b ?? 1;
  return clamp(logistic(a + b*logit(p)), 0.001, 0.999);
}

export function calibrate_V(p){
  const a = params?.calibration?.V?.a ?? 0;
  const b = params?.calibration?.V?.b ?? 1;
  return clamp(logistic(a + b*logit(p)), 0.001, 0.999);
}

export function getWeights(){
  return {
    w_R: params?.w_R ?? 0.70,
    lambda: params?.lambda ?? 0.40,
    gamma: params?.gamma ?? 0.25,
    delta: params?.delta ?? 0.15,
    thresholds: params?.thresholds ?? {
      anchor_pR: 0.20, value_max: 2, latent_max: 1, per_game_cap: 2, max_picks: 12
    }
  };
}
