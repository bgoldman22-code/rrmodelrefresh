import { getStore } from '@netlify/blobs';

async function j(url){
  const r = await fetch(url);
  if(!r.ok) return {};
  return r.json();
}
function ymdUTC(d){ return d.toISOString().slice(0,10); }
function daysAgo(n){
  const d = new Date(Date.now() - n*24*60*60*1000);
  return ymdUTC(d);
}
function yesterday(){
  return daysAgo(1);
}
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

async function getHRSetForDate(date){
  const sched = await j('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + date);
  const dates = sched?.dates || [];
  const ids = [];
  for(const d of dates){
    for(const g of (d.games||[])){
      if(g?.gamePk) ids.push(String(g.gamePk));
    }
  }
  const hrSet = new Set();
  for(const pk of ids){
    const live = await j('https://statsapi.mlb.com/api/v1.1/game/' + pk + '/feed/live');
    const plays = live?.liveData?.plays?.allPlays || [];
    for(const pl of plays){
      const isHR = (pl?.result?.eventType === 'home_run' || pl?.result?.event === 'Home Run');
      if(!isHR) continue;
      const batter = pl?.matchup?.batter?.id || null;
      if(batter) hrSet.add(Number(batter));
    }
  }
  return hrSet;
}

function grade(picks, hrSet){
  const rows = picks.map(p => {
    const id = (typeof p.mlbId === 'number' || typeof p.mlbId === 'string') ? Number(p.mlbId) : null;
    const prob = Number(p.prob || 0);
    const y = id && hrSet.has(Number(id)) ? 1 : 0;
    const brier = (prob - y)*(prob - y);
    return { id, prob, y, brier };
  });
  let hits=0, misses=0, exp=0, brierSum=0;
  for(const r of rows){
    exp += r.prob;
    brierSum += r.brier;
    if(r.y===1) hits++; else misses++;
  }
  const n = rows.length || 1;
  const hitRate = n ? hits/n : 0;
  const brier = brierSum / n;
  // deciles
  const bins = Array.from({length:10}, ()=>({n:0, sumP:0, sumY:0}));
  for(const r of rows){
    let idx = Math.floor(clamp(Math.floor(r.prob*10), 0, 9));
    bins[idx].n += 1;
    bins[idx].sumP += r.prob;
    bins[idx].sumY += r.y;
  }
  const reliability = bins.map((b,i)=> ({
    bin: i/10,
    n: b.n,
    avgP: b.n? b.sumP/b.n : 0,
    hit: b.n? b.sumY/b.n : 0
  }));
  return { hits, misses, expected: exp, hitRate, brier, reliability, n };
}

function listLastNDates(n, endDate){
  const out = [];
  const end = endDate ? new Date(endDate) : new Date();
  for(let i=1; i<=n; i++){
    const d = new Date(end.getTime() - i*24*60*60*1000);
    out.push( d.toISOString().slice(0,10) );
  }
  return out;
}

export default async (req, context) => {
  try{
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || yesterday();
    const window = Math.max(1, Math.min(30, Number(url.searchParams.get('window')||7)));

    const logs = getStore('mlb-logs');
    const todayPred = await logs.get(`predictions/${date}.json`);
    const predObj = todayPred ? JSON.parse(todayPred) : null;
    const picks = predObj?.picks || [];

    const hrSet = await getHRSetForDate(date);
    const lastNight = grade(picks, hrSet);

    // 7-day (or window) aggregate
    let agg = { hits:0, misses:0, expected:0, brierSum:0, n:0 };
    const dates = listLastNDates(window, date);
    for(const d of dates){
      const raw = await logs.get(`predictions/${d}.json`);
      if(!raw) continue;
      const obj = JSON.parse(raw);
      const hr = await getHRSetForDate(d);
      const g = grade(obj.picks||[], hr);
      agg.hits += g.hits; agg.misses += g.misses;
      agg.expected += g.expected; agg.brierSum += g.brier * g.n; agg.n += g.n;
    }
    const sevenDay = {
      hits: agg.hits,
      misses: agg.misses,
      expected: agg.expected,
      hitRate: agg.n? agg.hits/agg.n : 0,
      brier: agg.n? agg.brierSum/agg.n : 0,
      n: agg.n
    };

    return new Response(JSON.stringify({ ok:true, date, lastNight, sevenDay }), {
      headers: { 'content-type': 'application/json' }
    });
  }catch(e){
    return new Response(JSON.stringify({ error:'metrics-failed', message: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
