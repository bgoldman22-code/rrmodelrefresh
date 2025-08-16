// src/App.jsx
import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import MLB from "./MLB.jsx";

// Use React.lazy without top-level await and graceful fallbacks.
const Stub = (label) => () => <div className="p-6">{label} page coming back soon.</div>;

const NFL = React.lazy(() =>
  import("./NFL.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("NFL") }))
);
const Soccer = React.lazy(() =>
  import("./Soccer.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("Soccer") }))
);
const Tracking = React.lazy(() =>
  import("./Tracking.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("Tracking") }))
);
const SB2Hits = React.lazy(() =>
  import("./SB2Hits.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("SB 2+ Hits") }))
);
const AnytimeTD = React.lazy(() =>
  import("./AnytimeTD.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("Anytime TD") }))
);
const NeggCorr = React.lazy(() =>
  import("./NeggCorr.jsx").then(m => ({ default: m.default })).catch(() => ({ default: Stub("NeggCorr") }))
);

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

      <Suspense fallback={<div className="p-6">Loading…</div>}>
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
      </Suspense>
    </BrowserRouter>
  );
}
