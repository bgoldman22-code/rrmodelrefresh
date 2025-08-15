import { getStore } from "@netlify/blobs";
function ok(data){ return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" }}); }
export default async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days")||"60", 10)));
  const models = [
    { key:"mlb_hr",        label:"MLB HR",        store:["mlb-learning","mlb_hr-learning"],        func:["mlb-learner-v2","mlb-daily-learn"] },
    { key:"mlb_hits2",     label:"MLB 2+ Hits",   store:["hits-learning","mlb_hits2-learning"],    func:["hits-daily-learn"] },
    { key:"mlb_sb",        label:"MLB Stolen Base", store:["sb-learning","mlb_sb-learning"],       func:["sb-daily-learn"] },
    { key:"nfl_td",        label:"NFL Anytime TD", store:["nfl-learning","nfl_td-learning"],       func:["nfl-daily-learn"] },
    { key:"soccer_ags",    label:"Soccer AGS",    store:["soccer-learning","soccer_ags-learning"], func:["soccer-daily-learn"] },
  ];

  const picksStore = getStore("picks-log");

  async function readJSON(storeNames, key){
    for(const name of storeNames){
      try{
        const s = getStore(name);
        const j = await s.get(key, { type:"json" });
        if(j!=null) return { store:name, json:j };
      }catch(e){}
    }
    return null;
  }

  async function funcReachable(names){
    for(const nm of names){
      try{
        const r = await fetch(`${origin}/.netlify/functions/${nm}?dry=1`);
        if(r.status === 404) continue;
        if(!r.ok) return { reachable:false, code:r.status, name:nm };
        const j = await r.json().catch(()=> ({}));
        return { reachable:true, body:j, name:nm };
      }catch(e){ return { reachable:false, error:String(e?.message||e), name:nm }; }
    }
    return { reachable:false, code:404 };
  }

  const out = { ok:true, date, days, models: {} };
  for(const m of models){
    const item = { label:m.label, status:"yellow", picksToday:false, lastRun:null, samples:0, daysLearned:0, func:{} };
    try{
      const pk = `${m.key}/${date}.json`;
      const arr = await picksStore.get(pk, { type:"json" });
      item.picksToday = Array.isArray(arr) && arr.length > 0;
    }catch(_){}

    const summary = await readJSON(m.store, "summary.json");
    if(summary?.json){
      const s = summary.json;
      item.samples     = Number(s.samples || s.totalSamples || 0);
      item.daysLearned = Number(s.days || s.uniqueDays || 0);
      item.lastRun     = s.lastRun || s.updatedAt || null;
    }

    item.func = await funcReachable(m.func);

    const greenIf = (item.samples>0 || item.daysLearned>0 || item.picksToday || item.func.reachable);
    if(greenIf) item.status = "green";

    out.models[m.key] = item;
  }
  return ok(out);
};