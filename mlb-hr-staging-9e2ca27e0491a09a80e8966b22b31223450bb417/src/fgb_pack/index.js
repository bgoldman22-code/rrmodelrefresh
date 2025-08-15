// src/fgb_pack/index.js
// Lightweight calibration + hooks used by MLB.jsx

export function applyCalibration(candidates = [], calibration = {}){
  // calibration can look like:
  // { global: { probMult: 1.0, probAdd: 0.0 }, players: { "Aaron Judge": { probMult: 1.05 } } }
  const g = calibration.global || {};
  const pmap = calibration.players || {};
  const gMult = numberOr(g.probMult, 1.0);
  const gAdd  = numberOr(g.probAdd,  0.0);

  return candidates.map(c => {
    const name = c.name || c.player || '';
    const pl = pmap[name] || {};
    const pMult = numberOr(pl.probMult, 1.0);
    const pAdd  = numberOr(pl.probAdd,  0.0);

    const base = numberOr(c.prob, 0.05);
    let adj = base;
    adj = adj * gMult + gAdd;
    adj = adj * pMult + pAdd;

    // keep sane bounds
    adj = clamp(adj, 0.01, 0.95);

    return { ...c, prob: adj, _calibratedFrom: base };
  });
}

export async function enhanceCandidates(cands){
  // Optional hook to enrich candidates. Safe passthrough by default.
  return Array.isArray(cands) ? cands : [];
}

export function logPredictions(dateISO, picks){
  try{
    if(typeof localStorage === 'undefined') return;
    const key = `preds:${dateISO}`;
    const payload = picks.map(p => ({ name: p.name, team: p.team, gameId: p.gameId, prob: p.prob }));
    localStorage.setItem(key, JSON.stringify(payload));
  }catch{}
}

export async function gradeAndUpdate(samples){
  // Client-side stub. Your Netlify Function handles real learning.
  return { ok: true, updated: false, graded: (samples?.length||0) };
}

export function getSummary(){
  try{
    if(typeof localStorage === 'undefined') return { total:0 };
    const keys = Object.keys(localStorage).filter(k => k.startsWith('preds:'));
    return { total: keys.length, keys };
  }catch{
    return { total:0 };
  }
}

// --- utils ---
function numberOr(x, d){ const n = Number(x); return Number.isFinite(n) ? n : d; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
