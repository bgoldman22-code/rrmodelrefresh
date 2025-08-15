import React, { useEffect, useState } from 'react';
import RRSuggestion from './components/RRSuggestion.jsx';
import LearningStatus from './components/LearningStatus.jsx';
import { probToAmerican } from './utils/odds_estimator.js';
import * as FGB from './fgb_pack/index.js';

// Tunables
const PRICE_FACTOR = 0.94;
const MAX_PER_GAME = 2;
const TARGET = 12;
const MIN_TARGET = 6;

// Candidate filters for SB specialists
const MIN_ATTEMPTS_2Y = 10;    // min total attempts last 2 seasons combined
const MIN_SUCCESS = 0.68;      // min success rate last 2 seasons
const MIN_PA_CURR = 60;        // avoid deep bench
const EXCLUDE_POS = new Set(['P','C']); // no pitchers or catchers (3rd-string Cs often slow / no green light)

export default function MLB_SB(){
  const [picks, setPicks] = useState([]);
  const [meta, setMeta] = useState({ date:'', games:0, pool:0, selected:0, note:'', odds:'' });
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ generate(); }, []);

  async function generate(){
    setLoading(true); setPicks([]); setMeta(m=>({...m, note:'', odds:''}));
    try{
      const today = new Date().toISOString().slice(0,10);
      // 1) schedule
      const sched = await jget(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}`);
      const games = sched?.dates?.[0]?.games || [];
      if(!games.length){ setMeta({ date: today, games:0, pool:0, selected:0, note:'No MLB games today.', odds:'' }); return; }

      const teamIds = new Set();
      const gm = new Map(); // gamePk -> {homeId, awayId}
      for(const g of games){
        const home = g?.teams?.home?.team, away = g?.teams?.away?.team;
        if(home?.id && away?.id){
          teamIds.add(home.id); teamIds.add(away.id);
          gm.set(String(g.gamePk), { homeId: home.id, awayId: away.id });
        }
      }
      const teamList = Array.from(teamIds);
      // 2) team abbrs
      const teamsRes = await jget(`https://statsapi.mlb.com/api/v1/teams?teamIds=${teamList.join(',')}`);
      const T = new Map();
      for(const t of (teamsRes?.teams||[])){
        T.set(t.id, { abbr: t?.abbreviation || abbrFromName(t?.teamName||t?.name) });
      }
      // 3) rosters (exclude pitchers + catchers)
      const roster = new Map();
      for(const tid of teamList){
        try{
          const r = await jget(`https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`);
          const hitters = (r?.roster||[]).filter(x => !EXCLUDE_POS.has((x?.position?.abbreviation||'').toUpperCase()))
            .map(x => ({ id: x?.person?.id, name: x?.person?.fullName }));
          roster.set(tid, hitters);
        }catch{ roster.set(tid, []); }
      }
      // 4) gather ids + pull 2 seasons of hitting stats (SB, CS, PA, OBP)
      const ids = Array.from(new Set([].concat(...Array.from(roster.values()).map(v=>v.map(p=>p.id))).filter(Boolean)));
      const year = new Date().getUTCFullYear();
      const statsCurr = await bulkHitting(ids, year);
      const statsPrev = await bulkHitting(ids, year-1);

      // 5) build candidates emphasizing true SB aces
      const pool = [];
      for(const [gamePk, info] of gm){
        const awayAbbr = T.get(info.awayId)?.abbr || 'AWY';
        const homeAbbr = T.get(info.homeId)?.abbr || 'HOM';
        for(const side of ['home','away']){
          const tid = (side==='home') ? info.homeId : info.awayId;
          const hitters = roster.get(tid)||[];
          for(const p of hitters){
            const a = statsCurr.get(p.id) || {};
            const b = statsPrev.get(p.id) || {};
            const paCurr = Number(a.pa||0);
            const sbCurr = Number(a.sb||0), csCurr = Number(a.cs||0);
            const sbPrev = Number(b.sb||0), csPrev = Number(b.cs||0);
            const attempts = sbCurr + csCurr + sbPrev + csPrev;
            const success = attempts>0 ? (sbCurr+sbPrev)/attempts : 0;
            const obp = a.obp || 0.30;

            if(paCurr < MIN_PA_CURR) continue;             // bench guy, skip
            if(attempts < MIN_ATTEMPTS_2Y) continue;       // not a runner
            if(success < MIN_SUCCESS) continue;            // poor efficiency

            // rate of attempts per PA, current season
            const attRate = (sbCurr + csCurr) / Math.max(1, paCurr);
            // expected times on base in a game ~ 4.2 PA * OBP
            const onBase = 4.2 * Math.max(0.26, Math.min(0.42, obp));
            // probability to *attempt* at least one SB: 1 - (1 - attRate)^(onBase)
            const pAttempt = 1 - Math.pow(1 - Math.min(0.25, attRate), onBase);
            // probability of success on that attempt(s) ~ success rate
            let prob = pAttempt * Math.max(0.60, Math.min(0.9, success));
            prob = clamp(prob, 0.05, 0.55);

            pool.push({
              id: p.id,
              name: p.name,
              team: T.get(tid)?.abbr || '',
              gameId: gamePk,
              gameCode: `${awayAbbr}@${homeAbbr}`,
              prob,
              why: `SB profile: attempts2y ${attempts}, succ ${(success*100|0)}%, OBP ${(obp*100|0)}%`
            });
          }
        }
      }

      // 6) enhance + calibrate
      const enhanced = await (FGB.enhanceCandidates ? FGB.enhanceCandidates(pool) : pool);
      let calMult = 1.0;
      try{
        const r = await fetch('/.netlify/functions/sb-model-settings');
        if(r.ok){
          const j = await r.json(); calMult = Number(j?.calibration?.global?.probMult||1.0);
        }
      }catch{}
      const calibrated = (FGB.applyCalibration ? FGB.applyCalibration(enhanced, { global:{ probMult: calMult }}) : enhanced)
        .map(x => ({ ...x, prob: clamp(x.prob, 0.05, 0.65) }));

      // 7) select with ≤2 per game
      calibrated.sort((a,b)=> b.prob - a.prob);
      const perGame = {}; const selected = [];
      for(const c of calibrated){
        if((perGame[c.gameId]||0) >= MAX_PER_GAME) continue;
        selected.push(c); perGame[c.gameId]=(perGame[c.gameId]||0)+1;
        if(selected.length>=TARGET) break;
      }
      if(selected.length<MIN_TARGET){
        for(const c of calibrated){
          if(selected.find(x=>x.id===c.id)) continue;
          if((perGame[c.gameId]||0) >= MAX_PER_GAME) continue;
          selected.push(c); perGame[c.gameId]=(perGame[c.gameId]||0)+1;
          if(selected.length>=MIN_TARGET) break;
        }
      }

      // 8) try odds (many books do not post SB props consistently)
      let oddsNote = 'odds: estimator only';
      try{
        const rr = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_stolen_bases,stolen_bases,player_to_steal_a_base&regions=us');
        if(rr.ok){
          const data = await rr.json();
          const idx = buildSBIndex(data);
          selected.forEach(row => {
            const key = `${row.gameCode}|${row.name}`.toLowerCase();
            const american = idx.get(key);
            if(typeof american === 'number') row.apiAmerican = american;
          });
          oddsNote = 'odds: The Odds API (if available)';
        }
      }catch{}

      setPicks(selected);
      setMeta({ date: today, games: games.length, pool: calibrated.length, selected: selected.length, odds: oddsNote, note: calibrated.length<TARGET ? 'Expanded pool to reach ≥6.' : '' });

      // 9) submit for learning
      try{
        await fetch('/.netlify/functions/sb-submit-picks', {
          method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ date: today, picks: selected })
        });
      }catch{ /* ignore */ }
    }catch(e){
      console.error(e);
      setMeta(m=>({ ...m, note:'Error building SB picks.' }));
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">MLB Stolen Bases</h1>
        <p className="text-gray-600 text-center text-sm mb-1">
          Date: {meta.date||'—'} • Games: {meta.games} • Pool: {meta.pool} • Selected: {meta.selected}
        </p>
        <p className="text-gray-500 text-center text-xs mb-4">{meta.odds}</p>

        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Crunching…' : 'Generate SB Picks'}
          </button>
        </div>

        {meta.note && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">{meta.note}</div>}

        {picks.length>0 && (
          <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Game</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Model SB Prob</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Est. Odds</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {picks.map((p,i)=> {
                  const { american } = probToAmerican(p.prob, PRICE_FACTOR);
                  const line = typeof p.apiAmerican === 'number' ? p.apiAmerican : american;
                  return (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.team}</td>
                    <td className="px-4 py-2">{p.gameCode}</td>
                    <td className="px-4 py-2">{(p.prob*100).toFixed(1)}%</td>
                    <td className="px-4 py-2">{line>0?`+${line}`:line}</td>
                    <td className="px-4 py-2 text-gray-600">{p.why}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {picks.length>1 && <RRSuggestion picks={picks} />}
        <LearningStatus sport="sb" />
      </div>
    </div>
  );
}

// Helpers
async function jget(u){ const r = await fetch(u); if(!r.ok) throw new Error('fetch '+u); return r.json(); }
function abbrFromName(name){ if(!name) return 'TEAM'; const p = String(name).split(' '); if(p.length>1) return (p[0][0]+p[1][0]).toUpperCase(); return p[0].slice(0,3).toUpperCase(); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

async function bulkHitting(ids, season){
  const out = new Map(); if(!ids.length) return out; const chunk=35;
  for(let i=0;i<ids.length;i+=chunk){
    const part = ids.slice(i, i+chunk);
    const u = `https://statsapi.mlb.com/api/v1/people?personIds=${part.join(',')}&hydrate=stats(group=[hitting],type=[season],season=${season})`;
    try{
      const j = await jget(u);
      for(const p of (j?.people||[])){
        const s = p?.stats?.[0]?.splits?.[0]?.stat || {};
        out.set(p?.id, {
          pa: Number(s.plateAppearances||0),
          sb: Number(s.stolenBases||0),
          cs: Number(s.caughtStealing||0),
          obp: Number(s.obp||0) || Number(s.onBasePercentage||0) || 0
        });
      }
    }catch{}
  }
  return out;
}

function buildSBIndex(data){
  const map = new Map();
  try{
    const events = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    for(const ev of events){
      const away = abbrize(ev.away_team), home = abbrize(ev.home_team);
      const gameCode = `${away}@${home}`.toLowerCase();
      for(const bk of (ev.bookmakers||[])){
        for(const mk of (bk.markets||[])){
          const k = String(mk.key||'').toLowerCase();
          if(!(k.includes('steal'))) continue;
          for(const out of (mk.outcomes||[])){
            const name = String(out.name||'').trim();
            const price = Number(out.price);
            if(!name || !Number.isFinite(price)) continue;
            const key = `${gameCode}|${name}`.toLowerCase();
            if(!map.has(key) || Math.abs(price) < Math.abs(map.get(key))) map.set(key, price);
          }
        }
      }
    }
  }catch{}
  return map;
}
function abbrize(team){ if(!team) return 'TEAM'; const parts = String(team).split(' '); if(parts.length>1) return (parts[0][0]+parts[1][0]).toUpperCase(); return parts[0].slice(0,3).toUpperCase(); }
