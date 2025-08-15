export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || etDate();
    const store = await getStoreSafe("soccer-learning");

    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, date }), { headers:{ "content-type":"application/json" } });

    const prev = await store.get("summary.json", { type:"json" }) || { daysList:[], samples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok:true,
      date,
      samples:(Number(prev.samples)||0)+1,
      days:set.size,
      daysList:Array.from(set),
      lastRun:new Date().toISOString(),
      note:"soccer learner proof-of-life"
    };
    await store.setJSON("summary.json", out);
    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" } });
  }catch(e){
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
