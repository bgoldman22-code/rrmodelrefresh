// netlify/functions/soccer-daily-learn.mjs
import { getStore } from '@netlify/blobs';

export const config = { schedule: '@daily' };

export async function handler(event) {
  const store = getStore('soccer-learn');
  const date = new Date(); date.setUTCDate(date.getUTCDate()-1);
  const ymd = date.toISOString().slice(0,10);
  try {
    const picks = (await store.get(`picks:${ymd}`, { type:'json' })) || [];
    if(picks.length===0) return json(200, { ok:true, date: ymd, graded: 0, message: 'no picks' });

    const graded = await grade('soccer', ymd, picks);
    const cal = (await store.get('calibration', { type: 'json' })) || { global: { probMult: 1.00 } };

    const predAvg = avg(picks.map(p => Number(p.prob||0)));
    const actual = avg(graded.map(g => Number(g.hit?1:0)));
    let mult = Number(cal?.global?.probMult||1.0);
    const diff = actual - predAvg;
    if(diff > 0.05) mult = clamp(mult * 1.02, 0.85, 1.15);
    else if(diff < -0.05) mult = clamp(mult * 0.98, 0.85, 1.15);
    cal.global = { ...(cal.global||{}), probMult: +mult.toFixed(3) };
    await store.set('calibration', JSON.stringify(cal));

    await store.set(`graded:${ymd}`, JSON.stringify(graded));

    return json(200, { ok:true, date: ymd, graded: graded.length, predAvg:+predAvg.toFixed(3), actual:+actual.toFixed(3), newMult: cal.global.probMult });
  } catch(e) {
    return json(500, { ok:false, date: ymd, message: String(e) });
  }
}

async function grade(sport, dateISO, picks){

  // We try football-data.org first (needs your proxy), else return ungraded.
  // Picks should carry gameId (match id) and player name.
  const results = [];
  for(const p of picks){
    try{
      const matchId = String(p.gameId||'');
      const name = String(p.name||'').toLowerCase();
      if(!matchId || !name){ results.push({ ...p, hit:false, reason:'missing ids' }); continue; }
      const r = await fetch(`${process.env.URL}/.netlify/functions/fd-proxy?path=/v4/matches/${matchId}`);
      if(!r.ok){ results.push({ ...p, hit:false, reason:'fd match fetch fail' }); continue; }
      const j = await r.json();
      const events = (j?.match?.events || j?.events || []);
      const goals = events.filter(e => (e.type==='GOAL' || e.detail==='Goal') && e?.player?.name);
      const didScore = goals.some(g => String(g.player.name||'').toLowerCase() === name);
      results.push({ ...p, hit: didScore, metric: { goals: goals.length } });
    }catch{ results.push({ ...p, hit:false, reason:'grade error' }); }
  }
  return results;

}

function json(code,obj){ return { statusCode:code, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(obj) }; }
function avg(arr){ if(!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
