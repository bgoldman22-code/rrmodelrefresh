import React, { useEffect, useState } from 'react';
import RRSuggestion from './components/RRSuggestion';
import { probToAmerican } from './utils/odds_estimator';

export default function NFL_NegCorr(){
  const [picksRun, setPicksRun] = useState([]);
  const [picksPass, setPicksPass] = useState([]);
  const [meta, setMeta] = useState({ start:'', end:'', games:0, note:'Regular-season only — shows picks when scheduled games exist.' });
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ generate(); }, []);

  async function generate(){
    setLoading(true); setPicksRun([]); setPicksPass([]); setMeta(m=>({...m, note:''}));
    try{
      const { startISO, endISO } = upcomingThuMon();
      const games = await nflGames(startISO, endISO);
      const regGames = games.filter(g => {
        const st = g?.competitions?.[0]?.status?.type?.name || '';
        return /STATUS_SCHEDULED|STATUS_IN_PROGRESS/i.test(st);
      });
      if(regGames.length === 0){
        setMeta({ start:startISO, end:endISO, games:0, note:'NFL NegCorr will activate when the regular-season window has games.' });
        return;
      }
      const run = [];
      const pass = [];
      for(const g of regGames.slice(0,6)){
        const comp = g.competitions?.[0];
        const home = comp?.competitors?.find(c=>c.homeAway==='home');
        const away = comp?.competitors?.find(c=>c.homeAway==='away');
        const teams = [home, away].filter(Boolean);
        for(const t of teams){
          const abbr = t?.team?.abbreviation || 'TEAM';
          run.push({ name: abbr+' RB Rush 60+', team: abbr, pos: 'RB', prob: 0.28, why: 'run-script prior' });
          pass.push({ name: abbr+' WR Longest Rec 20+', team: abbr, pos: 'WR', prob: 0.30, why: 'pass-script prior' });
          pass.push({ name: abbr+' RB Receptions 3+', team: abbr, pos: 'RB', prob: 0.26, why: 'pass-script RB usage' });
        }
      }
      setPicksRun(run.slice(0,12));
      setPicksPass(pass.slice(0,12));
      setMeta({ start:startISO, end:endISO, games: regGames.length, note:'' });
    }catch(e){
      console.error(e);
      setMeta(m=>({...m, note:'Error building NFL NegCorr picks.'}));
    }finally{ setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">NFL Negative-Correlation RRs</h1>
        <p className="text-gray-600 mb-4 text-center text-sm">
          Window: {meta.start||'—'} → {meta.end||'—'} • Games: {meta.games}
        </p>
        {meta.note && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">{meta.note}</div>}
        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Crunching…' : 'Generate Picks'}
          </button>
        </div>

        {picksRun.length>0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Run-Script RR (lead game flow)</h3>
            <PicksTable picks={picksRun} />
            <RRSuggestion picks={picksRun} />
          </div>
        )}

        {picksPass.length>0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Pass-Script RR (trail game flow)</h3>
            <PicksTable picks={picksPass} />
            <RRSuggestion picks={picksPass} />
          </div>
        )}
      </div>
    </div>
  );
}

function PicksTable({ picks }){
  return (
    <div className="overflow-x-auto rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Pick</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Prob</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Est. Odds</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
        </tr></thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {picks.map((p,i)=> {
            const est = probToAmerican(p.prob, 0.90);
            return (
            <tr key={i}>
              <td className="px-4 py-2 font-medium">{p.name}</td>
              <td className="px-4 py-2">{p.team}</td>
              <td className="px-4 py-2">{(p.prob*100).toFixed(1)}%</td>
              <td className="px-4 py-2">{est.american>0?`+${est.american}`:est.american}</td>
              <td className="px-4 py-2 text-gray-600">{p.why}</td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  );
}

function upcomingThuMon(){
  const now = new Date(); const d = now.getUTCDay();
  let offset = (4 - d); if(offset<0) offset += 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+offset));
  const end = new Date(start.getTime() + 4*24*60*60*1000);
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10) };
}
async function nflGames(startISO, endISO){
  const dates = listDates(startISO, endISO);
  const all = [];
  for(const d of dates){
    const ymd = d.replaceAll('-','');
    try{
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ymd}`);
      const j = await r.json();
      all.push(...(j?.events || []));
    }catch{}
  }
  return all;
}
function listDates(sISO, eISO){
  const out=[];
  const s = new Date(sISO+'T00:00:00Z'), e = new Date(eISO+'T00:00:00Z');
  for(let t=s.getTime(); t<=e.getTime(); t+=24*60*60*1000){
    out.push(new Date(t).toISOString().slice(0,10));
  }
  return out;
}
