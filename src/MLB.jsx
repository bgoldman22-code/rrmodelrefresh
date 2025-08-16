// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { tidyName } from "./lib/common/clean.js";
import { fetchHROddsAndGames } from "./lib/odds_merge.js";
import { buildWhy } from "./lib/why.js";

function americanFromProb(pct) {
  const p = Math.max(0.0001, Math.min(0.9999, pct/100));
  const dec = 1/p;
  if (dec >= 2) return `+${Math.round((dec-1)*100)}`;
  return `${Math.round(-100/(dec-1))}`;
}

function mergeCandidates(cands, oddsMap){
  const out = [];
  for (const c of (cands||[])) {
    const player = tidyName(c.player || c.name || "");
    const key = player;
    const fromOdds = player && oddsMap.get(player) || null;
    const team = c.team || (fromOdds?.team) || "—";
    const opp  = c.opp  || (fromOdds?.opp)  || "—";
    const game = c.game || c.game_id || (fromOdds?.game) || (team !== "—" && opp !== "—" ? `${team}@${opp}` : "AWY@HOM");

    // model prob
    const prob = (typeof c.prob_pp === "number" && c.prob_pp > 0) ? c.prob_pp
               : (typeof c.hr_prob_pp === "number" && c.hr_prob_pp > 0) ? c.hr_prob_pp
               : (typeof c.base_prob === "number" && c.base_prob > 0) ? c.base_prob
               : 3.5;

    // model odds from prob
    const modelOdds = americanFromProb(prob);

    // live odds (string like +480), fallback "-"
    const live = fromOdds?.liveOdd || "-";

    // WHY
    const why = (Array.isArray(c.why) && c.why.length) ? c.why : buildWhy({ player, hand: c.hand, starter_factor: c.starter_factor, pa_est: c.pa_est, platoon_edge: c.platoon_edge, park_boost: c.park_boost, form_7d: c.form_7d });

    out.push({
      player, team, game, prob_pp: prob, model_odds: modelOdds, live_odds: live, why
    });
  }
  return out;
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [diag, setDiag] = useState({ picks: 0, oddsMap: 0, tried: [] });
  const [mode, setMode] = useState("preview"); // preview until lock json exists

  useEffect(()=>{
    (async () => {
      // 1) Try locked blob
      const today = new Date().toISOString().slice(0,10);
      const lockedUrl = `/picks/${today}.json`;
      const previewUrl = `/picks/${today}.preview.json`;
      let payload = null; let source = "locked";
      async function getJson(u){
        try {
          const r = await fetch(u, { headers: { "cache-control": "no-cache" }});
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      }
      payload = await getJson(lockedUrl);
      if (!payload) { source = "preview"; payload = await getJson(previewUrl); setMode("preview"); }
      if (!payload) {
        // 2) Fallback to live function for candidates
        source = "function";
        try {
          const r = await fetch("/.netlify/functions/odds-mlb-hr", { headers: { "cache-control": "no-cache" }});
          const txt = await r.text();
          payload = JSON.parse(txt);
        } catch {}
      }

      // odds map
      const { map, tried } = await fetchHROddsAndGames();
      const oddsMap = map;

      const cands = (payload?.picks || payload?.candidates || []);
      const merged = mergeCandidates(cands, oddsMap);
      setRows(merged);
      setDiag({ picks: merged.length, oddsMap: oddsMap.size, tried, source });
    })();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">MLB — Home Run Picks</h1>
      {mode === "preview" ? (
        <div className="text-sm text-amber-600 mb-2">Preview — Official list will lock at 11:00 AM ET</div>
      ) : (
        <div className="text-sm text-emerald-600 mb-2">Locked — Odds update live</div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Team</th>
              <th className="py-2 pr-3">Game</th>
              <th className="py-2 pr-3">Model HR Prob</th>
              <th className="py-2 pr-3">Model Odds</th>
              <th className="py-2 pr-3">Live Odds</th>
              <th className="py-2 pr-3">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx)=> (
              <tr key={idx} className="border-b">
                <td className="py-2 pr-3">{r.player}</td>
                <td className="py-2 pr-3">{r.team}</td>
                <td className="py-2 pr-3">{r.game}</td>
                <td className="py-2 pr-3">{r.prob_pp?.toFixed(1)}%</td>
                <td className="py-2 pr-3">{r.model_odds}</td>
                <td className="py-2 pr-3">{r.live_odds}</td>
                <td className="py-2 pr-3">{Array.isArray(r.why) ? r.why.join(" • ") : r.why}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan="7" className="py-4 text-slate-500">Waiting for today’s preview…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-slate-600">
        <div>Diagnostics: Picks: {diag.picks} • Live odds entries: {diag.oddsMap}</div>
        <div className="mt-1">Odds endpoints tried:</div>
        <ul className="list-disc ml-6">
          {(diag.tried||[]).map((t,i)=> <li key={i}>{t.url} — status {t.status}, events {t.events}</li>)}
        </ul>
      </div>
    </div>
  );
}
