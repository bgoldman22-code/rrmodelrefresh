// src/MLB.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * Hardening goals:
 * - Never show uniform HR%: we compute per-row display prob from whatever inputs we have.
 * - EV only when we truly have a live American price.
 * - WHY: compact bullet-ish tags, not a single "base X%" line.
 * - Works even if odds APIs are thin/empty (model still renders).
 */

// ---------- Small utils (no external deps) ----------
function clamp(x, lo, hi){ return Math.min(hi, Math.max(lo, x)); }
function round1(x){ return Math.round(x * 10) / 10; }
function round1pct(x){ return round1(x * 100); }
function americanFromProb(p){
  // p in [0,1]; return American as string like "+250" or "-135"
  if (p <= 0) return "—";
  if (p >= 1) return "-100000";
  const dec = 1 / p;
  if (dec >= 2) { // underdog
    return `+${Math.round((dec - 1) * 100)}`;
  } else { // favorite
    return `-${Math.round(100 / (dec - 1))}`;
  }
}
function americanToDecimal(american){
  if (american == null) return null;
  if (typeof american === "number") american = String(american);
  if (american === "—" || american.trim() === "") return null;
  const v = parseInt(american, 10);
  if (isNaN(v)) return null;
  return v > 0 ? (1 + v/100) : (1 + 100/Math.abs(v));
}
function ev1u(prob, american){
  const dec = americanToDecimal(american);
  if (!dec) return null;
  // EV(1u) = prob*(dec-1) - (1-prob)
  return prob * (dec - 1) - (1 - prob);
}

// Strip weird zero-width & stray unicode that broke names previously
function cleanName(s){
  if (!s) return s;
  return String(s)
    .replace(/[\u200B-\u200F\uFEFF\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Some players are true boppers; give them a gentle continuous boost via log1p(HR).
// If season_hr unknown, weight_scale=1.0
function productionWeightScale(season_hr){
  if (season_hr == null) return 1.0;
  const anchor = 12; // ~league-average-ish for a solid power bat
  const scale = Math.log1p(Math.max(0, season_hr)) / Math.log1p(anchor);
  return clamp(scale, 0.5, 1.75);
}

// Build WHY tags based on whatever fields are present on the candidate.
// We *intentionally* keep these short, not full sentences.
function buildWhyTags(c){
  const tags = [];
  // Base prob (always)
  const base = typeof c.model_hr_prob === "number" ? c.model_hr_prob
             : (typeof c.base_hr_prob === "number" ? c.base_hr_prob
             : (typeof c.base_hr_pa === "number" ? c.base_hr_pa * (c.est_pas ?? 4) : null));
  if (typeof base === "number") tags.push(`base ${round1pct(base)}%`);

  // Platoon
  const bh = (c.bats || c.bats_hand || "").toUpperCase();
  const ph = (c.pitcher_hand || c.opp_pitch_hand || "").toUpperCase();
  if ((bh === "L" && ph === "R") || (bh === "R" && ph === "L")) tags.push("platoon+");
  else if ((bh === "L" && ph === "L") || (bh === "R" && ph === "R")) tags.push("platoon-");

  // Park
  if (typeof c.park_hr_factor === "number"){
    if (c.park_hr_factor >= 1.08) tags.push("park++");
    else if (c.park_hr_factor >= 1.02) tags.push("park+");
    else if (c.park_hr_factor <= 0.92) tags.push("park--");
    else if (c.park_hr_factor <= 0.98) tags.push("park-");
  }

  // Pitcher HR tendency (per 9)
  if (typeof c.pitcher_hr9 === "number"){
    if (c.pitcher_hr9 >= 1.5) tags.push("P:HR++");
    else if (c.pitcher_hr9 >= 1.2) tags.push("P:HR+");
    else if (c.pitcher_hr9 <= 0.7) tags.push("P:HR--");
  }

  // Recent barrels/HH (best-effort; naming varies)
  const recentBarrels = c.recent_barrels_per_bbe ?? c.recent_barrels_rate ?? null;
  if (typeof recentBarrels === "number"){
    if (recentBarrels >= 0.12) tags.push("barrels↑");
    else if (recentBarrels <= 0.05) tags.push("barrels↓");
  }
  const recentHR = c.hr_last_7 ?? c.hr_last_10 ?? null;
  if (typeof recentHR === "number"){
    if (recentHR >= 3) tags.push("hot");
  }

  // Order & PA
  if (typeof c.order === "number"){
    if (c.order <= 3) tags.push("top-order");
    else if (c.order >= 7) tags.push("down-order");
  }
  if (typeof c.est_pas === "number"){
    if (c.est_pas >= 4.7) tags.push("5PA");
    else if (c.est_pas <= 3.6) tags.push("3-PA risk");
  }

  // If model had a reason list already, keep a couple of them
  if (Array.isArray(c.why_tags)){
    for (const t of c.why_tags){
      if (tags.length >= 7) break;
      if (typeof t === "string" && t.length > 1) tags.push(t);
    }
  }

  // de-dupe
  const seen = new Set(); const out=[];
  for (const t of tags){
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

// Score one candidate into a display row
function scoreCandidate(c){
  const name = cleanName(c.player || c.name || "");
  // Try to use any provided model probability per game if present
  let p = null;

  if (typeof c.model_hr_prob === "number") {
    p = c.model_hr_prob; // already per-game
  } else if (typeof c.model_hr_pa === "number") {
    const pas = c.est_pas ?? 4;
    const pa = clamp(pas, 0, 6);
    p = 1 - Math.pow(1 - c.model_hr_pa, pa);
  } else if (typeof c.base_hr_pa === "number") {
    const pas = c.est_pas ?? 4;
    const pa = clamp(pas, 0, 6);
    p = 1 - Math.pow(1 - c.base_hr_pa, pa);
  } else {
    // absolute fallback
    const pas = c.est_pas ?? 4;
    const pa = clamp(pas, 0, 6);
    const base = 0.035; // 3.5%/PA
    p = 1 - Math.pow(1 - base, pa);
  }

  // Gentle calibration via production weight (if season_hr exists)
  const season_hr = c.season_hr ?? c.hr_season ?? c.hr_2025 ?? null;
  const weight = productionWeightScale(season_hr);
  const p_cal = clamp(p * (0.85 + 0.15 * weight), 0.01, 0.80); // keep in sane range

  const whyTags = buildWhyTags({ ...c, model_hr_prob: p });

  // live odds from any attached offers map, or from normalized field
  const americanLive = (typeof c.live_american === "string" || typeof c.live_american === "number")
    ? String(c.live_american)
    : (c.odds_american ?? null);

  const americanModel = americanFromProb(p_cal);
  const ev = ev1u(p_cal, americanLive);

  // game label
  const g = (c.game || c.game_label || `${c.away ?? "AWY"}@${c.home ?? "HOM"}`);

  return {
    player: name || "—",
    team: c.team ?? c.team_code ?? "—",
    game: g,
    modelProb: p_cal,         // 0..1
    modelAmerican: americanModel,
    liveAmerican: americanLive ?? "—",
    ev1u: ev,                 // null if no live price
    why: whyTags.length ? whyTags.join("; ") : `base ${round1pct(p)}%`,
  };
}

// Fetch odds props from multiple endpoints; return best-effort offers map {Player: "+450", ...}
async function fetchLiveOdds(){
  const urls = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
  ];
  const offers = {};
  const tried = [];
  for (const u of urls){
    try {
      const r = await fetch(u);
      const txt = await r.text();
      tried.push(`${u} — status ${r.status}`);
      if (!r.ok) continue;
      let json = null;
      try { json = JSON.parse(txt); }
      catch { continue; }
      // two shapes: (a) oddsapi-like events array; (b) flat k/v map
      if (Array.isArray(json)){
        for (const evt of json){
          // attempt common mapping
          const markets = evt?.bookmakers?.[0]?.markets || evt?.markets || [];
          for (const m of markets){
            if ((m.key || "").includes("home_run")){
              for (const o of (m.outcomes || [])){
                const nm = cleanName(o.name);
                if (!nm) continue;
                const price = (typeof o.price === "number") ? o.price : (o.american ?? null);
                if (price != null && offers[nm] == null){
                  offers[nm] = String(price);
                }
              }
            }
          }
        }
      } else if (json && typeof json === "object"){
        for (const [k,v] of Object.entries(json)){
          offers[cleanName(k)] = String(v);
        }
      }
    } catch (e){
      tried.push(`${u} — error`);
    }
  }
  return { offers, tried };
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [diag, setDiag] = useState({ candidates: 0, oddsTried: [], usingOddsApi: false });

  async function generate(){
    // 1) grab candidates from your primary HR model function
    const r = await fetch("/.netlify/functions/odds-mlb-hr");
    const base = await r.json().catch(()=>([]));
    const candidates = Array.isArray(base) ? base : (base?.candidates || []);
    // 2) live odds
    const { offers, tried } = await fetchLiveOdds();

    // 3) score & map
    const mapped = candidates.map(c => {
      // stitch live american if available by player name
      const nm = cleanName(c.player || c.name || "");
      const live = offers[nm];
      const scored = scoreCandidate({ ...c, live_american: live });
      return scored;
    });

    // 4) sort by EV when present, else by model prob
    mapped.sort((a,b) => {
      const ea = (typeof a.ev1u === "number") ? a.ev1u : -1e9;
      const eb = (typeof b.ev1u === "number") ? b.ev1u : -1e9;
      if (ea !== eb) return eb - ea;
      return b.modelProb - a.modelProb;
    });

    setRows(mapped.slice(0, 50));
    setDiag({ candidates: candidates.length, oddsTried: tried, usingOddsApi: Object.keys(offers).length > 0 });
  }

  useEffect(() => { generate(); }, []);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h2 className="text-xl font-semibold mb-2">MLB HR — Calibrated + Hot/Cold + Odds-first EV</h2>
      <div className="text-sm text-gray-600 mb-4">
        Date (ET): {new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day:"numeric", year:"numeric"})}
        {" "}
        • Candidates: {diag.candidates}
        {" "}
        • Using OddsAPI: {diag.usingOddsApi ? "yes" : "no"}
      </div>

      <button
        onClick={generate}
        className="px-3 py-2 mb-3 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Generate
      </button>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border">Player</th>
              <th className="p-2 border">Team</th>
              <th className="p-2 border">Game</th>
              <th className="p-2 border">Model HR%</th>
              <th className="p-2 border">American</th>
              <th className="p-2 border">EV (1u)</th>
              <th className="p-2 border">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">Waiting for today’s preview…</td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={idx} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border whitespace-nowrap">{r.player}</td>
                <td className="p-2 border text-center">{r.team}</td>
                <td className="p-2 border text-center">{r.game}</td>
                <td className="p-2 border text-center">{round1pct(r.modelProb)}%</td>
                <td className="p-2 border text-center">{r.liveAmerican ?? "—"}</td>
                <td className="p-2 border text-center">
                  {typeof r.ev1u === "number" ? (Math.round(r.ev1u*1000)/1000).toFixed(3) : "—"}
                </td>
                <td className="p-2 border">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-600">
        <div className="font-semibold mb-1">Diagnostics</div>
        <div>Picks: {rows.length} • Live odds entries: (best-effort)</div>
        <div className="mt-1">
          Odds endpoints tried:
          <ul className="list-disc ml-5">
            {diag.oddsTried.map((t,i)=>(<li key={i}>{t}</li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}