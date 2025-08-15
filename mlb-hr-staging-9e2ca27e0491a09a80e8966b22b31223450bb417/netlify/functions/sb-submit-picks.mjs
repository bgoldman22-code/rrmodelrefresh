// netlify/functions/sb-submit-picks.mjs
// Stores daily SB picks to Netlify Blobs for learning.
// Requires functions bundler to include "@netlify/blobs" (netlify.toml).

import { getStore } from '@netlify/blobs';

export default async function handler(request) {
  try{
    if(request.method !== 'POST'){
      return resp({ ok:false, error:'method-not-allowed' }, 405);
    }
    let body;
    try{ body = await request.json(); }catch{ body = null; }
    const date = (body && body.date) || new Date().toISOString().slice(0,10);
    const picks = (body && Array.isArray(body.picks)) ? body.picks : [];

    const store = getStore('sb-learn'); // site-wide store
    const key = `picks:${date}`;
    await store.setJSON(key, { date, picks, ts: Date.now() });

    return resp({ ok:true, saved: picks.length, key });
  }catch(e){
    return resp({ ok:false, error: String(e && e.message || e) }, 500);
  }
}

function resp(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8' }
  });
}
