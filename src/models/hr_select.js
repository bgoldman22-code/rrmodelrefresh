// src/models/hr_select.js
import { scoreHRPick } from "./hr_scoring.js";

function gameKeyFrom(x){
  // Prefer explicit game string if it looks like "AWY@HOM"
  if (x.game && typeof x.game === "string" && x.game.includes("@")) {
    const base = x.game.trim();
    const eid = x.eventId || x.event_id || x.gameId || x.id || "";
    return eid ? `${base}#${eid}` : base;
  }
  const away = (x.away || x.away_team || x.awayTeam || x.opponent || "AWY").toString().trim();
  const home = (x.home || x.home_team || x.homeTeam || x.team || "HOM").toString().trim();
  const base = `${away}@${home}`;
  const eid = x.eventId || x.event_id || x.gameId || x.id || "";
  return eid ? `${base}#${eid}` : base;
}

export function selectHRPicks(candidates){
  // Score
  const scored = candidates.map(c => ('p_model' in c ? c : scoreHRPick(c)));

  // Relaxed but power-biased pool
  let pool = scored.filter(s =>
    (s.p_model >= 0.11) ||
    (s.iso && s.iso >= 0.170) ||
    (s.barrelRate && s.barrelRate >= 0.08)
  );
  if (pool.length < 6) pool = scored.filter(s => (s.p_model >= 0.09) || (s.iso && s.iso >= 0.155));
  if (pool.length < 6) pool = scored;

  // Sort by model prob, then blended, then EV
  pool.sort((a,b) => (b.p_model - a.p_model) || (b.p_blended - a.p_blended) || ((b.ev??-999) - (a.ev??-999)));

  // Enforce max 2 per *event/game*
  const picks = [];
  const perGame = new Map();
  for(const s of pool){
    const g = gameKeyFrom(s);
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
