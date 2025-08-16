// netlify/functions/lock_picks.js
// Robust lock function: constructs absolute URL from request headers, fetches candidates,
// normalizes, and writes /picks/YYYY-MM-DD.json to Netlify Blobs.
//
// NOTE: This is a safe fallback that doesn't depend on repo-internal server modules.
// Replace later with your full buildTodaySlate when ready.

import { getStore } from "@netlify/blobs";

/** Format YYYY-MM-DD in UTC */
function todayYYYYMMDD(){
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function absoluteBaseFromEvent(event){
  // Prefer Netlify-provided URL; else reconstruct from headers
  const envURL = process.env.URL;
  if (envURL && /^https?:\/\//.test(envURL)) return envURL.replace(/\/+$/,"");
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  const host  = event?.headers?.host || event?.headers?.Host;
  if (!host) return ""; // last resort: empty → fetch will fail and we handle it
  return `${proto}://${host}`;
}

async function getJSONAbs(base, path){
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: { "cache-control":"no-cache", "accept":"application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = res.headers.get("content-type")||"";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(()=>"(non-text)");
    throw new Error(`Non-JSON from ${url}: ${txt.slice(0,120)}`);
  }
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
    const game_id = `${todayYYYYMMDD()}-${team}-${opp}-1`;
    const game_start_et = it.game_start_et || "—";
    out.push({
      player_id: player.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
      player, team, opp,
      game_id, game_start_et,
      prob_pp: Number.isFinite(prob) ? prob : 3.5,
      why: Array.isArray(why) ? why : String(why||"").split(/[.;] ?/).filter(Boolean),
      status_notes: []
    });
  }
  return out;
}

export async function handler(event){
  const debug = [];
  try{
    const date = todayYYYYMMDD();
    const base = absoluteBaseFromEvent(event);
    debug.push({ step: "base_url", base });

    // 1) Fetch model candidates via absolute URL
    const path = "/.netlify/functions/odds-mlb-hr";
    const raw = await getJSONAbs(base, path);
    debug.push({ step: "fetched_candidates", ok: true });

    const cands = normalizeCandidates(raw);
    debug.push({ step: "normalized", count: cands.length });

    // 2) Rank & cap (keep 24 for headroom)
    cands.sort((a,b)=> b.prob_pp - a.prob_pp);
    const picks = cands.slice(0, 24);

    // 3) Compose locked payload
    const payload = {
      date,
      locked_at_et: "11:00",
      model_version: "fallback-lock-1.0.1",
      code_sha: "fallback",
      picks
    };

    // 4) Write to Blobs (no random suffix)
    const store = getStore();
    await store.setJSON(`picks/${date}.json`, payload, { addRandomSuffix: false, contentType: "application/json" });
    debug.push({ step: "blob_written", key: `picks/${date}.json`, picks: picks.length });

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: picks.length, debug }) };
  }catch(e){
    // Return debug to help you see where it failed
    debug.push({ step: "error", message: e?.message || String(e) });
    return { statusCode: 500, body: JSON.stringify({ ok:false, debug }) };
  }
}
