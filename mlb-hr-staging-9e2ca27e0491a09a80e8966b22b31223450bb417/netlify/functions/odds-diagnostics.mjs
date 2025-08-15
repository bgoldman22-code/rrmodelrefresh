// netlify/functions/odds-diagnostics.mjs
export default async function handler(request){
  const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport') || 'baseball_mlb';
  const out = { ok:false, env_present: Boolean(apiKey), sport };
  if(!apiKey){
    return resp({ ...out, note:'Set VITE_ODDS_API_KEY or ODDS_API_KEY in Netlify env' }, 200);
  }
  try{
    const s = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`);
    const e = await fetch(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events?apiKey=${encodeURIComponent(apiKey)}`);
    const events = e.ok ? await e.json() : [];
    return resp({ ok:true, env_present:true, sports_status:s.status, events_status:e.status, events_count: Array.isArray(events)? events.length : 0 });
  }catch(err){
    return resp({ ...out, error:String(err) }, 200);
  }
}
function resp(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type':'application/json' } });
}
