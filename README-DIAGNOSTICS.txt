API DIAGNOSTICS (green/yellow/red)

WHAT YOU GET
- A small bar at the bottom of your pages that pings the major data sources and shows:
  MLB StatsAPI, ESPN fallback, Football-Data, OddsAPI (prewarm + props), Netlify Blobs, mlb-daily-learn
- Colors: green=ok, yellow=reachable but maybe empty/zero/quota, red=error, gray=unknown

FILES
- netlify/functions/diag.mjs
- src/components/DiagnosticsBar.jsx
- src/utils/date.js (shared helper, safe to keep even if you already have it)

INSTALL (LIKE YOU'RE 5)
1) GitHub → your repo → Add file → Upload files → drag files from this zip, keep folders.
2) Commit.
3) Netlify → Deploys → Deploy project without cache.

USE IT (per page)
In any page (MLB/NFL/Soccer), import and drop at the bottom:
  import DiagnosticsBar from "./components/DiagnosticsBar.jsx";
  ...
  <DiagnosticsBar />

NOTES
- The function tries to use FOOTBALL_DATA_KEY (or VITE_FOOTBALL_DATA_KEY) server-side.
- Odds functions are called with 'dry=1' where possible to avoid burning credits.
- If a function is missing in your repo, its status will be red (404/500).

TROUBLESHOOT
- If Football-Data says "no token", add FOOTBALL_DATA_KEY in Netlify → Site settings → Environment variables.
- If OddsAPI statuses are red, verify VITE_ODDS_API_KEY is set and your function endpoints exist.
