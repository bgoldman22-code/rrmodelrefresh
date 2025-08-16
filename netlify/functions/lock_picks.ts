// netlify/functions/lock_picks.ts
import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

function ymdUTC(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,"0");
  const d = String(now.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

export const handler: Handler = async () => {
  try {
    const date = ymdUTC();
    const picksStore = getStore({ name: "picks", consistency: "strong" });

    // 1) Try to use the most recent preview as the source-of-truth for names
    const previewKey = `${date}.preview.json`;
    const previewTxt = await picksStore.get(previewKey, { type: "text" });
    let picks:any[] = [];
    if (previewTxt) {
      try {
        const preview = JSON.parse(previewTxt);
        picks = Array.isArray(preview?.picks) ? preview.picks : [];
      } catch {
        // ignore parse error
      }
    }

    // 2) If no preview, fetch the model function once
    if (!picks.length) {
      const base = process.env.URL || "";
      const url = `${base}/.netlify/functions/odds-mlb-hr`;
      const res = await fetch(url, { headers: { "accept":"application/json" } });
      if (!res.ok) {
        return { statusCode: 502, body: `lock_picks fetch failed ${res.status}` };
      }
      const ct = res.headers.get("content-type")||"";
      const raw = ct.includes("application/json") ? await res.json() : await res.text();
      const arr = Array.isArray(raw) ? raw
        : Array.isArray(raw?.candidates) ? raw.candidates
        : Array.isArray(raw?.rows) ? raw.rows
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.result?.candidates) ? raw.result.candidates
        : Array.isArray(raw?.payload?.candidates) ? raw.payload.candidates
        : [];
      picks = arr.slice(0, 24);
    }

    // Shape locked payload
    const payload = {
      date,
      locked_at_et: "11:00",
      model_version: process.env.MODEL_VERSION || "unknown",
      code_sha: process.env.COMMIT_REF || "unknown",
      picks
    };

    await picksStore.set(`${date}.json`, JSON.stringify(payload), { contentType: "application/json" });
    return { statusCode: 200, body: JSON.stringify({ ok: true, count: picks.length }) };
  } catch (e:any) {
    return { statusCode: 500, body: `lock_picks error: ${e?.message || e}` };
  }
};
