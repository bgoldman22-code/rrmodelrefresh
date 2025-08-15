import React, { useState } from 'react';
import { rrSuggest } from '../utils/rr_suggest';
import { probToAmerican } from '../utils/odds_estimator';

export default function RRSuggestion({ picks }){
  const [unitsBudget, setUnitsBudget] = useState(10);
  const [unitDollars, setUnitDollars] = useState(10);
  const [priceFactor, setPriceFactor] = useState(0.90);

  const plan = rrSuggest(picks, { unitsBudget, unitDollars, priceFactor });

  return (
    <div className="mt-8 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Round Robin Suggestions</h3>
      <div className="flex gap-3 items-end mb-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-600">Daily budget (Units)</label>
          <input type="number" step="0.5" value={unitsBudget} onChange={e=>setUnitsBudget(+e.target.value)} className="border rounded px-2 py-1 w-28" />
        </div>
        <div>
          <label className="block text-xs text-gray-600">$ per 1U</label>
          <input type="number" step="1" value={unitDollars} onChange={e=>setUnitDollars(+e.target.value)} className="border rounded px-2 py-1 w-28" />
        </div>
        <div>
          <label className="block text-xs text-gray-600">Price factor (0.85–1.05)</label>
          <input type="number" step="0.01" min="0.8" max="1.2" value={priceFactor} onChange={e=>setPriceFactor(+e.target.value)} className="border rounded px-2 py-1 w-28" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Size</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600"># Combos</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Units total</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Units/combo</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">$ / combo</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {plan.sizes.map((s,i)=> (
              <tr key={i}>
                <td className="px-3 py-2">{s.size}s</td>
                <td className="px-3 py-2">{s.count}</td>
                <td className="px-3 py-2">{s.unitsForSize.toFixed(2)}U</td>
                <td className="px-3 py-2">{s.unitsPerCombo.toFixed(2)}U</td>
                <td className="px-3 py-2">${s.dollarsPerCombo.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
