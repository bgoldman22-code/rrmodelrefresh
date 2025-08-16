// netlify/functions/diag-hr.js
// Hit internal functions with absolute URLs and report statuses + counts.
export const handler = async (event, context) => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
  const results = [];
  const urls = [
    "/.netlify/functions/odds-mlb-hr",
    "/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
    "/.netlify/functions/odds-props?regions=us"
  ];
  for (const path of urls){
    const url = base ? (base + path) : path;
    try{
      const r = await fetch(url);
      const status = r.status;
      let info = {};
      try{
        const j = await r.json();
        info.eventsCount = Array.isArray(j?.events) ? j.events.length : null;
        if (Array.isArray(j?.events)){
          // count HR markets/outcomes
          let mkts = 0, outs = 0;
          for (const ev of j.events){
            for (const bk of (ev.bookmakers||[])){
              for (const mk of (bk.markets||[])){
                const key = mk?.key || mk?.key_name || mk?.market || mk?.title || "";
                const k = String(key).toLowerCase();
                const isHR = (k.includes("home") && k.includes("run")) || ["player_home_runs","player_to_hit_a_home_run"].some(v=>k.includes(v));
                if (isHR){ mkts++; outs += (mk.outcomes||[]).length; }
              }
            }
          }
          info.hrMarkets = mkts;
          info.hrOutcomes = outs;
        } else if (Array.isArray(j)){
          info.arrayLength = j.length;
        }
      }catch(e){
        info.parseError = String(e);
      }
      results.push({ path, url, status, info });
    }catch(e){
      results.push({ path, url, status: "fetch_error", error: String(e) });
    }
  }

  // Basic env sanity (do not expose secrets)
  const env = {
    NODE_VERSION: process.version,
    HAS_URL: !!process.env.URL,
    HAS_DEPLOY_PRIME_URL: !!process.env.DEPLOY_PRIME_URL,
  };

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ env, results }, null, 2)
  };
};
