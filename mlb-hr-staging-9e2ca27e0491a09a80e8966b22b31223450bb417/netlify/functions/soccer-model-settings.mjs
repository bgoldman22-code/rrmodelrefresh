// netlify/functions/soccer-model-settings.mjs
import { getStore } from '@netlify/blobs';

export async function handler(event) {
  const store = getStore('soccer-learn');
  const method = event.httpMethod || 'GET';
  if(method === 'GET') {
    const cal = (await store.get('calibration', { type: 'json' })) || {};
    return json(200, { ok:true, calibration: cal });
  }
  if(method === 'POST') {
    try {
      const body = JSON.parse(event.body||'{}');
      await store.set('calibration', JSON.stringify(body||{}));
      return json(200, { ok:true });
    } catch(e) {
      return json(500, { ok:false, message:String(e) });
    }
  }
  return json(405, { ok:false, message:'method-not-allowed' });
}
function json(code,obj){ return { statusCode:code, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(obj) }; }
