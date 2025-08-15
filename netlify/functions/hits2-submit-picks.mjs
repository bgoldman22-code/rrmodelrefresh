// netlify/functions/hits2-submit-picks.mjs
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  if((event.httpMethod||'GET') !== 'POST') return json(405, { ok:false, message:'method-not-allowed' });
  try {
    const store = getStore('hits2-learn');
    const body = JSON.parse(event.body||'{}');
    const date = body.date || (new Date().toISOString().slice(0,10));
    const picks = Array.isArray(body.picks)? body.picks : [];
    await store.set(`picks:${date}`, JSON.stringify(picks));
    return json(200, { ok:true, saved:picks.length, date });
  } catch(e) {
    return json(500, { ok:false, message:String(e) });
  }
}
function json(code,obj){ return { statusCode:code, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(obj) }; }
