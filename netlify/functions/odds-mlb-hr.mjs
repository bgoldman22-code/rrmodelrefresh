/** netlify/functions/odds-mlb-hr.mjs */

function pad(n){ return String(n).padStart(2,'0'); }
function isoNoMs(d){
  const dt = new Date(d);
  return dt.getUTCFullYear() + '-' +
         pad(dt.getUTCMonth()+1) + '-' +
         pad(dt.getUTCDate()) + 'T' +
         pad(dt.getUTCHours()) + ':' +
         pad(dt.getUTCMinutes()) + ':' +
         pad(dt.getUTCSeconds()) + 'Z';
}
function startOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),0,0,0)); }
function endOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),23,59,59)); }
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
function keyOdds(){ return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY; }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  const text = await r.text();
  let json=null; try{ json=JSON.parse(text);}catch{}
  return { ok:r.ok, status:r.status, json, text, url, headers:Object.fromEntries([...r.headers.entries()]) };
}

async function fetchJSONThrow(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" } });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export default async () => {
  const key = keyOdds();
  if(!key) return ok({ ok:false, error:"missing-api-key" });
  const sport = "baseball_mlb";
  const base  = `https://api.the-odds-api.com/v4/sports/${sport}`;
  const now = new Date();
  const from = startOfDayUTC(now);
  const to   = endOfDayUTC(now);
  const q = new URLSearchParams({
    commenceTimeFrom: isoNoMs(from),
    commenceTimeTo: isoNoMs(to),
    dateFormat: "iso",
    apiKey: key
  }).toString();
  let events=[]; 
  try{ events = await fetchJSONThrow(`${base}/events?${q}`); }
  catch(e){ return ok({ ok:false, stage:"events", error:String(e?.message||e) }); }
  const best=new Map();
  for(const e of (Array.isArray(events)?events:[])){
    const id=e?.id; if(!id) continue;
    let data; 
    try{
      const qs = new URLSearchParams({
        regions:"us,us2",
        oddsFormat:"american",
        markets:"batter_home_runs",
        dateFormat:"iso",
        apiKey:key
      }).toString();
      data = await fetchJSONThrow(`${base}/events/${id}/odds?${qs}`);
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
