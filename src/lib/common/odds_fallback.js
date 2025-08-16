// src/lib/common/odds_fallback.js
export async function buildCandidatesFromOddsProps(){
  try{
    const r = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us');
    if(!r.ok){
      console.warn("odds-props not OK", r.status);
      return [];
    }
    const data = await r.json();
    const out = [];
    for (const ev of (data?.events||[])){
      const home = ev.home_team || ev.homeTeam || "";
      const away = ev.away_team || ev.awayTeam || "";
      const game = away && home ? `${String(away).trim()}@${String(home).trim()}` : (ev.id || "");
      for (const bk of (ev.bookmakers||[])){
        for (const mk of (bk.markets||[])){
          const key = (mk.key||mk.key_name||mk.market||"").toLowerCase();
          const isHR = key.includes("home") && key.includes("run");
          if (!isHR) continue;
          for (const oc of (mk.outcomes||[])){
            const name = (oc.name||oc.description||oc.participant||"").trim();
            const price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
            if (!name || !Number.isFinite(price)) continue;
            out.push({
              name,
              team: "",
              home, away, game,
              eventId: ev.id,
              oddsAmerican: price
            });
          }
        }
      }
    }
    return out;
  }catch(err){
    console.error("buildCandidatesFromOddsProps error", err);
    return [];
  }
}