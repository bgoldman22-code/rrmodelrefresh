import { getStore } from '@netlify/blobs';

// Scheduled: daily ~3:05am ET (07:05 UTC)
export const config = { schedule: "5 7 * * *" };

async function j(url){
  const r = await fetch(url);
  if(!r.ok) return {};
  return r.json();
}
function ymdUTC(d){ return d.toISOString().slice(0,10); }
function yesterday(){
  const d = new Date(Date.now() - 24*60*60*1000);
  return ymdUTC(d);
}
function sanitizeDate(raw){
  if(!raw) return yesterday();
  const s = String(raw).toLowerCase();
  if(s==='yesterday') return yesterday();
  if(s==='today') return ymdUTC(new Date());
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return yesterday();
}
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

async function getGameIds(date){
  const sched = await j('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + date);
  const dates = sched?.dates || [];
  const ids = [];
  for(const d of dates){
    for(const g of (d.games||[])){
      if(g?.gamePk) ids.push(String(g.gamePk));
    }
  }
  return ids;
}

export default async (req, context) => {
  try{
    const url = new URL(req.url);
    const date = sanitizeDate(url.searchParams.get('date'));

    // 1) Learn pitch & zone aggregates from live play-by-play
    const gamePks = await getGameIds(date);
    const learned = { leaguePitch:{}, leagueZone:{}, batterPitch:{}, pitcherPitch:{}, batterZone:{}, pitcherZone:{} };
    let samples = 0;

    for(const pk of gamePks){
      const live = await j('https://statsapi.mlb.com/api/v1.1/game/' + pk + '/feed/live');
      const plays = live?.liveData?.plays?.allPlays || [];
      for(const pl of plays){
        const batter = pl?.matchup?.batter?.id || null;
        const pitcher = pl?.matchup?.pitcher?.id || null;
        const isHR = (pl?.result?.eventType === 'home_run' || pl?.result?.event === 'Home Run');

        const evs = pl?.playEvents || [];
        let lastPitch = null;
        for(let i=evs.length-1;i>=0;i--){
          const e = evs[i];
          if(e && e.isPitch){ lastPitch = e; break; }
        }
        if(!lastPitch) continue;
        const det = lastPitch.details || {};
        const pd  = lastPitch.pitchData || {};
        if(det.isInPlay !== true) continue;

        const type = det?.type?.code || 'UNK';
        const zone = (typeof pd?.zone === 'number') ? String(pd.zone) : 'UNK';

        function inc(map, key, f){
          map[key] = map[key] || { hr:0, ip:0 };
          map[key].ip += 1; if(f) map[key].hr += 1;
        }

        inc(learned.leaguePitch, type, isHR);
        inc(learned.leagueZone, zone, isHR);

        if(batter){
          learned.batterPitch[batter] = learned.batterPitch[batter] || {};
          inc(learned.batterPitch[batter], type, isHR);
          learned.batterZone[batter] = learned.batterZone[batter] || {};
          inc(learned.batterZone[batter], zone, isHR);
        }
        if(pitcher){
          learned.pitcherPitch[pitcher] = learned.pitcherPitch[pitcher] || {};
          const cur = learned.pitcherPitch[pitcher][type] || { hrAllowed:0, ip:0 };
          learned.pitcherPitch[pitcher][type] = { hrAllowed: cur.hrAllowed + (isHR?1:0), ip: cur.ip + 1 };
          learned.pitcherZone[pitcher] = learned.pitcherZone[pitcher] || {};
          const cz = learned.pitcherZone[pitcher][zone] || { hrAllowed:0, ip:0 };
          learned.pitcherZone[pitcher][zone] = { hrAllowed: cz.hrAllowed + (isHR?1:0), ip: cz.ip + 1 };
        }
        samples++;
      }
    }

    const store = getStore('mlb');
    const KEY = 'model.json';
    let model = {};
    const raw = await store.get(KEY);
    if(raw){ try{ model = JSON.parse(raw); }catch{} }
    model.weights = model.weights || { wPark:1.0, wWx:1.0, wBvP:1.0, wPitch:1.0, wZone:1.0, bias:0.0 };
    model.calib = model.calib || { a:1.0, b:0.0, n:0 };
    model.aggregates = model.aggregates || { league:{ pitch:{}, zone:{} }, batterPitch:{}, pitcherPitch:{}, batterZone:{}, pitcherZone:{} };
    model.batterBias = model.batterBias || {};

    function merge(dst, add){
      for(const k of Object.keys(add)){
        const a = add[k]; const d = dst[k] || { hr:0, ip:0 };
        dst[k] = { hr: (d.hr||0) + (a.hr||a.hrAllowed||0), ip: (d.ip||0) + (a.ip||0) };
      }
    }
    merge(model.aggregates.league.pitch, learned.leaguePitch);
    merge(model.aggregates.league.zone,  learned.leagueZone);
    for(const b of Object.keys(learned.batterPitch)){
      model.aggregates.batterPitch[b] = model.aggregates.batterPitch[b] || {};
      merge(model.aggregates.batterPitch[b], learned.batterPitch[b]);
    }
    for(const b of Object.keys(learned.batterZone)){
      model.aggregates.batterZone[b] = model.aggregates.batterZone[b] || {};
      merge(model.aggregates.batterZone[b], learned.batterZone[b]);
    }
    for(const p of Object.keys(learned.pitcherPitch)){
      model.aggregates.pitcherPitch[p] = model.aggregates.pitcherPitch[p] || {};
      for(const t of Object.keys(learned.pitcherPitch[p])){
        const d = model.aggregates.pitcherPitch[p][t] || { hrAllowed:0, ip:0 };
        const a = learned.pitcherPitch[p][t];
        model.aggregates.pitcherPitch[p][t] = { hrAllowed: d.hrAllowed + (a.hrAllowed||0), ip: d.ip + (a.ip||0) };
      }
    }
    for(const p of Object.keys(learned.pitcherZone)){
      model.aggregates.pitcherZone[p] = model.aggregates.pitcherZone[p] || {};
      for(const z of Object.keys(learned.pitcherZone[p])){
        const d = model.aggregates.pitcherZone[p][z] || { hrAllowed:0, ip:0 };
        const a = learned.pitcherZone[p][z];
        model.aggregates.pitcherZone[p][z] = { hrAllowed: d.hrAllowed + (a.hrAllowed||0), ip: d.ip + (a.ip||0) };
      }
    }

    // 2) Optional: auto-calibrate from predictions logged for that date
    const logs = getStore('mlb-logs');
    const predRaw = await logs.get(`predictions/${date}.json`);
    if(predRaw){
      const preds = JSON.parse(predRaw)?.picks || [];
      // Build HR set for outcomes
      const hrSet = new Set();
      const ids = await getGameIds(date);
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
      const rows = preds.map(p => {
        const id = (typeof p.mlbId === 'number' || typeof p.mlbId === 'string') ? Number(p.mlbId) : null;
        const prob = Number(p.prob || p.hr_prob_fgb || 0);
        const y = id && hrSet.has(Number(id)) ? 1 : 0;
        return { prob, y };
      }).filter(r => r.prob>=0 && r.prob<=1);

      if(rows.length >= 6){ // need enough points
        const n = rows.length;
        let sumP=0, sumY=0, sumPP=0, sumPY=0;
        for(const r of rows){ sumP+=r.prob; sumY+=r.y; sumPP+=r.prob*r.prob; sumPY+=r.prob*r.y; }
        const meanP = sumP/n, meanY = sumY/n;
        const varP = Math.max(1e-6, (sumPP/n) - meanP*meanP);
        const covPY = (sumPY/n) - meanP*meanY;
        let aDay = clamp(covPY / varP, 0.5, 1.5);
        let bDay = clamp(meanY - aDay*meanP, -0.1, 0.1);

        const alpha = 0.2; // EWMA blend
        model.calib.a = (1-alpha)*model.calib.a + alpha*aDay;
        model.calib.b = (1-alpha)*model.calib.b + alpha*bDay;
        model.calib.n = (model.calib.n||0) + 1;
      }
    }

    await store.set(KEY, JSON.stringify(model));

    return new Response(JSON.stringify({ ok:true, date, games: gamePks.length, samples, calib: model.calib }), {
      headers: { 'content-type': 'application/json' }
    });
  }catch(e){
    return new Response(JSON.stringify({ error:'learn-failed', message: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
