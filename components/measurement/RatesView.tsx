// components/measurement/RatesView.tsx — the rate library behind every priced line.
import React, { useRef, useState } from 'react';
import { BoqState } from './useBoqState';
import { NumInput } from './fields';
import { UI, MONO, btnGhost, btnPrimary, inputCls, tint } from '../ui';
import { DEFAULT_RATES, importRatesCsv, ratesToCsv, today } from '../../utils/boq/rates';
import { download } from '../../utils/boq/export';
import { RateItem } from '../../utils/boq/types';

export const RatesView: React.FC<{ s: BoqState }> = ({ s }) => {
  const [q, setQ] = useState('');
  const [mul, setMul] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [src, setSrc] = useState('');
  const placeholders = (Object.values(s.rates) as RateItem[]).filter(r => !r.updated).length;
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const r = importRatesCsv(s.rates, await f.text(), src.trim() || f.name);
      s.setRates(r.rates);
      setMsg(`Imported ${r.applied} rate(s) from ${f.name}.${r.skipped.length ? ` Skipped ${r.skipped.length} row(s) that did not match a rate: ${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? '…' : ''}.` : ''}`);
    } catch (e) { setMsg('Import failed: ' + (e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const keys = Object.keys(s.rates).filter(k => (k + s.rates[k].label).toLowerCase().includes(q.toLowerCase())).sort();
  return (
    <div className="max-w-5xl mx-auto grid gap-3">
      <div className="border rounded-[var(--ui-r)] p-3 text-xs" style={{ borderColor: tint(UI.warn, 24), background: tint(UI.warn, 6), color: UI.warn }}>
        Rates with no date are placeholders so the bill is not blank. They are not a price list. {placeholders} of {Object.keys(s.rates).length} rates are still placeholders. Type your own, or import a CSV of your supplier and subcontractor prices (Export first to get the layout: key, item, unit, rate, source, updated). Rates you enter are dated and marked as yours.
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <button className={btnGhost} onClick={() => download('archpro-rates.csv', ratesToCsv(s.rates))}>Export rates CSV</button>
        <button className={btnGhost} onClick={() => fileRef.current?.click()}>Import rates CSV</button>
        <input className={inputCls + ' w-56'} placeholder="Source label, e.g. Kumasi supplier quotes Nov 2026" value={src} onChange={e => setSrc(e.target.value)} />
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => importFile(e.target.files?.[0])} />
        {msg && <span className="text-xs" style={{ color: msg.startsWith('Import failed') ? UI.danger : UI.ok }}>{msg}</span>}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input className={inputCls + ' w-64'} placeholder="Filter rates" value={q} onChange={e => setQ(e.target.value)} />
        <span className="flex-1" />
        <span className="text-xs" style={{ color: UI.dim }}>Multiply every rate by</span>
        <NumInput className={inputCls + ' w-20 text-right'} value={mul} onChange={setMul} />
        <button className={btnPrimary} onClick={() => { if (mul > 0) s.setRates(r => Object.fromEntries((Object.entries(r) as [string, RateItem][]).map(([k, v]) => [k, { ...v, rate: Math.round(v.rate * mul * 100) / 100 }]))); setMul(1); }}>Apply</button>
        <button className={btnGhost} onClick={() => { if (confirm('Restore all rates to the placeholder defaults?')) s.setRates(DEFAULT_RATES); }}>Restore defaults</button>
      </div>
      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[var(--ui-r)] overflow-hidden">
        <table className="w-full text-xs">
          <thead style={{ color: UI.dim }}><tr><th className="px-3 py-1.5 text-left font-medium w-36">Key</th><th className="px-2 py-1.5 text-left font-medium">Item</th><th className="px-2 py-1.5 text-left font-medium w-20">Per</th><th className="px-2 py-1.5 text-left font-medium w-44">Source / date</th><th className="px-3 py-1.5 text-right font-medium w-32">Rate ({s.assumptions.currency})</th></tr></thead>
          <tbody>
            {keys.map(k => (
              <tr key={k} style={{ borderColor: UI.rule }} className="border-t">
                <td className="px-3 py-1.5" style={{ fontFamily: MONO, color: UI.dim }}>{k}</td>
                <td className="px-2 py-1.5">{s.rates[k].label}</td>
                <td className="px-2 py-1.5" style={{ fontFamily: MONO, color: UI.dim }}>{s.rates[k].unit}</td>
                <td className="px-2 py-1.5" style={{ color: s.rates[k].updated ? UI.ok : UI.warn }}>{s.rates[k].updated ? `${s.rates[k].source || 'manual'} · ${s.rates[k].updated}` : 'placeholder'}</td>
                <td className="px-3 py-1"><NumInput className={inputCls + ' text-right'} value={s.rates[k].rate} onChange={n => s.setRates(r => ({ ...r, [k]: { ...r[k], rate: n, updated: today(), source: r[k].source || 'manual' } }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
