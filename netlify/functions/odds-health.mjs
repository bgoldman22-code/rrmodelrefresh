/** netlify/functions/odds-health.mjs
 * OddsAPI health check using the CORRECT per-event props flow.
 * Call: /.netlify/functions/odds-health
 */
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY; }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  const text = await r.text();
  let json=null; try{ json = JSON.parse(text);}catch{}
  return { ok:r.ok, status:r.status, headers:Object.fromEntries([...r.headers.entries()]), json, text };
}
function iso(d){ return new Date(d).toISOString(); }
function startOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),0,0,0)); }
function endOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),23,59,59)); }

export default async () => {
  const key = getKey();
  if(!key) return ok({ ok:false, error:"missing-api-key" });

  const sport="baseball_mlb";
  const base = `https://api.the-odds-api.com/v4/sports/${sport}`;
  const now = new Date();
  const from = startOfDayUTC(now);
  const to   = endOfDayUTC(new Date(now.getTime()+36*3600*1000));

  const eventsURL = `${base}/events?commenceTimeFrom=${encodeURIComponent(iso(from))}&commenceTimeTo=${encodeURIComponent(iso(to))}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
  const ev = await fetchJSON(eventsURL);
  if(!ev.ok) return ok({ ok:false, stage:"events", status:ev.status, body:ev.text });

  const events = Array.isArray(ev.json)?ev.json:[];
  let checked=0, parsed=0, players=0;
  const samples=[], headersSeen=[ev.headers];
  for(const e of events){
    const id=e?.id; if(!id) continue;
    checked++;
    const url = `${base}/events/${id}/odds?regions=us,us2&oddsFormat=american&markets=batter_home_runs&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    const o = await fetchJSON(url);
    headersSeen.push(o.headers);
    if(!o.ok) continue;
    for(const b of (o.json?.bookmakers||[])){
      for(const mk of (b?.markets||[])){
        if(mk?.key!=="batter_home_runs") continue;
        for(const out of (mk?.outcomes||[])){
          const name = String(out?.name||"").toLowerCase();
          const point = (out?.point==null || Number.isNaN(Number(out?.point)))?null:Number(out?.point);
          const okAny = (name==="over" && point===0.5);
          if(!okAny) continue;
          parsed++;
          const player = out?.description || out?.participant || out?.player || out?.name_secondary || out?.selection || out?.name;
          if(player) players++;
          if(samples.length<8){
            const american = Number(out?.price || out?.oddsAmerican || out?.odds_american || out?.american);
            samples.push({ event: e?.home_team?`${e?.away_team}@${e?.home_team}`:e?.id, player, american, book: b?.title });
          }
        }
      }
    }
  }
  return ok({ ok:true, window:{from:iso(from),to:iso(to)}, events:events.length, checked, parsed, players, headersSeen, samples });
};
