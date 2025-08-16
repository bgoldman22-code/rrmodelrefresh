// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { scoreHRPick } from "./models/hr_scoring.js";
import { selectHRPicks } from "./models/hr_select.js";

const MODEL_VERSION = "1.4.3-hotfix-multi-fallback";

// ---------- helpers ----------
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function americanFromProb(p){
  const x = clamp(Number(p)||0, 1e-6, 0.999999);
  if (x >= 0.5) return -Math.round(100 * x / (1-x));
  return Math.round(100 * (1-x) / x);
}
function probFromAmerican(amer){
  const a = Number(amer);
  if (!Number.isFinite(a) || a === 0) return null;
  if (a > 0) return 100/(a+100);
  return -a/(-a+100);
}
function clean(s){ return (s==null? "" : String(s).replace(/\s+/g,' ').trim()); }
function stripDiacritics(s){ return (s||"").normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function fmtAmerican(v){ return v>0?`+${v}`:String(v); }
function choose(n, k){
  if (k<0 || k>n) return 0;
  let r = 1;
  for (let i=1; i<=k; i++) r = (r*(n - (k-i)))/i;
  return Math.round(r);
}

// Normalize incoming candidates without mutating player names
function normalizeCandidates(raw){
  const out = [];
  const push = (obj)=>{
    if (!obj) return;
    const name = clean(obj.name || obj.player || obj.description || obj.outcome || obj.playerName || "");
    const home = obj.home || obj.home_team || obj.homeTeam || obj.teamHome;
    const away = obj.away || obj.away_team || obj.awayTeam || obj.teamAway || obj.opponent;
    const game = obj.game || (home && away ? `${clean(away)}@${clean(home)}` : "AWY@HOM");
    const rawOdds = obj.oddsAmerican ?? obj.odds ?? obj.price ?? obj.american ?? null;
    let oddsAmerican = Number(rawOdds);
    if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) oddsAmerican = null;
    out.push({
      id: obj.id || obj.playerId || `${name}|${game}`,
      name,
      team: clean(obj.team || obj.playerTeam || obj.team_abbr || obj.teamAbbr || "—"),
      home: clean(home), away: clean(away), game,
      eventId: obj.eventId || obj.event_id || obj.id || obj.gameId || obj.gamePk,
      oddsAmerican,
      expPA: obj.expPA ?? obj.pa ?? 4,
      venue: obj.venue || obj.park || obj.venueName || obj.venue_name || null,
      starterHR9: obj.starterHR9 ?? obj.pitcherHR9 ?? obj.oppStarterHR9 ?? null,
      bvpHR: obj.bvpHR ?? obj.bvp_hr ?? 0, bvpPA: obj.bvpPA ?? obj.bvp_pa ?? 0,
      iso: obj.iso ?? obj.ISO ?? obj.seasonISO ?? obj.season_iso ?? null,
      barrelRate: obj.barrelRate ?? obj.barrel_rate ?? obj.brls_pa ?? obj.barrels_per_pa ?? null,
      recentHRperPA: obj.recentHRperPA ?? obj.hr_per_pa_l15 ?? obj.l15_hr_pa ?? null,
      bats: obj.bats || obj.batterHand || obj.handedBat || null,
      oppThrows: obj.oppThrows || obj.pitcherThrows || obj.starterThrows || null,
      iso_vs_rhp: obj.iso_vs_rhp || obj.iso_v_r || obj.iso_vr || null,
      iso_vs_lhp: obj.iso_vs_lhp || obj.iso_v_l || obj.iso_vl || null,
      fbPct: obj.fbPct || obj.fb_rate || obj.flyballRate || null,
      pullPct: obj.pullPct || obj.pull_rate || obj.pullRate || null
    });
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else if (raw && typeof raw === "object"){
    if (Array.isArray(raw.candidates)) raw.candidates.forEach(push);
    if (Array.isArray(raw.players)) raw.players.forEach(push);
    if (Array.isArray(raw.events)) raw.events.forEach(push);
    if (raw.data) normalizeCandidates(raw.data).forEach(push);
    if (raw.response) normalizeCandidates(raw.response).forEach(push);
  }
  return out;
}

async function fetchPrimary(){
  try{ const r = await fetch('/.netlify/functions/odds-mlb-hr'); if(!r.ok) return []; return normalizeCandidates(await r.json()); }catch{ return []; }
}

// Build odds context; try several URLs in order and merge
async function fetchOddsContext(){
  const empty = { byGamePlayer: new Map(), byPlayer: new Map(), slateDate: null, games: new Set(), tried: [] };
  const urls = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_home_runs,player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us"
  ];
  const byGamePlayer = new Map();
  const byPlayer = new Map();
  const games = new Set();
  let earliest = null;
  const tried = [];
  for (const url of urls){
    tried.push(url);
    try{
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      for (const ev of (data?.events||[])){
        const home = ev.home_team || ev.homeTeam || "";
        const away = ev.away_team || ev.awayTeam || "";
        const game = away && home ? `${clean(away)}@${clean(home)}` : (ev.id || "");
        if (home && away) games.add(game);
        const ctime = ev.commence_time || ev.commenceTime;
        if (ctime){
          const dt = new Date(ctime);
          if (!isNaN(dt.getTime())){
            if (earliest==null || dt < earliest) earliest = dt;
          }
        }
        for (const bk of (ev.bookmakers||[])){
          for (const mk of (bk.markets||[])){
            const key = (mk.key||mk.key_name||mk.market||"").toLowerCase();
            const isHR = (key.includes("home") && key.includes("run")) || key.includes("player_home_runs") || key.includes("player_to_hit_a_home_run");
            if (!isHR && mk.key) continue;
            for (const oc of (mk.outcomes||[])){
              const player = clean(oc.name || oc.description || oc.participant || "");
              let price = Number(oc.price_american ?? oc.price?.american ?? oc.price ?? oc.american ?? oc.odds);
              if (!player || !Number.isFinite(price) || price === 0) continue;
              const k1 = `${game}|${player}`.toLowerCase();
              if (!byGamePlayer.has(k1) || Math.abs(price) < Math.abs(byGamePlayer.get(k1).price)){
                byGamePlayer.set(k1, { price, game, name: player });
              }
              const k2 = player.toLowerCase();
              if (!byPlayer.has(k2) || Math.abs(price) < Math.abs(byPlayer.get(k2).price)){
                byPlayer.set(k2, { price, game, name: player });
              }
            }
          }
        }
      }
    }catch{/* keep trying next */}
    if (byGamePlayer.size) break; // stop at first that yields data
  }
  const slateDate = earliest ? earliest.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : null;
  return { byGamePlayer, byPlayer, slateDate, games, tried };
}

// Fuzzy match for odds
function fuzzyLookup(name, game, byGamePlayer, byPlayer){
  const k1 = `${game}|${name}`.toLowerCase();
  if (byGamePlayer.has(k1)) return byGamePlayer.get(k1);

  const plain = stripDiacritics(String(name).toLowerCase().replace(/\./g,''));
  const parts = plain.split(/\s+/).filter(Boolean);
  const last = parts[parts.length-1] || "";
  const firstInit = (parts[0] || "").slice(0,1);

  if (byPlayer.has(plain)) return byPlayer.get(plain);

  let best = null;
  for (const [k,obj] of byPlayer.entries()){
    const p = stripDiacritics(k.replace(/\./g,'')).split(/\s+/);
    const last2 = p[p.length-1] || "";
    const fi2 = (p[0]||"").slice(0,1);
    if (last2 === last && fi2 === firstInit) { best = obj; break; }
    if (!best && last2 === last) { best = obj; }
  }
  return best;
}

// Heuristic prob if model didn't supply one
function heuristicProb(p){
  let prob = 0.035;
  if (p.iso != null) prob += clamp((Number(p.iso)-0.160)*0.20, -0.01, 0.04);
  if (p.barrelRate != null) prob += clamp((Number(p.barrelRate)-0.07)*0.35, -0.01, 0.05);
  if (p.recentHRperPA != null) prob += clamp(Number(p.recentHRperPA)*0.6, 0, 0.05);
  if (p.starterHR9 != null) prob += clamp((Number(p.starterHR9)-1.0)*0.015, -0.015, 0.03);
  prob = clamp(prob, 0.01, 0.20);
  return prob;
}

// ---------- component ----------
export default function MLB(){
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({
    source:"—", count:0, games:0, picks:0, anchors:0, avgProb:null, liveOddsPct:null,
    slateDate:null, rr2:0, rr3:0, unitMemo:"",
    apiTried: [], logOk: null, learn: { bullpen_shadow: true, promoted: false }
  });

  async function generate(){
    setLoading(true); setMessage(""); setRows([]);
    try{
      const ctx = await fetchOddsContext(); // collect games/slate from the most permissive odds route

      let cands = await fetchPrimary();
      let source = "/.netlify/functions/odds-mlb-hr";
      if (!cands.length && ctx.byGamePlayer.size){
        // Build candidates directly from odds when primary is empty
        const fromOdds = Array.from(ctx.byGamePlayer.values()).map(rec => {
          const [away,home] = (rec.game||"").split("@");
          return { name: rec.name, game: rec.game, home, away, team:"—", oddsAmerican: rec.price };
        });
        if (fromOdds.length){ cands = fromOdds; source = "odds-props (fallback via context)"; }
      }
      if (!cands.length){
        setDiag(d => ({ ...d, source:"(no data)", count:0, games: ctx.games.size, slateDate: ctx.slateDate, apiTried: ctx.tried }));
        throw new Error("No candidates (primary and fallback empty)");
      }

      // Join live odds
      const { byGamePlayer, byPlayer, slateDate } = ctx;
      cands = cands.map(c => {
        let oddsAmerican = c.oddsAmerican;
        const hit = fuzzyLookup(c.name, c.game, byGamePlayer, byPlayer);
        if (hit) oddsAmerican = hit.price;
        if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) oddsAmerican = null;
        return { ...c, oddsAmerican };
      });

      // Score and pick
      const scored = cands.map(scoreHRPick);
      const { picks, message: chooseMsg } = selectHRPicks(scored);
      setMessage(chooseMsg || "");

      const anchorsSet = new Set(["Kyle Schwarber","Shohei Ohtani","Cal Raleigh","Juan Soto","Aaron Judge","Yordan Alvarez","Pete Alonso","Gunnar Henderson","Matt Olson","Corey Seager","Marcell Ozuna","Kyle Tucker","Rafael Devers"]);
      const anchors = picks.filter(p => anchorsSet.has(String(p.name))).length;

      const enriched = picks.map((p) => {
        let modelProb = (p.p_final ?? p.prob ?? p.p ?? null);
        if (modelProb == null) modelProb = heuristicProb(p);
        const modelAmerican = modelProb != null ? americanFromProb(modelProb) : null;
        const liveAmerican = Number.isFinite(p.oddsAmerican) ? Math.round(p.oddsAmerican) : null;
        let edge = null;
        if (modelProb != null && liveAmerican != null){
          const liveP = probFromAmerican(liveAmerican);
          if (liveP != null){ edge = (modelProb - liveP); }
        }
        let unit = "1x";
        if (edge != null){
          if (edge >= 0.04 || (anchorsSet.has(p.name) && modelProb >= 0.12)) unit = "3x";
          else if (edge >= 0.02) unit = "2x";
        } else if (anchorsSet.has(p.name) && modelProb && modelProb >= 0.12) {
          unit = "2x";
        }
        return { ...p, modelProb, modelAmerican, liveAmerican, edge, unit };
      });

      // Filter late-junk: requires odds or >=6%
      const filtered = enriched.filter(p => (p.liveAmerican != null) || (p.modelProb != null && p.modelProb >= 0.06));
      const sorted = filtered.slice().sort((a,b)=> (b.edge??-1) - (a.edge??-1) || (b.modelProb??0) - (a.modelProb??0));
      const topN = sorted.slice(0, 12);

      const rr2 = choose(topN.length, 2);
      const rr3 = choose(topN.length, 3);
      const unitMemo = (()=>{
        const c3 = topN.filter(x=>x.unit==="3x").length;
        const c2 = topN.filter(x=>x.unit==="2x").length;
        const c1 = topN.filter(x=>x.unit==="1x").length;
        return `${c3}×3u, ${c2}×2u, ${c1}×1u across ${topN.length} legs`;
      })();

      const probs = topN.map(p => p.modelProb).filter(x => Number.isFinite(x));
      const avgProb = probs.length ? (100*probs.reduce((a,b)=>a+b,0)/probs.length) : null;
      const liveOddsCount = topN.filter(p => Number.isFinite(p.liveAmerican)).length;
      const liveOddsPct = topN.length ? Math.round(100 * liveOddsCount / topN.length) : 0;

      setDiag(d => ({ ...d, source, count: cands.length, games: ctx.games.size, picks: topN.length, anchors, avgProb, liveOddsPct, slateDate, rr2, rr3, unitMemo, apiTried: ctx.tried }));

      const ui = topN.map((p) => ({
        name: String(p.name||"").replace(/[\u200B-\u200D\u2060]/g, ""),
        team: p.team||"—",
        game: (p.away && p.home) ? `${p.away}@${p.home}` : (p.game || "—"),
        modelProb: p.modelProb ?? null,
        modelAmerican: p.modelAmerican ?? (p.modelProb ? americanFromProb(p.modelProb) : null),
        oddsAmerican: p.liveAmerican ?? null,
        why: buildWhy(p),
        unit: p.unit
      }));
      setRows(ui);

      // No logging here to keep the repro simple while we stabilize feeds

    }catch(e){
      setMessage(String(e?.message||e));
      console.error(e);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{ generate(); }, []);

  // WHY text: varied and human
  function buildWhy(p){
    const facts = [];
    if (p.oppThrows && p.bats){ facts.push(`${p.bats.toUpperCase()} vs ${p.oppThrows.toUpperCase()} match-up`); }
    else if (p.oppThrows){ facts.push(`faces a ${p.oppThrows.toUpperCase()}HP`); }
    if (p.iso != null){
      const iso = Number(p.iso);
      if (iso >= 0.220) facts.push(`extra-base profile (ISO ${iso.toFixed(3)})`);
      else if (iso >= 0.180) facts.push(`solid pop (ISO ${iso.toFixed(3)})`);
    }
    if (p.barrelRate != null){
      const br = Number(p.barrelRate)*100;
      if (br >= 10) facts.push(`barrels ${br.toFixed(1)}%`);
    }
    if (p.fbPct != null && p.pullPct != null){
      const fb = Number(p.fbPct)*100, pl = Number(p.pullPct)*100;
      if (fb >= 35 && pl >= 40) facts.push(`air + pull combo (${fb.toFixed(0)}% FB, ${pl.toFixed(0)}% pull)`);
    }
    if (p.recentHRperPA != null){
      const r = Number(p.recentHRperPA)*100;
      if (r >= 2.0) facts.push(`L15 HR/PA ${r.toFixed(1)}%`);
    }
    if (p.starterHR9 != null){
      const s = Number(p.starterHR9);
      if (s >= 1.3) facts.push(`opponent allows ${s.toFixed(2)} HR/9`);
    }
    if (p.bvpPA != null && p.bvpPA >= 8 && p.bvpHR >= 1){
      facts.push(`BvP: ${p.bvpHR} HR in ${p.bvpPA} PA`);
    }
    if (p.expPA != null) facts.push(`~${p.expPA} PAs`);

    const head = String(p.name||"").replace(/[\u200B-\u200D\u2060]/g, "");
    const ctx = p.game ? ` (${p.game})` : "";
    if (!facts.length) return `${head}${ctx} — trending power spot.`;
    return `${head}${ctx} — ${facts.slice(0,4).join(" • ")}`;
  }

  // Simple pill
  function Chip({ok, children}){
    return <span className={ok ? "inline-block px-2 py-0.5 rounded bg-green-100 text-green-800" : "inline-block px-2 py-0.5 rounded bg-red-100 text-red-800"}>{children}</span>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">
        MLB — Home Run Picks {diag.slateDate ? <span className="text-base font-normal text-gray-600">({diag.slateDate})</span> : null}
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Source: {diag.source} • Candidates: {diag.count} • Games seen: {diag.games}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 disabled:opacity-60"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Generating…" : "Generate"}
        </button>
        {message ? <span className="text-sm text-gray-700">{message}</span> : null}
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left">Player</th>
                <th className="px-4 py-2 text-left">Team</th>
                <th className="px-4 py-2 text-left">Game</th>
                <th className="px-4 py-2 text-left">Model HR Prob</th>
                <th className="px-4 py-2 text-left">Model Odds</th>
                <th className="px-4 py-2 text-left">Live Odds</th>
                <th className="px-4 py-2 text-left">Why</th>
                <th className="px-4 py-2 text-left">Units</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.team}</td>
                  <td className="px-4 py-2">{p.game}</td>
                  <td className="px-4 py-2">{p.modelProb != null ? (p.modelProb*100).toFixed(1) + "%" : "—"}</td>
                  <td className="px-4 py-2">{p.modelAmerican != null ? fmtAmerican(p.modelAmerican) : "—"}</td>
                  <td className="px-4 py-2">{p.oddsAmerican != null ? fmtAmerican(p.oddsAmerican) : "—"}</td>
                  <td className="px-4 py-2 text-sm">{p.why}</td>
                  <td className="px-4 py-2">{p.unit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500">No picks yet.</div>
      )}

      {/* Footer: diagnostics + RR + which endpoints tried */}
      <div className="mt-6 text-sm text-gray-700 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Chip ok={diag.picks>=8}>Picks: {diag.picks}</Chip>
          <Chip ok={diag.anchors>=2}>Anchors: {diag.anchors}</Chip>
          <Chip ok={diag.avgProb!=null && diag.avgProb>=12}>Avg prob: {diag.avgProb!=null ? diag.avgProb.toFixed(1)+'%' : '—'}</Chip>
          <Chip ok={diag.liveOddsPct!=null && diag.liveOddsPct>=70}>Live odds coverage: {diag.liveOddsPct!=null ? diag.liveOddsPct+'%' : '—'}</Chip>
        </div>
        <div><strong>RR Guide:</strong> 2-legs = {diag.rr2}, 3-legs = {diag.rr3} • Suggested sizing: {diag.unitMemo}</div>
        <div><strong>Odds endpoints tried:</strong> {diag.apiTried.join(" → ") || "—"}</div>
        <div className="flex flex-wrap gap-2">
          <Chip ok={true}>Version: {MODEL_VERSION}</Chip>
          <Chip ok={true}>Features: multi-fallback • fuzzy_match • rr_units</Chip>
        </div>
      </div>
    </div>
  );
}
