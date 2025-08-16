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
    const evUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events?apiKey=${encodeURIComponent(apiKey)}`;
    const er = await fetch(evUrl);
    const events = er.ok ? await er.json() : [];
    const first = events[0];
    let sample_hr_outcomes = 0;
    let has_hr_market = false;
    let quota = { remaining:null, used:null, reset:null };

    if(first){
      const keys = ['player_home_runs','home_runs'];
      for(const k of keys){
        const qs = new URLSearchParams({ apiKey, regions:'us', oddsFormat:'american', markets:k });
        const ou = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(first.id)}/odds?${qs.toString()}`;
        const r = await fetch(ou);
        quota = { remaining: r.headers.get('x-requests-remaining'), used: r.headers.get('x-requests-used'), reset: r.headers.get('x-requests-reset') };
        if(!r.ok) continue;
        const data = await r.json();
        for(const bk of (data.bookmakers||[])){
          for(const mk of (bk.markets||[])){
            if((mk.key||'').toLowerCase().includes('home_run')){
              has_hr_market = true;
              sample_hr_outcomes += (mk.outcomes||[]).length;
            }
          }
        }
        if(has_hr_market) break;
      }
    }

    return resp({ ok:true, env_present:true, has_hr_market, events_count: events.length, sample_hr_outcomes, quota }, 200);
  }catch(err){
    return resp({ ...out, error:String(err) }, 200);
  }
}

function toOddsSport(league){
  switch(league){
    case 'mlb':
    case 'baseball': return 'baseball_mlb';
    default: return 'baseball_mlb';
  }
}

function resp(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type':'application/json' } });
}
