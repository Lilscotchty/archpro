// utils/drafting/snap.ts
// Object snap + tracking for the drafting cursor. Returns the snapped point, what it snapped to, and guide lines to draw.

import { ArchElement, GridLine } from '../../types';
import { Pt, Seg, dist, projectOnSeg, segIntersect, angleDeg, polar, normDeg, niceStep } from './geometry';

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection' | 'nearest' | 'grid' | 'align' | 'polar' | 'none';
export interface Guide { a: Pt; b: Pt; label?: string }
export interface SnapResult { p: Pt; kind: SnapKind; guides: Guide[] }

export interface SnapSettings { object: boolean; grid: boolean; track: boolean; ortho: boolean }

export interface SnapInput {
  raw: Pt;
  elements: ArchElement[];
  gridLines: GridLine[];
  zoom: number;            // screen px per mm
  from?: Pt | null;        // previous point when drawing
  settings: SnapSettings;
  exclude?: Set<string>;   // element ids that must not attract the cursor (e.g. the ones being moved)
}

const TOL_PX = 12;
const POLAR_STEP = 15;
const POLAR_TOL = 4;

/** Wall segments plus the sides of legacy rectangles. */
export function snapSegments(els: ArchElement[], exclude?: Set<string>): Seg[] {
  const out: Seg[] = [];
  for (const e of els) {
    if (exclude?.has(e.id)) continue;
    const t = e.type as string;
    if (t === 'wall') out.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 });
    else if (t === 'rect') {
      const c = [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y1 }, { x: e.x2, y: e.y2 }, { x: e.x1, y: e.y2 }];
      c.forEach((p, i) => { const q = c[(i + 1) % 4]; out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y }); });
    }
  }
  return out.filter(s => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 1e-6);
}

/** The grid step in mm that the canvas shows at this zoom (used for grid snapping too). */
export const gridStepMm = (zoom: number) => niceStep(10 / Math.max(zoom, 1e-9));

export function snap(inp: SnapInput): SnapResult {
  const { raw, zoom, from, settings } = inp;
  const tol = TOL_PX / zoom;
  const segs = snapSegments(inp.elements, inp.exclude);
  const none: SnapResult = { p: raw, kind: 'none', guides: [] };

  // 1. object snaps, in priority order: endpoint, intersection, midpoint, nearest
  if (settings.object && segs.length) {
    let best: { p: Pt; kind: SnapKind; rank: number; d: number } | null = null;
    const consider = (p: Pt, kind: SnapKind, rank: number) => {
      const d = dist(raw, p);
      if (d > tol) return;
      if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { p, kind, rank, d };
    };
    for (const s of segs) {
      consider({ x: s.x1, y: s.y1 }, 'endpoint', 0);
      consider({ x: s.x2, y: s.y2 }, 'endpoint', 0);
      consider({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }, 'midpoint', 2);
      const r = projectOnSeg(raw, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      consider(r.q, 'nearest', 3);
    }
    if (segs.length < 200) {
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        const q = segIntersect(segs[i], segs[j]);
        if (q) consider(q, 'intersection', 1);
      }
    }
    if (best) { const b = best as { p: Pt; kind: SnapKind }; return { p: b.p, kind: b.kind, guides: [] }; }
  }

  let p = { ...raw };
  const guides: Guide[] = [];
  let kind: SnapKind = 'none';
  let lockedAxis = false;

  // 2. orthogonal / polar tracking from the previous point
  if (from && (settings.ortho || settings.track)) {
    const len = dist(from, raw);
    if (len > 1e-6) {
      const ang = angleDeg(from, raw);
      let target: number | null = null;
      if (settings.ortho) target = Math.round(ang / 90) * 90;
      else {
        const t = Math.round(ang / POLAR_STEP) * POLAR_STEP;
        if (Math.abs(normDeg(ang - t)) <= POLAR_TOL) target = t;
      }
      if (target !== null) {
        const a = normDeg(target);
        const r = (a * Math.PI) / 180;
        const proj = (raw.x - from.x) * Math.cos(r) + -(raw.y - from.y) * Math.sin(r);
        const L = Math.max(0, proj);
        p = polar(from, L, a);
        guides.push({ a: from, b: polar(from, Math.max(L, 20 / zoom) + 40 / zoom, a), label: `${Math.round(a)}°` });
        kind = 'polar'; lockedAxis = true;
      }
    }
  }

  // 3. alignment with existing endpoints (horizontal / vertical tracking lines)
  if (settings.track && !lockedAxis && segs.length) {
    let ax: Pt | null = null, ay: Pt | null = null, dx = tol, dy = tol;
    const pts: Pt[] = segs.flatMap(s => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]);
    if (from) pts.push(from);
    for (const q of pts) {
      if (Math.abs(raw.x - q.x) < dx) { dx = Math.abs(raw.x - q.x); ax = q; }
      if (Math.abs(raw.y - q.y) < dy) { dy = Math.abs(raw.y - q.y); ay = q; }
    }
    if (ax) { p = { ...p, x: ax.x }; guides.push({ a: ax, b: { x: ax.x, y: p.y } }); kind = 'align'; }
    if (ay) { p = { ...p, y: ay.y }; guides.push({ a: ay, b: { x: p.x, y: ay.y } }); kind = 'align'; }
    // structural grid lines attract too
    for (const g of inp.gridLines) {
      if (g.orientation === 'vertical' && Math.abs(raw.x - g.position) < tol && !ax) { p = { ...p, x: g.position }; kind = 'align'; }
      if (g.orientation === 'horizontal' && Math.abs(raw.y - g.position) < tol && !ay) { p = { ...p, y: g.position }; kind = 'align'; }
    }
  }

  // 4. grid
  if (settings.grid) {
    const s = gridStepMm(zoom);
    if (!lockedAxis) {
      if (kind !== 'align') p = { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
      else {
        const ax = guides.some(g => g.a.x === g.b.x), ay = guides.some(g => g.a.y === g.b.y);
        p = { x: ax ? p.x : Math.round(p.x / s) * s, y: ay ? p.y : Math.round(p.y / s) * s };
      }
      if (kind === 'none') kind = 'grid';
    } else if (from) {
      // along a locked direction: round the length
      const a = angleDeg(from, p), L = Math.round(dist(from, p) / s) * s;
      p = polar(from, L, a);
    }
  }
  return kind === 'none' && !settings.grid ? none : { p, kind, guides };
}
