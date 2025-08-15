
// src/models/hr_select.js
import { scoreHRPick } from "./hr_scoring.js";

function keyGame(x){
  return x.game || x.gameId || `${x.away || x.away_team || x.opponent || "AWY"}@${x.home || x.home_team || x.team || "HOM"}`;
}

export function selectHRPicks(candidates){
  // Score (idempotent: if p_model exists we keep it)
  const scored = candidates.map(c => ('p_model' in c ? c : scoreHRPick(c)));

  // Filter out fringe bats: require some power OR model confidence
  let pool = scored.filter(s =>
    (s.p_model >= 0.11) ||
    (s.iso && s.iso >= 0.170) ||
    (s.barrelRate && s.barrelRate >= 0.08)
  );

  // If too thin, ease threshold
  if (pool.length < 6){
    pool = scored.filter(s => (s.p_model >= 0.09) || (s.iso && s.iso >= 0.155));
  }
  if (pool.length < 6){
    pool = scored; // use everything we have, we'll sort hard
  }

  // Sort: model prob desc, then blended, then EV
  pool.sort((a,b) => (b.p_model - a.p_model) || (b.p_blended - a.p_blended) || ((b.ev??-999) - (a.ev??-999)));

  // Enforce max 2 per game; aim 12, floor 6
  const picks = [];
  const perGame = new Map();
  for(const s of pool){
    const g = keyGame(s);
    const count = perGame.get(g) || 0;
    if (count >= 2) continue;
    picks.push(s);
    perGame.set(g, count + 1);
    if (picks.length >= 12) break;
  }
  if (picks.length < 6){
    return { picks, message: `Small slate: picked ${picks.length} across ${perGame.size} games (max 2/game).` };
  }
  return { picks, message: picks.length < 12 ? `Thin slate: picked ${picks.length}.` : "" };
}
