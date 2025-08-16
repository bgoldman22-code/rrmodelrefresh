// netlify/functions/lock_picks.js
import { storagePutJson } from "../../src/server/storage.js";
import { getCodeSha, getModelVersion } from "../../src/server/meta.js";

function clean(s){ return (s==null? "" : String(s).replace(/\s+/g,' ').trim()); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function probFromAmerican(amer){
  if (amer == null || !Number.isFinite(+amer) || +amer === 0) return null;
  const a = +amer;
  if (a > 0) return 100/(a+100);
  return -a/(-a+100);
}
function americanFromProb(p){
  const x = clamp(Number(p)||0, 1e-6, 0.999999);
  if (x >= 0.5) return -Math.round(100 * x / (1-x));
  return Math.round(100 * (1-x) / x);
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
      game,
      eventId: obj.eventId || obj.event_id || obj.id || obj.gameId || obj.gamePk,
      oddsAmerican,
      iso: obj.iso ?? obj.ISO ?? obj.seasonISO ?? obj.season_iso ?? null,
      barrelRate: obj.barrelRate ?? obj.barrel_rate ?? obj.brls_pa ?? obj.barrels_per_pa ?? null,
      recentHRperPA: obj.recentHRperPA ?? obj.hr_per_pa_l15 ?? obj.l15_hr_pa ?? null,
      starterHR9: obj.starterHR9 ?? obj.pitcherHR9 ?? obj.oppStarterHR9 ?? null,
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
function featureBumps(p){
  let bump = 0.0;
  if (p.iso != null) bump += clamp((Number(p.iso)-0.160)*0.20, -0.01, 0.04);
  if (p.barrelRate != null) bump += clamp((Number(p.barrelRate)-0.07)*0.35, -0.01, 0.05);
  if (p.recentHRperPA != null) bump += clamp(Number(p.recentHRperPA)*0.6, 0, 0.05);
  if (p.starterHR9 != null) bump += clamp((Number(p.starterHR9)-1.0)*0.015, -0.015, 0.03);
  return bump;
}
function computeModelProb(p){
  let prior = 0.035 + featureBumps(p);
  prior = clamp(prior, 0.01, 0.22);
  const liveA = (p.oddsAmerican!=null)? Number(p.oddsAmerican) : null;
  if (liveA != null){
    const market = probFromAmerican(liveA);
    if (market != null){
      let blend = 0.7*market + 0.3*prior;
      blend = clamp(blend, 0.01, 0.30);
      return blend;
    }
  }
  return prior;
}
function etDateString(d = new Date()){
  // Approximate ET by UTC-4 (DST); acceptable for file naming
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const et = new Date(utc.getTime() - 4*60*60*1000);
  const y = et.getUTCFullYear();
  const m = String(et.getUTCMonth()+1).padStart(2,'0');
  const day = String(et.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

export async function handler(){
  try{
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const r = await fetch(`${base}/.netlify/functions/odds-mlb-hr`);
    if (!r.ok) throw new Error(`odds-mlb-hr ${r.status}`);
    const json = await r.json();
    const cands = normalizeCandidates(json);

    const scored = cands.map(c => ({
      ...c,
      modelProb: computeModelProb(c),
    }));

    const filtered = scored.filter(s => s.name);
    filtered.sort((a,b)=> (b.modelProb - a.modelProb));
    const picks = filtered.slice(0, 24).map(p => ({
      player_id: p.id || `mlb|${p.name}`,
      player: p.name,
      team: p.team || "—",
      opp: p.game?.includes("@") ? p.game.split("@")[0] : "—",
      game_id: p.eventId || (p.game || ""),
      game_start_et: "",
      prob_pp: Math.round(p.modelProb*1000)/10,
      why: buildWhy(p),
      status_notes: []
    }));

    const payload = {
      date: etDateString(new Date()),
      locked_at_et: "11:00",
      model_version: await getModelVersion(),
      code_sha: await getCodeSha(),
      picks
    };

    await storagePutJson(`picks/${payload.date}.json`, payload);
    return { statusCode: 200, body: JSON.stringify({ ok:true, count: picks.length, date: payload.date }) };
  }catch(e){
    return { statusCode: 500, body: `lock_picks error: ${e?.message || e}` };
  }
}

function buildWhy(p){
  const out = [];
  if (p.barrelRate!=null && Number(p.barrelRate)>=0.11) out.push("barrel_pop");
  if (p.iso!=null && Number(p.iso)>=0.240) out.push("extra_base_power");
  if (p.recentHRperPA!=null && Number(p.recentHRperPA)>=0.015) out.push("recent_pop");
  if (p.starterHR9!=null && Number(p.starterHR9)>=1.3) out.push("opp_hr9_flag");
  if (out.length===0) out.push("baseline_form");
  return out;
}
