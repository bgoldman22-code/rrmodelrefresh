import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "model-tracker";
const OBJECT = "model_log.jsonl";

export const handler: Handler = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    return { statusCode: 500, body: "Supabase env not set" };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const { data, error } = await supabase.storage.from(BUCKET).download(OBJECT);
  if (error && error.message?.includes("Object not found")) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }
  if (error) return { statusCode: 500, body: error.message };

  const text = await data.text();
  const rows = text.trim().length ? text.trim().split("\n").map((l: string) => JSON.parse(l)) : [];
  rows.sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  return { statusCode: 200, body: JSON.stringify(rows) };
};