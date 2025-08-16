// src/MLB.jsx
import React, { useEffect, useState } from "react";
import { scoreHRPick } from "./models/hr_scoring.js";
import { selectHRPicks } from "./models/hr_select.js";

const MODEL_VERSION = "1.4.3-hotfix-odds-blend-no-nameclean";

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function fmtAmerican(v){ return v>0?`+${v}`:String(v); }
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
function choose(n, k){
  if (k<0 || k>n) return 0;
  let r = 1;
  for (let i=1; i<=k; i++) r = (r*(n - (k-i)))/i;
  return Math.round(r);
}

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
            const texty = (mk.key_name || mk.market || mk.key || "").toLowerCase();
            const isHR = (key.includes("home") && key.includes("run")) || key.includes("player_home_runs") || key.includes("player_to_hit_a_home_run") || texty.includes("home run");
            if (!isHR) continue;
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
    if (byGamePlayer.size) break;
  }
  const slateDate = earliest ? earliest.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : null;
  return { byGamePlayer, byPlayer, slateDate, games, tried };
}

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

function featureBumps(p){
  let bump = 0.0;
  if (p.iso != null) bump += clamp((Number(p.iso)-0.160)*0.20, -0.01, 0.04);
  if (p.barrelRate != null) bump += clamp((Number(p.barrelRate)-0.07)*0.35, -0.01, 0.05);
  if (p.recentHRperPA != null) bump += clamp(Number(p.recentHRperPA)*0.6, 0, 0.05);
  if (p.starterHR9 != null) bump += clamp((Number(p.starterHR9)-1.0)*0.015, -0.015, 0.03);
  // tiny anchor list
  const anchor = ["AARON JUDGE","SHOHEI OHTANI","YORDAN ALVAREZ","KYLE SCHWARBER","MATT OLSON","PETE ALONSO"];
  if (anchor.includes(String(p.name||"").toUpperCase())) bump += 0.01;
  return bump;
}

function computeModelProb(p){
  // base prior
  let prior = 0.035 + featureBumps(p);
  prior = clamp(prior, 0.01, 0.22);
  // blend with market if we have live odds
  const liveA = Number.isFinite(p.oddsAmerican) ? Number(p.oddsAmerican) : (Number.isFinite(p.liveAmerican) ? Number(p.liveAmerican) : null);
  if (liveA != null){
    const market = probFromAmerican(liveA);
    if (market != null){
      let blend = 0.7*market + 0.3*prior;
      blend = clamp(blend + 0.0, 0.01, 0.30);
      return blend;
    }
  }
  return prior;
}

function gamesSeenFromCandidates(cands){
  const set = new Set();
  for (const c of cands){
    const g = c.game || ((c.away && c.home) ? `${c.away}@${c.home}` : null);
    if (g) set.add(g);
    else if (c.eventId) set.add(String(c.eventId));
  }
  return set.size;
}

export default function MLB(){
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState({
    source:"—", count:0, games:0, picks:0, anchors:0, avgProb:null, liveOddsPct:null,
    slateDate:null, rr2:0, rr3:0, unitMemo:"", apiTried: [], lateBanner:false
  });

  async function generate(){
    setLoading(true); setMessage(""); setRows([]);
    try{
      const ctx = await fetchOddsContext();
      let cands = await fetchPrimary();
      let source = "/.netlify/functions/odds-mlb-hr";

      // fallback to odds-derived candidates if needed
      if (!cands.length && ctx.byGamePlayer.size){
        const fromOdds = Array.from(ctx.byGamePlayer.values()).map(rec => {
          const [away,home] = (rec.game||"").split("@");
          return { name: rec.name, game: rec.game, home, away, team:"—", oddsAmerican: rec.price };
        });
        if (fromOdds.length){ cands = fromOdds; source = "odds-props (fallback via context)"; }
      }
      if (!cands.length){
        setDiag(d => ({ ...d, source:"(no data)", count:0, games: ctx.games.size || 0, slateDate: ctx.slateDate, apiTried: ctx.tried, lateBanner:true }));
        setMessage("No candidates (primary and fallback empty)");
        return;
      }

      // Join live odds from context
      const { byGamePlayer, byPlayer, slateDate } = ctx;
      cands = cands.map(c => {
        let oddsAmerican = c.oddsAmerican;
        const hit = fuzzyLookup(c.name, c.game, byGamePlayer, byPlayer);
        if (hit) oddsAmerican = hit.price;
        if (!Number.isFinite(oddsAmerican) || oddsAmerican === 0) oddsAmerican = null;
        return { ...c, oddsAmerican };
      });

      // Score and run selector
      const scored = cands.map(scoreHRPick);
      let selection = selectHRPicks(scored);
      if (!selection || !Array.isArray(selection.picks)) selection = { picks: [], message: "" };
      setMessage(selection.message || "");

      // Enrich picks, fallback if selector empty
      let picks = selection.picks.length ? selection.picks : scored.slice(0, 24);
      picks = picks.map((p) => {
        const modelProb = (p.p_final ?? p.prob ?? p.p ?? null) ?? computeModelProb(p);
        const modelAmerican = americanFromProb(modelProb);
        const liveAmerican = Number.isFinite(p.oddsAmerican) ? Math.round(p.oddsAmerican) : null;
        let whyParts = [];
        if (liveAmerican != null){
          const mp = probFromAmerican(liveAmerican);
          if (mp != null) whyParts.push(`market implies ${(mp*100).toFixed(1)}% (${fmtAmerican(liveAmerican)})`);
        }
        if (p.barrelRate != null){
          const br = Number(p.barrelRate)*100;
          if (br >= 11) whyParts.push(`barrels ${br.toFixed(1)}%`);
        }
        if (p.iso != null){
          const iso = Number(p.iso);
          if (iso >= 0.240) whyParts.push(`ISO ${iso.toFixed(3)}`);
        }
        if (p.recentHRperPA != null){
          const r = Number(p.recentHRperPA)*100;
          if (r >= 1.5) whyParts.push(`L15 HR/PA ${r.toFixed(1)}%`);
        }
        if (p.starterHR9 != null){
          const s = Number(p.starterHR9);
          if (s >= 1.3) whyParts.push(`opp ${s.toFixed(2)} HR/9`);
        }
        if (p.expPA != null) whyParts.push(`~${p.expPA} PAs`);

        return { ...p, modelProb, modelAmerican, liveAmerican, whyParts };
      });

      // Rank by edge then prob, keep top 12
      picks.forEach(p => {
        const liveP = p.liveAmerican != null ? probFromAmerican(p.liveAmerican) : null;
        p.edge = (liveP != null) ? (p.modelProb - liveP) : null;
      });
      picks.sort((a,b)=> (b.edge??-1) - (a.edge??-1) || (b.modelProb??0) - (a.modelProb??0));
      picks = picks.slice(0, 12);

      const probs = picks.map(p => p.modelProb).filter(x => Number.isFinite(x));
      const avgProb = probs.length ? (100*probs.reduce((a,b)=>a+b,0)/probs.length) : null;
      const liveOddsCount = picks.filter(p => Number.isFinite(p.liveAmerican)).length;
      const liveOddsPct = picks.length ? Math.round(100 * liveOddsCount / picks.length) : 0;
      const rr2 = choose(picks.length, 2);
      const rr3 = choose(picks.length, 3);
      const unitMemo = picks.length ? "Balance across anchors and values" : "";
      const gamesSeen = ctx.games.size || gamesSeenFromCandidates(cands);

      setDiag(d => ({ ...d, source, count: cands.length, games: gamesSeen, picks: picks.length, anchors: 0, avgProb, liveOddsPct, slateDate, rr2, rr3, unitMemo, apiTried: ctx.tried, lateBanner: liveOddsPct < 20 }));

      const ui = picks.map((p) => ({
        name: p.name || "",
        team: p.team || "—",
        game: (p.away && p.home) ? `${p.away}@${p.home}` : (p.game || "—"),
        modelProb: p.modelProb,
        modelAmerican: p.modelAmerican,
        oddsAmerican: p.liveAmerican ?? p.oddsAmerican ?? null,
        why: `${p.name || ""}${p.game ? ` (${p.game})`: ""} — ${p.whyParts.slice(0,4).join(" • ") || "power spot."}`
      }));
      setRows(ui);
    }catch(e){
      setMessage(String(e?.message||e));
      console.error(e);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{ generate(); }, []);

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
        {diag.lateBanner ? <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Markets thin/closing — showing model odds; live prices may be missing</span> : null}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500">No picks yet.</div>
      )}

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
          <Chip ok={true}>Features: market-blend • multi-fallback • fuzzy_match</Chip>
        </div>
      </div>
    </div>
  );
}
