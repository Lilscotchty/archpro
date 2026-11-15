// utils/drafting/ops.ts
// Pure editing operations on the plan: hit testing, joined-wall moves, opening placement, rectangle -> walls.

import { ArchElement, ProjectState } from '../../types';
import { Pt, Seg, dist, projectOnSeg, same, segLen, unit } from './geometry';

export const isWall = (e: ArchElement) => (e.type as string) === 'wall';
export const isOpening = (e: ArchElement) => { const t = e.type as string; return t === 'door' || t === 'window' || t === 'opening'; };
export const isRect = (e: ArchElement) => (e.type as string) === 'rect';

export const DEFAULT_DOOR_W = 900;
export const DEFAULT_WINDOW_W = 1200;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const newWall = (a: Pt, b: Pt): ArchElement =>
  ({ id: uid(), type: 'wall', x1: a.x, y1: a.y, x2: b.x, y2: b.y, gridRef: '' }) as unknown as ArchElement;

/** A rectangle drawn corner to corner becomes four joined walls. */
export function rectangleWalls(a: Pt, b: Pt): ArchElement[] {
  if (Math.abs(b.x - a.x) < 1 || Math.abs(b.y - a.y) < 1) return [];
  const c: Pt[] = [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
  return c.map((p, i) => newWall(p, c[(i + 1) % 4]));
}

export interface Hit { id: string; kind: 'wall' | 'opening' | 'rect' | 'grid' }

/** Topmost element under a model point. Openings win over the wall they sit in. */
export function hitTest(p: Pt, project: ProjectState, zoom: number): Hit | null {
  const t = project.settings.wallWidth;
  const px = 6 / zoom;
  const els = project.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (!isOpening(e)) continue;
    if (projectOnSeg(p, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }).d <= Math.max(t / 2, px)) return { id: e.id, kind: 'opening' };
  }
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (isWall(e) && projectOnSeg(p, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }).d <= Math.max(t / 2, px)) return { id: e.id, kind: 'wall' };
    if (isRect(e)) {
      const x0 = Math.min(e.x1, e.x2) - px, x1 = Math.max(e.x1, e.x2) + px, y0 = Math.min(e.y1, e.y2) - px, y1 = Math.max(e.y1, e.y2) + px;
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) return { id: e.id, kind: 'rect' };
    }
  }
  for (const g of project.gridLines) {
    if (Math.abs((g.orientation === 'vertical' ? p.x : p.y) - g.position) <= px) return { id: g.id, kind: 'grid' };
  }
  return null;
}

/** Elements touched by (crossing) or inside (window) a box, for rubber-band selection. */
export function boxSelect(project: ProjectState, a: Pt, b: Pt, crossing: boolean): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const crosses = (e: Seg) => {
    if (inside(e.x1, e.y1) || inside(e.x2, e.y2)) return true;
    const mx0 = Math.min(e.x1, e.x2), mx1 = Math.max(e.x1, e.x2), my0 = Math.min(e.y1, e.y2), my1 = Math.max(e.y1, e.y2);
    if (mx1 < x0 || mx0 > x1 || my1 < y0 || my0 > y1) return false;
    // segment vs box edges
    const edges: Seg[] = [{ x1: x0, y1: y0, x2: x1, y2: y0 }, { x1: x1, y1: y0, x2: x1, y2: y1 }, { x1: x1, y1: y1, x2: x0, y2: y1 }, { x1: x0, y1: y1, x2: x0, y2: y0 }];
    return edges.some(s => segsCross(e, s));
  };
  const out: string[] = [];
  for (const e of project.elements) {
    if (isRect(e)) { const full = inside(e.x1, e.y1) && inside(e.x2, e.y2); if (full || (crossing && crosses(e))) out.push(e.id); continue; }
    const full = inside(e.x1, e.y1) && inside(e.x2, e.y2);
    if (full || (crossing && crosses(e))) out.push(e.id);
  }
  return out;
}

function segsCross(a: Seg, b: Seg): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1), d2 = o(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const d3 = o(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1), d4 = o(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// ------------------------------------------------------------------ moving and stretching

const JOIN_TOL = 1; // mm: wall ends closer than this are considered joined

/** Move elements by (dx,dy). Walls that share an end with a moved wall stretch with it; hosted openings travel along. */
export function moveElements(project: ProjectState, ids: Set<string>, dx: number, dy: number): ArchElement[] {
  const moving = project.elements.filter(e => ids.has(e.id));
  const movedWalls = moving.filter(isWall);
  const ends: Pt[] = movedWalls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
  const t = project.settings.wallWidth;
  const hosted = (o: ArchElement) => movedWalls.some(w => projectOnSeg({ x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 }, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }).d <= t);
  return project.elements.map(e => {
    if (ids.has(e.id) || (isOpening(e) && hosted(e))) return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
    if (isWall(e)) {
      let { x1, y1, x2, y2 } = e;
      if (ends.some(p => same(p, { x: x1, y: y1 }, JOIN_TOL))) { x1 += dx; y1 += dy; }
      if (ends.some(p => same(p, { x: x2, y: y2 }, JOIN_TOL))) { x2 += dx; y2 += dy; }
      return x1 === e.x1 && y1 === e.y1 && x2 === e.x2 && y2 === e.y2 ? e : { ...e, x1, y1, x2, y2 };
    }
    return e;
  });
}

/** Drag one end of a wall to `to`; every other wall end that was joined at the same point follows. */
export function stretchEnd(project: ProjectState, id: string, end: 1 | 2, to: Pt): ArchElement[] {
  const w = project.elements.find(e => e.id === id);
  if (!w) return project.elements;
  const from: Pt = end === 1 ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
  return project.elements.map(e => {
    if (!isWall(e)) return e;
    let { x1, y1, x2, y2 } = e;
    if (e.id === id) { if (end === 1) { x1 = to.x; y1 = to.y; } else { x2 = to.x; y2 = to.y; } }
    else {
      if (same(from, { x: x1, y: y1 }, JOIN_TOL)) { x1 = to.x; y1 = to.y; }
      if (same(from, { x: x2, y: y2 }, JOIN_TOL)) { x2 = to.x; y2 = to.y; }
    }
    return { ...e, x1, y1, x2, y2 };
  });
}

/** Set a wall's length, keeping its start point and direction. Joined walls at the far end follow. */
export function setWallLength(project: ProjectState, id: string, lengthMm: number): ArchElement[] {
  const w = project.elements.find(e => e.id === id);
  if (!w || !(lengthMm > 0)) return project.elements;
  const u = unit(w);
  return stretchEnd(project, id, 2, { x: w.x1 + u.x * lengthMm, y: w.y1 + u.y * lengthMm });
}

// ------------------------------------------------------------------ openings

export interface Placement { x1: number; y1: number; x2: number; y2: number; hostId: string }

/**
 * Where a door or window of `widthMm` would go if placed with its centre near `p`.
 * It sits on the nearest wall, aligned with it, and is kept fully inside the wall.
 */
export function placeOpening(project: ProjectState, p: Pt, widthMm: number, zoom: number): Placement | null {
  const tol = Math.max(project.settings.wallWidth, 40 / zoom);
  let best: { e: ArchElement; t: number; q: Pt; d: number } | null = null;
  for (const e of project.elements) {
    if (!isWall(e)) continue;
    const r = projectOnSeg(p, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
    if (r.d <= tol && (!best || r.d < best.d)) best = { e, ...r };
  }
  if (!best) return null;
  const w = best.e, L = segLen(w);
  const width = Math.min(widthMm, L * 0.95);
  let ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
  if (ux < 0 || (ux === 0 && uy < 0)) { ux = -ux; uy = -uy; }
  // centre along the wall, clamped so the opening stays inside it; snap to the wall centre when close
  const a: Pt = { x: w.x1, y: w.y1 };
  let s = dist(a, best.q);
  const half = width / 2;
  s = Math.max(half, Math.min(L - half, s));
  if (Math.abs(s - L / 2) < 120 / zoom) s = L / 2;
  const c: Pt = { x: a.x + ((w.x2 - w.x1) / L) * s, y: a.y + ((w.y2 - w.y1) / L) * s };
  return { x1: c.x - ux * half, y1: c.y - uy * half, x2: c.x + ux * half, y2: c.y + uy * half, hostId: w.id };
}

export const newOpening = (kind: 'door' | 'window', pl: Placement): ArchElement =>
  ({ id: uid(), type: kind, x1: pl.x1, y1: pl.y1, x2: pl.x2, y2: pl.y2, gridRef: '' }) as unknown as ArchElement;

/** Walls that touch end-to-end, used for the "closed loop" report. */
export function planStats(project: ProjectState) {
  const walls = project.elements.filter(isWall);
  const total = walls.reduce((a, w) => a + segLen(w), 0);
  const ends: Pt[] = walls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
  const dangling = ends.filter(p => ends.filter(q => same(p, q, JOIN_TOL)).length === 1).length;
  return { walls: walls.length, openings: project.elements.filter(isOpening).length, totalMm: total, dangling };
}

/** Remove elements; doors and windows left with no wall under them go too. */
export function removeElements(project: ProjectState, ids: Set<string>): ArchElement[] {
  const t = project.settings.wallWidth;
  const gone = project.elements.filter(e => ids.has(e.id) && isWall(e));
  const keep = project.elements.filter(e => !ids.has(e.id));
  const left = keep.filter(isWall);
  const on = (o: ArchElement, ws: ArchElement[]) => ws.some(w => projectOnSeg({ x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 }, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }).d <= t);
  return keep.filter(e => !(isOpening(e) && on(e, gone) && !on(e, left)));
}
