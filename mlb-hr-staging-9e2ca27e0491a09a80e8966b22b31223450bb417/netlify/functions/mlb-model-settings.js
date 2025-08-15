import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  try {
    const store = getStore('mlb');
    const KEY = 'model.json';
    let raw = await store.get(KEY);
    if (!raw) {
      const def = {
        weights: { wPark: 1.00, wWx: 1.00, wBvP: 1.00, wPitch: 1.00, wZone: 1.00, bias: 0.00 },
        calib: { a: 1.0, b: 0.0, n: 0 },
        aggregates: {
          league: { pitch: {}, zone: {} },
          batterPitch: {}, pitcherPitch: {},
          batterZone: {}, pitcherZone: {}
        },
        batterBias: {}
      };
      await store.set(KEY, JSON.stringify(def));
      raw = JSON.stringify(def);
    }
    return new Response(raw, { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'settings-failed', message: String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
