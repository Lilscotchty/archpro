// components/measurement/BillView.tsx — the priced bill of quantities with editable quantities and rates.
import React, { useState } from 'react';
import { BoqState } from './useBoqState';
import { NumInput, TextInput, Select, fmt } from './fields';
import { Empty, Icon, Tag, UI, MONO, btnGhost, btnPrimary, inputCls, tint } from '../ui';
import { PricedLine, placeholderStats, rateWarning } from '../../utils/boq/pricing';
import { SECTIONS } from '../../utils/boq/types';
import { refOf } from '../../utils/boq/export';

export const BillView: React.FC<{ s: BoqState }> = ({ s }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [nl, setNl] = useState({ section: 'PS', description: '', qty: 1, unit: 'item', rate: 0 });
  const cur = s.assumptions.currency;
  const setOv = (key: string, p: { qty?: number; rate?: number; omit?: boolean }, l: PricedLine) => s.setOverrides(o => {
    const next = { ...(o[key] ?? {}), ...p };
    if (next.qty !== undefined && Math.abs(next.qty - l.autoQty) < 1e-9) delete next.qty;
    if (next.omit === false) delete next.omit;
    const out = { ...o, [key]: next };
    if (Object.keys(next).length === 0) delete out[key];
    return out;
  });
  const total = s.summary.sections;
  if (total.length === 0 && s.customs.length === 0)
    return <Empty icon="measure" title="Nothing to measure yet" hint="Draw walls in the Drafting Studio, or add walls on the Schedule tab, or read a drawing on the AI tab. The bill builds itself as you go." />;

  return (
    <div className="max-w-6xl mx-auto grid gap-4">
      {(() => { const w = rateWarning(placeholderStats(s.priced, s.rates, s.overrides)); return w ? <div className="text-xs border rounded-[3px] p-2" style={{ borderColor: tint(UI.danger, 53), color: UI.danger }}>{w}</div> : null; })()}
      {(s.model.walls.some(w => w.source === 'ai') || s.model.openings.some(o => o.source === 'ai')) && <div className="text-xs border rounded-[3px] p-2" style={{ borderColor: tint(UI.warn, 53), color: UI.warn }}>Quantities include values the AI read from the drawing. Check the Schedule tab against the drawing, then confirm the Setup assumptions (foundation depth, roof, finishes) that the drawing does not show.</div>}
      {s.built.geo.warnings.map((w, i) => <div key={i} className="text-xs border rounded-[3px] p-2" style={{ borderColor: tint(UI.warn, 53), color: UI.warn }}>{w}</div>)}
      {total.map(sec => (
        <div key={sec.code} style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: UI.rule, background: UI.raised }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--ui-strong)' }}><span style={{ fontFamily: MONO, color: UI.warn }}>{sec.code}</span> &nbsp; {sec.title}</div>
            <div className="text-xs" style={{ fontFamily: MONO }}>{cur} {fmt(sec.total)}</div>
          </div>
          <table className="w-full text-xs">
            <thead style={{ color: UI.dim }}><tr>
              <th className="px-3 py-1.5 text-left w-16 font-medium">Ref</th><th className="px-2 py-1.5 text-left font-medium">Description</th>
              <th className="px-2 py-1.5 text-right w-24 font-medium">Qty</th><th className="px-2 py-1.5 text-left w-14 font-medium">Unit</th>
              <th className="px-2 py-1.5 text-right w-24 font-medium">Rate</th><th className="px-3 py-1.5 text-right w-28 font-medium">Amount</th><th className="w-16" />
            </tr></thead>
            <tbody>
              {sec.lines.map((l, i) => (
                <React.Fragment key={l.key}>
                  <tr style={{ borderColor: UI.rule, opacity: l.omitted ? 0.4 : 1 }} className="border-t align-top">
                    <td className="px-3 py-2" style={{ fontFamily: MONO, color: UI.dim }}>{refOf(sec.code, i)}</td>
                    <td className="px-2 py-2 cursor-pointer" onClick={() => setOpen(open === l.key ? null : l.key)}>
                      <span style={{ textDecoration: l.omitted ? 'line-through' : 'none' }}>{l.description}</span>{' '}
                      {l.basis === 'approx' && <Tag tone="warn">approx</Tag>} {l.basis === 'ps' && <Tag tone="warn">PS</Tag>} {l.custom && <Tag>manual</Tag>}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {l.custom ? <span style={{ fontFamily: MONO }}>{fmt(l.qty)}</span>
                        : <NumInput className={inputCls + ' text-right'} value={l.qty} onChange={n => setOv(l.key, { qty: n }, l)} title={`Calculated: ${l.autoQty}`} />}
                    </td>
                    <td className="px-2 py-2" style={{ color: UI.dim, fontFamily: MONO }}>{l.unit}</td>
                    <td className="px-2 py-1 text-right">
                      {l.custom ? <span style={{ fontFamily: MONO }}>{fmt(l.rate)}</span>
                        : <NumInput className={inputCls + ' text-right'} value={l.rate} onChange={n => setOv(l.key, { rate: n }, l)} />}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ fontFamily: MONO, color: 'var(--ui-strong)' }}>{fmt(l.amount)}</td>
                    <td className="px-1 py-1 text-right whitespace-nowrap">
                      {l.custom
                        ? <button title="Delete item" className="p-1" style={{ color: UI.dim }} onClick={() => s.setCustoms(c => c.filter(x => x.id !== l.key))}><Icon n="trash" s={14} /></button>
                        : <>
                          {l.overridden && <button title="Back to calculated values" className="px-1 text-[11px]" style={{ color: UI.accent }} onClick={() => s.setOverrides(o => { const n = { ...o }; delete n[l.key]; return n; })}>reset</button>}
                          <button title={l.omitted ? 'Include again' : 'Leave out of the bill'} className="px-1 text-[11px]" style={{ color: UI.dim }} onClick={() => setOv(l.key, { omit: !l.omitted }, l)}>{l.omitted ? 'add' : 'omit'}</button>
                        </>}
                    </td>
                  </tr>
                  {open === l.key && (
                    <tr style={{ background: UI.raised }}><td /><td colSpan={6} className="px-2 py-1.5 text-[11px]" style={{ color: UI.dim, fontFamily: MONO }}>
                      workings: {l.calc}{l.overridden ? `  (calculated qty ${l.autoQty})` : ''}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] p-3">
        <div className="text-xs font-semibold mb-2" style={{ color: 'var(--ui-strong)' }}>Add your own item</div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3"><Select value={nl.section} onChange={v => setNl({ ...nl, section: v })} options={SECTIONS.map(x => [x.code, `${x.code} ${x.title}`] as [string, string])} /></div>
          <div className="col-span-4"><TextInput value={nl.description} placeholder="Description" onChange={v => setNl({ ...nl, description: v })} /></div>
          <div className="col-span-1"><NumInput value={nl.qty} onChange={n => setNl({ ...nl, qty: n })} /></div>
          <div className="col-span-1"><TextInput value={nl.unit} onChange={v => setNl({ ...nl, unit: v })} /></div>
          <div className="col-span-2"><NumInput value={nl.rate} onChange={n => setNl({ ...nl, rate: n })} /></div>
          <button className={btnPrimary + ' col-span-1'} disabled={!nl.description.trim() || nl.qty <= 0}
            onClick={() => { s.setCustoms(c => [...c, { id: crypto.randomUUID(), ...nl, description: nl.description.trim() }]); setNl({ ...nl, description: '', qty: 1, rate: 0 }); }}>Add</button>
        </div>
        <div className="text-[11px] mt-1" style={{ color: UI.dim }}>Quantity, unit, rate. For work the take-off does not cover (retaining walls, septic tank, fencing, specials).</div>
      </div>
      <div className="text-[11px]" style={{ color: UI.dim }}>Click a description to see its workings. Edited quantities and rates are kept when the plan changes; use reset to return to calculated values.</div>
    </div>
  );
};
