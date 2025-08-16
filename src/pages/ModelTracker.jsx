import React, { useEffect, useState } from "react";

const Check = () => <span aria-label="hit" title="Hit">✅</span>;
const Cross = () => <span aria-label="miss" title="Miss">❌</span>;

export default function ModelTracker() {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/get_model_log")
      .then((r) => r.json())
      .then(setDays)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!days.length) return <div className="p-6">No logs yet.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Model Tracker</h1>

      {days.map((d) => (
        <div key={d.date} className="rounded-2xl shadow p-4 border">
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <div className="text-lg font-semibold">{d.date}</div>
            <div className="text-sm text-gray-600">model {d.model_version}</div>
            <div className="text-xs text-gray-500">code {d.code_sha}</div>
            {d.metrics && (
              <div className="text-sm ml-auto">
                <span className="mr-3">Brier: {d.metrics.brier}</span>
                <span className="mr-3">LogLoss: {d.metrics.log_loss}</span>
                <span>Hit@20: {Math.round((d.metrics.hit_at_20 ?? 0) * 100)}%</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b">
                <tr>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Matchup</th>
                  <th className="py-2 pr-3">Prob (pp)</th>
                  <th className="py-2 pr-3">Odds</th>
                  <th className="py-2 pr-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {d.picks?.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3">{p.player}</td>
                    <td className="py-2 pr-3">{p.team} vs {p.opp}</td>
                    <td className="py-2 pr-3">{p.prob_pp?.toFixed?.(1)}</td>
                    <td className="py-2 pr-3">{p.odds}</td>
                    <td className="py-2 pr-3">{p.result === "hit" ? <Check/> : p.result === "miss" ? <Cross/> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.overlay_multipliers && (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Overlay multipliers</summary>
              <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify(d.overlay_multipliers, null, 2)}</pre>
            </details>
          )}

          {d.feature_deltas?.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer font-medium">Feature deltas</summary>
              <div className="mt-2 space-y-1 text-xs">
                {d.feature_deltas.map((f, i) => (
                  <div key={i}>
                    {f.name}: {f.old} → {f.new} ({f.delta_pct}%){f.capped ? " [capped]" : ""}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}