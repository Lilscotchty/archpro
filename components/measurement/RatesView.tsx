// components/measurement/RatesView.tsx — the rate library behind every priced line.
import React, { useState } from 'react';
import { BoqState } from './useBoqState';
import { NumInput } from './fields';
import { UI, MONO, btnGhost, btnPrimary, inputCls } from '../ui';
import { DEFAULT_RATES } from '../../utils/boq/rates';
import { RateItem } from '../../utils/boq/types';

export const RatesView: React.FC<{ s: BoqState }> = ({ s }) => {
  const [q, setQ] = useState('');
  const [mul, setMul] = useState(1);
  const keys = Object.keys(s.rates).filter(k => (k + s.rates[k].label).toLowerCase().includes(q.toLowerCase())).sort();
  return (
    <div className="max-w-4xl mx-auto grid gap-3">
      <div className="border rounded-[3px] p-3 text-xs" style={{ borderColor: UI.warn + '88', color: UI.warn }}>
        These are placeholder rates so the bill is not blank. They are not a price list. Replace them with current supplier, subcontractor and market rates for your location before using any total.
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input className={inputCls + ' w-64'} placeholder="Filter rates" value={q} onChange={e => setQ(e.target.value)} />
        <span className="flex-1" />
        <span className="text-xs" style={{ color: UI.dim }}>Multiply every rate by</span>
        <NumInput className={inputCls + ' w-20 text-right'} value={mul} onChange={setMul} />
        <button className={btnPrimary} onClick={() => { if (mul > 0) s.setRates(r => Object.fromEntries((Object.entries(r) as [string, RateItem][]).map(([k, v]) => [k, { ...v, rate: Math.round(v.rate * mul * 100) / 100 }]))); setMul(1); }}>Apply</button>
        <button className={btnGhost} onClick={() => { if (confirm('Restore all rates to the placeholder defaults?')) s.setRates(DEFAULT_RATES); }}>Restore defaults</button>
      </div>
      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
        <table className="w-full text-xs">
          <thead style={{ color: UI.dim }}><tr><th className="px-3 py-1.5 text-left font-medium w-36">Key</th><th className="px-2 py-1.5 text-left font-medium">Item</th><th className="px-2 py-1.5 text-left font-medium w-20">Per</th><th className="px-3 py-1.5 text-right font-medium w-32">Rate ({s.assumptions.currency})</th></tr></thead>
          <tbody>
            {keys.map(k => (
              <tr key={k} style={{ borderColor: UI.rule }} className="border-t">
                <td className="px-3 py-1.5" style={{ fontFamily: MONO, color: UI.dim }}>{k}</td>
                <td className="px-2 py-1.5">{s.rates[k].label}</td>
                <td className="px-2 py-1.5" style={{ fontFamily: MONO, color: UI.dim }}>{s.rates[k].unit}</td>
                <td className="px-3 py-1"><NumInput className={inputCls + ' text-right'} value={s.rates[k].rate} onChange={n => s.setRates(r => ({ ...r, [k]: { ...r[k], rate: n } }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
