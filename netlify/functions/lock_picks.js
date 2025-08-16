// netlify/functions/lock_picks.js
// Fallback "lock picks" implementation that does NOT depend on internal server modules.
// - Pulls current candidates from /.netlify/functions/odds-mlb-hr
// - Normalizes to the locked picks schema
// - Writes to /picks/YYYY-MM-DD.json via Netlify Blobs
// Safe to keep: when you later wire the real buildTodaySlate, just replace the body.

import { getStore } from "@netlify/blobs";

function todayYYYYMMDD(){
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toAmericanFromPct(pp){
  const p = Math.min(99.999, Math.max(0.001, Number(pp||0))) / 100;
  if (p >= 0.5) return -Math.round(100 * p / (1-p));
  return `+${Math.round(100 * (1-p) / p)}`;
}

async function getJSON(url){
  const res = await fetch(url, { headers: { "cache-control":"no-cache" }});
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = res.headers.get("content-type")||"";
  if (!ct.includes("application/json")) throw new Error(`Non-JSON from ${url}`);
  return res.json();
}

function normalizeCandidates(raw){
  const out = [];
  if (!raw) return out;
  const arr = Array.isArray(raw) ? raw : (raw?.candidates || raw?.rows || []);
  for (const it of arr){
    const player = it.player || it.name || it.Player || it.player_name;
    if (!player) continue;
    const team = it.team || it.Team || it.team_code || "—";
    const opp  = it.opp  || it.Opp  || it.opp_code  || "—";
    const prob = Number(it.prob_pp ?? it.hr_prob_pp ?? 3.5);
    const why  = it.why || it.reason || [];
    // game id placeholders; replace later when schedule feed is wired
    const game_id = `${todayYYYYMMDD()}-${team}-${opp}-1`;
    const game_start_et = "—";
    out.push({
      player_id: player.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
      player, team, opp,
      game_id, game_start_et,
      prob_pp: prob,
      why: Array.isArray(why) ? why : String(why||"").split(/[.;] ?/).filter(Boolean),
      status_notes: []
    });
  }
  return out;
}

export async function handler(event){
  try{
    const date = todayYYYYMMDD();

    // 1) Fetch model candidates
    const raw = await getJSON(`${process.env.URL || ""}/.netlify/functions/odds-mlb-hr`).catch(async ()=>{
      // Try relative when local
      return await getJSON("/.netlify/functions/odds-mlb-hr");
    });
    const cands = normalizeCandidates(raw);

    // 2) Rank & cap
    cands.sort((a,b)=> b.prob_pp - a.prob_pp);
    const picks = cands.slice(0, 24); // lock more than 12; UI can show top 12

    // 3) Compose header
    const payload = {
      date,
      locked_at_et: "11:00",
      model_version: "fallback-lock-1.0.0",
      code_sha: "fallback",
      picks
    };

    // 4) Write to Blobs: /picks/YYYY-MM-DD.json
    const store = getStore();
    await store.setJSON(`picks/${date}.json`, payload, { addRandomSuffix: false, contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: picks.length }) };
  }catch(e){
    return { statusCode: 500, body: `lock_picks error: ${e?.message || e}` };
  }
}
