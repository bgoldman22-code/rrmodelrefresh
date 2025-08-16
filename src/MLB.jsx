\
// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { scoreHRPick } from "./models/hr_scoring.js";
import { selectHRPicks } from "./models/hr_select.js";
import { normalizePlayerName } from "./lib/common/name_map.js";

function americanFromProb(p){
  const x = Math.max(1e-6, Math.min(0.999999, Number(p)||0));
  if (x >= 0.5) return -Math.round(100 * x / (1-x));
  return Math.round(100 * (1-x) / x);
}
function uniqGames(cands){
  const set = new Set();
  for (const c of cands){
    const home = c.home || c.home_team || c.homeTeam;
    const away = c.away || c.away_team || c.awayTeam || c.opponent;
    const g = c.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : null);
    if (g) set.add(g);
  }
  return set.size;
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;
  const norm = (s)=>{
    try{ return normalizePlayerName(s); }catch{return s||"";}
  };
  const push = (obj) => {
    if (!obj) return;
    const name = norm(obj.name || obj.player || obj.description || obj.outcome || obj.playerName || "");
    const home = obj.home || obj.home_team || obj.homeTeam || obj.teamHome;
    const away = obj.away || obj.away_team || obj.awayTeam || obj.teamAway || obj.opponent;
    const game = obj.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
    const odds = obj.oddsAmerican ?? obj.odds ?? obj.price ?? obj.american ?? null;
    out.push({
      id: obj.id || obj.playerId || `${name}|${game}`,
      name, team: obj.team || obj.playerTeam || obj.team_abbr || obj.teamAbbr || "—",
      home, away, game,
      eventId: obj.eventId || obj.event_id || obj.id || obj.gameId || obj.gamePk,
      oddsAmerican: Number.isFinite(Number(odds)) ? Number(odds) : null,
      expPA: obj.expPA ?? obj.pa ?? 4,
      venue: obj.venue || obj.park || obj.venueName || obj.venue_name || null,
      starterHR9: obj.starterHR9 ?? obj.pitcherHR9 ?? obj.oppStarterHR9 ?? null,
      bvpHR: obj.bvpHR ?? obj.bvp_hr ?? 0, bvpPA: obj.bvpPA ?? obj.bvp_pa ?? 0,
      iso: obj.iso ?? obj.ISO ?? obj.seasonISO ?? obj.season_iso ?? null,
      barrelRate: obj.barrelRate ?? obj.barrel_rate ?? obj.brls_pa ?? obj.barrels_per_pa ?? null,
      recentHRperPA: obj.recentHRperPA ?? obj.hr_per_pa_l15 ?? obj.l15_hr_pa ?? null,
      bats: obj.bats || obj.batterHand || obj.handedBat || null,
      oppThrows: obj.oppThrows || obj.pitcherThrows || obj.starterThrows || null,
      iso_vs_rhp: obj.iso_vs_rhp || obj.iso_v_r || obj.iso_vr || null,
      iso_vs_lhp: obj.iso_vs_lhp || obj.iso_v_l || obj.iso_vl || null,
      fbPct: obj.fbPct || obj.fb_rate || obj.flyballRate || null,
      pullPct: obj.pullPct || obj.pull_rate || obj.pullRate || null
    });
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else if (raw && typeof raw === "object"){
    if (Array.isArray(raw.candidates)) raw.candidates.forEach(push);
    if (Array.isArray(raw.players)) raw.players.forEach(push);
    if (Array.isArray(raw.events)) raw.events.forEach(push);
    if (raw.data) normalizeCandidates(raw.data).forEach(push);
    if (raw.response) normalizeCandidates(raw.response).forEach(push);
  }
  return out;
}

async function fetchPrimary(){
  try{
    const r = await fetch('/.netlify/functions/odds-mlb-hr');
    if(!r.ok) return [];
    const j = await r.json();
    return normalizeCandidates(j);
  }catch{ return []; }
}
async function fetchFallback(){
  const url = '/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us';
  try{
    const r = await fetch(url);
    if(!r.ok) return [];
    const data = await r.json();
    const out = [];
    const norm = (s)=>{
      try{ return normalizePlayerName(s); }catch{return s||"";}
    };
    for (const ev of (data?.events||[])){
      const home = ev.home_team || ev.homeTeam || "";
      const away = ev.away_team || ev.awayTeam || "";
      const game = away && home ? `${String(away).trim()}@${String(home).trim()}` : (ev.id || "");
      for (const bk of (ev.bookmakers||[])){
        for (const mk of (bk.markets||[])){
          const key = (mk.key||mk.key_name||mk.market||"").toLowerCase();
          const isHR = (key.includes("home") && key.includes("run")) || key.includes("player_home_runs") || key.includes("player_to_hit_a_home_run");
          if (!isHR) continue;
          for (const oc of (mk.outcomes||[])){
            const player = norm(oc.name || oc.description || oc.participant || "");
            const price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
            if (!player || !Number.isFinite(price)) continue;
            out.push({ name: player, home, away, game, eventId: ev.id, oddsAmerican: price });
          }
        }
      }
    }
    return out;
  }catch{ return []; }
}
async function fetchHROddsIndex(){
  try{
    const r = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us');
    if(!r.ok) return new Map();
    const data = await r.json();
    const map = new Map();
    const norm = (s)=>{
      try{ return normalizePlayerName(s); }catch{return s||"";}
    };
    if(Array.isArray(data?.events)){
      for (const ev of data.events){
        const gameCode = (ev?.home_team && ev?.away_team) ? `${ev.away_team}@${ev.home_team}` : (ev?.id || ev?.commence_time || "");
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            for (const oc of (mk.outcomes||[])){
              const player = norm(oc.name || oc.description || oc.participant || "");
              const price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
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

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({ source:"—", count:0, games:0 });

  async function generate(){
    setLoading(true); setMessage(""); setRows([]);
    try{
      let cands = await fetchPrimary();
      let source = "/.netlify/functions/odds-mlb-hr";
      if (!cands.length){
        const fb = await fetchFallback();
        if (fb.length){ cands = fb; source = "odds-props (fallback)"; }
      }
      if (!cands.length) throw new Error("No candidates (primary and fallback empty)");

      // Join live odds when available
      const idx = await fetchHROddsIndex();
      cands = cands.map(c => {
        const key = `${c.game}|${normalizePlayerName(c.name||"")}`.toLowerCase();
        const joined = idx.get(key);
        return { ...c, oddsAmerican: Number.isFinite(joined) ? joined : c.oddsAmerican };
      });

      // Score & select
      const scored = cands.map(scoreHRPick);
      const { picks, message: chooseMsg } = selectHRPicks(scored);
      setDiag({ source, count: cands.length, games: uniqGames(cands) });
      setMessage(chooseMsg || "");

      const ui = picks.map((p) => ({
        name: p.name,
        team: p.team||"—",
        game: (p.away && p.home) ? `${p.away}@${p.home}` : (p.game || "—"),
        modelProb: p.p_final ?? null,
        modelAmerican: p.modelAmerican ?? (p.p_final ? americanFromProb(p.p_final) : null),
        oddsAmerican: (p.oddsAmerican != null) ? Math.round(Number(p.oddsAmerican)) : null,
        why: p.why2 || p.why || "—",
      }));
      setRows(ui);

      // ---- fire-and-forget daily log to Netlify Blobs via function ----
      (async ()=>{
        try{
          const payload = {
            date: new Date().toISOString().slice(0,10),
            model_version: "1.4.3-hotfix",
            candidates: cands.length,
            games_seen: new Set(cands.map(c => c.game || (c.away && c.home ? `${c.away}@${c.home}` : ""))).size,
            bullpen_adjustment: { enabled: false, avg_delta_pp: 0, pct_gt_0_2pp: 0 },
            picks: picks.map(p => ({
              player: p.name,
              prob_pp: p.p_final != null ? +(p.p_final*100).toFixed(1) : null,
              prob_pp_shadow_bullpen: p.p_final != null ? +(p.p_final*100).toFixed(1) : null,
              bullpen_delta_pp: 0,
              why: p.why2 || p.why || ""
            }))
          };
          await fetch('/.netlify/functions/log_model_day', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
          });
        }catch{}
      })();
      // -----------------------------------------------------------------

    }catch(e){
      setMessage(String(e?.message||e));
      console.error(e);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{ generate(); }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">MLB — Home Run Picks</h1>
      <p className="text-sm text-gray-600 mb-4">
        Source: {diag.source} • Candidates: {diag.count} • Games seen: {diag.games}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 disabled:opacity-60"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Generating…" : "Generate"}
        </button>
        {message ? <span className="text-sm text-gray-700">{message}</span> : null}
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left">Player</th>
                <th className="px-4 py-2 text-left">Team</th>
                <th className="px-4 py-2 text-left">Game</th>
                <th className="px-4 py-2 text-left">Model HR Prob</th>
                <th className="px-4 py-2 text-left">Model Odds</th>
                <th className="px-4 py-2 text-left">Live Odds</th>
                <th className="px-4 py-2 text-left">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.team}</td>
                  <td className="px-4 py-2">{p.game}</td>
                  <td className="px-4 py-2">{p.modelProb != null ? (p.modelProb*100).toFixed(1) + "%" : "—"}</td>
                  <td className="px-4 py-2">{p.modelAmerican != null ? (p.modelAmerican>0?`+${p.modelAmerican}`:p.modelAmerican) : "—"}</td>
                  <td className="px-4 py-2">{p.oddsAmerican != null ? (p.oddsAmerican>0?`+${p.oddsAmerican}`:p.oddsAmerican) : "—"}</td>
                  <td className="px-4 py-2 text-sm">{p.why}</td>
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
