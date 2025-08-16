// netlify/functions/generate_preview.ts
import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type Cand = {
  player?: string;
  name?: string;
  team?: string;
  opp?: string;
  prob_pp?: number;
  why?: string[] | string;
};

function ymdET(now: Date = new Date()): string {
  // Use UTC: Netlify cron will be set to ET; path date can be UTC safely
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,"0");
  const d = String(now.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function normalize(raw: any): Cand[] {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.candidates) ? raw.candidates
    : Array.isArray(raw?.rows) ? raw.rows
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.result?.candidates) ? raw.result.candidates
    : Array.isArray(raw?.payload?.candidates) ? raw.payload.candidates
    : [];
  const out: Cand[] = [];
  for (const it of arr) {
    const rec:any = it?.player ? it : (it?.props || it?.item || it || {});
    const player = rec.player || rec.name || rec.Player || rec.player_name;
    if (!player) continue;
    const why = rec.why || rec.reason || [];
    out.push({
      player,
      team: rec.team || rec.Team || "—",
      opp: rec.opp || rec.Opp || "—",
      prob_pp: Number(rec.prob_pp ?? rec.hr_prob_pp ?? rec.base_prob ?? 3.5),
      why: Array.isArray(why) ? why : String(why||"").split(/[.;] ?/).filter(Boolean),
    });
  }
  return out;
}

export const handler: Handler = async () => {
  try {
    const base = process.env.URL || "";
    const url = `${base}/.netlify/functions/odds-mlb-hr`;
    const res = await fetch(url, { headers: { "accept":"application/json" } });
    if (!res.ok) {
      return { statusCode: 502, body: `generate_preview fetch failed ${res.status}` };
    }
    const ct = res.headers.get("content-type")||"";
    const raw = ct.includes("application/json") ? await res.json() : await res.text();
    const cands = normalize(raw);
    const picks = cands.slice(0, 24); // keep a healthy preview list

    const store = getStore({ name: "picks", consistency: "strong" });
    const date = ymdET();
    const payload = {
      date,
      generated_at: new Date().toISOString(),
      source: "odds-mlb-hr",
      count: picks.length,
      picks
    };
    await store.set(`${date}.preview.json`, JSON.stringify(payload), { contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: picks.length }) };
  } catch (e:any) {
    return { statusCode: 500, body: `generate_preview error: ${e?.message || e}` };
  }
};
