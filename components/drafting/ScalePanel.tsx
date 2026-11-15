// components/drafting/ScalePanel.tsx
// Scale and underlay controls. Two ways to set the scale of a traced drawing:
//   1. two points on a known dimension (same method as the Elevation Studio), or
//   2. the printed scale (1:N) on a known paper size / PDF page.
import React, { useMemo, useState } from 'react';
import { ProjectState, Underlay } from '../../types';
import { Pt, dist, fmtMm } from '../../utils/drafting/geometry';
import { PAPER_SIZES, STANDARD_SCALES, mmPerPxDpi, mmPerPxPaper, paperWidthFor } from '../../utils/drafting/scale';
import { Field, Section, Segmented, UI, MONO, btnGhost, btnPrimary, btnDanger, inputCls } from '../ui';
import { NumField, Check } from './fields';
import { DIcon } from './icons';

export type Tool = 'select' | 'pan' | 'wall' | 'rect' | 'door' | 'window' | 'grid' | 'measure' | 'scale' | 'align';

interface Props {
  project: ProjectState;
  tool: Tool;
  setTool: (t: Tool) => void;
  calPts: [Pt, Pt] | null;
  cancelCal: () => void;
  applyTwoPoint: (realMm: number) => void;
  applyPrinted: (mmPerPx: number, method: string) => void;
  patchUnderlay: (p: Partial<Underlay>) => void;
  onReplace: () => void;
  onRemove: () => void;
  onPage: (n: number) => void;
  onUpload: () => void;
  busy: boolean;
}

export const ScalePanel: React.FC<Props> = ({ project, tool, setTool, calPts, cancelCal, applyTwoPoint, applyPrinted, patchUnderlay, onReplace, onRemove, onPage, onUpload, busy }) => {
  const u = project.underlay;
  const [mode, setMode] = useState<'points' | 'printed'>('points');
  const [real, setReal] = useState('');
  const [unitSel, setUnitSel] = useState<'mm' | 'm'>('m');
  const [denom, setDenom] = useState(100);
  const [paper, setPaper] = useState('A3');
  const [dpi, setDpi] = useState(0);

  const measured = calPts ? dist(calPts[0], calPts[1]) : 0;
  const realMm = (parseFloat(real.replace(',', '.')) || 0) * (unitSel === 'm' ? 1000 : 1);

  const printed = useMemo(() => {
    if (!u) return null;
    const pxW = project.imageWidth, pxH = project.imageHeight;
    let k = 0, src = '';
    if (u.kind === 'pdf' && u.paperMm) { k = mmPerPxPaper(u.paperMm.w, pxW, denom); src = `PDF page ${Math.round(u.paperMm.w)} × ${Math.round(u.paperMm.h)} mm`; }
    else if (dpi > 0) { k = mmPerPxDpi(dpi, denom); src = `${dpi} dpi`; }
    else { k = mmPerPxPaper(paperWidthFor(paper, pxW, pxH), pxW, denom); src = `${paper} sheet`; }
    return { k, src, widthM: (k * pxW) / 1000, heightM: (k * pxH) / 1000 };
  }, [u, project.imageWidth, project.imageHeight, denom, paper, dpi]);

  if (!u) {
    return (
      <Section title="Sheet and scale">
        <p className="text-xs" style={{ color: UI.dim }}>Blank sheet. Everything you draw is in real millimetres, so the grid, snaps and typed lengths are exact. No scale to set.</p>
        <button className={btnGhost + ' w-full'} onClick={onUpload} disabled={busy}><span className="inline-flex items-center gap-2"><DIcon n="upload" s={14} />Add a drawing to trace over</span></button>
      </Section>
    );
  }

  return (
    <>
      <Section title="Drawing scale">
        <div className="text-xs font-mono leading-5" style={{ fontFamily: MONO }}>
          <div style={{ color: u.calibrated ? UI.ok : UI.warn }}>{u.calibrated ? 'Scale set' : 'Scale not set (provisional)'}</div>
          <div>1 px = {u.mmPerPx.toFixed(u.mmPerPx < 10 ? 3 : 2)} mm</div>
          <div style={{ color: UI.dim }}>Drawing spans {((u.mmPerPx * project.imageWidth) / 1000).toFixed(2)} × {((u.mmPerPx * project.imageHeight) / 1000).toFixed(2)} m</div>
          {u.method && <div style={{ color: UI.dim }}>{u.method}</div>}
        </div>
        <Segmented value={mode} onChange={v => setMode(v as 'points' | 'printed')} options={[{ id: 'points', label: 'Two points' }, { id: 'printed', label: 'Printed scale' }]} />

        {mode === 'points' ? (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: UI.dim }}>Pick the two ends of a dimension you know, such as a dimensioned wall or a grid spacing. Zoom in for accuracy. A longer dimension gives a more accurate scale.</p>
            {!calPts ? (
              <button className={btnPrimary + ' w-full'} onClick={() => setTool('scale')} disabled={tool === 'scale'}>{tool === 'scale' ? 'Click the first point…' : 'Pick two points'}</button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-mono" style={{ color: UI.ok }}>Points picked, {fmtMm(measured)} apart at the current scale</div>
                <div className="flex gap-2">
                  <input className={inputCls} inputMode="decimal" autoFocus placeholder="Real length" value={real} onChange={e => setReal(e.target.value)}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && realMm > 0) applyTwoPoint(realMm); }} />
                  <select className="w-16 bg-[var(--ui-bg)] border border-[var(--ui-rule)] rounded-[var(--ui-r)] px-1.5 text-xs font-mono text-[var(--ui-text)]" value={unitSel} onChange={e => setUnitSel(e.target.value as 'mm' | 'm')}><option>m</option><option>mm</option></select>
                </div>
                <div className="flex gap-2">
                  <button className={btnPrimary + ' flex-1'} disabled={!(realMm > 0)} onClick={() => { applyTwoPoint(realMm); setReal(''); }}>Set scale</button>
                  <button className={btnGhost} onClick={() => { cancelCal(); setReal(''); }}>Redo</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: UI.dim }}>Use this when the drawing was exported or printed at an exact scale. Vector PDFs know their page size, so this is exact. Check the result with the Measure tool.</p>
            <Field label="Drawing scale 1 :">
              <div className="flex gap-2">
                <select className="flex-1 bg-[var(--ui-bg)] border border-[var(--ui-rule)] rounded-[var(--ui-r)] px-1.5 py-1.5 text-xs font-mono text-[var(--ui-text)]" value={STANDARD_SCALES.includes(denom) ? denom : 0} onChange={e => Number(e.target.value) && setDenom(Number(e.target.value))}>
                  {STANDARD_SCALES.map(s => <option key={s} value={s}>1 : {s}</option>)}{!STANDARD_SCALES.includes(denom) && <option value={0}>Custom</option>}
                </select>
                <NumField value={denom} onCommit={n => n > 0 && setDenom(n)} min={1} width="w-20" />
              </div>
            </Field>
            {u.kind === 'image' && (
              <Field label="Image printed on">
                <select className="w-full bg-[var(--ui-bg)] border border-[var(--ui-rule)] rounded-[var(--ui-r)] px-1.5 py-1.5 text-xs font-mono text-[var(--ui-text)]" value={dpi > 0 ? 'dpi' : paper} onChange={e => { if (e.target.value === 'dpi') setDpi(150); else { setDpi(0); setPaper(e.target.value); } }}>
                  {Object.keys(PAPER_SIZES).map(p => <option key={p} value={p}>{p} sheet</option>)}<option value="dpi">Known resolution (dpi)</option>
                </select>
              </Field>
            )}
            {u.kind === 'image' && dpi > 0 && <Field label="Resolution"><NumField value={dpi} onCommit={n => n > 0 && setDpi(n)} suffix="dpi" min={10} /></Field>}
            {printed && printed.k > 0 && (
              <div className="text-xs font-mono" style={{ color: UI.dim }}>{printed.src}: 1 px = {printed.k.toFixed(printed.k < 10 ? 3 : 2)} mm, drawing {printed.widthM.toFixed(1)} × {printed.heightM.toFixed(1)} m</div>
            )}
            <button className={btnPrimary + ' w-full'} disabled={!printed || !(printed.k > 0)} onClick={() => printed && applyPrinted(printed.k, `Printed scale 1:${denom} (${printed.src})`)}>Apply scale</button>
          </div>
        )}
      </Section>

      <Section title="Tools">
        <div className="grid grid-cols-2 gap-2">
          <button className={btnGhost} onClick={() => setTool('measure')}>Measure to check</button>
          <button className={btnGhost} onClick={() => setTool('align')} title="Click two points along a line that should be horizontal or vertical">Straighten</button>
        </div>
      </Section>

      <Section title="Underlay">
        <label className="block text-xs" style={{ color: UI.dim }}>Opacity {Math.round(u.opacity * 100)}%
          <input type="range" min={5} max={100} value={Math.round(u.opacity * 100)} onChange={e => patchUnderlay({ opacity: Number(e.target.value) / 100 })} className="w-full" />
        </label>
        <Check checked={u.visible} onChange={v => patchUnderlay({ visible: v })}>Show drawing</Check>
        {u.numPages && u.numPages > 1 && (
          <Field label="PDF page">
            <select className="w-full bg-[var(--ui-bg)] border border-[var(--ui-rule)] rounded-[var(--ui-r)] px-1.5 py-1.5 text-xs font-mono text-[var(--ui-text)]" value={u.page ?? 1} onChange={e => onPage(Number(e.target.value))} disabled={busy}>
              {Array.from({ length: u.numPages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1} of {u.numPages}</option>)}
            </select>
          </Field>
        )}
        <div className="text-[11px] truncate" style={{ color: UI.dim }} title={u.name}>{u.name}</div>
        <div className="flex gap-2">
          <button className={btnGhost + ' flex-1'} onClick={onReplace} disabled={busy}>Replace</button>
          <button className={btnDanger + ' flex-1'} onClick={() => { if (window.confirm('Remove the drawing from this plan? Your walls stay.')) onRemove(); }}>Remove</button>
        </div>
      </Section>
    </>
  );
};
