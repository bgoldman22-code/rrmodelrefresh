import React, { useEffect, useState } from "react";

export default function LearningStatus(){
  const [agg, setAgg] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try{
        const [settingsRes, metricsRes] = await Promise.all([
          fetch('/.netlify/functions/mlb-model-settings'),
          fetch('/.netlify/functions/mlb-metrics?window=7')
        ]);
        const settings = await settingsRes.json();
        const metrics = await metricsRes.json();
        setAgg({ settings, metrics });
      }catch(e){
        setErr(String(e));
      }
    })();
  }, []);

  if(err) return <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">Learning status error.</div>;
  if(!agg) return <div className="text-gray-500">Loading learning status…</div>;

  const pitch = agg.settings?.aggregates?.league?.pitch || {};
  const zone  = agg.settings?.aggregates?.league?.zone || {};
  const sum = (obj, key) => Object.values(obj).reduce((a, b) => a + (b?.[key] || 0), 0);
  const ipPitch = sum(pitch, 'ip');
  const hrPitch = sum(pitch, 'hr');
  const ipZone  = sum(zone, 'ip');
  const hrZone  = sum(zone, 'hr');
  const batterPitchKeys = Object.keys(agg.settings?.aggregates?.batterPitch || {}).length;
  const pitcherPitchKeys = Object.keys(agg.settings?.aggregates?.pitcherPitch || {}).length;

  const ln = agg.metrics?.lastNight || {};
  const sd = agg.metrics?.sevenDay || {};

  return (
    <div className="grid md:grid-cols-3 gap-3 mt-4">
      <div className="p-3 rounded border bg-gray-50">
        <div className="text-xs uppercase text-gray-500">League Pitch Types</div>
        <div className="text-sm text-gray-700 mt-1">Samples: {ipPitch.toLocaleString()} • HRs: {hrPitch.toLocaleString()}</div>
      </div>
      <div className="p-3 rounded border bg-gray-50">
        <div className="text-xs uppercase text-gray-500">League Zones</div>
        <div className="text-sm text-gray-700 mt-1">Samples: {ipZone.toLocaleString()} • HRs: {hrZone.toLocaleString()}</div>
      </div>
      <div className="p-3 rounded border bg-gray-50">
        <div className="text-xs uppercase text-gray-500">Profiles Learned</div>
        <div className="text-sm text-gray-700 mt-1">Batters: {batterPitchKeys.toLocaleString()} • Pitchers: {pitcherPitchKeys.toLocaleString()}</div>
      </div>

      <div className="p-3 rounded border bg-green-50 md:col-span-3">
        <div className="text-xs uppercase text-gray-600">Last Night</div>
        <div className="text-sm text-gray-800 mt-1">
          Picks graded: {ln.n || 0} • Hits: {ln.hits || 0} • Misses: {ln.misses || 0} • Hit rate: {((ln.hitRate||0)*100).toFixed(1)}% • Expected hits: {(ln.expected||0).toFixed(2)} • Brier: {(ln.brier||0).toFixed(3)}
        </div>
      </div>

      <div className="p-3 rounded border bg-blue-50 md:col-span-3">
        <div className="text-xs uppercase text-gray-600">7‑Day</div>
        <div className="text-sm text-gray-800 mt-1">
          Picks graded: {sd.n || 0} • Hits: {sd.hits || 0} • Misses: {sd.misses || 0} • Hit rate: {((sd.hitRate||0)*100).toFixed(1)}% • Expected hits: {(sd.expected||0).toFixed(2)} • Brier: {(sd.brier||0).toFixed(3)}
        </div>
      </div>
    </div>
  );
}
