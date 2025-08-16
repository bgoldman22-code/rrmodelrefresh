// netlify/functions/fd-proxy.js
// Simple proxy for football-data.org so the browser doesn't expose your token.
const BASE = 'https://api.football-data.org';

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || ('https://host'+event.path));
    const path = url.searchParams.get('path') || '/v4/matches';
    url.searchParams.delete('path');

    const token = process.env.FOOTBALL_DATA_KEY || process.env.VITE_FOOTBALL_DATA_KEY;
    if(!token){
      return json(500, { ok:false, where:'env', message:'Missing FOOTBALL_DATA_KEY' });
    }

    const target = new URL(path, BASE);
    for (const [k,v] of url.searchParams.entries()) target.searchParams.set(k, v);

    const resp = await fetch(target.toString(), {
      headers: { 'X-Auth-Token': token, 'Accept': 'application/json' }
    });

    const text = await resp.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw:text }; }

    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(body)
    };
  } catch (e) {
    return json(500, { ok:false, where:'proxy', message: String(e) });
  }
};

function json(code, obj){
  return {
    statusCode: code,
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(obj)
  };
}
