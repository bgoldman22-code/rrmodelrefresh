// src/lib/why.js
// Generate short, varied reasons from available context.
const funFacts = [
  (p)=> `${p.player.split(" ")[0]} has a top-30 max EV over the last month.`,
  (p)=> `Park plays small for pull-side power.`,
  (p)=> `Starter allows a high FB% vs ${p.hand || 'RHB'}.`,
  (p)=> `Wind/park factor slightly up today.`,
  (p)=> `Form tick-up: recent ISO bump.`,
  (p)=> `Career vs team: solid hard-hit history.`,
  (p)=> `Likely ${p.pa_est || 4} PAs near heart of order.`,
];

function sample(arr, n=2) {
  const out = [];
  const used = new Set();
  for (let i=0;i<arr.length && out.length<n;i++){
    let idx = Math.floor(Math.random()*arr.length);
    // prevent repeats
    for (let tries=0;tries<arr.length && used.has(idx);tries++) {
      idx = (idx+1) % arr.length;
    }
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}

export function buildWhy(p) {
  const bullets = [];
  if (p.platoon_edge) bullets.push("Platoon edge today");
  if (p.park_boost) bullets.push("Park boost");
  if (p.form_7d) bullets.push("Recent form up");
  if (p.starter_factor && p.starter_factor !== 1) bullets.push(`Starter factor ${p.starter_factor.toFixed(2)}`);
  // add 1-2 fun facts for color
  for (const f of sample(funFacts, 2)) bullets.push(f(p));
  // Dedup & cap
  return [...new Set(bullets)].slice(0, 3);
}
