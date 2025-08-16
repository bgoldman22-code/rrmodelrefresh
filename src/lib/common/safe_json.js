// src/lib/common/safe_json.js
export async function fetchJSONFlexible(url){
  const res = await fetch(url);
  const status = res.status;
  let text = "";
  try { text = await res.text(); } catch {}
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status, text, json };
}

// Walk a nested object to find a path that looks like an events array
export function firstEventsArray(obj){
  if (!obj || typeof obj !== "object") return null;
  const q = [obj];
  const seen = new Set();
  while (q.length){
    const cur = q.shift();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur.events)) return cur.events;
    if (Array.isArray(cur.games)) return cur.games;
    if (Array.isArray(cur.matches)) return cur.matches;
    // enqueue children
    for (const v of Object.values(cur)){
      if (v && typeof v === "object") q.push(v);
    }
  }
  return null;
}
