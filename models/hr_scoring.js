\
// models/hr_scoring.js
// Reliability + Value + Latent blend for HR probability with human 'WHY' strings.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function americanFromProb(p){
  const adj = clamp(p, 0.001, 0.999);
  if (adj >= 0.5) return -Math.round(100 * adj / (1 - adj));
  return Math.round(100 * (1 - adj) / adj);
}
function probFromAmerican(a){
  if (a == null || isNaN(a)) return null;
  const x = Number(a);
  return x >= 0 ? 100 / (x + 100) : Math.abs(x) / (Math.abs(x) + 100);
}
function logistic(z){ return 1/(1+Math.exp(-z)); }
function logit(p){ const q = clamp(p, 1e-6, 1-1e-6); return Math.log(q/(1-q)); }

// --- weights & bounds (can be tuned by your nightly learner) ---
const W_R = 0.72;              // reliability head weight
const BOUNDS = {
  park:[0.90,1.15], starter:[0.80,1.30], profile:[0.95,1.25], recent:[0.90,1.20], bvp:[1.00,1.20]
};

function shrinkIso(splitISO, seasonISO, leagueISO=0.170){
  if (splitISO != null && seasonISO != null) return 0.65*splitISO + 0.35*seasonISO;
  if (seasonISO != null) return 0.75*seasonISO + 0.25*leagueISO;
  return leagueISO;
}
function venueHRFactor(name){
  if (typeof name === "number") return clamp(name, 0.85, 1.20);
  const map = {
    "Coors Field": 1.18, "Great American Ball Park": 1.12, "Citizens Bank Park": 1.06,
    "Yankee Stadium": 1.05, "Oriole Park at Camden Yards": 1.04, "Globe Life Field": 1.03,
    "Dodger Stadium": 1.02, "American Family Field": 1.02, "Chase Field": 1.02,
    "T-Mobile Park": 0.98, "Petco Park": 0.98, "LoanDepot Park": 0.97, "Oracle Park": 0.96
  };
  return map[name] ?? 1.00;
}

// --- tiny identity calibration (slots for nightly learner) ---
function calibrate_R(p){ return clamp(p, 0.01, 0.60); }
function calibrate_V(p){ return clamp(p, 0.01, 0.60); }

function craftHumanWhy(c){
  // Build varied, human explanations with a little randomness so cards feel “written”.
  const bits = [];
  const name = c.name || "This hitter";
  const hand = (c.bats||"").toUpperCase();
  const vs = (c.oppThrows||"").toUpperCase();
  const splitISO = vs==="L" ? c.iso_vs_lhp : vs==="R" ? c.iso_vs_rhp : null;
  const parkMult = c._ctx?.parkMult;
  const starterAdj = c._ctx?.starterAdj;
  const fb = c.fbPct, pull = c.pullPct, barrel = c.barrelRate;
  const recent = c.recentHRperPA;
  const latent = c.latentScore;
  const edge = c.edgeQuality;
  const pa = c.expPA || 4;

  const funStarters = [];
  if (splitISO!=null) funStarters.push(`${name} owns a ${splitISO.toFixed(3)} ISO vs ${vs}`);
  if (barrel!=null) funStarters.push(`${name} has barreled the ball ${(barrel*100).toFixed(1)}% of PAs this year`);
  if (pull!=null && fb!=null) funStarters.push(`${name} puts pulled fly balls in the air (Pull ${Math.round(pull*100)}%, FB ${Math.round(fb*100)}%)`);
  if (!funStarters.length) funStarters.push(`${name} projects for ~${pa} trips and carries real pop in this matchup`);

  const funContext = [];
  if (parkMult && parkMult>1.02) funContext.push(`park adds a small boost (×${parkMult.toFixed(2)})`);
  if (starterAdj && starterAdj>1.10) funContext.push(`opener has been homer-prone recently (HR/9 bump ×${starterAdj.toFixed(2)})`);
  if (starterAdj && starterAdj<0.95) funContext.push(`opener suppresses HRs a bit (×${starterAdj.toFixed(2)})`);
  if (latent>0.45) funContext.push(`profile points to sneaky pop today`);
  if (recent && recent>0.02) funContext.push(`quiet surge last 2 weeks (HR/PA ${(recent*100).toFixed(1)}%)`);
  if (edge && edge>0.02) funContext.push(`market may be a touch light on his HR odds`);

  const lines = [];
  lines.push(funStarters[0]);
  if (funContext.length) lines.push(funContext[0]);
  // add one detail bit for variety
  const extra = [];
  if (parkMult && parkMult !== 1) extra.push(`park ×${parkMult.toFixed(2)}`);
  if (starterAdj && starterAdj !== 1) extra.push(`starter ×${starterAdj.toFixed(2)}`);
  if (c.platoonAdv) extra.push(`platoon edge`);
  if (c.bvpPA>=6) extra.push(`BvP ${c.bvpHR}/${c.bvpPA}`);
  if (latent>0.35) extra.push(`latent ${(latent*100).toFixed(0)}%`);
  if (edge) extra.push(`edge ${(edge*100).toFixed(1)}%`);
  if (extra.length) lines.push(extra.slice(0,2).join(" • "));

  return lines.join(". ") + ".";
}

export function scoreHRPick(cIn){
  const c = { ...cIn };
  const bats = (c.bats || c.batterHand || c.handedBat || "").toUpperCase();
  const oppThrows = (c.oppThrows || c.pitcherThrows || c.starterThrows || "").toUpperCase();
  const iso_vs_r = c.iso_vs_rhp ?? c.iso_v_r ?? c.iso_vr ?? null;
  const iso_vs_l = c.iso_vs_lhp ?? c.iso_v_l ?? c.iso_vl ?? null;
  const seasonISO = c.iso ?? c.ISO ?? c.seasonISO ?? c.season_iso ?? null;
  const barrel = c.barrelRate ?? c.barrel_rate ?? c.brls_pa ?? c.barrels_per_pa ?? null;
  const pull = c.pullPct ?? c.pull_rate ?? c.pullRate ?? null;
  const fb   = c.fbPct ?? c.fb_rate ?? c.flyballRate ?? null;
  const recent = c.recentHRperPA ?? c.hr_per_pa_l15 ?? c.l15_hr_pa ?? 0;
  const expPA = c.expPA ?? c.pa ?? 4;
  const bvpPA = c.bvpPA ?? c.bvp_pa ?? 0;
  const bvpHR = c.bvpHR ?? c.bvp_hr ?? 0;
  const venue = c.venue || c.park || c.venueName || c.venue_name || null;
  const starterHR9 = c.starterHR9 ?? c.pitcherHR9 ?? c.oppStarterHR9 ?? 1.10;
  const implied_cons = c.implied_consensus ?? probFromAmerican(c.consensusOddsAmerican ?? c.oddsAmerican);

  // Reliability head (R)
  const splitISO = oppThrows === "L" ? iso_vs_l : oppThrows === "R" ? iso_vs_r : null;
  const iso_base = shrinkIso(splitISO, seasonISO, 0.170);
  const base_hr_pa = clamp(0.02 + 0.85*(iso_base||0) + 0.60*(barrel||0), 0.015, 0.28);

  const parkMult     = clamp(venueHRFactor(venue), ...BOUNDS.park);
  const starterAdj   = clamp(starterHR9/1.10, ...BOUNDS.starter);
  const profileAdj   = (pull != null || fb != null) ? clamp(1.0 + Math.max(0,(pull||0)-0.40)*0.25 + Math.max(0,(fb||0)-0.35)*0.35, ...BOUNDS.profile) : 1.00;
  const recentAdj    = recent > 0 ? clamp(0.90 + 6*recent, ...BOUNDS.recent) : 1.0;
  const bvpAdj       = (bvpPA >= 6 && bvpHR > 0) ? clamp(1.0 + (bvpHR / bvpPA) * 2.0, ...BOUNDS.bvp) : 1.0;
  const platoonAdv   = (bats==="L" && oppThrows==="R") || (bats==="R" && oppThrows==="L");
  const platoonAdj   = platoonAdv ? 1.07 : 1.00;

  const p_pa_skill = clamp(base_hr_pa * parkMult * starterAdj * profileAdj * recentAdj * bvpAdj * platoonAdj, 0.003, 0.40);
  const p_game_skill = clamp(p_pa_skill * (expPA/4), 0.01, 0.60);

  const alpha = 0.75;
  const p_R_precal = (implied_cons != null)
    ? clamp(alpha*p_game_skill + (1-alpha)*implied_cons, 0.01, 0.60)
    : p_game_skill;
  const p_R = calibrate_R(p_R_precal);

  // Latent power
  const latentFB   = fb != null ? clamp((fb-0.35)/0.20, 0, 1) : 0;
  const latentPull = pull != null ? clamp((pull-0.40)/0.20, 0, 1) : 0;
  const latentRecent = clamp(recent/0.03, 0, 1);
  const latentScore = clamp(0.5*latentFB + 0.4*latentPull + 0.3*latentRecent, 0, 1);

  // Value head
  const edge_quality = (implied_cons != null) ? clamp(p_game_skill - implied_cons, -0.15, 0.15) : 0;
  const stability = c.oddsSourceCount != null ? clamp((c.oddsSourceCount-1)/3, 0, 1) : 0;
  const fragility = (bvpPA>0 && bvpPA<6 ? 0.5 : 0) + (recent>0.025 ? 0.1 : 0);
  const rawBoost = 1 + 0.6*edge_quality + 0.2*stability + 0.25*latentScore - 0.25*fragility;
  const boost = clamp(rawBoost, 0.90, 1.25);

  const p_V_precal = clamp(p_R * boost, 0.01, 0.60);
  const p_V = calibrate_V(p_V_precal);

  // Blend
  const p_final = clamp(W_R*p_R + (1-W_R)*p_V, 0.01, 0.60);

  // Human WHY (varied)
  c._ctx = { parkMult, starterAdj };
  c.platoonAdv = platoonAdv;
  const why2 = craftHumanWhy({
    ...c,
    iso_vs_rhp: iso_vs_r, iso_vs_lhp: iso_vs_l,
    latentScore, edgeQuality: edge_quality
  });

  return {
    ...cIn,
    p_R, p_V, p_final,
    p_model: p_final,
    p_blended: p_final,
    modelAmerican: americanFromProb(p_final),
    latentScore,
    edgeQuality: edge_quality,
    why2
  };
}
