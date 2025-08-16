// netlify/functions/get_model_log.ts
import { createClient } from "@supabase/supabase-js";

export const handler = async (event: any) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        statusCode: 204,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, reason: "supabase_env_missing" })
      };
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const day = (event.queryStringParameters && event.queryStringParameters.day) || null;
    if (!day) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing day" }) };
    }
    const { data, error } = await supabase
      .from("model_logs")
      .select("*")
      .eq("day", day)
      .single();
    if (error) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: error.message }) };
    }
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, data })
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
