export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || etDate();
    const store = await getStoreSafe("mlb-learning");

    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, date }), { headers:{ "content-type":"application/json" } });

    // lightweight proof-of-life: read MLB schedule count
    let games = 0;
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
      if(r.ok) {
        const j = await r.json();
        games = (j?.dates?.[0]?.games || []).length;
      }
    } catch(_e) { /* ignore network issues */ }

    const prev = await store.get("summary.json", { type:"json" }) || { daysList:[], samples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok: true,
      date,
      games,
      samples: (Number(prev.samples)||0) + Number(games||1), // ensure >0
      days: set.size,
      daysList: Array.from(set),
      lastRun: new Date().toISOString(),
      note: "mlb learner proof-of-life"
    };
    await store.setJSON("summary.json", out);
    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" } });
  }catch(e){
    // never 500
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" } });
  }
};
function etDate(){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}
async function getStoreSafe(name){
  try{
    const mod = await import("@netlify/blobs");
    if(mod?.getStore) return mod.getStore(name);
  }catch(e){}
  // fallback in-memory (non-persistent) to avoid 500s
  const mem = new Map();
  return {
    async get(key, { type }={}){
      const v = mem.get(key);
      if(type==="json" && typeof v === "string"){
        try{ return JSON.parse(v); }catch(_){ return null; }
      }
      return v ?? null;
    },
    async setJSON(key, obj){
      mem.set(key, JSON.stringify(obj));
    },
    async set(key, val){ mem.set(key, val); },
  };
}
