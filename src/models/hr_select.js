// src/models/hr_select.js
import { scoreHRPick } from "./hr_scoring.js";

const DEFAULTS = { MIN_PICKS: 6, MAX_PICKS: 12, MAX_PER_GAME: 2 };

function keyForGame(p){
  return p.game || p.gameId || `${p.away_abbr||p.away||"AWY"}@${p.home_abbr||p.home||"HOM"}`;
}

export function selectHRPicks(candidates, opts={}){
  const cfg = { ...DEFAULTS, ...opts };
  const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];

  if(pool.length === 0){
    return { picks: [], meta: { selected: 0, pool: 0, smallSlate:false }, message: "No candidate players provided." };
  }

  const scored = pool.map(c => scoreHRPick({
    name: c.name || c.player || c.playerName,
    team: c.team || c.team_abbr || c.playerTeam,
    gameId: keyForGame(c),
    oddsAmerican: (typeof c.oddsAmerican === 'number' ? c.oddsAmerican : (typeof c.odds_sim === 'number' ? c.odds_sim : undefined)),

    seasonHR: c.seasonHR, seasonPA: c.seasonPA,
    careerHR: c.careerHR, careerPA: c.careerPA,

    pos: c.pos || c.position,
    lineupSpot: c.lineupSpot || c.order || c.batOrder,
    expPA: c.expPA,
    iso: c.iso,

    recentHR14: c.recentHR14, recentPA14: c.recentPA14,

    parkMult: c.parkMult, wxMult: c.wxMult,
    pitchMult: c.pitchMult, zoneMult: c.zoneMult, bvpMult: c.bvpMult,
    starterHR9: c.starterHR9, lgHR9: c.lgHR9
  }));

  const filtered = scored.filter(s => !s.filtered);
  filtered.sort((a,b)=>
    (b.p_model - a.p_model) ||
    (b.p_blended - a.p_blended) ||
    ((b.ev ?? -999) - (a.ev ?? -999))
  );

  const out = [];
  const perGame = {};
  for(const s of filtered){
    const g = keyForGame(s);
    if((perGame[g]||0) >= cfg.MAX_PER_GAME) continue;
    out.push({
      ...s,
      game: g,
      hr_prob_sim: s.p_blended,
      odds_sim: typeof s.oddsAmerican === 'number' ? s.oddsAmerican : (s.odds_sim ?? null),
      why2: s.reasons?.join(' ')
    });
    perGame[g] = (perGame[g]||0) + 1;
    if(out.length >= cfg.MAX_PICKS) break;
  }

  let message = "";
  let smallSlate = false;
  if(out.length < cfg.MIN_PICKS){
    for(const s of filtered){
      const already = out.find(p => p.name===s.name && keyForGame(p)===keyForGame(s));
      if(already) continue;
      out.push({
        ...s,
        game: keyForGame(s),
        hr_prob_sim: s.p_blended,
        odds_sim: typeof s.oddsAmerican === 'number' ? s.oddsAmerican : (s.odds_sim ?? null),
        why2: s.reasons?.join(' ')
      });
      if(out.length >= cfg.MIN_PICKS) break;
    }
    message = `Small slate: picked ${out.length}.`;
    smallSlate = true;
  }

  return {
    picks: out,
    meta: { selected: out.length, pool: pool.length, smallSlate },
    message
  };
}

export default { selectHRPicks };
