// src/App.jsx
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";

// Lazy pages (no top-level await)
const MLB = lazy(() => import("./MLB.jsx"));
const NFL = lazy(() => import("./NFL.jsx"));
const Soccer = lazy(() => import("./Soccer.jsx"));
const Tracking = lazy(() => import("./Tracking.jsx"));
const SB2Hits = lazy(() => import("./SB2Hits.jsx"));
const AnytimeTD = lazy(() => import("./AnytimeTD.jsx"));
const NeggCorr = lazy(() => import("./NeggCorr.jsx"));

function NavBar(){
  const link = "px-3 py-2 rounded hover:bg-gray-100";
  const active = ({ isActive }) => isActive ? "font-semibold underline" : "";
  return (
    <nav className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-2 flex gap-4 items-center">
        <NavLink to="/" className="text-lg font-bold mr-4">RR Models</NavLink>
        <NavLink to="/mlb" className={({isActive})=>`${link} ${active({isActive})}`}>MLB</NavLink>
        <NavLink to="/nfl" className={({isActive})=>`${link} ${active({isActive})}`}>NFL</NavLink>
        <NavLink to="/soccer" className={({isActive})=>`${link} ${active({isActive})}`}>Soccer</NavLink>
        <NavLink to="/sb-2hits" className={({isActive})=>`${link} ${active({isActive})}`}>SB 2+ Hits</NavLink>
        <NavLink to="/anytime-td" className={({isActive})=>`${link} ${active({isActive})}`}>Anytime TD</NavLink>
        <NavLink to="/neggcorr" className={({isActive})=>`${link} ${active({isActive})}`}>NeggCorr</NavLink>
        <div className="flex-1" />
        <NavLink to="/tracking" className={({isActive})=>`${link} ${active({isActive})}`}>Tracking</NavLink>
      </div>
    </nav>
  );
}

function Landing(){
  const Card = ({to, title, desc}) => (
    <NavLink to={to} className="block border rounded-xl p-4 hover:shadow transition">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-gray-600">{desc}</div>
    </NavLink>
  );
  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card to="/mlb" title="MLB — Home Runs" desc="Daily HR edges with RR guides." />
      <Card to="/nfl" title="NFL" desc="Coming back for season." />
      <Card to="/soccer" title="Soccer" desc="Experimental props." />
      <Card to="/sb-2hits" title="SB 2+ Hits" desc="Same-game, two+ hits builder." />
      <Card to="/anytime-td" title="Anytime TD" desc="Touchdown legs builder." />
      <Card to="/neggcorr" title="NeggCorr" desc="Negative correlation filter." />
      <Card to="/tracking" title="Tracking" desc="Daily logs & learning status." />
    </div>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <NavBar />
      <Suspense fallback={<div className="p-6">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/mlb" element={<MLB />} />
          <Route path="/nfl" element={<NFL />} />
          <Route path="/soccer" element={<Soccer />} />
          {/* aliases to be safe */}
          <Route path="/sb-2hits" element={<SB2Hits />} />
          <Route path="/sb2hits" element={<SB2Hits />} />
          <Route path="/sb" element={<SB2Hits />} />
          <Route path="/anytime-td" element={<AnytimeTD />} />
          <Route path="/anytd" element={<AnytimeTD />} />
          <Route path="/neggcorr" element={<NeggCorr />} />
          <Route path="/negcorr" element={<NeggCorr />} />
          <Route path="/tracking" element={<Tracking />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
