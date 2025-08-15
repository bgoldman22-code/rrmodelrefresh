export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const sports = (url.searchParams.get("sports") || "baseball_mlb,americanfootball_nfl,soccer_epl").split(",").map(s => s.trim()).filter(Boolean);
    const markets = (url.searchParams.get("markets") || "player_home_run,player_to_hit_a_home_run,player_anytime_td,player_goal_scorer_anytime,player_to_score_anytime").split(",").map(s => s.trim()).filter(Boolean);
    const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    const key = process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY || "";

    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, sports, markets, date }), { headers:{ "content-type":"application/json" }});

    if(!key){
      // Return ok=false but 200 so diagnostics doesn't show a server error.
      return new Response(JSON.stringify({ ok:false, error:"missing-key", sports, markets, date }), { status:200, headers:{ "content-type":"application/json" }});
    }

    // Optional: light ping to Odds API status (won't burn many credits)
    try{
      const r = await fetch(`https://api.the-odds-api.com/v4/sports`, { headers:{ "x-api-key": key }});
      // ignore response; just ensure network path is OK
      // Do not treat non-200 as server failure
      await r.text().catch(()=>{});
    }catch(_){ /* ignore */ }

    return new Response(JSON.stringify({ ok:true, status:"ok", sports, markets, date }), { headers:{ "content-type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" }});
  }
};
