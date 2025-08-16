\
// src/shims/axios.js
// Minimal axios-compatible shim using fetch.
// Only implements axios.get(url).then(({data})) for our usage.
export default {
  async get(url, opts){
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type')||'';
    let data;
    if (ct.includes('application/json')) data = await r.json();
    else data = await r.text();
    return { data, status: r.status, headers: r.headers };
  }
}
