// utils/sim/raycast.ts — ray / triangle picking against SimParts (Möller–Trumbore). Engine independent.
import { SimPart } from './types';

export interface Hit { partId: string; t: number }

export function raycast(parts: SimPart[], o: [number, number, number], d: [number, number, number], skip?: (p: SimPart) => boolean): Hit | null {
  let best: Hit | null = null;
  for (const part of parts) {
    if (skip?.(part)) continue;
    const P = part.positions, I = part.indices;
    // quick AABB reject
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      lo0 = Math.min(lo0, P[i]); hi0 = Math.max(hi0, P[i]); lo1 = Math.min(lo1, P[i + 1]); hi1 = Math.max(hi1, P[i + 1]); lo2 = Math.min(lo2, P[i + 2]); hi2 = Math.max(hi2, P[i + 2]);
    }
    let tmin = 0, tmax = best ? best.t : Infinity, ok = true;
    const lo = [lo0, lo1, lo2], hi = [hi0, hi1, hi2];
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo[a] || o[a] > hi[a]) ok = false; }
      else {
        let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) ok = false;
      }
    }
    if (!ok) continue;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = o[0] - P[a], ty = o[1] - P[a + 1], tz = o[2] - P[a + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && (!best || t < best.t)) best = { partId: part.id, t };
    }
  }
  return best;
}
