// utils/elevation/hip.ts
// Equal-pitch hip roof for ANY simple building outline.
//
// The 45-degree rule: with every roof plane at the same pitch, the line where two
// neighbouring planes meet projects to the bisector of the wall corner in plan.
// For a 90-degree corner that is exactly 45 degrees. Convex corners give hips,
// reflex (internal) corners give valleys, and parallel walls give ridges.
// This module computes all of those lines at once with a "straight skeleton":
// every wall edge moves inwards at the same speed, and the corners follow the
// bisectors. The height of a roof point is simply (pitch) x (how far the wall
// edges have moved when they reach that point).
//
// Pipeline:  walls -> closed loop -> mitred eave offset -> straight skeleton -> planar faces
//
// Everything here works in millimetres, Y up, and is independent of the rest of the
// elevation code. buildHipRoof() returns null when the outline cannot be handled, so
// the caller can fall back to the old bounding-box hip.

export interface P2 { x: number; y: number }
/** t = distance the wavefront travelled from the eave line; roof height = zEave + tanPitch * t */
export interface RoofPt { x: number; y: number; t: number }
export interface HipFace { pts: RoofPt[]; out: P2 }
export interface HipRoof { outline: P2[]; faces: HipFace[]; maxT: number }

const cross = (a: P2, b: P2) => a.x * b.y - a.y * b.x;
const dotp = (a: P2, b: P2) => a.x * b.x + a.y * b.y;
const sub2 = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const len2 = (a: P2) => Math.hypot(a.x, a.y);
const unit2 = (a: P2): P2 => { const l = len2(a) || 1; return { x: a.x / l, y: a.y / l }; };

function polyArea(p: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i], p[(i + 1) % p.length]);
  return s / 2;
}

// ---- 1. walls -> one closed loop ------------------------------------------------

function chainLoop(segs: { a: P2; b: P2 }[], tol: number): P2[] | null {
  const nodes: { sx: number; sy: number; c: number }[] = [];
  const idOf = (p: P2): number => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (Math.hypot(n.sx / n.c - p.x, n.sy / n.c - p.y) < tol) { n.sx += p.x; n.sy += p.y; n.c++; return i; }
    }
    nodes.push({ sx: p.x, sy: p.y, c: 1 });
    return nodes.length - 1;
  };
  const adj = new Map<number, number[]>();
  const link = (i: number, j: number) => { const l = adj.get(i) ?? []; l.push(j); adj.set(i, l); };
  for (const s of segs) {
    const i = idOf(s.a), j = idOf(s.b);
    if (i === j) continue;
    link(i, j); link(j, i);
  }
  if (nodes.length < 3) return null;
  for (let i = 0; i < nodes.length; i++) {
    const l = adj.get(i);
    if (!l || l.length !== 2 || l[0] === l[1]) return null;   // every corner must join exactly two walls
  }
  const order: number[] = [];
  let prev = -1, cur = 0;
  do {
    order.push(cur);
    const [a, b] = adj.get(cur)!;
    const nxt = a !== prev ? a : b;
    prev = cur; cur = nxt;
  } while (cur !== 0 && order.length <= nodes.length);
  if (order.length !== nodes.length) return null;              // several loops or an open chain
  return order.map(i => ({ x: nodes[i].sx / nodes[i].c, y: nodes[i].sy / nodes[i].c }));
}

/** drop dead-straight and near-zero-length corners (they would create fake hip lines) */
function cleanLoop(p: P2[]): P2[] | null {
  let pts = p.slice();
  if (polyArea(pts) < 0) pts.reverse();                        // make it counter-clockwise
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const d1 = unit2(sub2(b, a)), d2 = unit2(sub2(c, b));
      const tiny = len2(sub2(b, a)) < 1;
      const straight = Math.abs(cross(d1, d2)) < 1e-3 && dotp(d1, d2) > 0;
      if (tiny || straight) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts.length >= 3 ? pts : null;
}

// ---- 2. mitred eave offset ------------------------------------------------------

function offsetMitre(p: P2[], o: number): P2[] | null {
  if (o <= 0) return p;
  const n = p.length;
  const outN = p.map((a, i) => { const d = unit2(sub2(p[(i + 1) % n], a)); return { x: d.y, y: -d.x }; });
  const res: P2[] = [];
  for (let i = 0; i < n; i++) {
    const n1 = outN[(i + n - 1) % n], n2 = outN[i];
    const den = 1 + dotp(n1, n2);
    if (den < 1e-3) return null;                               // hairpin corner
    res.push({ x: p[i].x + (o * (n1.x + n2.x)) / den, y: p[i].y + (o * (n1.y + n2.y)) / den });
  }
  return polyArea(res) > 0 ? res : null;
}

// ---- 3. straight skeleton -------------------------------------------------------

interface Acc { segs: Rec[]; out: P2; n: P2; p0: P2 }
interface Rec { d: P2; n: P2; left: RoofPt[]; right: RoofPt[]; face: Acc }
interface Vx {
  qx: number; qy: number; vx: number; vy: number;   // position at time t = q + v*t
  prev: Vx; next: Vx; pe: Rec; ne: Rec; anti: boolean; alive: boolean;
}

const EPS_T = 1e-7;
const EPS_L = 1e-3;

function skeleton(poly: P2[]): HipFace[] | null {
  const n = poly.length;
  const faces: Acc[] = [];
  const recs: Rec[] = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const d = unit2(sub2(b, a));
    const nn = { x: -d.y, y: d.x };                            // inward normal (polygon is CCW)
    const face: Acc = { segs: [], out: { x: -nn.x, y: -nn.y }, n: nn, p0: a };
    const r: Rec = { d, n: nn, left: [{ x: a.x, y: a.y, t: 0 }], right: [{ x: b.x, y: b.y, t: 0 }], face };
    face.segs.push(r); faces.push(face);
    return r;
  });

  const alive = new Set<Vx>();
  let now = 0;

  const pos = (v: Vx, t: number): P2 => ({ x: v.qx + v.vx * t, y: v.qy + v.vy * t });
  const mk = (x: number, y: number, t: number, pe: Rec, ne: Rec): Vx => {
    const den = 1 + dotp(pe.n, ne.n);
    const anti = den < 1e-7;                                   // two parallel, opposite edges meet: a ridge
    const vx = anti ? 0 : (pe.n.x + ne.n.x) / den, vy = anti ? 0 : (pe.n.y + ne.n.y) / den;
    const v = { qx: anti ? x : x - vx * t, qy: anti ? y : y - vy * t, vx, vy, pe, ne, anti, alive: true } as Vx;
    alive.add(v);
    return v;
  };
  const kill = (v: Vx) => { v.alive = false; alive.delete(v); };
  const splice = (a: Vx, x: Vx, b: Vx) => { a.next = x; x.prev = a; x.next = b; b.prev = x; };

  // initial wavefront
  const vs: Vx[] = poly.map((p, i) => mk(p.x, p.y, 0, recs[(i + n - 1) % n], recs[i]));
  vs.forEach((v, i) => { v.next = vs[(i + 1) % n]; v.prev = vs[(i + n - 1) % n]; });

  const loopSize = (v: Vx): number => { let c = 1, u = v.next; while (u !== v && c < 4) { c++; u = u.next; } return c; };

  /** close a loop of one or two vertices: remaining positions become the end of their faces */
  const finalize = (v: Vx) => {
    const group: Vx[] = [v];
    if (v.next !== v) { group.push(v.next); if (v.next.next !== v) return; }
    for (const u of group) {
      const P = pos(u, now);
      u.ne.left.push({ x: P.x, y: P.y, t: now });
      u.pe.right.push({ x: P.x, y: P.y, t: now });
      kill(u);
    }
  };

  /** parallel opposite edges lying on top of each other collapse into a ridge segment */
  const resolveAnti = (x: Vx): Vx | null => {
    let guard = 0;
    while (x.anti && x.alive && guard++ < 50) {
      if (loopSize(x) <= 2) return x;
      const u = x.prev, y = x.next;
      const P = pos(x, now);
      const d = x.pe.d;
      const lu = dotp(d, sub2(P, pos(u, now)));                // length of pe still to the left of P
      const ly = -dotp(d, sub2(pos(y, now), P));               // length of ne
      const pt = (p: P2): RoofPt => ({ x: p.x, y: p.y, t: now });
      const pe = x.pe, ne = x.ne;
      pe.right.push(pt(P)); ne.left.push(pt(P));               // x dies at P
      if (lu > ly + EPS_L) {                                   // y lies on pe
        const Py = pos(y, now);
        ne.right.push(pt(Py)); y.ne.left.push(pt(Py)); pe.right.push(pt(Py));
        const z = mk(Py.x, Py.y, now, pe, y.ne);
        const after = y.next, before = u;
        kill(x); kill(y);
        splice(before, z, after);
        x = z;
      } else if (ly > lu + EPS_L) {                            // u lies on ne
        const Pu = pos(u, now);
        pe.left.push(pt(Pu)); u.pe.right.push(pt(Pu)); ne.left.push(pt(Pu));
        const z = mk(Pu.x, Pu.y, now, u.pe, ne);
        const before = u.prev, after = y;
        kill(x); kill(u);
        splice(before, z, after);
        x = z;
      } else {                                                 // exactly equal: all three meet
        const Pu = pos(u, now);
        pe.left.push(pt(Pu)); u.pe.right.push(pt(Pu));
        ne.right.push(pt(Pu)); y.ne.left.push(pt(Pu));
        const z = mk(Pu.x, Pu.y, now, u.pe, y.ne);
        const before = u.prev, after = y.next;
        kill(x); kill(u); kill(y);
        if (before === y || before === x || before === u) { z.prev = z; z.next = z; } else splice(before, z, after);
        x = z;
      }
    }
    return x;
  };

  const settle = (v: Vx | null) => {
    if (!v || !v.alive) return;
    const r = resolveAnti(v);
    if (r && r.alive && loopSize(r) <= 2) finalize(r);
  };

  type Ev = { t: number; kind: 'edge' | 'split'; v: Vx; a?: Vx };
  let guard = 0;
  while (alive.size > 0 && guard++ < 20 * n + 100) {
    let best: Ev | null = null;
    const offer = (e: Ev) => { if (!best || e.t < best.t - 1e-9 || (Math.abs(e.t - best.t) <= 1e-9 && e.kind === 'edge' && best.kind === 'split')) best = e; };

    for (const v of alive) {
      // edge event: edge v -> v.next shrinks to nothing
      const w = v.next, d = v.ne.d;
      const L0 = dotp(d, sub2(pos(w, now), pos(v, now)));
      if (L0 <= EPS_L) offer({ t: now, kind: 'edge', v });
      else {
        const num = dotp(d, { x: w.qx - v.qx, y: w.qy - v.qy });
        const den = dotp(d, { x: w.vx - v.vx, y: w.vy - v.vy });
        if (den < -1e-12) { const t = -num / den; if (t >= now - EPS_T) offer({ t: Math.max(t, now), kind: 'edge', v }); }
      }
      // split event: reflex vertex runs into an opposite edge
      if (v.anti || cross(v.pe.d, v.ne.d) > -1e-9) continue;
      for (const a of alive) {
        const e = a.ne;
        if (e === v.pe || e === v.ne) continue;
        const den = dotp(e.n, { x: v.vx, y: v.vy }) - 1;
        if (den > -1e-9) continue;
        const ce = dotp(e.n, { x: a.qx, y: a.qy });
        const t = (ce - dotp(e.n, { x: v.qx, y: v.qy })) / den;
        if (t < now - EPS_T) continue;
        const tt = Math.max(t, now);
        const H = pos(v, tt), b = a.next;
        const s = dotp(e.d, H), sa = dotp(e.d, pos(a, tt)), sb = dotp(e.d, pos(b, tt));
        if (s >= sa - 1e-2 && s <= sb + 1e-2) offer({ t: tt, kind: 'split', v, a });
      }
    }
    if (!best) return null;
    const ev: Ev = best;
    now = ev.t;
    const pt = (p: P2): RoofPt => ({ x: p.x, y: p.y, t: now });

    if (ev.kind === 'edge') {
      const v = ev.v, w = v.next, e = v.ne;
      const A = pos(v, now), B = pos(w, now);
      const N = pt({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
      e.left.push(N); e.right.push(N);
      v.pe.right.push(N); w.ne.left.push(N);
      const before = v.prev, after = w.next;
      const vpe = v.pe, wne = w.ne;
      kill(v); kill(w);
      const z = mk(N.x, N.y, now, vpe, wne);
      if (before === w || after === v || before === v) { z.prev = z; z.next = z; }
      else splice(before, z, after);
      settle(z);
    } else {
      const v = ev.v, a = ev.a!, b = a.next, e = a.ne;
      const H = pos(v, now), N = pt(H);
      v.pe.right.push(N); v.ne.left.push(N);
      const e1: Rec = { d: e.d, n: e.n, left: e.left, right: [N], face: e.face };
      const e2: Rec = { d: e.d, n: e.n, left: [N], right: e.right, face: e.face };
      const i = e.face.segs.indexOf(e);
      e.face.segs.splice(i, 1, e1, e2);
      const vp = v.prev, vn = v.next, vpe = v.pe, vne = v.ne;
      a.ne = e1; b.pe = e2;
      kill(v);
      const v1 = mk(H.x, H.y, now, e1, vne);                   // loop: a -> v1 -> vn ...
      const v2 = mk(H.x, H.y, now, vpe, e2);                   // loop: vp -> v2 -> b ...
      a.next = v1; v1.prev = a; v1.next = vn; vn.prev = v1;
      vp.next = v2; v2.prev = vp; v2.next = b; b.prev = v2;
      settle(v1); settle(v2);
    }
    // any loop that shrank to <= 2 vertices is finished
    for (const u of Array.from(alive)) if (u.alive && loopSize(u) <= 2) finalize(u);
  }
  if (alive.size > 0) return null;

  // ---- assemble face polygons: left chain, reversed right chain, per segment ----
  const out: HipFace[] = [];
  for (const f of faces) {
    const pts: RoofPt[] = [];
    for (const s of f.segs) { pts.push(...s.left); pts.push(...s.right.slice().reverse()); }
    const clean: RoofPt[] = [];
    for (const p of pts) {
      const l = clean[clean.length - 1];
      if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-2) clean.push(p);
    }
    while (clean.length > 1 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) <= 1e-2) clean.pop();
    if (clean.length >= 3 && Math.abs(polyArea(clean)) > 1) out.push({ pts: clean, out: f.out });
  }
  // every face must lie on its own plane: t == n . (p - p0)
  for (const f of faces) {
    const fo = out.find(o => o.out === f.out);
    if (!fo) continue;
    for (const p of fo.pts) {
      const tt = dotp(f.n, sub2(p, f.p0));
      if (Math.abs(tt - p.t) > 2 + 1e-4 * Math.abs(p.t)) return null;
    }
  }
  return out;
}

// ---- public entry point ---------------------------------------------------------

export function buildHipRoof(walls: { a: P2; b: P2 }[], tol: number, overhang: number): HipRoof | null {
  try {
    const loop0 = chainLoop(walls, tol);
    if (!loop0) return null;
    const loop = cleanLoop(loop0);
    if (!loop) return null;
    const outline = offsetMitre(loop, overhang);
    if (!outline) return null;
    const faces = skeleton(outline);
    if (!faces || faces.length < 3) return null;
    // faces must tile the eave outline exactly
    const total = faces.reduce((s, f) => s + Math.abs(polyArea(f.pts)), 0);
    const want = polyArea(outline);
    if (Math.abs(total - want) > 0.005 * want) return null;
    const maxT = Math.max(...faces.flatMap(f => f.pts.map(p => p.t)));
    if (!isFinite(maxT)) return null;
    return { outline, faces, maxT };
  } catch {
    return null;
  }
}
