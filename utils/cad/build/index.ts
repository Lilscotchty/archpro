// utils/cad/build/index.ts — CadDoc -> CadModel (closed solids).
import { CadDoc, CadModel, OpeningObj, Solid, WallObj } from '../types';
import { buildFittings } from './fittings';
import { buildColumn, buildSolid, buildStair } from './misc';
import { buildRoof } from './roof';
import { buildSlabs, roomsOf } from './slabs';
import { buildWalls, footprintUnion, openingsOnLevel, wallGeoms } from './walls';

export function buildModel(doc: CadDoc): CadModel {
  const warnings: string[] = [];
  const solids: Solid[] = [];
  const counters: Record<string, number> = {};
  const push = (s: Omit<Solid, 'id'>) => {
    if (!s.indices.length) return;
    counters[s.kind] = (counters[s.kind] ?? 0) + 1;
    solids.push({ ...s, id: `${s.kind}-${counters[s.kind]}` });
  };

  const live = doc.objects.filter(o => !o.hidden);
  const walls = live.filter((o): o is WallObj => o.kind === 'wall');
  const openings = live.filter((o): o is OpeningObj => o.kind === 'door' || o.kind === 'window');
  const geoms = wallGeoms(walls);
  const byId = new Map(geoms.map(g => [g.obj.id, g]));
  const opsByHost = new Map<string, OpeningObj[]>();
  for (const o of openings) {
    if (!byId.has(o.hostId)) { warnings.push(`${o.name} has no wall to sit in and was skipped.`); continue; }
    const list = opsByHost.get(o.hostId) ?? []; list.push(o); opsByHost.set(o.hostId, list);
  }

  buildWalls(doc, geoms, opsByHost, push);
  for (const g of geoms) for (let lvl = 0; lvl < doc.settings.storeys; lvl++) buildFittings(openingsOnLevel(doc, g, opsByHost.get(g.obj.id) ?? [], lvl), push);

  let rooms = 0;
  if (geoms.length) {
    const u = footprintUnion(geoms);
    const roomPolys = roomsOf(u);
    rooms = roomPolys.length;
    if (!rooms) warnings.push('No enclosed rooms: close the wall outline to get floor slabs.');
    else buildSlabs(doc, roomPolys, push);
    const xs = u.flatMap(p => p[0].map(q => q[0])), zs = u.flatMap(p => p[0].map(q => q[1]));
    if (xs.length) {
      buildRoof(doc, { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }, push);
      if (doc.settings.roof.type !== 'flat' && u.length === 1 && u[0][0].length > 4) warnings.push('Pitched roofs are built over the bounding rectangle of the walls.');
    }
  } else warnings.push('Draw walls (or a rectangle) in the 2D plan to build the model.');

  for (const o of live) {
    if (o.kind === 'column') buildColumn(doc, o, push);
    else if (o.kind === 'stair') buildStair(doc, o, push);
    else if (o.kind === 'solid') buildSolid(o, push);
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const s of solids) {
    tris += s.indices.length / 3;
    for (let i = 0; i < s.positions.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], s.positions[i + a]); max[a] = Math.max(max[a], s.positions[i + a]); }
  }
  if (!isFinite(min[0])) { min.fill(0); max.fill(1); }
  return {
    solids, min, max,
    stats: { triangles: tris, walls: geoms.length, doors: openings.filter(o => o.kind === 'door').length, windows: openings.filter(o => o.kind === 'window').length, rooms, warnings },
  };
}
