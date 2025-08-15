// src/utils/mlb_today.js
// Minimal StatsAPI helpers to (1) get today's schedule in ET, (2) rosters for today's teams, (3) pitcher HR/9.
export function todayISO_ET(){
  // DST-proof ET date (YYYY-MM-DD) using Intl
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date());
}

async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function getTodaySchedule(){
  const date = todayISO_ET();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`;
  const data = await fetchJSON(url);
  const games = (data?.dates?.[0]?.games || []).map(g => ({
    gamePk: g.gamePk,
    homeName: g.teams?.home?.team?.name,
    awayName: g.teams?.away?.team?.name,
    homeId: g.teams?.home?.team?.id,
    awayId: g.teams?.away?.team?.id,
    venueName: g.venue?.name,
    probablePitchers: {
      home: g.teams?.home?.probablePitcher ? {
        id: g.teams.home.probablePitcher.id,
        fullName: g.teams.home.probablePitcher.fullName
      } : null,
      away: g.teams?.away?.probablePitcher ? {
        id: g.teams.away.probablePitcher.id,
        fullName: g.teams.away.probablePitcher.fullName
      } : null
    }
  }));
  return { date, games };
}

export async function getTeamRoster(teamId){
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster`;
  const data = await fetchJSON(url);
  return (data?.roster || []).map(r => ({
    id: r?.person?.id,
    fullName: r?.person?.fullName,
    lastName: (r?.person?.fullName||'').split(' ').slice(-1)[0],
    teamId
  }));
}

export async function getPitcherSeasonHR9(mlbPersonId, seasonYear){
  // HR per 9 from season stats; default ~1.10 if missing
  try{
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbPersonId}/stats?stats=season&group=pitching&season=${seasonYear}`;
    const data = await fetchJSON(url);
    const splits = data?.stats?.[0]?.splits || [];
    const s = splits[0]?.stat;
    if (!s) return 1.1;
    const hr = Number(s.homeRuns || 0);
    const ip = Number(s.inningsPitched?.replace?.(/[^0-9.]/g,'') || 0);
    if (ip <= 0) return 1.1;
    const hr9 = (hr / ip) * 9.0;
    return hr9 || 1.1;
  }catch(e){
    return 1.1;
  }
}

export function venueHRFactor(venueName){
  // Crude park HR factor table (relative to 1.00). Extend as needed.
  const map = {
    "Coors Field": 1.10,
    "Great American Ball Park": 1.05,
    "Citizens Bank Park": 1.04,
    "Yankee Stadium": 1.03,
    "Oriole Park at Camden Yards": 1.02,
    "Globe Life Field": 1.02,
    "Dodger Stadium": 1.02,
    "American Family Field": 1.02,
    "Chase Field": 1.02,
    "T-Mobile Park": 0.98,
    "Petco Park": 0.98,
    "LoanDepot Park": 0.97,
    "Oracle Park": 0.96
  };
  return map[venueName] || 1.00;
}
