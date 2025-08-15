// Netlify Function: fd-proxy
// Proxies football-data.org v4 with the X-Auth-Token header so the browser isn't blocked by CORS.
// Reads the key from process.env.FOOTBALL_DATA_KEY or process.env.VITE_FOOTBALL_DATA_KEY.
// Usage (GET):
//   /.netlify/functions/fd-proxy?endpoint=/competitions/PL/matches&dateFrom=2025-08-14&dateTo=2025-08-18
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context){
  try{
    if(event.httpMethod !== 'GET'){
      return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };
    }
    const key = process.env.FOOTBALL_DATA_KEY || process.env.VITE_FOOTBALL_DATA_KEY;
    if(!key){
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Missing FOOTBALL_DATA_KEY (or VITE_FOOTBALL_DATA_KEY) in Netlify env' }) };
    }
    const params = event.queryStringParameters || {};
    const endpoint = params.endpoint || '';
    if(!endpoint || endpoint[0] !== '/'){
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Provide endpoint starting with /, e.g. /competitions/PL/matches' }) };
    }
    // Build URL
    const base = 'https://api.football-data.org/v4';
    const url = new URL(base + endpoint);
    // Append the rest of params (except endpoint)
    for(const [k,v] of Object.entries(params)){
      if(k === 'endpoint') continue;
      if(v != null && v !== '') url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), { headers: { 'X-Auth-Token': key } });
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: cors({ 'content-type': res.headers.get('content-type') || 'application/json' }),
      body: text
    };
  }catch(err){
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'fd-proxy error', message: String(err) }) };
  }
};

function cors(extra){
  return Object.assign({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization'
  }, extra||{});
}
