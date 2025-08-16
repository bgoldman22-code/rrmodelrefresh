// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MLB from "./MLB.jsx";
import NFL from "./NFL.jsx";
import Soccer from "./Soccer.jsx";
import Tracking from "./Tracking.jsx";

export default function App(){
  return (
    <BrowserRouter>
      <div className="p-4 border-b mb-4 flex gap-4 text-sm">
        <Link to="/">MLB</Link>
        <Link to="/nfl">NFL</Link>
        <Link to="/soccer">Soccer</Link>
        <Link to="/tracking">Tracking</Link>
      </div>
      <Routes>
        <Route path="/" element={<MLB/>} />
        <Route path="/nfl" element={<NFL/>} />
        <Route path="/soccer" element={<Soccer/>} />
        <Route path="/tracking" element={<Tracking/>} />
      </Routes>
    </BrowserRouter>
  );
}
