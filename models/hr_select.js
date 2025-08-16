\
/* models/hr_select.js */
import { normalizePlayerName } from "../src/lib/common/name_map.js";

const POWER_ANCHORS = new Set([
  "Kyle Schwarber","Shohei Ohtani","Cal Raleigh","Juan Soto","Aaron Judge",
  "Yordan Alvarez","Pete Alonso","Gunnar Henderson","Matt Olson","Corey Seager",
  "Marcell Ozuna","Kyle Tucker","Rafael Devers"
]);

function keyGame(x){
  const home = x.home || x.home_team || x.homeTeam;
  const away = x.away || x.away_team || x.awayTeam || x.opponent;
  const game = x.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
  const eventId = x.eventId || x.event_id || x.gameId || "";
  return eventId ? `${game}#${eventId}` : game;
}

export function selectHRPicks(scored){
  const perGameCap = 2;
  const maxPicks = 14;
  const anchorFloor = 0.12;

  const sorted = [...scored].sort((a,b)=>{
    const pa = a.p_final ?? 0, pb = b.p_final ?? 0;
    if (pb !== pa) return pb - pa;
    const ma = Math.abs(a.modelAmerican ?? 99999);
    const mb = Math.abs(b.modelAmerican ?? 99999);
    return ma - mb;
  });

  const picks = [];
  const perGame = new Map();

  function tryAdd(x){
    const g = keyGame(x);
    if ((perGame.get(g)||0) >= perGameCap) return false;
    picks.push(x);
    perGame.set(g, (perGame.get(g)||0)+1);
    return true;
  }

  const anchors = sorted.filter(x => POWER_ANCHORS.has(normalizePlayerName(x.name)) && (x.p_final ?? 0) >= anchorFloor);
  for (const a of anchors){
    if (picks.length >= maxPicks) break;
    tryAdd(a);
  }

  for (const x of sorted){
    if (picks.length >= maxPicks) break;
    if (picks.includes(x)) continue;
    tryAdd(x);
  }

  const haveAnchors = picks.filter(x => POWER_ANCHORS.has(normalizePlayerName(x.name))).length;
  const message = `Picked ${picks.length} • Anchors included: ${haveAnchors} • Games ${new Set(picks.map(keyGame)).size}`;
  return { picks, message };
}
