// src/MLB.jsx
import React, { useEffect, useState } from "react";

function todayISO(){ return new Date().toISOString().slice(0,10); }

async function tryFetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")){
    const txt = await res.text();
    throw new Error(`Non-JSON from ${url}: ${txt.slice(0,80)}`);
  }
  return res.json();
}
async function ensureLocked(date){
  // Try to fetch; if missing (404 or HTML), trigger lock then retry once
  try{
    return await tryFetchJSON(`/picks/${date}.json`);
  }catch(e){
    // Kick the function to generate today's file (idempotent)
    await fetch(`/.netlify/functions/lock_picks`, { method: "GET" }).catch(()=>{});
    // small delay
    await new Promise(r=> setTimeout(r, 800));
    return await tryFetchJSON(`/picks/${date}.json`);
  }
}
async function getOdds(date){
  try{
    return await tryFetchJSON(`/odds/${date}.json`);
  }catch{
    // Try to refresh once
    await fetch(`/.netlify/functions/update_odds`).catch(()=>{});
    await new Promise(r=> setTimeout(r, 500));
    try{
      return await tryFetchJSON(`/odds/${date}.json`);
    }catch{
      return {};
    }
  }
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ date: todayISO(), locked_at_et: null, model_version: null });
  const [status, setStatus] = useState({ picks: 0, oddsSize: 0, merged: 0, error: null, refreshed:false });

  useEffect(()=>{
    let mounted = true;
    (async()=>{
      const date = todayISO();
      try{
        const picks = await ensureLocked(date);
        const odds = await getOdds(date);
        const merged = (picks.picks||[]).map(p => ({
          player: p.player,
          team: p.team,
          game: `${p.opp}@${p.team}`,
          prob: p.prob_pp,
          modelOdds: toAmericanFromPct(p.prob_pp),
          liveOdds: odds[p.player] ?? "—",
          why: (p.why||[]).join(", ")
        }));
        if (!mounted) return;
        setMeta({ date: picks.date, locked_at_et: picks.locked_at_et, model_version: picks.model_version });
        setRows(merged);
        setStatus({ picks: merged.length, oddsSize: Object.keys(odds).length, merged: merged.length, error: null, refreshed:true });
      }catch(e){
        if (!mounted) return;
        setStatus(s=>({...s, error: String(e?.message || e)}));
      }
    })();
    return ()=>{ mounted = false; };
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">MLB — Home Run Picks</h1>
      <div className="text-sm opacity-80 mb-3">
        {meta.locked_at_et
          ? <>Today’s picks locked at <b>{meta.locked_at_et} ET</b> — odds update live • Model <code>{meta.model_version}</code></>
          : <>Waiting for today’s locked list…</>}
      </div>

      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Player</th>
            <th className="p-2">Team</th>
            <th className="p-2">Game</th>
            <th className="p-2">Model HR Prob</th>
            <th className="p-2">Model Odds</th>
            <th className="p-2">Live Odds</th>
            <th className="p-2 text-left">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=> (
            <tr key={i} className="border-t">
              <td className="p-2">{r.player}</td>
              <td className="p-2 text-center">{r.team}</td>
              <td className="p-2 text-center">{r.game}</td>
              <td className="p-2 text-center">{fmtPct(r.prob)}</td>
              <td className="p-2 text-center">{toAmericanFromPct(r.prob)}</td>
              <td className="p-2 text-center">{r.liveOdds}</td>
              <td className="p-2">{r.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 text-sm">
        <b>Diagnostics:</b> Picks: {status.picks} • Live odds entries: {status.oddsSize} {status.refreshed ? "• (auto-refreshed)" : ""}
        {status.error && <div className="text-red-600 mt-1">Error: {status.error}</div>}
      </div>
    </div>
  );
}

function fmtPct(x){
  if (x==null || !Number.isFinite(+x)) return "—";
  const p = (+x).toFixed(1);
  return `${p}%`;
}
function toAmericanFromPct(pp){
  // pp = percent (e.g., 16.4)
  const p = Math.min(99.999, Math.max(0.001, Number(pp||0))) / 100;
  if (p >= 0.5) return -Math.round(100 * p / (1-p));
  return `+${Math.round(100 * (1-p) / p)}`;
}
