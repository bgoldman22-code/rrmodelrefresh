import { getStore } from "@netlify/blobs";

export default async (req) => {
  try{
    if(req.method !== "POST"){
      return new Response("Method Not Allowed", { status: 405 });
    }
    const data = await req.json().catch(() => null);
    if(!data || !data.sport || !data.date || !Array.isArray(data.picks)){
      return new Response(JSON.stringify({ ok:false, error:"bad-body" }), { status: 400, headers: { "content-type": "application/json" }});
    }
    const store = getStore("picks-log");
    const key = `${data.sport}/${data.date}.json`;
    const existing = await store.get(key, { type:"json" }) || [];
    existing.push({ ts: new Date().toISOString(), ...data });
    await store.setJSON(key, existing);

    return new Response(JSON.stringify({ ok:true, key, count: existing.length }), { headers: { "content-type": "application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error: String(e?.message || e) }), { status: 500, headers: { "content-type": "application/json" }});
  }
};
