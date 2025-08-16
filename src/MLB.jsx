// src/MLB.jsx (shows tried-URL statuses if fallback yields 0)
import React, { useEffect, useState } from "react";
import { selectHRPicks } from "./models/hr_select.js";
import { scoreHRPick } from "./models/hr_scoring.js";
import { buildCandidatesFromOddsPropsHardened } from "./lib/common/odds_fallback.js";

function americanToProb(odds){
  if (odds == null || isNaN(odds)) return null;
  const o = Number(odds);
  return o > 0 ? (100 / (o + 100)) : (Math.abs(o) / (Math.abs(o) + 100));
}
function americanFromProb(p){
  const adj = Math.max(0.001, Math.min(0.999, p));
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;
  const push = (obj) => {
    if (!obj) return;
    const name = obj.name || obj.player || obj.description || obj.outcome || obj.playerName || "";
    const home = obj.home || obj.home_team || obj.homeTeam || obj.teamHome;
    const away = obj.away || obj.away_team || obj.awayTeam || obj.teamAway || obj.opponent;
    const eventId = obj.eventId || obj.event_id || obj.id || obj.gameId || obj.gamePk;
    const game = obj.game || obj.gameId || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
    const team = obj.team || obj.playerTeam || obj.team_abbr || obj.teamAbbr || "";
    const odds = obj.oddsAmerican ?? obj.odds ?? obj.price ?? obj.american ?? null;
    const impliedProb = obj.impliedProb ?? americanToProb(odds);

    out.push({
      id: obj.id || obj.playerId || `${name}|${game}`,
      name,
      team,
      opponent: (team && home && team===home) ? away : home,
      home, away,
      game, eventId,
      oddsAmerican: (odds != null ? Number(odds) : null),
      impliedProb,
      baseHRPA: obj.baseHRPA ?? obj.hr_base ?? obj.hr_prob_sim ?? null,
      expPA: obj.expPA ?? obj.pa ?? 4,
      venue: obj.venue || obj.park || obj.venueName || obj.venue_name || null,
      starterHR9: obj.starterHR9 ?? obj.pitcherHR9 ?? obj.oppStarterHR9 ?? null,
      bvpHR: obj.bvpHR ?? obj.bvp_hr ?? 0, bvpPA: obj.bvpPA ?? obj.bvp_pa ?? 0,
      iso: obj.iso ?? obj.ISO ?? obj.seasonISO ?? obj.season_iso ?? null,
      barrelRate: obj.barrelRate ?? obj.barrel_rate ?? obj.brls_pa ?? obj.barrels_per_pa ?? null,
      recentHRperPA: obj.recentHRperPA ?? obj.hr_per_pa_l15 ?? obj.l15_hr_pa ?? 0,
      platoonFlag: obj.platoonFlag ?? obj.platoon ?? null,
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
  }
  return out;
}

async function fetchHROddsIndex(){
  try{
    const r = await fetch('/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us');
    if(!r.ok) return new Map();
    const data = await r.json();
    const map = new Map();
    if(Array.isArray(data?.events)){
      for (const ev of data.events){
        const gameCode = (ev?.home_team && ev?.away_team) ? `${ev.away_team}@${ev.home_team}` : (ev?.id || ev?.commence_time || "");
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            for (const oc of (mk.outcomes||[])){
              const player = (oc.name || oc.description || oc.participant || "").trim();
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
  }catch{
    return new Map();
  }
}

function gamesSeen(cands){
  const set = new Set();
  for (const x of cands){
    const home = x.home || x.home_team || x.homeTeam;
    const away = x.away || x.away_team || x.awayTeam || x.opponent;
    const game = x.game || (home && away ? `${String(away).trim()}@${String(home).trim()}` : "AWY@HOM");
    const key = (x.eventId || x.event_id || x.gameId) ? `${game}#${x.eventId || x.event_id || x.gameId}` : game;
    set.add(key);
  }
  return set.size;
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({ source:"", count:0, games:0 });

  async function generate(){
    setLoading(true); setMessage(""); setPicks([]);
    try{
      const baseRes = await fetch('/.netlify/functions/odds-mlb-hr');
      const baseJson = baseRes.ok ? await baseRes.json() : null;
      let cands = normalizeCandidates(baseJson);
      let dataSource = '/.netlify/functions/odds-mlb-hr';

      if (!cands.length) {
        const fb = await buildCandidatesFromOddsPropsHardened();
        if (fb.candidates?.length) {
          cands = fb.candidates;
          dataSource = `odds-props fallback (${fb.sourceTried||"no-source"})`;
          console.info("Fallback diagnostics:", fb);
        } else {
          const detail = (fb.tried||[]).map(t => `${t.url}→${t.status}`).join(" | ");
          throw new Error(`No candidates: primary empty and fallback parsed 0. Tried: ${detail || "no attempts"}`);
        }
      }

      const idx = await fetchHROddsIndex();
      cands = cands.map(c => {
        const key = `${c.game}|${c.name}`.toLowerCase();
        const joined = idx.get(key);
        return { ...c, oddsAmerican: Number.isFinite(joined) ? joined : c.oddsAmerican };
      });

      const scored = cands.map(scoreHRPick);
      const { picks: chosen, message: chooseMsg } = selectHRPicks(scored);
      setDiag({ source: dataSource, count: cands.length, games: gamesSeen(cands) });
      setMessage(chooseMsg || "");

      const ui = chosen.map(p => ({
        name: p.name,
        team: p.team,
        game: (p.away && p.home) ? `${p.away}@${p.home}` : (p.game || ""),
        modelProb: p.p_final ?? p.p_blended ?? p.p_model ?? null,
        modelAmerican: p.modelAmerican ?? (p.p_final ? americanFromProb(p.p_final) : null),
        oddsAmerican: (p.oddsAmerican != null) ? Math.round(Number(p.oddsAmerican)) : null,
        why: p.why2 || (Array.isArray(p.reasons) ? p.reasons.join(" • ") : ""),
      }));
      setPicks(ui);
    }catch(e){
      console.error(e);
      setMessage(String(e?.message||e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{ generate(); }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">MLB — Home Run Picks</h1>
      <p className="text-sm text-gray-600 mb-4">
        Source: {diag.source || "—"} • Candidates: {diag.count} • Games seen: {diag.games}
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

      {picks.length ? (
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
              {picks.map((p, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.team || "—"}</td>
                  <td className="px-4 py-2">{p.game || "—"}</td>
                  <td className="px-4 py-2">{p.modelProb != null ? (p.modelProb*100).toFixed(1) + "%" : "—"}</td>
                  <td className="px-4 py-2">{p.modelAmerican != null ? (p.modelAmerican>0?`+${p.modelAmerican}`:p.modelAmerican) : "—"}</td>
                  <td className="px-4 py-2">{p.oddsAmerican != null ? (p.oddsAmerican>0?`+${p.oddsAmerican}`:p.oddsAmerican) : "—"}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{p.why || "—"}</td>
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
