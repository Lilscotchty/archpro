// utils/cad/plan2d.ts — small 2D plan helpers: wall expansion (walls + rectangle sides) and opening hosting.
export interface PlanEl { id: string; type: string; x1: number; y1: number; x2: number; y2: number; sill?: number; height?: number }
export interface WallSeg { key: string; hostId: string; x1: number; y1: number; x2: number; y2: number }
type P = { x: number; y: number };

/** Walls and the four sides of every rectangle become wall segments. */
export function expandWalls(els: PlanEl[]): WallSeg[] {
  const out: WallSeg[] = [];
  for (const e of els) {
    if (e.type === 'wall') out.push({ key: e.id, hostId: e.id, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 });
    else if (e.type === 'rect') {
      const c: P[] = [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y1 }, { x: e.x2, y: e.y2 }, { x: e.x1, y: e.y2 }];
      c.forEach((p, i) => { const q = c[(i + 1) % 4]; if (Math.hypot(q.x - p.x, q.y - p.y) > 1) out.push({ key: `${e.id}:${i}`, hostId: e.id, x1: p.x, y1: p.y, x2: q.x, y2: q.y }); });
    }
  }
  return out.filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1e-6);
}

export function projectOnSeg(p: P, w: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / l2));
  const q = { x: w.x1 + dx * t, y: w.y1 + dy * t };
  return { t, q, d: Math.hypot(p.x - q.x, p.y - q.y) };
}

/** Nearest wall segment to a point, within `tol` drawing units. */
export function hostWall(p: P, walls: WallSeg[], tol: number) {
  let best: { w: WallSeg; t: number; q: P; d: number } | null = null;
  for (const w of walls) {
    const r = projectOnSeg(p, w);
    if (r.d <= tol && (!best || r.d < best.d)) best = { w, ...r };
  }
  return best;
}
