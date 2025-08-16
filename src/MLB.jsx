// src/MLB.jsx
// UI patch: Preview/Locked rendering + RESTORED diagnostics footer with API details.

import React, { useEffect, useState } from "react";
import { buildPreviewPicksWithDiag, fetchOddsMap } from "./lib/preview_picks.js";

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
    return { locked: false, picks: [], meta: null, lockedStatus: res.status };
  }
  const ct = res.headers.get("content-type")||"";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(()=>"(non-text)");
    throw new Error(`Non-JSON from ${url}: ${txt.slice(0,120)}`);
  }
  const payload = await res.json();
  return { locked: true, picks: payload.picks || [], meta: payload, lockedStatus: 200 };
}

function americanFromPct(pct){
  const p = Math.min(0.99999, Math.max(0.00001, (pct||0)/100));
  if (p >= 0.5) return String(-Math.round(100*p/(1-p)));
  return `+${Math.round(100*(1-p)/p)}`;
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [diag, setDiag] = useState({
    mode: "waiting", date: todayYMD(), picks: 0, oddsEntries: 0,
    endpointsTried: [], lockedStatus: null, notes: [], features: ["preview+locked", "diagnostics"]
  });

  useEffect(() => {
    let cancelled = false;
    const date = todayYMD();

    async function run(){
      try{
        // Try locked first
        const locked = await getLocked(date);
        if (cancelled) return;

        if (locked.locked && (locked.picks?.length || 0) > 0){
          const oddsMap = await fetchOddsMap().catch(()=> ({}));
          if (cancelled) return;
          const merged = (locked.picks || []).map(p => ({
            ...p,
            model_odds: americanFromPct(p.prob_pp),
            live_odds: oddsMap[p.player] ?? "-",
            why: Array.isArray(p.why) ? p.why.join(" • ") : (p.why || ""),
          }));
          setRows(merged);
          setDiag(d => ({
            ...d,
            mode: "locked",
            picks: merged.length,
            oddsEntries: Object.keys(oddsMap||{}).length,
            lockedStatus: 200,
            notes: [(locked?.meta?.locked_at_et ? `Locked at ${locked.meta.locked_at_et} ET` : "Locked list present")],
          }));
          return;
        }

        // Preview fallback with detailed diagnostics
        const { picks, endpointsTried, notes } = await buildPreviewPicksWithDiag();
        if (cancelled) return;
        const oddsMap = await fetchOddsMap().catch(()=> ({}));

        const mergedPrev = picks.map(p => ({
          ...p,
          model_odds: americanFromPct(p.prob_pp),
          live_odds: oddsMap[p.player] ?? "-",
          why: Array.isArray(p.why) ? p.why.join(" • ") : (p.why || ""),
        }));

        setRows(mergedPrev);
        setDiag(d => ({
          ...d,
          mode: "preview",
          picks: mergedPrev.length,
          oddsEntries: Object.keys(oddsMap||{}).length,
          endpointsTried,
          lockedStatus: locked.lockedStatus,
          notes: notes.length ? notes : ["Preview — Official list will lock at 11:00 AM ET"],
        }));
      }catch(e){
        setDiag(d => ({ ...d, notes: [String(e?.message || e)] }));
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
        <span className="ml-2 text-gray-600">{diag.notes[0] || ""}</span>
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
            <tr><td colSpan="7" className="px-2 py-6 text-center text-gray-500">Waiting for today’s {diag.mode}…</td></tr>
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

      {/* Restored diagnostics footer */}
      <div className="mt-4 p-3 bg-gray-50 rounded border text-xs">
        <div className="font-semibold mb-1">Diagnostics</div>
        <div>Picks: {diag.picks} • Live odds entries: {diag.oddsEntries}</div>
        <div>Locked blob status: {diag.lockedStatus ?? "n/a"}</div>
        {diag.endpointsTried?.length ? (
          <div className="mt-1">
            <div className="font-medium">Endpoints tried:</div>
            <ul className="list-disc ml-4">
              {diag.endpointsTried.map((e,i) => (
                <li key={i}>
                  <span className="font-mono">{e.url}</span> — status {e.status}, items {e.items}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {diag.notes?.length > 1 ? (
          <div className="mt-1">
            <div className="font-medium">Notes:</div>
            <ul className="list-disc ml-4">
              {diag.notes.slice(1).map((n,i)=> <li key={i}>{n}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
