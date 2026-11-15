// utils/cad/mesh.ts — mesh construction: flat-shaded triangles, boxes and generic polygon extrusion.
import earcut from 'earcut';
import { Poly, MultiPoly, V2 } from './types';

export type V3 = [number, number, number];
export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

/** signed area of a ring in its own 2D frame (positive = counter-clockwise) */
export const ringArea = (r: V2[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;

/** A 2D->3D frame: point (u,v) at depth w maps to O + U*u + V*v + W*w. */
export interface Frame { O: V3; U: V3; V: V3; W: V3 }
export const GROUND: Frame = { O: [0, 0, 0], U: X, V: Z, W: Y };   // plan (x,z) extruded upwards (+y)

export class MeshBuilder {
  positions: number[] = []; normals: number[] = []; indices: number[] = [];

  /** Triangle with a flat normal. If `want` is given the winding is flipped so the face looks that way. */
  tri(a: V3, b: V3, c: V3, want?: V3) {
    let n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-14) return;
    if (want && v3.dot(n, want) < 0) { [b, c] = [c, b]; n = v3.mul(n, -1); }
    n = v3.norm(n);
    const i = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c);
    this.normals.push(...n, ...n, ...n);
    this.indices.push(i, i + 1, i + 2);
  }
  quad(a: V3, b: V3, c: V3, d: V3, want?: V3) { this.tri(a, b, c, want); this.tri(a, c, d, want); }

  /** oriented box centred at c with right-handed unit axes (ex,ey,ez) and full sizes */
  box(c: V3, ex: V3, ey: V3, ez: V3, sx: number, sy: number, sz: number) {
    const A = [ex, ey, ez], H = [sx / 2, sy / 2, sz / 2];
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const j = (i + 1) % 3, k = (i + 2) % 3;
      const n = v3.mul(A[i], s), f = v3.add(c, v3.mul(n, H[i]));
      const u = v3.mul(A[j], H[j]), w = v3.mul(A[k], H[k]);
      this.quad(v3.sub(v3.sub(f, u), w), v3.sub(v3.add(f, u), w), v3.add(v3.add(f, u), w), v3.add(v3.sub(f, u), w), n);
    }
  }
  /** axis-aligned box from min/max corners */
  aabb(min: V3, max: V3) {
    this.box([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], X, Y, Z, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  }

  get empty() { return this.indices.length === 0; }
  get triangles() { return this.indices.length / 3; }
}

const at = (f: Frame, u: number, v: number, w: number): V3 =>
  [f.O[0] + f.U[0] * u + f.V[0] * v + f.W[0] * w, f.O[1] + f.U[1] * u + f.V[1] * v + f.W[1] * w, f.O[2] + f.U[2] * u + f.V[2] * v + f.W[2] * w];

/** Cap triangles of a polygon-with-holes at depth w, facing `dir` (+1 / -1 along W). */
export function cap(b: MeshBuilder, poly: Poly, f: Frame, w: number, dir: 1 | -1) {
  const flat: number[] = [], holes: number[] = [];
  poly.forEach((ring, i) => {
    if (i > 0) holes.push(flat.length / 2);
    ring.forEach(p => flat.push(p[0], p[1]));
  });
  const tris = earcut(flat, holes, 2);
  const want = v3.mul(f.W, dir);
  for (let i = 0; i < tris.length; i += 3) {
    const P = (k: number): V3 => at(f, flat[tris[k] * 2], flat[tris[k] * 2 + 1], w);
    b.tri(P(i), P(i + 1), P(i + 2), want);
  }
}

/** Side walls of every ring of a polygon between depths w0 and w1. Normals point away from the material. */
export function sides(b: MeshBuilder, poly: Poly, f: Frame, w0: number, w1: number) {
  poly.forEach((ring, ri) => {
    const area = ringArea(ring);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const du = q[0] - p[0], dv = q[1] - p[1];
      if (Math.hypot(du, dv) < 1e-9) continue;
      // outward (for an outer ring) normal in (u,v); holes face into the hole instead
      let nu = dv, nv = -du;
      if (area < 0) { nu = -nu; nv = -nv; }
      if (ri > 0) { nu = -nu; nv = -nv; }
      const want = v3.add(v3.mul(f.U, nu), v3.mul(f.V, nv));
      b.quad(at(f, p[0], p[1], w0), at(f, q[0], q[1], w0), at(f, q[0], q[1], w1), at(f, p[0], p[1], w1), want);
    }
  });
}

/** Closed prism: polygon (with holes) extruded from w0 to w1 along the frame's W axis. */
export function extrude(b: MeshBuilder, poly: Poly, f: Frame, w0: number, w1: number, opts: { bottom?: boolean; top?: boolean } = {}) {
  if (w1 - w0 < 1e-9) return;
  sides(b, poly, f, w0, w1);
  if (opts.bottom !== false) cap(b, poly, f, w0, -1);
  if (opts.top !== false) cap(b, poly, f, w1, 1);
}
export const extrudeMulti = (b: MeshBuilder, mp: MultiPoly, f: Frame, w0: number, w1: number) => mp.forEach(p => extrude(b, p, f, w0, w1));
