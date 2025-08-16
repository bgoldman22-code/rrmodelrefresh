\
// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import MLB from "./MLB.jsx";

// If these exist in your repo, your versions will be used.
// The stubs below only load if the files are missing.
let NFL, Soccer, Tracking, SB2Hits, AnytimeTD, NeggCorr;
try { NFL = (await import("./NFL.jsx")).default; } catch { NFL = () => <div className="p-6">NFL page coming back soon.</div>; }
try { Soccer = (await import("./Soccer.jsx")).default; } catch { Soccer = () => <div className="p-6">Soccer page coming back soon.</div>; }
try { Tracking = (await import("./Tracking.jsx")).default; } catch { Tracking = () => <div className="p-6">Tracking dashboard coming soon.</div>; }
try { SB2Hits = (await import("./SB2Hits.jsx")).default; } catch { SB2Hits = () => <div className="p-6">2+ Hits builder coming back soon.</div>; }
try { AnytimeTD = (await import("./AnytimeTD.jsx")).default; } catch { AnytimeTD = () => <div className="p-6">Anytime TD builder coming back soon.</div>; }
try { NeggCorr = (await import("./NeggCorr.jsx")).default; } catch { NeggCorr = () => <div className="p-6">NeggCorr page coming back soon.</div>; }

function Picker(){
  const cards = [
    { to: "/mlb", label: "MLB — HR Picks" },
    { to: "/nfl", label: "NFL" },
    { to: "/soccer", label: "Soccer" },
    { to: "/sb-2hits", label: "SB 2+ Hits" },
    { to: "/anytime-td", label: "Anytime TD" },
    { to: "/negcorr", label: "NeggCorr" },
    { to: "/tracking", label: "Tracking" }
  ];
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Pick a Model</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(c => (
          <Link key={c.to} to={c.to} className="p-4 rounded-lg border hover:bg-gray-50">
            {c.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <nav className="p-3 border-b flex gap-4 text-sm">
        <Link to="/">Pick a Model</Link>
        <Link to="/mlb">MLB</Link>
        <Link to="/nfl">NFL</Link>
        <Link to="/soccer">Soccer</Link>
        <Link to="/sb-2hits">SB 2+Hits</Link>
        <Link to="/anytime-td">Anytime TD</Link>
        <Link to="/negcorr">NeggCorr</Link>
        <Link to="/tracking">Tracking</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Picker/>} />
        <Route path="/mlb" element={<MLB/>} />
        <Route path="/nfl" element={<NFL/>} />
        <Route path="/soccer" element={<Soccer/>} />
        <Route path="/sb-2hits" element={<SB2Hits/>} />
        <Route path="/anytime-td" element={<AnytimeTD/>} />
        <Route path="/negcorr" element={<NeggCorr/>} />
        <Route path="/tracking" element={<Tracking/>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
