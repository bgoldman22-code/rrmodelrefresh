import { probToAmerican, americanToDec } from './odds_estimator';

export function rrSuggest(picks, { unitsBudget=10, unitDollars=10, priceFactor=0.90 } = {}){
  const combos = [
    { size: 2, list: kCombos(picks, 2) },
    { size: 3, list: kCombos(picks, 3) },
    { size: 4, list: kCombos(picks, 4) },
  ];

  function comboEV(combo){
    const pr = combo.map(p=>p.prob).reduce((a,b)=>a*b,1);
    const decs = combo.map(p => probToAmerican(p.prob, priceFactor).decimal);
    const parlayDec = decs.reduce((a,b)=>a*b,1);
    const stake = 1;
    return pr * parlayDec - (1 - pr) * stake;
  }

  const sizeStats = combos.map(({size, list}) => {
    const evs = list.map(c => comboEV(c));
    const totalEV = evs.reduce((a,b)=>a+b,0);
    return { size, count: list.length, totalEV };
  });

  const totalEVAll = sizeStats.reduce((a,b)=>a+b.totalEV,0);
  let allocs = [];
  if(totalEVAll <= 0){
    const best = sizeStats.slice().sort((a,b)=>(b.totalEV/(b.count||1))-(a.totalEV/(a.count||1)))[0];
    allocs = sizeStats.map(s => ({ size: s.size, units: s.size===best.size ? unitsBudget : 0 }));
  }else{
    allocs = sizeStats.map(s => ({ size: s.size, units: unitsBudget * (s.totalEV / totalEVAll) }));
  }

  const details = combos.map(({size, list}) => {
    const unitsForSize = round05(allocs.find(a=>a.size===size)?.units || 0);
    const unitsPerCombo = list.length ? round05(unitsForSize / list.length) : 0;
    return {
      size,
      combos: list,
      count: list.length,
      unitsForSize,
      unitsPerCombo,
      dollarsPerCombo: +(unitsPerCombo * unitDollars).toFixed(2),
    };
  });

  return { unitsBudget, unitDollars, priceFactor, sizes: details };
}

function kCombos(arr, k){
  const out=[];
  function rec(start, pick){
    if(pick.length===k){ out.push(pick.slice()); return; }
    for(let i=start;i<arr.length;i++){ pick.push(arr[i]); rec(i+1, pick); pick.pop(); }
  }
  rec(0, []);
  return out;
}
function round05(u){ return Math.round(u/0.05)*0.05; }
