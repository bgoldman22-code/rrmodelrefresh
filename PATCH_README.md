# Patch: realistic per-game HR% + proper EV + richer WHY (no UI edits)

This patch updates **only**:
- `src/models/hr_scoring.js` — returns `{ prob_pp, model_odds, why, ev_1u }` with realistic probabilities and proper EV(1u).
- `src/server/learn/weights.js` — training-time production weighting helper.

## How to apply
1) Unzip into your project root (overwrites the two files above).
2) Commit & deploy.

If your UI already calls `scoreHRPick(cand)` for each candidate, the table will immediately show:
- Realistic **Model HR%**
- Correct **EV (1u)** (no longer mirrors probability)
- Varied, human **WHY**

### Notes
- Probabilities use per-PA → per-game conversion with soft contextual multipliers and a temporary calibration shrink (0.65×) to avoid 20–30% spikes until your full calibrator is re-enabled.
- If your candidate object includes `live_odds`, EV uses that; otherwise it falls back to the model-implied odds.
