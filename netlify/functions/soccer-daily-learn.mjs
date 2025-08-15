import { getStore } from "@netlify/blobs";

function etDate(){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || etDate();
    const store = getStore("soccer-learning");

    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, date }), { headers:{ "content-type":"application/json" }});

    const prev = await store.get("summary.json", { type:"json" }) || { daysList:[], samples:0 };
    const set = new Set(Array.isArray(prev.daysList) ? prev.daysList : []);
    set.add(date);
    const out = {
      ok:true,
      date,
      samples: (Number(prev.samples)||0) + 1,
      days: set.size,
      daysList: Array.from(set),
      lastRun: new Date().toISOString(),
      note: "Soccer learner ping (lightweight)"
    };
    await store.setJSON("summary.json", out);
    return new Response(JSON.stringify(out), { headers:{ "content-type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" }});
  }
};
