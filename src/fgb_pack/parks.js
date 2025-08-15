// src/fgb_pack/parks.js
// Minimal handedness-aware park multipliers (expand as needed).

var PARKS = {
  "Coors Field": { L: 1.22, R: 1.18 },
  "Yankee Stadium": { L: 1.12, R: 1.02 },
  "Great American Ball Park": { L: 1.12, R: 1.12 },
  "Citizens Bank Park": { L: 1.08, R: 1.08 },
  "Globe Life Field": { L: 1.05, R: 1.05 },
  "American Family Field": { L: 1.06, R: 1.06 },
  "Fenway Park": { L: 1.02, R: 1.02 },
  "Dodger Stadium": { L: 1.00, R: 1.00 },
  "Oracle Park": { L: 0.92, R: 0.95 },
  "T-Mobile Park": { L: 0.96, R: 0.96 }
};

export function parkHRFactor(parkName, batSide){
  if(!parkName) return 1.00;
  var row = PARKS[parkName];
  if(!row) return 1.00;
  var side = normalizeSide(batSide);
  if(side==="L" && row.L) return row.L;
  if(side==="R" && row.R) return row.R;
  return 1.00;
}

function normalizeSide(s){
  if(!s) return null;
  var t = String(s).toUpperCase();
  if(t.indexOf("L")===0) return "L";
  if(t.indexOf("R")===0) return "R";
  return null;
}