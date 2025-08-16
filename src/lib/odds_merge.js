// src/lib/odds_merge.js
// Pull HR markets from multiple endpoints and return a map by cleaned player name.
import { tidyName } from "./common/clean.js";

async function tryFetch(url) {
  try {
    const r = await fetch(url, { headers: { "cache-control": "no-cache" }});
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { return { ok: false, status: r.status, events: [], raw: txt }; }
    const events = Array.isArray(json) ? json : (json?.data || json?.events || []);
    return { ok: r.ok, status: r.status, events, raw: txt };
  } catch (e) {
    return { ok: false, status: 0, events: [], raw: String(e) };
  }
}

export async function fetchHROddsAndGames() {
  const tried = [];
  const urls = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
  ];
  const map = new Map(); // key: clean player -> { liveOdd, team, opp, game }
  for (const u of urls) {
    const res = await tryFetch(u);
    tried.push({ url: u, status: res.status, events: res.events?.length || 0 });
    for (const ev of res.events || []) {
      const home = ev?.home_team || ev?.homeTeam || ev?.teams?.home;
      const away = ev?.away_team || ev?.awayTeam || ev?.teams?.away;
      const game = (away && home) ? `${away}@${home}` : (ev?.id || "game");
      // Find a HR market
      const books = ev.bookmakers || [];
      for (const b of books) {
        const markets = b.markets || [];
        for (const m of markets) {
          const key = (m.key || m.market || "").toLowerCase();
          if (!key.includes("home_run")) continue;
          const outs = m.outcomes || [];
          for (const o of outs) {
            const nm = tidyName(o.name || o.participant || "");
            if (!nm) continue;
            const price = (typeof o.price === "string" || typeof o.price === "number") ? String(o.price) : (o.odds || o.line || null);
            if (!map.has(nm)) map.set(nm, { liveOdd: price || "-", team: null, opp: null, game });
          }
        }
      }
      // If we captured game but not odds yet, we still fill team/opp when we match by name later.
    }
  }
  return { map, tried };
}
