/** netlify/functions/odds-mlb-hr.mjs
 * Robust MLB anytime-HR odds from TheOddsAPI.
 * - Tries multiple likely market keys: batter_home_runs, player_home_runs, player_to_hit_a_home_run
 * - Accepts Over 0.5 OR Yes
 * - Returns best (longest) American price per player
 */
const SPORT = "baseball_mlb";
const BASE  = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds`;
const MARKETS = ["batter_home_runs","player_home_runs","player_to_hit_a_home_run"];
function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
function getKey(){
  return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY;
}
function getPlayerName(o){
  return o?.description || o?.participant || o?.player || o?.name_secondary || o?.selection || o?.name;
}
function getAmerican(o){
  return Number(o?.price || o?.oddsAmerican || o?.odds_american || o?.american);
}

export default async () => {
  try{
    const key = getKey();
    if(!key) return ok({ ok:false, error:"missing-api-key" });

    const best = new Map();
    for(const m of MARKETS){
      const url = `${BASE}?regions=us,us2&oddsFormat=american&markets=${encodeURIComponent(m)}&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
      let data = [];
      try{ data = await fetchJSON(url); }catch{ continue; }

      for(const ev of (data||[])){
        const books = ev?.bookmakers||[];
        for(const b of books){
          const markets = b?.markets||[];
          for(const mk of markets){
            if(mk?.key !== m) continue;
            for(const o of (mk?.outcomes||[])){
              const name = (o?.name||"").toLowerCase();
              const point = (o?.point==null || Number.isNaN(Number(o?.point))) ? null : Number(o?.point);
              const anytime = (name === "over" && point === 0.5) || (name === "yes" && point === null);
              if(!anytime) continue;
              const player = getPlayerName(o);
              const american = getAmerican(o);
              if(!player || isNaN(american)) continue;
              const k = String(player).toLowerCase();
              const prev = best.get(k);
              if(!prev || american > prev.best_american){
                best.set(k, { player, best_american: american, book: b?.title || "book" });
              }
            }
          }
        }
      }
    }
    return ok({ ok:true, count: best.size, data: [...best.values()], marketsTried: MARKETS });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
