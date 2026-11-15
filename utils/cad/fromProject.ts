// utils/cad/fromProject.ts — the 2D plan (+ the 3D page's own edits) becomes a CadDoc.
import { ProjectState } from '../../types';
import { expandWalls, hostWall } from './plan2d';
import {
  CadDoc, CadObj, CadSettings, DEFAULT_LAYERS, DEFAULT_SETTINGS, EMPTY_CAD3D, Layer, OpeningObj, WallObj,
} from './types';

export function settingsFromProject(p: ProjectState): CadSettings {
  const st = p.cad3d ?? EMPTY_CAD3D;
  const r = p.specs.roof;
  return {
    ...DEFAULT_SETTINGS, ...st.settings,
    storeys: Math.max(1, Math.round(p.specs.floors)),
    storeyHeight: p.specs.floorHeight / 1000,
    plinth: p.specs.plinthHeight / 1000,
    wallThickness: p.settings.wallWidth / 1000,
    roof: { ...DEFAULT_SETTINGS.roof, ...(st.settings.roof ?? {}), type: r.type, pitch: r.pitch, overhang: r.overhang / 1000 },
  };
}

export function layersFromProject(p: ProjectState, objects: CadObj[]): Layer[] {
  const st = p.cad3d ?? EMPTY_CAD3D;
  const names = new Set(DEFAULT_LAYERS.map(l => l.name));
  const out = DEFAULT_LAYERS.map(l => ({ ...l, ...(st.layers[l.name] ?? {}) }));
  objects.forEach(o => { if (!names.has(o.layer)) { names.add(o.layer); out.push({ name: o.layer, color: '#ffffff', visible: true, locked: false, ...(st.layers[o.layer] ?? {}) }); } });
  return out;
}

export function docFromProject(p: ProjectState): CadDoc {
  const st = p.cad3d ?? EMPTY_CAD3D;
  const S = settingsFromProject(p);
  const k = (p.settings.mmPerUnit ?? 1) / 1000;               // drawing unit -> metres
  const segs = expandWalls(p.elements as any);
  const objects: CadObj[] = [];
  const ov = (id: string) => st.overrides[id] ?? {};

  segs.forEach((s, i) => {
    const o = ov(s.key);
    const w: WallObj = {
      id: s.key, kind: 'wall', name: `Wall ${i + 1}`, source: 'plan', layer: o.layer ?? 'A-WALL', hidden: o.hidden,
      a: [s.x1 * k, s.y1 * k], b: [s.x2 * k, s.y2 * k], thickness: o.thickness ?? S.wallThickness,
    };
    objects.push(w);
  });

  const tolUnits = Math.max(S.wallThickness * 750 + 0.15, 0.35) / k;
  let nd = 0, nw = 0;
  for (const el of p.elements) {
    const t = el.type as string;
    if (t === 'door' || t === 'window') {
      const mid = { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
      const host = hostWall(mid, segs, tolUnits) ?? hostWall({ x: el.x1, y: el.y1 }, segs, tolUnits);
      if (!host) continue;
      const L = Math.hypot(host.w.x2 - host.w.x1, host.w.y2 - host.w.y1) * k;
      let width = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * k;
      if (width < 0.3) width = t === 'door' ? 0.9 : 1.2;
      width = Math.min(width, Math.max(0.3, L - 0.2));
      const o = ov(el.id);
      const op: OpeningObj = {
        id: el.id, kind: t, name: t === 'door' ? `Door D${++nd}` : `Window W${++nw}`, source: 'plan', hidden: o.hidden,
        layer: o.layer ?? (t === 'door' ? 'A-DOOR' : 'A-GLAZ'), hostId: host.w.key,
        offset: host.t * L, width,
        height: (el.height ?? (t === 'door' ? S.doorHeight : S.windowHeight) * 1000) / 1000,
        sill: t === 'door' ? 0 : (el.sill ?? S.windowSill * 1000) / 1000,
        level: t === 'door' ? 0 : 'all', hinge: 'left',
      };
      objects.push(op);
    } else if (t === 'column') {
      const o = ov(el.id);
      objects.push({ id: el.id, kind: 'column', name: 'Column', source: 'plan', layer: o.layer ?? 'S-COLS', hidden: o.hidden, at: [el.x1 * k, el.y1 * k], w: 0.3, d: 0.3, round: false, base: 0, height: 0 });
    }
  }
  objects.push(...st.customs);
  return { settings: S, objects, layers: layersFromProject(p, objects) };
}
