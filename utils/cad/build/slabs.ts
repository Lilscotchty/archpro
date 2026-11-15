// utils/cad/build/slabs.ts — floor / roof slabs (one per enclosed room) found from the wall footprint union.
import { MeshBuilder, GROUND, extrude } from '../mesh';
import { CadDoc, MultiPoly, Solid } from '../types';
import { levelY } from './walls';

/** rooms = the holes of the wall-footprint union (each becomes a slab polygon) */
export function roomsOf(union: MultiPoly): MultiPoly {
  const rooms: MultiPoly = [];
  union.forEach(p => p.slice(1).forEach(hole => rooms.push([hole])));
  return rooms;
}

export function buildSlabs(doc: CadDoc, rooms: MultiPoly, push: (s: Omit<Solid, 'id'>) => void) {
  const S = doc.settings;
  const levels = S.storeys + (S.roof.type === 'flat' ? 1 : 0);
  for (let lvl = 0; lvl < levels; lvl++) {
    const top = levelY(doc, lvl);
    const bottom = lvl === 0 ? 0 : top - S.slab;                 // the ground slab is solid down to the ground
    const roof = lvl === S.storeys;
    rooms.forEach((room, i) => {
      const b = new MeshBuilder();
      extrude(b, room[0] ? room : room, GROUND, bottom, top);
      push({ objectId: null, name: roof ? `Roof slab ${i + 1}` : `Floor slab L${lvl} · room ${i + 1}`, kind: roof ? 'roof' : 'slab', layer: roof ? 'A-ROOF' : 'A-FLOR', material: roof ? 'roof' : 'slab', level: roof ? -1 : lvl, positions: b.positions, normals: b.normals, indices: b.indices });
    });
  }
}
