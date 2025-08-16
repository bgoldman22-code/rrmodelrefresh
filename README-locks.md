# Daily Lock + Odds Refresh — Drop-in (no manual edits)

## What this adds
- Serverless schedules:
  - `lock_picks` — generates `/picks/YYYY-MM-DD.json` once per day at 11:00 AM ET.
  - `update_odds` — updates `/odds/YYYY-MM-DD.json` every 10 minutes.
- Frontend (MLB.jsx) now **reads locked picks** and **merges latest odds** automatically.

## How to deploy
1. Commit these files as-is.
2. Push to Netlify. The included `netlify.toml` already contains schedules.
3. At 11:00 ET, `/picks/<today>.json` appears. Every ~10 minutes `/odds/<today>.json` updates.
4. The MLB page shows the locked list with live odds merged.

## Optional env vars
- `APP_VERSION` — stamps the payload header.
- `COMMIT_REF` — Netlify sets this automatically.
- `NETLIFY_BLOBS_TOKEN` — only if your Blobs store requires it.
