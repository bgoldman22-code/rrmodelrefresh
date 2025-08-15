export default async (req) => {
  const out = {};
  const url = new URL(req.url);
  const origin = url.origin;
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);

  async function check(name, fn){
    try{
      const res = await fn();
      out[name] = res;
    }catch(e){
      out[name] = { status: "red", detail: String(e?.message || e) };
    }
  }

  await Promise.all([
    // MLB StatsAPI (public)
    check("statsapi_today", async () => {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
      if(!r.ok) return { status: "red", detail: `HTTP ${r.status}` };
      const j = await r.json();
      const games = (j?.dates?.[0]?.games || []).length;
      if(games > 0) return { status: "green", detail: `${games} games` };
      return { status: "yellow", detail: "0 games (date?)" };
    }),

    // ESPN MLB scoreboard (fallback source)
    check("espn_mlb", async () => {
      const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard");
      return r.ok ? { status: "green", detail: "scoreboard ok" } : { status: "red", detail: `HTTP ${r.status}` };
    }),

    // Football-Data.org via token (server-side)
    check("football_data", async () => {
      const token = process.env.FOOTBALL_DATA_KEY || process.env.VITE_FOOTBALL_DATA_KEY;
      if(!token) return { status: "yellow", detail: "no token" };
      const r = await fetch("https://api.football-data.org/v4/competitions", {
        headers: { "X-Auth-Token": token }
      });
      if(!r.ok) return { status: "red", detail: `HTTP ${r.status}` };
      const j = await r.json();
      const n = Array.isArray(j?.competitions) ? j.competitions.length : 0;
      return n>0 ? { status: "green", detail: `${n} comps` } : { status: "yellow", detail: "0 comps" };
    }),

    // OddsAPI prewarm (internal function)
    check("odds_prewarm", async () => {
      const r = await fetch(`${origin}/.netlify/functions/prewarm-odds?dry=1`);
      if(!r.ok) return { status: "red", detail: `HTTP ${r.status}` };
      const j = await r.json().catch(()=> ({}));
      return (j && (j.ok || j.status==="ok")) ? { status: "green", detail: "ok" } : { status: "yellow", detail: "resp" };
    }),

    // Odds props for MLB HR (internal function)
    check("odds_props_mlb", async () => {
      const r = await fetch(`${origin}/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_home_run,player_to_hit_a_home_run&date=${encodeURIComponent(date)}&dry=1`);
      if(!r.ok) return { status: "red", detail: `HTTP ${r.status}` };
      const j = await r.json().catch(() => ({}));
      const returned = j?.returned ?? j?.data?.length ?? j?.events ?? 0;
      return typeof returned === "number" ? { status: "green", detail: `returned=${returned}` } : { status: "yellow", detail: "resp" };
    }),

    // Blobs store availability
    check("blobs_store", async () => {
      try{
        const { getStore } = await import("@netlify/blobs");
        const store = getStore("picks-log");
        await store.get("health.json"); // may be null
        return { status: "green", detail: "ok" };
      }catch(e){
        return { status: "red", detail: String(e?.message || e) };
      }
    }),

    // Daily learn function reachable
    check("mlb_daily_learn", async () => {
      const r = await fetch(`${origin}/.netlify/functions/mlb-daily-learn?date=${encodeURIComponent(date)}`);
      // If it returns JSON with ok or games it's green; else yellow for reachable
      if(!r.ok) return { status: "red", detail: `HTTP ${r.status}` };
      const j = await r.json().catch(()=> ({}));
      if(j && (j.ok || typeof j.games === "number" || typeof j.samples === "number")) return { status: "green", detail: "ok" };
      return { status: "yellow", detail: "resp" };
    }),
  ]);

  return new Response(JSON.stringify({ date, ...out }), {
    headers: { "content-type": "application/json" }
  });
};
