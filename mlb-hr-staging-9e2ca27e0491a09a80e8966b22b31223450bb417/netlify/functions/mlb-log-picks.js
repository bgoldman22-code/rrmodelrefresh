import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  try{
    if(req.method !== 'POST'){
      return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
    }
    const bodyText = await req.text();
    let body = {};
    try{ body = JSON.parse(bodyText || '{}'); }catch{}
    const date = String(body?.date || '').slice(0,10);
    const picks = Array.isArray(body?.picks) ? body.picks : null;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'bad-date', message: 'Expected YYYY-MM-DD' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if(!picks){
      return new Response(JSON.stringify({ error: 'bad-body', message: 'Missing picks[]' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // sanitize picks minimally
    const clean = picks.map(p => ({
      name: String(p?.name || ''),
      teamAbbr: p?.team || p?.teamAbbr || null,
      gameId: String(p?.gameId || ''),
      gameCode: String(p?.gameCode || ''),
      mlbId: p?.mlbId || null,
      prob: Number(p?.hr_prob_fgb || p?.prob || 0)
    }));

    const store = getStore('mlb-logs');
    const key = `predictions/${date}.json`;
    const payload = { date, picks: clean, ts: Date.now() };
    await store.set(key, JSON.stringify(payload));

    return new Response(JSON.stringify({ ok:true, saved: clean.length }), { headers: { 'content-type': 'application/json' } });
  }catch(e){
    return new Response(JSON.stringify({ error: 'log-failed', message: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
