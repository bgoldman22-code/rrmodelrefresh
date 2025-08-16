// netlify/functions/update_odds.js
import { storagePutJson } from "../../src/server/storage.js";

function todayYYYYMMDD(d = new Date()){
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function clean(s){ return (s==null? "" : String(s).replace(/\s+/g,' ').trim()); }
function *yieldEventsLike(data){
  if (!data) return;
  if (Array.isArray(data)) { for (const x of data) yield x; return; }
  if (Array.isArray(data.events)) { for (const x of data.events) yield x; }
  if (data.data){ yield* yieldEventsLike(data.data); }
  if (Array.isArray(data.response)) { for (const x of data.response) yield x; }
}
export async function handler(){
  try{
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const urls = [
      "/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
      "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
      "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
      "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
      "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us,us2",
      "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us,us2",
      "/.netlify/functions/odds-props?league=mlb&regions=us",
      "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us"
    ];

    const map = {};
    for (const u of urls){
      try{
        const r = await fetch(`${base}${u}`);
        if (!r.ok) continue;
        const data = await r.json().catch(()=>null);
        if (!data) continue;
        for (const ev of yieldEventsLike(data)){
          const books = ev.bookmakers || ev.books || [];
          for (const bk of books){
            const markets = bk.markets || bk.props || [];
            for (const mk of markets){
              const key = String(mk.key || mk.key_name || mk.market || "").toLowerCase();
              const isHR = key.includes("home") && key.includes("run") || key.includes("player_home_runs") || key.includes("player_to_hit_a_home_run");
              if (!isHR) continue;
              const outs = mk.outcomes || mk.outcomes_list || mk.selections || [];
              for (const oc of outs){
                const nm = clean(oc.name || oc.description || oc.participant || oc.player || "");
                let price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds ?? oc.line);
                if (!nm || !Number.isFinite(price) || price===0) continue;
                const existing = map[nm];
                if (!existing || Math.abs(price) < Math.abs(Number(existing))){
                  map[nm] = (price>0?`+${price}`:String(price));
                }
              }
            }
          }
        }
        if (Object.keys(map).length) break; // got some HR odds
      }catch{ /* keep going */ }
    }

    const date = todayYYYYMMDD();
    await storagePutJson(`odds/${date}.json`, map);
    return { statusCode: 200, body: JSON.stringify({ ok:true, size: Object.keys(map).length, date }) };
  }catch(e){
    return { statusCode: 500, body: `update_odds error: ${e?.message || e}` };
  }
}
