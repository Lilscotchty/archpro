// utils/drafting/render.ts
// Canvas renderer for the Drafting Studio: paper-white model space, adaptive grid, rulers, merged hatched walls with
// real thickness, cut-through openings with architectural symbols, dimensions, snap markers and a scale bar.

import { ArchElement, GridLine, ProjectState } from '../../types';
import { Pt, Seg, dist, fmtMm, fmtNum, niceStep, segLen, unit, same, angleDeg } from './geometry';
import { isOpening, isRect, isWall, Placement } from './ops';
import { Guide, SnapResult } from './snap';

export interface View { x: number; y: number; z: number }       // screen px = model mm * z + (x, y)
export const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.z + v.x, y: p.y * v.z + v.y });
export const toModel = (v: View, s: Pt): Pt => ({ x: (s.x - v.x) / v.z, y: (s.y - v.y) / v.z });

export interface Layers { underlay: boolean; grid: boolean; structural: boolean; walls: boolean; openings: boolean; dims: boolean; fill: boolean }

export interface Overlay {
  preview?: { kind: 'wall' | 'rect' | 'measure' | 'scale' | 'align'; a: Pt; b: Pt };
  ghost?: (Placement & { kind: 'door' | 'window' }) | null;
  box?: { a: Pt; b: Pt; crossing: boolean } | null;
  points?: Pt[];
  marks?: { a: Pt; b: Pt }[];
  snap?: SnapResult | null;
  cursor?: Pt | null;
  tooltip?: string[];
}

export interface Scene {
  project: ProjectState;
  img: HTMLImageElement | null;
  view: View;
  size: { w: number; h: number };
  dpr: number;
  layers: Layers;
  selected: Set<string>;
  hover: string | null;
  overlay: Overlay;
}

export const RULER = 20;
const COL = {
  paper: '#fbfbfa', minor: '#eceef1', major: '#d5d9df', ink: '#16181d', accent: '#0b7bff', snap: '#e8590c', guide: '#0891b2',
  measure: '#7c3aed', grid: '#d6336c', dim: '#374151', ruler: '#1f2227', rulerInk: '#9aa3ad', rulerTick: '#4b5360',
};
const MONO = 'ui-monospace, "IBM Plex Mono", "JetBrains Mono", Consolas, monospace';

let layerCanvas: HTMLCanvasElement | null = null;
let tile: { dpr: number; c: HTMLCanvasElement } | null = null;

function hatchTile(dpr: number): HTMLCanvasElement {
  if (tile && tile.dpr === dpr) return tile.c;
  const n = Math.round(7 * dpr), c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9ebee'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#7d858f'; g.lineWidth = Math.max(1, dpr * 0.9); g.lineCap = 'square';
  g.beginPath(); g.moveTo(-1, n + 1); g.lineTo(n + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(n - 1, n + 1); g.lineTo(n + 1, n - 1); g.stroke();
  tile = { dpr, c };
  return c;
}

const halo = (g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string) => {
  g.lineWidth = 3; g.strokeStyle = 'rgba(251,251,250,0.95)'; g.lineJoin = 'round';
  g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y);
};

// ---------------------------------------------------------------------------------------------- main entry

export function drawScene(ctx: CanvasRenderingContext2D, sc: Scene): void {
  const { size, dpr, view, project, layers } = sc;
  const z = view.z;
  const t = project.settings.wallWidth;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.paper; ctx.fillRect(0, 0, size.w, size.h);

  if (layers.grid) drawGrid(ctx, sc);
  drawOrigin(ctx, view);

  // underlay (model space)
  const u = project.underlay;
  if (u && u.visible && layers.underlay && sc.img) {
    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
    ctx.translate(u.x, u.y); ctx.rotate((u.rot * Math.PI) / 180); ctx.scale(u.mmPerPx, u.mmPerPx);
    ctx.globalAlpha = u.opacity; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sc.img, 0, 0, project.imageWidth, project.imageHeight);
    ctx.restore();
  }

  if (layers.structural) drawStructural(ctx, sc);
  if (layers.walls) drawWalls(ctx, sc, t);

  // everything below draws in model space
  ctx.save();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
  const px = 1 / z;
  const els = project.elements;
  if (layers.walls) els.filter(isRect).forEach(r => drawRect(ctx, r, sc.selected.has(r.id), px));
  if (layers.openings) els.filter(isOpening).forEach(o => drawOpeningSymbol(ctx, o, t, (o.type as string) as 'door' | 'window' | 'opening', sc.selected.has(o.id) ? COL.accent : COL.ink, px, o.flip, o.mirror, sc.hover === o.id && !sc.selected.has(o.id)));
  ctx.restore();

  // selection / hover tint on walls (model space polygons)
  ctx.save();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
  for (const w of els.filter(isWall)) {
    const sel = sc.selected.has(w.id), hov = sc.hover === w.id;
    if (!sel && !hov) continue;
    wallPoly(ctx, w, Math.max(t, 3 / z));
    if (sel) { ctx.fillStyle = 'rgba(11,123,255,0.20)'; ctx.fill(); }
    ctx.strokeStyle = sel ? COL.accent : 'rgba(11,123,255,0.55)'; ctx.lineWidth = (sel ? 2 : 1.4) / z; ctx.stroke();
    if (sel) { ctx.setLineDash([6 / z, 4 / z]); ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.restore();

  if (layers.dims) drawDimensions(ctx, sc, t);
  drawOverlay(ctx, sc, t);
  drawGripsAndScaleBar(ctx, sc);
  drawRulers(ctx, sc);
}

// ---------------------------------------------------------------------------------------------- grid, origin, rulers

function drawGrid(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { view, size } = sc, z = view.z;
  const minor = niceStep(10 / z), major = niceStep(minor * 4.5);
  const x0 = -view.x / z, y0 = -view.y / z, x1 = (size.w - view.x) / z, y1 = (size.h - view.y) / z;
  ctx.lineWidth = 1;
  const line = (a: number, vertical: boolean, strong: boolean) => {
    ctx.strokeStyle = strong ? COL.major : COL.minor;
    const s = Math.round((vertical ? a * z + view.x : a * z + view.y)) + 0.5;
    ctx.beginPath();
    if (vertical) { ctx.moveTo(s, 0); ctx.lineTo(s, size.h); } else { ctx.moveTo(0, s); ctx.lineTo(size.w, s); }
    ctx.stroke();
  };
  const run = (from: number, to: number, vertical: boolean) => {
    for (let a = Math.floor(from / minor) * minor; a <= to; a += minor) {
      const strong = Math.abs(a / major - Math.round(a / major)) < 1e-6;
      if (!strong) line(a, vertical, false);
    }
    for (let a = Math.floor(from / major) * major; a <= to; a += major) line(a, vertical, true);
  };
  run(x0, x1, true); run(y0, y1, false);
}

function drawOrigin(ctx: CanvasRenderingContext2D, view: View) {
  const o = toScreen(view, { x: 0, y: 0 });
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#d9480f'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + 22, o.y); ctx.stroke();
  ctx.strokeStyle = '#2b8a3e'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + 22); ctx.stroke();
}

function drawRulers(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { view, size, overlay } = sc, z = view.z;
  const major = niceStep(60 / z), minor = major / (String(major)[0] === '2' ? 4 : 5);
  const fmt = (v: number) => (major >= 1000 ? `${v / 1000}m` : `${Math.round(v)}`);
  ctx.fillStyle = COL.ruler; ctx.fillRect(0, 0, size.w, RULER); ctx.fillRect(0, 0, RULER, size.h);
  ctx.font = `10px ${MONO}`; ctx.fillStyle = COL.rulerInk; ctx.strokeStyle = COL.rulerTick; ctx.lineWidth = 1;
  ctx.save(); ctx.beginPath(); ctx.rect(RULER, 0, size.w - RULER, RULER); ctx.clip();
  for (let a = Math.floor((-view.x / z) / minor) * minor; a * z + view.x < size.w; a += minor) {
    const s = Math.round(a * z + view.x) + 0.5, isMajor = Math.abs(a / major - Math.round(a / major)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(s, RULER); ctx.lineTo(s, isMajor ? 6 : 14); ctx.stroke();
    if (isMajor) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(fmt(a), s + 3, 2); }
  }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, RULER, RULER, size.h - RULER); ctx.clip();
  for (let a = Math.floor((-view.y / z) / minor) * minor; a * z + view.y < size.h; a += minor) {
    const s = Math.round(a * z + view.y) + 0.5, isMajor = Math.abs(a / major - Math.round(a / major)) < 1e-6;
    ctx.beginPath(); ctx.moveTo(RULER, s); ctx.lineTo(isMajor ? 6 : 14, s); ctx.stroke();
    if (isMajor) { ctx.save(); ctx.translate(2, s - 3); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(fmt(a), 0, 0); ctx.restore(); }
  }
  ctx.restore();
  ctx.fillStyle = COL.ruler; ctx.fillRect(0, 0, RULER, RULER); ctx.strokeStyle = '#2e333a'; ctx.strokeRect(0.5, 0.5, size.w - 1, RULER - 1);
  if (overlay.cursor) {
    const c = toScreen(view, overlay.cursor);
    ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1.5;
    if (c.x > RULER) { ctx.beginPath(); ctx.moveTo(c.x, 0); ctx.lineTo(c.x, RULER); ctx.stroke(); }
    if (c.y > RULER) { ctx.beginPath(); ctx.moveTo(0, c.y); ctx.lineTo(RULER, c.y); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------------------------------------- structural grid

function drawStructural(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { view, size, project } = sc;
  ctx.save(); ctx.font = `bold 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const g of project.gridLines as GridLine[]) {
    const sel = sc.selected.has(g.id), v = g.orientation === 'vertical';
    const pos = (v ? g.position * view.z + view.x : g.position * view.z + view.y);
    ctx.strokeStyle = sel ? COL.accent : COL.grid; ctx.lineWidth = sel ? 1.6 : 1; ctx.setLineDash([14, 4, 2, 4]);
    ctx.beginPath();
    if (v) { ctx.moveTo(pos, RULER + 28); ctx.lineTo(pos, size.h); } else { ctx.moveTo(RULER + 28, pos); ctx.lineTo(size.w, pos); }
    ctx.stroke(); ctx.setLineDash([]);
    const c: Pt = v ? { x: pos, y: RULER + 17 } : { x: RULER + 17, y: pos };
    ctx.fillStyle = COL.paper; ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sel ? COL.accent : COL.grid; ctx.fillText(g.label, c.x, c.y + 0.5);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------- walls

function wallPoly(ctx: CanvasRenderingContext2D, w: Seg, t: number) {
  const L = segLen(w) || 1, ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, nx = -uy * t / 2, ny = ux * t / 2;
  ctx.beginPath(); ctx.moveTo(w.x1 + nx, w.y1 + ny); ctx.lineTo(w.x2 + nx, w.y2 + ny); ctx.lineTo(w.x2 - nx, w.y2 - ny); ctx.lineTo(w.x1 - nx, w.y1 - ny); ctx.closePath();
}

/** Walls are drawn as one merged silhouette: outline pass, then hatch pass on top, so joints and T-junctions are clean. */
function drawWalls(ctx: CanvasRenderingContext2D, sc: Scene, t: number) {
  const { size, dpr, view, project, layers } = sc, z = view.z;
  const walls = project.elements.filter(isWall);
  if (!walls.length) return;
  if (!layerCanvas) layerCanvas = document.createElement('canvas');
  const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
  if (layerCanvas.width !== W || layerCanvas.height !== H) { layerCanvas.width = W; layerCanvas.height = H; }
  const g = layerCanvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);

  const td = Math.max(t, 3 / z), o = 1.5 / z;
  const ends = walls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
  const joined = (p: Pt) => ends.filter(q => same(p, q, 1)).length > 1;
  const pass = (width: number, extra: number) => {
    g.lineWidth = width; g.lineCap = 'butt';
    for (const w of walls) {
      const u = unit(w);
      const a = { x: w.x1, y: w.y1 }, b = { x: w.x2, y: w.y2 };
      const ea = joined(a) ? td / 2 + extra : extra, eb = joined(b) ? td / 2 + extra : extra;
      g.beginPath(); g.moveTo(a.x - u.x * ea, a.y - u.y * ea); g.lineTo(b.x + u.x * eb, b.y + u.y * eb); g.stroke();
    }
  };
  g.strokeStyle = COL.ink; pass(td + 2 * o, o);
  if (layers.fill) {
    const pat = g.createPattern(hatchTile(dpr), 'repeat');
    if (pat) { pat.setTransform(new DOMMatrix().scale(1 / (z * dpr))); g.strokeStyle = pat; } else g.strokeStyle = '#e9ebee';
    pass(td, 0);
  } else { g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; pass(td, 0); g.globalCompositeOperation = 'source-over'; }

  // openings cut straight through the wall
  if (layers.openings) {
    g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineCap = 'butt'; g.lineWidth = td + 4 * o;
    for (const e of project.elements.filter(isOpening)) { g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layerCanvas, 0, 0); ctx.restore();
}

function drawRect(ctx: CanvasRenderingContext2D, r: ArchElement, sel: boolean, px: number) {
  ctx.fillStyle = sel ? 'rgba(11,123,255,0.25)' : '#9aa1ab'; ctx.strokeStyle = sel ? COL.accent : COL.ink; ctx.lineWidth = 1.5 * px;
  ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
}

export function drawOpeningSymbol(
  ctx: CanvasRenderingContext2D, e: Seg, t: number, kind: 'door' | 'window' | 'opening',
  color: string, px: number, flip?: boolean, mirror?: boolean, soft = false, alpha = 1,
) {
  const L = segLen(e); if (L < 1) return;
  const u = unit(e), n = { x: -u.y, y: u.x };
  const td = Math.max(t, 3 / (1 / px)), h = td / 2;
  const a: Pt = { x: e.x1, y: e.y1 }, b: Pt = { x: e.x2, y: e.y2 };
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineJoin = 'miter'; ctx.lineWidth = (soft ? 2 : 1.4) * px;
  const line = (p: Pt, q: Pt) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
  const off = (p: Pt, k: number): Pt => ({ x: p.x + n.x * k, y: p.y + n.y * k });
  line(off(a, h), off(a, -h)); line(off(b, h), off(b, -h));                    // jambs
  if (kind === 'window') {
    line(off(a, h), off(b, h)); line(off(a, -h), off(b, -h));                   // frame faces
    ctx.lineWidth = 0.9 * px; line(off(a, h / 3), off(b, h / 3)); line(off(a, -h / 3), off(b, -h / 3));   // glazing
  } else if (kind === 'door') {
    const s = flip ? -1 : 1;
    const hinge = mirror ? b : a, dirClosed = mirror ? { x: -u.x, y: -u.y } : u, ns = { x: n.x * s, y: n.y * s };
    const tip: Pt = { x: hinge.x + ns.x * L, y: hinge.y + ns.y * L };
    ctx.lineWidth = 1.6 * px; line(hinge, tip);                                  // leaf
    const a0 = Math.atan2(dirClosed.y, dirClosed.x), a1 = Math.atan2(ns.y, ns.x);
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
    ctx.lineWidth = 0.9 * px; ctx.setLineDash([5 * px, 3 * px]);
    ctx.beginPath(); ctx.arc(hinge.x, hinge.y, L, a0, a1, d < 0); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------- dimensions

function drawDimensions(ctx: CanvasRenderingContext2D, sc: Scene, t: number) {
  const { view } = sc, z = view.z;
  ctx.save(); ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const w of sc.project.elements.filter(isWall)) {
    const L = segLen(w); if (L * z < 70) continue;
    let a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1); if (a > Math.PI / 2 || a <= -Math.PI / 2) a += Math.PI;
    const m = toScreen(view, { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(a);
    halo(ctx, fmtNum(L), 0, -(Math.max(t, 3 / z) / 2) * z - 5, COL.dim);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------- overlay (previews, snaps)

function drawOverlay(ctx: CanvasRenderingContext2D, sc: Scene, t: number) {
  const { view, overlay: o } = sc, z = view.z;
  const S = (p: Pt) => toScreen(view, p);
  ctx.save();
  ctx.font = `11px ${MONO}`; ctx.textBaseline = 'middle';

  // persistent measurement lines
  for (const m of o.marks ?? []) measureLine(ctx, S(m.a), S(m.b), COL.measure, label(m.a, m.b), false);

  const pv = o.preview;
  if (pv) {
    const a = S(pv.a), b = S(pv.b);
    if (pv.kind === 'wall') {
      ctx.save(); ctx.setTransform(sc.dpr * z, 0, 0, sc.dpr * z, sc.dpr * view.x, sc.dpr * view.y);
      wallPoly(ctx, { x1: pv.a.x, y1: pv.a.y, x2: pv.b.x, y2: pv.b.y }, Math.max(t, 3 / z));
      ctx.fillStyle = 'rgba(11,123,255,0.22)'; ctx.fill(); ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5 / z; ctx.stroke();
      ctx.restore();
    } else if (pv.kind === 'rect') {
      ctx.strokeStyle = COL.accent; ctx.fillStyle = 'rgba(11,123,255,0.10)'; ctx.lineWidth = Math.max(t * z, 3);
      ctx.globalAlpha = 0.35; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else {
      const col = pv.kind === 'align' ? '#e8590c' : COL.measure;
      measureLine(ctx, a, b, col, pv.kind === 'align' ? `${Math.round(angleDeg(pv.a, pv.b))}°` : label(pv.a, pv.b), true);
    }
  }

  // markers for points picked so far (calibration / alignment)
  for (const p of o.points ?? []) { const s = S(p); ctx.fillStyle = COL.measure; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }

  // opening ghost
  if (o.ghost) {
    ctx.save(); ctx.setTransform(sc.dpr * z, 0, 0, sc.dpr * z, sc.dpr * view.x, sc.dpr * view.y);
    drawOpeningSymbol(ctx, o.ghost, t, o.ghost.kind, COL.accent, 1 / z, false, false, true, 0.9);
    ctx.restore();
  }

  // rubber band selection
  if (o.box) {
    const a = S(o.box.a), b = S(o.box.b);
    ctx.fillStyle = o.box.crossing ? 'rgba(47,158,68,0.10)' : 'rgba(11,123,255,0.08)'; ctx.strokeStyle = o.box.crossing ? '#2f9e44' : COL.accent; ctx.lineWidth = 1;
    ctx.setLineDash(o.box.crossing ? [5, 4] : []); ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
  }

  // tracking guides
  for (const gd of o.snap?.guides ?? []) guideLine(ctx, S(gd.a), S(gd.b), gd);

  // snap marker
  const sn = o.snap;
  if (sn && sn.kind !== 'none') {
    const s = S(sn.p); ctx.strokeStyle = COL.snap; ctx.lineWidth = 2; ctx.fillStyle = 'transparent';
    const r = 6;
    if (sn.kind === 'endpoint') ctx.strokeRect(s.x - r, s.y - r, 2 * r, 2 * r);
    else if (sn.kind === 'midpoint') { ctx.beginPath(); ctx.moveTo(s.x, s.y - r - 1); ctx.lineTo(s.x + r + 1, s.y + r); ctx.lineTo(s.x - r - 1, s.y + r); ctx.closePath(); ctx.stroke(); }
    else if (sn.kind === 'intersection') { ctx.beginPath(); ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y + r); ctx.moveTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r); ctx.stroke(); }
    else if (sn.kind === 'nearest') { ctx.beginPath(); ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r); ctx.lineTo(s.x + r, s.y + r); ctx.closePath(); ctx.stroke(); }
    else { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x + 5, s.y); ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x, s.y + 5); ctx.stroke(); }
    const names: Record<string, string> = { endpoint: 'Endpoint', midpoint: 'Midpoint', intersection: 'Intersection', nearest: 'On wall' };
    if (names[sn.kind]) { ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'left'; halo(ctx, names[sn.kind], s.x + 12, s.y - 12, COL.snap); }
  }

  // dynamic input tooltip
  if (o.tooltip?.length && o.cursor) {
    const s = S(o.cursor), lines = o.tooltip;
    ctx.font = `11px ${MONO}`; const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14, h = lines.length * 16 + 8;
    let x = s.x + 16, y = s.y + 18; if (x + w > sc.size.w - 4) x = s.x - 16 - w; if (y + h > sc.size.h - 4) y = s.y - 18 - h;
    ctx.fillStyle = 'rgba(21,23,26,0.92)'; roundRect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = '#e6e9ed'; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, x + 7, y + 12 + i * 16));
  }
  ctx.restore();
}

const label = (a: Pt, b: Pt) => `${fmtMm(dist(a, b))}  ∠${Math.round(angleDeg(a, b))}°`;

function measureLine(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, col: string, text: string, dashed: boolean) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  const ang = Math.atan2(b.y - a.y, b.x - a.x), nx = -Math.sin(ang) * 6, ny = Math.cos(ang) * 6;
  ctx.beginPath(); ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(a.x + nx, a.y + ny); ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.stroke();
  ctx.font = `11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let r = ang; if (r > Math.PI / 2 || r <= -Math.PI / 2) r += Math.PI;
  ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(r); halo(ctx, text, 0, -11, col); ctx.restore();
}

function guideLine(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, g: Guide) {
  ctx.strokeStyle = COL.guide; ctx.lineWidth = 1; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  if (g.label) { ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'left'; halo(ctx, g.label, b.x + 6, b.y - 8, COL.guide); }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------------------------------------- grips + scale bar

export const GRIP = 4.5; // half size in screen px

export function gripPoints(project: ProjectState, selected: Set<string>): { id: string; end: 1 | 2; p: Pt }[] {
  const out: { id: string; end: 1 | 2; p: Pt }[] = [];
  for (const e of project.elements) if (selected.has(e.id) && isWall(e)) { out.push({ id: e.id, end: 1, p: { x: e.x1, y: e.y1 } }); out.push({ id: e.id, end: 2, p: { x: e.x2, y: e.y2 } }); }
  return out;
}

function drawGripsAndScaleBar(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { view, size } = sc;
  for (const g of gripPoints(sc.project, sc.selected)) {
    const s = toScreen(view, g.p);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.6; ctx.fillRect(s.x - GRIP, s.y - GRIP, GRIP * 2, GRIP * 2); ctx.strokeRect(s.x - GRIP, s.y - GRIP, GRIP * 2, GRIP * 2);
  }
  // scale bar
  const mm = niceStep(110 / view.z), w = mm * view.z, x = RULER + 16, y = size.h - 22, seg = 4;
  ctx.save(); ctx.fillStyle = 'rgba(251,251,250,0.9)'; ctx.fillRect(x - 8, y - 22, w + 56, 40);
  for (let i = 0; i < seg; i++) { ctx.fillStyle = i % 2 ? '#fff' : COL.ink; ctx.fillRect(x + (w / seg) * i, y - 4, w / seg, 5); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(x + (w / seg) * i + 0.5, y - 3.5, w / seg, 5); }
  ctx.fillStyle = COL.ink; ctx.font = `10.5px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('0', x, y - 7); ctx.textAlign = 'left'; ctx.fillText(mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`, x + w + 6, y + 3);
  ctx.restore();
}
