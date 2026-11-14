import { buildModel } from '../utils/sim/build';
import { PlanEl } from '../utils/sim/types';
const rect: PlanEl[] = [{ id: 'r1', type: 'rect', x1: 1000, y1: 1000, x2: 9000, y2: 7000 }];
const els: PlanEl[] = [...rect,
  { id: 'd1', type: 'door', x1: 4550, y1: 7000, x2: 5450, y2: 7000 },
  { id: 'w1', type: 'window', x1: 1900, y1: 7000, x2: 3100, y2: 7000 },
  { id: 'w2', type: 'window', x1: 1000, y1: 3400, x2: 1000, y2: 4600 },
  { id: 'wx', type: 'window', x1: 20000, y1: 20000, x2: 21200, y2: 20000 },
];
for (const roof of ['gable', 'hip', 'flat', 'shed'] as const) {
  const m = buildModel(els, { floors: 2, roof: { type: roof, pitch: 30, overhangMm: 600, ridge: 'auto', shedHigh: 'north' } });
  // winding check: every triangle's geometric normal must agree with its stored normal
  let bad = 0, nan = 0;
  for (const p of m.parts) for (let i = 0; i < p.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(j => p.indices[i + j] * 3);
    const A = p.positions.slice(a, a + 3), B = p.positions.slice(b, b + 3), C = p.positions.slice(c, c + 3);
    const u = B.map((v, q) => v - A[q]), w = C.map((v, q) => v - A[q]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const s = p.normals.slice(a, a + 3);
    if (n[0] * s[0] + n[1] * s[1] + n[2] * s[2] <= 0) bad++;
    if ([...A, ...B, ...C, ...s].some(v => !isFinite(v))) nan++;
  }
  console.log(roof, 'parts', m.parts.length, 'tris', m.stats.tris, 'walls', m.stats.walls, 'D/W', m.stats.doors, m.stats.windows, 'slabs', m.stats.slabs, 'unhosted', m.stats.unhosted, 'badWinding', bad, 'nan', nan,
    'bounds', m.min.map(v => v.toFixed(2)).join(','), '->', m.max.map(v => v.toFixed(2)).join(','), m.stats.warnings.join('|'));
}
// L-shaped room detection
const L: PlanEl[] = [[0,0,6000,0],[6000,0,6000,3000],[6000,3000,3000,3000],[3000,3000,3000,6000],[3000,6000,0,6000],[0,6000,0,0]].map((c, i) => ({ id: 'l' + i, type: 'wall', x1: c[0], y1: c[1], x2: c[2], y2: c[3] }));
const lm = buildModel(L, { floors: 1 });
const slab = lm.parts.find(p => p.name.startsWith('Floor slab'))!;
let topArea = 0; for (let i = 0; i < slab.indices.length; i += 3) { const a = slab.indices[i] * 3, b = slab.indices[i + 1] * 3, c = slab.indices[i + 2] * 3; if (slab.normals[a + 1] > 0.5) topArea += Math.abs((slab.positions[b] - slab.positions[a]) * (slab.positions[c + 2] - slab.positions[a + 2]) - (slab.positions[c] - slab.positions[a]) * (slab.positions[b + 2] - slab.positions[a + 2])) / 2; }
console.log('L-shape slab area m2 =', topArea.toFixed(2), '(expected 27.00)', 'warnings', lm.stats.warnings);
const open = buildModel([{ id: 'a', type: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0 }]); console.log('open wall warnings:', open.stats.warnings);
console.log('empty:', buildModel([]).stats.warnings);

// ---- raycast + GLB
import { raycast } from '../utils/sim/raycast';
import { buildGLB } from '../utils/sim/gltf';
const m2 = buildModel(els, { floors: 1 });
// shoot from far in front of the building (south, +Z) straight at the door centre (x=5.0 m, y=1.0 m)
const hit = raycast(m2.parts, [5.0, 1.2, 30], [0, 0, -1]);
const hp = m2.parts.find(p => p.id === hit?.partId);
console.log('ray at door ->', hp?.name, 't=', hit?.t.toFixed(2));
const hit2 = raycast(m2.parts, [2.5, 1.9, 30], [0, 0, -1]);
console.log('ray at window W1 ->', m2.parts.find(p => p.id === hit2?.partId)?.name);
const hit3 = raycast(m2.parts, [3.0, 50, 4], [0, -1, 0]);
console.log('ray from above ->', m2.parts.find(p => p.id === hit3?.partId)?.name);
const glb = buildGLB(m2);
const dv = new DataView(glb);
const jl = dv.getUint32(12, true);
const js = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jl)));
const binLen = dv.getUint32(20 + jl, true);
console.log('GLB magic', dv.getUint32(0, true).toString(16), 'len ok', dv.getUint32(8, true) === glb.byteLength, 'nodes', js.nodes.length, 'accessors', js.accessors.length, 'buffer', js.buffers[0].byteLength === binLen, 'materials', js.materials.map((m: any) => m.name).join(','));
