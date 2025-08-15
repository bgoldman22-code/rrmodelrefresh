/** netlify/functions/odds-health-debug.mjs
 * Echos the EXACT URL we call for events, with strict ISO timestamps (no ms).
 * Call: /.netlify/functions/odds-health-debug
 */

function pad(n){ return String(n).padStart(2,'0'); }
function isoNoMs(d){
  const dt = new Date(d);
  return dt.getUTCFullYear() + '-' +
         pad(dt.getUTCMonth()+1) + '-' +
         pad(dt.getUTCDate()) + 'T' +
         pad(dt.getUTCHours()) + ':' +
         pad(dt.getUTCMinutes()) + ':' +
         pad(dt.getUTCSeconds()) + 'Z';
}
function startOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),0,0,0)); }
function endOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),23,59,59)); }
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
function keyOdds(){ return process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.ODDSAPI_KEY; }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  const text = await r.text();
  let json=null; try{ json=JSON.parse(text);}catch{}
  return { ok:r.ok, status:r.status, json, text, url, headers:Object.fromEntries([...r.headers.entries()]) };
}

export default async () => {
  const key = keyOdds();
  if(!key) return ok({ ok:false, error:"missing-api-key" });
  const sport = "baseball_mlb";
  const base  = `https://api.the-odds-api.com/v4/sports/${sport}`;

  const now = new Date();
  const from = startOfDayUTC(now);
  const to   = endOfDayUTC(new Date(now.getTime()+36*3600*1000));

  const params = new URLSearchParams();
  params.set("commenceTimeFrom", isoNoMs(from));
  params.set("commenceTimeTo", isoNoMs(to));
  params.set("dateFormat", "iso");
  params.set("apiKey", key);

  const url = `${base}/events?${params.toString()}`;
  const res = await fetchJSON(url);
  return ok({
    ok: res.ok,
    requested: url,
    commenceTimeFrom: isoNoMs(from),
    commenceTimeTo: isoNoMs(to),
    status: res.status,
    body: res.text?.slice(0,400),
    headers: res.headers
  });
};
