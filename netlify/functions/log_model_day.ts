// netlify/functions/log_model_day.ts
import { createClient } from "@netlify/blobs";

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    const body = JSON.parse(event.body || "{}");
    const date = body?.date;
    if (!date) return { statusCode: 400, body: "missing date" };

    const store = createClient({ token: process.env.NETLIFY_BLOBS_TOKEN });
    const bucket = store.getStore("model-logs"); // namespace
    await bucket.set(`logs/${date}.json`, JSON.stringify(body, null, 2), { contentType: "application/json" });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
