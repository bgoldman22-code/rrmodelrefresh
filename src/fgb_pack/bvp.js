// src/fgb_pack/bvp.js
// Returns a conservative BvP multiplier based on StatsAPI vsPlayer split.

export async function getBvPMultiplier(batterId, pitcherId, season, baseRate){
  try{
    if(!batterId || !pitcherId) return 1.00;
    var url = "https://statsapi.mlb.com/api/v1/people/" + String(batterId) + "/stats?stats=vsPlayer&group=hitting&opposingPlayerId=" + String(pitcherId) + "&season=" + String(season);
    var d = await j(url);
    var stats = d && d.stats && d.stats.length ? d.stats[0] : null;
    var splits = stats && stats.splits ? stats.splits : [];
    var HR=0, PA=0;
    if(splits.length){
      var st = splits[0].stat || {};
      var hr = parseFloat(st.homeRuns||st.HR||st.hr);
      var pa = parseFloat(st.plateAppearances||st.PA||st.pa);
      if(!isNaN(hr)) HR = hr;
      if(!isNaN(pa)) PA = pa;
    }
    if(PA<=0) return 1.00;
    var rate = HR/PA;
    var priorHR = 1.0, priorPA = 50.0;
    var shrunk = (HR + priorHR) / (PA + priorPA);
    var baseline = (typeof baseRate==="number" && baseRate>0) ? baseRate : 0.04;
    var mult = shrunk / baseline;
    if(!isFinite(mult) || mult<=0) mult = 1.00;
    if(mult < 0.85) mult = 0.85;
    if(mult > 1.15) mult = 1.15;
    return mult;
  }catch(e){
    return 1.00;
  }
}

async function j(url){ var r=await fetch(url); if(!r.ok) throw new Error("fetch " + url); return r.json(); }