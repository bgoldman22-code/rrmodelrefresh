// src/lib/preview_picks.js
// Small, safe helpers for Preview mode only (no writes).

function pctFromBase(it){
  // default baseline if missing (until your model fields arrive)
  const base = Number(it.prob_pp ?? it.hr_prob_pp ?? 3.5);
  return Number.isFinite(base) ? base : 3.5;
}

function normalizeCandidates(raw){
  const rows = Array.isArray(raw) ? raw : (raw?.candidates || raw?.rows || []);
  const out = [];
  for (const it of rows){
    const player = it.player || it.name || it.Player || it.player_name;
    if (!player) continue;
    const team = it.team || it.Team || it.team_code || "—";
    const opp  = it.opp  || it.Opp  || it.opp_code  || "—";
    const why  = it.why || it.reason || [];
    out.push({
      player,
      team,
      opp,
      prob_pp: pctFromBase(it),
      why: Array.isArray(why) ? why : String(why||"").split(/[.;] ?/).filter(Boolean),
    });
  }
  return out;
}

async function getJSON(url){
  const res = await fetch(url, { headers: { "cache-control":"no-cache", "accept":"application/json" } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`${res.status} ${url}`);
  }
  const ct = res.headers.get("content-type")||"";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(()=>"(non-text)");
    throw new Error(`Non-JSON from ${url}: ${txt.slice(0,120)}`);
  }
  return res.json();
}

export async function fetchOddsMap(){
  const endpoints = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
  ];
  for (const url of endpoints){
    try{
      const data = await getJSON(url);
      if (data && Array.isArray(data) && data.length){
        // Expect odds shape from your function; collapse to {playerName: "+480"}
        const map = {};
        for (const ev of data){
          for (const b of (ev?.bookmakers || [])){
            for (const m of (b?.markets || [])){
              if (!m?.outcomes) continue;
              for (const o of m.outcomes){
                const name = o?.name || o?.player || o?.description;
                const price = o?.price ?? o?.odds ?? o?.american;
                if (!name || price == null) continue;
                if (!map[name]) map[name] = String(price);
              }
            }
          }
        }
        return map;
      }
    }catch(_e){ /* try next */ }
  }
  return {};
}

export async function buildPreviewPicks(){
  const main = await getJSON("/.netlify/functions/odds-mlb-hr");
  const cands = normalizeCandidates(main);
  cands.sort((a,b)=> b.prob_pp - a.prob_pp);
  return cands.slice(0, 12);
}
