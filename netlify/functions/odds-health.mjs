/** netlify/functions/odds-health.mjs */

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

export default async () => {
  const key = keyOdds();
  if(!key) return ok({ ok:false, error:"missing-api-key" });
  const sport = "baseball_mlb";
  const base  = `https://api.the-odds-api.com/v4/sports/${sport}`;

  const now = new Date();
  const from = startOfDayUTC(now);
  const to   = endOfDayUTC(new Date(now.getTime()+36*3600*1000));

  const params = new URLSearchParams();
  params.set("commenceTimeFrom", isoNoMs(from));
  params.set("commenceTimeTo", isoNoMs(to));
  params.set("dateFormat", "iso");
  params.set("apiKey", key);

  const ev = await fetchJSON(`${base}/events?${params.toString()}`);
  if(!ev.ok) return ok({ ok:false, stage:"events", status:ev.status, body:ev.text, url:ev.url });

  const events = Array.isArray(ev.json)?ev.json:[];
  let checked=0, parsed=0, players=0;
  const samples=[], headersSeen=[ev.headers];
  for(const e of events){
    const id=e?.id; if(!id) continue;
    checked++;
    const qs = new URLSearchParams();
    qs.set("regions","us,us2");
    qs.set("oddsFormat","american");
    qs.set("markets","batter_home_runs");
    qs.set("dateFormat","iso");
    qs.set("apiKey",key);
    const o = await fetchJSON(`${base}/events/${id}/odds?${qs.toString()}`);
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
  return ok({ ok:true, window:{from:isoNoMs(from),to:isoNoMs(to)}, events:events.length, checked, parsed, players, headersSeen, sampleCount:samples.length, samples });
};
