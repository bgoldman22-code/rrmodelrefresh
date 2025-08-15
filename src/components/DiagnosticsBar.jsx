import React, { useEffect, useState } from "react";
import { todayISO_ET } from "../utils/date.js";

const COLOR = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-gray-300",
};

function Dot({ status }){
  const cls = COLOR[status] || COLOR.gray;
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />;
}

export default function DiagnosticsBar(){
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const date = todayISO_ET();

  useEffect(() => {
    let alive = true;
    (async () => {
      try{
        const r = await fetch(`/.netlify/functions/diag?date=${encodeURIComponent(date)}`);
        const j = await r.json();
        if(!alive) return;
        setData(j);
      }catch(e){
        if(!alive) return;
        setError(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, [date]);

  const rows = [
    ["statsapi_today", "MLB StatsAPI (schedule)"],
    ["espn_mlb", "ESPN MLB (fallback)"],
    ["football_data", "Football-Data.org"],
    ["odds_prewarm", "OddsAPI prewarm"],
    ["odds_props_mlb", "OddsAPI MLB props"],
    ["blobs_store", "Netlify Blobs"],
    ["mlb_daily_learn", "MLB Daily Learn fn"],
  ];

  return (
    <div className="mt-8 p-3 border rounded bg-gray-50">
      <div className="text-xs text-gray-600 mb-2">Diagnostics for <strong>{date}</strong> (ET)</div>
      {error && <div className="text-xs text-rose-700">Error: {error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map(([key, label]) => {
          const status = data?.[key]?.status || "gray";
          const detail = data?.[key]?.detail || "";
          return (
            <div key={key} className="flex items-center justify-between gap-3 text-sm bg-white rounded px-3 py-2 shadow-sm border">
              <div className="flex items-center gap-2">
                <Dot status={status} />
                <span className="font-medium">{label}</span>
              </div>
              <div className="text-xs text-gray-500">{detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
