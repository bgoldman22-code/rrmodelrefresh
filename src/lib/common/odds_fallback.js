// src/lib/common/odds_fallback.js
import { fetchJSONFlexible, firstEventsArray } from "./safe_json.js";

function cleanName(s){ return String(s||"").replace(/\./g,"").replace(/\s+/g," ").trim(); }
function isHRMarketKey(key){
  if (!key) return false;
  const k = String(key).toLowerCase();
  const known = ["player_home_runs","player to hit a home run","player_to_hit_a_home_run","to hit a home run","home run","home runs"];
  if (known.some(x => k.includes(x))) return true;
  return (k.includes("home") && k.includes("run"));
}
function extractAmerican(oc){
  const p = oc?.price_american ?? oc?.price?.american ?? oc?.american ?? oc?.odds ?? null;
  if (p == null) return null;
  const num = Number(p);
  if (Number.isFinite(num)) return Math.round(num);
  const str = String(p).replace(/[^\d\-+]/g,"");
  const n2 = Number(str);
  return Number.isFinite(n2) ? Math.round(n2) : null;
}
function harvestFromEventsArray(events){
  const candidates = [];
  let marketsSeen=0, outcomesSeen=0;
  for (const ev of (events||[])){
    const home = ev.home_team || ev.homeTeam || ev.home || "";
    const away = ev.away_team || ev.awayTeam || ev.away || "";
    const game = away && home ? `${String(away).trim()}@${String(home).trim()}` : (ev.id || ev.commence_time || "");
    const books = ev.bookmakers || ev.books || ev.sportsbooks || [];
    for (const bk of books){
      const mkts = bk.markets || bk.props || bk.lines || [];
      for (const mk of mkts){
        const key = mk?.key || mk?.key_name || mk?.market || mk?.title || "";
        if (!isHRMarketKey(key)) continue;
        marketsSeen++;
        const outs = mk.outcomes || mk.options || mk.selections || [];
        for (const oc of outs){
          const rawName = oc?.name || oc?.description || oc?.participant || oc?.label || "";
          const price = extractAmerican(oc);
          if (!Number.isFinite(price)) continue;
          const isYesNo = typeof rawName === "string" && (rawName.toLowerCase() === "yes" || rawName.toLowerCase() === "no");
          if (isYesNo && rawName.toLowerCase() !== "yes") continue;
          let player = rawName;
          if (isYesNo){
            player = oc?.player || oc?.participant || oc?.runner || oc?.description || oc?.label || "";
          }
          player = cleanName(player);
          if (!player) continue;
          candidates.push({ name: player, team:"", home, away, game, eventId: ev.id || ev.commence_time || "", oddsAmerican: price });
          outcomesSeen++;
        }
      }
    }
  }
  return { candidates, marketsSeen, outcomesSeen };
}

export async function buildCandidatesFromOddsPropsFlexible(){
  const urls = [
    '/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us',
    '/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us',
    '/.netlify/functions/odds-props?league=mlb&regions=us',
    '/.netlify/functions/odds-props?sport=baseball_mlb&regions=us',
    '/.netlify/functions/odds-props?regions=us'
  ];
  const tried = [];
  for (const url of urls){
    try{
      const { status, text, json } = await fetchJSONFlexible(url);
      tried.push({ url, status, bytes: (text||"").length });
      if (status !== 200 || !text) continue;
      const events = Array.isArray(json?.events) ? json.events : firstEventsArray(json);
      if (!Array.isArray(events) || !events.length) continue;
      const { candidates, marketsSeen, outcomesSeen } = harvestFromEventsArray(events);
      if (candidates.length){
        return { candidates, sourceTried: url, counts: { marketsSeen, outcomesSeen }, tried };
      }
    }catch(e){
      tried.push({ url, status: "fetch_error", error: String(e) });
      continue;
    }
  }
  return { candidates: [], sourceTried: null, counts: { marketsSeen: 0, outcomesSeen: 0 }, tried };
}
