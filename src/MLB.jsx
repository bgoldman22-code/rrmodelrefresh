import React, { useEffect, useState } from "react";
import { americanFromProb, evFromProbAndOdds } from "./utils/ev.js";
import { hotColdMultiplier } from "./utils/hotcold.js";
import { scoreHRPick } from "./models/hr_scoring.js";

const CAL_LAMBDA = 0.25;
const HOTCOLD_CAP = 0.06;
const MIN_PICKS = 12;
const MAX_PER_GAME = 2;

function fmtET(date=new Date()){
  return new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", month:"short", day:"2-digit", year:"numeric"}).format(date);
}
function dateISO_ET(offsetDays=0){
  const d = new Date();
  const et = new Intl.DateTimeFormat("en-CA",{ timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
  const base = new Date(et+"T00:00:00Z");
  base.setUTCDate(base.getUTCDate()+offsetDays);
  return new Intl.DateTimeFormat("en-CA",{ timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(base);
}
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }, cache:"no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// Turn raw factor fields into 2-sentence human writeup
function explainNarrative(c, baseProb, hcMul, calScale){
  const parts = [];
  // 1) Baseline power
  const seasonHR = Number(c.seasonHR||0), seasonPA = Number(c.seasonPA||0);
  const hrpa = seasonPA>0 ? (seasonHR/seasonPA) : 0;
  const powerStr = hrpa>0 ? `${(hrpa*100).toFixed(1)}% HR/PA baseline` : `solid power baseline`;
  const paStr = c.expPA ? `~${Number(c.expPA).toFixed(1)} PAs` : `~4 PAs`;
  parts.push(`${c.name} projects from a ${powerStr} and ${paStr} today.`);

  // 2) Contextual boosts
  const ctx = [];
  const park = Number(c.parkFactor||c.parkHR||1);
  if(park>1.05) ctx.push(`hitter-friendly park (+${((park-1)*100).toFixed(0)}%)`);
  if(park<0.95) ctx.push(`pitcher-friendly park (−${((1-park)*100).toFixed(0)}%)`);

  const wx = Number(c.wxFactor||c.weatherFactor||1);
  if(wx>1.03) ctx.push(`weather marginally helps carry`);
  if(wx<0.97) ctx.push(`weather slightly suppresses carry`);

  // Pitch mix / platoon
  const pm = Number(c.pitchCompat||1);
  if(pm>1.03) ctx.push(`favorable vs expected pitch mix`);
  if(pm<0.97) ctx.push(`tough vs expected pitch mix`);

  const zc = Number(c.zoneCompat||1);
  if(zc>1.03) ctx.push(`hot zones align with pitcher’s locations`);
  if(zc<0.97) ctx.push(`cold zones vs pitcher’s locations`);

  // BvP
  const bvpPA = Number(c.bvpPA||0), bvpHR = Number(c.bvpHR||0);
  if(bvpPA>=6){
    ctx.push(`BvP ${bvpHR} HR in ${bvpPA} PA`);
  }

  // Synthesize
  if(ctx.length){
    parts.push(`Context: ${ctx.slice(0,3).join(", ")}.`);
  }else{
    parts.push(`Context: neutral park/weather; model leans on skill and matchup.`);
  }
  // calibration/hot-cold tags
  const tags = [];
  if(Math.abs(hcMul-1)>0.01) tags.push(`form ${hcMul>1?"+":""}${((hcMul-1)*100).toFixed(0)}%`);
  if(Math.abs(calScale-1)>0.01) tags.push(`cal ${calScale>1?"+":""}${((calScale-1)*100).toFixed(0)}%`);
  if(tags.length) parts[1] += ` (${tags.join(", ")})`;

  return parts.join(" ");
}

export default function MLB(){
  const [picks, setPicks] = useState([]);
  const [meta, setMeta]   = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getCalibration(){
    try{ const j = await fetchJSON("/.netlify/functions/mlb-calibration"); return j?.global?.scale ? j : { global:{ scale:1.0 }, bins:[] }; }
    catch{ return { global:{ scale:1.0 }, bins:[] }; }
  }

  async function tryEndpoints(endpoints){
    for(const url of endpoints){
      try{
        const j = await fetchJSON(url);
        if(Array.isArray(j?.candidates) && j.candidates.length>0) return j.candidates;
        if(Array.isArray(j?.rows) && j.rows.length>0) return j.rows;
      }catch(e){ /* try next */ }
    }
    return [];
  }

  async function getSlate(){
    const endpoints = [
      "/.netlify/functions/mlb-slate-lite",
      "/.netlify/functions/mlb-slate",
      "/.netlify/functions/mlb-candidates",
      "/.netlify/functions/mlb-schedule",
    ];
    const cand = await tryEndpoints(endpoints);
    if(cand.length>0) return cand;
    throw new Error("No candidate endpoint returned players.");
  }

  async function getHotColdBulk(ids){
    try{
      const end = dateISO_ET(0);
      const d = new Date(end+"T00:00:00");
      d.setDate(d.getDate()-13);
      const beg = new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
      const url = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=stats(group=hitting,type=byDateRange,beginDate=${beg},endDate=${end})`;
      const j = await fetchJSON(url);
      const out = new Map();
      for(const p of (j.people||[])){
        const sid = p?.id;
        let hr14=0, pa14=0;
        for(const s of (p?.stats||[])){
          for(const sp of (s?.splits||[])){
            hr14 += Number(sp?.stat?.homeRuns || 0);
            pa14 += Number(sp?.stat?.plateAppearances || 0);
          }
        }
        out.set(String(sid), { hr14, pa14 });
      }
      return out;
    }catch{ return new Map(); }
  }

  async function getOddsMap(){
    // Try our new function first, then fall back to your older prewarm function
    const tryUrls = [
      "/.netlify/functions/odds-mlb-hr",
      "/.netlify/functions/prewarm-odds-v2?market=batter_home_runs"
    ];
    for(const url of tryUrls){
      try{
        const j = await fetchJSON(url);
        const arr = j?.data || j?.rows || j?.outcomes || [];
        const map = new Map();
        for(const r of arr){
          const key = String(r.player || r.name).toLowerCase();
          const american = Number(r.best_american || r.american || r.price || r.odds_american);
          if(key && !isNaN(american)){
            map.set(key, { american, book: r.book || r.bookmaker || "best"});
          }
        }
        if(map.size>0) return map;
      }catch(e){ /* next */ }
    }
    return new Map();
  }

  function applyCalibration(p, scale){
    const scaled = Math.max(0.0005, Math.min(0.95, p * scale));
    return (1 - CAL_LAMBDA) * p + CAL_LAMBDA * scaled;
  }

  async function build(){
    setLoading(true); setMessage(""); setPicks([]);
    try{
      const [cals, baseCandidates] = await Promise.all([ getCalibration(), getSlate() ]);
      const ids = baseCandidates.map(x => x.batterId).filter(Boolean);
      const [hotMap, oddsMap] = await Promise.all([ getHotColdBulk(ids), getOddsMap() ]);

      const rows = [];
      for(const c of baseCandidates){
        let p = Number(c.baseProb||c.prob||0);
        if(!p || p<=0) continue;
        const hc = hotMap.get(String(c.batterId)) || { hr14:0, pa14:0 };
        const hcMul = hotColdMultiplier({ hr14:hc.hr14, pa14:hc.pa14, seasonHR:Number(c.seasonHR||0), seasonPA:Number(c.seasonPA||0) }, HOTCOLD_CAP);
        const calScale = Number(cals?.global?.scale || 1.0);
        const pAdj = applyCalibration(p * hcMul, calScale);

        const key = String(c.name||"").toLowerCase();
        const found = oddsMap.get(key);
        const american = found?.american ?? americanFromProb(pAdj);
        const ev = evFromProbAndOdds(pAdj, american);

        rows.push({
          name: c.name,
          team: c.team,
          game: c.gameId || c.game || c.opp || "",
          batterId: c.batterId,
          p_model: pAdj,
          american,
          ev,
          why_narrative: explainNarrative(c, p, hcMul, calScale),
        });
      }

      rows.sort((a,b)=> b.ev - a.ev);

      const out = [];
      const perGame = new Map();
      for(const r of rows){
        const g = r.game || "UNK";
        const n = perGame.get(g)||0;
        if(n >= MAX_PER_GAME) continue;
        out.push(r);
        perGame.set(g, n+1);
        if(out.length>=MIN_PICKS) break;
      }

      setPicks(out);
      setMeta({
        date: fmtET(),
        totalCandidates: baseCandidates.length,
        usedOdds: oddsMap.size>0,
        calibrationScale: Number(cals?.global?.scale || 1.0),
      });
      if(out.length < MIN_PICKS){
        setMessage(`Small slate or limited data — picked ${out.length} best by EV (max ${MAX_PER_GAME} per game).`);
      }
    }catch(e){
      console.error(e);
      setMessage(String(e?.message||e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{}, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">MLB HR — Calibrated + Hot/Cold + OddsAPI EV + Narrative</h1>
        <button onClick={build} className="px-3 py-2 bg-blue-600 text-white rounded" disabled={loading}>
          {loading ? "Working..." : "Generate"}
        </button>
      </div>
      {message && <div className="mt-3 text-red-700">{message}</div>}
      <div className="mt-2 text-sm text-gray-600">
        Date (ET): {meta.date} • Candidates: {meta.totalCandidates||0} • Using OddsAPI: {meta.usedOdds ? "yes":"no"} • Calibration scale: {meta.calibrationScale?.toFixed(2)}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-right">Model HR%</th>
              <th className="px-3 py-2 text-right">American</th>
              <th className="px-3 py-2 text-right">EV (1u)</th>
              <th className="px-3 py-2 text-left w-[480px]">Why (2 sentences)</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((r,i)=> (
              <tr key={i} className="border-b align-top">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.game}</td>
                <td className="px-3 py-2 text-right">{(r.p_model*100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">{r.american>0?`+${r.american}`:r.american}</td>
                <td className="px-3 py-2 text-right">{r.ev.toFixed(3)}</td>
                <td className="px-3 py-2">{r.why_narrative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
