/**
 * Safe MLB learner v2
 * - Defaults to yesterday (ET) unless ?date=YYYY-MM-DD provided
 * - Fetches MLB schedule, then each game's live feed
 * - Extracts HOME RUN plays, attributes batter/pitcher (ids, names), inning, team, and
 *   attempts to capture final pitch type + speed and approximate zone (if present)
 * - Aggregates into Netlify Blobs store "mlb-learning":
 *      - summary.json            → lastRun, days, samples (#HR events), daysList[]
 *      - hr/DATE.json            → array of HR events captured that day
 *      - profiles/batter/ID.json → cumulative per-batter stats
 *      - profiles/pitcher/ID.json→ cumulative per-pitcher stats
 * - Never returns 5xx. Any internal error returns { ok:false, error } with 200.
 */
function fmtET(d=new Date()){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}
function yesterdayET(){
  const now = new Date();
  // Shift to ET midnight
  const etNowStr = fmtET(now);
  const d = new Date(etNowStr+"T00:00:00Z"); // not exact ET, but date string is sufficient
  d.setUTCDate(d.getUTCDate()-1);
  return fmtET(d);
}
async function getStoreSafe(name){
  try{
    const mod = await import("@netlify/blobs");
    if(mod?.getStore) return mod.getStore(name);
  }catch(_){}
  // in-memory fallback
  const mem = new Map();
  return {
    async get(key, { type }={}){
      const v = mem.get(key);
      if(type==="json" && typeof v === "string"){
        try{ return JSON.parse(v); }catch(_){ return null; }
      }
      return v ?? null;
    },
    async setJSON(key, obj){ mem.set(key, JSON.stringify(obj)); },
    async set(key, val){ mem.set(key, val); },
  };
}
async function fetchJSON(url, init){
  const r = await fetch(url, { ...init, redirect:"follow" });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
function pickFinalPitch(play){
  // Find last pitch event in playEvents
  const evs = Array.isArray(play?.playEvents)? play.playEvents : [];
  for(let i=evs.length-1;i>=0;i--){
    const ev = evs[i];
    if(ev?.isPitch || (ev?.details && ev?.details?.isPitch)) return ev;
  }
  return null;
}
function get(obj, path, def=null){
  try{
    return path.split(".").reduce((a,k)=> (a && a[k]!==undefined) ? a[k] : undefined, obj) ?? def;
  }catch(_){ return def; }
}
function addCount(map, key, by=1){
  if(!key) return;
  map[key] = (map[key]||0) + by;
}
function blankProfile(id, name){
  return { id, name, days:0, samples:0, hr:0, vsPitchType:{}, zoneBucket:{}, lastUpdated:null };
}
function zoneBucketOf(px, pz){
  if(typeof px!=="number" || typeof pz!=="number") return null;
  const col = px < -0.4 ? "L" : (px > 0.4 ? "R" : "C");
  const row = pz < 2.0 ? "Lo" : (pz > 3.5 ? "Hi" : "Md");
  return row+col; // e.g., "MdC"
}
export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry")==="1";
    const date = url.searchParams.get("date") || yesterdayET();
    const store = await getStoreSafe("mlb-learning");

    if(dry){
      return new Response(JSON.stringify({ ok:true, dry:true, date, note:"would scan schedule and HR plays" }), { headers:{ "content-type":"application/json" } });
    }

    // 1) Schedule
    const sched = await fetchJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
    const games = (sched?.dates?.[0]?.games||[]).map(g => ({ id:g.gamePk, teams:g.teams }));

    const hrEvents = [];
    for(const g of games){
      try{
        const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${g.id}/feed/live`);
        const plays = get(feed, "liveData.plays.allPlays", []);
        for(const p of plays){
          const type = get(p, "result.eventType", "");
          if(type !== "home_run") continue;
          const batterId = get(p, "matchup.batter.id", null);
          const batterName = get(p, "matchup.batter.fullName", get(p, "matchup.batter.name", "Unknown Batter"));
          const pitcherId = get(p, "matchup.pitcher.id", null);
          const pitcherName = get(p, "matchup.pitcher.fullName", get(p, "matchup.pitcher.name", "Unknown Pitcher"));
          const inning = get(p, "about.inning", null);
          const half = get(p, "about.halfInning", "");
          const desc = get(p, "result.description", "");
          const teamBat = get(p, "team.id", null) || get(p,"about.isTopInning", false) ? get(feed,"gameData.teams.away.id",null) : get(feed,"gameData.teams.home.id",null);
          // Final pitch
          const pitch = pickFinalPitch(p);
          const pitchType = get(pitch, "details.type.code", null);
          const pitchName = get(pitch, "details.type.description", null);
          const velo = get(pitch, "pitchData.startSpeed", null);
          const px = get(pitch, "pitchData.coordinates.pX", null);
          const pz = get(pitch, "pitchData.coordinates.pZ", null);
          const zBucket = zoneBucketOf(px, pz);

          hrEvents.push({
            gamePk:g.id, inning, half,
            batter:{ id:batterId, name:batterName },
            pitcher:{ id:pitcherId, name:pitcherName },
            pitch:{ type:pitchType, name:pitchName, velo },
            zone: { px, pz, bucket:zBucket },
            desc
          });
        }
      }catch(e){
        // ignore this game's failures
      }
    }

    // 2) Persist day HRs
    await store.setJSON(`hr/${date}.json`, hrEvents);

    // 3) Update profiles
    const batterHit = new Map(); // id -> count in this day
    const pitcherAllowed = new Map();
    for(const ev of hrEvents){
      if(ev?.batter?.id) batterHit.set(ev.batter.id, (batterHit.get(ev.batter.id)||0)+1);
      if(ev?.pitcher?.id) pitcherAllowed.set(ev.pitcher.id, (pitcherAllowed.get(ev.pitcher.id)||0)+1);
      // Update detailed profiles
      // Batters
      if(ev?.batter?.id){
        const key = `profiles/batter/${ev.batter.id}.json`;
        let prof = await store.get(key, { type:"json" }) || blankProfile(ev.batter.id, ev.batter.name);
        prof.samples += 1;
        prof.hr += 1;
        addCount(prof.vsPitchType, ev?.pitch?.type || ev?.pitch?.name || "UNK", 1);
        addCount(prof.zoneBucket, ev?.zone?.bucket || "UNK", 1);
        prof.lastUpdated = new Date().toISOString();
        await store.setJSON(key, prof);
      }
      // Pitchers
      if(ev?.pitcher?.id){
        const key = `profiles/pitcher/${ev.pitcher.id}.json`;
        let prof = await store.get(key, { type:"json" }) || blankProfile(ev.pitcher.id, ev.pitcher.name);
        prof.samples += 1;
        prof.hr = (prof.hr||0) + 1; // hr allowed
        addCount(prof.vsPitchType, ev?.pitch?.type || ev?.pitch?.name || "UNK", 1);
        addCount(prof.zoneBucket, ev?.zone?.bucket || "UNK", 1);
        prof.lastUpdated = new Date().toISOString();
        await store.setJSON(key, prof);
      }
    }

    // 4) Update summary
    const summaryKey = "summary.json";
    const prev = await store.get(summaryKey, { type:"json" }) || { daysList:[], samples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok: true,
      date,
      games: games.length,
      samples: (Number(prev.samples)||0) + hrEvents.length,
      days: set.size,
      daysList: Array.from(set),
      lastRun: new Date().toISOString(),
      capturedHR: hrEvents.length
    };
    await store.setJSON(summaryKey, out);

    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" } });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" } });
  }
};
