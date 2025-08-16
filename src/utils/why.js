
// src/utils/why.js
import { impliedFromAmerican } from "./ev.js";

export function normName(s){
  return (s||"")
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWhy({
  modelHR, price=null, impliedFromOdds=null, edgePctPts=null,
  pitcher=null, pitcherHand=null, pitcherHRper9=null, pitcherBarrelPct=null,
  platoonSplit=null, park=null, parkHRIndex=null,
  tempF=null, weatherWindMPH=null, weatherWindDir=null,
  lineupSlot=null, hotCold=null
}){
  const bits = [];
  if(typeof modelHR === 'number'){
    bits.push(`model ${(modelHR*100).toFixed(1)}%`);
  }
  if(typeof price === 'number'){
    const imp = impliedFromOdds != null ? (impliedFromOdds*100).toFixed(1) : ((impliedFromAmerican(price)||0)*100).toFixed(1);
    const edge = edgePctPts != null ? `${(edgePctPts*100).toFixed(1)}pp` : null;
    bits.push(`${price>=0?'+':''}${Math.round(price)} (imp ${imp}%${edge?`, +${edge} edge`:''})`);
  }else{
    bits.push(`no odds`);
  }
  if(pitcher){
    const arms = pitcherHand ? ` (${pitcherHand})` : '';
    const hr9 = typeof pitcherHRper9==='number' ? ` • ${pitcherHRper9.toFixed(2)} HR/9` : '';
    const brl = typeof pitcherBarrelPct==='number' ? ` • ${pitcherBarrelPct.toFixed(1)}% brl` : '';
    bits.push(`vs ${pitcher}${arms}${hr9}${brl}`);
  }
  if(typeof platoonSplit==='number'){
    const sign = platoonSplit>=0 ? '+' : '−';
    bits.push(`platoon ${sign}${Math.abs(platoonSplit*100).toFixed(1)}pp`);
  }
  if(park && typeof parkHRIndex==='number'){
    const label = parkHRIndex === 100 ? 'neutral' : (parkHRIndex > 100 ? 'boost' : 'suppress');
    bits.push(`${park} HR idx ${Math.round(parkHRIndex)} (${label})`);
  }
  const wx = [];
  if(typeof tempF==='number') wx.push(`${Math.round(tempF)}°F`);
  if(typeof weatherWindMPH==='number' && weatherWindDir) wx.push(`${Math.round(weatherWindMPH)}mph ${weatherWindDir}`);
  if(wx.length) bits.push(`wx ${wx.join(', ')}`);
  if(typeof hotCold==='number'){
    const tag = hotCold >= 1 ? 'hot' : (hotCold <= -1 ? 'cold' : 'even');
    bits.push(`${tag} (${hotCold.toFixed(1)}σ)`);
  }
  if(typeof lineupSlot==='number') bits.push(`batting ${lineupSlot}`);
  return bits.join(' • ');
}
