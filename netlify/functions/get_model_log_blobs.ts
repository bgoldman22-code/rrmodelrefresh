// netlify/functions/get_model_log_blobs.ts
import { createClient } from "@netlify/blobs";

export const handler = async (event: any) => {
  try {
    const day = event.queryStringParameters?.day;
    if (!day) return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing day" }) };

    const store = createClient({ token: process.env.NETLIFY_BLOBS_TOKEN });
    const bucket = store.getStore("model-logs");
    const res = await bucket.get(`logs/${day}.json`);
    if (!res) return { statusCode: 404, body: JSON.stringify({ ok: false, error: "not found" }) };

    const text = await res.text();
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, data: JSON.parse(text) }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
