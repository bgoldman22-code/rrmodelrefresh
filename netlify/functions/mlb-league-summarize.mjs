/**
 * Recompute league aggregates from all learned days.
 * Uses summary.daysList to iterate dates and rebuilds:
 *  - league/pitchTypes.json
 *  - league/zoneBuckets.json
 *  - indexes/batters.json
 *  - indexes/pitchers.json
 * Also updates summary.json fields: batters, pitchers, leaguePitchSamples, leagueZoneSamples
 */
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
  };
}
function add(map, k, by=1){ map[k] = (map[k]||0)+by; }

export default async (req) => {
  try{
    const store = await getStoreSafe("mlb-learning");
    const summary = await store.get("summary.json", { type:"json" }) || { daysList:[] };

    const byType = {}, byBucket = {};
    let pitchSamples = 0, zoneSamples = 0;
    const batSet = new Set(), pitSet = new Set();

    const days = Array.isArray(summary.daysList) ? summary.daysList : [];
    for(const d of days){
      const arr = await store.get(`hr/${d}.json`, { type:"json" }) || [];
      for(const ev of arr){
        const pt = String(ev?.pitch?.type || "UNK");
        const zb = String(ev?.zone?.bucket || "UNK");
        add(byType, pt, 1); add(byBucket, zb, 1);
        pitchSamples += 1; zoneSamples += 1;
        if(ev?.batter?.id!=null) batSet.add(ev.batter.id);
        if(ev?.pitcher?.id!=null) pitSet.add(ev.pitcher.id);
      }
    }

    await store.setJSON("league/pitchTypes.json", { samples:pitchSamples, hr:pitchSamples, byType });
    await store.setJSON("league/zoneBuckets.json", { samples:zoneSamples, hr:zoneSamples, byBucket });
    await store.setJSON("indexes/batters.json", { ids:Array.from(batSet), count:batSet.size });
    await store.setJSON("indexes/pitchers.json", { ids:Array.from(pitSet), count:pitSet.size });

    const prev = summary || {};
    const out = {
      ...prev,
      batters: batSet.size,
      pitchers: pitSet.size,
      leaguePitchSamples: pitchSamples,
      leagueZoneSamples: zoneSamples,
      lastRun: new Date().toISOString(),
      ok: true,
      recomputed: true
    };
    await store.setJSON("summary.json", out);

    return new Response(JSON.stringify({ ok:true, days:days.length, pitchSamples, zoneSamples, batters:batSet.size, pitchers:pitSet.size }), { headers:{ "content-type":"application/json" } });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" } });
  }
};
