import { getStore } from "@netlify/blobs";
function ok(data){ return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" }}); }
export default async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());

  const store = getStore("mlb-learning");
  const summary = await store.get("summary.json", { type:"json" }) || {};
  const leaguePitch = await store.get("league/pitchTypes.json", { type:"json" }) || { samples:0, hr:0, byType:{} };
  const leagueZone  = await store.get("league/zoneBuckets.json", { type:"json" }) || { samples:0, hr:0, byBucket:{} };

  const out = {
    ok:true,
    date,
    summary:{
      samples: Number(summary.samples||0),
      days: Number(summary.days||0),
      lastRun: summary.lastRun || null,
      batters: Number(summary.batters||0),
      pitchers: Number(summary.pitchers||0),
      leaguePitchSamples: Number(summary.leaguePitchSamples||0),
      leagueZoneSamples: Number(summary.leagueZoneSamples||0),
    },
    leaguePitch,
    leagueZone
  };
  return ok(out);
};