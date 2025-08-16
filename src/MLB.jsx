\
// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { scoreHRPick } from "./models/hr_scoring.js";
import { selectHRPicks } from "./models/hr_select.js";

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

// DO NOT transform names; only trim whitespace
function normalizeCandidates(raw){
  const out = [];
  const clean = (s)=> (s==null? "" : String(s).replace(/\s+/g,' ').trim());
  const push = (obj)=>{
    if (!obj) return;
    const name = clean(obj.name || obj.player || obj.description || obj.outcome || obj.playerName || "");
    const home = obj.home || obj.home_team || obj.homeTeam || obj.teamHome;
    const away = obj.away || obj.away_team || obj.awayTeam || obj.teamAway || obj.opponent;
    const game = obj.game || (home && away ? `${clean(away)}@${clean(home)}` : "AWY@HOM");
    const rawOdds = obj.oddsAmerican ?? obj.odds ?? obj.price ?? obj.american ?? null;
    let oddsAmerican = Number(rawOdds);
    if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) oddsAmerican = null;
    out.push({
      id: obj.id || obj.playerId || `${name}|${game}`,
      name,
      team: clean(obj.team || obj.playerTeam || obj.team_abbr || obj.teamAbbr || "—"),
      home: clean(home), away: clean(away), game,
      eventId: obj.eventId || obj.event_id || obj.id || obj.gameId || obj.gamePk,
      oddsAmerican,
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
  try{ const r = await fetch('/.netlify/functions/odds-mlb-hr'); if(!r.ok) return []; return normalizeCandidates(await r.json()); }catch{ return []; }
}
async function fetchFallback(){
  try{
    const r = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us');
    if(!r.ok) return [];
    const data = await r.json();
    const out = [];
    const clean = (s)=> (s==null? "" : String(s).replace(/\s+/g,' ').trim());
    for (const ev of (data?.events||[])){
      const home = ev.home_team || ev.homeTeam || "";
      const away = ev.away_team || ev.awayTeam || "";
      const game = away && home ? `${clean(away)}@${clean(home)}` : (ev.id || "");
      for (const bk of (ev.bookmakers||[])){
        for (const mk of (bk.markets||[])){
          const key = (mk.key||mk.key_name||mk.market||"").toLowerCase();
          const isHR = (key.includes("home") && key.includes("run")) || key.includes("player_home_runs") || key.includes("player_to_hit_a_home_run");
          if (!isHR) continue;
          for (const oc of (mk.outcomes||[])){
            const player = clean(oc.name || oc.description || oc.participant || "");
            let price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
            if (!player || !Number.isFinite(price) || price === 0) continue;
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
    const clean = (s)=> (s==null? "" : String(s).replace(/\s+/g,' ').trim());
    if(Array.isArray(data?.events)){
      for (const ev of data.events){
        const gameCode = (ev?.home_team && ev?.away_team) ? `${clean(ev.away_team)}@${clean(ev.home_team)}` : (ev?.id || ev?.commence_time || "");
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            for (const oc of (mk.outcomes||[])){
              const player = clean(oc.name || oc.description || oc.participant || "");
              let price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
              if (!player || !Number.isFinite(price) || price === 0) continue;
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

      const idx = await fetchHROddsIndex();
      cands = cands.map(c => {
        const key = `${c.game}|${c.name}`.toLowerCase();
        const joined = idx.get(key);
        let oddsAmerican = Number.isFinite(joined) ? joined : c.oddsAmerican;
        if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) oddsAmerican = null;
        return { ...c, oddsAmerican };
      });

      const scored = cands.map(scoreHRPick);
      const { picks, message: chooseMsg } = selectHRPicks(scored);
      setDiag({ source, count: cands.length, games: uniqGames(cands) });
      setMessage(chooseMsg || "");

      const ui = picks.map((p) => {
        // protect first letter from any ::first-letter CSS rules that might hide it
        const safeName = "\\u2060" + String(p.name||"");
        return {
          name: safeName,
          team: p.team||"—",
          game: (p.away && p.home) ? `${p.away}@${p.home}` : (p.game || "—"),
          modelProb: p.p_final ?? null,
          modelAmerican: p.modelAmerican ?? (p.p_final ? americanFromProb(p.p_final) : null),
          oddsAmerican: (p.oddsAmerican != null) ? Math.round(Number(p.oddsAmerican)) : null,
          why: p.why2 || p.why || "—",
        };
      });
      setRows(ui);

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

    }catch(e){
      setMessage(String(e?.message||e));
      console.error(e);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{ generate(); }, []);

  return (
    <div>
      <h1>MLB — Home Run Picks</h1>
      <p>Source: {diag.source} • Candidates: {diag.count} • Games seen: {diag.games}</p>

      <div>
        <button onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate"}
        </button>
        {message ? <span> {message}</span> : null}
      </div>

      {rows.length ? (
        <div style={{overflowX:'auto'}}>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Game</th>
                <th>Model HR Prob</th>
                <th>Model Odds</th>
                <th>Live Odds</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td>{p.team}</td>
                  <td>{p.game}</td>
                  <td>{p.modelProb != null ? (p.modelProb*100).toFixed(1) + "%" : "—"}</td>
                  <td>{p.modelAmerican != null ? (p.modelAmerican>0?`+${p.modelAmerican}`:p.modelAmerican) : "—"}</td>
                  <td>{p.oddsAmerican != null ? (p.oddsAmerican>0?`+${p.oddsAmerican}`:p.oddsAmerican) : "—"}</td>
                  <td>{p.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>No picks yet.</div>
      )}
    </div>
  );
}
