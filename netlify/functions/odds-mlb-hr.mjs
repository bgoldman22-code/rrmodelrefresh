/** netlify/functions/odds-mlb-hr.mjs
 * Pull MLB anytime-HR prices from TheOddsAPI.
 * Strategy: query market 'batter_home_runs' (Over/Under) and take Over with point=0.5 as anytime HR.
 * Return best american price per player across US books.
 *
 * Env: VITE_ODDS_API_KEY or ODDS_API_KEY
 */
const BASE = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/";
function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
function getKey(){
  return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY;
}

export default async (req) => {
  try{
    const key = getKey();
    if(!key) return ok({ ok:false, error:"missing-api-key" });

    const url = `${BASE}?regions=us,us2&oddsFormat=american&markets=batter_home_runs&dateFormat=iso&apiKey=${encodeURIComponent(key)}`;
    const data = await fetchJSON(url);

    const best = new Map();
    for(const ev of data){
      const markets = ev?.bookmakers?.flatMap(b => (b?.markets||[]).map(m => ({...m, book:b?.title}))) || [];
      for(const m of markets){
        if(m?.key !== "batter_home_runs") continue;
        for(const o of (m?.outcomes||[])){
          // Expect: Over/Under structure with "point" (e.g., 0.5). We want Over 0.5
          if(String(o?.name).toLowerCase() !== "over") continue;
          if(Number(o?.point) !== 0.5) continue;
          const player = o?.description || o?.participant || o?.name_secondary || o?.player;
          const american = Number(o?.price || o?.oddsAmerican || o?.odds_american || o?.american);
          if(!player || isNaN(american)) continue;
          const k = String(player).toLowerCase();
          const prev = best.get(k);
          // choose the LONGER price (better payout) for the bettor
          if(!prev || american > prev.best_american){
            best.set(k, { player, best_american: american, book: m.book || "book" });
          }
        }
      }
    }
    return ok({ ok:true, count: best.size, data: [...best.values()] });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
