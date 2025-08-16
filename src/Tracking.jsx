// src/Tracking.jsx
import React, { useEffect, useState } from "react";

async function fetchLog(day){
  const r = await fetch(`/.netlify/functions/get_model_log_blobs?day=${encodeURIComponent(day)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.data || null;
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

export default function Tracking(){
  const [day, setDay] = useState(todayISO());
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(){
    setLoading(true); setError(""); setLog(null);
    try{
      const j = await fetchLog(day);
      if (!j){ setError("No log for selected date."); }
      else setLog(j);
    }catch(e){
      setError(String(e?.message||e));
    }finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Model Tracking</h1>
      <div className="flex gap-2 items-center">
        <label className="text-sm">Day:</label>
        <input type="date" className="border px-2 py-1 rounded" value={day} onChange={e=>setDay(e.target.value)} />
        <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error ? <div className="text-red-600 text-sm">{error}</div> : null}

      {log ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            <div><b>Date:</b> {log.date}</div>
            <div><b>Model:</b> {log.model_version}</div>
            <div><b>Candidates:</b> {log.candidates} • <b>Games:</b> {log.games_seen}</div>
            {log.bullpen_adjustment ? (
              <div className="text-xs mt-1">
                <b>Bullpen (shadow):</b> avg Δ {log.bullpen_adjustment.avg_delta_pp} pp • ≥0.2pp: {log.bullpen_adjustment.pct_gt_0_2pp}%
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left">Player</th>
                  <th className="px-2 py-1 text-left">Prob (pp)</th>
                  <th className="px-2 py-1 text-left">Prob (shadow)</th>
                  <th className="px-2 py-1 text-left">Δ pp</th>
                  <th className="px-2 py-1 text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                {(log.picks||[]).map((p, i)=>(
                  <tr key={i} className="border-t align-top">
                    <td className="px-2 py-1">{p.player}</td>
                    <td className="px-2 py-1">{p.prob_pp != null ? p.prob_pp.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{p.prob_pp_shadow_bullpen != null ? p.prob_pp_shadow_bullpen.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{p.bullpen_delta_pp != null ? p.bullpen_delta_pp.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1 text-xs">{p.why || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
