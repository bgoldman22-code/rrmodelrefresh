# Round Robin Picks (Odds‑Free)

Three pages, no sportsbook odds:

- **MLB HR** — StatsAPI model (no key).
- **NFL Anytime TD** — ESPN schedule + roster; heuristic baselines (RB/WR/TE).
- **Soccer Anytime Goal** — football-data.org top scorers + fixtures (requires free API key).

## Quick Deploy (Netlify + GitHub)

1. **Upload to GitHub** (repo root should have `package.json`, `index.html`, `netlify.toml`, `src/`).
2. On Netlify: **Import from Git** → set Build `npm run build`, Publish `dist`.
3. Set env var (only for Soccer page):  
   - `VITE_FOOTBALL_DATA_KEY` = your football-data.org API key.
4. Deploy. App uses **HashRouter** so `/mlb`, `/nfl`, `/soccer` work without custom redirects.

## Data Sources (free)

- MLB: https://statsapi.mlb.com/ (schedule, rosters, people, stats)
- NFL: ESPN public scoreboard & team rosters (no key): `site.api.espn.com` (unofficial, public JSON)
- Soccer: https://www.football-data.org/ (free key; v4 endpoints)

## Notes

- Picks enforce **12 total**, **≥ 8 different games**, **≤ 2 per game**.
- MLB model blends: season + last-15 HR rates, pitcher HR allowed, platoon, and a coarse park factor table.
- NFL model is heuristic until we add richer public stats (TD share, red-zone). It still yields stable candidates daily.
- Soccer uses each league’s **Top Scorers** endpoint as a proxy for goal likelihood on matchdays.
- Non‑commercial use only.
