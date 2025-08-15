import React, { useState } from "react";
import { todayISO_ET } from "../utils/date.js";

export default function SavePicksButton({ sport = "mlb_hr", picks = [], dateISO }){
  const [status, setStatus] = useState("");
  const date = dateISO || todayISO_ET();

  async function save(){
    try{
      setStatus("saving");
      const r = await fetch("/.netlify/functions/save-picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sport, date, picks }),
      });
      const j = await r.json();
      if(!r.ok || !j.ok){
        setStatus("error");
      }else{
        setStatus("saved");
      }
    }catch(e){
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={save} disabled={!Array.isArray(picks) || picks.length===0 || status==="saving"}
        className="px-3 py-1 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
        {status==="saving" ? "Saving…" : "Save today’s picks"}
      </button>
      {status==="saved" && <span className="text-xs text-emerald-700">Saved!</span>}
      {status==="error" && <span className="text-xs text-red-600">Failed</span>}
    </div>
  );
}
