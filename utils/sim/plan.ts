// utils/sim/plan.ts — plan analysis: wall expansion, opening hosting, room (face) detection.
import { PlanEl } from './types';

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

// ---- rooms: bounded faces of the wall graph (used for floor slabs) -----------------------

const area = (poly: P[]) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y); }, 0) / 2;

export function triangulate(poly: P[]): [P, P, P][] {
  // ear clipping; polygon given CCW (positive area)
  const pts = poly.slice();
  const tris: [P, P, P][] = [];
  const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inTri = (p: P, a: P, b: P, c: P) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  let guard = pts.length * pts.length + 10;
  while (pts.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if (cross(a, b, c) <= 1e-9) continue;
      if (pts.some(p => p !== a && p !== b && p !== c && inTri(p, a, b, c))) continue;
      tris.push([a, b, c]); pts.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (pts.length === 3) tris.push([pts[0], pts[1], pts[2]]);
  return tris;
}

/**
 * Finds the enclosed rooms of the wall graph. Coordinates are plan units; the returned triangles are in the
 * same units. Works for rectangles, L-shapes and buildings with internal partitions.
 */
export function roomTriangles(walls: WallSeg[], tol: number): { tris: [P, P, P][]; rooms: number } {
  const nodes: P[] = [];
  const nodeOf = (p: P) => {
    let i = nodes.findIndex(n => Math.hypot(n.x - p.x, n.y - p.y) <= tol);
    if (i < 0) { nodes.push({ ...p }); i = nodes.length - 1; }
    return i;
  };
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const w of walls) {
    const a = nodeOf({ x: w.x1, y: w.y1 }), b = nodeOf({ x: w.x2, y: w.y2 });
    if (a === b) continue;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([a, b]); }
  }
  // work in a y-up frame so bounded faces come out counter-clockwise
  const N = nodes.map(n => ({ x: n.x, y: -n.y }));
  let adj = N.map(() => [] as number[]);
  edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  // prune dangling walls (they do not bound a room)
  let changed = true;
  while (changed) {
    changed = false;
    adj.forEach((l, i) => { if (l.length === 1) { const j = l[0]; adj[j] = adj[j].filter(x => x !== i); adj[i] = []; changed = true; } });
  }
  adj = adj.map((l, i) => l.slice().sort((a, b) => Math.atan2(N[a].y - N[i].y, N[a].x - N[i].x) - Math.atan2(N[b].y - N[i].y, N[b].x - N[i].x)));

  const seen = new Set<string>();
  const tris: [P, P, P][] = [];
  let rooms = 0;
  for (let u = 0; u < N.length; u++) {
    for (const v0 of adj[u]) {
      if (seen.has(`${u}>${v0}`)) continue;
      const face: number[] = [];
      let a = u, b = v0, steps = 0;
      while (!seen.has(`${a}>${b}`) && steps++ < 10000) {
        seen.add(`${a}>${b}`); face.push(a);
        const list = adj[b]; const idx = list.indexOf(a);
        const next = list[(idx - 1 + list.length) % list.length];
        a = b; b = next;
      }
      if (face.length < 3) continue;
      const poly = face.map(i => N[i]);
      if (area(poly) > 1e-6) {
        rooms++;
        // back to plan frame (y down): flip y and reverse winding to keep area positive in y-up for clipping
        const clip = triangulate(poly);
        clip.forEach(([p, q, r]) => tris.push([{ x: p.x, y: -p.y }, { x: q.x, y: -q.y }, { x: r.x, y: -r.y }]));
      }
    }
  }
  return { tris, rooms };
}
