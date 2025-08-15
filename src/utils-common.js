export function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

// Turn a Date into YYYY-MM-DD in ET
export function ymdInET(d){
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(d);
}
export function todayET(){ return ymdInET(new Date()); }

export function blendedHrProbability({ batterSeasonHRperPA, batterRecentHRperPA, pitcherHRAllowedPerPA, platoonMult, parkMult }){
  const base = (batterRecentHRperPA||0)*0.5 + (batterSeasonHRperPA||0)*0.35 + (pitcherHRAllowedPerPA||0)*0.15;
  return clamp(base * (platoonMult||1) * (parkMult||1), 0.005, 0.40);
}

export function shortReason({ batterRecent, batterSeason, pitcherHR9, parkMult, platoonFlag }){
  const bits = [];
  if (batterRecent != null) bits.push(`L15 HR rate ${(batterRecent*100).toFixed(1)}%`);
  if (batterSeason != null) bits.push(`Season HR rate ${(batterSeason*100).toFixed(1)}%`);
  if (pitcherHR9 != null) bits.push(`Opp HR/9 ${pitcherHR9.toFixed(2)}`);
  if (parkMult && parkMult !== 1) bits.push(`Park ×${parkMult.toFixed(2)}`);
  if (platoonFlag) bits.push(platoonFlag);
  return bits.join(" • ");
}
