/** netlify/functions/odds-mlb-hr.mjs
 * OddsAPI → best price per player for MLB anytime HR using per-event endpoint.
 * Call: /.netlify/functions/odds-mlb-hr
 */
function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY; }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function iso(d){ return new Date(d).toISOString(); }
function startOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),0,0,0)); }
function endOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),23,59,59)); }

export default async () => {
  const key = getKey();
  if(!key) return ok({ ok:false, error:"missing-api-key" });

  const sport="baseball_mlb";
  const base = `https://api.the-odds-api.com/v4/sports/${sport}`;
  const now=new Date();
  const from=startOfDayUTC(now), to=endOfDayUTC(now);
  const eventsURL = `${base}/events?commenceTimeFrom=${encodeURIComponent(iso(from))}&commenceTimeTo=${encodeURIComponent(iso(to))}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;

  let events=[]; try{ events=await fetchJSON(eventsURL);}catch(e){ return ok({ ok:false, stage:"events", error:String(e?.message||e) }); }
  const best=new Map();
  for(const e of (Array.isArray(events)?events:[])){
    const id=e?.id; if(!id) continue;
    let data; try{
      const url = `${base}/events/${id}/odds?regions=us,us2&oddsFormat=american&markets=batter_home_runs&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
      data = await fetchJSON(url);
    }catch{ continue; }
    for(const b of (data?.bookmakers||[])){
      for(const mk of (b?.markets||[])){
        if(mk?.key!=="batter_home_runs") continue;
        for(const out of (mk?.outcomes||[])){
          const name=String(out?.name||"").toLowerCase();
          const point=(out?.point==null||Number.isNaN(Number(out?.point)))?null:Number(out?.point);
          if(!(name==="over" && point===0.5)) continue;
          const player = out?.description || out?.participant || out?.player || out?.name_secondary || out?.selection || out?.name;
          const american = Number(out?.price || out?.oddsAmerican || out?.odds_american || out?.american);
          if(!player || Number.isNaN(american)) continue;
          const k = player.toLowerCase();
          const prev = best.get(k);
          if(!prev || american>prev.best_american){
            best.set(k, { player, best_american: american, book: b?.title||"book" });
          }
        }
      }
    }
  }
  return ok({ ok:true, count: best.size, data: [...best.values()] });
};
