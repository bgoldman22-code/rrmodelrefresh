// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

// Existing pages in your repo
import MLB from "./MLB.jsx";
import NFL from "./NFL.jsx";
import Soccer from "./Soccer.jsx";

// New pages I gave you
import MLB_SB from "./MLB_SB.jsx";
import MLB_HITS2 from "./MLB_HITS2.jsx";
import NFL_NegCorr from "./NFL_NegCorr.jsx";
import FooterDiagnostics from "./components/FooterDiagnostics.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex gap-4 text-sm">
            <Link to="/" className="font-semibold">Home</Link>
            <Link to="/mlb">MLB HR</Link>
            <Link to="/mlb-sb">MLB SB</Link>
            <Link to="/mlb-hits2">MLB 2+ Hits</Link>
            <Link to="/nfl">NFL TD</Link>
            <Link to="/nfl-negcorr">NFL NegCorr</Link>
            <Link to="/soccer">Soccer AGS</Link>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto p-4">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mlb" element={<MLB />} />
            <Route path="/mlb-sb" element={<MLB_SB />} />
            <Route path="/mlb-hits2" element={<MLB_HITS2 />} />
            <Route path="/nfl" element={<NFL />} />
            <Route path="/nfl-negcorr" element={<NFL_NegCorr />} />
            <Route path="/soccer" element={<Soccer />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        

        <FooterDiagnostics />
</div>
      </div>
    </BrowserRouter>
  );
}

function Home() {
  return (
    <div className="bg-white p-8 rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-2">Round Robin Sports Props</h1>
      <p className="text-gray-600">
        Pick a page above to generate model-based picks and round-robin suggestions.
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="bg-white p-8 rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-gray-600">Use the navbar links to navigate.</p>
    </div>
  );
}