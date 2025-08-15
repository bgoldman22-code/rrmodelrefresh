export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    if(dry) return new Response(JSON.stringify({ ok:true, dry:true, date, version:"v2-shim" }), { headers:{ "content-type":"application/json" } });
    return new Response(JSON.stringify({ ok:true, status:"ok", date, version:"v2-shim" }), { headers:{ "content-type":"application/json" } });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e), version:"v2-shim" }), { status:200, headers:{ "content-type":"application/json" } });
  }
};