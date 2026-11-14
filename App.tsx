import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { MethodStudy } from './components/MethodStudy';
import { PhysicsLab } from './components/PhysicsLab';
import { MeasurementModule } from './components/MeasurementModule';
import { AppStep, ProjectState, AppModule } from './types';
import { ElevationStudio } from './components/elevation/ElevationStudio';
import type { ElevationStudioProps } from './components/elevation/ElevationStudio';

// Derived from ProjectState so this file never depends on extra exports from ./types
type ArchElement = ProjectState['elements'][number];
type GridLine = ProjectState['gridLines'][number];

type Tool = 'select' | 'pan' | 'grid' | 'wall' | 'rect' | 'door' | 'window';
type Pt = { x: number; y: number };
type View = { x: number; y: number; z: number };
type NewEl = { type: string; x1: number; y1: number; x2: number; y2: number };

const C = {
  bg: '#15171a', panel: '#1f2227', rule: '#2e333a', text: '#c9cfd6', dim: '#7d8590',
  accent: '#4aa3ff', grid: '#e5484d', wall: '#e8eaed', door: '#f5b83d', win: '#3ddbd9',
};
const MONO = 'ui-monospace, "JetBrains Mono", Consolas, monospace';
const SHEET = { W: 3508, H: 2480 };
const DOOR_W = 900, WIN_W = 1200;

// --- GLOBAL STYLES (same tokens as the studios) ---
const GlobalStyles = () => (
  <style>{`
    .app-bg { background-color: #15171a; min-height: 100vh; color: #c9cfd6; }
    .sheet-preview { line-height: 0; background: #fff; border: 1px solid #2e333a; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #15171a; }
    ::-webkit-scrollbar-thumb { background: #2e333a; border-radius: 4px; }
  `}</style>
);

const ICONS: Record<string, string> = {
  select: 'M5 3l14 8-6 2-2 6z',
  pan: 'M8 13V5a1.5 1.5 0 013 0v6m0-7a1.5 1.5 0 013 0v7m0-5a1.5 1.5 0 013 0v8a6 6 0 01-6 6h-1a6 6 0 01-5-3l-3-5a1.5 1.5 0 012-2l2 2',
  grid: 'M4 8h16M4 16h16M8 4v16M16 4v16',
  wall: 'M4 20L20 4',
  rect: 'M5 6h14v12H5z',
  door: 'M5 19V5h9M5 19h14M14 5a14 14 0 015 14',
  window: 'M4 9h16v6H4zM12 9v6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
};

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' }, { id: 'pan', label: 'Pan', key: 'H' },
  { id: 'grid', label: 'Grid line', key: 'G' }, { id: 'wall', label: 'Wall', key: 'W' },
  { id: 'rect', label: 'Rectangle', key: 'R' }, { id: 'door', label: 'Door', key: 'D' },
  { id: 'window', label: 'Window', key: 'N' },
];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
const kindOf = (e: ArchElement): string => e.type as string;

const initialProject = (): ProjectState => ({
  imageSrc: null, imageWidth: 0, imageHeight: 0, gridLines: [], elements: [], columns: [],
  settings: { scale: 100, gridSpacing: 4000, wallWidth: 225, trenchWidth: 450, footingWidth: 1000, workingSpace: 300, blindingOffset: 50, foundationDepth: 1200, concreteGrade: 'C25/30' },
  specs: { floors: 1, floorHeight: 3000, plinthHeight: 450, roof: { type: 'gable', pitch: 30, overhang: 600 } },
  generatedImageSrc: null, calculatedTrenchLength: 0,
} as any);

// ---------- small UI pieces (outside App so inputs don't remount and lose focus) ----------
const Icon = ({ n, s = 18 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]} /></svg>
);
const Btn: React.FC<{ on?: boolean; onClick: () => void; title: string; children: React.ReactNode }> = ({ on, onClick, title, children }) => (
  <button title={title} onClick={onClick} style={{ background: on ? C.accent : 'transparent', color: on ? '#06121f' : C.text }}
    className="w-9 h-9 grid place-items-center rounded-[3px] hover:brightness-125 focus-visible:outline outline-2 outline-offset-1">{children}</button>
);
const Num = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
  <label className="flex items-center justify-between gap-2 py-1 text-xs" style={{ color: C.dim }}>
    {label}
    <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} style={{ background: C.bg, borderColor: C.rule, color: C.text, fontFamily: MONO }} className="w-20 px-1.5 py-1 border rounded-[3px] text-right" />
  </label>
);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ borderColor: C.rule }} className="border-b px-3 py-2.5"><div className="text-xs font-semibold mb-1.5" style={{ color: C.text }}>{title}</div>{children}</div>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [project, setProject] = useState<ProjectState>(initialProject());
  const [tool, setTool] = useState<Tool>('wall');
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 0.3 });
  const [mouse, setMouse] = useState<Pt>({ x: 0, y: 0 });
  const [start, setStart] = useState<Pt | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [layers, setLayers] = useState({ underlay: true, grid: true, walls: true, openings: true });
  const [cmd, setCmd] = useState('');
  const [sheet, setSheet] = useState<{ title: string; src: string } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [studioInitial, setStudioInitial] = useState<ElevationStudioProps['initial']>(undefined);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const history = useRef<ProjectState[]>([]);
  const panning = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const spaceDown = useRef(false);

  const inWorkspace =
    activeModule !== AppModule.DASHBOARD &&
    activeModule !== AppModule.MEASUREMENT &&
    activeModule !== AppModule.ELEVATIONS &&
    activeModule !== AppModule.METHOD_STUDY &&
    activeModule !== AppModule.PHYSICS;
  const drafting = inWorkspace && (step === AppStep.GRID_MAPPING || step === AppStep.PLAN_DESIGN);

  // ---------- model helpers ----------
  const commit = useCallback((fn: (p: ProjectState) => ProjectState) => {
    setProject(p => { history.current.push(p); if (history.current.length > 60) history.current.shift(); return fn(p); });
  }, []);
  const undo = useCallback(() => { const p = history.current.pop(); if (p) { setProject(p); setSel(null); } }, []);
  const addEl = (el: NewEl) =>
    commit(p => ({ ...p, elements: [...p.elements, { ...el, id: crypto.randomUUID(), gridRef: '' } as unknown as ArchElement] }));
  const deleteSel = useCallback(() => {
    if (!sel) return;
    commit(p => ({ ...p, elements: p.elements.filter(e => e.id !== sel), gridLines: p.gridLines.filter(g => g.id !== sel) }));
    setSel(null);
  }, [sel, commit]);

  // ---------- coordinate transforms ----------
  const toWorld = (sx: number, sy: number): Pt => ({ x: (sx - view.x) / view.z, y: (sy - view.y) / view.z });
  const fit = useCallback(() => {
    const W = project.imageWidth || SHEET.W, H = project.imageHeight || SHEET.H;
    const z = Math.min(size.w / W, size.h / H) * 0.9;
    setView({ z, x: (size.w - W * z) / 2, y: (size.h - H * z) / 2 });
  }, [project.imageWidth, project.imageHeight, size]);

  const snapPoint = (raw: Pt, from: Pt | null): Pt => {
    let p: Pt = raw;
    if (snapOn) {
      const r = 14 / view.z;
      const pts: Pt[] = project.elements.flatMap(e => [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
      const near = pts.reduce<{ q: Pt | null; d: number }>((acc, q) => {
        const d = dist(raw, q);
        return d < acc.d ? { q, d } : acc;
      }, { q: null, d: r });
      p = near.q ?? { x: Math.round(raw.x / 50) * 50, y: Math.round(raw.y / 50) * 50 };
    }
    if (ortho && from) {
      if (Math.abs(p.x - from.x) > Math.abs(p.y - from.y)) p = { x: p.x, y: from.y };
      else p = { x: from.x, y: p.y };
    }
    return p;
  };
  const cursor = snapPoint(mouse, start);

  // ---------- resize ----------
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [drafting]);
  useEffect(() => { if (drafting) fit(); }, [drafting, project.imageWidth, project.imageHeight]); // eslint-disable-line

  // ---------- underlay image ----------
  useEffect(() => {
    if (!project.imageSrc) { imgRef.current = null; return; }
    const i = new Image(); i.onload = () => { imgRef.current = i; setView(v => ({ ...v })); }; i.src = project.imageSrc;
  }, [project.imageSrc]);

  // ---------- drawing ----------
  useEffect(() => {
    const c = canvasRef.current; if (!c || !drafting) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const z = view.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
    const lw = (px: number) => px / z;
    const W = project.imageWidth || SHEET.W, H = project.imageHeight || SHEET.H;

    // sheet area
    ctx.fillStyle = '#1b1e22'; ctx.fillRect(0, 0, W, H);
    if (layers.underlay && imgRef.current) { ctx.globalAlpha = 0.45; ctx.drawImage(imgRef.current, 0, 0, W, H); ctx.globalAlpha = 1; }

    // adaptive drafting grid
    let gs = 100; while (gs * z < 14) gs *= 5;
    ctx.lineWidth = lw(1);
    for (let x = 0; x <= W; x += gs) { ctx.strokeStyle = x % (gs * 5) === 0 ? '#2b3037' : '#22262b'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += gs) { ctx.strokeStyle = y % (gs * 5) === 0 ? '#2b3037' : '#22262b'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = C.rule; ctx.lineWidth = lw(1.5); ctx.strokeRect(0, 0, W, H);

    // structural grid lines
    if (layers.grid) {
      ctx.lineWidth = lw(1); ctx.setLineDash([lw(14), lw(4), lw(2), lw(4)]);
      project.gridLines.forEach(g => {
        ctx.strokeStyle = g.id === sel ? C.accent : C.grid;
        ctx.beginPath();
        if (g.orientation === 'vertical') { ctx.moveTo(g.position, 0); ctx.lineTo(g.position, H); } else { ctx.moveTo(0, g.position); ctx.lineTo(W, g.position); }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    ctx.font = `${lw(11)}px ${MONO}`; ctx.textBaseline = 'middle';
    project.elements.forEach(e => {
      const on = e.id === sel;
      const kind = kindOf(e);
      if (kind === 'wall' && layers.walls) {
        const a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), t = project.settings.wallWidth / 2;
        const nx = -Math.sin(a) * t, ny = Math.cos(a) * t;
        ctx.beginPath(); ctx.moveTo(e.x1 + nx, e.y1 + ny); ctx.lineTo(e.x2 + nx, e.y2 + ny); ctx.lineTo(e.x2 - nx, e.y2 - ny); ctx.lineTo(e.x1 - nx, e.y1 - ny); ctx.closePath();
        ctx.fillStyle = on ? 'rgba(74,163,255,.25)' : 'rgba(232,234,237,.1)'; ctx.fill();
        ctx.strokeStyle = on ? C.accent : C.wall; ctx.lineWidth = lw(1.4); ctx.stroke();
        if (on) {
          ctx.fillStyle = C.accent;
          ([[e.x1, e.y1], [e.x2, e.y2]] as [number, number][]).forEach(([x, y]) => ctx.fillRect(x - lw(4), y - lw(4), lw(8), lw(8)));
          ctx.fillStyle = C.text; ctx.fillText(`${Math.round(dist({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }))}`, (e.x1 + e.x2) / 2 + lw(8), (e.y1 + e.y2) / 2 - lw(10));
        }
      } else if (kind === 'rect' && layers.walls) {
        ctx.strokeStyle = on ? C.accent : C.wall; ctx.lineWidth = lw(1.4);
        const w = e.x2 - e.x1, h = e.y2 - e.y1; ctx.fillStyle = on ? 'rgba(74,163,255,.2)' : 'rgba(232,234,237,.06)'; ctx.fillRect(e.x1, e.y1, w, h); ctx.strokeRect(e.x1, e.y1, w, h);
      } else if (kind === 'door' && layers.openings) {
        const w = Math.abs(e.x2 - e.x1) || DOOR_W;
        ctx.strokeStyle = on ? C.accent : C.door; ctx.lineWidth = lw(1.4);
        ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x1, e.y1 - w); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x1, e.y1, w, -Math.PI / 2, 0); ctx.stroke();
      } else if (kind === 'window' && layers.openings) {
        const w = Math.abs(e.x2 - e.x1) || WIN_W, t = project.settings.wallWidth;
        ctx.strokeStyle = on ? C.accent : C.win; ctx.lineWidth = lw(1.4);
        ctx.strokeRect(e.x1, e.y1 - t / 2, w, t);
        ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x1 + w, e.y1); ctx.stroke();
      }
    });

    // rubber band preview
    if (start) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = lw(1.2); ctx.setLineDash([lw(6), lw(4)]);
      const dx = cursor.x - start.x, dy = cursor.y - start.y; let label = '';
      if (tool === 'rect') { ctx.strokeRect(start.x, start.y, dx, dy); label = `${Math.abs(Math.round(dx))} × ${Math.abs(Math.round(dy))}`; }
      else { ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(cursor.x, cursor.y); ctx.stroke(); label = `${Math.round(Math.hypot(dx, dy))} @ ${((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1)}°`; }
      ctx.setLineDash([]);
      ctx.fillStyle = C.accent; ctx.fillText(label, cursor.x + lw(14), cursor.y + lw(16));
    }

    // crosshair + snap marker
    if (tool !== 'pan' && tool !== 'select') {
      ctx.strokeStyle = 'rgba(201,207,214,.35)'; ctx.lineWidth = lw(1);
      ctx.beginPath(); ctx.moveTo(cursor.x - lw(14), cursor.y); ctx.lineTo(cursor.x + lw(14), cursor.y); ctx.moveTo(cursor.x, cursor.y - lw(14)); ctx.lineTo(cursor.x, cursor.y + lw(14)); ctx.stroke();
      if (snapOn) { ctx.strokeStyle = C.door; ctx.strokeRect(cursor.x - lw(5), cursor.y - lw(5), lw(10), lw(10)); }
    }
  }, [project, view, size, layers, sel, start, mouse, tool, snapOn, ortho, drafting]); // eslint-disable-line

  // ---------- input ----------
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const p = local(e); const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView(v => { const z = Math.max(0.02, Math.min(8, v.z * f)); return { z, x: p.x - ((p.x - v.x) / v.z) * z, y: p.y - ((p.y - v.y) / v.z) * z }; });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [drafting]);

  const finish = (p: Pt) => {
    if (!start) return;
    if (tool === 'wall') addEl({ type: 'wall', x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    else if (tool === 'rect') addEl({ type: 'rect', x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    else if (tool === 'grid') {
      const v = Math.abs(p.x - start.x) < Math.abs(p.y - start.y);
      const n = project.gridLines.filter(g => g.orientation === (v ? 'vertical' : 'horizontal')).length;
      const g = { id: crypto.randomUUID(), label: v ? String(n + 1) : String.fromCharCode(65 + (n % 26)), orientation: v ? 'vertical' : 'horizontal', position: v ? start.x : start.y } as unknown as GridLine;
      commit(pr => ({ ...pr, gridLines: [...pr.gridLines, g] }));
    }
    setStart(tool === 'wall' ? p : null); // walls chain like a polyline
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const s = local(e);
    if (e.button === 1 || tool === 'pan' || spaceDown.current) {
      panning.current = { sx: s.x, sy: s.y, vx: view.x, vy: view.y };
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = snapPoint(toWorld(s.x, s.y), start);
    if (tool === 'select') {
      const r = 8 / view.z; let hit: string | null = null;
      for (const el of project.elements) {
        const near = kindOf(el) === 'wall'
          ? segDist(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < Math.max(r, project.settings.wallWidth / 2)
          : dist(p, { x: el.x1, y: el.y1 }) < Math.max(r, 500);
        if (near) hit = el.id;
      }
      for (const g of project.gridLines) {
        if (Math.abs((g.orientation === 'vertical' ? p.x : p.y) - g.position) < r) hit = g.id;
      }
      setSel(hit);
      return;
    }
    if (tool === 'door') { addEl({ type: 'door', x1: p.x, y1: p.y, x2: p.x + DOOR_W, y2: p.y }); return; }
    if (tool === 'window') { addEl({ type: 'window', x1: p.x, y1: p.y, x2: p.x + WIN_W, y2: p.y }); return; }
    if (!start) { setStart(p); return; }
    finish(p);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = local(e);
    if (panning.current) { const pn = panning.current; setView(v => ({ ...v, x: pn.vx + s.x - pn.sx, y: pn.vy + s.y - pn.sy })); return; }
    setMouse(toWorld(s.x, s.y));
  };
  const onUp = () => { panning.current = null; };

  const runCommand = () => {
    const nums = cmd.split(/[ ,x*]+/).map(Number).filter(n => !isNaN(n) && n !== 0);
    setCmd(''); if (!start || !nums.length) return;
    if (tool === 'rect') finish({ x: start.x + nums[0], y: start.y + (nums[1] ?? nums[0]) });
    else { const a = Math.atan2(cursor.y - start.y, cursor.x - start.x); finish({ x: start.x + Math.cos(a) * nums[0], y: start.y + Math.sin(a) * nums[0] }); }
  };

  useEffect(() => {
    if (!drafting) return;
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { spaceDown.current = true; e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Escape') { setStart(null); setSel(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
      if (e.key === 'F8') { e.preventDefault(); setOrtho(o => !o); return; }
      if (e.key === 'F9') { e.preventDefault(); setSnapOn(o => !o); return; }
      const t = TOOLS.find(tl => tl.key === e.key.toUpperCase()); if (t) { setTool(t.id); setStart(null); }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [drafting, undo, deleteSel]);

  // ---------- start options ----------
  const startBlank = () => { setProject(p => ({ ...p, imageSrc: null, imageWidth: SHEET.W, imageHeight: SHEET.H, gridLines: [], elements: [] })); setStep(AppStep.GRID_MAPPING); };
  const onUpload = (f?: File) => {
    if (!f) return; const rd = new FileReader();
    rd.onload = ev => {
      const src = ev.target?.result as string;
      const i = new Image();
      i.onload = () => { setProject(p => ({ ...p, imageSrc: src, imageWidth: i.width, imageHeight: i.height })); setStep(AppStep.GRID_MAPPING); };
      i.src = src;
    };
    rd.readAsDataURL(f);
  };

  // ---------- foundation plan sheet ----------
  const foundationPlan = () => {
    const c = document.createElement('canvas'); c.width = SHEET.W; c.height = SHEET.H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.strokeRect(50, 50, c.width - 100, c.height - 100);
    ctx.fillStyle = '#000'; ctx.font = 'bold 50px Arial'; ctx.fillText('FOUNDATION PLAN', 100, c.height - 150);

    const { trenchWidth, wallWidth, footingWidth } = project.settings;
    const pw = project.imageWidth || SHEET.W, ph = project.imageHeight || SHEET.H;
    ctx.save(); ctx.translate(SHEET.W / 2 - pw / 2, SHEET.H / 2 - ph / 2);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([20, 10]);
    project.gridLines.forEach(l => { ctx.beginPath(); if (l.orientation === 'vertical') { ctx.moveTo(l.position, 0); ctx.lineTo(l.position, ph); } else { ctx.moveTo(0, l.position); ctx.lineTo(pw, l.position); } ctx.stroke(); });
    ctx.setLineDash([]); ctx.strokeStyle = '#000';
    project.elements.filter(e => kindOf(e) === 'wall').forEach(e => {
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); ctx.save(); ctx.translate((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2); ctx.rotate(Math.atan2(e.y2 - e.y1, e.x2 - e.x1));
      ctx.lineWidth = 4; ctx.strokeRect(-len / 2, -trenchWidth / 2, len, trenchWidth); ctx.lineWidth = 1; ctx.strokeRect(-len / 2, -wallWidth / 2, len, wallWidth); ctx.restore();
      ctx.lineWidth = 5; ([[e.x1, e.y1], [e.x2, e.y2]] as [number, number][]).forEach(([x, y]) => ctx.strokeRect(x - footingWidth / 2, y - footingWidth / 2, footingWidth, footingWidth));
    });
    project.elements.filter(e => kindOf(e) === 'rect').forEach(e => {
      const w = e.x2 - e.x1, h = e.y2 - e.y1;
      ctx.fillStyle = 'rgba(200,200,200,0.2)'; ctx.fillRect(e.x1, e.y1, w, h);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(e.x1, e.y1, w, h);
    });
    ctx.restore();
    return { title: 'Foundation plan', src: c.toDataURL('image/png') };
  };

  // Elevations live in the Elevation Studio. Hand over the plan and any walls already drawn here.
  const openElevationStudio = () => {
    setStudioInitial({
      plan: project.imageSrc ? { src: project.imageSrc, width: project.imageWidth, height: project.imageHeight, name: 'Drafting Studio plan' } : null,
      walls: project.elements.filter(e => kindOf(e) === 'wall').map(e => ({ id: e.id, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 })),
    });
    setActiveModule(AppModule.ELEVATIONS);
  };

  const selEl = project.elements.find(e => e.id === sel);
  const hint = start ? (tool === 'rect' ? 'Pick opposite corner, or type width,height' : 'Pick next point, or type a length. Esc to finish') : tool === 'select' ? 'Click an object to select it' : tool === 'door' || tool === 'window' ? 'Click to place' : 'Pick start point';

  const renderContent = () => {
    if (activeModule === AppModule.DASHBOARD) return <Dashboard onSelectModule={setActiveModule} />;
    if (activeModule === AppModule.ELEVATIONS) return (
      <ElevationStudio key={studioInitial ? 'handoff' : 'fresh'} initial={studioInitial} onClose={() => { setStudioInitial(undefined); setActiveModule(AppModule.DASHBOARD); }} />
    );
    if (activeModule === AppModule.METHOD_STUDY) return <MethodStudy onClose={() => setActiveModule(AppModule.DASHBOARD)} />;
    if (activeModule === AppModule.PHYSICS) return <PhysicsLab onClose={() => setActiveModule(AppModule.DASHBOARD)} />;
    if (activeModule === AppModule.MEASUREMENT) return <MeasurementModule project={project} onClose={() => setActiveModule(AppModule.DASHBOARD)} />;

    return (
      <div className="h-screen w-full flex flex-col select-none" style={{ background: C.bg, color: C.text, fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', fontSize: 13 }}>
        {/* title bar */}
        <header style={{ background: C.panel, borderColor: C.rule }} className="h-11 flex items-center gap-3 px-3 border-b">
          <button onClick={() => setActiveModule(AppModule.DASHBOARD)} className="font-semibold tracking-tight hover:text-white" title="Back to dashboard">ArchPro</button>
          <span style={{ color: C.dim }}>/ Drafting studio</span>
          <div className="flex-1" />
          {drafting && <>
            <button onClick={() => setSheet(foundationPlan())} style={{ borderColor: C.rule }} className="px-3 py-1.5 border rounded-[3px] hover:bg-white/5">Foundation plan</button>
            <button onClick={openElevationStudio} style={{ borderColor: C.rule }} className="px-3 py-1.5 border rounded-[3px] hover:bg-white/5">Elevations</button>
          </>}
        </header>

        {!drafting ? (
          <main className="flex-1 grid place-items-center">
            <div className="w-[520px] grid grid-cols-2 gap-4">
              <label style={{ background: C.panel, borderColor: C.rule }} className="border rounded-[3px] p-6 cursor-pointer hover:border-[#4aa3ff]">
                <input type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files?.[0])} />
                <Icon n="upload" s={26} /><div className="mt-3 font-semibold">Open floor plan</div><div style={{ color: C.dim }} className="mt-1">Use an image as an underlay and trace over it.</div>
              </label>
              <button onClick={startBlank} style={{ background: C.panel, borderColor: C.rule }} className="border rounded-[3px] p-6 text-left hover:border-[#4aa3ff]">
                <Icon n="rect" s={26} /><div className="mt-3 font-semibold">New blank sheet</div><div style={{ color: C.dim }} className="mt-1">A3 landscape, units in millimetres.</div>
              </button>
            </div>
          </main>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* tool palette */}
            <nav style={{ background: C.panel, borderColor: C.rule }} className="w-12 border-r flex flex-col items-center py-2 gap-1">
              {TOOLS.map(t => <Btn key={t.id} on={tool === t.id} title={`${t.label} (${t.key})`} onClick={() => { setTool(t.id); setStart(null); }}><Icon n={t.id} /></Btn>)}
              <div style={{ background: C.rule }} className="w-6 h-px my-1" />
              <Btn title="Undo (Ctrl+Z)" onClick={undo}><Icon n="undo" /></Btn>
              <Btn title="Zoom to sheet" onClick={fit}><Icon n="fit" /></Btn>
              <Btn title="Delete (Del)" onClick={deleteSel}><Icon n="trash" /></Btn>
            </nav>

            {/* viewport */}
            <div ref={wrapRef} className="flex-1 relative min-w-0" style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'none' }}>
              <canvas ref={canvasRef} style={{ width: size.w, height: size.h, touchAction: 'none' }} className="absolute inset-0"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onContextMenu={e => { e.preventDefault(); setStart(null); }} />
              <div style={{ background: 'rgba(31,34,39,.9)', borderColor: C.rule, fontFamily: MONO }} className="absolute left-3 top-3 px-2.5 py-1.5 border rounded-[3px] text-xs">{hint}</div>
            </div>

            {/* properties + layers */}
            <aside style={{ background: C.panel, borderColor: C.rule }} className="w-64 border-l overflow-y-auto">
              <Section title="Layers">
                {([['underlay', 'Underlay image'], ['grid', 'Structural grid'], ['walls', 'Walls'], ['openings', 'Doors and windows']] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 py-1 cursor-pointer"><input type="checkbox" checked={layers[k]} onChange={e => setLayers(s => ({ ...s, [k]: e.target.checked }))} />{l}</label>
                ))}
              </Section>
              <Section title={selEl ? `Selected: ${kindOf(selEl)}` : 'Selection'}>
                {selEl ? <div style={{ fontFamily: MONO }} className="text-xs leading-6">
                  <div>Start {Math.round(selEl.x1)}, {Math.round(selEl.y1)}</div><div>End {Math.round(selEl.x2)}, {Math.round(selEl.y2)}</div>
                  <div>Length {Math.round(Math.hypot(selEl.x2 - selEl.x1, selEl.y2 - selEl.y1))} mm</div>
                </div> : <div style={{ color: C.dim }}>{sel ? 'Grid line selected.' : 'Nothing selected.'}</div>}
              </Section>
              <Section title="Wall and foundation (mm)">
                <Num label="Wall thickness" value={project.settings.wallWidth} onChange={n => setProject(p => ({ ...p, settings: { ...p.settings, wallWidth: n } }))} />
                <Num label="Trench width" value={project.settings.trenchWidth} onChange={n => setProject(p => ({ ...p, settings: { ...p.settings, trenchWidth: n } }))} />
                <Num label="Footing pad" value={project.settings.footingWidth} onChange={n => setProject(p => ({ ...p, settings: { ...p.settings, footingWidth: n } }))} />
              </Section>
              <Section title="Building heights (mm)">
                <Num label="Floor height" value={project.specs.floorHeight} onChange={n => setProject(p => ({ ...p, specs: { ...p.specs, floorHeight: n } }))} />
                <Num label="Plinth height" value={project.specs.plinthHeight} onChange={n => setProject(p => ({ ...p, specs: { ...p.specs, plinthHeight: n } }))} />
              </Section>
            </aside>
          </div>
        )}

        {/* command line */}
        {drafting && (
          <div style={{ background: C.panel, borderColor: C.rule, fontFamily: MONO }} className="border-t flex items-center gap-2 px-3 h-9">
            <span style={{ color: C.accent }}>{TOOLS.find(t => t.id === tool)?.label.toLowerCase()}:</span>
            <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runCommand(); if (e.key === 'Escape') { setCmd(''); setStart(null); } }}
              placeholder={start ? (tool === 'rect' ? 'width,height' : 'length in mm') : 'type values while drawing'} className="flex-1 bg-transparent outline-none text-xs" />
          </div>
        )}

        {/* status bar */}
        <footer style={{ background: '#181a1e', borderColor: C.rule, fontFamily: MONO, color: C.dim }} className="h-7 border-t flex items-center gap-4 px-3 text-xs">
          <span style={{ color: C.text }} className="w-44">X {drafting ? Math.round(cursor.x) : 0}  Y {drafting ? Math.round(cursor.y) : 0}</span>
          <button onClick={() => setSnapOn(s => !s)} style={{ color: snapOn ? C.accent : C.dim }}>SNAP F9</button>
          <button onClick={() => setOrtho(o => !o)} style={{ color: ortho ? C.accent : C.dim }}>ORTHO F8</button>
          <span>{Math.round(view.z * 100)}%</span><span>mm</span>
          <span className="flex-1" /><span>{project.elements.length} objects</span>
        </footer>

        {/* sheet viewer */}
        {sheet && (
          <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'rgba(10,11,13,.8)' }} onClick={() => setSheet(null)}>
            <div style={{ background: C.panel, borderColor: C.rule }} className="border rounded-[3px] max-w-[92vw] max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: C.rule }}>
                <span className="font-semibold">{sheet.title}</span>
                <span className="flex gap-2">
                  <a href={sheet.src} download={`${sheet.title.replace(/\s+/g, '-').toLowerCase()}.png`} style={{ background: C.accent, color: '#06121f' }} className="px-3 py-1.5 rounded-[3px] font-medium">Download PNG</a>
                  <button onClick={() => setSheet(null)} style={{ borderColor: C.rule }} className="px-3 py-1.5 border rounded-[3px]">Close</button>
                </span>
              </div>
              <div className="overflow-auto p-4 bg-[#0f1113]"><img src={sheet.src} className="max-w-full bg-white" alt={sheet.title} /></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-bg font-sans">
      <GlobalStyles />
      {renderContent()}
    </div>
  );
}

export default App;
