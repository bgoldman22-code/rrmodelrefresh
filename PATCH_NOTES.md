# Patch notes

This patch enhances HR odds ingestion to handle more providers and market shapes:
- Cache-busting query param to avoid stale 200/empty bodies
- Multi-region queries (us, us2)
- Loose market name matching: "player_home_runs", "player_to_hit_a_home_run", "Home Runs", "To Hit a HR", etc.
- Robust outcome price parsing across different field names

File changed:
- src/lib/odds_merge.js
