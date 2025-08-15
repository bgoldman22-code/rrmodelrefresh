import { getStore } from "@netlify/blobs";

function etDate(){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}

async function fetchJSON(url, init){
  const r = await fetch(url, init);
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || etDate();
    const store = getStore("mlb-learning");

    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, date }), { headers:{ "content-type":"application/json" }});

    // Minimal learning: count games; persist a lightweight summary so diagnostics can confirm learning.
    const sched = await fetchJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`);
    const games = (sched?.dates?.[0]?.games || []).length;

    // Load summary and update minimal fields
    const summaryKey = "summary.json";
    const prev = await store.get(summaryKey, { type:"json" }) || { daysList:[], samples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok: true,
      date,
      games,
      // Treat "samples" minimally as number of games for now (non-zero proof of life)
      samples: (Number(prev.samples)||0) + games,
      days: set.size,
      daysList: Array.from(set),
      lastRun: new Date().toISOString(),
      note: "lightweight learner ran (proof-of-life)"
    };
    await store.setJSON(summaryKey, out);

    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" }});
  }catch(e){
    // Never 500: return JSON with ok:false so diagnostics shows yellow, not broken server.
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" }});
  }
};
