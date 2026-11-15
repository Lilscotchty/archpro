// utils/cad/build/misc.ts — columns, stairs and free extruded solids.
import { Frame, MeshBuilder, Y, extrude } from '../mesh';
import { CadDoc, ColumnObj, SolidObj, Solid, StairObj, V2 } from '../types';
import { levelY } from './walls';

type Push = (s: Omit<Solid, 'id'>) => void;
const pack = (b: MeshBuilder) => ({ positions: b.positions, normals: b.normals, indices: b.indices });

export function circleRing(c: V2, r: number, n = 28): V2[] {
  return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * Math.PI * 2), c[1] + r * Math.sin((i / n) * Math.PI * 2)] as V2);
}

export function buildColumn(doc: CadDoc, c: ColumnObj, push: Push) {
  const H = c.height > 0 ? c.height : levelY(doc, doc.settings.storeys);
  const ring: V2[] = c.round ? circleRing(c.at, Math.min(c.w, c.d) / 2)
    : [[c.at[0] - c.w / 2, c.at[1] - c.d / 2], [c.at[0] + c.w / 2, c.at[1] - c.d / 2], [c.at[0] + c.w / 2, c.at[1] + c.d / 2], [c.at[0] - c.w / 2, c.at[1] + c.d / 2]];
  const b = new MeshBuilder();
  extrude(b, [ring], { O: [0, 0, 0], U: [1, 0, 0], V: [0, 0, 1], W: Y }, c.base, c.base + H);
  push({ objectId: c.id, name: c.name, kind: 'column', layer: c.layer, material: 'column', level: 0, ...pack(b) });
}

export function buildSolid(s: SolidObj, push: Push) {
  const b = new MeshBuilder();
  extrude(b, [s.ring], { O: [0, 0, 0], U: [1, 0, 0], V: [0, 0, 1], W: Y }, s.base, s.base + s.height);
  push({ objectId: s.id, name: s.name, kind: 'solid', layer: s.layer, material: s.material, level: 0, ...pack(b) });
}

/** straight flight: a sawtooth profile extruded across the width; climbs one storey */
export function stairGeometry(doc: CadDoc, st: StairObj) {
  const rise = doc.settings.storeyHeight;
  const n = Math.max(2, Math.round(rise / 0.17));
  const r = rise / n, t = 0.27;
  const pts: V2[] = [[0, 0]];
  for (let i = 0; i < n; i++) { pts.push([i * t, (i + 1) * r]); pts.push([(i + 1) * t, (i + 1) * r]); }
  pts.push([n * t, 0]);
  return { n, r, t, run: n * t, rise, ring: pts };
}

export function buildStair(doc: CadDoc, st: StairObj, push: Push) {
  const g = stairGeometry(doc, st);
  const dir: [number, number, number] = [Math.cos(st.angle), 0, Math.sin(st.angle)];
  const nrm: [number, number, number] = [-Math.sin(st.angle), 0, Math.cos(st.angle)];
  const f: Frame = { O: [st.start[0], levelY(doc, st.level), st.start[1]], U: dir, V: Y, W: nrm };
  const b = new MeshBuilder();
  extrude(b, [g.ring], f, -st.width / 2, st.width / 2);
  push({ objectId: st.id, name: `${st.name} (${g.n} risers)`, kind: 'stair', layer: st.layer, material: 'stair', level: st.level, ...pack(b) });
}
