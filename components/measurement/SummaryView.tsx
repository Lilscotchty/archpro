// components/measurement/SummaryView.tsx — general summary (abstract), mark-ups and tender total.
import React from 'react';
import { BoqState } from './useBoqState';
import { NumInput, fmt } from './fields';
import { UI, MONO, inputCls, tint } from '../ui';
import { scopeNotes } from '../../utils/boq/takeoff';
import { placeholderStats, rateWarning } from '../../utils/boq/pricing';

export const SummaryView: React.FC<{ s: BoqState }> = ({ s }) => {
  const m = s.summary, mk = s.markups, cur = s.assumptions.currency;
  const set = (p: Partial<typeof mk>) => s.setMarkups(x => ({ ...x, ...p }));
  const max = Math.max(1, ...m.sections.map(x => x.total));
  const row = (label: React.ReactNode, amt: number, strong = false) => (
    <tr style={{ borderColor: UI.rule }} className="border-t">
      <td className="px-3 py-2" style={{ fontWeight: strong ? 600 : 400, color: strong ? 'var(--ui-strong)' : UI.text }}>{label}</td>
      <td className="px-3 py-2 text-right" style={{ fontFamily: MONO, fontWeight: strong ? 700 : 400, color: 'var(--ui-strong)' }}>{fmt(amt)}</td>
    </tr>
  );
  const pct = (label: string, k: keyof typeof mk) => (
    <span className="inline-flex items-center gap-2">{label}<NumInput className={inputCls + ' w-16 text-right'} value={mk[k]} onChange={n => set({ [k]: n } as Partial<typeof mk>)} />%</span>
  );
  return (
    <div className="max-w-5xl mx-auto grid gap-4">
      {(() => { const w = rateWarning(placeholderStats(s.priced, s.rates, s.overrides)); return w ? <div className="text-xs border rounded-[var(--ui-r)] p-2" style={{ borderColor: tint(UI.danger, 24), background: tint(UI.danger, 6), color: UI.danger }}>{w}</div> : null; })()}
      <div className="grid grid-cols-3 gap-3">
        {[['Net measured works', m.net], ['Tender total', m.grand], [`Per m2 of floor area`, m.perM2]].map(([l, v]) => (
          <div key={l as string} style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[var(--ui-r)] px-3 py-2">
            <div className="text-[11px]" style={{ color: UI.dim }}>{l}</div>
            <div className="text-xl mt-0.5" style={{ fontFamily: MONO, color: 'var(--ui-strong)' }}>{fmt(v as number, 0)}<span className="text-xs" style={{ color: UI.dim }}> {cur}</span></div>
          </div>
        ))}
      </div>
      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[var(--ui-r)] overflow-hidden">
        <table className="w-full text-xs">
          <thead style={{ color: UI.dim }}><tr><th className="px-3 py-1.5 text-left font-medium">Section</th><th className="px-3 py-1.5 text-right font-medium w-36">Amount ({cur})</th><th className="w-48" /></tr></thead>
          <tbody>
            {m.sections.map(x => (
              <tr key={x.code} style={{ borderColor: UI.rule }} className="border-t">
                <td className="px-3 py-1.5"><span style={{ fontFamily: MONO, color: UI.warn }}>{x.code}</span> &nbsp; {x.title}</td>
                <td className="px-3 py-1.5 text-right" style={{ fontFamily: MONO }}>{fmt(x.total)}</td>
                <td className="px-3 py-1.5"><div style={{ background: UI.accent, width: `${(x.total / max) * 100}%`, height: 6, borderRadius: 'var(--ui-r)', opacity: 0.8 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[var(--ui-r)] overflow-hidden">
        <table className="w-full text-xs"><tbody>
          {row('Net measured works', m.net, true)}
          {row(pct('Preliminaries', 'prelimsPct'), m.prelims)}
          {row(pct('Overheads and profit', 'ohpPct'), m.ohp)}
          {row(pct('Contingency', 'contingencyPct'), m.contingency)}
          {row('Sub-total', m.subtotal, true)}
          {row(pct('Taxes and levies', 'taxPct'), m.tax)}
          {row(`Tender total (${cur})`, m.grand, true)}
        </tbody></table>
      </div>
      <div className="text-[11px]" style={{ color: UI.dim }}>Preliminaries apply to net works; overheads and profit to works plus preliminaries; contingency to the running total; taxes to the sub-total. Set the tax and levy percentage that applies to your project.</div>
      <div style={{ borderColor: UI.rule, background: UI.raised }} className="border rounded-[var(--ui-r)] p-3">
        <div className="text-xs font-semibold mb-1" style={{ color: 'var(--ui-strong)' }}>Basis of the take-off</div>
        <ol className="list-decimal pl-4 text-[11px] space-y-1" style={{ color: UI.dim }}>{scopeNotes(s.assumptions).map((n, i) => <li key={i}>{n}</li>)}</ol>
      </div>
    </div>
  );
};
