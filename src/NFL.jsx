import React, { useEffect, useState } from 'react';

export default function NFL(){
  const [picks, setPicks] = useState([]);
  const [meta, setMeta] = useState({ start:'', end:'', games:0, note:'' });
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ generate(); }, []);

  async function generate(){
    setLoading(true); setPicks([]); setMeta(m=>({...m, note:''}));
    try{
      const { startISO, endISO } = upcomingThuMon();
      const games = await nflGames(startISO, endISO);
      // Only proceed if REG season games exist
      const regGames = games.filter(g => {
        const st = g?.competitions?.[0]?.status?.type?.abbreviation || '';
        return String(st).toUpperCase() === 'STATUS_SCHEDULED' || String(st).toUpperCase()==='STATUS_IN_PROGRESS';
      });
      if(regGames.length === 0){
        setMeta({ start:startISO, end:endISO, games:0, note:'NFL picks will appear when the regular season window has scheduled games.' });
        setPicks([]);
        return;
      }
      // TODO real model; placeholder ensures UI works when season starts
      setMeta({ start:startISO, end:endISO, games:regGames.length, note:'' });
      setPicks([]);
    }catch(e){
      console.error(e);
      setMeta(m=>({...m, note:'Error building NFL picks.'}));
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">NFL Anytime TD — Regular Season Only</h1>
        <p className="text-gray-600 mb-4 text-center text-sm">
          Window: {meta.start||'—'} → {meta.end||'—'} • Games: {meta.games}
        </p>
        {meta.note && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">{meta.note}</div>}
        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Crunching…' : 'Generate Picks'}
          </button>
        </div>

        {picks.length>0 && (
          <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Team</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Pos</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {picks.map((p,i)=> (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.team}</td>
                    <td className="px-4 py-2">{p.pos}</td>
                    <td className="px-4 py-2 text-gray-600">{p.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// helpers
function upcomingThuMon(){
  const now = new Date();
  const d = now.getUTCDay();
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
