// src/lib/preview_picks.js
function pctFromBase(it){
  const base = Number(it.prob_pp ?? it.hr_prob_pp ?? it.base_prob ?? 3.5);
  return Number.isFinite(base) ? base : 3.5;
}

function extractArray(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.candidates)) return raw.candidates;
  if (Array.isArray(raw.rows)) return raw.rows;
  if (Array.isArray(raw.data)) return raw.data;
  if (raw.result && Array.isArray(raw.result.candidates)) return raw.result.candidates;
  if (raw.payload && Array.isArray(raw.payload.candidates)) return raw.payload.candidates;
  return [];
}

function normalizeCandidates(raw){
  const rows = extractArray(raw);
  const out = [];
  for (const it of rows){
    const rec = it?.player ? it : (it?.props || it?.item || it || {});
    const player = rec.player || rec.name || rec.Player || rec.player_name;
    if (!player) continue;
    const team = rec.team || rec.Team || rec.team_code || "—";
    const opp  = rec.opp  || rec.Opp  || rec.opp_code  || "—";
    const why  = rec.why || rec.reason || [];
    out.push({
      player,
      team,
      opp,
      prob_pp: pctFromBase(rec),
      why: Array.isArray(why) ? why : String(why||"").split(/[.;] ?/).filter(Boolean),
    });
  }
  return out;
}

async function getJSON(url){
  const res = await fetch(url, { headers: { "cache-control":"no-cache", "accept":"application/json" } });
  const status = res.status;
  try {
    if (!res.ok) return { status, data: null, items: 0, nonjson: null };
    const ct = res.headers.get("content-type")||"";
    if (!ct.includes("application/json")){
      const txt = await res.text().catch(()=>"(non-text)");
      return { status, data: null, items: 0, nonjson: txt.slice(0,120) };
    }
    const data = await res.json();
    const items = Array.isArray(data) ? data.length : (Array.isArray(data?.candidates) ? data.candidates.length : 0);
    return { status, data, items, nonjson: null };
  } catch(_e){
    return { status, data: null, items: 0, nonjson: "parse_error" };
  }
}

export async function fetchOddsMap(){
  const endpoints = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
  ];
  for (const url of endpoints){
    const { status, data } = await getJSON(url);
    if (status === 200 && data && Array.isArray(data) && data.length){
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
  }
  return {};
}

async function buildFromProps(endpointsTried){
  const endpoints = [
    "/.netlify/functions/odds-props?league=mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&markets=player_to_hit_a_home_run&regions=us",
    "/.netlify/functions/odds-props?league=mlb&regions=us",
    "/.netlify/functions/odds-props?sport=baseball_mlb&regions=us",
  ];
  for (const url of endpoints){
    const { status, data, items } = await getJSON(url);
    endpointsTried.push({ url, status, items });
    if (status === 200 && data && Array.isArray(data) && data.length){
      const seen = new Map();
      for (const ev of data){
        for (const b of (ev?.bookmakers || [])){
          for (const m of (b?.markets || [])){
            if (!m?.outcomes) continue;
            for (const o of m.outcomes){
              const name = o?.name || o?.player || o?.description;
              if (!name) continue;
              if (!seen.has(name)){
                seen.set(name, {
                  player: name,
                  team: "—",
                  opp: "—",
                  prob_pp: 3.5,
                  why: ["odds_fallback"],
                });
              }
            }
          }
        }
      }
      return Array.from(seen.values());
    }
  }
  return [];
}

export async function buildPreviewPicksWithDiag(){
  const endpointsTried = [];
  const notes = [];

  // Model function first
  {
    const url = "/.netlify/functions/odds-mlb-hr";
    const { status, data } = await getJSON(url);
    const cands = normalizeCandidates(data);
    endpointsTried.push({ url, status, items: cands.length });
    if (status === 200 && cands.length){
      cands.sort((a,b)=> b.prob_pp - a.prob_pp);
      return { picks: cands.slice(0, 12), endpointsTried, notes };
    }
    if (status !== 200) notes.push(`Model endpoint ${status}`);
  }

  // Fallback to props
  const propCands = await buildFromProps(endpointsTried);
  if (propCands.length){
    propCands.sort((a,b)=> b.prob_pp - a.prob_pp);
    notes.push("Using odds fallback (markets thin/closing).");
    return { picks: propCands.slice(0, 12), endpointsTried, notes };
  }

  notes.push("No live markets available right now.");
  return { picks: [], endpointsTried, notes };
}
