// src/fgb_pack/starters.js
// StatsAPI: probable starters (with pitcherId) + venue (park name).

export async function getProbableStarters(dateISO){
  var ymd = dateISO;
  var url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=" + String(ymd) + "&hydrate=probablePitcher(person),venue";
  var byGame = {};

  try{
    var d = await j(url);
    var dates = d && d.dates ? d.dates : [];
    for(var i=0;i<dates.length;i++){
      var games = dates[i].games || [];
      for(var g=0; g<games.length; g++){
        var gm = games[g];
        var id = String(gm.gamePk||"");
        var homeAbbr = safe(gm,"teams","home","team","abbreviation");
        var awayAbbr = safe(gm,"teams","away","team","abbreviation");
        var homePP = safe(gm,"teams","home","probablePitcher","id");
        var awayPP = safe(gm,"teams","away","probablePitcher","id");
        var park = safe(gm,"venue","name");
        byGame[id] = {
          parkName: park || null,
          home: { teamAbbr: homeAbbr||null, pitcherId: homePP||null },
          away: { teamAbbr: awayAbbr||null, pitcherId: awayPP||null }
        };
      }
    }
  }catch(e){}

  return { byGame: byGame };
}

function safe(obj){ for(var i=1;i<arguments.length;i++){ var k=arguments[i]; obj = obj && obj[k]!=null ? obj[k] : null; } return obj; }
async function j(url){ var r=await fetch(url); if(!r.ok) throw new Error("fetch " + url); return r.json(); }