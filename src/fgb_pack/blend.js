// src/fgb_pack/blend.js
export function blendHRProb(opts){
  var base = clamp(opts.base_hr_per_pa, 0.005, 0.20);
  var park = clamp(opts.park_mult, 0.80, 1.25);
  var wx   = clamp(opts.weather_mult, 0.90, 1.10);
  var bvp  = clamp(opts.bvp_mult, 0.85, 1.15);
  var wP   = clamp(opts.wPark || 1.0, 0.6, 1.6);
  var wW   = clamp(opts.wWx   || 1.0, 0.6, 1.6);
  var wB   = clamp(opts.wBvP  || 1.0, 0.6, 1.6);
  var form = clamp(opts.recent_mult || 1.00, 0.85, 1.15);
  var pa   = clamp(opts.est_pa || 4.2, 2.8, 5.8);

  var perPA = base * Math.pow(park, wP) * Math.pow(wx, wW) * Math.pow(bvp, wB) * form;
  perPA = clamp(perPA, 0.005, 0.25);
  var gameProb = 1 - Math.pow(1 - perPA, pa);
  return clamp(gameProb, 0.02, 0.60);
}

export function applyBias(p, bias){
  var x = logit(p) + (typeof bias==="number"? bias : 0.0);
  return clamp(invlogit(x), 0.02, 0.60);
}

function clamp(x, a, b){
  if(typeof x!=="number" || !isFinite(x)) return a;
  if(x<a) return a;
  if(x>b) return b;
  return x;
}
function logit(p){ p=clamp(p,1e-6,1-1e-6); return Math.log(p/(1-p)); }
function invlogit(x){ return 1/(1+Math.exp(-x)); }