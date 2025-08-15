// Ensure a minimum number of picks by relaxing only the COUNT constraint,
// while still respecting max players per game.
// selected: current picks array [{ gameKey, ... }]
// pool: full candidate array (sorted best-first) [{ gameKey, ... }]
export function ensureMinPicks(selected, pool, minCount = 6, maxPerGame = 2){
  const out = selected.slice();
  if(out.length >= minCount) return out;

  const perGame = new Map();
  for(const p of out){
    const k = p.gameKey || p.game || p.gameId; // be tolerant to field names
    perGame.set(k, (perGame.get(k)||0)+1);
  }
  for(const c of pool){
    if(out.length >= minCount) break;
    // skip dup exact player if already present
    if(out.find(x => (x.id && c.id && x.id===c.id) || (x.name===c.name && (x.gameKey||x.game)===(c.gameKey||c.game)))) continue;
    const k = c.gameKey || c.game || c.gameId;
    const used = perGame.get(k)||0;
    if(used >= maxPerGame) continue;
    out.push(c);
    perGame.set(k, used+1);
  }
  return out;
}
