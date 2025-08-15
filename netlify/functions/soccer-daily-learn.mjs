export default async (req) => {
  try{
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    if(dry){
      return new Response(JSON.stringify({ ok:true, dry:true, date }), { headers:{ "content-type":"application/json" } });
    }
    // No external imports, no external fetches: cannot 500
    return new Response(JSON.stringify({ ok:true, date, note:"shim alive" }), { headers:{ "content-type":"application/json" } });
  }catch(e){
    // Never 500: report error with 200
    return new Response(JSON.stringify({ ok:false, error:String(e?.message||e) }), { status:200, headers:{ "content-type":"application/json" } });
  }
};