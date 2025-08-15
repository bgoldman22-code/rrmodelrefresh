/** netlify/functions/sgo-health.mjs */
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY; }
function base(){ return process.env.SGO_BASE || "https://api.sportsgameodds.com/v1"; }
async function fetchJSON(url, key){
  const r = await fetch(url, { headers:{ "accept":"application/json", "X-API-Key": key }});
  const text = await r.text();
  let json=null; try{ json=JSON.parse(text);}catch{}
  return { ok:r.ok, status:r.status, json, text, url };
}
export default async () => {
  const key=getKey();
  const b=base();
  const ev = await fetchJSON(`${b}/events?league=MLB`, key||"");
  return ok({ ok: !!key && ev.ok, base:b, eventsTried: Array.isArray(ev.json)?ev.json.length:0, lastEventsStatus:{ ok:ev.ok, status:ev.status, url:ev.url, body:ev.text.slice(0,300) } });
};
