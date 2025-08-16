// src/lib/common/odds_fallback.js
// Hardened fallback: tries multiple odds-props URL shapes and multiple market key spellings.
// Returns { candidates, sourceTried, counts, tried } for diagnostics.

function cleanName(s){
  return String(s||"").replace(/\./g,"").replace(/\s+/g," ").trim();
}

function isHRMarketKey(key){
  if (!key) return false;
  const k = String(key).toLowerCase();
  const known = [
    "player_home_runs",
    "player to hit a home run",
    "player_to_hit_a_home_run",
    "to hit a home run",
    "home run",
    "home runs"
  ];
  if (known.some(x => k.includes(x))) return true;
  // loose: contains both 'home' and 'run'
  return (k.includes("home") && k.includes("run"));
}

function extractAmerican(oc){
  // supports price_american, price.american, american, odds (as +/- int), etc.
  const p = oc?.price_american ?? oc?.price?.american ?? oc?.american ?? oc?.odds ?? null;
  if (p == null) return null;
  const num = Number(p);
  if (Number.isFinite(num)) return Math.round(num);
  const str = String(p).replace(/[^\d\-+]/g,"");
  const n2 = Number(str);
  return Number.isFinite(n2) ? Math.round(n2) : null;
}

export async function buildCandidatesFromOddsPropsHardened(){
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
      const r = await fetch(url);
      tried.push({ url, status: r?.status ?? null });
      if (!r.ok) continue;
      const data = await r.json();
      const candidates = [];
      let marketsSeen = 0, outcomesSeen = 0;
      for (const ev of (data?.events||[])){
        const home = ev.home_team || ev.homeTeam || "";
        const away = ev.away_team || ev.awayTeam || "";
        const game = away && home ? `${String(away).trim()}@${String(home).trim()}` : (ev.id || ev.commence_time || "");
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            const key = mk?.key || mk?.key_name || mk?.market || mk?.title || "";
            if (!isHRMarketKey(key)) continue;
            marketsSeen++;
            for (const oc of (mk.outcomes||[])){
              // some books encode "Yes/No" for HR markets; prefer "Yes"
              const rawName = oc?.name || oc?.description || oc?.participant || "";
              const price = extractAmerican(oc);
              if (!Number.isFinite(price)) continue;
              // If market is Yes/No, only take "Yes"
              const isYesNo = typeof rawName === "string" && (rawName.toLowerCase() === "yes" || rawName.toLowerCase() === "no");
              if (isYesNo && rawName.toLowerCase() !== "yes") continue;

              // Try to find player name field if oc.name is "Yes"
              let player = rawName;
              if (isYesNo){
                player = oc?.player || oc?.participant || oc?.runner || oc?.description || oc?.label || "";
              }
              player = cleanName(player);
              if (!player) continue;

              candidates.push({
                name: player,
                team: "",
                home, away, game,
                eventId: ev.id || ev.commence_time || "",
                oddsAmerican: price
              });
              outcomesSeen++;
            }
          }
        }
      }
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
