
// netlify/functions/odds-diagnostics.mjs
export default async function handler(request){
  const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
  const url = new URL(request.url);
  const league = (url.searchParams.get('league') || 'mlb').toLowerCase();
  const sport = toOddsSport(league);
  const out = { ok:false, env_present: Boolean(apiKey), sport };
  if(!apiKey){
    return resp({ ...out, note:'Set ODDS_API_KEY or VITE_ODDS_API_KEY in Netlify env (Functions + Edge)' }, 200);
  }
  try{
    const s = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}`);
    const sports = s.ok ? await s.json() : [];
    const marketsUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds-markets?apiKey=${encodeURIComponent(apiKey)}`;
    const mk = await fetch(marketsUrl);
    const markets = mk.ok ? await mk.json() : [];
    const hr = markets.find(m => m.toLowerCase() === 'player_home_runs') || null;

    // Try a lightweight odds hit
    const params = new URLSearchParams({ apiKey, regions:'us', oddsFormat:'american', markets: hr || '' });
    const o = await fetch(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds?${params.toString()}`);
    const quota = { remaining: o.headers.get('x-requests-remaining'), used: o.headers.get('x-requests-used'), reset: o.headers.get('x-requests-reset') };
    let events = [];
    if(o.ok){ try{ events = await o.json(); }catch{} }

    let hrCount = 0;
    for(const ev of events){
      for(const bk of (ev.bookmakers||[])){
        for(const mk of (bk.markets||[])){
          if(hr && mk.key?.toLowerCase() !== hr.toLowerCase()) continue;
          hrCount += (mk.outcomes||[]).length;
        }
      }
    }

    return resp({ ok:true, env_present:true, markets, has_hr_market:Boolean(hr), sample_hr_outcomes: hrCount, quota }, 200);
  }catch(err){
    return resp({ ...out, error:String(err) }, 200);
  }
}

function toOddsSport(league){
  switch(league){
    case 'mlb':
    case 'baseball':
      return 'baseball_mlb';
    default:
      return 'baseball_mlb';
  }
}

function resp(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type':'application/json' } });
}
