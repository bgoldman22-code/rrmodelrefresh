/** netlify/functions/odds-mlb-hr.mjs
 * Build a best-price map for MLB anytime HR props using the per-event endpoint.
 * Output: { ok:true, count, data:[{ player, best_american, book }] }
 */
function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY; }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
function iso(d){ return new Date(d).toISOString(); }
function startOfDayUTC(d){
  const dt = new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0,0,0));
}
function endOfDayUTC(d){
  const dt = new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23,59,59));
}
function toAmerican(o){ return Number(o?.price || o?.oddsAmerican || o?.odds_american || o?.american); }
function playerFromOutcome(o){ return o?.description || o?.participant || o?.player || o?.name_secondary || o?.selection || o?.name; }

export default async () => {
  try{
    const key = getKey();
    if(!key) return ok({ ok:false, error:"missing-api-key" });

    const sport = "baseball_mlb";
    const base  = `https://api.the-odds-api.com/v4/sports/${sport}`;
    const now = new Date();
    const from = startOfDayUTC(now);
    const to   = endOfDayUTC(now);
    const eventsURL = `${base}/events?commenceTimeFrom=${encodeURIComponent(iso(from))}&commenceTimeTo=${encodeURIComponent(iso(to))}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    let events=[];
    try{ events = await fetchJSON(eventsURL); }catch(e){ return ok({ ok:false, stage:"events", error:String(e?.message||e) }); }
    if(!Array.isArray(events)) events=[];

    const best = new Map();
    for(const ev of events){
      const id = ev?.id; if(!id) continue;
      const url = `${base}/events/${id}/odds?regions=us,us2&oddsFormat=american&markets=batter_home_runs&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
      let data; try{ data = await fetchJSON(url); }catch{ continue; }
      for(const b of (data?.bookmakers||[])){
        for(const mk of (b?.markets||[])){
          if(mk?.key!=="batter_home_runs") continue;
          for(const o of (mk?.outcomes||[])){
            const name = String(o?.name||"").toLowerCase();
            const point = (o?.point==null || Number.isNaN(Number(o?.point))) ? null : Number(o?.point);
            if(!(name==="over" && point===0.5)) continue;
            const player = playerFromOutcome(o);
            const american = toAmerican(o);
            if(!player || Number.isNaN(american)) continue;
            const k = player.toLowerCase();
            const prev = best.get(k);
            if(!prev || american > prev.best_american){
              best.set(k, { player, best_american: american, book: b?.title || "book" });
            }
          }
        }
      }
    }
    return ok({ ok:true, count: best.size, data: [...best.values()] });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
