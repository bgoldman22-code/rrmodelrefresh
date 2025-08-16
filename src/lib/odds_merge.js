// src/lib/odds_merge.js
// More aggressive HR odds fetcher with cache-busting, multi-region, and loose market-name matching.
import { tidyName } from "./common/clean.js";

function bust(u) {
  const t = Date.now();
  return u + (u.includes("?") ? "&" : "?") + "t=" + t;
}

async function tryFetch(url) {
  try {
    const r = await fetch(bust(url), { headers: { "cache-control": "no-cache" }});
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { return { ok: false, status: r.status, events: [], raw: txt }; }
    // Different providers shape this differently
    const events = Array.isArray(json) ? json :
                   (Array.isArray(json?.events) ? json.events :
                   (Array.isArray(json?.data) ? json.data :
                   (Array.isArray(json?.result) ? json.result : [])));
    return { ok: r.ok, status: r.status, events, raw: txt };
  } catch (e) {
    return { ok: false, status: 0, events: [], raw: String(e) };
  }
}

function isHRMarket(m) {
  const key = (m?.key || m?.market || m?.title || "").toString().toLowerCase();
  return (
    key.includes("home_run") ||
    key.includes("to hit a home run") ||
    key.includes("to hit a hr") ||
    key.includes("home runs") ||
    key === "player_home_runs" ||
    key === "player_to_hit_a_home_run"
  );
}

function readPrice(o) {
  if (!o) return null;
  // Try a bunch of common shapes
  if (typeof o.price === "number" || typeof o.price === "string") return String(o.price);
  if (o.odds) return String(o.odds);
  if (o.american) return String(o.american);
  if (o.american_display) return String(o.american_display);
  if (o.line) return String(o.line);
  if (typeof o.point === "number") return String(o.point);
  return null;
}

export async function fetchHROddsAndGames() {
  const tried = [];
  const urls = [
    // Explicit HR market endpoints (two shapes: league vs sport)
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us,us2",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us,us2",
    // Broad MLB odds (we'll scan all markets to find HR)
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us,us2",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us,us2"
  ];

  const map = new Map(); // player -> { liveOdd, team, opp, game }
  for (const u of urls) {
    const res = await tryFetch(u);
    tried.push({ url: u, status: res.status, events: res.events?.length || 0 });
    for (const ev of res.events || []) {
      const home = ev?.home_team || ev?.homeTeam || ev?.teams?.home || ev?.home;
      const away = ev?.away_team || ev?.awayTeam || ev?.teams?.away || ev?.away;
      const game = (away && home) ? `${away}@${home}` : (ev?.id || "game");

      const books = ev.bookmakers || ev.books || ev.sportsbooks || [];
      for (const b of books) {
        const markets = b.markets || b.props || b.events || [];
        for (const m of markets) {
          if (!isHRMarket(m)) continue;
          const outs = m.outcomes || m.runners || m.selections || [];
          for (const o of outs) {
            const nm = tidyName(o.name || o.runnerName || o.participant || o.player || "");
            if (!nm) continue;
            const price = readPrice(o) || "-";
            if (!map.has(nm)) map.set(nm, { liveOdd: price, team: null, opp: null, game });
          }
        }
      }
    }
  }
  return { map, tried };
}
