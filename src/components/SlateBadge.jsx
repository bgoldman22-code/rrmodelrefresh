import React from "react";
import { todayISO_ET } from "../utils/date.js";

export default function SlateBadge({ label = "Slate (ET)" }){
  const slate = todayISO_ET();
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs font-medium">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      {label}: <strong className="ml-1">{slate}</strong>
    </span>
  );
}
