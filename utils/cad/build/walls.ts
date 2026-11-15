// utils/cad/build/walls.ts — wall solids with true openings.
//
// Every wall is trimmed against the walls before it so footprints tile without overlapping (clean corners and
// T-junctions). Each storey is cut into horizontal bands wherever an opening starts or ends; a band's footprint
// is the wall footprint minus the openings active in it, extruded between the band's levels. Jambs, heads and
// sills therefore come out as real faces, exactly like a boolean-cut solid.
import { MeshBuilder, GROUND, cap, sides } from '../mesh';
import { diff, rectFrom, union } from '../poly';
import { CadDoc, MultiPoly, OpeningObj, Poly, Solid, V2, WallObj } from '../types';

export interface WallGeom {
  obj: WallObj; a: V2; b: V2; d: V2; n: V2; len: number; T: number; foot: MultiPoly; rect: Poly;
}

export const levelY = (doc: CadDoc, lvl: number) => doc.settings.plinth + lvl * doc.settings.storeyHeight;

export function wallGeoms(walls: WallObj[]): WallGeom[] {
  const maxT = Math.max(0.1, ...walls.map(w => w.thickness));
  const tol = Math.max(maxT, 0.15);
  const near = (p: V2, q: V2) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const out: WallGeom[] = [];
  walls.forEach((w, i) => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (len < 1e-6) return;
    const d: V2 = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
    const n: V2 = [-d[1], d[0]];
    const others = walls.filter((_, j) => j !== i);
    const e0 = others.some(o => near(o.a, w.a) || near(o.b, w.a)) ? w.thickness / 2 : 0;
    const e1 = others.some(o => near(o.a, w.b) || near(o.b, w.b)) ? w.thickness / 2 : 0;
    const rect = rectFrom(w.a, w.b, w.thickness / 2, e0, e1);
    out.push({ obj: w, a: w.a, b: w.b, d, n, len, T: w.thickness, rect, foot: [rect] });
  });
  // trim against earlier walls so the footprints never overlap
  for (let i = 1; i < out.length; i++) {
    const earlier = out.slice(0, i).map(g => [g.rect] as MultiPoly);
    out[i].foot = diff([out[i].rect], ...earlier);
  }
  return out;
}

/** plan-view rectangle of an opening through its host wall (a little deeper than the wall on both faces) */
export function openingRect(g: WallGeom, o: OpeningObj): Poly {
  const s0 = o.offset - o.width / 2, s1 = o.offset + o.width / 2;
  const a: V2 = [g.a[0] + g.d[0] * s0, g.a[1] + g.d[1] * s0], b: V2 = [g.a[0] + g.d[0] * s1, g.a[1] + g.d[1] * s1];
  return rectFrom(a, b, g.T / 2 + 0.05);
}

export interface PlacedOpening { obj: OpeningObj; level: number; zb: number; zt: number; rect: Poly; geom: WallGeom }

/** openings of one wall resolved to absolute heights on a storey */
export function openingsOnLevel(doc: CadDoc, g: WallGeom, ops: OpeningObj[], lvl: number): PlacedOpening[] {
  const S = doc.settings;
  const y0 = levelY(doc, lvl), y1 = levelY(doc, lvl + 1);
  return ops.filter(o => o.level === 'all' || o.level === lvl).map(o => {
    const zb = y0 + (o.kind === 'door' ? 0 : o.sill);
    const zt = Math.min(zb + o.height, y1 - 0.1);
    return { obj: o, level: lvl, zb, zt, rect: openingRect(g, o), geom: g };
  }).filter(p => p.zt - p.zb > 0.2 && S.storeys > lvl);
}

interface Band { poly: MultiPoly; y0: number; y1: number }

/** extrude stacked bands as one closed solid; cap area shared with a neighbouring band is not emitted */
function stack(b: MeshBuilder, bands: Band[]) {
  bands.forEach((band, i) => {
    band.poly.forEach(p => sides(b, p, GROUND, band.y0, band.y1));
    const above = bands[i + 1], below = bands[i - 1];
    const top = above ? diff(band.poly, above.poly) : band.poly;
    const bottom = below ? diff(band.poly, below.poly) : band.poly;
    top.forEach(p => cap(b, p, GROUND, band.y1, 1));
    bottom.forEach(p => cap(b, p, GROUND, band.y0, -1));
  });
}

export function buildWalls(doc: CadDoc, geoms: WallGeom[], opsByHost: Map<string, OpeningObj[]>, push: (s: Omit<Solid, 'id'>) => void) {
  const S = doc.settings;
  const flat = S.roof.type === 'flat';
  geoms.forEach(g => {
    const ops = opsByHost.get(g.obj.id) ?? [];
    for (let lvl = 0; lvl < S.storeys; lvl++) {
      const placed = openingsOnLevel(doc, g, ops, lvl);
      const yBase = lvl === 0 ? S.plinth : levelY(doc, lvl);
      const yTop = levelY(doc, lvl + 1) + (flat && lvl === S.storeys - 1 ? S.roof.parapet : 0);

      // plinth (ground level only): never cut by openings
      if (lvl === 0 && S.plinth > 0.01) {
        const b = new MeshBuilder();
        // each storey solid is closed on its own, so the plinth gets its own top cap
        g.foot.forEach(p => { sides(b, p, GROUND, 0, S.plinth); cap(b, p, GROUND, 0, -1); cap(b, p, GROUND, S.plinth, 1); });
        if (!b.empty) push({ objectId: g.obj.id, name: `${g.obj.name} · plinth`, kind: 'wall', layer: g.obj.layer, material: 'plinth', level: 0, positions: b.positions, normals: b.normals, indices: b.indices });
      }

      const cuts = new Set<number>([yBase, yTop]);
      placed.forEach(p => { if (p.zb > yBase + 1e-4 && p.zb < yTop - 1e-4) cuts.add(p.zb); if (p.zt > yBase + 1e-4 && p.zt < yTop - 1e-4) cuts.add(p.zt); });
      const ys = [...cuts].sort((x, y) => x - y);
      const bands: Band[] = [];
      let lastKey = '';
      for (let i = 0; i < ys.length - 1; i++) {
        const za = ys[i], zb = ys[i + 1];
        if (zb - za < 1e-4) continue;
        const active = placed.filter(p => p.zb <= za + 1e-6 && p.zt >= zb - 1e-6);
        const key = active.map(p => p.obj.id).sort().join('|');
        if (bands.length && key === lastKey) { bands[bands.length - 1].y1 = zb; continue; }
        bands.push({ poly: active.length ? diff(g.foot, ...active.map(p => [p.rect] as MultiPoly)) : g.foot, y0: za, y1: zb });
        lastKey = key;
      }
      const b = new MeshBuilder();
      stack(b, bands);
      if (!b.empty) push({ objectId: g.obj.id, name: `${g.obj.name} · L${lvl}`, kind: 'wall', layer: g.obj.layer, material: 'wall', level: lvl, positions: b.positions, normals: b.normals, indices: b.indices });
    }
  });
}

/** union of the untrimmed wall rectangles: outer boundary + the enclosed rooms as holes */
export function footprintUnion(geoms: WallGeom[]): MultiPoly {
  return union(...geoms.map(g => [g.rect] as MultiPoly));
}
