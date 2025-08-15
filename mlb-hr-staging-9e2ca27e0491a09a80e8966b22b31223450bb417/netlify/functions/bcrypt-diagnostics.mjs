// netlify/functions/bcrypt-diagnostics.mjs
// Verifies the bcrypt -> bcryptjs alias works in your functions environment.
import bcrypt from 'bcrypt'; // resolves to bcryptjs via package.json alias/overrides

export default async function handler(request){
  try{
    const salt = await bcrypt.genSalt(4);
    const hash = await bcrypt.hash('ok', salt);
    const match = await bcrypt.compare('ok', hash);
    return new Response(JSON.stringify({ ok:true, impl:'bcryptjs-aliased', match }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error: String(e && e.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
}
