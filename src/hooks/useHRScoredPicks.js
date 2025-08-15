// src/hooks/useHRScoredPicks.js
import { useMemo } from "react";
import { selectHRPicks } from "../models/hr_select.js";

export function useHRScoredPicks(candidates, options){
  return useMemo(() => selectHRPicks(Array.isArray(candidates)?candidates:[], options), [candidates, options]);
}

export default { useHRScoredPicks };
