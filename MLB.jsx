// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { selectHRPicks } from "./models/hr_select.js";
import { getTodaySchedule, getTeamRoster, getPitcherSeasonHR9, venueHRFactor, todayISO_ET } from "./utils/mlb_today.js";

function americanToProb(odds){
  if (odds == null || isNaN(odds)) return null;
  const o = Number(odds);
  return o > 0 ? (100 / (o + 100)) : (Math.abs(o) / (Math.abs(o) + 100));
}

async function fetchJSON(url){
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;

  const push = (obj, ctx={}) => {
    if (!obj) return;
    const name = obj.name || obj.player || obj.description || obj.outcome || obj.playerName;
    const home = obj.home ?? ctx.home;
    const away = obj.away ?? ctx.away;
    const eventId = obj.eventId || obj.event_id || obj.id || obj.gameId || ctx.eventId;
    const game = obj.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
    const team = obj.team || obj.playerTeam || obj.team_abbr || null;
    const odds = obj.odds ?? obj.price ?? obj.american ?? null;
    const impliedProb = obj.impliedProb ?? americanToProb(odds);
    out.push({
      id: obj.id || obj.playerId || name,
      name, team,
      opponent: (team && home && team===home) ? away : home,
      home, away,
      game, eventId,
      odds, impliedProb,
      venueName: ctx.venueName || obj.venueName,
      // pass-through stat placeholders if upstream gives them:
      baseHRPA: obj.baseHRPA, expPA: obj.expPA,
      parkFactor: obj.parkFactor, weatherFactor: obj.weatherFactor,
      starterHR9: obj.starterHR9,
      bvpHR: obj.bvpHR, bvpPA: obj.bvpPA,
      iso: obj.iso, barrelRate: obj.barrelRate,
      recentHR14: obj.recentHR14, recentPA14: obj.recentPA14,
      pitchCompat: obj.pitchCompat, zoneCompat: obj.zoneCompat,
    });
  };

  if (Array.isArray(raw?.events)){
    for (const ev of raw.events){
      const home = ev.home_team || ev.homeTeam || ev.home;
      const away = ev.away_team || ev.awayTeam || ev.away;
      const eventId = ev.id || ev.event_id || ev.key || ev.commence_time || ev.gamePk;
      const venueName = ev.venue?.name || ev.venueName;
      const ctx = {home, away, eventId, venueName};
      if (Array.isArray(ev.bookmakers)){
        for (const bk of ev.bookmakers){
          if (!Array.isArray(bk.markets)) continue;
          for (const mk of bk.markets){
            if (!Array.isArray(mk.outcomes)) continue;
            for (const oc of mk.outcomes){
              const name = oc.description || oc.participant || oc.name;
              const odds = oc.price ?? oc.american ?? oc.odds;
              push({ name, odds }, ctx);
            }
          }
        }
      } else {
        push({}, ctx);
      }
    }
    return out;
  }

  if (Array.isArray(raw)) { raw.forEach(o => push(o)); return out; }
  if (Array.isArray(raw.data)) { raw.data.forEach(o => push(o)); return out; }
  Object.values(raw).forEach(v => { if (Array.isArray(v)) v.forEach(o => push(o)); });
  return out;
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({ source:"", count:0, games:0 });

  async function tryFetch(url){
    try{
      const j = await fetchJSON(url);
      return j;
    }catch{ return null; }
  }

  function countGames(list){
    const set = new Set();
    for (const x of list){
      const game = x.game || ((x.away||"AWY")+"@"+(x.home||"HOM"));
      const key = (x.eventId || x.gamePk || x.id) ? `${game}#${x.eventId || x.gamePk || x.id}` : game;
      set.add(key);
    }
    return set.size;
  }

  async function enrichWithSchedule(cands){
    // If missing teams/games, fill from StatsAPI schedule + rosters; also compute park & starterHR9.
    const { date, games } = await getTodaySchedule();
    const teamIds = new Set();
    games.forEach(g => { if(g.homeId) teamIds.add(g.homeId); if(g.awayId) teamIds.add(g.awayId); });

    // Build rosters map (name -> teamId)
    const nameToTeam = new Map();
    for (const tid of teamIds){
      try{
        const roster = await getTeamRoster(tid);
        roster.forEach(p => {
          if (p.fullName) nameToTeam.set(p.fullName.toLowerCase(), tid);
          if (p.lastName) nameToTeam.set(p.lastName.toLowerCase()+"__LAST", tid);
        });
      }catch{}
    }

    // Pitcher HR9 cache
    const season = new Date().getUTCFullYear();
    const pitcherHR9 = new Map();
    async function getHR9(id){
      if (!id) return 1.10;
      if (pitcherHR9.has(id)) return pitcherHR9.get(id);
      const v = await getPitcherSeasonHR9(id, season);
      pitcherHR9.set(id, v);
      return v;
    }

    // Helper: from teamId → teamName today
    const idToName = new Map();
    games.forEach(g => {
      if (g.homeId && g.homeName) idToName.set(g.homeId, g.homeName);
      if (g.awayId && g.awayName) idToName.set(g.awayId, g.awayName);
    });

    // For quick lookup by team name to game
    function findGameByTeamId(tid){
      return games.find(g => g.homeId===tid || g.awayId===tid);
    }

    // Mutate/enrich candidates
    for (const c of cands){
      // Team inference
      if (!c.team){
        const keyFull = (c.name||"").toLowerCase();
        const keyLast = (c.name||"").split(" ").slice(-1)[0].toLowerCase()+"__LAST";
        const teamId = nameToTeam.get(keyFull) || nameToTeam.get(keyLast);
        if (teamId){
          c.teamId = teamId;
          c.team = idToName.get(teamId);
          const g = findGameByTeamId(teamId);
          if (g){
            c.home = g.homeName; c.away = g.awayName; c.game = `${g.awayName}@${g.homeName}`;
            c.venueName = g.venueName;
            // Starter: if hitter is home team, starter is away probable; else home probable
            const sp = (c.team === g.homeName) ? g.probablePitchers?.away : g.probablePitchers?.home;
            if (sp?.id){
              c.starterId = sp.id;
              c.starterName = sp.fullName;
              c.starterHR9 = await getHR9(sp.id);
            }
          }
        }
      }
      // Park factor from venue if still missing
      if (!c.parkFactor && c.venueName){
        c.parkFactor = venueHRFactor(c.venueName);
      }
    }

    return cands;
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

    let cands = normalizeCandidates(raw);

    // If many entries lack teams or show AWY@HOM, enrich via StatsAPI
    const missingContext = cands.filter(c => !c.team || !c.game || c.game==="AWY@HOM").length;
    if (missingContext > (cands.length*0.2)){
      try{
        cands = await enrichWithSchedule(cands);
      }catch(e){
        console.warn("Enrich failed:", e);
      }
    }

    setDiag({ source: src, count: cands.length, games: (function(){
      const set = new Set();
      for (const x of cands){
        const game = x.game || ((x.away||"AWY")+"@"+(x.home||"HOM"));
        const key = (x.eventId || x.gamePk || x.id) ? `${game}#${x.eventId || x.gamePk || x.id}` : game;
        set.add(key);
      }
      return set.size;
    })() });

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
