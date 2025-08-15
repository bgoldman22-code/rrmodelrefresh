import React, { useEffect, useState } from "react";
import RRSuggestion from "./components/RRSuggestion.jsx";
import LearningStatus from "./components/LearningStatus.jsx";
import { americanFromProb, probToAmerican } from "./utils/odds_estimator.js";
import * as FGB from "./fgb_pack/index.js";

// ---------- Tunables ----------
const MIN_PROB = 0.03;      // lower bound so we never show 0.0%
const MAX_PROB = 0.45;      // upper cap; very few hitters exceed this true rate
const PRICE_FACTOR = 0.94;  // slight hold when estimating odds
const TARGET_MAIN = 12;     // target count for main table
const MIN_MAIN = 6;         // min to show on small slates
const MAX_PER_GAME = 2;     // distribution rule
const LONGSHOT_MIN = 500;   // +500 to +1100 are "bonus" longshots
const LONGSHOT_MAX = 1100;

// Modest park HR multipliers (approx league=1.00). Defaults to 1.00 if unknown.
const PARK_HR_INDEX = {
  ARI: 0.98, ATL: 0.99, BAL: 0.94, BOS: 1.06, CHC: 1.04, CIN: 1.14, CLE: 0.95, COL: 1.29,
  CWS: 1.08, DET: 0.95, HOU: 1.01, KC: 1.01, LAA: 1.03, LAD: 1.03, MIA: 0.92, MIL: 1.07,
  MIN: 1.02, NYM: 0.96, NYY: 1.11, OAK: 0.84, PHI: 1.08, PIT: 0.92, SD: 0.91, SEA: 0.89,
  SF: 0.88, STL: 0.96, TB: 0.96, TEX: 1.06, TOR: 1.03, WSH: 0.98
};

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [longshots, setLongshots] = useState([]);
  const [meta, setMeta] = useState({ date:"", games:0, pool:0, selected:0, longN:0, note:"", odds:"" });
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ generate(); }, []);

  async function generate(){
    setLoading(true); setPicks([]); setLongshots([]); setMeta(m=>({ ...m, note:"", odds:"" }));
    try{
      const today = new Date().toISOString().slice(0,10);

      // 1) Schedule + probable pitchers
      const sched = await jget(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}`);
      const games = sched?.dates?.[0]?.games || [];
      if(!games.length){ setMeta({ date: today, games:0, pool:0, selected:0, longN:0, note:"No MLB games today." }); return; }

      const teamIds = new Set();
      const gameMeta = new Map(); // gamePk -> {homeId, awayId, homePP, awayPP}
      for(const g of games){
        const home = g?.teams?.home?.team, away = g?.teams?.away?.team;
        const homePP = g?.teams?.home?.probablePitcher?.id || null;
        const awayPP = g?.teams?.away?.probablePitcher?.id || null;
        if(home?.id && away?.id){
          gameMeta.set(String(g.gamePk), { homeId: home.id, awayId: away.id, homePP, awayPP });
          teamIds.add(home.id); teamIds.add(away.id);
        }
      }
      const teamList = Array.from(teamIds);

      // 2) Team abbreviations (fix AWY@HOM) + venues (for park fallback; we map by abbr)
      const teamsRes = await jget(`https://statsapi.mlb.com/api/v1/teams?teamIds=${teamList.join(",")}`);
      const T = new Map();
      for(const t of (teamsRes?.teams||[])){
        const ab = t?.abbreviation || abbrFromName(t?.teamName||t?.name);
        T.set(t.id, { abbr: ab });
      }

      // 3) Active rosters (hitters only)
      const roster = new Map(); // teamId -> [{id,name}]
      for(const tid of teamList){
        try{
          const r = await jget(`https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`);
          const hitters = (r?.roster||[]).filter(x => (x?.position?.abbreviation||'').toUpperCase() !== 'P')
            .map(x => ({ id: x?.person?.id, name: x?.person?.fullName }));
          roster.set(tid, hitters);
        }catch{ roster.set(tid, []); }
      }

      // 4) Season batting stats (HR, PA) for all hitters
      const ids = Array.from(new Set([].concat(...Array.from(roster.values()).map(v=>v.map(p=>p.id))).filter(Boolean)));
      const season = new Date().getUTCFullYear();
      const batStats = await bulkPeopleStats(ids, season, 'hitting'); // Map id -> { hr, pa }

      // 5) Probable pitcher stats (HR/9)
      const ppids = Array.from(new Set([].concat(...Array.from(gameMeta.values()).map(gm => [gm.homePP, gm.awayPP].filter(Boolean)))));
      const pitStats = await bulkPeopleStats(ppids, season, 'pitching'); // Map id -> { hr9 }

      // 6) Build candidates
      const pool = [];
      for(const [gamePk, gm] of gameMeta){
        const a = T.get(gm.awayId)?.abbr || 'AWY';
        const h = T.get(gm.homeId)?.abbr || 'HOM';
        const gameCode = `${a}@${h}`;
        const parkMult = (PARK_HR_INDEX[h] || PARK_HR_INDEX[a] || 1.00); // use home park if known

        for(const side of ['home','away']){
          const tid = side==='home' ? gm.homeId : gm.awayId;
          const oppPP = side==='home' ? gm.awayPP : gm.homePP;

          const hitters = (roster.get(tid)||[]);
          for(const p of hitters){
            const s = batStats.get(p.id) || {};
            const hr = Number(s.hr||0);
            const pa = Number(s.pa||0);
            const hrRate = (hr + 3) / (pa + 300); // power prior for stability

            // Per-game HR probability across ~4.2 PA
            let base = 1 - Math.pow(1 - clamp(hrRate, 0.005, 0.15), 4.2);

            // Pitcher multiplier from HR/9 (league ~1.1)
            let pitchMult = 1.00;
            if(oppPP && pitStats.has(oppPP)){
              const hr9 = Number(pitStats.get(oppPP).hr9 || 1.1);
              pitchMult = clamp(1 + (hr9 - 1.1) * 0.18, 0.85, 1.20);
            }

            // Weather deemphasized (near neutral)
            const wxMult = 1.00;

            // Combine
            let prob = base * parkMult * pitchMult * wxMult;
            prob = clamp(prob, MIN_PROB, MAX_PROB); // never 0
            const { american } = probToAmerican(prob, PRICE_FACTOR);

            pool.push({
              id: p.id,
              name: p.name,
              team: T.get(tid)?.abbr || '',
              gameId: gamePk,
              gameCode,
              prob,
              estAmerican: american,
              why: `base ${(base*100).toFixed(1)}% • park×${parkMult.toFixed(2)} • pitch×${pitchMult.toFixed(2)} • wx×${wxMult.toFixed(2)}`
            });
          }
        }
      }

      // 7) Optional: enhance + calibrate (FGB pack + learned multiplier)
      const enhanced = await (FGB.enhanceCandidates ? FGB.enhanceCandidates(pool) : pool);
      // GET calibration for MLB HR
      let calMult = 1.0;
      try{
        const c = await fetch('/.netlify/functions/mlb-model-settings');
        if(c.ok){
          const j = await c.json(); calMult = Number(j?.calibration?.global?.probMult||1.0);
        }
      }catch{}
      const calibrated = (FGB.applyCalibration ? FGB.applyCalibration(enhanced, { global:{ probMult: calMult }}) : enhanced)
        .map(x => ({ ...x, prob: clamp(x.prob, MIN_PROB, MAX_PROB) }));

      // 8) Sort by EV (prob vs est odds)
      calibrated.sort((a,b)=> (b.prob - a.prob));

      // 9) Select with distribution rules
      const perGame = {}; const main = [];
      for(const c of calibrated){
        if((perGame[c.gameId]||0) >= MAX_PER_GAME) continue;
        main.push(c); perGame[c.gameId]=(perGame[c.gameId]||0)+1;
        if(main.length >= TARGET_MAIN) break;
      }
      if(main.length < MIN_MAIN){
        for(const c of calibrated){
          if(main.find(x=>x.id===c.id)) continue;
          if((perGame[c.gameId]||0) >= MAX_PER_GAME) continue;
          main.push(c); perGame[c.gameId]=(perGame[c.gameId]||0)+1;
          if(main.length>=MIN_MAIN) break;
        }
      }

      // 10) Bonus longshots (top probs with estimated odds between +500 and +1100)
      const long = calibrated
        .filter(c => c.estAmerican >= LONGSHOT_MIN && c.estAmerican <= LONGSHOT_MAX)
        .sort((a,b)=> b.prob - a.prob)
        .slice(0, 4);

      setPicks(main);
      setLongshots(long);
      setMeta({ date: today, games: games.length, pool: calibrated.length, selected: main.length, longN: long.length, note: calibrated.length< TARGET_MAIN ? 'Small or thin slate — opened pool.' : '' });

      // 11) Try to pull real odds from The Odds API (best-effort), update rows in-place
      try{
        const odds = await fetch('/.netlify/functions/odds-props?league=mlb&markets=batter_home_runs,batter_home_runs_alternate&regions=us');
        if(odds.ok){
          const data = await odds.json();
          const map = buildPropsIndex(data);
          const updateLine = (row)=>{
            const key = `${row.gameCode}|${row.name}`.toLowerCase();
            const american = map.get(key);
            if(typeof american === 'number'){
              row.apiAmerican = american;
            }
          };
          main.forEach(updateLine); long.forEach(updateLine);
          setPicks([...main]); setLongshots([...long]);
          setMeta(m=>({ ...m, odds: 'odds: The Odds API (if available)' }));
        }else{
          setMeta(m=>({ ...m, odds: 'odds: estimator only' }));
        }
      }catch{
        setMeta(m=>({ ...m, odds: 'odds: estimator only' }));
      }

      // 12) Submit picks for learning
      try{
        await fetch('/.netlify/functions/mlb-submit-picks', {
          method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ date: today, picks: main })
        });
      }catch{}
    }catch(e){
      console.error(e);
      setMeta(m=>({ ...m, note: 'Error building HR picks. ' + String(e.message||e) }));
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-7xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">MLB Home Run Round Robin</h1>
        <p className="text-gray-600 text-center text-sm mb-1">
          Date: {meta.date||'—'} • Games: {meta.games} • Pool: {meta.pool} • Selected: {meta.selected} • Longshots: {meta.longN}
        </p>
        <p className="text-gray-500 text-center text-xs mb-4">{meta.odds}</p>
        {meta.note && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">{meta.note}</div>}

        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Crunching…' : "Generate Today's HR Picks"}
          </button>
        </div>

        {picks.length>0 && (
          <div className="overflow-x-auto rounded-lg shadow mb-8">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Game</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Model HR Prob</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Est. Odds</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {picks.map((p,i)=>{
                  const est = typeof p.apiAmerican === 'number' ? p.apiAmerican : p.estAmerican;
                  const show = est>0 ? `+${est}` : est;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.team}</td>
                      <td className="px-4 py-2">{p.gameCode}</td>
                      <td className="px-4 py-2">{(p.prob*100).toFixed(1)}%</td>
                      <td className="px-4 py-2">{show}</td>
                      <td className="px-4 py-2 text-gray-600">{p.why}</td>
                    </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {longshots.length>0 && (
          <div className="overflow-x-auto rounded-lg shadow mb-8">
            <h2 className="text-lg font-semibold text-gray-800 px-2 pt-2">Bonus Longshots (+500 to +1100)</h2>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Game</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Model HR Prob</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Est. Odds</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {longshots.map((p,i)=>{
                  const est = typeof p.apiAmerican === 'number' ? p.apiAmerican : p.estAmerican;
                  const show = est>0 ? `+${est}` : est;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.team}</td>
                      <td className="px-4 py-2">{p.gameCode}</td>
                      <td className="px-4 py-2">{(p.prob*100).toFixed(1)}%</td>
                      <td className="px-4 py-2">{show}</td>
                      <td className="px-4 py-2 text-gray-600">{p.why}</td>
                    </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {picks.length>1 && <RRSuggestion picks={picks} />}
        <LearningStatus sport="mlb" />
      </div>
    </div>
  );
}

// ---- helpers ----
async function jget(u){ const r = await fetch(u); if(!r.ok) throw new Error('fetch '+u); return r.json(); }
function abbrFromName(name){ if(!name) return 'TEAM'; const p = String(name).split(' '); if(p.length>1) return (p[0][0]+p[1][0]).toUpperCase(); return p[0].slice(0,3).toUpperCase(); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

async function bulkPeopleStats(ids, season, group){
  const out = new Map(); if(!ids.length) return out;
  const chunk = 35;
  for(let i=0;i<ids.length;i+=chunk){
    const part = ids.slice(i, i+chunk);
    const u = `https://statsapi.mlb.com/api/v1/people?personIds=${part.join(',')}&hydrate=stats(group=[${group}],type=[season],season=${season})`;
    try{
      const j = await jget(u);
      for(const p of (j?.people||[])){
        const s = p?.stats?.[0]?.splits?.[0]?.stat || {};
        if(group==='hitting'){
          const pa = Number(s.plateAppearances||0);
          const hr = Number(s.homeRuns||0);
          out.set(p?.id, { pa, hr });
        }else{
          const hr9 = Number(s.homeRunsPer9||s.hitsPer9||1.1);
          out.set(p?.id, { hr9 });
        }
      }
    }catch{}
  }
  return out;
}

// Build index of player HR odds from The Odds API payload
function buildPropsIndex(data){
  const map = new Map();
  try{
    const events = Array.isArray(data) ? data : (data?.data||[]);
    for(const ev of events){
      const away = abbrize(ev.away_team), home = abbrize(ev.home_team);
      const gameCode = `${away}@${home}`.toLowerCase();
      for(const bk of (ev.bookmakers||[])){
        for(const mk of (bk.markets||[])){
          const key = String(mk.key||'').toLowerCase();
          if(!key.includes('home_run')) continue; // batter_home_runs / alternate etc.
          for(const out of (mk.outcomes||[])){
            // Outcome may look like: { name: "Aaron Judge", description:"Over 0.5", price: +250 }
            const name = String(out.name||'').trim();
            const desc = String(out.description||'').toLowerCase();
            const isOver = desc.includes('over') && (desc.includes('0.5') || desc.includes('0,5'));
            if(!name) continue;
            if(!isOver && !key.includes('first') && !key.includes('yes')){
              // If it's not clearly Over 0.5 or a yes/no market, skip
              continue;
            }
            const k = `${gameCode}|${name}`.toLowerCase();
            const price = Number(out.price);
            if(Number.isFinite(price)){
              // Keep shortest price (best indicator of consensus)
              if(!map.has(k) || Math.abs(price) < Math.abs(map.get(k))) map.set(k, price);
            }
          }
        }
      }
    }
  }catch{}
  return map;
}

function abbrize(team){ // rough mapping from city/mascot to abbrev-like code
  if(!team) return 'TEAM';
  const parts = String(team).split(' ');
  if(parts.length>1) return (parts[0][0]+parts[1][0]).toUpperCase();
  return parts[0].slice(0,3).toUpperCase();
}
