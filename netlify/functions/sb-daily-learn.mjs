// netlify/functions/sb-daily-learn.mjs
import { getStore } from '@netlify/blobs';

export const config = { schedule: '@daily' };

export async function handler(event) {
  const store = getStore('sb-learn');
  const date = new Date(); date.setUTCDate(date.getUTCDate()-1);
  const ymd = date.toISOString().slice(0,10);
  try {
    const picks = (await store.get(`picks:${ymd}`, { type:'json' })) || [];
    if(picks.length===0) return json(200, { ok:true, date: ymd, graded: 0, message: 'no picks' });

    const graded = await grade('sb', ymd, picks);
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

  const results = [];
  for(const p of picks){
    try{
      const gameId = String(p.gameId||'');
      const pid = Number(p.id||0);
      if(!gameId || !pid){ results.push({ ...p, hit:false, reason:'missing ids' }); continue; }
      const url = `https://statsapi.mlb.com/api/v1/game/${gameId}/boxscore`;
      const r = await fetch(url);
      if(!r.ok){ results.push({ ...p, hit:false, reason:'boxscore fetch fail' }); continue; }
      const j = await r.json();
      const allPlayers = Object.assign({}, j?.teams?.home?.players||{}, j?.teams?.away?.players||{});
      const key = `ID${pid}`;
      const row = allPlayers[key];
      const sb = Number(row?.stats?.batting?.stolenBases||0);
      results.push({ ...p, hit: sb >= 1, metric: { sb } });
    }catch{ results.push({ ...p, hit:false, reason:'grade error' }); }
  }
  return results;

}

function json(code,obj){ return { statusCode:code, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(obj) }; }
function avg(arr){ if(!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
