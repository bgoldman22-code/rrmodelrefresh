import React, { useEffect, useState } from "react";

// Optional helpers; guarded so missing files don’t break build
let RRSuggestion = () => null;
let LearningStatus = () => null;
try {
  // If you have these, great; if not, component still renders.
  // eslint-disable-next-line import/no-unresolved
  const R = require("./components/RRSuggestion.jsx");
  RRSuggestion = R.default ?? R.RRSuggestion ?? (() => null);
  // eslint-disable-next-line import/no-unresolved
  const L = require("./components/LearningStatus.jsx");
  LearningStatus = L.default ?? L.LearningStatus ?? (() => null);
} catch {}

const TARGET = 12;
const MIN_TARGET = 6;
const MAX_PER_MATCH = 2;
const PRICE_SAFETY = 0.96; // small haircut to be conservative

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function probFromAmerican(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || a === 0) return 0.5;
  if (a > 0) return 100 / (a + 100);
  return -a / (-a + 100);
}
function americanFromProb(p, k = 1.0) {
  const adj = clamp(p * k, 0.001, 0.999);
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}
function abbrFromName(name) {
  if (!name) return "TEAM";
  const parts = String(name).split(" ");
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 3).toUpperCase();
}
function fmtAmerican(a){ return a>0?`+${a}`:`${a}`; }

// Get upcoming Thu→Mon window (your request)
function getThuMonWindow(d = new Date()) {
  // Work in UTC to keep dates consistent with APIs
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  // next Thursday (4)
  const toThu = (4 - dow + 7) % 7;
  const thu = new Date(dt);
  thu.setUTCDate(dt.getUTCDate() + toThu);
  const mon = new Date(thu);
  mon.setUTCDate(thu.getUTCDate() + 4); // Thu..Mon = +4
  const iso = (x) => x.toISOString().slice(0, 10);
  return { from: iso(thu), to: iso(mon) };
}

async function jget(u) { const r = await fetch(u); if (!r.ok) throw new Error("fetch " + u); return r.json(); }

function Soccer() {
  const [picks, setPicks] = useState([]);
  const [meta, setMeta] = useState({ range: "", events: 0, pool: 0, selected: 0, note: "", odds: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => { generate(); }, []);

  async function generate() {
    setLoading(true);
    setPicks([]);
    setMeta({ range: "", events: 0, pool: 0, selected: 0, note: "", odds: "" });

    const { from, to } = getThuMonWindow(new Date());
    const range = `${from} → ${to}`;

    try {
      // Primary: The Odds API via your proxy, for EPL first (extendable)
      // Markets: any-time goal scorer variants
      const leagues = ["epl"]; // expand later as needed: "laliga","seriea","bundesliga","ligue1","primeira"
      let allEvents = [];
      for (const lg of leagues) {
        try {
          const od = await jget(`/.netlify/functions/odds-props?league=${encodeURIComponent(lg)}&markets=player_goal_scorer_anytime,player_to_score_anytime,goalscorer_anytime&regions=us&limit=40&dateFrom=${from}&dateTo=${to}`);
          if (Array.isArray(od?.data)) allEvents = allEvents.concat(od.data);
        } catch {}
      }

      // Build candidates from odds
      const pool = [];
      for (const ev of allEvents) {
        const away = abbrFromName(ev.away_team);
        const home = abbrFromName(ev.home_team);
        const matchId = `${away}@${home}`;
        const markets = ev.bookmakers?.flatMap(b => b.markets || []) || [];
        for (const mk of markets) {
          const key = String(mk.key || "").toLowerCase();
          if (!key.includes("goal") && !key.includes("score")) continue; // narrow to AGS-style markets
          for (const oc of mk.outcomes || []) {
            const name = String(oc.name || "").trim();
            const price = Number(oc.price);
            if (!name || !Number.isFinite(price)) continue;
            // multiple books may list same player; keep the best (highest implied p)
            const p = probFromAmerican(price);
            pool.push({
              name,
              team: "", // books don’t always give team; display can omit
              matchId,
              prob: clamp(p, 0.05, 0.65),
              apiAmerican: price,
              why: "market: anytime goalscorer"
            });
          }
        }
      }

      // De-duplicate by (match, player) keeping max prob
      const dedup = new Map();
      for (const c of pool) {
        const k = `${c.matchId}|${c.name}`.toLowerCase();
        if (!dedup.has(k) || dedup.get(k).prob < c.prob) dedup.set(k, c);
      }
      const uniq = Array.from(dedup.values());

      // Select with ≤2 per match, target 12, soft-fill to ≥6
      uniq.sort((a, b) => b.prob - a.prob);
      const perMatch = {};
      const selected = [];
      for (const c of uniq) {
        if ((perMatch[c.matchId] || 0) >= MAX_PER_MATCH) continue;
        selected.push(c);
        perMatch[c.matchId] = (perMatch[c.matchId] || 0) + 1;
        if (selected.length >= TARGET) break;
      }
      if (selected.length < MIN_TARGET) {
        for (const c of uniq) {
          if (selected.find(x => x.name === c.name && x.matchId === c.matchId)) continue;
          if ((perMatch[c.matchId] || 0) >= MAX_PER_MATCH) continue;
          selected.push(c);
          perMatch[c.matchId] = (perMatch[c.matchId] || 0) + 1;
          if (selected.length >= MIN_TARGET) break;
        }
      }

      const oddsNote = allEvents.length
        ? "odds: The Odds API (via proxy)"
        : "odds: not available (quota or market off)";

      setPicks(selected);
      setMeta({
        range,
        events: allEvents.length,
        pool: uniq.length,
        selected: selected.length,
        note: !allEvents.length ? "Odds endpoint returned zero; showing picks only if markets were available." : "",
        odds: oddsNote
      });

      // (Optional) Submit for learning — only if you already created this function
      try {
        await fetch("/.netlify/functions/soccer-submit-picks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from, to, picks: selected })
        });
      } catch {}
    } catch (e) {
      console.error(e);
      setMeta(m => ({ ...m, note: "Error building soccer picks." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Soccer — Anytime Goalscorer Round Robin</h1>
        <p className="text-gray-600 text-center text-sm mb-1">
          Window: {meta.range || "—"} • Events: {meta.events} • Pool: {meta.pool} • Selected: {meta.selected}
        </p>
        <p className="text-gray-500 text-center text-xs mb-4">{meta.odds}</p>

        <div className="flex justify-center mb-6">
          <button onClick={generate} disabled={loading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-60">
            {loading ? "Crunching…" : "Generate Soccer Picks"}
          </button>
        </div>

        {meta.note && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-6">
            {meta.note}
          </div>
        )}

        {picks.length > 0 && (
          <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Player</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Match</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Model AGS Prob</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Est. Odds</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Why</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {picks.map((p, i) => {
                  const implied = p.apiAmerican != null ? probFromAmerican(p.apiAmerican) : p.prob;
                  const line = p.apiAmerican != null ? p.apiAmerican : americanFromProb(implied, PRICE_SAFETY);
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.matchId}</td>
                      <td className="px-4 py-2">{(implied * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2">{fmtAmerican(line)}</td>
                      <td className="px-4 py-2 text-gray-600">{p.why}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {picks.length > 1 && <RRSuggestion picks={picks} />}
        <LearningStatus sport="soccer" />
      </div>
    </div>
  );
}

export default Soccer;
