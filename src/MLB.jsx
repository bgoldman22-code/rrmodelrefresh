// src/MLB.jsx
// UI-only patch: never calls lock_picks from the browser.
// Renders locked picks if /picks/YYYY-MM-DD.json exists, else shows Preview.
// Keeps your diagnostics footer minimal but useful.

import React, { useEffect, useMemo, useState } from "react";
import { buildPreviewPicks, fetchOddsMap } from "./lib/preview_picks.js";

function todayYMD(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

async function getLocked(date){
  const url = `/.netlify/blobs/picks/${date}.json`;
  const res = await fetch(url, { headers: { "cache-control":"no-cache", "accept":"application/json" } });
  if (!res.ok) {
    if (res.status === 404) return { locked: false, picks: [], source: "missing" };
    return { locked: false, picks: [], source: `error ${res.status}` };
  }
  const ct = res.headers.get("content-type")||"";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(()=>"(non-text)");
    throw new Error(`Non-JSON from ${url}: ${txt.slice(0,120)}`);
  }
  const payload = await res.json();
  return { locked: true, picks: payload.picks || [], meta: payload };
}

function americanFromPct(pct){
  const p = Math.min(0.99999, Math.max(0.00001, (pct||0)/100));
  if (p >= 0.5) return String(-Math.round(100*p/(1-p)));
  return `+${Math.round(100*(1-p)/p)}`;
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [diag, setDiag] = useState({ mode: "waiting", date: todayYMD(), picks: 0, oddsEntries: 0, note: "" });

  useEffect(() => {
    let cancelled = false;
    const date = todayYMD();

    async function run(){
      try {
        // 1) Try locked list
        const locked = await getLocked(date);
        if (cancelled) return;

        if (locked.locked && (locked.picks?.length || 0) > 0){
          // merge latest odds (best-effort)
          const oddsMap = await fetchOddsMap().catch(()=> ({}));
          if (cancelled) return;

          const merged = (locked.picks || []).map(p => ({
            ...p,
            model_odds: americanFromPct(p.prob_pp),
            live_odds: oddsMap[p.player] ?? "-",
            why: Array.isArray(p.why) ? p.why.join(" • ") : (p.why || ""),
          }));

          setRows(merged);
          setDiag({
            mode: "locked",
            date,
            picks: merged.length,
            oddsEntries: Object.keys(oddsMap||{}).length,
            note: `Today's picks locked at ${locked?.meta?.locked_at_et || "11:00"} ET`,
          });
          return;
        }

        // 2) Fallback: PREVIEW
        const [picks, oddsMap] = await Promise.all([
          buildPreviewPicks(),
          fetchOddsMap().catch(()=> ({})),
        ]);
        if (cancelled) return;

        const mergedPrev = picks.map(p => ({
          ...p,
          model_odds: americanFromPct(p.prob_pp),
          live_odds: oddsMap[p.player] ?? "-",
          why: Array.isArray(p.why) ? p.why.join(" • ") : (p.why || ""),
        }));

        setRows(mergedPrev);
        setDiag({
          mode: "preview",
          date,
          picks: mergedPrev.length,
          oddsEntries: Object.keys(oddsMap||{}).length,
          note: "Preview — Official list will lock at 11:00 AM ET",
        });
      } catch (e){
        setDiag(d => ({ ...d, note: String(e?.message || e) }));
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">MLB — Home Run Picks</h1>
      <div className="text-sm mb-4">
        {diag.mode === "locked" ? (
          <span className="px-2 py-1 rounded bg-green-100 text-green-800">Locked</span>
        ) : (
          <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">Preview</span>
        )}
        <span className="ml-2 text-gray-600">{diag.note}</span>
      </div>

      <table className="min-w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Player</th>
            <th className="px-2 py-1 text-left">Team</th>
            <th className="px-2 py-1 text-left">Game</th>
            <th className="px-2 py-1 text-right">Model HR Prob</th>
            <th className="px-2 py-1 text-right">Model Odds</th>
            <th className="px-2 py-1 text-right">Live Odds</th>
            <th className="px-2 py-1 text-left">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="7" className="px-2 py-6 text-center text-gray-500">Waiting for today’s {diag.mode === "locked" ? "locked list" : "preview"}…</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1">{r.player}</td>
              <td className="px-2 py-1">{r.team || "—"}</td>
              <td className="px-2 py-1">{r.opp ? `AWY@HOM` : (r.game || "—")}</td>
              <td className="px-2 py-1 text-right">{(r.prob_pp ?? 0).toFixed(1)}%</td>
              <td className="px-2 py-1 text-right">{r.model_odds}</td>
              <td className="px-2 py-1 text-right">{r.live_odds}</td>
              <td className="px-2 py-1">{r.why || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 text-xs text-gray-600">
        Diagnostics: Picks: {diag.picks} • Live odds entries: {diag.oddsEntries}
      </div>
    </div>
  );
}
