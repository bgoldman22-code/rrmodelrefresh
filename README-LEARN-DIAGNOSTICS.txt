LEARNING DIAGNOSTICS (green/yellow + metrics)

WHAT IT DOES
- Shows per-model health: picks logged today, samples learned, number of days, last run time, and function reachability.
- Models covered: MLB HR, MLB 2+ Hits, MLB SB, NFL TD, Soccer AGS (safe if some are not configured).

FILES
- netlify/functions/learn-diag.mjs
- src/components/LearningDiagnostics.jsx

INSTALL
1) Upload these files (keep folders): GitHub → Add file → Upload files → Commit.
2) Netlify → Deploys → Deploy project without cache.

USE
Add under your existing API Diagnostics panel:
  import LearningDiagnostics from "./components/LearningDiagnostics.jsx";
  ...
  <LearningDiagnostics />

HOW IT WORKS
- Reads Netlify Blobs stores if present:
  * "picks-log" for today's picks: key "<model>/<YYYY-MM-DD>.json"
  * Learning summaries: tries "<store>/summary.json" where store is one of:
      MLB HR:       mlb-learning or mlb_hr-learning
      MLB 2+ Hits:  hits-learning or mlb_hits2-learning
      MLB SB:       sb-learning or mlb_sb-learning
      NFL TD:       nfl-learning or nfl_td-learning
      Soccer AGS:   soccer-learning or soccer_ags-learning
- Pings each daily-learn function with ?dry=1 to see if it's reachable (doesn't mutate data).

STATUS COLORS
- green = some proof of life (picks today OR samples/days in summary OR function reachable)
- yellow = reachable but no explicit proof yet (e.g., no summary and picks not saved)
- red = hard error (should only happen if the function throws or API crash)

TIP
- Pair this with the "Save today’s picks" button pack so picks are logged even before you wire the full learner.
