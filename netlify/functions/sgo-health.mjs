/** netlify/functions/sgo-health.mjs
 * SportsGameOdds health check (flexible, works for v1/v2 styles).
 * Requires SPORTSGAMEODDS_KEY. Optional SGO_BASE.
 * Call: /.netlify/functions/sgo-health
 */
function ok(data){ return new Response(JSON.stringify(data, null, 2), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY; }
function base(){ return process.env.SGO_BASE || "https://api.sportsgameodds.com/v1"; }
async function fetchJSON(url, key){
  const r = await fetch(url, { headers:{ "accept":"application/json", "X-API-Key": key }});
  const text = await r.text();
  let json=null; try{ json=JSON.parse(text);}catch{}
  return { ok:r.ok, status:r.status, headers:Object.fromEntries([...r.headers.entries()]), json, text, url };
}
function iso(d){ return new Date(d).toISOString(); }
function startOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),0,0,0)); }
function endOfDayUTC(d){ const dt=new Date(d); return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),23,59,59)); }
function americanFromDecimal(dec){
  const d = Number(dec);
  if(!isFinite(d) || d<=1) return null;
  const pos = Math.round((d-1)*100);
  return pos>=100 ? pos : -Math.round(100/(d-1));
}

export default async () => {
  const key = getKey();
  if(!key) return ok({ ok:false, error:"missing-sgo-key", hint:"Set SPORTSGAMEODDS_KEY in Netlify env" });
  const b = base();
  const now=new Date();
  const from=startOfDayUTC(now), to=endOfDayUTC(new Date(now.getTime()+36*3600*1000));

  const urlsEvents = [
    `${b}/events?league=MLB&from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`,
    `${b}/events?league=MLB`
  ];
  let events=[], evRes=null;
  for(const u of urlsEvents){
    const r = await fetchJSON(u, key);
    evRes=r;
    if(r.ok && Array.isArray(r.json)) { events=r.json; break; }
  }
  if(!Array.isArray(events)) events=[];

  let checked=0, parsed=0, players=0; const samples=[]; const attempts=[];
  for(const e of events){
    const id = e?.eventID || e?.id || e?.eventId;
    if(!id) continue;
    checked++;
    const tries = [
      `${b}/odds?league=MLB&eventID=${encodeURIComponent(id)}&betTypeID=ou&statID=batting_homeRuns&periodID=game`,
      `${b}/events/${encodeURIComponent(id)}/odds?betTypeID=ou&statID=batting_homeRuns&periodID=game`
    ];
    let got=null, last=null;
    for(const u of tries){
      const r = await fetchJSON(u, key);
      attempts.push({ stage:"odds", ok:r.ok, status:r.status, url:r.url });
      last=r;
      if(r.ok && r.json){ got=r.json; break; }
    }
    if(!got) continue;
    const walk = (obj) => {
      if(!obj || typeof obj!=="object") return;
      if(Array.isArray(obj)){ obj.forEach(walk); return; }
      const mk = String(obj.marketKey||obj.key||obj.marketID||obj.id||"");
      const statID = obj.statID || obj.stat || obj.statId;
      const betTypeID = obj.betTypeID || obj.betType || obj.betTypeId;
      const periodID = obj.periodID || obj.period || obj.periodId;
      const side = (obj.side||obj.selection||obj.name||"").toString().toLowerCase();
      const isPattern = /batting_homeRuns-.*-game-ou-over/i.test(mk);
      const isExplicit = (statID==="batting_homeRuns" && (betTypeID==="ou"||betTypeID==="OU") && (periodID==="game"||periodID==="GAME") && (side.includes("over")));
      if(isPattern || isExplicit){
        const player = obj.playerName || obj.participant || obj.selectionName || obj.player || obj.name_secondary || obj.selection || obj.name;
        const american = Number(obj.oddsAmerican || obj.american || obj.priceAmerican);
        const decimal = Number(obj.oddsDecimal || obj.decimal || obj.priceDecimal);
        const am = (!isFinite(american) || american===0) ? americanFromDecimal(decimal) : american;
        if(player && isFinite(am)){
          parsed++; players++;
          if(samples.length<8) samples.push({ player, american:am, marketKey: mk||undefined });
        }
      }
      for(const v of Object.values(obj)) walk(v);
    };
    walk(got);
  }

  return ok({
    ok:true,
    base:b,
    eventsTried: events.length,
    checked,
    parsed,
    players,
    sampleCount: samples.length,
    samples,
    lastEventsStatus: evRes?{ ok:evRes.ok, status:evRes.status, url:evRes.url }:null
  });
};
