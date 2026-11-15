// utils/cad/poly.ts — 2D polygon booleans (polygon-clipping) with millimetre-fraction snapping.
import polygonClipping from 'polygon-clipping';
import { MultiPoly, Poly, Ring, V2 } from './types';
import { ringArea } from './mesh';

const q = (v: number) => Math.round(v * 1e4) / 1e4;       // 0.1 mm grid keeps near-coincident edges from making slivers
const snapRing = (r: Ring): Ring => r.map(p => [q(p[0]), q(p[1])] as V2);
const toGeom = (m: MultiPoly): any => m.map(poly => poly.map(snapRing));
const fromGeom = (g: any): MultiPoly => (g as number[][][][]).map(poly =>
  poly.map(ring => { const r = ring.map(p => [p[0], p[1]] as V2); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); return r; }),
).filter(poly => poly.length && poly[0].length >= 3 && Math.abs(ringArea(poly[0])) > 1e-7);

export const area = (m: MultiPoly) => m.reduce((s, p) => s + Math.abs(ringArea(p[0])) - p.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0);
export const union = (...ms: MultiPoly[]): MultiPoly => {
  const g = ms.filter(m => m.length).map(toGeom);
  if (!g.length) return [];
  return fromGeom(polygonClipping.union(g[0], ...g.slice(1)));
};
export const diff = (a: MultiPoly, ...bs: MultiPoly[]): MultiPoly => {
  if (!a.length) return [];
  const cut = bs.filter(m => m.length).map(toGeom);
  if (!cut.length) return a;
  return fromGeom(polygonClipping.difference(toGeom(a), ...cut));
};
export const intersect = (a: MultiPoly, b: MultiPoly): MultiPoly => (a.length && b.length ? fromGeom(polygonClipping.intersection(toGeom(a), toGeom(b))) : []);

/** rectangle as a single-polygon MultiPoly from a centre line segment, with start/end extension */
export const rectFrom = (a: V2, b: V2, halfWidth: number, ext0 = 0, ext1 = 0): Poly => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const d: V2 = [dx / L, dz / L], n: V2 = [-d[1], d[0]];
  const p0: V2 = [a[0] - d[0] * ext0, a[1] - d[1] * ext0], p1: V2 = [b[0] + d[0] * ext1, b[1] + d[1] * ext1];
  return [[
    [p0[0] + n[0] * halfWidth, p0[1] + n[1] * halfWidth], [p1[0] + n[0] * halfWidth, p1[1] + n[1] * halfWidth],
    [p1[0] - n[0] * halfWidth, p1[1] - n[1] * halfWidth], [p0[0] - n[0] * halfWidth, p0[1] - n[1] * halfWidth],
  ]];
};
