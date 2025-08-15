
// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { selectHRPicks } from "./models/hr_select.js";

function americanToProb(odds){
  if (odds == null || isNaN(odds)) return null;
  const o = Number(odds);
  return o > 0 ? (100 / (o + 100)) : (Math.abs(o) / (Math.abs(o) + 100));
}

function normalizeCandidates(raw){
  // Accept a variety of shapes from your functions. Try to be flexible.
  const out = [];
  if (!raw) return out;

  const push = (obj) => {
    if (!obj) return;
    const name = obj.name || obj.player || obj.description || obj.outcome || obj.playerName;
    const home = obj.home || obj.home_team || obj.homeTeam;
    const away = obj.away || obj.away_team || obj.awayTeam;
    const team = obj.team || obj.playerTeam || (obj.team_abbr);
    const game = obj.game || obj.gameId || (home && away ? `${away}@${home}` : "Away@Home");
    const odds = obj.odds ?? obj.price ?? obj.american ?? null;
    const impliedProb = obj.impliedProb ?? americanToProb(odds);
    out.push({
      id: obj.id || obj.playerId || name,
      name,
      team,
      opponent: (team && home && team===home) ? away : home,
      game,
      odds,
      impliedProb,
      // pass through any model hints present
      baseHRPA: obj.baseHRPA,
      expPA: obj.expPA,
      parkFactor: obj.parkFactor,
      weatherFactor: obj.weatherFactor,
      starterHR9: obj.starterHR9,
      bvpHR: obj.bvpHR,
      bvpPA: obj.bvpPA,
      iso: obj.iso,
      barrelRate: obj.barrelRate,
      recentHR14: obj.recentHR14,
      recentPA14: obj.recentPA14,
      pitchCompat: obj.pitchCompat,
      zoneCompat: obj.zoneCompat,
    });
  };

  // 1) If it's already a flat array
  if (Array.isArray(raw)){
    raw.forEach(push);
    return out;
  }

  // 2) If looks like Odds API (events with bookmakers/markets/outcomes)
  if (Array.isArray(raw.events)){
    for (const ev of raw.events){
      const home = ev.home_team || ev.homeTeam || ev.home;
      const away = ev.away_team || ev.awayTeam || ev.away;
      const game = `${away || "AWY"}@${home || "HOM"}`;
      if (!Array.isArray(ev.bookmakers)) continue;
      for (const bk of ev.bookmakers){
        if (!Array.isArray(bk.markets)) continue;
        for (const mk of bk.markets){
          // player_home_runs, batter_home_runs, player_to_hit_a_home_run, etc.
          if (!Array.isArray(mk.outcomes)) continue;
          for (const oc of mk.outcomes){
            const name = oc.description || oc.participant || oc.name;
            const odds = oc.price ?? oc.american ?? oc.odds;
            push({ name, home, away, odds, game });
          }
        }
      }
    }
    return out;
  }

  // 3) if object with `data` array
  if (Array.isArray(raw.data)){
    raw.data.forEach(push);
    return out;
  }

  // 4) unknown shape: try best-effort map of values
  Object.values(raw).forEach(v => {
    if (Array.isArray(v)) v.forEach(push);
  });

  return out;
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({ source:"", count:0 });

  async function tryFetch(url){
    try{
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      return j;
    }catch(e){
      return null;
    }
  }

  async function loadAndScore(){
    setLoading(true);
    setMessage("");
    setPicks([]);
    // Try several endpoints, first successful wins
    const sources = [
      "/.netlify/functions/mlb-candidates",
      "/.netlify/functions/odds-mlb-hr",
      "/.netlify/functions/odds-mlb-hr-sgo"
    ];

    let raw = null, src = "";
    for (const s of sources){
      const j = await tryFetch(s);
      if (j && (Array.isArray(j) || j.events || j.data)) { raw = j; src = s; break; }
    }
    // Fallback: global
    if (!raw && Array.isArray(window.__MLB_POOL__)) { raw = window.__MLB_POOL__; src = "window.__MLB_POOL__"; }

    if (!raw){
      setMessage("No candidate endpoint returned players.");
      setLoading(false);
      return;
    }

    const cands = normalizeCandidates(raw);
    setDiag({ source: src, count: cands.length });

    const { picks: nextPicks, message: statusMsg } = selectHRPicks(cands);
    setPicks(nextPicks);
    if (statusMsg) setMessage(statusMsg);
    setLoading(false);
  }

  useEffect(() => { loadAndScore(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">MLB Home Run Round Robin</h1>
        <button
          onClick={loadAndScore}
          className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700"
          disabled={loading}
        >
          {loading ? "Loading…" : "Regenerate"}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Source: <span className="font-mono">{diag.source || "—"}</span> • Candidates: {diag.count}
      </p>

      {message && (
        <div className="mb-4 text-amber-800 bg-amber-100 border border-amber-200 rounded px-3 py-2">
          {message}
        </div>
      )}

      {picks.length > 0 ? (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Game</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model HR Prob</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model Odds</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Why</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {picks.map((p, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">{p.name || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.team || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.game || `${p.away||"AWY"}@${p.home||"HOM"}`}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{(100*(p.p_model ?? p.p_blended ?? 0)).toFixed(1)}%</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {p.odds != null ? (p.odds>0?`+${p.odds}`:`${p.odds}`) : (p.p_blended!=null?`+${(-100*Math.min(0.99,(p.p_blended/(1-p.p_blended))))|0}`:"—")}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {p.why2 || (p.reasons ? p.reasons.join(" • ") : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500">No picks yet.</div>
      )}
    </div>
  );
}
