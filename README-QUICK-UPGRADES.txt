QUICK, SAFE UPGRADES (no breakage)

WHAT'S INCLUDED
1) SlateBadge (shows 'Slate (ET): YYYY-MM-DD') — visual only
   - src/utils/date.js
   - src/components/SlateBadge.jsx
2) ensureMinPicks — fills to a floor (default 6) without changing your model math
   - src/utils/min_picks.js
3) save-picks Netlify Function — logs your daily picks for learning (opt-in button)
   - netlify/functions/save-picks.mjs
   - src/components/SavePicksButton.jsx

HOW TO INSTALL (LIKE YOU'RE 5)
A) Upload files
   - GitHub → your repo → Add file → Upload files
   - Drag the files preserving paths shown above
   - Commit changes
B) Netlify deploy
   - Netlify → Deploys → Deploy project without cache

HOW TO USE
1) Show the slate badge on MLB (or any page):
   In your page component (e.g., src/MLB.jsx) near the title:
     import SlateBadge from "./components/SlateBadge.jsx";
   Then in JSX:
     <SlateBadge />

2) Guarantee a minimum of 6 picks (still max 2 per game):
   In the file that builds MLB picks (where you have 'selected' and 'pool'):
     import { ensureMinPicks } from "./utils/min_picks.js";
     const final = ensureMinPicks(selected, pool, 6, 2);
     setPicks(final);
   (Replace 'selected' with your chosen array, and 'pool' with the ranked candidates array.)

3) Log today's picks (for learning later):
   In your MLB page after you have 'picks' in state:
     import SavePicksButton from "./components/SavePicksButton.jsx";
   In JSX, add a small block near the 'Generate' button:
     <SavePicksButton sport="mlb_hr" picks={picks} />
   This POSTs to /.netlify/functions/save-picks and stores them in Netlify Blobs.

OPTIONAL NETLIFY TOML CHECK
Ensure functions section includes blobs (if not already present):
[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@netlify/blobs"]

SAFETY
- These changes do not alter your model logic, API calls, or odds.
- If you don't import them, nothing changes.
- Start with SlateBadge (visual only), then add ensureMinPicks, then SavePicks button.

## OddsAPI + Why upgrade (Aug 16, 2025)

- New robust odds fetcher: `netlify/functions/odds-props.mjs`
  - Discovers the correct market key via `/odds-markets`
  - Fetches `player_home_runs` odds and exposes rows with { player, price, bookmaker, eventId }
  - Emits quota headers in JSON

- Diagnostics endpoint: `netlify/functions/odds-diagnostics.mjs`
  - Verifies env presence, markets availability, and sample outcome count

- Why builder util: `src/utils/why.js`
  - `buildWhy()` composes a readable explanation string including model %, market price & edge, pitcher/park/weather (if available), hot/cold, lineup slot
  - `normName()` to join odds rows to your candidates

- Sanity script: `scripts/sanity-odds.sh`
  - Run against local dev server: `scripts/sanity-odds.sh http://localhost:8888`
  - Or deploy preview URL

### Integration tips

- Join odds to candidates by `normName(player)` on both sides.
- After join, compute: `impliedFromOdds = impliedFromAmerican(price)`, `edgePctPts = modelHR - impliedFromOdds`.
- Pass those values into `buildWhy({ ... })` for each row; if price is missing, it will include `no odds` automatically.
