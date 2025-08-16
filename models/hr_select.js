// models/hr_select.js
// Select top HR picks using a utility function and composition rules.
import { getWeights } from "../src/lib/common/calibration.js";
import { scoreSetUtility } from "../src/lib/common/utility.js";

function keyGame(x){
  const home = x.home || x.home_team || x.homeTeam;
  const away = x.away || x.away_team || x.awayTeam || x.opponent;
  const game = x.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
  const eventId = x.eventId || x.event_id || x.gameId || "";
  return eventId ? `${game}#${eventId}` : game;
}

export function selectHRPicks(scored){
  const { thresholds } = getWeights();
  const maxPerGame = thresholds.per_game_cap ?? 2;
  const maxPicks    = thresholds.max_picks ?? 12;
  const anchor_pR   = thresholds.anchor_pR ?? 0.20;
  const valueMax    = thresholds.value_max ?? 2;
  const latentMax   = thresholds.latent_max ?? 1;

  // Sort candidates by a hybrid: p_final, then edgeQuality, then modelAmerican shortest
  const sorted = [...scored].sort((a,b)=>{
    const pa = a.p_final ?? 0, pb = b.p_final ?? 0;
    if (pb !== pa) return pb - pa;
    const ea = a.edgeQuality ?? 0, eb = b.edgeQuality ?? 0;
    if (eb !== ea) return eb - ea;
    const ma = Math.abs(a.modelAmerican ?? 99999);
    const mb = Math.abs(b.modelAmerican ?? 99999);
    return ma - mb;
  });

  const picks = [];
  const perGame = new Map();
  let anchors=0, values=0, latents=0;

  function canAdd(x){
    const g = keyGame(x);
    const used = perGame.get(g) ?? 0;
    if (used >= maxPerGame) return false;
    // classify
    const isAnchor = (x.p_R ?? 0) >= anchor_pR;
    const isValue  = (x.edgeQuality ?? 0) > 0.05 && !isAnchor;
    const isLatent = (x.latentScore ?? 0) >= 0.35 && !isAnchor;
    // enforce counts softly: allow add if not breaking hard caps
    if (isValue && values >= valueMax) return false;
    if (isLatent && latents >= latentMax) return false;
    return true;
  }

  for (const x of sorted){
    if (picks.length >= maxPicks) break;
    if (!canAdd(x)) continue;
    picks.push(x);
    const g = keyGame(x);
    perGame.set(g, (perGame.get(g)??0)+1);
    if ((x.p_R ?? 0) >= anchor_pR) anchors++;
    else if ((x.edgeQuality ?? 0) > 0.05) values++;
    else if ((x.latentScore ?? 0) >= 0.35) latents++;
  }

  // If we somehow failed to include an anchor, try to force one in
  if (anchors === 0){
    const anchor = sorted.find(x => (x.p_R ?? 0) >= anchor_pR);
    if (anchor){
      picks.pop();
      picks.push(anchor);
      anchors=1;
    }
  }

  // Optional: compute a simple utility for info
  const util = scoreSetUtility(picks);
  const message = `Picked ${picks.length} • Anchors ${anchors} • Value ${values} • Latent ${latents} • Utility ${util.toFixed(2)}`;
  return { picks, message };
}
