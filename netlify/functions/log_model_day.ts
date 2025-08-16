import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "model-tracker";
const OBJECT = "model_log.jsonl";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    return { statusCode: 500, body: "Supabase env not set" };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const payload = JSON.parse(event.body || "{}");
  if (!payload?.date || !payload?.picks) return { statusCode: 400, body: "Missing date/picks" };

  const { data: fileData } = await supabase.storage.from(BUCKET).download(OBJECT).catch(() => ({ data: null as any }));
  let lines: any[] = [];
  if (fileData) {
    const text = await fileData.text();
    lines = text.trim().length ? text.trim().split("\n").map((l: string) => JSON.parse(l)) : [];
  }

  const idx = lines.findIndex((r) => r.date === payload.date);
  if (idx >= 0) lines[idx] = payload; else lines.push(payload);

  const newBody = lines.map((r) => JSON.stringify(r)).join("\n");
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(OBJECT, newBody, { upsert: true, contentType: "application/jsonl" });
  if (upErr) return { statusCode: 500, body: `Upload error: ${upErr.message}` };

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};