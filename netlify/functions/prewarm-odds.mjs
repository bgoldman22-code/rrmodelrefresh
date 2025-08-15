// netlify/functions/prewarm-odds.mjs
// Preloads Odds API data each morning into the same Blobs cache used by odds-props.mjs
// so page views read from cache instead of calling the API repeatedly.
//
// Env: VITE_ODDS_API_KEY or ODDS_API_KEY
// Requires in netlify.toml:
// [functions]
//   node_bundler = "esbuild"
//   external_node_modules = ["@netlify/blobs"]
//
// And a schedule (see section #2 in my message).

import { getStore } from "@netlify/blobs";

const ODDS_KEY = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
const store = getStore("odds-cache"); // matches odds-props.mjs

export default async function handler() {
  if (!ODDS_KEY) {
    return json({ ok: false, error: "missing-key", message: "Set VITE_ODDS_API_KEY or ODDS_API_KEY" }, 500);
  }

  // Build today (UTC) and soccer Thu→Mon window
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  // Soccer Thu→Mon window (UTC)
  const { from: soccerFrom, to: soccerTo } = getThuMonWindow(today);

  // What to prewarm (keep this small to save quota)
  const tasks = [
    // MLB HR (today)
    {
      league: "mlb",
      sportKey: "baseball_mlb",
      markets: "batter_home_runs,batter_home_runs_alternate",
      regions: "us",
      dateFrom: iso(today),
      dateTo: iso(today),
      limit: 20
    },
    // MLB 2+ hits (today)
    {
      league: "mlb",
      sportKey: "baseball_mlb",
      markets: "player_total_hits,batter_hits_over_under,player_2+_hits",
      regions: "us",
      dateFrom: iso(today),
      dateTo: iso(today),
      limit: 20
    },
    // Soccer AGS (Thu→Mon)
    {
      league: "epl",
      sportKey: "soccer_epl",
      markets: "player_goal_scorer_anytime,player_to_score_anytime,goalscorer_anytime",
      regions: "us",
      dateFrom: soccerFrom,
      dateTo: soccerTo,
      limit: 24
    },
    // NFL anytime TD (today) — only matters during regular season
    {
      league: "nfl",
      sportKey: "americanfootball_nfl",
      markets: "player_anytime_touchdown_scorer,player_to_score_a_touchdown_anytime",
      regions: "us",
      dateFrom: iso(today),
      dateTo: iso(today),
      limit: 20
    }
  ];

  const results = [];
  for (const t of tasks) {
    const r = await prewarmOne(t).catch((e) => ({ ok: false, task: t, error: String(e && e.message || e) }));
    results.push(r);
    // If quota runs out, stop early
    if (r && r.quota && Number(r.quota.remaining) <= 0) break;
  }

  return json({ ok: true, ran: results.length, results });
}

async function prewarmOne({ sportKey, markets, regions, dateFrom, dateTo, limit = 20 }) {
  // Step 1: list events
  const evURL = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events?apiKey=${encodeURIComponent(ODDS_KEY)}`;
  const evRes = await fetch(evURL);
  if (!evRes.ok) {
    return { ok: false, stage: "events", status: evRes.status, body: await evRes.text().catch(() => "") };
  }
  let events = await evRes.json();
  if (!Array.isArray(events)) events = [];
  const quota = {
    remaining: toNum(evRes.headers.get("x-requests-remaining")),
    used: toNum(evRes.headers.get("x-requests-used"))
  };

  // Date filter
  const fromTs = dateFrom ? Date.parse(dateFrom + "T00:00:00Z") : null;
  const toTs = dateTo ? Date.parse(dateTo + "T23:59:59Z") : null;
  if (fromTs || toTs) {
    events = events.filter((ev) => {
      const t = Date.parse(ev.commence_time);
      if (Number.isFinite(fromTs) && t < fromTs) return false;
      if (Number.isFinite(toTs) && t > toTs) return false;
      return true;
    });
  }

  // If no requests left, return early (caller may stop looping)
  if (quota.remaining <= 0) {
    // Still try serving stale cache on the frontend; here we just report
    return { ok: true, stage: "quota-exhausted", events: events.length, returned: 0, quota };
  }

  // Step 2: per-event odds for requested markets
  const subset = events.slice(0, Math.min(limit, events.length));
  const out = [];
  for (const ev of subset) {
    const odURL = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(ev.id)}/odds?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=american&apiKey=${encodeURIComponent(ODDS_KEY)}`;
    try {
      const r = await fetch(odURL);
      if (!r.ok) continue;
      const j = await r.json();
      j.home_team = ev.home_team;
      j.away_team = ev.away_team;
      out.push(j);
    } catch { /* ignore single event failure */ }
  }

  // Write exactly the same cache shape/keys that odds-props.mjs uses
  const cacheKey = `v1:${sportKey}:${regions}:${(markets || "").toLowerCase()}::${dateFrom || "NA"}:${dateTo || "NA"}`;
  const payload = { sportKey, requested_markets: markets, events: events.length, returned: out.length, quota, data: out };
  try {
    await store.setJSON(cacheKey, { ts: Date.now(), payload });
  } catch { /* ignore write error */ }

  return { ok: true, stage: "prewarmed", key: cacheKey, events: events.length, returned: out.length, quota };
}

function getThuMonWindow(d) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const toThu = (4 - dow + 7) % 7; // next Thursday
  const thu = new Date(dt); thu.setUTCDate(dt.getUTCDate() + toThu);
  const mon = new Date(thu); mon.setUTCDate(thu.getUTCDate() + 4);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { from: iso(thu), to: iso(mon) };
}

function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
