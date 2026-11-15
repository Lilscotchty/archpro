// components/measurement/SchedulePanel.tsx — editable walls, openings and columns that drive the take-off.
import React from 'react';
import { BoqState } from './useBoqState';
import { Check, NumInput, Select, TextInput } from './fields';
import { Icon, Tag, UI, btnGhost, btnPrimary, inputCls } from '../ui';
import { ColumnRow, OpeningRow, WallRow } from '../../utils/boq/types';

const uid = () => crypto.randomUUID();
const th = 'px-2 py-1.5 text-left font-medium text-[11px]';
const srcTag = (s: string) => <Tag tone={s === 'ai' ? 'warn' : s === 'plan' ? 'ok' : 'dim'}>{s}</Tag>;
const Table: React.FC<{ title: string; hint?: string; head: string[]; onAdd: () => void; children: React.ReactNode }> = ({ title, hint, head, onAdd, children }) => (
  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[var(--ui-r)]">
    <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: UI.rule }}>
      <div><div className="text-xs font-semibold" style={{ color: 'var(--ui-strong)' }}>{title}</div>{hint && <div className="text-[11px]" style={{ color: UI.dim }}>{hint}</div>}</div>
      <button className={btnGhost} onClick={onAdd}><span className="inline-flex items-center gap-1"><Icon n="plus" s={13} />Add</span></button>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead style={{ color: UI.dim }}><tr>{head.map(h => <th key={h} className={th}>{h}</th>)}<th /></tr></thead><tbody>{children}</tbody></table></div>
  </div>
);
const Del: React.FC<{ onClick: () => void }> = ({ onClick }) => <button onClick={onClick} title="Delete row" style={{ color: UI.dim }} className="p-1 hover:text-[var(--ui-strong)]"><Icon n="trash" s={14} /></button>;
const td = 'px-2 py-1';

export const SchedulePanel: React.FC<{ s: BoqState; hasPlan: boolean }> = ({ s, hasPlan }) => {
  const { model, setModel } = s;
  const upd = <K extends 'walls' | 'openings' | 'columns'>(k: K, id: string, p: Partial<BoqState['model'][K][number]>) =>
    setModel(m => ({ ...m, [k]: (m[k] as { id: string }[]).map(r => (r.id === id ? { ...r, ...p } : r)) }));
  const del = (k: 'walls' | 'openings' | 'columns', id: string) => setModel(m => ({ ...m, [k]: (m[k] as { id: string }[]).filter(r => r.id !== id) }));
  const extLen = model.walls.filter(w => w.external).reduce((x, w) => x + w.lengthMm, 0) / 1000;
  const intLen = model.walls.filter(w => !w.external).reduce((x, w) => x + w.lengthMm, 0) / 1000;

  return (
    <div className="max-w-5xl mx-auto grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button className={btnPrimary} onClick={s.importFromPlan} disabled={!hasPlan}>Import from Drafting Studio</button>
        <span className="text-[11px]" style={{ color: UI.dim }}>
          {hasPlan ? 'Replaces rows marked plan; rows you added or the AI added are kept.' : 'No walls drawn in the Drafting Studio yet. Draw a plan there, or add rows here, or read a drawing in the Drawing step.'}
        </span>
        <span className="flex-1" />
        <span className="text-[11px]" style={{ color: UI.dim, fontFamily: 'ui-monospace, monospace' }}>external {extLen.toFixed(2)} m · internal {intLen.toFixed(2)} m</span>
      </div>

      <Table title="Walls" hint="Centre-line lengths. Outer walls are detected from the plan, so tick Ext. for any the heuristic missed (L and U shaped plans)."
        head={['Ref', 'Length (mm)', 'Thickness (mm)', 'Ext.', 'Source']}
        onAdd={() => setModel(m => ({ ...m, walls: [...m.walls, { id: uid(), label: `M${m.walls.length + 1}`, lengthMm: 3000, thicknessMm: 150, external: false, source: 'manual' } as WallRow] }))}>
        {model.walls.map(w => (
          <tr key={w.id} style={{ borderColor: UI.rule }} className="border-t">
            <td className={td}><TextInput className={inputCls + ' w-16'} value={w.label} onChange={v => upd('walls', w.id, { label: v })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-24'} value={w.lengthMm} onChange={n => upd('walls', w.id, { lengthMm: n })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-20'} value={w.thicknessMm} onChange={n => upd('walls', w.id, { thicknessMm: n })} /></td>
            <td className={td}><input type="checkbox" checked={w.external} onChange={e => upd('walls', w.id, { external: e.target.checked })} /></td>
            <td className={td}>{srcTag(w.source)}</td><td className={td}><Del onClick={() => del('walls', w.id)} /></td>
          </tr>
        ))}
        {model.walls.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center" style={{ color: UI.dim }}>No walls yet.</td></tr>}
      </Table>

      <Table title="Doors and windows" hint="One row per type and size. Quantity is the number of that type. Rates are applied per m2 of opening."
        head={['Mark', 'Kind', 'Description', 'Width', 'Height', 'Qty', 'Ext.', 'Source']}
        onAdd={() => setModel(m => ({ ...m, openings: [...m.openings, { id: uid(), kind: 'window', mark: `W${m.openings.filter(o => o.kind === 'window').length + 1}`, description: 'Aluminium sliding window, glazed', widthMm: 1200, heightMm: 1200, qty: 1, external: true, source: 'manual' } as OpeningRow] }))}>
        {model.openings.map(o => (
          <tr key={o.id} style={{ borderColor: UI.rule }} className="border-t">
            <td className={td}><TextInput className={inputCls + ' w-14'} value={o.mark} onChange={v => upd('openings', o.id, { mark: v })} /></td>
            <td className={td}><Select className={inputCls + ' w-20'} value={o.kind} onChange={v => upd('openings', o.id, { kind: v as 'door' | 'window' })} options={[['door', 'Door'], ['window', 'Window']]} /></td>
            <td className={td}><TextInput className={inputCls + ' w-56'} value={o.description} onChange={v => upd('openings', o.id, { description: v })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-16'} value={o.widthMm} onChange={n => upd('openings', o.id, { widthMm: n })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-16'} value={o.heightMm} onChange={n => upd('openings', o.id, { heightMm: n })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-12'} value={o.qty} onChange={n => upd('openings', o.id, { qty: Math.max(0, Math.round(n)) })} /></td>
            <td className={td}><input type="checkbox" checked={o.external} onChange={e => upd('openings', o.id, { external: e.target.checked })} /></td>
            <td className={td}>{srcTag(o.source)}</td><td className={td}><Del onClick={() => del('openings', o.id)} /></td>
          </tr>
        ))}
        {model.openings.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center" style={{ color: UI.dim }}>No openings yet.</td></tr>}
      </Table>

      <Table title="Columns" hint="Rectangles drawn in the Drafting Studio are treated as reinforced concrete columns."
        head={['Ref', 'Breadth (mm)', 'Depth (mm)', 'Qty', 'Source']}
        onAdd={() => setModel(m => ({ ...m, columns: [...m.columns, { id: uid(), label: `C${m.columns.length + 1}`, bMm: 225, dMm: 225, qty: 1, source: 'manual' } as ColumnRow] }))}>
        {model.columns.map(c => (
          <tr key={c.id} style={{ borderColor: UI.rule }} className="border-t">
            <td className={td}><TextInput className={inputCls + ' w-16'} value={c.label} onChange={v => upd('columns', c.id, { label: v })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-20'} value={c.bMm} onChange={n => upd('columns', c.id, { bMm: n })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-20'} value={c.dMm} onChange={n => upd('columns', c.id, { dMm: n })} /></td>
            <td className={td}><NumInput className={inputCls + ' w-12'} value={c.qty} onChange={n => upd('columns', c.id, { qty: Math.max(0, Math.round(n)) })} /></td>
            <td className={td}>{srcTag(c.source)}</td><td className={td}><Del onClick={() => del('columns', c.id)} /></td>
          </tr>
        ))}
        {model.columns.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center" style={{ color: UI.dim }}>No columns. Load-bearing walls only.</td></tr>}
      </Table>
      <Check checked={s.assumptions.columnPad} onChange={v => s.setAssumptions(a => ({ ...a, columnPad: v }))} label="Include a pad footing under each column" />
    </div>
  );
};
