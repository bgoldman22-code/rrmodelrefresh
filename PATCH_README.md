# Patch: Context HR scoring + richer WHY + production-weight helper

## Files added/updated
- `src/models/hr_scoring.js` — exports `scoreHRPick(cand)` with contextual multipliers and varied WHY text.
- `src/server/learn/weights.js` — exports `productionWeight(season_hr)` for training-time weighting.

## Zero-config drop-in
If your UI already imports `scoreHRPick` from `./models/hr_scoring.js`, this will just work.
Otherwise, import and assign results to each row:
```js
import { scoreHRPick } from "./models/hr_scoring.js";
const s = scoreHRPick(cand);
row.prob_pp = s.prob_pp;
row.model_odds = s.model_odds;
row.why = s.why;
```
