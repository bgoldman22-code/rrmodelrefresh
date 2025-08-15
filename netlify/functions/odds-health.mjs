/** netlify/functions/odds-health.mjs
 * Quick health check for TheOddsAPI MLB anytime HR player props.
 * - Confirms env key presence
 * - Tries multiple plausible markets
 * - Summarizes counts + sample lines
 * - Surfaces quota-ish headers if present
 *
 * Call: /.netlify/functions/odds-health
 */
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
async function fetchRaw(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  const text = await r.text();
  return { ok:r.ok, status:r.status, headers:Object.fromEntries([...r.headers.entries()]), text };
}
function getKey(){
  return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY;
}
const SPORT = "baseball_mlb";
const BASE  = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds`;
const MARKETS = ["batter_home_runs","player_home_runs","player_to_hit_a_home_run"];

export default async () => {
  const key = getKey();
  const envPresent = !!key;
  if(!envPresent){
    return ok({ ok:false, envPresent, message:"Missing OddsAPI key in env (set VITE_ODDS_API_KEY or ODDS_API_KEY)" });
  }
  const summary = [];
  const headersSeen = [];
  for(const m of MARKETS){
    const url = `${BASE}?regions=us,us2&oddsFormat=american&markets=${encodeURIComponent(m)}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    try{
      const raw = await fetchRaw(url);
      headersSeen.push(raw.headers);
      if(!raw.ok){
        summary.push({ market:m, ok:false, status: raw.status, body: raw.text.slice(0,300) });
        continue;
      }
      let data = [];
      try{ data = JSON.parse(raw.text); }catch{ summary.push({ market:m, ok:false, parseError:true }); continue; }
      let events = Array.isArray(data) ? data.length : 0;
      let parsed = 0, samples = [];
      for(const ev of (data||[])){
        const books = ev?.bookmakers||[];
        for(const b of books){
          const markets = b?.markets||[];
          for(const mk of markets){
            if(mk?.key !== m) continue;
            for(const o of (mk?.outcomes||[])){
              const name = (o?.name||"").toLowerCase();
              const point = (o?.point==null || Number.isNaN(Number(o?.point))) ? null : Number(o?.point);
              // Accept Over 0.5 OR "Yes" without numeric point
              const isAnytime = (name === "over" && point === 0.5) || (name === "yes" && point === null);
              if(!isAnytime) continue;
              parsed++;
              if(samples.length < 6){
                const player = o?.description || o?.participant || o?.player || o?.name_secondary || o?.selection || o?.name;
                const american = Number(o?.price || o?.oddsAmerican || o?.odds_american || o?.american);
                samples.push({ player, american, book:b?.title, event: ev?.home_team ? `${ev.away_team}@${ev.home_team}` : undefined });
              }
            }
          }
        }
      }
      summary.push({ market:m, ok:true, events, parsed, sampleCount: samples.length, samples });
    }catch(e){
      summary.push({ market:m, ok:false, error: String(e?.message||e) });
    }
  }
  return ok({ ok:true, envPresent, envNamesTried:["VITE_ODDS_API_KEY","ODDS_API_KEY","ODDSAPI_KEY"], tried: MARKETS, summary, headersSeen });
};
