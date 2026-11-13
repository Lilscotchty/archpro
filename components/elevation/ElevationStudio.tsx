// components/elevation/ElevationStudio.tsx
// Plan (image / PDF) -> calibrate -> trace external walls -> place windows & doors
// -> black-and-white FRONT / REAR / LEFT / RIGHT elevations on an A3 sheet.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlanViewport } from './PlanViewport';
import { OpeningThumb } from './OpeningThumb';
import { MiniPlan } from './MiniPlan';
import { loadPlanFile } from '../../utils/elevation/planLoader';
import { assignMarks, buildSheet, validateModel } from '../../utils/elevation/engine';
import { sheetToSVG, svgToPngBlob } from '../../utils/elevation/svg';
import { DOOR_STYLES, WINDOW_STYLES, styleDefaults } from '../../utils/elevation/symbols';
import {
  DEFAULT_SPECS, ElevationModel, ElevationSpecs, ExtWall, Opening, OpeningKind, OpeningStyle, PlanSide, PlanSource, Pt, RoofType,
} from '../../utils/elevation/types';

type Step = 1 | 2 | 3 | 4;
type Tool = 'calibrate' | 'trace' | 'rect' | 'select' | 'pan' | 'addWindow' | 'addDoor';
interface Doc { walls: ExtWall[]; openings: Opening[] }

export interface ElevationStudioProps {
  onClose: () => void;
  /** optional hand-over from the Drafting Studio */
  initial?: { plan?: PlanSource | null; walls?: ExtWall[] };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const C = { wall: '#e11d48', sel: '#f59e0b', win: '#2563eb', door: '#16a34a', cal: '#7c3aed' };

function projectOnWall(p: Pt, w: ExtWall) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / l2));
  const q = { x: w.x1 + dx * t, y: w.y1 + dy * t };
  return { t, q, d: dist(p, q) };
}

const SIDE_LABEL: Record<PlanSide, string> = { top: 'Top of plan', bottom: 'Bottom of plan', left: 'Left of plan', right: 'Right of plan' };

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block">
    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
  </label>
);
const inputCls = 'w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-400';

export const ElevationStudio: React.FC<ElevationStudioProps> = ({ onClose, initial }) => {
  // ---------------------------------------------------------------- state
  const [step, setStep] = useState<Step>(initial?.plan ? 1 : 1);
  const [tool, setTool] = useState<Tool>('calibrate');
  const [plan, setPlan] = useState<PlanSource | null>(initial?.plan ?? null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfPages, setPdfPages] = useState({ n: 1, page: 1 });
  const fileRef = useRef<File | null>(null);

  const [doc, setDocState] = useState<Doc>({ walls: initial?.walls ?? [], openings: [] });
  const docRef = useRef(doc); docRef.current = doc;
  const history = useRef<Doc[]>([]);
  const mutate = useCallback((fn: (d: Doc) => Doc, record = true) => {
    if (record) { history.current.push(docRef.current); if (history.current.length > 80) history.current.shift(); }
    setDocState(prev => fn(prev));
  }, []);
  const undo = useCallback(() => { const h = history.current.pop(); if (h) setDocState(h); }, []);

  const [specs, setSpecs] = useState<ElevationSpecs>(DEFAULT_SPECS);
  const patchSpecs = (p: Partial<ElevationSpecs>) => setSpecs(s => ({ ...s, ...p }));

  // calibration
  const [calPts, setCalPts] = useState<Pt[]>([]);
  const [calText, setCalText] = useState('');
  const [calUnit, setCalUnit] = useState<'mm' | 'm'>('mm');
  const [cal, setCal] = useState<{ p1: Pt; p2: Pt; distMm: number; mmPerPx: number } | null>(null);

  // wall tracing
  const [ortho, setOrtho] = useState(true);
  const [snapPts, setSnapPts] = useState(true);
  const [chain, setChain] = useState<{ start: Pt; last: Pt; n: number } | null>(null);
  const [hover, setHover] = useState<(Pt & { snapped?: boolean }) | null>(null);
  const [rectDrag, setRectDrag] = useState<{ a: Pt; b: Pt } | null>(null);
  const [selWall, setSelWall] = useState<string | null>(null);

  // openings
  const [nextStyle, setNextStyle] = useState<{ window: OpeningStyle; door: OpeningStyle }>({ window: 'casement', door: 'panel' });
  const [selOpening, setSelOpening] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ wallId: string; t: number } | null>(null);
  const draggingOpening = useRef<string | null>(null);

  // output
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const mmPerPx = cal?.mmPerPx ?? 0;
  const wallById = useMemo(() => new Map(doc.walls.map(w => [w.id, w])), [doc.walls]);
  const wallLenMm = (w: ExtWall) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * (mmPerPx || 1);

  // --------------------------------------------------------------- steps
  const canGo = (s: Step) =>
    s === 1 ? true : s === 2 ? !!plan && !!cal : !!plan && !!cal && doc.walls.length >= 3;

  const goStep = (s: Step) => {
    if (!canGo(s)) return;
    setStep(s); setChain(null); setRectDrag(null); setHover(null); setGhost(null);
    setTool(s === 1 ? 'calibrate' : s === 2 ? 'trace' : s === 3 ? 'select' : 'pan');
  };

  // --------------------------------------------------------------- loading
  const loadFile = async (file: File, page = 1) => {
    setLoading(true); setLoadErr(null);
    try {
      const { plan: p, numPages } = await loadPlanFile(file, page);
      fileRef.current = file;
      setPlan(p);
      setPdfPages({ n: numPages, page });
      setCal(null); setCalPts([]); setCalText('');
      history.current = [];
      setDocState({ walls: [], openings: [] });
      setChain(null); setSelWall(null); setSelOpening(null);
      setTool('calibrate');
    } catch (e: any) {
      setLoadErr(e?.message ?? 'Could not open that file.');
    } finally { setLoading(false); }
  };

  // --------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
      if (typing) return;
      if (e.key === 'Escape') { setChain(null); setRectDrag(null); setCalPts([]); setSelWall(null); setSelOpening(null); setGhost(null); }
      if (e.key === 'Enter') setChain(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selWall) deleteWall(selWall);
        else if (selOpening) deleteOpening(selOpening);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --------------------------------------------------------------- walls
  const deleteWall = (id: string) => { mutate(d => ({ walls: d.walls.filter(w => w.id !== id), openings: d.openings.filter(o => o.wallId !== id) })); setSelWall(null); };
  const deleteOpening = (id: string) => { mutate(d => ({ ...d, openings: d.openings.filter(o => o.id !== id) })); setSelOpening(null); };
  const addWalls = (segs: [Pt, Pt][]) => mutate(d => ({
    ...d, walls: [...d.walls, ...segs.map(([a, b]) => ({ id: uid(), x1: a.x, y1: a.y, x2: b.x, y2: b.y }))],
  }));

  const endpoints = (extra?: Pt): Pt[] => {
    const pts = doc.walls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
    if (extra) pts.push(extra);
    return pts;
  };

  const snap = (raw: Pt, z: number, from?: Pt): Pt & { snapped?: boolean } => {
    const tol = 14 / z;
    const p = { ...raw };
    let fixX = false, fixY = false;
    if (from && ortho) {
      if (Math.abs(p.x - from.x) > Math.abs(p.y - from.y)) { p.y = from.y; fixY = true; } else { p.x = from.x; fixX = true; }
    }
    if (snapPts) {
      const pts = endpoints(chain?.start);
      let best: Pt | null = null, bd = tol;
      for (const q of pts) { const d = dist(raw, q); if (d < bd) { bd = d; best = q; } }
      if (best) return { ...best, snapped: true };
      for (const q of pts) {
        if (!fixX && Math.abs(p.x - q.x) < tol * 0.6) p.x = q.x;
        if (!fixY && Math.abs(p.y - q.y) < tol * 0.6) p.y = q.y;
      }
    }
    return p;
  };

  const nearestWall = (p: Pt, maxD: number) => {
    let best: { w: ExtWall; t: number; d: number } | null = null;
    for (const w of doc.walls) {
      const r = projectOnWall(p, w);
      if (r.d < maxD && (!best || r.d < best.d)) best = { w, t: r.t, d: r.d };
    }
    return best;
  };

  const openingCentre = (o: Opening): Pt | null => {
    const w = wallById.get(o.wallId); if (!w) return null;
    return { x: w.x1 + (w.x2 - w.x1) * o.t, y: w.y1 + (w.y2 - w.y1) * o.t };
  };
  const hitOpening = (p: Pt, z: number): Opening | null => {
    let best: Opening | null = null, bd = 12 / z;
    for (const o of doc.openings) {
      const w = wallById.get(o.wallId); if (!w || !mmPerPx) continue;
      const half = (o.width / 2 / mmPerPx);
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
      const c = openingCentre(o)!;
      const a = { x: c.x - ux * half, y: c.y - uy * half }, b = { x: c.x + ux * half, y: c.y + uy * half };
      const seg: ExtWall = { id: '', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      const d = projectOnWall(p, seg).d;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };

  const clampT = (t: number, widthMm: number, w: ExtWall) => {
    const half = (widthMm / 2) / wallLenMm(w);
    const lo = Math.min(half, 0.5), hi = Math.max(1 - half, 0.5);
    let r = Math.max(lo, Math.min(hi, t));
    if (Math.abs(r - 0.5) < 0.015) r = 0.5;
    return r;
  };

  // --------------------------------------------------------------- viewport handlers
  const onHover = (p: Pt, _e: React.PointerEvent, z: number) => {
    if (step === 2 && (tool === 'trace' || tool === 'rect')) setHover(snap(p, z, tool === 'trace' ? chain?.last : undefined));
    else if (step === 3 && (tool === 'addWindow' || tool === 'addDoor')) {
      const n = nearestWall(p, 28 / z);
      setGhost(n ? { wallId: n.w.id, t: n.t } : null);
    } else if (step === 1 && tool === 'calibrate') setHover(p);
  };

  const onClickPt = (raw: Pt, _e: React.PointerEvent, z: number) => {
    if (step === 1) {
      if (tool !== 'calibrate' || !plan) return;
      setCalPts(prev => (prev.length >= 2 ? [raw] : [...prev, raw]));
      return;
    }
    if (step === 2) {
      if (tool === 'trace') {
        const p = snap(raw, z, chain?.last);
        if (!chain) { setChain({ start: p, last: p, n: 0 }); return; }
        if (dist(p, chain.last) < 3 / z) return;
        addWalls([[chain.last, p]]);
        const closing = chain.n >= 2 && dist(p, chain.start) < 14 / z;
        setChain(closing ? null : { ...chain, last: p, n: chain.n + 1 });
      } else if (tool === 'select') {
        const n = nearestWall(raw, 12 / z);
        setSelWall(n ? n.w.id : null);
      }
      return;
    }
    if (step === 3) {
      const hit = hitOpening(raw, z);
      if (hit) { setSelOpening(hit.id); return; }
      if (tool === 'addWindow' || tool === 'addDoor') {
        const n = nearestWall(raw, 28 / z);
        if (!n || !mmPerPx) { setSelOpening(null); return; }
        const kind: OpeningKind = tool === 'addWindow' ? 'window' : 'door';
        const style = nextStyle[kind === 'window' ? 'window' : 'door'];
        const d = styleDefaults(kind, style);
        const L = wallLenMm(n.w);
        const width = Math.min(d.defW, Math.max(300, Math.floor((L * 0.8) / 50) * 50));
        const o: Opening = {
          id: uid(), wallId: n.w.id, kind, style, t: clampT(n.t, width, n.w), width,
          height: d.defH, sill: kind === 'door' ? 0 : d.defSill,
          level: kind === 'door' ? 0 : 'all', hinge: 'left',
        };
        mutate(dd => ({ ...dd, openings: [...dd.openings, o] }));
        setSelOpening(o.id);
      } else setSelOpening(null);
    }
  };

  const onDoubleClickPt = () => { if (step === 2 && tool === 'trace') setChain(null); };

  const onDragStart = (raw: Pt, _e: React.PointerEvent, z: number): boolean => {
    if (step === 2 && tool === 'rect') { const p = snap(raw, z); setRectDrag({ a: p, b: p }); return true; }
    if (step === 3 && tool === 'select') {
      const hit = hitOpening(raw, z);
      if (hit) { history.current.push(docRef.current); draggingOpening.current = hit.id; setSelOpening(hit.id); return true; }
    }
    return false;
  };
  const onDrag = (raw: Pt, _e: React.PointerEvent, z: number) => {
    if (step === 2 && tool === 'rect') { setRectDrag(r => (r ? { ...r, b: snap(raw, z) } : r)); return; }
    const id = draggingOpening.current;
    if (id) {
      const o = docRef.current.openings.find(x => x.id === id); if (!o) return;
      const w = wallById.get(o.wallId); if (!w) return;
      const t = clampT(projectOnWall(raw, w).t, o.width, w);
      setDocState(d => ({ ...d, openings: d.openings.map(x => (x.id === id ? { ...x, t } : x)) }));
    }
  };
  const onDragEnd = () => {
    if (step === 2 && tool === 'rect' && rectDrag) {
      const { a, b } = rectDrag;
      if (Math.abs(a.x - b.x) > 20 && Math.abs(a.y - b.y) > 20) {
        const c = [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
        addWalls(c.map((p, i) => [p, c[(i + 1) % 4]] as [Pt, Pt]));
      }
      setRectDrag(null);
    }
    draggingOpening.current = null;
  };

  // --------------------------------------------------------------- opening edits
  const selected = doc.openings.find(o => o.id === selOpening) ?? null;
  const patchOpening = (id: string, p: Partial<Opening>) => mutate(d => ({ ...d, openings: d.openings.map(o => (o.id === id ? { ...o, ...p } : o)) }));
  const duplicateOpening = (o: Opening) => {
    const w = wallById.get(o.wallId); if (!w) return;
    const step = (o.width + 300) / wallLenMm(w);
    const t = o.t + step <= 1 - o.width / 2 / wallLenMm(w) ? o.t + step : o.t - step;
    const n: Opening = { ...o, id: uid(), t: clampT(t, o.width, w) };
    mutate(d => ({ ...d, openings: [...d.openings, n] })); setSelOpening(n.id);
  };

  // --------------------------------------------------------------- calibration
  const calPixels = calPts.length === 2 ? dist(calPts[0], calPts[1]) : 0;
  const applyCal = () => {
    const v = parseFloat(calText);
    if (calPts.length !== 2 || !(v > 0) || calPixels < 2) return;
    const mm = calUnit === 'm' ? v * 1000 : v;
    setCal({ p1: calPts[0], p2: calPts[1], distMm: mm, mmPerPx: mm / calPixels });
  };

  // --------------------------------------------------------------- model + output
  const model: ElevationModel = useMemo(() => ({ mmPerPx, walls: doc.walls, openings: doc.openings, specs }), [mmPerPx, doc, specs]);
  const validation = useMemo(() => validateModel(model), [model]);
  const result = useMemo(() => {
    if (step !== 4) return null;
    try { return { sheet: buildSheet(model), error: null as string | null }; }
    catch (e: any) { return { sheet: null, error: e?.message ?? 'Could not build the sheet.' }; }
  }, [step, model]);
  const svgPreview = useMemo(() => (result?.sheet ? sheetToSVG(result.sheet, { responsive: true }) : ''), [result]);
  const marks = useMemo(() => assignMarks(doc.openings, specs.floors), [doc.openings, specs.floors]);

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportSVG = () => { if (result?.sheet) download(new Blob([sheetToSVG(result.sheet)], { type: 'image/svg+xml' }), `elevations_${stamp()}.svg`); };
  const exportPNG = async () => {
    if (!result?.sheet) return;
    setBusy(true); setExportErr(null);
    try {
      const svg = sheetToSVG(result.sheet);
      let blob: Blob;
      try { blob = await svgToPngBlob(svg, 4961, 3508); }
      catch { blob = await svgToPngBlob(svg, 3508, 2480); }
      download(blob, `elevations_${stamp()}.png`);
    } catch (e: any) { setExportErr(e?.message ?? 'PNG export failed – try the SVG download.'); }
    finally { setBusy(false); }
  };
  const printSheet = () => {
    if (!result?.sheet) return;
    const w = window.open('', '_blank');
    if (!w) { setExportErr('Pop-ups are blocked – allow pop-ups to print, or download the SVG.'); return; }
    w.document.write(`<!doctype html><title>Elevations</title><style>@page{size:A3 landscape;margin:0}html,body{margin:0;background:#fff}svg{width:420mm;height:297mm;display:block}</style>${sheetToSVG(result.sheet)}`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  // --------------------------------------------------------------- overlay
  const overlay = (z: number) => {
    const px = (n: number) => n; // stroke widths are screen pixels (non-scaling)
    const fs = 12 / z;
    const label = (x: number, y: number, text: string, color = '#0f172a') => (
      <text x={x} y={y} fontSize={fs} fill={color} stroke="#fff" strokeWidth={3 / z} paintOrder="stroke" textAnchor="middle" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: 600 }}>{text}</text>
    );
    const calLine = (a: Pt, b: Pt, txt?: string) => (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={px(6)} vectorEffect="non-scaling-stroke" />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.cal} strokeWidth={px(2.5)} vectorEffect="non-scaling-stroke" />
        <circle cx={a.x} cy={a.y} r={5 / z} fill={C.cal} /><circle cx={b.x} cy={b.y} r={5 / z} fill={C.cal} />
        {txt && label((a.x + b.x) / 2, (a.y + b.y) / 2 - 8 / z, txt, C.cal)}
      </g>
    );
    return (
      <g>
        {/* calibration */}
        {step === 1 && cal && calPts.length === 0 && calLine(cal.p1, cal.p2, `${Math.round(cal.distMm)} mm`)}
        {step === 1 && calPts.length === 2 && calLine(calPts[0], calPts[1], calText ? `${calText} ${calUnit}` : `${Math.round(calPixels)} px`)}
        {step === 1 && calPts.length === 1 && <circle cx={calPts[0].x} cy={calPts[0].y} r={5 / z} fill={C.cal} />}

        {/* walls */}
        {step >= 2 && doc.walls.map(w => {
          const isSel = w.id === selWall;
          return (
            <g key={w.id}>
              <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#fff" strokeWidth={px(9)} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={isSel ? C.sel : C.wall} strokeWidth={px(5)} strokeLinecap="round" opacity={0.9} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {step === 2 && doc.walls.map(w => (
          <g key={w.id + 'l'}>
            <circle cx={w.x1} cy={w.y1} r={3.5 / z} fill="#fff" stroke={C.wall} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {mmPerPx > 0 && label((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2 - 9 / z, `${Math.round(wallLenMm(w) / 10) * 10}`)}
          </g>
        ))}

        {/* tracing previews */}
        {step === 2 && tool === 'trace' && chain && hover && (
          <g>
            <line x1={chain.last.x} y1={chain.last.y} x2={hover.x} y2={hover.y} stroke={C.wall} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            {mmPerPx > 0 && label((chain.last.x + hover.x) / 2, (chain.last.y + hover.y) / 2 - 9 / z, `${Math.round((dist(chain.last, hover) * mmPerPx) / 10) * 10} mm`, C.wall)}
          </g>
        )}
        {step === 2 && (tool === 'trace' || tool === 'rect') && hover && (
          <circle cx={hover.x} cy={hover.y} r={(hover.snapped ? 7 : 4) / z} fill={hover.snapped ? 'none' : C.wall} stroke={C.wall} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
        {step === 2 && rectDrag && (
          <rect x={Math.min(rectDrag.a.x, rectDrag.b.x)} y={Math.min(rectDrag.a.y, rectDrag.b.y)} width={Math.abs(rectDrag.a.x - rectDrag.b.x)} height={Math.abs(rectDrag.a.y - rectDrag.b.y)}
            fill="none" stroke={C.wall} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        )}

        {/* openings */}
        {step === 3 && doc.openings.map(o => {
          const w = wallById.get(o.wallId); const c = openingCentre(o);
          if (!w || !c || !mmPerPx) return null;
          const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
          const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
          const half = o.width / 2 / mmPerPx;
          const a = { x: c.x - ux * half, y: c.y - uy * half }, b = { x: c.x + ux * half, y: c.y + uy * half };
          const col = o.id === selOpening ? C.sel : o.kind === 'window' ? C.win : C.door;
          return (
            <g key={o.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={13} vectorEffect="non-scaling-stroke" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={9} vectorEffect="non-scaling-stroke" />
              {label(c.x - uy * 18 / z, c.y + ux * 18 / z + 4 / z, marks.tagOf(o), col)}
            </g>
          );
        })}
        {step === 3 && ghost && (tool === 'addWindow' || tool === 'addDoor') && mmPerPx > 0 && (() => {
          const w = wallById.get(ghost.wallId); if (!w) return null;
          const kind: OpeningKind = tool === 'addWindow' ? 'window' : 'door';
          const d = styleDefaults(kind, nextStyle[kind]);
          const L = wallLenMm(w);
          const width = Math.min(d.defW, Math.max(300, Math.floor((L * 0.8) / 50) * 50));
          const t = clampT(ghost.t, width, w);
          const ux = (w.x2 - w.x1) / (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1), uy = (w.y2 - w.y1) / (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1);
          const c = { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
          const half = width / 2 / mmPerPx;
          return <line x1={c.x - ux * half} y1={c.y - uy * half} x2={c.x + ux * half} y2={c.y + uy * half} stroke={kind === 'window' ? C.win : C.door} strokeWidth={9} opacity={0.5} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />;
        })()}
      </g>
    );
  };

  // --------------------------------------------------------------- tool buttons
  const ToolBtn: React.FC<{ id: Tool; icon: string; label: string; onPick?: () => void }> = ({ id, icon, label, onPick }) => (
    <button onClick={() => { setTool(id); setChain(null); setRectDrag(null); onPick?.(); }}
      className={`tool-btn w-full px-3 py-2 rounded flex items-center gap-2 text-sm ${tool === id ? 'active' : 'bg-slate-800'}`}>
      <span>{icon}</span>{label}
    </button>
  );

  const perimeterM = doc.walls.reduce((s, w) => s + wallLenMm(w), 0) / 1000;
  const levelOptions = [{ v: 'all', l: 'Every floor' }, ...Array.from({ length: specs.floors }, (_, i) => ({ v: String(i), l: i === 0 ? 'Ground floor only' : `Floor ${i} only` }))];
  const cursorFor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  // ================================================================= render
  const stepTitles: Record<Step, string> = { 1: 'Plan & scale', 2: 'External walls', 3: 'Windows & doors', 4: 'Elevations' };

  return (
    <div className="flex h-screen w-full text-slate-200 overflow-hidden font-sans">
      {/* ------------------------------------------------ sidebar */}
      <aside className="w-96 shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col z-20">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Elevation Studio</h1>
            <p className="text-[11px] text-slate-400">Plan → front, rear &amp; side elevations (black &amp; white)</p>
          </div>
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">Exit</button>
        </div>

        <div className="px-4 pt-3 pb-2 border-b border-slate-800 grid grid-cols-4 gap-1">
          {([1, 2, 3, 4] as Step[]).map(s => (
            <button key={s} onClick={() => goStep(s)} disabled={!canGo(s)}
              className={`text-[10px] leading-tight py-2 px-1 rounded border ${step === s ? 'bg-blue-600 border-blue-400 text-white' : canGo(s) ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'}`}>
              <div className="font-bold text-sm">{s}</div>{stepTitles[s]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ---------------- STEP 1 */}
          {step === 1 && (
            <>
              <div className="relative p-5 border-2 border-dashed border-slate-600 rounded-xl text-center hover:bg-slate-800 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}>
                <input type="file" accept="image/*,application/pdf,.pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
                <div className="text-3xl mb-1">📐</div>
                <div className="font-bold text-white text-sm">{plan ? 'Replace floor plan' : 'Upload floor plan'}</div>
                <div className="text-xs text-slate-400">Image (PNG, JPG) or PDF · drag &amp; drop works too</div>
                {loading && <div className="mt-2 text-xs text-blue-300 animate-pulse">Reading file…</div>}
              </div>
              {loadErr && <div className="text-xs text-red-300 bg-red-950/50 border border-red-800 rounded p-2">{loadErr}</div>}
              {plan && <div className="text-[11px] text-slate-400 break-all">Loaded: {plan.name} ({plan.width}×{plan.height}px)</div>}

              {pdfPages.n > 1 && fileRef.current && (
                <Field label="PDF page" hint="Pick the page that holds the floor plan (this clears your tracing).">
                  <select className={inputCls} value={pdfPages.page} onChange={e => loadFile(fileRef.current!, Number(e.target.value))}>
                    {Array.from({ length: pdfPages.n }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
                  </select>
                </Field>
              )}

              {plan && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
                  <h3 className="text-xs font-bold text-violet-300 uppercase">Set the scale</h3>
                  <p className="text-xs text-slate-400">Click two points on a dimension you know (e.g. the two ends of a wall that is dimensioned on the plan), then enter its real length.</p>
                  <div className="text-xs">
                    {calPts.length < 2 ? <span className="text-slate-300">Click point {calPts.length + 1} of 2…</span> : <span className="text-emerald-300">Points set ({Math.round(calPixels)} px apart)</span>}
                  </div>
                  {calPts.length === 2 && (
                    <div className="flex gap-2">
                      <input className={inputCls} type="number" min={0} placeholder="Real length" value={calText} onChange={e => setCalText(e.target.value)} />
                      <select className="bg-slate-900 border border-slate-600 rounded px-2 text-sm" value={calUnit} onChange={e => setCalUnit(e.target.value as 'mm' | 'm')}><option>mm</option><option>m</option></select>
                      <button onClick={applyCal} className="px-3 rounded bg-violet-600 hover:bg-violet-500 text-sm font-bold">Set</button>
                    </div>
                  )}
                  {cal && <div className="text-xs text-emerald-300">✓ Scale set: 1 px = {cal.mmPerPx.toFixed(2)} mm</div>}
                  {(calPts.length > 0) && <button onClick={() => setCalPts([])} className="text-xs text-slate-400 hover:text-white underline">Start over</button>}
                </div>
              )}
            </>
          )}

          {/* ---------------- STEP 2 */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase">Select the building's external walls</h3>
                <p className="text-xs text-slate-400">Follow the <b>outer face</b> of the walls. Click each corner in turn; click the first corner again (or double-click / Enter) to finish.</p>
                <ToolBtn id="trace" icon="✏️" label="Trace walls (click corners)" />
                <ToolBtn id="rect" icon="⬜" label="Rectangle (drag diagonal)" />
                <ToolBtn id="select" icon="🖱️" label="Select / delete a wall" />
                <ToolBtn id="pan" icon="✋" label="Pan" />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={ortho} onChange={e => setOrtho(e.target.checked)} /> Keep walls horizontal / vertical</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={snapPts} onChange={e => setSnapPts(e.target.checked)} /> Snap to wall corners</label>
              </div>
              <div className="flex gap-2">
                <button onClick={undo} className="flex-1 py-2 text-sm rounded bg-slate-800 border border-slate-600 hover:bg-slate-700">↶ Undo</button>
                <button onClick={() => setChain(null)} disabled={!chain} className="flex-1 py-2 text-sm rounded bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-40">Finish line</button>
                <button onClick={() => { if (confirm('Remove all traced walls and openings?')) mutate(() => ({ walls: [], openings: [] })); }} className="flex-1 py-2 text-sm rounded bg-slate-800 border border-red-900 text-red-300 hover:bg-red-950">Clear</button>
              </div>
              {selWall && <button onClick={() => deleteWall(selWall)} className="w-full py-2 text-sm rounded bg-red-600/80 hover:bg-red-600 font-bold">Delete selected wall</button>}
              <div className="text-xs text-slate-400">{doc.walls.length} wall segment{doc.walls.length === 1 ? '' : 's'} · perimeter {perimeterM.toFixed(2)} m{doc.walls.length < 3 && ' · need at least 3'}</div>
            </>
          )}

          {/* ---------------- STEP 3 */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase">Place on the external walls</h3>
                <ToolBtn id="addWindow" icon="🪟" label="Add window" />
                <ToolBtn id="addDoor" icon="🚪" label="Add door" />
                <ToolBtn id="select" icon="🖱️" label="Select / drag along wall" />
                <ToolBtn id="pan" icon="✋" label="Pan" />
              </div>

              {!selected && (tool === 'addWindow' || tool === 'addDoor') && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase">{tool === 'addWindow' ? 'Window style' : 'Door style'}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(tool === 'addWindow' ? WINDOW_STYLES : DOOR_STYLES).map(s => {
                      const kind: OpeningKind = tool === 'addWindow' ? 'window' : 'door';
                      const on = nextStyle[kind] === s.id;
                      return (
                        <button key={s.id} onClick={() => setNextStyle(n => ({ ...n, [kind]: s.id }))}
                          className={`rounded border p-1 text-[10px] leading-tight ${on ? 'border-blue-400 bg-blue-950' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}>
                          <OpeningThumb kind={kind} style={s.id} className="w-full h-16 rounded bg-white" />
                          <div className="mt-1">{s.label}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">Hover a wall and click to drop it in. You can fine-tune size and height afterwards.</p>
                </div>
              )}

              {selected && (
                <div className="bg-slate-800 border border-amber-500/60 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-amber-300">{marks.tagOf(selected)} · {selected.kind === 'window' ? 'Window' : 'Door'}</h3>
                    <button onClick={() => setSelOpening(null)} className="text-xs text-slate-400 hover:text-white">Done</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(selected.kind === 'window' ? WINDOW_STYLES : DOOR_STYLES).map(s => (
                      <button key={s.id} onClick={() => patchOpening(selected.id, { style: s.id })}
                        className={`rounded border p-1 text-[10px] leading-tight ${selected.style === s.id ? 'border-blue-400 bg-blue-950' : 'border-slate-700 bg-slate-900 hover:bg-slate-700'}`}>
                        <OpeningThumb kind={selected.kind} style={s.id} hinge={selected.hinge} className="w-full h-14 rounded bg-white" />
                        <div className="mt-1">{s.label}</div>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Width (mm)"><input className={inputCls} type="number" value={selected.width} min={300} step={50} onChange={e => { const w = wallById.get(selected.wallId); const width = Math.max(300, Number(e.target.value) || 300); patchOpening(selected.id, { width, ...(w ? { t: clampT(selected.t, width, w) } : {}) }); }} /></Field>
                    <Field label="Height (mm)"><input className={inputCls} type="number" value={selected.height} min={300} step={50} onChange={e => patchOpening(selected.id, { height: Math.max(300, Number(e.target.value) || 300) })} /></Field>
                    {selected.kind === 'window' && <Field label="Sill height (mm)"><input className={inputCls} type="number" value={selected.sill} min={0} step={50} onChange={e => patchOpening(selected.id, { sill: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
                    <Field label="Appears on">
                      <select className={inputCls} value={String(selected.level)} onChange={e => patchOpening(selected.id, { level: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
                        {levelOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Position along wall">
                    <input type="range" min={0} max={100} value={Math.round(selected.t * 100)} className="w-full"
                      onChange={e => { const w = wallById.get(selected.wallId); if (w) patchOpening(selected.id, { t: clampT(Number(e.target.value) / 100, selected.width, w) }); }} />
                  </Field>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => { const w = wallById.get(selected.wallId); if (w) patchOpening(selected.id, { t: clampT(0.5, selected.width, w) }); }} className="flex-1 py-1.5 rounded bg-slate-700 hover:bg-slate-600">Centre on wall</button>
                    <button onClick={() => patchOpening(selected.id, { hinge: selected.hinge === 'left' ? 'right' : 'left' })} className="flex-1 py-1.5 rounded bg-slate-700 hover:bg-slate-600">Flip hinge</button>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => duplicateOpening(selected)} className="flex-1 py-1.5 rounded bg-slate-700 hover:bg-slate-600">Duplicate</button>
                    <button onClick={() => deleteOpening(selected.id)} className="flex-1 py-1.5 rounded bg-red-600/80 hover:bg-red-600 font-bold">Delete</button>
                  </div>
                  {(selected.kind === 'window' ? selected.sill : 0) + selected.height > specs.floorHeight - 100 && (
                    <div className="text-[11px] text-amber-300">Taller than the storey height set in Step 4 ({specs.floorHeight} mm) – it will be trimmed.</div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-1">Openings ({doc.openings.length})</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {doc.openings.length === 0 && <div className="text-xs text-slate-500">None yet.</div>}
                  {doc.openings.map(o => (
                    <button key={o.id} onClick={() => { setSelOpening(o.id); setTool('select'); }}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded border ${o.id === selOpening ? 'border-amber-400 bg-slate-800' : 'border-slate-800 bg-slate-800/60 hover:bg-slate-800'}`}>
                      <b>{marks.tagOf(o)}</b> · {o.width}×{o.height}{o.kind === 'window' ? ` · sill ${o.sill}` : ''} · {o.level === 'all' ? 'all floors' : o.level === 0 ? 'ground' : `floor ${o.level}`}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={undo} className="w-full py-2 text-sm rounded bg-slate-800 border border-slate-600 hover:bg-slate-700">↶ Undo</button>
            </>
          )}

          {/* ---------------- STEP 4 */}
          {step === 4 && (
            <>
              <Field label="Project name"><input className={inputCls} value={specs.projectName} onChange={e => patchSpecs({ projectName: e.target.value })} /></Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Floors"><input className={inputCls} type="number" min={1} max={6} value={specs.floors} onChange={e => patchSpecs({ floors: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
                <Field label="Floor-to-floor (mm)"><input className={inputCls} type="number" min={2200} step={50} value={specs.floorHeight} onChange={e => patchSpecs({ floorHeight: Math.max(2200, Number(e.target.value) || 3000) })} /></Field>
                <Field label="Plinth height (mm)" hint="ground → ground-floor level"><input className={inputCls} type="number" min={0} step={50} value={specs.plinthHeight} onChange={e => patchSpecs({ plinthHeight: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                <Field label="Eaves overhang (mm)"><input className={inputCls} type="number" min={0} step={50} value={specs.overhang} onChange={e => patchSpecs({ overhang: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Roof type">
                  <select className={inputCls} value={specs.roofType} onChange={e => patchSpecs({ roofType: e.target.value as RoofType })}>
                    <option value="gable">Gable</option><option value="hip">Hip</option><option value="shed">Mono-pitch (shed)</option><option value="flat">Flat + parapet</option>
                  </select>
                </Field>
                {specs.roofType !== 'flat' && <Field label="Pitch (°)"><input className={inputCls} type="number" min={5} max={60} value={specs.roofPitch} onChange={e => patchSpecs({ roofPitch: Math.min(60, Math.max(5, Number(e.target.value) || 25)) })} /></Field>}
                {specs.roofType === 'flat' && <Field label="Parapet (mm)"><input className={inputCls} type="number" min={0} step={50} value={specs.parapet} onChange={e => patchSpecs({ parapet: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
                {(specs.roofType === 'gable' || specs.roofType === 'hip') && (
                  <Field label="Ridge runs">
                    <select className={inputCls} value={specs.ridgeAxis} onChange={e => patchSpecs({ ridgeAxis: e.target.value as ElevationSpecs['ridgeAxis'] })}>
                      <option value="auto">Along longest side</option><option value="x">Left ↔ right on plan</option><option value="y">Up ↕ down on plan</option>
                    </select>
                  </Field>
                )}
                {specs.roofType === 'shed' && (
                  <Field label="High side is">
                    <select className={inputCls} value={specs.shedHigh} onChange={e => patchSpecs({ shedHigh: e.target.value as PlanSide })}>
                      {(Object.keys(SIDE_LABEL) as PlanSide[]).map(s => <option key={s} value={s}>{SIDE_LABEL[s]}</option>)}
                    </select>
                  </Field>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Front of the building is the…</span>
                <div className="grid grid-cols-4 gap-1">
                  {(['top', 'bottom', 'left', 'right'] as PlanSide[]).map(s => (
                    <button key={s} onClick={() => patchSpecs({ frontSide: s })} className={`py-1.5 text-xs rounded border ${specs.frontSide === s ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>{s}</button>
                  ))}
                </div>
                <MiniPlan walls={doc.walls} front={specs.frontSide} />
                <p className="text-[10px] text-slate-500">Rear is the opposite side. Left / right are as seen when standing in front of the building.</p>
              </div>

              <Field label="Drawing scale">
                <select className={inputCls} value={String(specs.scaleDenom)} onChange={e => patchSpecs({ scaleDenom: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
                  <option value="auto">Auto (best fit on A3)</option>
                  {[20, 25, 50, 75, 100, 150, 200, 250].map(s => <option key={s} value={s}>1:{s}</option>)}
                </select>
              </Field>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={specs.showDimensions} onChange={e => patchSpecs({ showDimensions: e.target.checked })} /> Dimension lines</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={specs.showLevels} onChange={e => patchSpecs({ showLevels: e.target.checked })} /> Level markers</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={specs.showTags} onChange={e => patchSpecs({ showTags: e.target.checked })} /> Window / door tags &amp; key</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={specs.showFloorLines} onChange={e => patchSpecs({ showFloorLines: e.target.checked })} /> Floor-level lines</label>
              </div>

              {validation.errors.map((m, i) => <div key={i} className="text-xs text-red-300 bg-red-950/50 border border-red-800 rounded p-2">{m}</div>)}
              {[...validation.warnings, ...(result?.sheet?.warnings ?? [])].map((m, i) => <div key={i} className="text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded p-2">{m}</div>)}
              {result?.sheet && <div className="text-xs text-slate-400">Drawn at 1:{result.sheet.denom} on A3 landscape.</div>}
            </>
          )}
        </div>

        {/* footer nav */}
        <div className="p-3 border-t border-slate-700 flex gap-2">
          <button disabled={step === 1} onClick={() => goStep((step - 1) as Step)} className="px-4 py-2 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700 text-sm disabled:opacity-30">← Back</button>
          {step < 4 ? (
            <button disabled={!canGo((step + 1) as Step)} onClick={() => goStep((step + 1) as Step)} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed">
              {step === 1 ? 'Next: trace external walls →' : step === 2 ? 'Next: windows & doors →' : 'Generate elevations →'}
            </button>
          ) : (
            <div className="flex-1 grid grid-cols-3 gap-1">
              <button onClick={exportPNG} disabled={!result?.sheet || busy} className="py-2 rounded bg-blue-600 hover:bg-blue-500 text-xs font-bold disabled:opacity-40">{busy ? '…' : 'PNG'}</button>
              <button onClick={exportSVG} disabled={!result?.sheet} className="py-2 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold disabled:opacity-40">SVG</button>
              <button onClick={printSheet} disabled={!result?.sheet} className="py-2 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold disabled:opacity-40">Print / PDF</button>
            </div>
          )}
        </div>
        {exportErr && <div className="px-3 pb-3 text-xs text-red-300">{exportErr}</div>}
      </aside>

      {/* ------------------------------------------------ workspace */}
      <main className="flex-1 relative bg-slate-700 min-w-0">
        {step === 4 ? (
          <div className="absolute inset-0 overflow-auto p-6 flex justify-center items-start">
            {result?.error ? (
              <div className="mt-20 max-w-md text-center text-slate-200 bg-slate-800 border border-slate-600 rounded-xl p-6">
                <div className="text-3xl mb-2">⚠️</div><div className="font-bold mb-1">Can’t draw the elevations yet</div>
                <div className="text-sm text-slate-400">{result.error}</div>
              </div>
            ) : (
              <div className="sheet-preview w-full max-w-[1400px]" dangerouslySetInnerHTML={{ __html: svgPreview }} />
            )}
          </div>
        ) : plan ? (
          <PlanViewport
            src={plan.src} width={plan.width} height={plan.height}
            panTool={tool === 'pan'} cursor={cursorFor}
            onHover={onHover} onLeave={() => { setHover(null); setGhost(null); }}
            onClickPt={onClickPt} onDoubleClickPt={onDoubleClickPt}
            onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}
            overlay={overlay}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 border border-slate-600 text-xs text-slate-200 px-3 py-1.5 rounded-full pointer-events-none">
              {step === 1 && (cal ? 'Scale set ✓ — you can continue, or click two new points to change it.' : calPts.length === 0 ? 'Click the first end of a known dimension' : calPts.length === 1 ? 'Click the second end' : 'Enter the real length in the sidebar')}
              {step === 2 && (tool === 'trace' ? (chain ? 'Click the next corner · double-click or Enter to finish' : 'Click the first corner of the external wall') : tool === 'rect' ? 'Drag from one corner to the opposite corner' : tool === 'select' ? 'Click a wall to select it · Delete removes it' : 'Drag to pan')}
              {step === 3 && (tool === 'addWindow' ? 'Click on a wall to place a window' : tool === 'addDoor' ? 'Click on a wall to place a door' : tool === 'select' ? 'Click an opening to edit · drag it along its wall' : 'Drag to pan')}
            </div>
          </PlanViewport>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <div className="text-center max-w-sm">
              <div className="text-5xl mb-3">🏠</div>
              <div className="font-bold text-lg text-white mb-1">Start with a floor plan</div>
              <div className="text-sm text-slate-300">Upload an image or PDF of the ground-floor plan. You’ll set the scale, pick the external walls, then add windows and doors.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
