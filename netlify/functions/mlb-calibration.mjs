/** netlify/functions/mlb-calibration.mjs
 * Reads recent picks to compute a global calibration scale and per-probability-bin hit rates.
 */
import { getStore } from "@netlify/blobs";
function ok(data){ return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" }}); }
function fmtET(d=new Date()){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}
export default async (req) => {
  try{
    const picks = getStore("picks-log");
    const learn = getStore("mlb-learning");
    const summary = await learn.get("summary.json", { type:"json" }) || { daysList:[] };
    const days = Array.isArray(summary.daysList) ? summary.daysList.slice(-30) : [];

    const bins = [0,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.5];
    const hit = Array(bins.length-1).fill(0);
    const total = Array(bins.length-1).fill(0);

    let expSum = 0, hitSum = 0;
    for(const d of days){
      const arr = await picks.get(`mlb_hr/${d}.json`, { type:"json" }) || [];
      for(const row of arr){
        const p = Number(row?.p_model || row?.prob || 0);
        const y = Number(row?.hit || 0);
        if(p>0){
          expSum += p;
          if(y===1) hitSum += 1;
          for(let i=0;i<bins.length-1;i++){
            if(p>=bins[i] && p<bins[i+1]){ total[i]++; if(y===1) hit[i]++; break; }
          }
        }
      }
    }
    const ratio = (hitSum + 1) / (expSum + 1);
    const scale = Math.max(0.6, Math.min(1.4, ratio));
    const perBin = [];
    for(let i=0;i<total.length;i++){
      const a = hit[i] + 1, b = (total[i]-hit[i]) + 1;
      perBin.push({ lo:bins[i], hi:bins[i+1], total:total[i], hit:hit[i], rate: a/(a+b) });
    }
    return ok({ ok:true, date:fmtET(), global:{ scale }, bins:perBin });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
