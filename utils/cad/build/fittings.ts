// utils/cad/build/fittings.ts — window and door fittings (frames, glazing, leaf, sill) placed in the wall openings.
import { MeshBuilder, V3, Y, v3 } from '../mesh';
import { PlacedOpening } from './walls';
import { Solid } from '../types';

export function buildFittings(placed: PlacedOpening[], push: (s: Omit<Solid, 'id'>) => void) {
  for (const p of placed) {
    const g = p.geom, o = p.obj;
    const ex: V3 = [g.d[0], 0, g.d[1]], ez: V3 = [g.n[0], 0, g.n[1]];
    const at = (s: number, y: number, t = 0): V3 => v3.add(v3.add([g.a[0], 0, g.a[1]], v3.mul(ex, s)), v3.add(v3.mul(Y, y), v3.mul(ez, t)));
    const w = o.width, h = p.zt - p.zb, cy = (p.zb + p.zt) / 2, s = o.offset;
    const out = (b: MeshBuilder, name: string, material: Solid['material']) =>
      !b.empty && push({ objectId: o.id, name: `${o.name} · ${name}`, kind: o.kind, layer: o.layer, material, level: p.level, positions: b.positions, normals: b.normals, indices: b.indices });
    const box = (b: MeshBuilder, c: V3, sx: number, sy: number, sz: number) => b.box(c, ex, Y, ez, sx, sy, sz);

    if (o.kind === 'window') {
      const fw = Math.min(0.06, w / 6, h / 6), depth = Math.min(g.T * 0.55, 0.14);
      const fr = new MeshBuilder();
      box(fr, at(s - w / 2 + fw / 2, cy), fw, h, depth);
      box(fr, at(s + w / 2 - fw / 2, cy), fw, h, depth);
      box(fr, at(s, p.zb + fw / 2), w - 2 * fw, fw, depth);
      box(fr, at(s, p.zt - fw / 2), w - 2 * fw, fw, depth);
      const panes = w >= 1.45 ? 2 : 1;
      if (panes === 2) box(fr, at(s, cy), 0.05, h - 2 * fw, depth);                       // mullion
      if (h >= 1.5) box(fr, at(s, cy + h * 0.18), w - 2 * fw, 0.035, depth * 0.8);         // transom
      box(fr, at(s, p.zb - 0.025, 0), w + 0.1, 0.05, g.T + 0.08);                         // projecting sill
      out(fr, 'frame', 'frame');
      const gl = new MeshBuilder();
      box(gl, at(s, cy), w - 2 * fw, h - 2 * fw, 0.012);
      out(gl, 'glass', 'glass');
    } else {
      const fw = Math.min(0.07, w / 8), depth = Math.min(g.T * 0.8, 0.2);
      const fr = new MeshBuilder();
      box(fr, at(s - w / 2 + fw / 2, cy), fw, h, depth);
      box(fr, at(s + w / 2 - fw / 2, cy), fw, h, depth);
      box(fr, at(s, p.zt - fw / 2), w - 2 * fw, fw, depth);
      box(fr, at(s, p.zb + 0.01), w, 0.02, g.T);                                          // threshold
      out(fr, 'frame', 'frame');
      const lf = new MeshBuilder();
      const lw = w - 2 * fw, lh = h - fw - 0.02, t = 0.045, ly = p.zb + 0.02 + lh / 2;
      box(lf, at(s, ly), lw, lh, t);                                                      // leaf
      const hx = o.hinge === 'left' ? s + lw / 2 - 0.1 : s - lw / 2 + 0.1;               // lever handle on the free edge
      box(lf, at(hx, p.zb + 1.0, t / 2 + 0.03), 0.12, 0.025, 0.05);
      box(lf, at(hx, p.zb + 1.0, -t / 2 - 0.03), 0.12, 0.025, 0.05);
      // raised panel mouldings (4-panel door)
      const pw = (lw - 0.3) / 2, ph1 = lh * 0.3, ph2 = lh * 0.36;
      for (const sx of [-1, 1]) {
        box(lf, at(s + sx * (pw / 2 + 0.05), p.zb + 0.02 + 0.15 + ph1 / 2, t / 2 + 0.006), pw, ph1, 0.012);
        box(lf, at(s + sx * (pw / 2 + 0.05), p.zb + 0.02 + lh - 0.15 - ph2 / 2, t / 2 + 0.006), pw, ph2, 0.012);
      }
      out(lf, 'leaf', 'door');
    }
  }
}
