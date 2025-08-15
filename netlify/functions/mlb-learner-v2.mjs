/**
 * MLB learner v2 — enhanced
 * Adds:
 *  - league/pitchTypes.json and league/zoneBuckets.json aggregates
 *  - indexes/batters.json and indexes/pitchers.json (unique IDs + counts)
 *  - summary.json now includes: batters, pitchers, leaguePitchSamples, leagueZoneSamples
 *
 * Safe: never 5xx. Errors returned with 200 and ok:false.
 */
function fmtET(d=new Date()){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}
function yesterdayET(){
  const now = new Date();
  const etStr = fmtET(now);
  const d = new Date(etStr+"T00:00:00Z"); // we only care about the ET date string
  d.setUTCDate(d.getUTCDate()-1);
  return fmtET(d);
}
async function getStoreSafe(name){
  try{
    const mod = await import("@netlify/blobs");
    if(mod?.getStore) return mod.getStore(name);
  }catch(_){}
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
function get(obj, path, def=null){
  try{ return path.split(".").reduce((a,k)=> (a && a[k]!==undefined) ? a[k] : undefined, obj) ?? def; }catch(_){ return def; }
}
function pickFinalPitch(play){
  const evs = Array.isArray(play?.playEvents) ? play.playEvents : [];
  for(let i=evs.length-1;i>=0;i--){
    const ev = evs[i];
    if(ev?.isPitch || (ev?.details && ev?.details?.isPitch)) return ev;
  }
  return null;
}
function zoneBucketOf(px, pz){
  if(typeof px!=="number" || typeof pz!=="number") return "UNK";
  const col = px < -0.4 ? "L" : (px > 0.4 ? "R" : "C");
  const row = pz < 2.0 ? "Lo" : (pz > 3.5 ? "Hi" : "Md");
  return row+col; // e.g., "MdC"
}
function addCount(map, key, by=1){
  if(!key) return;
  map[key] = (map[key]||0) + by;
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry")==="1";
    const date = url.searchParams.get("date") || yesterdayET();
    const store = await getStoreSafe("mlb-learning");

    if(dry){
      return new Response(JSON.stringify({ ok:true, dry:true, date, note:"scan HR plays; update league + profiles" }), { headers:{ "content-type":"application/json" } });
    }

    // 1) Schedule
    const sched = await fetchJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
    const games = (sched?.dates?.[0]?.games||[]).map(g => ({ id:g.gamePk }));

    // Load aggregates
    const leaguePitch = await store.get("league/pitchTypes.json", { type:"json" }) || { samples:0, hr:0, byType:{} };
    const leagueZone  = await store.get("league/zoneBuckets.json", { type:"json" }) || { samples:0, hr:0, byBucket:{} };
    const idxBat = await store.get("indexes/batters.json", { type:"json" }) || { ids:[], count:0 };
    const idxPit = await store.get("indexes/pitchers.json", { type:"json" }) || { ids:[], count:0 };
    const batSet = new Set(idxBat.ids||[]);
    const pitSet = new Set(idxPit.ids||[]);

    const hrEvents = [];
    for(const g of games){
      try{
        const feed = await fetchJSON(`https://statsapi.mlb.com/api/v1.1/game/${g.id}/feed/live`);
        const plays = get(feed, "liveData.plays.allPlays", []);
        for(const p of plays){
          if(get(p,"result.eventType","") !== "home_run") continue;
          const batterId = get(p, "matchup.batter.id", null);
          const batterName = get(p, "matchup.batter.fullName", get(p, "matchup.batter.name", "Unknown Batter"));
          const pitcherId = get(p, "matchup.pitcher.id", null);
          const pitcherName = get(p, "matchup.pitcher.fullName", get(p, "matchup.pitcher.name", "Unknown Pitcher"));
          const inning = get(p, "about.inning", null);
          const half = get(p, "about.halfInning", "");
          const pitch = pickFinalPitch(p);
          const pitchType = get(pitch, "details.type.code", get(pitch,"details.type.description","UNK"));
          const px = Number(get(pitch, "pitchData.coordinates.pX", NaN));
          const pz = Number(get(pitch, "pitchData.coordinates.pZ", NaN));
          const bucket = zoneBucketOf(px, pz);

          // Save event
          hrEvents.push({ gamePk:g.id, inning, half,
                          batter:{ id:batterId, name:batterName },
                          pitcher:{ id:pitcherId, name:pitcherName },
                          pitch:{ type:pitchType }, zone:{ bucket } });

          // Update league aggregates (per-HR)
          leaguePitch.samples += 1; leaguePitch.hr += 1; addCount(leaguePitch.byType, String(pitchType||"UNK"), 1);
          leagueZone.samples  += 1; leagueZone.hr  += 1; addCount(leagueZone.byBucket, String(bucket||"UNK"), 1);

          // Update indexes
          if(batterId!=null) batSet.add(batterId);
          if(pitcherId!=null) pitSet.add(pitcherId);

          // Update profiles (minimal)
          if(batterId!=null){
            const key = `profiles/batter/${batterId}.json`;
            const prof = await store.get(key, { type:"json" }) || { id:batterId, name:batterName, samples:0, hr:0, vsPitchType:{}, zoneBucket:{}, lastUpdated:null };
            prof.samples += 1; prof.hr += 1; addCount(prof.vsPitchType, String(pitchType||"UNK"), 1); addCount(prof.zoneBucket, String(bucket||"UNK"), 1);
            prof.lastUpdated = new Date().toISOString();
            await store.setJSON(key, prof);
          }
          if(pitcherId!=null){
            const key = `profiles/pitcher/${pitcherId}.json`;
            const prof = await store.get(key, { type:"json" }) || { id:pitcherId, name:pitcherName, samples:0, hr:0, vsPitchType:{}, zoneBucket:{}, lastUpdated:null };
            prof.samples += 1; prof.hr += 1; addCount(prof.vsPitchType, String(pitchType||"UNK"), 1); addCount(prof.zoneBucket, String(bucket||"UNK"), 1);
            prof.lastUpdated = new Date().toISOString();
            await store.setJSON(key, prof);
          }
        }
      }catch(_e){ /* ignore single game failures */ }
    }

    // Persist day events
    await store.setJSON(`hr/${date}.json`, hrEvents);

    // Persist league aggregates + indexes
    idxBat.ids = Array.from(batSet); idxBat.count = idxBat.ids.length;
    idxPit.ids = Array.from(pitSet); idxPit.count = idxPit.ids.length;
    await store.setJSON("league/pitchTypes.json", leaguePitch);
    await store.setJSON("league/zoneBuckets.json", leagueZone);
    await store.setJSON("indexes/batters.json", idxBat);
    await store.setJSON("indexes/pitchers.json", idxPit);

    // Update summary
    const summaryKey = "summary.json";
    const prev = await store.get(summaryKey, { type:"json" }) || { daysList:[], samples:0, batters:0, pitchers:0, leaguePitchSamples:0, leagueZoneSamples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok: true,
      date,
      days: set.size,
      daysList: Array.from(set),
      samples: (Number(prev.samples)||0) + hrEvents.length,
      batters: idxBat.count,
      pitchers: idxPit.count,
      leaguePitchSamples: leaguePitch.samples,
      leagueZoneSamples: leagueZone.samples,
      lastRun: new Date().toISOString(),
      capturedHR: hrEvents.length
    };
    await store.setJSON(summaryKey, out);

    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" } });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" } });
  }
};
