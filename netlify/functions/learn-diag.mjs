/**
 * learn-diag (dual shape, multi-model)
 * Returns BOTH:
 *   1) { ok, date, models: { mlb_hr: {...}, ... } }
 *   2) flattened legacy keys at top level: { mlb_hr: {...}, mlb_hits2: {...}, ... }
 * so any UI reading either shape will work.
 *
 * Safe: never 5xx. If something is missing, returns sensible defaults.
 */
import { getStore } from "@netlify/blobs";

function ok(data){ return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" }}); }
function fmtET(d=new Date()){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const origin = url.origin;
    const date = fmtET();

    const MODELS = [
      { key:"mlb_hr",     label:"MLB HR",          stores:["mlb-learning","mlb_hr-learning"], funcs:["mlb-learner-v2","mlb-daily-learn"] },
      { key:"mlb_hits2",  label:"MLB 2+ Hits",     stores:["hits-learning","mlb_hits2-learning"], funcs:["hits-learner-v2","hits-daily-learn"] },
      { key:"mlb_sb",     label:"MLB Stolen Base", stores:["sb-learning","mlb_sb-learning"], funcs:["sb-learner-v2","sb-daily-learn"] },
      { key:"nfl_td",     label:"NFL Anytime TD",  stores:["nfl-learning","nfl_td-learning"], funcs:["nfl-learner-v2","nfl-daily-learn"] },
      { key:"soccer_ags", label:"Soccer AGS",      stores:["soccer-learning","soccer_ags-learning"], funcs:["soccer-learner-v2","soccer-daily-learn"] },
    ];

    const picksStore = getStore("picks-log");

    async function readFirstJSON(stores, key){
      for(const nm of stores){
        try{
          const s = getStore(nm);
          const j = await s.get(key, { type:"json" });
          if(j!=null) return { store:nm, json:j };
        }catch(_){}
      }
      return null;
    }

    async function funcReachable(funcs){
      for(const fn of funcs){
        try{
          const r = await fetch(`${origin}/.netlify/functions/${fn}?dry=1`);
          if(r.status === 404) continue;
          if(!r.ok) return { reachable:false, code:r.status, name:fn };
          const j = await r.json().catch(()=> ({}));
          return { reachable:true, body:j, name:fn };
        }catch(e){
          return { reachable:false, error:String(e?.message||e), name:fn };
        }
      }
      return { reachable:false, code:404 };
    }

    const models = {};
    const legacy = {};
    for(const M of MODELS){
      const item = {
        label: M.label,
        status: "yellow",
        picksToday: false,
        lastRun: null,
        samples: 0,
        daysLearned: 0,
        func: { reachable:false },
      };

      // Did we log today's picks?
      try{
        const pk = `${M.key}/${date}.json`;
        const arr = await picksStore.get(pk, { type:"json" });
        item.picksToday = Array.isArray(arr) && arr.length > 0;
      }catch(_){}

      // Summary from any configured store
      const summary = await readFirstJSON(M.stores, "summary.json");
      if(summary?.json){
        const s = summary.json;
        item.samples     = Number(s.samples || s.totalSamples || 0);
        item.daysLearned = Number(s.days || s.uniqueDays || 0);
        item.lastRun     = s.lastRun || s.updatedAt || null;
        if(M.key === "mlb_hr"){
          item.extras = {
            batters: Number(s.batters || 0),
            pitchers: Number(s.pitchers || 0),
            leaguePitchSamples: Number(s.leaguePitchSamples || 0),
            leagueZoneSamples: Number(s.leagueZoneSamples || 0),
          };
          try{
            const store = getStore(summary.store || "mlb-learning");
            const lp = await store.get("league/pitchTypes.json", { type:"json" }) || { samples:0 };
            const lz = await store.get("league/zoneBuckets.json", { type:"json" }) || { samples:0 };
            item.extras.leaguePitchSamples = Number(lp.samples || item.extras.leaguePitchSamples || 0);
            item.extras.leagueZoneSamples  = Number(lz.samples || item.extras.leagueZoneSamples || 0);
          }catch(_){}
        }
      }

      // Function reachability
      item.func = await funcReachable(M.funcs);

      // Traffic light
      const isGreen = (item.samples>0 || item.daysLearned>0 || item.picksToday || item.func.reachable);
      item.status = isGreen ? "green" : "yellow";

      models[M.key] = item;
      legacy[M.key] = {
        picks_today: item.picksToday,
        samples: item.samples,
        days: item.daysLearned,
        last_run: item.lastRun,
        fn_ok: !!item.func.reachable,
        status: item.status,
        ...(item.extras ? { extras: item.extras } : {}),
      };
    }

    return ok({ ok:true, date, models, **legacy });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
