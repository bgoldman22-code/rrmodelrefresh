// netlify/functions/odds-props.mjs
// Uses The Odds API /events + /events/{id}/odds so PLAYER PROPS work.
// Env: set VITE_ODDS_API_KEY or ODDS_API_KEY in Netlify.

export default async function handler(request) {
  try{
    const url = new URL(request.url);
    const league = (url.searchParams.get('league') || 'mlb').toLowerCase();
    const markets = url.searchParams.get('markets') || 'h2h';
    const regions = url.searchParams.get('regions') || 'us';
    const oddsFormat = url.searchParams.get('oddsFormat') || 'american';
    const dateFrom = url.searchParams.get('dateFrom'); // YYYY-MM-DD
    const dateTo = url.searchParams.get('dateTo');     // YYYY-MM-DD
    const limit = Math.max(1, Math.min(120, parseInt(url.searchParams.get('limit') || '80', 10)));

    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
    if(!apiKey){
      return resp({ ok:false, stage:'init', error:'missing-key', message:'Set VITE_ODDS_API_KEY (or ODDS_API_KEY) in Netlify env.' }, 500);
    }
    const sportKey = mapLeagueToSportKey(league);
    if(!sportKey){
      return resp({ ok:false, stage:'init', error:'bad-league', message:`Unknown league "${league}"` }, 400);
    }

    // Step 1: list events (no odds; cheaper), then local date filter
    const evURL = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events?apiKey=${encodeURIComponent(apiKey)}`;
    const evRes = await fetch(evURL);
    if(!evRes.ok){
      const body = await evRes.text().catch(()=>'');
      return resp({ ok:false, stage:'events', status: evRes.status, body }, 502);
    }
    let events = await evRes.json();
    if(!Array.isArray(events)) events = [];

    const fromTs = dateFrom ? Date.parse(dateFrom + 'T00:00:00Z') : null;
    const toTs   = dateTo   ? Date.parse(dateTo   + 'T23:59:59Z') : null;
    if(fromTs || toTs){
      events = events.filter(ev => {
        const t = Date.parse(ev.commence_time);
        if(Number.isFinite(fromTs) && t < fromTs) return false;
        if(Number.isFinite(toTs) && t > toTs) return false;
        return true;
      });
    }

    // Step 2: fetch per-event odds for requested markets
    const out = [];
    for(const ev of events.slice(0, limit)){
      const odURL = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(ev.id)}/odds?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=${encodeURIComponent(oddsFormat)}&apiKey=${encodeURIComponent(apiKey)}`;
      try{
        const r = await fetch(odURL);
        if(!r.ok) continue;
        const j = await r.json();
        j.home_team = ev.home_team;
        j.away_team = ev.away_team;
        out.push(j);
      }catch{ /* ignore single event errors */ }
    }

    const remaining = parseInt(evRes.headers.get('x-requests-remaining') || '0', 10);
    const used = parseInt(evRes.headers.get('x-requests-used') || '0', 10);

    return resp({ ok:true, sportKey, requested_markets: markets, events: events.length, returned: out.length, quota:{remaining,used}, data: out });
  }catch(e){
    return resp({ ok:false, stage:'catch', error:String(e&&e.message||e) }, 500);
  }
}

function mapLeagueToSportKey(lg){
  switch(lg){
    case 'mlb': return 'baseball_mlb';
    case 'nfl': return 'americanfootball_nfl';
    case 'nba': return 'basketball_nba';
    case 'nhl': return 'icehockey_nhl';
    case 'epl': return 'soccer_epl';
    case 'laliga': return 'soccer_spain_la_liga';
    case 'seriea': return 'soccer_italy_serie_a';
    case 'bundesliga': return 'soccer_germany_bundesliga';
    case 'ligue1': return 'soccer_france_ligue_one';
    case 'primeira':
    case 'portugal':
    case 'ppl': return 'soccer_portugal_primeira_liga';
    default: return null;
  }
}

function resp(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
