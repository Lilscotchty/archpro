// utils/sim/build.ts — turns the 2D plan (walls, rectangles, doors, windows, columns) into simple 3D parts.
// Pure TypeScript: no engine or DOM dependency, so it can be unit-tested and exported to glTF directly.

import { DEFAULT_SIM, MatKey, PartKind, PlanEl, SimModel, SimPart, SimSettings } from './types';
import { WallSeg, expandWalls, hostWall, roomTriangles, triangulate } from './plan';
import { buildHipRoof } from '../elevation/hip';

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Buf {
  positions: number[] = []; normals: number[] = []; indices: number[] = [];
  /** triangle with a flat normal; winding is flipped if it disagrees with `want` (when given) */
  tri(a: V3, b: V3, c: V3, want?: V3) {
    let n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) return;
    if (want && n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) { [b, c] = [c, b]; n = mul(n, -1); }
    n = norm(n);
    const i = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c); this.normals.push(...n, ...n, ...n); this.indices.push(i, i + 1, i + 2);
  }
  quad(a: V3, b: V3, c: V3, d: V3, want?: V3) { this.tri(a, b, c, want); this.tri(a, c, d, want); }
  /** oriented box: centre, orthonormal right-handed basis (ex,ey,ez), full sizes */
  box(c: V3, ex: V3, ey: V3, ez: V3, sx: number, sy: number, sz: number) {
    const A = [ex, ey, ez], H = [sx / 2, sy / 2, sz / 2];
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const n = mul(A[i], s);
      const u = A[(i + (s > 0 ? 1 : 2)) % 3], v = A[(i + (s > 0 ? 2 : 1)) % 3];
      const hu = H[(i + (s > 0 ? 1 : 2)) % 3], hv = H[(i + (s > 0 ? 2 : 1)) % 3];
      const f = add(c, mul(n, H[i]));
      this.quad(sub(sub(f, mul(u, hu)), mul(v, hv)), sub(add(f, mul(u, hu)), mul(v, hv)), add(add(f, mul(u, hu)), mul(v, hv)), add(sub(f, mul(u, hu)), mul(v, hv)), n);
    }
  }
  get empty() { return this.indices.length === 0; }
}

const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

export function buildModel(els: PlanEl[], cfg: Partial<SimSettings> = {}): SimModel {
  const S: SimSettings = { ...DEFAULT_SIM, ...cfg, roof: { ...DEFAULT_SIM.roof, ...(cfg.roof ?? {}) } };
  const k = S.mmPerUnit / 1000;                       // drawing unit -> metres
  const T = S.wallThicknessMm / 1000, floorH = S.floorHeightMm / 1000, plinth = S.plinthMm / 1000, slabT = S.slabMm / 1000;
  const floors = Math.max(1, Math.round(S.floors));
  const ffl = (lvl: number) => plinth + lvl * floorH;  // finished floor level of storey `lvl`
  const yTop = ffl(floors);
  const tolUnits = Math.max(T * 750 + 150, 350) / S.mmPerUnit;   // hosting tolerance in drawing units

  const parts: SimPart[] = [];
  const warnings: string[] = [];
  const counters: Record<string, number> = {};
  const push = (kind: PartKind, name: string, level: number, material: MatKey, b: Buf, sourceId?: string) => {
    if (b.empty) return;
    counters[kind] = (counters[kind] ?? 0) + 1;
    parts.push({ id: `${kind}-${counters[kind]}`, name, kind, level, sourceId, material, positions: b.positions, normals: b.normals, indices: b.indices });
  };

  const walls = expandWalls(els);
  const W3 = (x: number, y: number): V3 => [x * k, 0, y * k];

  // ---------- openings -> host walls ----------
  interface Op { el: PlanEl; kind: 'door' | 'window'; seg: WallSeg; s: number; w: number; tag: string; zb: number; h: number }
  const ops = new Map<string, Op[]>();
  let nw = 0, nd = 0, unhosted = 0;
  for (const el of els) {
    if (el.type !== 'door' && el.type !== 'window') continue;
    const mid = { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
    const host = hostWall(mid, walls, tolUnits) ?? hostWall({ x: el.x1, y: el.y1 }, walls, tolUnits);
    if (!host) { unhosted++; continue; }
    const L = Math.hypot(host.w.x2 - host.w.x1, host.w.y2 - host.w.y1) * k;
    let w = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * k;
    if (w < 0.3) w = el.type === 'door' ? 0.9 : 1.2;
    w = Math.min(w, Math.max(0.3, L - 0.2));
    const s = Math.min(Math.max(host.t * L, w / 2 + 0.1), Math.max(L - w / 2 - 0.1, w / 2 + 0.1));
    const kind = el.type as 'door' | 'window';
    const h = (el.height ?? (kind === 'door' ? S.doorHeightMm : S.windowHeightMm)) / 1000;
    const sill = kind === 'door' ? 0 : (el.sill ?? S.windowSillMm) / 1000;
    const tag = kind === 'door' ? `D${++nd}` : `W${++nw}`;
    const list = ops.get(host.w.key) ?? []; list.push({ el, kind, seg: host.w, s, w, tag, zb: sill, h }); ops.set(host.w.key, list);
  }

  // ---------- walls (+ plinth, doors, windows) ----------
  const endpoints = walls.flatMap(w => [{ k: w.key, x: w.x1, y: w.y1 }, { k: w.key, x: w.x2, y: w.y2 }]);
  const joined = (key: string, x: number, y: number) => endpoints.some(p => p.k !== key && Math.hypot(p.x - x, p.y - y) <= tolUnits);
  let wallNo = 0;
  for (const seg of walls) {
    wallNo++;
    const p0 = W3(seg.x1, seg.y1);
    const L = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) * k;
    const ex = norm([(seg.x2 - seg.x1) * k, 0, (seg.y2 - seg.y1) * k]);
    const ez = cross(ex, Y);                                  // right-handed (ex × ey = ez)
    const e0 = joined(seg.key, seg.x1, seg.y1) ? T / 2 : 0, e1 = joined(seg.key, seg.x2, seg.y2) ? T / 2 : 0;
    const at = (s: number, y: number): V3 => add(add(p0, mul(ex, s)), mul(Y, y));
    const wallOps = ops.get(seg.key) ?? [];

    // plinth
    if (plinth > 0.01) {
      const b = new Buf();
      b.box(at((L + e1 - e0) / 2, plinth / 2), ex, Y, ez, L + e0 + e1, plinth, T);
      push('wall', `Plinth ${wallNo}`, 0, 'plinth', b, seg.hostId);
    }
    for (let lvl = 0; lvl < floors; lvl++) {
      const y0 = ffl(lvl), y1 = ffl(lvl + 1);
      // openings that exist on this storey (doors only on the ground floor)
      const here = wallOps.filter(o => o.kind === 'window' || lvl === 0).map(o => {
        const zb = y0 + o.zb, zt = Math.min(zb + o.h, y1 - 0.1);
        return { ...o, zb, zt };
      }).filter(o => o.zt - o.zb > 0.2);
      const cuts = new Set<number>([-e0, L + e1]);
      here.forEach(o => { cuts.add(Math.max(-e0, o.s - o.w / 2)); cuts.add(Math.min(L + e1, o.s + o.w / 2)); });
      const xs = [...cuts].sort((a, b) => a - b);
      type Seg = { a: number; b: number; lo: number; hi: number };
      const segs: Seg[] = [];
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1];
        if (b - a < 1e-4) continue;
        const m = (a + b) / 2;
        const cov = here.filter(o => m > o.s - o.w / 2 && m < o.s + o.w / 2);
        const lo = cov.length ? Math.min(...cov.map(o => o.zb)) : y1, hi = cov.length ? Math.max(...cov.map(o => o.zt)) : y1;
        const prev = segs[segs.length - 1];
        if (prev && prev.lo === lo && prev.hi === hi && Math.abs(prev.b - a) < 1e-6) prev.b = b; else segs.push({ a, b, lo, hi });
      }
      const wb = new Buf();
      for (const sg of segs) {
        const len = sg.b - sg.a, cx = (sg.a + sg.b) / 2;
        if (sg.lo >= y1 - 1e-6) wb.box(at(cx, (y0 + y1) / 2), ex, Y, ez, len, y1 - y0, T);
        else {
          if (sg.lo - y0 > 1e-3) wb.box(at(cx, (y0 + sg.lo) / 2), ex, Y, ez, len, sg.lo - y0, T);
          if (y1 - sg.hi > 1e-3) wb.box(at(cx, (sg.hi + y1) / 2), ex, Y, ez, len, y1 - sg.hi, T);
        }
      }
      push('wall', `Wall ${wallNo} · L${lvl}`, lvl, 'wall', wb, seg.hostId);

      // door / window fittings
      for (const o of here) {
        const h = o.zt - o.zb, cy = (o.zb + o.zt) / 2;
        if (o.kind === 'window') {
          const fw = Math.min(0.06, o.w / 6, h / 6), depth = Math.min(T * 0.6, 0.2);
          const fr = new Buf();
          fr.box(at(o.s - o.w / 2 + fw / 2, cy), ex, Y, ez, fw, h, depth);
          fr.box(at(o.s + o.w / 2 - fw / 2, cy), ex, Y, ez, fw, h, depth);
          fr.box(at(o.s, o.zb + fw / 2), ex, Y, ez, o.w - 2 * fw, fw, depth);
          fr.box(at(o.s, o.zt - fw / 2), ex, Y, ez, o.w - 2 * fw, fw, depth);
          fr.box(at(o.s, o.zb - 0.02), ex, Y, ez, o.w + 0.1, 0.04, T + 0.08);     // projecting sill
          push('window', `Window ${o.tag} · L${lvl} frame`, lvl, 'frame', fr, o.el.id);
          const gl = new Buf();
          gl.box(at(o.s, cy), ex, Y, ez, o.w - 2 * fw, h - 2 * fw, 0.02);
          push('window', `Window ${o.tag} · L${lvl} glass`, lvl, 'glass', gl, o.el.id);
        } else {
          const fw = Math.min(0.07, o.w / 8), depth = Math.min(T * 0.8, 0.22);
          const fr = new Buf();
          fr.box(at(o.s - o.w / 2 + fw / 2, cy), ex, Y, ez, fw, h, depth);
          fr.box(at(o.s + o.w / 2 - fw / 2, cy), ex, Y, ez, fw, h, depth);
          fr.box(at(o.s, o.zt - fw / 2), ex, Y, ez, o.w - 2 * fw, fw, depth);
          push('door', `Door ${o.tag} frame`, lvl, 'frame', fr, o.el.id);
          const lf = new Buf();
          lf.box(at(o.s, cy - fw / 2), ex, Y, ez, o.w - 2 * fw, h - fw, 0.045);
          lf.box(at(o.s + (o.w / 2 - fw - 0.1), o.zb + 1.0), ex, Y, ez, 0.03, 0.12, 0.09);    // handle
          push('door', `Door ${o.tag}`, lvl, 'door', lf, o.el.id);
        }
      }
    }
  }

  // ---------- columns ----------
  for (const el of els) if (el.type === 'column') {
    const b = new Buf();
    b.box([el.x1 * k, yTop / 2, el.y1 * k], X, Y, Z, 0.3, yTop, 0.3);
    push('column', 'Column', 0, 'column', b, el.id);
  }

  // ---------- floor slabs ----------
  let rooms = 0, slabs = 0;
  if (walls.length) {
    const rt = roomTriangles(walls, tolUnits);
    rooms = rt.rooms;
    if (rt.rooms === 0) warnings.push('No enclosed rooms found – close the wall outline to get floor slabs.');
    else {
      const levels = Array.from({ length: floors + (S.roof.type === 'flat' ? 1 : 0) }, (_, i) => i);
      for (const lvl of levels) {
        const yTopSlab = ffl(lvl), yBot = yTopSlab - slabT;
        const b = new Buf();
        for (const [p, q, r] of rt.tris) {
          const A = (pt: { x: number; y: number }, y: number): V3 => [pt.x * k, y, pt.y * k];
          b.tri(A(p, yTopSlab), A(q, yTopSlab), A(r, yTopSlab), Y);
          b.tri(A(p, yBot), A(q, yBot), A(r, yBot), mul(Y, -1));
        }
        push('slab', lvl === floors ? 'Roof slab' : `Floor slab L${lvl}`, lvl === floors ? -1 : lvl, lvl === floors ? 'roof' : 'slab', b);
        slabs++;
      }
    }
  }

  // ---------- roof ----------
  if (walls.length) {
    const xsP = walls.flatMap(w => [w.x1, w.x2]).map(v => v * k), zsP = walls.flatMap(w => [w.y1, w.y2]).map(v => v * k);
    const x0 = Math.min(...xsP), x1 = Math.max(...xsP), z0 = Math.min(...zsP), z1 = Math.max(...zsP);
    const o = S.roof.overhangMm / 1000, tp = Math.tan((S.roof.pitch * Math.PI) / 180);
    const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const eaveY = yTop - tp * o;
    const rt = S.roof.type;
    // True hip roof for any simple outline: every roof plane has the same pitch, so hips and valleys follow the
    // 45-degree corner bisectors (straight skeleton, shared with the Elevation Studio). Falls back to a plain
    // rectangular hip when the outline is not one closed loop.
    let hipDone = false;
    if (rt === 'hip') {
      const mmWalls = walls.map(w => ({ a: { x: w.x1 * S.mmPerUnit, y: -w.y1 * S.mmPerUnit }, b: { x: w.x2 * S.mmPerUnit, y: -w.y2 * S.mmPerUnit } }));
      const hip = buildHipRoof(mmWalls, Math.max(250, S.wallThicknessMm), S.roof.overhangMm);
      if (hip) {
        const roofB = new Buf();
        const world = (p: { x: number; y: number }, y: number): V3 => [p.x / 1000, y, -p.y / 1000];
        const signed = (poly: { x: number; y: number }[]) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + (p.x * q.y - q.x * p.y); }, 0) / 2;
        const ccw = <T extends { x: number; y: number }>(poly: T[]) => (signed(poly) < 0 ? poly.slice().reverse() : poly);
        for (const f of hip.faces) {
          const d: V3 = [f.out.x, 0, -f.out.y], n = norm([d[0] * tp, 1, d[2] * tp]);
          for (const [a, b, c] of triangulate(ccw(f.pts))) {
            const h = (q: { x: number; y: number }) => eaveY + tp * ((q as unknown as { t: number }).t / 1000);   // triangulate keeps the original point objects, so t survives
            roofB.tri(world(a, h(a)), world(b, h(b)), world(c, h(c)), n);
          }
        }
        for (const [a, b, c] of triangulate(ccw(hip.outline))) roofB.tri(world(a, eaveY), world(b, eaveY), world(c, eaveY), mul(Y, -1));
        push('roof', 'Hip roof', -1, 'roof', roofB);
        hipDone = true;
      } else warnings.push('Hip roof: the outer walls do not form one closed loop, so a simple rectangular hip is shown.');
    }
    if (hipDone) { /* built above */ } else if (rt === 'gable' || rt === 'hip') {
      const ridgeX = S.roof.ridge === 'auto' ? W >= D : S.roof.ridge === 'x';
      // work in (along, across) coordinates then map back to world
      const along = ridgeX ? W : D, across = ridgeX ? D : W;
      const apexY = yTop + tp * (across / 2);
      const P = (a: number, c: number, y: number): V3 => (ridgeX ? [cx + a, y, cz + c] : [cx + c, y, cz + a]);
      const ea = along / 2 + o, ec = across / 2 + o;
      const roofB = new Buf(), infill = new Buf();
      if (rt === 'gable') {
        const ridgeA = ea;
        roofB.quad(P(-ea, -ec, eaveY), P(ea, -ec, eaveY), P(ridgeA, 0, apexY), P(-ridgeA, 0, apexY), Y);
        roofB.quad(P(ea, ec, eaveY), P(-ea, ec, eaveY), P(-ridgeA, 0, apexY), P(ridgeA, 0, apexY), Y);
        const aDir = sub(P(1, 0, 0), P(0, 0, 0));           // direction of the ridge in world space
        infill.tri(P(-ea, -ec, eaveY), P(-ea, ec, eaveY), P(-ridgeA, 0, apexY), mul(aDir, -1));
        infill.tri(P(ea, -ec, eaveY), P(ea, ec, eaveY), P(ridgeA, 0, apexY), aDir);
      } else {
        const half = Math.max(0, (along - across) / 2);
        if (half < 1e-3) {
          const ap = P(0, 0, apexY);
          roofB.tri(P(-ea, -ec, eaveY), P(ea, -ec, eaveY), ap, Y); roofB.tri(P(ea, -ec, eaveY), P(ea, ec, eaveY), ap, Y);
          roofB.tri(P(ea, ec, eaveY), P(-ea, ec, eaveY), ap, Y); roofB.tri(P(-ea, ec, eaveY), P(-ea, -ec, eaveY), ap, Y);
        } else {
          roofB.quad(P(-ea, -ec, eaveY), P(ea, -ec, eaveY), P(half, 0, apexY), P(-half, 0, apexY), Y);
          roofB.quad(P(ea, ec, eaveY), P(-ea, ec, eaveY), P(-half, 0, apexY), P(half, 0, apexY), Y);
          roofB.tri(P(-ea, ec, eaveY), P(-ea, -ec, eaveY), P(-half, 0, apexY), Y);
          roofB.tri(P(ea, -ec, eaveY), P(ea, ec, eaveY), P(half, 0, apexY), Y);
        }
      }
      // soffit (closes the underside)
      roofB.quad(P(-ea, -ec, eaveY), P(-ea, ec, eaveY), P(ea, ec, eaveY), P(ea, -ec, eaveY), mul(Y, -1));
      push('roof', rt === 'gable' ? 'Gable roof' : 'Hip roof', -1, 'roof', roofB);
      if (!infill.empty) push('roof', 'Gable ends', -1, 'wall', infill);
    } else if (rt === 'flat') {
      const b = new Buf(), ov = Math.min(o, 0.3), th = 0.2, par = 0.45, pt = 0.12;
      const sx = W + 2 * ov, sz = D + 2 * ov;
      b.box([cx, yTop + th / 2, cz], X, Y, Z, sx, th, sz);
      push('roof', 'Flat roof slab', -1, 'roof', b);
      const pb = new Buf(), py = yTop + th + par / 2;
      pb.box([cx, py, z0 - ov + pt / 2], X, Y, Z, sx, par, pt); pb.box([cx, py, z1 + ov - pt / 2], X, Y, Z, sx, par, pt);
      pb.box([x0 - ov + pt / 2, py, cz], X, Y, Z, pt, par, sz - 2 * pt); pb.box([x1 + ov - pt / 2, py, cz], X, Y, Z, pt, par, sz - 2 * pt);
      push('roof', 'Parapet', -1, 'slab', pb);
    } else {
      // mono-pitch: slope rises towards `shedHigh` (north = plan top = -Z)
      const hz = S.roof.shedHigh === 'north' || S.roof.shedHigh === 'south';
      const sign = S.roof.shedHigh === 'south' || S.roof.shedHigh === 'east' ? 1 : -1;
      const span = hz ? D : W, ea = (hz ? W : D) / 2 + o, ec = span / 2 + o;
      const lowY = yTop - tp * o, highY = yTop + tp * (span + o);
      // c runs from the low edge (-ec) to the high edge (+ec); `a` runs along the slope contour
      const P = (a: number, c: number, y: number): V3 => (hz ? [cx + a, y, cz + sign * c] : [cx + sign * c, y, cz + a]);
      const roofB = new Buf(), infill = new Buf();
      roofB.quad(P(-ea, -ec, lowY), P(ea, -ec, lowY), P(ea, ec, highY), P(-ea, ec, highY), Y);
      roofB.quad(P(-ea, -ec, lowY), P(-ea, ec, lowY), P(ea, ec, lowY), P(ea, -ec, lowY), mul(Y, -1));
      const highFace: V3 = hz ? [0, 0, sign] : [sign, 0, 0];
      infill.quad(P(-ea, ec, lowY), P(-ea, ec, highY), P(ea, ec, highY), P(ea, ec, lowY), highFace);
      infill.tri(P(-ea, -ec, lowY), P(-ea, ec, highY), P(-ea, ec, lowY), hz ? [-1, 0, 0] : [0, 0, -1]);
      infill.tri(P(ea, -ec, lowY), P(ea, ec, lowY), P(ea, ec, highY), hz ? [1, 0, 0] : [0, 0, 1]);
      push('roof', 'Mono-pitch roof', -1, 'roof', roofB);
      push('roof', 'Roof infill', -1, 'wall', infill);
    }
  }

  // ---------- ground ----------
  let min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.positions[i + a]); max[a] = Math.max(max[a], p.positions[i + a]); }
  if (!isFinite(min[0])) { min = [0, 0, 0]; max = [1, 1, 1]; }
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const ext = Math.max(max[0] - min[0], max[2] - min[2], 6) * 1.8;
  const g = new Buf();
  g.quad([center[0] - ext, -0.01, center[2] - ext], [center[0] - ext, -0.01, center[2] + ext], [center[0] + ext, -0.01, center[2] + ext], [center[0] + ext, -0.01, center[2] - ext], Y);
  push('ground', 'Ground', -1, 'ground', g);

  if (unhosted) warnings.push(`${unhosted} door/window${unhosted === 1 ? ' is' : 's are'} not on a wall and ${unhosted === 1 ? 'was' : 'were'} skipped.`);
  if (!walls.length) warnings.push('Draw walls (or a rectangle) in the plan to build the model.');
  const real = parts.filter(p => p.kind !== 'ground');
  return {
    parts, min, max, center,
    stats: {
      tris: real.reduce((s, p) => s + p.indices.length / 3, 0), walls: walls.length, doors: nd, windows: nw, slabs, unhosted, warnings,
    },
  };
}
