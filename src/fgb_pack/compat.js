// src/fgb_pack/compat.js
// Compute conservative compatibility multipliers from learned aggregates.

function rate(hr, ip, priorHR, priorIP){
  const H = (hr||0) + (priorHR||1);
  const N = (ip||0) + (priorIP||50);
  return H / N;
}

export function pitchCompatMult(batterId, pitcherId, agg, w){
  try{
    const bp = (agg.batterPitch && agg.batterPitch[batterId]) ? agg.batterPitch[batterId] : {};
    const pp = (agg.pitcherPitch && agg.pitcherPitch[pitcherId]) ? agg.pitcherPitch[pitcherId] : {};
    const lg = (agg.league && agg.league.pitch) ? agg.league.pitch : {};

    let sum = 0, cnt = 0;
    for(const pt in bp){
      const bRate = rate(bp[pt].hr, bp[pt].ip, 1, 80);
      const pRate = rate(pp[pt] ? pp[pt].hrAllowed : 0, pp[pt] ? pp[pt].ip : 0, 1, 80);
      const lRate = rate(lg[pt] ? lg[pt].hr : 0, lg[pt] ? lg[pt].ip : 0, 1, 200);
      if(lRate>0){
        const rel = (bRate/lRate) * (pRate/lRate); // >1 if both are above league
        sum += rel; cnt++;
      }
    }
    if(!cnt) return 1.00;
    const avg = sum / cnt; // typical range ~0.8-1.2
    const m = Math.pow(avg, clamp(w||1.0, 0.6, 1.6)); // exponentiate by learned weight
    return clamp(m, 0.90, 1.10);
  }catch(e){ return 1.00; }
}

export function zoneCompatMult(batterId, pitcherId, agg, w){
  try{
    const bz = (agg.batterZone && agg.batterZone[batterId]) ? agg.batterZone[batterId] : {};
    const pz = (agg.pitcherZone && agg.pitcherZone[pitcherId]) ? agg.pitcherZone[pitcherId] : {};
    const lg = (agg.league && agg.league.zone) ? agg.league.zone : {};

    let sum = 0, cnt = 0;
    for(const z in bz){
      const bRate = rate(bz[z].hr, bz[z].ip, 1, 80);
      const pRate = rate(pz[z] ? pz[z].hrAllowed : 0, pz[z] ? pz[z].ip : 0, 1, 80);
      const lRate = rate(lg[z] ? lg[z].hr : 0, lg[z] ? lg[z].ip : 0, 1, 200);
      if(lRate>0){
        const rel = (bRate/lRate) * (pRate/lRate);
        sum += rel; cnt++;
      }
    }
    if(!cnt) return 1.00;
    const avg = sum / cnt;
    const m = Math.pow(avg, clamp(w||1.0, 0.6, 1.6));
    return clamp(m, 0.90, 1.10);
  }catch(e){ return 1.00; }
}

function clamp(x,a,b){ if(!(x>-Infinity && x<Infinity)) return a; if(x<a) return a; if(x>b) return b; return x; }