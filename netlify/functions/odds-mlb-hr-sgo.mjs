/** netlify/functions/odds-mlb-hr-sgo.mjs
 * SportsGameOdds fallback odds for MLB anytime HR (Over 0.5).
 * Requires SPORTSGAMEODDS_KEY. Optional SGO_BASE.
 * Call: /.netlify/functions/odds-mlb-hr-sgo
 */
function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
function getKey(){ return process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY; }
function base(){ return process.env.SGO_BASE || "https://api.sportsgameodds.com/v1"; }
async function fetchJSON(url, key){
  const r = await fetch(url, { headers:{ "accept":"application/json", "X-API-Key": key }});
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
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
  if(!key) return ok({ ok:false, error:"missing-sgo-key" });
  const b = base();
  const now=new Date();
  const from=startOfDayUTC(now), to=endOfDayUTC(now);

  // events
  let events=[];
  try{
    const a = await fetchJSON(`${b}/events?league=MLB&from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`, key);
    if(Array.isArray(a)) events=a;
  }catch{}
  if(!Array.isArray(events) || events.length===0){
    try{
      const b2 = await fetchJSON(`${b}/events?league=MLB`, key);
      if(Array.isArray(b2)) events=b2;
    }catch{}
  }

  const best=new Map();
  for(const e of (events||[])){
    const id = e?.eventID || e?.id || e?.eventId;
    if(!id) continue;
    let got=null;
    const tries=[
      `${b}/odds?league=MLB&eventID=${encodeURIComponent(id)}&betTypeID=ou&statID=batting_homeRuns&periodID=game`,
      `${b}/events/${encodeURIComponent(id)}/odds?betTypeID=ou&statID=batting_homeRuns&periodID=game`
    ];
    for(const u of tries){
      try{ got = await fetchJSON(u, key); break; }catch{}
    }
    if(!got) continue;

    const walk=(obj)=>{
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
          const k = player.toLowerCase();
          const prev = best.get(k);
          if(!prev || am>prev.best_american){
            best.set(k, { player, best_american: am, book: obj.bookmakerName || obj.book || obj.source || "sgo" });
          }
        }
      }
      for(const v of Object.values(obj)) walk(v);
    };
    walk(got);
  }

  return ok({ ok:true, count: best.size, data: [...best.values()], base:b });
};
