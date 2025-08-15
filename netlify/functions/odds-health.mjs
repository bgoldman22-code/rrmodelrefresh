/** netlify/functions/odds-health.mjs
 * Evented health check for TheOddsAPI MLB anytime HR player props.
 * Flow:
 *   - List events in a small window (today -> +36h)
 *   - For each event: GET events/{id}/odds?markets=batter_home_runs
 *   - Count Over 0.5 outcomes and sample a few players
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
function startOfDayUTC(d){
  const dt = new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0,0,0));
}
function endOfDayUTC(d){
  const dt = new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23,59,59));
}
export default async () => {
  const key = getKey();
  if(!key) return ok({ ok:false, error:"missing-api-key" });
  const sport = "baseball_mlb";
  const base  = `https://api.the-odds-api.com/v4/sports/${sport}`;
  const now = new Date();
  const from = startOfDayUTC(now);
  const to   = endOfDayUTC(new Date(now.getTime()+36*3600*1000));
  const eventsURL = `${base}/events?commenceTimeFrom=${encodeURIComponent(iso(from))}&commenceTimeTo=${encodeURIComponent(iso(to))}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
  const evRes = await fetchJSON(eventsURL);
  if(!evRes.ok) return ok({ ok:false, stage:"events", status:evRes.status, body: evRes.text });
  const events = Array.isArray(evRes.json) ? evRes.json : [];
  let checked=0, parsed=0, players=0;
  const samples=[];
  const headersSeen=[evRes.headers];
  for(const ev of events){
    const id = ev?.id; if(!id) continue;
    checked++;
    const url = `${base}/events/${id}/odds?regions=us,us2&oddsFormat=american&markets=batter_home_runs&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    const oRes = await fetchJSON(url);
    headersSeen.push(oRes.headers);
    if(!oRes.ok) continue;
    for(const b of (oRes.json?.bookmakers||[])){
      for(const mk of (b?.markets||[])){
        if(mk?.key !== "batter_home_runs") continue;
        for(const o of (mk?.outcomes||[])){
          const name = String(o?.name||"").toLowerCase();
          const point = (o?.point==null || Number.isNaN(Number(o?.point))) ? null : Number(o?.point);
          if(!(name==="over" && point===0.5)) continue;
          parsed++;
          const player = o?.description || o?.participant || o?.player || o?.name_secondary || o?.selection || o?.name;
          if(player) players++;
          if(samples.length<8){
            samples.push({
              event: ev?.home_team ? `${ev?.away_team}@${ev?.home_team}` : ev?.id,
              book: b?.title,
              player,
              american: Number(o?.price || o?.oddsAmerican || o?.odds_american || o?.american)
            });
          }
        }
      }
    }
  }
  return ok({ ok:true, window:{ from: iso(from), to: iso(to) }, events:events.length, checked, parsed, players, samples, headersSeen });
};
