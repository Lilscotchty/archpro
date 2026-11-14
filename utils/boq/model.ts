// utils/boq/model.ts — turn the Drafting Studio plan into take-off rows (walls, openings, columns, footprint).
// Plan coordinates are millimetres, so lengths are used directly.

import { ProjectState } from '../../types';
import { Assumptions, BoqModel, ColumnRow, OpeningRow, WallRow } from './types';

type El = { id: string; type: string; x1: number; y1: number; x2: number; y2: number };
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);

function segDist(px: number, py: number, w: El) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / l2)) : 0;
  return dist(px, py, w.x1 + t * dx, w.y1 + t * dy);
}

/** Centre-line polygon area of the external walls (shoelace) if they close into one loop, else the bounding box. */
export function footprintOf(ext: El[]): { lengthM: number; widthM: number; areaM2: number } {
  if (ext.length === 0) return { lengthM: 0, widthM: 0, areaM2: 0 };
  const xs = ext.flatMap(w => [w.x1, w.x2]), ys = ext.flatMap(w => [w.y1, w.y2]);
  const L = (Math.max(...xs) - Math.min(...xs)) / 1000, B = (Math.max(...ys) - Math.min(...ys)) / 1000;
  const bbox = { lengthM: Math.max(L, B), widthM: Math.min(L, B), areaM2: L * B };
  const snap = 75, key = (x: number, y: number) => `${Math.round(x / snap)},${Math.round(y / snap)}`;
  const adj = new Map<string, { x: number; y: number; n: string[] }>();
  const touch = (x: number, y: number, other: string) => {
    const k = key(x, y), e = adj.get(k) ?? { x, y, n: [] }; e.n.push(other); adj.set(k, e);
  };
  ext.forEach(w => { touch(w.x1, w.y1, key(w.x2, w.y2)); touch(w.x2, w.y2, key(w.x1, w.y1)); });
  if ([...adj.values()].some(v => v.n.length !== 2)) return bbox;
  const start = [...adj.keys()][0]; const order: { x: number; y: number }[] = []; let prev = '', cur = start;
  for (let i = 0; i <= adj.size; i++) {
    const node = adj.get(cur)!; order.push({ x: node.x, y: node.y });
    const next = node.n.find(n => n !== prev) ?? node.n[0]; prev = cur; cur = next;
    if (cur === start) break;
  }
  if (order.length !== adj.size) return bbox;
  let s = 0; order.forEach((p, i) => { const q = order[(i + 1) % order.length]; s += p.x * q.y - q.x * p.y; });
  return { lengthM: bbox.lengthM, widthM: bbox.widthM, areaM2: Math.abs(s) / 2 / 1e6 };
}

export function modelFromProject(project: ProjectState, a: Assumptions): BoqModel {
  const els = project.elements as unknown as El[];
  const walls = els.filter(e => e.type === 'wall');
  const t = project.settings.wallWidth;
  const xs = walls.flatMap(w => [w.x1, w.x2]), ys = walls.flatMap(w => [w.y1, w.y2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const tol = Math.max(300, t * 1.5);
  const onSide = (w: El) => {
    const near = (v: number, s: number) => Math.abs(v - s) <= tol;
    return (near(w.x1, minX) && near(w.x2, minX)) || (near(w.x1, maxX) && near(w.x2, maxX))
        || (near(w.y1, minY) && near(w.y2, minY)) || (near(w.y1, maxY) && near(w.y2, maxY));
  };
  const isExt = new Map(walls.map(w => [w.id, walls.length > 0 && onSide(w)]));
  const wallRows: WallRow[] = walls.map((w, i) => ({
    id: w.id, label: `W${i + 1}`, lengthMm: Math.round(dist(w.x1, w.y1, w.x2, w.y2)), thicknessMm: isExt.get(w.id) ? t : Math.min(t, 150),
    external: !!isExt.get(w.id), source: 'plan',
  }));

  const nearestExternal = (x: number, y: number) => {
    let best: El | null = null, bd = Infinity;
    walls.forEach(w => { const d = segDist(x, y, w); if (d < bd) { bd = d; best = w; } });
    return best ? !!isExt.get((best as El).id) : true;
  };
  const groups = new Map<string, OpeningRow>();
  els.filter(e => e.type === 'door' || e.type === 'window').forEach(e => {
    const kind = e.type as 'door' | 'window';
    const raw = Math.abs(e.x2 - e.x1) || dist(e.x1, e.y1, e.x2, e.y2);
    const w = raw >= 300 ? Math.round(raw / 10) * 10 : kind === 'door' ? 900 : 1200;
    const h = kind === 'door' ? 2100 : 1200;
    const external = kind === 'window' ? true : nearestExternal(e.x1, e.y1);
    const k = `${kind}|${external}|${w}|${h}`;
    const g = groups.get(k);
    if (g) g.qty += 1;
    else groups.set(k, { id: uid(), kind, mark: '', description: kind === 'window' ? 'Aluminium sliding window, glazed' : external ? 'Panel door, hardwood frame' : 'Flush door, hardwood frame',
      widthMm: w, heightMm: h, qty: 1, external, source: 'plan' });
  });
  const counters = { door: 0, window: 0 };
  const openings = [...groups.values()]
    .sort((x, y) => (x.kind === y.kind ? y.widthMm - x.widthMm : x.kind === 'door' ? -1 : 1))
    .map(o => ({ ...o, mark: `${o.kind === 'door' ? 'D' : 'W'}${++counters[o.kind]}` }));

  const rects = els.filter(e => e.type === 'rect');
  const cg = new Map<string, ColumnRow>();
  rects.forEach(r => {
    const b = Math.round(Math.abs(r.x2 - r.x1)), d = Math.round(Math.abs(r.y2 - r.y1)), k = `${b}x${d}`;
    const g = cg.get(k); if (g) g.qty += 1; else cg.set(k, { id: uid(), label: `C${cg.size + 1}`, bMm: b, dMm: d, qty: 1, source: 'plan' });
  });

  const extWalls = walls.filter(w => isExt.get(w.id));
  const fp = footprintOf(extWalls);
  return { walls: wallRows, openings, columns: [...cg.values()], footprint: { ...fp, source: 'plan' } };
}

export const EMPTY_MODEL: BoqModel = { walls: [], openings: [], columns: [], footprint: { lengthM: 0, widthM: 0, areaM2: 0, source: 'manual' } };
