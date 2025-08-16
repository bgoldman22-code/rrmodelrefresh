
// netlify/functions/odds-props.mjs
// Robust The Odds API fetcher for player HR props.
// Reads ODDS_API_KEY or VITE_ODDS_API_KEY from env at runtime.

export default async function handler(request) {
  try{
    const url = new URL(request.url);
    const league = (url.searchParams.get('league') || 'mlb').toLowerCase();
    const sport = toOddsSport(league); // e.g., baseball_mlb
    const regions = url.searchParams.get('regions') || 'us';
    const oddsFormat = url.searchParams.get('oddsFormat') || 'american';
    const bookmakers = url.searchParams.get('bookmakers') || ''; // optional CSV
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    if(!apiKey) return resp({ ok:false, usingOddsApi:false, reason:'no api key' }, 200);

    // Discover markets
    const markets = await fetchMarkets(sport, apiKey);
    const hrKey = markets.find(m => m.toLowerCase() === 'player_home_runs')
              || markets.find(m => m.toLowerCase().includes('home_run'));
    if(!hrKey) return resp({ ok:true, usingOddsApi:false, reason:'no player_home_runs market', markets }, 200);

    const params = new URLSearchParams({
      apiKey, regions, oddsFormat, markets: hrKey, includeLinks: 'false'
    });
    if(bookmakers) params.set('bookmakers', bookmakers);

    const oddsUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds?${params.toString()}`;
    const r = await fetch(oddsUrl, { headers:{ 'accept': 'application/json' }});
    const quota = {
      remaining: r.headers.get('x-requests-remaining'),
      used: r.headers.get('x-requests-used'),
      reset: r.headers.get('x-requests-reset')
    };
    if(r.status === 401 || r.status === 403){
      return resp({ ok:false, usingOddsApi:false, reason:`auth ${r.status}`, quota }, 200);
    }
    if(!r.ok){
      return resp({ ok:false, usingOddsApi:false, reason:`http ${r.status}`, quota }, 200);
    }
    const events = await r.json();
    const rows = [];
    for(const ev of (events||[])){
      for(const bk of (ev.bookmakers||[])){
        for(const mk of (bk.markets||[])){
          if(!mk || mk.key?.toLowerCase() !== hrKey.toLowerCase()) continue;
          for(const out of (mk.outcomes||[])){
            if(!out?.name || out.price == null) continue;
            rows.push({
              eventId: ev.id,
              commence_time: ev.commence_time,
              home_team: ev.home_team,
              away_team: ev.away_team,
              bookmaker: bk.key,
              market: mk.key,
              player: out.name,
              price: Number(out.price)
            });
          }
        }
      }
    }
    const usingOddsApi = rows.length > 0;
    return resp({ ok:true, usingOddsApi, reason: usingOddsApi ? 'ok' : 'empty market', markets, rows, quota }, 200);
  }catch(err){
    return resp({ ok:false, usingOddsApi:false, error:String(err) }, 200);
  }
}

async function fetchMarkets(sport, apiKey){
  try{
    const u = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds-markets?apiKey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(u, { headers:{ 'accept': 'application/json' }});
    if(!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  }catch{ return []; }
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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
  });
}
