// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { selectHRPicks } from "./models/hr_select.js";

// --- helpers: build odds index from props API ---
async function fetchHROddsIndex(){
  try{
    const r = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us');
    if(!r.ok) return new Map();
    const data = await r.json();
    const map = new Map();
    if(Array.isArray(data?.events)){
      for (const ev of data.events){
        const gameCode = ev?.id || ev?.commence_time || ev?.home_team && ev?.away_team ? `${ev.away_team}@${ev.home_team}` : "";
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            for (const out of (mk.outcomes||[])){
              const player = (out.name||"").trim();
              const price = Number(out.price_american ?? out.price?.american ?? out.price ?? NaN);
              if (!player || !Number.isFinite(price)) continue;
              const key = `${gameCode}|${player}`.toLowerCase();
              if (!map.has(key) || Math.abs(price) < Math.abs(map.get(key))) map.set(key, price);
            }
          }
        }
      }
    }
    return map;
  }catch{ return new Map(); }
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;
  const push = (obj) => {
    if (!obj) return;
    const name = obj.name || obj.player || obj.batter || "";
    const team = obj.team || obj.teamAbbr || obj.team_abbr || obj.teamName || "";
    const away = obj.away || obj.awayTeam || obj.away_team || "";
    const home = obj.home || obj.homeTeam || obj.home_team || "";
    const gameId = obj.gameId || obj.gamePk || obj.eventId || obj.event_id || obj.game || (away && home ? `${away}@${home}` : "");
    out.push({
      name, team,
      away, home,
      gameId,
      oddsAmerican: obj.oddsAmerican ?? obj.odds_sim ?? null,
      baseHRPA: obj.baseHRPA ?? obj.hr_base ?? obj.hr_prob_sim ?? null,
      iso: obj.iso ?? obj.ISO ?? obj.seasonISO ?? obj.season_iso ?? null,
      barrelRate: obj.barrelRate ?? obj.barrel_rate ?? obj.brls_pa ?? obj.barrels_per_pa ?? null,
      recentHRperPA: obj.recentHRperPA ?? obj.hr_per_pa_l15 ?? obj.l15_hr_pa ?? null,
      starterHR9: obj.starterHR9 ?? obj.pitcherHR9 ?? null,
      venue: obj.venue || obj.park || obj.venueName || obj.venue_name || null,
      platoonFlag: obj.platoonFlag ?? obj.platoon ?? null,
      bvpPA: obj.bvpPA ?? obj.bvp_pa ?? 0,
      bvpHR: obj.bvpHR ?? obj.bvp_hr ?? 0,
      expPA: obj.expPA ?? obj.pa ?? 4
    });
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else if (raw && typeof raw === 'object'){
    if (Array.isArray(raw.candidates)) raw.candidates.forEach(push);
    if (Array.isArray(raw.players)) raw.players.forEach(push);
    if (Array.isArray(raw)) raw.forEach(push);
  }
  return out;
}


function americanToProb(odds){
  if (odds == null || isNaN(odds)) return null;
  const o = Number(odds);
  return o > 0 ? (100 / (o + 100)) : (Math.abs(o) / (Math.abs(o) + 100));
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;

  const push = (obj) => {
    if (!obj) return;
    const name = obj.name || obj.player || obj.description || obj.outcome || obj.playerName;
    const home = obj.home || obj.home_team || obj.homeTeam;
    const away = obj.away || obj.away_team || obj.awayTeam;
    const eventId = obj.eventId || obj.event_id || obj.id || obj.gameId;
    const game = obj.game || obj.gameId || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
    const team = obj.team || obj.playerTeam || obj.team_abbr;
    const odds = obj.odds ?? obj.price ?? obj.american ?? null;
    const impliedProb = obj.impliedProb ?? americanToProb(odds);
    out.push({
      id: obj.id || obj.playerId || name,
      name,
      team,
      opponent: (team && home && team===home) ? away : home,
      home, away,
      game, eventId,
      odds, impliedProb,
      baseHRPA: obj.baseHRPA,
      expPA: obj.expPA,
      parkFactor: obj.parkFactor,
      weatherFactor: obj.weatherFactor,
      starterHR9: obj.starterHR9,
      bvpHR: obj.bvpHR, bvpPA: obj.bvpPA,
      iso: obj.iso, barrelRate: obj.barrelRate,
      recentHR14: obj.recentHR14, recentPA14: obj.recentPA14,
      pitchCompat: obj.pitchCompat, zoneCompat: obj.zoneCompat,
    });
  };

  if (Array.isArray(raw)){ raw.forEach(push); return out; }

  if (Array.isArray(raw.events)){
    for (const ev of raw.events){
      const home = ev.home_team || ev.homeTeam || ev.home;
      const away = ev.away_team || ev.awayTeam || ev.away;
      const eventId = ev.id || ev.event_id || ev.key || ev.commence_time;
      const game = `${String(away||"AWY").trim()}@${String(home||"HOM").trim()}`;
      if (!Array.isArray(ev.bookmakers)) continue;
      for (const bk of ev.bookmakers){
        if (!Array.isArray(bk.markets)) continue;
        for (const mk of bk.markets){
          if (!Array.isArray(mk.outcomes)) continue;
          for (const oc of mk.outcomes){
            const name = oc.description || oc.participant || oc.name;
            const odds = oc.price ?? oc.american ?? oc.odds;
            push({ name, home, away, eventId, game, odds });
          }
        }
      }
    }
    return out;
  }

  if (Array.isArray(raw.data)){ raw.data.forEach(push); return out; }

  Object.values(raw).forEach(v => { if (Array.isArray(v)) v.forEach(push); });
  return out;
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({ source:"", count:0, games:0 });

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

  function countGames(list){
    const set = new Set();
    for (const x of list){
      const home = x.home || x.home_team || x.homeTeam;
      const away = x.away || x.away_team || x.awayTeam || x.opponent;
      const game = x.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
      const key = (x.eventId || x.event_id || x.gameId) ? `${game}#${x.eventId || x.event_id || x.gameId}` : game;
      set.add(key);
    }
    return set.size;
  }

  async function loadAndScore(){
    setLoading(true);
    setMessage("");
    setPicks([]);
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
    if (!raw && Array.isArray(window.__MLB_POOL__)) { raw = window.__MLB_POOL__; src = "window.__MLB_POOL__"; }

    if (!raw){
      setMessage("No candidate endpoint returned players.");
      setLoading(false);
      return;
    }

    const cands = normalizeCandidates(raw);
    setDiag({ source: src, count: cands.length, games: countGames(cands) });

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

      <p className="text-sm text-gray-600 mb-2">
        Source: <span className="font-mono">{diag.source || "—"}</span> • Candidates: {diag.count} • Games seen: {diag.games}
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
                    {p.odds != null ? (p.odds>0?`+${p.odds}`:`${p.odds}`) : "—"}
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

async function generatePicks(){
  setLoading(true); setMessage(''); setPicks([]);
  try{
    // 1) fetch candidates from your odds-backed function
    const baseRes = await fetch('/.netlify/functions/odds-mlb-hr');
    if(!baseRes.ok) throw new Error(`odds-mlb-hr HTTP ${baseRes.status}`);
    const baseJson = await baseRes.json();
    let candidates = normalizeCandidates(baseJson);
    if (!candidates.length) throw new Error('No candidates returned');

    // 2) fetch market odds index and join
    const hrIdx = await fetchHROddsIndex();
    candidates = candidates.map(c => {
      const key = `${c.gameId||''}|${c.name||''}`.toLowerCase();
      const price = hrIdx.get(key);
      return { ...c, oddsAmerican: Number.isFinite(price) ? price : (c.oddsAmerican ?? null) };
    });

    // 3) score and select
    const scored = candidates.map(scoreHRPick);
    const { picks, message } = selectHRPicks(scored);
    setMessage(message || `Source: /.netlify/functions/odds-mlb-hr • Candidates: ${candidates.length}`);

    // 4) shape for UI
    const picksUI = picks.map(p => ({
      name: p.name, team: p.team, game: (p.away && p.home)? `${p.away}@${p.home}` : (p.gameId||''),
      modelProb: p.p_blended, modelAmerican: p.modelAmerican,
      oddsAmerican: p.oddsAmerican ?? null,
      why2: p.why2, reasons: p.reasons
    }));
    setPicks(picksUI);
  }catch(e){
    console.error(e);
    setMessage(String(e?.message||e));
  }finally{
    setLoading(false);
  }
}
