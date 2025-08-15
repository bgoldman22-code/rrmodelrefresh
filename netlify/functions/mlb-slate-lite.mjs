/**
 * netlify/functions/mlb-slate-lite.mjs
 * Build a daily slate of MLB batter candidates from the free MLB StatsAPI.
 * Output shape: { candidates: [ { name, team, opp, gameId, batterId, seasonHR, seasonPA, baseProb }, ... ] }
 * Notes:
 * - No lineup gating (uses active rosters)
 * - Season-based HR/PA with small prior; per-game HR prob = 1 - (1 - p_pa)^expPA (expPA~4.1)
 */
const SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=";
const TEAMS    = (season)=> `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`;
const ROSTER   = (tid)=> `https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active`;
const PEOPLE   = (ids, season)=> `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(",")}&hydrate=stats(group=hitting,type=season,season=${season})`;

function ok(data){ return new Response(JSON.stringify(data), { headers:{ "content-type":"application/json" }}); }
async function fetchJSON(url){
  const r = await fetch(url, { headers:{ "accept":"application/json" }});
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
function todayISOET(){
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || todayISOET();
    const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();
    const expPA = Number(url.searchParams.get("expPA")) || 4.1;
    const priorPA = Number(url.searchParams.get("priorPA")) || 60;
    const priorHRrate = Number(url.searchParams.get("priorHR")) || 0.04; // ~ league HR/PA
    const capProb = Number(url.searchParams.get("cap")) || 0.40; // cap single-game HR prob at 40%

    // 1) Schedule
    const sched = await fetchJSON(SCHEDULE + encodeURIComponent(date));
    const games = (sched?.dates?.[0]?.games)||[];
    if(games.length===0) return ok({ date, candidates: [], games:0 });

    // 2) Teams & abbrev
    const teamsJ = await fetchJSON(TEAMS(season));
    const abbrevById = new Map();
    const nameById = new Map();
    for(const t of (teamsJ?.teams||[])){
      abbrevById.set(t.id, t.abbreviation || t.teamCode || t.clubName || t.name);
      nameById.set(t.id, t.name);
    }

    // 3) Per-game mapping: teamId -> { oppId, gameId, home/away }
    const mapTeamToGame = new Map();
    for(const g of games){
      const home = g?.teams?.home?.team?.id;
      const away = g?.teams?.away?.team?.id;
      if(!home || !away) continue;
      const gameId = `${abbrevById.get(away)||"AWY"}@${abbrevById.get(home)||"HOM"}`;
      mapTeamToGame.set(home, { oppId: away, gameId, side:"home" });
      mapTeamToGame.set(away, { oppId: home, gameId, side:"away" });
    }

    // 4) Rosters (active, non-pitchers)
    const teamIds = [...new Set(games.flatMap(g => [g?.teams?.home?.team?.id, g?.teams?.away?.team?.id]).filter(Boolean))];
    const rosterByTeam = new Map();
    for(const tid of teamIds){
      try{
        const r = await fetchJSON(ROSTER(tid));
        const hitters = (r?.roster||[]).filter(x => String(x?.position?.code).toUpperCase() !== "P");
        rosterByTeam.set(tid, hitters);
      }catch{ rosterByTeam.set(tid, []); }
    }

    // 5) Stats for all hitters (season totals)
    const allIds = [];
    for(const tid of teamIds){
      for(const r of (rosterByTeam.get(tid)||[])){
        const pid = r?.person?.id;
        if(pid) allIds.push(pid);
      }
    }
    const uniqueIds = [...new Set(allIds)];
    const chunks = [];
    for(let i=0;i<uniqueIds.length;i+=100) chunks.push(uniqueIds.slice(i,i+100));

    const statById = new Map();
    for(const chunk of chunks){
      try{
        const pj = await fetchJSON(PEOPLE(chunk, season));
        for(const p of (pj?.people||[])){
          const id = p?.id;
          const name = p?.fullName || p?.firstLastName || p?.lastFirstName;
          let hr=0, pa=0;
          for(const s of (p?.stats||[])){
            for(const sp of (s?.splits||[])){
              hr += Number(sp?.stat?.homeRuns||0);
              pa += Number(sp?.stat?.plateAppearances||0);
            }
          }
          statById.set(id, { name, hr, pa });
        }
      }catch{ /* continue */ }
    }

    // 6) Build candidates with season-based baseProb (with prior)
    const candidates = [];
    for(const tid of teamIds){
      const meta = mapTeamToGame.get(tid);
      if(!meta) continue;
      const oppId = meta.oppId;
      const teamAb = abbrevById.get(tid) || "TEAM";
      const oppAb  = abbrevById.get(oppId) || "OPP";
      for(const r of (rosterByTeam.get(tid)||[])){
        const pid = r?.person?.id;
        const st  = statById.get(pid);
        if(!st) continue;
        const seasonHR = Number(st.hr||0);
        const seasonPA = Number(st.pa||0);
        if(seasonPA <= 0) continue;
        // shrink toward league average
        const adjHR = seasonHR + priorPA * priorHRrate;
        const adjPA = seasonPA + priorPA;
        const p_pa = Math.max(0, Math.min(0.15, adjHR / adjPA)); // cap per-PA rate to avoid outliers
        const p_game = 1 - Math.pow(1 - p_pa, expPA);
        const baseProb = Math.min(capProb, Math.max(0.001, p_game));

        candidates.push({
          name: st.name || r?.person?.fullName || "Batter",
          team: teamAb,
          opp: oppAb,
          gameId: meta.side==="home" ? `${oppAb}@${teamAb}` : `${teamAb}@${oppAb}`,
          batterId: pid,
          seasonHR, seasonPA,
          baseProb
        });
      }
    }

    return ok({ ok:true, date, games: games.length, candidates });
  }catch(e){
    return ok({ ok:false, error:String(e?.message||e) });
  }
};
