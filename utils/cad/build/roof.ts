// utils/cad/build/roof.ts — pitched roofs (gable, hip, mono-pitch) as thin shells with fascia, plus gable infill.
// They are built over the bounding rectangle of the walls; flat roofs are slab + parapet (see walls.ts / slabs.ts).
import { Frame, MeshBuilder, V3, X, Y, Z, extrude } from '../mesh';
import { CadDoc, Solid } from '../types';
import { levelY } from './walls';

export interface Bounds2 { x0: number; x1: number; z0: number; z1: number }
const DEG = Math.PI / 180;

export function buildRoof(doc: CadDoc, bb: Bounds2, push: (s: Omit<Solid, 'id'>) => void) {
  const S = doc.settings, R = S.roof;
  if (R.type === 'flat') return;
  const yTop = levelY(doc, S.storeys);
  const W = bb.x1 - bb.x0, D = bb.z1 - bb.z0, cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
  const o = R.overhang, tp = Math.tan(R.pitch * DEG), tv = R.thickness / Math.cos(R.pitch * DEG);
  const eaveTop = yTop - tp * o;
  const emit = (b: MeshBuilder, name: string, material: Solid['material'], layer = 'A-ROOF', kind: Solid['kind'] = 'roof') =>
    !b.empty && push({ objectId: null, name, kind, layer, material, level: -1, positions: b.positions, normals: b.normals, indices: b.indices });

  if (R.type === 'gable') {
    const ridgeX = R.ridge === 'auto' ? W >= D : R.ridge === 'x';
    const along = ridgeX ? W : D, across = ridgeX ? D : W;
    const ec = across / 2 + o, ea = along / 2 + o;
    const apexTop = yTop + tp * (across / 2);
    const f: Frame = ridgeX ? { O: [cx, 0, cz], U: Z, V: Y, W: X } : { O: [cx, 0, cz], U: X, V: Y, W: Z };
    const shell = new MeshBuilder();
    extrude(shell, [[[-ec, eaveTop], [0, apexTop], [ec, eaveTop], [ec, eaveTop - tv], [0, apexTop - tv], [-ec, eaveTop - tv]]], f, -ea, ea);
    emit(shell, 'Gable roof', 'roof');
    // gable-end walls (infill triangles) at both ends, one wall thickness deep
    const apexIn = Math.max(yTop + 0.02, apexTop - tv), T = S.wallThickness;
    const inf = new MeshBuilder();
    for (const sgn of [-1, 1]) {
      const w0 = sgn < 0 ? -along / 2 : along / 2 - T, w1 = sgn < 0 ? -along / 2 + T : along / 2;
      extrude(inf, [[[-across / 2, yTop], [across / 2, yTop], [0, apexIn]]], f, w0, w1);
    }
    emit(inf, 'Gable ends', 'wall', 'A-WALL', 'wall');
    return;
  }

  if (R.type === 'hip') {
    const ridgeX = R.ridge === 'auto' ? W >= D : R.ridge === 'x';
    const along = ridgeX ? W : D, across = ridgeX ? D : W;
    const ec = across / 2 + o, ea = along / 2 + o, half = Math.max(0, (along - across) / 2);
    const apexTop = yTop + tp * (across / 2);
    const P = (a: number, c: number, y: number): V3 => (ridgeX ? [cx + a, y, cz + c] : [cx + c, y, cz + a]);
    type Face = V3[];
    const faces: Face[] = half < 1e-3
      ? [[P(-ea, -ec, eaveTop), P(ea, -ec, eaveTop), P(0, 0, apexTop)], [P(ea, -ec, eaveTop), P(ea, ec, eaveTop), P(0, 0, apexTop)],
         [P(ea, ec, eaveTop), P(-ea, ec, eaveTop), P(0, 0, apexTop)], [P(-ea, ec, eaveTop), P(-ea, -ec, eaveTop), P(0, 0, apexTop)]]
      : [[P(-ea, -ec, eaveTop), P(ea, -ec, eaveTop), P(half, 0, apexTop), P(-half, 0, apexTop)],
         [P(ea, ec, eaveTop), P(-ea, ec, eaveTop), P(-half, 0, apexTop), P(half, 0, apexTop)],
         [P(-ea, ec, eaveTop), P(-ea, -ec, eaveTop), P(-half, 0, apexTop)],
         [P(ea, -ec, eaveTop), P(ea, ec, eaveTop), P(half, 0, apexTop)]];
    const b = new MeshBuilder();
    const up: V3 = [0, 1, 0], dn: V3 = [0, -1, 0];
    const lower = (v: V3): V3 => [v[0], v[1] - tv, v[2]];
    for (const fc of faces) {
      if (fc.length === 3) { b.tri(fc[0], fc[1], fc[2], up); b.tri(lower(fc[0]), lower(fc[1]), lower(fc[2]), dn); }
      else { b.quad(fc[0], fc[1], fc[2], fc[3], up); b.quad(lower(fc[0]), lower(fc[1]), lower(fc[2]), lower(fc[3]), dn); }
    }
    const corners = [P(-ea, -ec, eaveTop), P(ea, -ec, eaveTop), P(ea, ec, eaveTop), P(-ea, ec, eaveTop)];
    corners.forEach((c, i) => {
      const n = corners[(i + 1) % 4];
      const out: V3 = [(c[0] + n[0]) / 2 - cx, 0, (c[2] + n[2]) / 2 - cz];
      b.quad(c, n, lower(n), lower(c), out);
    });
    emit(b, 'Hip roof', 'roof');
    return;
  }

  // mono-pitch (shed): slope rises towards shedHigh
  const hz = R.shedHigh === 'north' || R.shedHigh === 'south';
  const sign = R.shedHigh === 'south' || R.shedHigh === 'east' ? 1 : -1;
  const across = hz ? D : W, along = hz ? W : D;
  const ec = across / 2 + o, ea = along / 2 + o;
  const yL = yTop - tp * o, yH = yTop + tp * (across + o);
  const P = (a: number, c: number, y: number): V3 => (hz ? [cx + a, y, cz + sign * c] : [cx + sign * c, y, cz + a]);
  const lower = (v: V3): V3 => [v[0], v[1] - tv, v[2]];
  const b = new MeshBuilder();
  const tl = P(-ea, -ec, yL), tr = P(ea, -ec, yL), hr = P(ea, ec, yH), hl = P(-ea, ec, yH);
  b.quad(tl, tr, hr, hl, [0, 1, 0]); b.quad(lower(tl), lower(tr), lower(hr), lower(hl), [0, -1, 0]);
  const ring = [tl, tr, hr, hl];
  ring.forEach((c, i) => {
    const n = ring[(i + 1) % 4];
    const out: V3 = [(c[0] + n[0]) / 2 - cx, 0, (c[2] + n[2]) / 2 - cz];
    b.quad(c, n, lower(n), lower(c), [out[0], 0, out[2]]);
  });
  emit(b, 'Mono-pitch roof', 'roof');
  // infill: two side triangles + the raised high wall
  const T = S.wallThickness, yb = yTop + tp * across - tv;
  const f: Frame = hz ? { O: [cx, 0, cz], U: [0, 0, sign], V: Y, W: X } : { O: [cx, 0, cz], U: [sign, 0, 0], V: Y, W: Z };
  const inf = new MeshBuilder();
  for (const sgn of [-1, 1]) {
    const w0 = sgn < 0 ? -along / 2 : along / 2 - T, w1 = sgn < 0 ? -along / 2 + T : along / 2;
    extrude(inf, [[[-across / 2, yTop], [across / 2, yTop], [across / 2, Math.max(yTop + 0.02, yb)]]], f, w0, w1);
  }
  if (along - 2 * T > 0.1) extrude(inf, [[[across / 2 - T, yTop], [across / 2, yTop], [across / 2, Math.max(yTop + 0.02, yb)], [across / 2 - T, Math.max(yTop + 0.02, yb - tp * T)]]], f, -along / 2 + T, along / 2 - T);
  emit(inf, 'Roof infill', 'wall', 'A-WALL', 'wall');
}
