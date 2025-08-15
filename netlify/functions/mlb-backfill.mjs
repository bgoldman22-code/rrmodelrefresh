/**
 * MLB learning backfill orchestrator (safe).
 * Calls your existing mlb-learner-v2 for each date in [start, end] (inclusive).
 * Query params:
 *   - start=YYYY-MM-DD  (required)
 *   - end=YYYY-MM-DD    (required)
 *   - pacems=150        (optional; delay between days in ms; default 150)
 *   - dry=1             (optional; preview only, no writes)
 *
 * Examples:
 *   /.netlify/functions/mlb-backfill?start=2025-04-01&end=2025-08-13
 *   /.netlify/functions/mlb-backfill?start=2025-08-01&end=2025-08-14&dry=1
 */
function parseDate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");
  if(!m) return null;
  const [_,y,mo,d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo-1, d));
  if(isNaN(dt)) return null;
  return dt;
}
function fmt(d){
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}
function addDays(d, n){
  const dt = new Date(d.getTime());
  dt.setUTCDate(dt.getUTCDate()+n);
  return dt;
}
async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export default async (req) => {
  try{
    const url = new URL(req.url);
    const origin = url.origin;
    const startS = url.searchParams.get("start");
    const endS   = url.searchParams.get("end");
    const dry    = url.searchParams.get("dry")==="1";
    const pacems = Math.max(0, parseInt(url.searchParams.get("pacems")||"150",10));

    const start = parseDate(startS);
    const end   = parseDate(endS);
    if(!start || !end || end < start){
      return new Response(JSON.stringify({ ok:false, error:"bad-range", hint:"use ?start=YYYY-MM-DD&end=YYYY-MM-DD" }), { status:200, headers:{ "content-type":"application/json" }});
    }

    const days = [];
    let cur = start;
    while(cur <= end){
      days.push(fmt(cur));
      cur = addDays(cur, 1);
    }

    const results = [];
    for(const day of days){
      const path = `/.netlify/functions/mlb-learner-v2?date=${encodeURIComponent(day)}${dry?"&dry=1":""}`;
      try{
        const r = await fetch(origin+path);
        const j = await r.json().catch(()=>({ ok:false, error:"bad-json" }));
        results.push({ day, ok: !!j.ok, info: j });
      }catch(e){
        results.push({ day, ok:false, error:String(e?.message||e) });
      }
      if(pacems) await sleep(pacems);
    }

    const okCount = results.filter(x => x.ok).length;
    return new Response(JSON.stringify({ ok:true, range:{ start:startS, end:endS, days:days.length }, okCount, results }, null, 2), {
      headers:{ "content-type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" }});
  }
};
