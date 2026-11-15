// components/drafting/DraftingStudio.tsx
// The 2D plan editor. Model space is real millimetres. A drawing to trace (image or PDF page) is an underlay with its
// own calibrated scale, so everything drawn, snapped, typed and measured here is true to scale.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchElement, ProjectState, Underlay } from '../../types';
import { Screen, Section, Segmented, StatusBar, Panel, UI, MONO, btnGhost, btnPrimary } from '../ui';
import type { ElevationStudioProps } from '../elevation/ElevationStudio';
import { saveFromDrafting } from '../../utils/drawings/pack';
import { Pt, angleDeg, dist, fmtMm, fmtNum, parseEntry, polar, boxOfSegs } from '../../utils/drafting/geometry';
import { useHistory } from '../../utils/drafting/history';
import { newProject } from '../../utils/drafting/project';
import { clearSession, loadSession, parseProjectFile, projectToFile, saveSession } from '../../utils/drafting/persist';
import { loadDraftingSource } from '../../utils/drafting/loadSource';
import { alignUnderlay, calibrateUnderlay, imageToModel, provisionalMmPerPx, setUnderlayScale } from '../../utils/drafting/scale';
import { SnapResult, SnapSettings, gridStepMm, snap } from '../../utils/drafting/snap';
import { boxSelect, hitTest, isOpening, isWall, moveElements, newOpening, newWall, placeOpening, rectangleWalls, removeElements, stretchEnd, DEFAULT_DOOR_W, DEFAULT_WINDOW_W } from '../../utils/drafting/ops';
import { GRIP, Layers, Overlay, RULER, View, drawScene, gripPoints, toModel, toScreen } from '../../utils/drafting/render';
import { FoundationSheet, foundationSheet } from '../../utils/drafting/sheet';
import { elevationHandoff } from '../../utils/drafting/handoff';
import { DIcon } from './icons';
import { Check, NumField, Row } from './fields';
import { Inspector } from './Inspector';
import { ScalePanel, Tool } from './ScalePanel';
import { StartScreen } from './StartScreen';

const Simulation3D = React.lazy(() => import('../sim/Simulation3D'));
const LiveView = React.lazy(() => import('../sim/LiveView'));

type Hist = ReturnType<typeof useHistory<ProjectState>>;
export interface StudioProps {
  hist: Hist;
  started: boolean;
  setStarted: (b: boolean) => void;
  onHome: () => void;
  onElevations: (initial: ElevationStudioProps['initial']) => void;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'box'; a: Pt; additive: boolean }
  | { kind: 'move'; from: Pt; ids: Set<string>; base: ProjectState; moved: boolean }
  | { kind: 'grip'; id: string; end: 1 | 2; moved: boolean }
  | { kind: 'opening'; id: string; width: number; moved: boolean };

const TOOLS: { id: Tool; label: string; key: string; icon: string; group: number; needsUnderlay?: boolean }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select', group: 0 },
  { id: 'pan', label: 'Pan', key: 'H', icon: 'pan', group: 0 },
  { id: 'wall', label: 'Wall', key: 'W', icon: 'wall', group: 1 },
  { id: 'rect', label: 'Room outline', key: 'R', icon: 'rect', group: 1 },
  { id: 'door', label: 'Door', key: 'D', icon: 'door', group: 1 },
  { id: 'window', label: 'Window', key: 'N', icon: 'window', group: 1 },
  { id: 'grid', label: 'Structural grid line', key: 'G', icon: 'grid', group: 1 },
  { id: 'measure', label: 'Measure', key: 'M', icon: 'measure', group: 2 },
  { id: 'scale', label: 'Set scale', key: 'S', icon: 'scale', group: 2, needsUnderlay: true },
  { id: 'align', label: 'Straighten drawing', key: 'A', icon: 'align', group: 2, needsUnderlay: true },
];
const DRAW_TOOLS: Tool[] = ['wall', 'rect', 'grid', 'measure'];

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export const DraftingStudio: React.FC<StudioProps> = ({ hist, started, setStarted, onHome, onElevations }) => {
  const project = hist.state;
  const { commit, apply, checkpoint, dropCheckpoint, undo, redo } = hist;

  const [mode, setMode] = useState<'2d' | 'split' | '3d'>('2d');
  const [tool, setToolState] = useState<Tool>('wall');
  const [view, setView] = useState<View>({ x: RULER + 40, y: RULER + 40, z: 0.05 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [mouse, setMouse] = useState<Pt | null>(null);
  const [snapRes, setSnapRes] = useState<SnapResult | null>(null);
  const [start, setStart] = useState<Pt | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ underlay: true, grid: true, structural: true, walls: true, openings: true, dims: true, fill: true });
  const [snapSet, setSnapSet] = useState<SnapSettings>({ object: true, grid: true, track: true, ortho: false });
  const [cmd, setCmd] = useState('');
  const [picks, setPicks] = useState<Pt[]>([]);
  const [marks, setMarks] = useState<{ a: Pt; b: Pt }[]>([]);
  const [calPts, setCalPts] = useState<[Pt, Pt] | null>(null);
  const [openW, setOpenW] = useState({ door: DEFAULT_DOOR_W, window: DEFAULT_WINDOW_W });
  const [gridOri, setGridOri] = useState<'vertical' | 'horizontal'>('vertical');
  const [box, setBox] = useState<{ a: Pt; b: Pt; crossing: boolean } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState<FoundationSheet | null>(null);
  const [saveState, setSaveState] = useState('');
  const [resume, setResume] = useState<{ savedAt: number; walls: number } | null>(null);
  const [fitTick, setFitTick] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cmdRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const chain = useRef<{ first: Pt | null; count: number }>({ first: null, count: 0 });
  const srcFile = useRef<File | null>(null);
  const replaceMode = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), 3800); }, []);
  const u = project.underlay;
  const t = project.settings.wallWidth;

  // ------------------------------------------------------------------ tools
  const setTool = useCallback((tl: Tool) => {
    setToolState(tl); setStart(null); setPicks([]); setSnapRes(null); setCmd('');
    if (tl !== 'scale') setCalPts(null);
  }, []);

  const cancelOp = useCallback(() => {
    if (start) { setStart(null); return; }
    if (picks.length) { setPicks([]); return; }
    if (calPts) { setCalPts(null); return; }
    if (sel.size) { setSel(new Set()); return; }
    if (tool !== 'select') setTool('select');
  }, [start, picks, calPts, sel, tool, setTool]);

  // ------------------------------------------------------------------ view
  const fit = useCallback(() => {
    const pts: Pt[] = [];
    project.elements.forEach(e => { pts.push({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }); });
    if (u && project.imageWidth) [{ x: 0, y: 0 }, { x: project.imageWidth, y: 0 }, { x: project.imageWidth, y: project.imageHeight }, { x: 0, y: project.imageHeight }].forEach(p => pts.push(imageToModel(u, p)));
    if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 20000, y: 14000 });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const bw = Math.max(x1 - x0, 1000), bh = Math.max(y1 - y0, 1000);
    const z = Math.max(0.003, Math.min(4, Math.min((size.w - RULER - 60) / bw, (size.h - RULER - 60) / bh)));
    setView({ z, x: RULER + (size.w - RULER) / 2 - ((x0 + x1) / 2) * z, y: RULER + (size.h - RULER) / 2 - ((y0 + y1) / 2) * z });
  }, [project.elements, project.imageWidth, project.imageHeight, u, size]);

  useEffect(() => { if (started && mode !== '3d' && size.w > 100) fit(); }, [fitTick, started, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(100, e.contentRect.width), h: Math.max(100, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [started, mode]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0016);
      setView(v => { const z = Math.min(8, Math.max(0.003, v.z * k)); return { z, x: mx - ((mx - v.x) / v.z) * z, y: my - ((my - v.y) / v.z) * z }; });
    };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  }, [started, mode]);

  const zoomBy = (k: number) => setView(v => { const mx = size.w / 2, my = size.h / 2, z = Math.min(8, Math.max(0.003, v.z * k)); return { z, x: mx - ((mx - v.x) / v.z) * z, y: my - ((my - v.y) / v.z) * z }; });

  // ------------------------------------------------------------------ underlay image
  useEffect(() => {
    if (!project.imageSrc) { setImg(null); return; }
    const i = new Image(); i.onload = () => setImg(i); i.src = project.imageSrc;
  }, [project.imageSrc]);

  // ------------------------------------------------------------------ autosave + resume
  useEffect(() => {
    if (!started) return;
    const id = window.setTimeout(() => { void saveSession(project).then(ok => setSaveState(ok ? `Autosaved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Autosave unavailable')); }, 1200);
    return () => window.clearTimeout(id);
  }, [project, started]);
  useEffect(() => { if (!started) void loadSession().then(s => setResume(s && (s.project.elements.length || s.project.underlay) ? { savedAt: s.savedAt, walls: s.project.elements.filter(isWall).length } : null)); }, [started]);

  // ------------------------------------------------------------------ snapping
  const computeSnap = useCallback((raw: Pt, from: Pt | null, exclude?: Set<string>): SnapResult =>
    snap({ raw, elements: project.elements, gridLines: project.gridLines, zoom: view.z, from, settings: snapSet, exclude }), [project.elements, project.gridLines, view.z, snapSet]);

  const ghost = useMemo(() => {
    if ((tool !== 'door' && tool !== 'window') || !mouse) return null;
    const pl = placeOpening(project, mouse, openW[tool], view.z);
    return pl ? { ...pl, kind: tool } : null;
  }, [tool, mouse, project, openW, view.z]);

  // ------------------------------------------------------------------ drawing actions
  const addWallTo = useCallback((p: Pt) => {
    if (!start) { setStart(p); chain.current = { first: p, count: 0 }; return; }
    if (dist(start, p) < 1) return;
    const w = newWall(start, p);
    commit(pr => ({ ...pr, elements: [...pr.elements, w] }));
    chain.current.count++;
    if (chain.current.count >= 2 && chain.current.first && dist(p, chain.current.first) < 1) { setStart(null); flash('Loop closed'); return; }
    setStart(p);
  }, [start, commit, flash]);

  const nextGridLabel = (ori: 'vertical' | 'horizontal') => {
    const n = project.gridLines.filter(g => g.orientation === ori).length;
    return ori === 'vertical' ? String(n + 1) : String.fromCharCode(65 + (n % 26));
  };

  const deleteSel = useCallback(() => {
    if (!sel.size) return;
    commit(p => ({ ...p, elements: removeElements(p, sel), gridLines: p.gridLines.filter(g => !sel.has(g.id)) }));
    setSel(new Set());
  }, [sel, commit]);

  const submitCmd = () => {
    const en = parseEntry(cmd); setCmd('');
    if (!en) return;
    const cur = snapRes?.p ?? mouse;
    if (tool === 'wall' && start) {
      const dir = cur ? angleDeg(start, cur) : 0;
      const to = en.kind === 'length' ? polar(start, en.len, dir) : en.kind === 'polar' ? polar(start, en.len, en.deg) : { x: start.x + en.dx, y: start.y - en.dy };
      addWallTo(to);
    } else if (tool === 'rect' && start) {
      const sx = cur && cur.x < start.x ? -1 : 1, sy = cur && cur.y < start.y ? -1 : 1;
      const dx = en.kind === 'rel' ? en.dx : en.kind === 'length' ? en.len * sx : 0, dy = en.kind === 'rel' ? -en.dy : en.kind === 'length' ? en.len * sy : 0;
      if (!dx || !dy) return;
      const walls = rectangleWalls(start, { x: start.x + dx, y: start.y + dy });
      if (walls.length) { commit(p => ({ ...p, elements: [...p.elements, ...walls] })); setStart(null); }
    }
  };

  // ------------------------------------------------------------------ scale actions
  const afterScaleNote = () => (project.elements.some(isWall) ? ' Walls you already drew keep their size; the drawing moved, not the walls.' : '');
  const applyTwoPoint = (realMm: number) => {
    if (!u || !calPts) return;
    const n = calibrateUnderlay(u, calPts[0], calPts[1], realMm, `Two points, ${fmtMm(realMm)}`);
    if (!n) { flash('Those points are too close together.'); return; }
    commit(p => ({ ...p, underlay: n })); setCalPts(null);
    flash(`Scale set.${afterScaleNote()} Use Measure to check a known dimension.`);
    setFitTick(x => x + 1);
  };
  const applyPrinted = (k: number, method: string) => {
    if (!u) return;
    const n = setUnderlayScale(u, k, project.imageWidth, project.imageHeight, method);
    if (!n) return;
    commit(p => ({ ...p, underlay: n })); flash(`Scale set.${afterScaleNote()} Use Measure to check a known dimension.`); setFitTick(x => x + 1);
  };
  const patchUnderlay = (pt: Partial<Underlay>) => commit(p => (p.underlay ? { ...p, underlay: { ...p.underlay, ...pt } } : p));

  // ------------------------------------------------------------------ pointer
  const local = (e: { clientX: number; clientY: number }): Pt => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const snappedFor = (raw: Pt): SnapResult => {
    if (tool === 'scale' || tool === 'align') return { p: raw, kind: 'none', guides: [] };
    const from = (tool === 'wall' || tool === 'rect') ? start : tool === 'measure' ? picks[0] ?? null : null;
    return computeSnap(raw, from);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = local(e);
    if (s.x < RULER || s.y < RULER) return;
    canvasRef.current?.focus();
    const raw = toModel(view, s);
    if (e.button === 1 || tool === 'pan' || spaceDown.current) {
      drag.current = { kind: 'pan', sx: s.x, sy: s.y, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (e.button === 2) { cancelOp(); return; }
    if (e.button !== 0) return;

    if (tool === 'select') {
      const g = gripPoints(project, sel).find(gp => { const sp = toScreen(view, gp.p); return Math.hypot(sp.x - s.x, sp.y - s.y) <= GRIP + 5; });
      if (g) { drag.current = { kind: 'grip', id: g.id, end: g.end, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); return; }
      const hit = hitTest(raw, project, view.z);
      if (hit) {
        let ids = sel;
        if (e.shiftKey) { ids = new Set(sel); if (ids.has(hit.id)) ids.delete(hit.id); else ids.add(hit.id); setSel(ids); }
        else if (!sel.has(hit.id)) { ids = new Set([hit.id]); setSel(ids); }
        const base = project;
        if (hit.kind === 'opening' && ids.size === 1) {
          const o = project.elements.find(x => x.id === hit.id)!;
          drag.current = { kind: 'opening', id: o.id, width: dist({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }), moved: false };
        } else if (hit.kind !== 'grid' && ids.has(hit.id)) {
          drag.current = { kind: 'move', from: computeSnap(raw, null, ids).p, ids, base, moved: false };
        }
        e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      drag.current = { kind: 'box', a: raw, additive: e.shiftKey }; e.currentTarget.setPointerCapture(e.pointerId);
      if (!e.shiftKey) setSel(new Set());
      return;
    }

    const sn = snappedFor(raw), p = sn.p;
    if (tool === 'wall') addWallTo(p);
    else if (tool === 'rect') {
      if (!start) setStart(p);
      else { const w = rectangleWalls(start, p); if (w.length) { commit(pr => ({ ...pr, elements: [...pr.elements, ...w] })); setStart(null); } }
    } else if (tool === 'door' || tool === 'window') {
      const pl = placeOpening(project, raw, openW[tool], view.z);
      if (!pl) { flash('Doors and windows go on walls. Draw a wall first, then place the opening on it.'); return; }
      const o = newOpening(tool, pl); commit(pr => ({ ...pr, elements: [...pr.elements, o] })); setSel(new Set([o.id]));
    } else if (tool === 'grid') {
      const v = gridOri === 'vertical';
      commit(pr => ({ ...pr, gridLines: [...pr.gridLines, { id: crypto.randomUUID(), label: nextGridLabel(gridOri), orientation: gridOri, position: v ? p.x : p.y } as ProjectState['gridLines'][number]] }));
    } else if (tool === 'measure') {
      if (!picks.length) setPicks([p]); else { setMarks(m => [...m.slice(-7), { a: picks[0], b: p }]); setPicks([]); }
    } else if (tool === 'scale') {
      if (!picks.length) setPicks([raw]);
      else { setCalPts([picks[0], raw]); setPicks([]); setToolState('select'); }
    } else if (tool === 'align') {
      if (!picks.length) setPicks([raw]);
      else if (u) {
        const n = alignUnderlay(u, picks[0], raw);
        if (n) { commit(pr => ({ ...pr, underlay: n })); flash('Drawing straightened.'); }
        setPicks([]); setToolState('select');
      }
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = local(e);
    const d = drag.current;
    if (d?.kind === 'pan') { setView(v => ({ ...v, x: d.vx + s.x - d.sx, y: d.vy + s.y - d.sy })); return; }
    const raw = toModel(view, s);
    setMouse(raw);
    if (d?.kind === 'box') { setBox({ a: d.a, b: raw, crossing: raw.x < d.a.x }); return; }
    if (d?.kind === 'move') {
      const p = computeSnap(raw, null, d.ids).p, dx = p.x - d.from.x, dy = p.y - d.from.y;
      if (!d.moved) { if (Math.hypot(dx, dy) * view.z < 3) return; d.moved = true; checkpoint(); }
      apply(pr => ({ ...pr, elements: moveElements(d.base, d.ids, dx, dy) }));
      setSnapRes(null); return;
    }
    if (d?.kind === 'grip') {
      const sn = computeSnap(raw, null, new Set([d.id]));
      if (!d.moved) { d.moved = true; checkpoint(); }
      apply(pr => ({ ...pr, elements: stretchEnd(pr, d.id, d.end, sn.p) })); setSnapRes(sn); return;
    }
    if (d?.kind === 'opening') {
      const pl = placeOpening(project, raw, d.width, view.z);
      if (!pl) return;
      if (!d.moved) { d.moved = true; checkpoint(); }
      apply(pr => ({ ...pr, elements: pr.elements.map(x => (x.id === d.id ? { ...x, x1: pl.x1, y1: pl.y1, x2: pl.x2, y2: pl.y2 } : x)) })); return;
    }
    if (DRAW_TOOLS.includes(tool) || tool === 'scale' || tool === 'align') setSnapRes(snappedFor(raw)); else setSnapRes(null);
    if (tool === 'select') setHover(hitTest(raw, project, view.z)?.id ?? null);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (d.kind === 'box') {
      const b = toModel(view, local(e));
      if (dist(d.a, b) * view.z > 4) {
        const ids = boxSelect(project, d.a, b, b.x < d.a.x);
        setSel(prev => new Set([...(d.additive ? prev : []), ...ids]));
      }
      setBox(null);
    }
  };

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    if (!started || mode === '3d') return;
    const typing = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    const kd = (e: KeyboardEvent) => {
      const inCmd = e.target === cmdRef.current;
      if (typing(e.target) && !inCmd) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key;
      if (e.code === 'Space' && !inCmd) { spaceDown.current = true; e.preventDefault(); return; }
      if (mod && k.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
      if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k.toLowerCase() === 's') { e.preventDefault(); savePlanFile(); return; }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set([...project.elements.map(x => x.id), ...project.gridLines.map(g => g.id)])); return; }
      if (inCmd) return;
      if (k === 'Escape') { cancelOp(); return; }
      if (k === 'Enter' && start) { setStart(null); return; }
      if ((k === 'Delete' || k === 'Backspace') && sel.size) { e.preventDefault(); deleteSel(); return; }
      if (k === 'F3') { e.preventDefault(); setSnapSet(s => ({ ...s, object: !s.object })); return; }
      if (k === 'F8') { e.preventDefault(); setSnapSet(s => ({ ...s, ortho: !s.ortho })); return; }
      if (k === 'F9') { e.preventDefault(); setSnapSet(s => ({ ...s, grid: !s.grid })); return; }
      if (k === 'F10') { e.preventDefault(); setSnapSet(s => ({ ...s, track: !s.track })); return; }
      if (k.startsWith('Arrow') && sel.size && !mod) {
        e.preventDefault();
        const step = gridStepMm(view.z) * (e.shiftKey ? 10 : 1);
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        commit(p => ({ ...p, elements: moveElements(p, sel, dx, dy) })); return;
      }
      if ((tool === 'wall' || tool === 'rect') && start && /^[0-9.,<@-]$/.test(k)) { cmdRef.current?.focus(); return; }   // typed entry
      if (!mod && (k === 'c' || k === 'C') && tool === 'wall' && start && chain.current.first && chain.current.count >= 2) { addWallTo(chain.current.first); return; }
      if (!mod && (k === 'f' || k === 'F')) { setFitTick(x => x + 1); return; }
      if (!mod && (k === 'x' || k === 'X') && tool === 'grid') { setGridOri(o => (o === 'vertical' ? 'horizontal' : 'vertical')); return; }
      const tl = TOOLS.find(x => x.key === k.toUpperCase() && !mod && (!x.needsUnderlay || u));
      if (tl) setTool(tl.id);
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  });  // re-registered every render so handlers always see current state

  // ------------------------------------------------------------------ files
  const startFresh = (next: ProjectState, t0: Tool = 'wall') => { hist.reset(next); setSel(new Set()); setMarks([]); setStart(null); setPicks([]); setCalPts(null); setToolState(t0); setStarted(true); setMode('2d'); setFitTick(x => x + 1); };

  const openDrawing = async (file: File, page = 1, replace = false) => {
    setBusy(true); setError('');
    try {
      const src = await loadDraftingSource(file, page);
      const old = replace ? project.underlay : undefined;
      const sameSheet = !!old && old.calibrated && src.kind === 'pdf' && !!src.paperMm && !!old.paperMm && Math.abs(old.paperMm.w - src.paperMm.w) < 1;
      // keep the printed scale (1:N) when swapping between pages of the same paper size
      const denom = sameSheet ? (old!.mmPerPx * project.imageWidth) / old!.paperMm!.w : 0;
      const keepScale = sameSheet && denom > 0;
      const underlay: Underlay = {
        mmPerPx: keepScale ? (src.paperMm!.w / src.width) * denom : provisionalMmPerPx(src.kind, src.width, src.paperMm),
        x: keepScale ? old!.x : 0, y: keepScale ? old!.y : 0, rot: keepScale ? old!.rot : 0, opacity: old?.opacity ?? 0.6, visible: true,
        calibrated: keepScale, method: keepScale ? old!.method : '', name: src.name, kind: src.kind, paperMm: src.paperMm, page: src.page, numPages: src.numPages,
      };
      srcFile.current = file;
      const base = replace ? project : newProject();
      const next: ProjectState = { ...base, imageSrc: src.src, imageWidth: src.width, imageHeight: src.height, underlay };
      if (replace) { commit(() => next); setFitTick(x => x + 1); if (!underlay.calibrated) setToolState('select'); }
      else startFresh(next, 'select');
      flash(underlay.calibrated ? 'Drawing replaced.' : 'Drawing opened. Set its scale before tracing.');
    } catch (e) { setError((e as Error).message || 'That file could not be opened.'); }
    finally { setBusy(false); }
  };

  const changePage = (n: number) => {
    if (!srcFile.current) { flash('Re-open the PDF to switch pages (the original file is no longer in memory).'); return; }
    void openDrawing(srcFile.current, n, true);
  };

  const savePlanFile = () => {
    const url = URL.createObjectURL(new Blob([projectToFile(hist.state)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `archpro-plan-${stamp()}.json`; a.click(); URL.revokeObjectURL(url);
    flash('Plan file saved.');
  };

  const openPlanFile = async (f: File) => {
    setError('');
    try { startFresh(parseProjectFile(await f.text()), 'select'); flash('Plan opened.'); }
    catch (e) { setError((e as Error).message); }
  };

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0]; if (!f) return;
    if (/\.json$/i.test(f.name)) void openPlanFile(f); else void openDrawing(f, 1, true);
  };

  const newPlan = () => {
    if (project.elements.length && !window.confirm('Start a new plan? Unsaved changes will be lost. Use Save first to keep this one.')) return;
    void clearSession(); hist.reset(newProject()); setStarted(false); setSel(new Set());
  };

  const makeFoundationSheet = () => {
    const sh = foundationSheet(project);
    if (!sh) { flash('Draw some walls first.'); return; }
    setSheet(sh);
    void saveFromDrafting(project, sh, { w: sh.w, h: sh.h }).catch(() => undefined);
  };

  // ------------------------------------------------------------------ draw
  const overlay: Overlay = useMemo(() => {
    const o: Overlay = { snap: snapRes, cursor: mouse, marks, ghost, box, points: picks };
    const p = snapRes?.p ?? mouse;
    const tip: string[] = [];
    if (start && p && tool === 'wall') {
      o.preview = { kind: 'wall', a: start, b: p };
      tip.push(fmtMm(dist(start, p)), `∠ ${Math.round(angleDeg(start, p))}°`);
      if (cmd) tip.push(`> ${cmd}`);
    } else if (start && p && tool === 'rect') {
      o.preview = { kind: 'rect', a: start, b: p };
      tip.push(`${fmtNum(Math.abs(p.x - start.x))} × ${fmtNum(Math.abs(p.y - start.y))} mm`);
      if (cmd) tip.push(`> ${cmd}`);
    } else if (tool === 'measure' && picks[0] && p) o.preview = { kind: 'measure', a: picks[0], b: p };
    else if (tool === 'scale' && picks[0] && mouse) o.preview = { kind: 'scale', a: picks[0], b: mouse };
    else if (tool === 'align' && picks[0] && mouse) o.preview = { kind: 'align', a: picks[0], b: mouse };
    else if (calPts) o.preview = { kind: 'scale', a: calPts[0], b: calPts[1] };
    if (calPts) o.points = [...(o.points ?? []), calPts[0], calPts[1]];
    if (tip.length) o.tooltip = tip;
    return o;
  }, [snapRes, mouse, marks, ghost, box, picks, start, tool, cmd, calPts]);

  useEffect(() => {
    const c = canvasRef.current; if (!c || mode === '3d') return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
    const ctx = c.getContext('2d'); if (!ctx) return;
    drawScene(ctx, { project, img, view, size, dpr, layers, selected: sel, hover, overlay });
  }, [project, img, view, size, layers, sel, hover, overlay, mode, started]);

  // ------------------------------------------------------------------ UI bits
  const hint = (() => {
    if (u && !u.calibrated && tool !== 'scale' && !calPts) return 'Set the drawing scale first (S, or the Scale panel), then trace.';
    switch (tool) {
      case 'select': return 'Click to select · drag to box-select (right to left = crossing) · drag a grip to stretch · Del deletes';
      case 'pan': return 'Drag to pan · scroll to zoom';
      case 'wall': return start ? 'Next point, or type a length (4500), length<angle (4500<90), or dx,dy. Enter / Esc / right-click ends · C closes' : 'Pick the wall start point';
      case 'rect': return start ? 'Opposite corner, or type width,height' : 'Pick the first corner of the room outline';
      case 'door': case 'window': return ghost ? 'Click to place on the wall' : 'Move over a wall';
      case 'grid': return `Click to place a ${gridOri} grid line · X switches direction`;
      case 'measure': return picks.length ? 'Pick the second point' : 'Pick two points to measure a distance';
      case 'scale': return picks.length ? 'Pick the other end of the known dimension' : 'Pick one end of a dimension you know';
      case 'align': return picks.length ? 'Pick a second point on the same line' : 'Pick two points along a line that should be level';
    }
  })();

  const cursorStyle = tool === 'pan' ? 'grab' : tool === 'select' ? (hover ? 'pointer' : 'default') : 'crosshair';
  const lastMark = marks[marks.length - 1];
  const stats = useMemo(() => ({ walls: project.elements.filter(isWall).length, openings: project.elements.filter(isOpening).length }), [project.elements]);
  const cur = snapRes?.p ?? mouse;
  const fieldCls = 'w-full bg-[#15171a] border border-[#2e333a] rounded-[3px] px-2 py-1.5 text-xs font-mono text-[#c9cfd6]';

  const actions = started ? (
    <>
      <button className={btnGhost} onClick={newPlan} title="New plan">New</button>
      <button className={btnGhost} onClick={() => openRef.current?.click()} title="Open a saved plan file"><span className="inline-flex items-center gap-1.5"><DIcon n="open" s={14} />Open</span></button>
      <button className={btnGhost} onClick={savePlanFile} title="Save plan file (Ctrl+S)"><span className="inline-flex items-center gap-1.5"><DIcon n="save" s={14} />Save</span></button>
      <input ref={openRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void openPlanFile(f); e.target.value = ''; }} />
      <span className="w-px h-5 mx-1" style={{ background: UI.rule }} />
      <div className="w-60"><Segmented value={mode} onChange={v => { setMode(v as '2d' | 'split' | '3d'); setStart(null); }} options={[{ id: '2d', label: '2D' }, { id: 'split', label: '2D + 3D' }, { id: '3d', label: '3D' }]} /></div>
      <button className={btnGhost} onClick={makeFoundationSheet}>Foundation plan</button>
      <button className={btnGhost} onClick={() => onElevations(elevationHandoff(project))}>Elevations</button>
    </>
  ) : null;

  const hiddenFile = <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void openDrawing(f, 1, replaceMode.current); e.target.value = ''; }} />;

  if (!started) {
    return (
      <Screen crumb="Drafting studio" onHome={onHome}>
        <StartScreen busy={busy} error={error} resume={resume}
          onBlank={() => startFresh(newProject())}
          onDrawing={f => void openDrawing(f)} onPlanFile={f => void openPlanFile(f)}
          onResume={async () => { const s = await loadSession(); if (s) startFresh(s.project, 'select'); }} />
      </Screen>
    );
  }

  return (
    <Screen crumb="Drafting studio" onHome={onHome} actions={actions}>
      {hiddenFile}
      {mode === '3d' ? (
        <Suspense fallback={<div className="flex-1 grid place-items-center text-xs" style={{ color: UI.dim, fontFamily: MONO }}>Loading 3D engine…</div>}>
          <Simulation3D project={project} selectedId={[...sel][0] ?? null} onSelect={id => setSel(id ? new Set([id]) : new Set())} onChange={commit} />
        </Suspense>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* tool palette */}
          <nav style={{ background: UI.panel, borderColor: UI.rule }} className="w-12 border-r flex flex-col items-center py-2 gap-1 shrink-0">
            {TOOLS.filter(x => !x.needsUnderlay || u).map((x, i, arr) => (
              <React.Fragment key={x.id}>
                {i > 0 && arr[i - 1].group !== x.group && <div style={{ background: UI.rule }} className="w-6 h-px my-1" />}
                <button title={`${x.label} (${x.key})`} aria-label={x.label} onClick={() => setTool(x.id)}
                  style={{ background: tool === x.id ? UI.accent : 'transparent', color: tool === x.id ? UI.accentInk : UI.text }}
                  className="w-9 h-9 grid place-items-center rounded-[3px] hover:brightness-125 focus-visible:outline outline-2 outline-offset-1"><DIcon n={x.icon} /></button>
              </React.Fragment>
            ))}
            <div className="flex-1" />
            <button title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hist.canUndo} onClick={undo} className="w-9 h-9 grid place-items-center rounded-[3px] hover:bg-white/5 disabled:opacity-30"><DIcon n="undo" /></button>
            <button title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!hist.canRedo} onClick={redo} className="w-9 h-9 grid place-items-center rounded-[3px] hover:bg-white/5 disabled:opacity-30"><DIcon n="redo" /></button>
            <button title="Delete (Del)" aria-label="Delete" disabled={!sel.size} onClick={deleteSel} className="w-9 h-9 grid place-items-center rounded-[3px] hover:bg-white/5 disabled:opacity-30"><DIcon n="trash" /></button>
          </nav>

          {/* canvas */}
          <div ref={wrapRef} className="flex-1 relative min-w-0 select-none" onDragOver={e => e.preventDefault()} onDrop={onDropFile}>
            <canvas ref={canvasRef} tabIndex={0} style={{ width: size.w, height: size.h, touchAction: 'none', cursor: cursorStyle, outline: 'none' }} className="absolute inset-0"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (!drag.current) { setMouse(null); setSnapRes(null); setHover(null); } }}
              onContextMenu={e => e.preventDefault()} onDoubleClick={() => { if (tool === 'wall') setStart(null); }} />
            <div style={{ background: 'rgba(31,34,39,.94)', borderColor: UI.rule, fontFamily: MONO, left: RULER + 10, top: RULER + 10 }} className="absolute px-2.5 py-1.5 border rounded-[3px] text-[11px] max-w-[70%] pointer-events-none">{hint}</div>
            {u && !u.calibrated && (
              <button onClick={() => setTool('scale')} style={{ background: '#3a2f12', borderColor: UI.warn, color: UI.warn, top: RULER + 10 }} className="absolute right-3 px-3 py-1.5 border rounded-[3px] text-xs font-medium inline-flex items-center gap-2"><DIcon n="warn" s={14} />Scale not set. Quantities will be wrong until it is.</button>
            )}
            {toast && <div style={{ background: UI.panel, borderColor: UI.rule }} className="absolute left-1/2 -translate-x-1/2 bottom-14 px-4 py-2 border rounded-[3px] text-xs shadow-lg max-w-[80%]">{toast}</div>}
            {error && <div style={{ background: UI.panel, borderColor: UI.danger, color: UI.danger }} className="absolute left-1/2 -translate-x-1/2 top-24 px-4 py-2 border rounded-[3px] text-xs max-w-[80%] cursor-pointer" onClick={() => setError('')}>{error}</div>}
            <div className="absolute right-3 bottom-3 flex flex-col gap-1">
              {[['+', 'Zoom in', () => zoomBy(1.3)], ['−', 'Zoom out', () => zoomBy(1 / 1.3)], ['FIT', 'Zoom to drawing (F)', () => setFitTick(x => x + 1)]].map(([l, tt, fn]) => (
                <button key={l as string} title={tt as string} onClick={fn as () => void} style={{ background: UI.panel, borderColor: UI.rule, color: UI.text }} className="w-8 h-8 border rounded-[3px] text-[11px] hover:bg-[#2a2e35]">{l as string}</button>
              ))}
            </div>
          </div>

          {/* live 3D, rebuilt from the plan as you draw */}
          {mode === 'split' && (
            <div style={{ borderColor: UI.rule, width: '40%', minWidth: 300 }} className="relative border-l shrink-0">
              <Suspense fallback={<div className="h-full grid place-items-center text-xs" style={{ color: UI.dim, fontFamily: MONO }}>Loading 3D engine…</div>}>
                <LiveView project={project} selectedId={[...sel][0] ?? null} onSelect={id => setSel(id ? new Set([id]) : new Set())} onChange={commit} />
              </Suspense>
            </div>
          )}

          {/* right panel */}
          {panelOpen && <Panel width="w-72">
            {(tool === 'door' || tool === 'window') && (
              <Section title={tool === 'door' ? 'Door options' : 'Window options'}>
                <Row label="Width"><NumField value={openW[tool]} suffix="mm" min={300} max={6000} onCommit={n => setOpenW(w => ({ ...w, [tool]: n }))} /></Row>
              </Section>
            )}
            {tool === 'grid' && (
              <Section title="Grid line options"><Segmented value={gridOri} onChange={v => setGridOri(v as 'vertical' | 'horizontal')} options={[{ id: 'vertical', label: 'Vertical (1, 2, 3)' }, { id: 'horizontal', label: 'Horizontal (A, B, C)' }]} /></Section>
            )}
            {tool === 'measure' && (
              <Section title="Measure">
                <div className="text-xs font-mono" style={{ color: lastMark ? UI.text : UI.dim }}>{lastMark ? `${fmtMm(dist(lastMark.a, lastMark.b))}   ∠${Math.round(angleDeg(lastMark.a, lastMark.b))}°   Δ ${fmtNum(Math.abs(lastMark.b.x - lastMark.a.x))}, ${fmtNum(Math.abs(lastMark.b.y - lastMark.a.y))}` : 'No measurement yet.'}</div>
                {marks.length > 0 && <button className={btnGhost} onClick={() => setMarks([])}>Clear measurements</button>}
              </Section>
            )}
            <Inspector project={project} sel={sel} commit={commit} onDelete={deleteSel} />
            <ScalePanel project={project} tool={tool} setTool={setTool} calPts={calPts} cancelCal={() => setCalPts(null)} applyTwoPoint={applyTwoPoint} applyPrinted={applyPrinted}
              patchUnderlay={patchUnderlay} onReplace={() => { replaceMode.current = true; fileRef.current?.click(); }} onUpload={() => { replaceMode.current = true; fileRef.current?.click(); }}
              onRemove={() => commit(p => ({ ...p, imageSrc: null, imageWidth: 0, imageHeight: 0, underlay: undefined }))} onPage={changePage} busy={busy} />
            <Section title="Walls and building (mm)">
              <Row label="Wall thickness"><NumField value={t} min={50} max={1000} onCommit={n => commit(p => ({ ...p, settings: { ...p.settings, wallWidth: n } }))} /></Row>
              <Row label="Trench width"><NumField value={project.settings.trenchWidth} min={100} onCommit={n => commit(p => ({ ...p, settings: { ...p.settings, trenchWidth: n } }))} /></Row>
              <Row label="Footing pad"><NumField value={project.settings.footingWidth} min={100} onCommit={n => commit(p => ({ ...p, settings: { ...p.settings, footingWidth: n } }))} /></Row>
              <Row label="Floor height"><NumField value={project.specs.floorHeight} min={2000} onCommit={n => commit(p => ({ ...p, specs: { ...p.specs, floorHeight: n } }))} /></Row>
              <Row label="Plinth height"><NumField value={project.specs.plinthHeight} min={0} onCommit={n => commit(p => ({ ...p, specs: { ...p.specs, plinthHeight: n } }))} /></Row>
              <Row label="Floors"><NumField value={project.specs.floors} min={1} max={8} onCommit={n => commit(p => ({ ...p, specs: { ...p.specs, floors: Math.round(n) } }))} /></Row>
            </Section>
            <Section title="Display">
              <Check checked={layers.underlay} onChange={v => setLayers(l => ({ ...l, underlay: v }))}>Underlay drawing</Check>
              <Check checked={layers.grid} onChange={v => setLayers(l => ({ ...l, grid: v }))}>Drafting grid</Check>
              <Check checked={layers.structural} onChange={v => setLayers(l => ({ ...l, structural: v }))}>Structural grid lines</Check>
              <Check checked={layers.walls} onChange={v => setLayers(l => ({ ...l, walls: v }))}>Walls</Check>
              <Check checked={layers.fill} onChange={v => setLayers(l => ({ ...l, fill: v }))}>Wall hatching (off to see through)</Check>
              <Check checked={layers.openings} onChange={v => setLayers(l => ({ ...l, openings: v }))}>Doors and windows</Check>
              <Check checked={layers.dims} onChange={v => setLayers(l => ({ ...l, dims: v }))}>Wall dimensions</Check>
            </Section>
          </Panel>}
        </div>
      )}

      {/* command line */}
      {mode !== '3d' && (
        <div style={{ background: UI.panel, borderColor: UI.rule, fontFamily: MONO }} className="border-t flex items-center gap-2 px-3 h-9 shrink-0">
          <span style={{ color: UI.accent }}>{TOOLS.find(x => x.id === tool)?.label.toLowerCase()}:</span>
          <input ref={cmdRef} value={cmd} onChange={e => setCmd(e.target.value)} className="flex-1 bg-transparent outline-none text-xs" spellCheck={false}
            placeholder={start && tool === 'wall' ? 'length  ·  length<angle  ·  dx,dy   (mm, or add m)' : start && tool === 'rect' ? 'width,height  (mm)' : 'Type values while drawing'}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { if (cmd.trim()) submitCmd(); else if (start) setStart(null); canvasRef.current?.focus(); } if (e.key === 'Escape') { setCmd(''); canvasRef.current?.focus(); } }} />
        </div>
      )}

      <StatusBar
        left={mode !== '3d' ? <>
          <span style={{ color: UI.text }} className="w-48">{cur ? `X ${fmtNum(cur.x)}   Y ${fmtNum(cur.y)}` : 'X –   Y –'}</span>
          {([['SNAP', 'F3', 'object'], ['GRID', 'F9', 'grid'], ['TRACK', 'F10', 'track'], ['ORTHO', 'F8', 'ortho']] as const).map(([l, k, f]) => (
            <button key={l} onClick={() => setSnapSet(s => ({ ...s, [f]: !s[f] }))} style={{ color: snapSet[f] ? UI.accent : UI.dim }} title={`${l} (${k})`}>{l} {k}</button>
          ))}
          <span>1 px = {(1 / view.z).toFixed(view.z > 0.5 ? 2 : 1)} mm</span>
        </> : <span>3D model built from the plan</span>}
        right={<>
          {u ? <span style={{ color: u.calibrated ? UI.ok : UI.warn }}>{u.calibrated ? `Scale set · 1 px = ${u.mmPerPx.toFixed(2)} mm` : 'Scale not set'}</span> : <span>Blank sheet · mm</span>}
          <span>{stats.walls} walls · {stats.openings} openings</span>
          {mode !== '3d' && <button onClick={() => setPanelOpen(o => !o)} style={{ color: panelOpen ? UI.accent : UI.dim }} title="Show or hide the properties panel">PANEL</button>}
          <span>{saveState}</span>
        </>} />

      {/* sheet viewer */}
      {sheet && (
        <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'rgba(10,11,13,.8)' }} onClick={() => setSheet(null)}>
          <div style={{ background: UI.panel, borderColor: UI.rule }} className="border rounded-[3px] max-w-[92vw] max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: UI.rule }}>
              <span className="font-semibold">{sheet.title} <span className="font-normal text-xs" style={{ color: UI.dim }}>1:{sheet.denom} at A3</span></span>
              <span className="flex gap-2">
                <a href={sheet.src} download={`foundation-plan-1-${sheet.denom}.png`} className={btnPrimary}>Download PNG</a>
                <button onClick={() => setSheet(null)} className={btnGhost}>Close</button>
              </span>
            </div>
            <div className="overflow-auto p-4" style={{ background: '#0f1113' }}><img src={sheet.src} className="max-w-full bg-white" alt={sheet.title} /></div>
          </div>
        </div>
      )}
    </Screen>
  );
};

export type { ArchElement };
