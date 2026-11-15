import { buildModel } from '../utils/cad/build';
import { CadDoc, DEFAULT_LAYERS, DEFAULT_SETTINGS, CadObj, WallObj, OpeningObj, Solid } from '../utils/cad/types';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const vol = (s: Solid) => { let v = 0; for (let i = 0; i < s.indices.length; i += 3) { const [a, b, c] = [0, 1, 2].map(j => s.indices[i + j] * 3); const A = s.positions.slice(a, a + 3), B = s.positions.slice(b, b + 3), C = s.positions.slice(c, c + 3); v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; } return v; };
const windingOk = (s: Solid) => { let bad = 0; for (let i = 0; i < s.indices.length; i += 3) { const [a, b, c] = [0, 1, 2].map(j => s.indices[i + j] * 3); const A = s.positions.slice(a, a + 3), B = s.positions.slice(b, b + 3), C = s.positions.slice(c, c + 3); const u = B.map((v, k) => v - A[k]), w = C.map((v, k) => v - A[k]); const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const m = s.normals.slice(a, a + 3); if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] <= 0) bad++; } return bad; };

const wall = (id: string, a: [number, number], b: [number, number], t = 0.225): WallObj => ({ id, kind: 'wall', name: id, source: 'plan', layer: 'A-WALL', a, b, thickness: t });
const box6x4 = [wall('n', [0, 0], [6, 0]), wall('e', [6, 0], [6, 4]), wall('s', [6, 4], [0, 4]), wall('w', [0, 4], [0, 0])];
const mk = (objects: CadObj[], s: Partial<typeof DEFAULT_SETTINGS> = {}): CadDoc => ({ settings: { ...DEFAULT_SETTINGS, ...s, roof: { ...DEFAULT_SETTINGS.roof, ...(s.roof ?? {}) } }, objects, layers: DEFAULT_LAYERS });
const volOf = (m: ReturnType<typeof buildModel>, pred: (s: Solid) => boolean) => m.solids.filter(pred).reduce((a, s) => a + vol(s), 0);

// 1. plain box building, flat roof: wall volume = footprint ring area x height
{
  const m = buildModel(mk([...box6x4], { roof: { ...DEFAULT_SETTINGS.roof, type: 'flat' } }));
  const ring = (6 + 0.225) * (4 + 0.225) - (6 - 0.225) * (4 - 0.225);
  const H = 0.45 + 3 + 0.45;                     // plinth + storey + parapet
  const v = volOf(m, s => s.kind === 'wall');
  check('wall ring volume', near(v, ring * H, 1e-3), `got ${v.toFixed(4)}  want ${(ring * H).toFixed(4)}`);
  check('one room found', m.stats.rooms === 1, `rooms=${m.stats.rooms}`);
  const slab = volOf(m, s => s.kind === 'slab');
  check('ground slab volume (solid to ground)', near(slab, (6 - 0.225) * (4 - 0.225) * 0.45, 1e-3), slab.toFixed(4));
  check('all triangles face outward (volumes positive)', m.solids.every(s => vol(s) > 0), m.solids.filter(s => vol(s) <= 0).map(s => s.name).join(','));
  check('winding matches normals', m.solids.reduce((a, s) => a + windingOk(s), 0) === 0);
}

// 2. door + window cut real openings (volume drops by exactly the opening volume)
{
  const door: OpeningObj = { id: 'd', kind: 'door', name: 'Door D1', source: 'plan', layer: 'A-DOOR', hostId: 's', offset: 3, width: 0.9, height: 2.1, sill: 0, level: 0, hinge: 'left' };
  const win: OpeningObj = { id: 'w', kind: 'window', name: 'Window W1', source: 'plan', layer: 'A-GLAZ', hostId: 'n', offset: 2, width: 1.2, height: 1.2, sill: 0.9, level: 'all', hinge: 'left' };
  const base = buildModel(mk([...box6x4], { roof: { ...DEFAULT_SETTINGS.roof, type: 'flat' } }));
  const m = buildModel(mk([...box6x4, door, win], { roof: { ...DEFAULT_SETTINGS.roof, type: 'flat' } }));
  const dv = volOf(base, s => s.kind === 'wall') - volOf(m, s => s.kind === 'wall');
  const want = 0.9 * 2.1 * 0.225 + 1.2 * 1.2 * 0.225;
  check('openings remove exactly their volume', near(dv, want, 2e-3), `removed ${dv.toFixed(4)}  want ${want.toFixed(4)}`);
  check('fittings exist', m.solids.some(s => s.name.includes('glass')) && m.solids.some(s => s.name.includes('leaf')));
  check('every solid positive volume', m.solids.every(s => vol(s) > 0), m.solids.filter(s => vol(s) <= 0).map(s => s.name).join(','));
  check('winding matches normals (with openings)', m.solids.reduce((a, s) => a + windingOk(s), 0) === 0);
}

// 3. two storeys, windows on every floor, L-shape rooms
{
  const L: WallObj[] = [[[0, 0], [6, 0]], [[6, 0], [6, 3]], [[6, 3], [3, 3]], [[3, 3], [3, 6]], [[3, 6], [0, 6]], [[0, 6], [0, 0]]].map((c, i) => wall('l' + i, c[0] as [number, number], c[1] as [number, number]));
  const m = buildModel(mk(L, { storeys: 2 }));
  const room = volOf(m, s => s.kind === 'slab' && s.name.includes('L0')) / 0.45;
  const d = 0.1125, want = 27 - 24 * d + (5 - 1) * d * d;     // inward offset of a rectilinear polygon: A - P d + (convex - reflex) d^2
  check('L-shaped room area', near(room, want, 1e-3), `${room.toFixed(4)}  want ${want.toFixed(4)}`);
  check('two storeys of slabs', m.solids.filter(s => s.kind === 'slab').length === 2, String(m.solids.filter(s => s.kind === 'slab').length));
}

// 4. roofs: every type builds, closed, outward
for (const type of ['gable', 'hip', 'shed'] as const) {
  const m = buildModel(mk([...box6x4], { roof: { ...DEFAULT_SETTINGS.roof, type } }));
  const roof = m.solids.filter(s => s.kind === 'roof' || s.name.includes('ends') || s.name.includes('infill'));
  check(`${type} roof builds`, roof.length >= 1, roof.map(s => s.name).join(','));
  check(`${type} roof volumes positive`, roof.every(s => vol(s) > 0), roof.map(s => vol(s).toFixed(3)).join(','));
  check(`${type} roof winding`, roof.reduce((a, s) => a + windingOk(s), 0) === 0);
  const topY = m.max[1];
  check(`${type} roof top height plausible`, topY > 3.45 && topY < 7, topY.toFixed(2));
}

// 5. stairs / columns / solids
{
  const m = buildModel(mk([...box6x4,
    { id: 'c', kind: 'column', name: 'Column', source: 'model', layer: 'S-COLS', at: [3, 2], w: 0.3, d: 0.3, round: false, base: 0, height: 0 },
    { id: 'st', kind: 'stair', name: 'Stair', source: 'model', layer: 'A-STRS', start: [1, 1], angle: 0, width: 1, level: 0 },
    { id: 'b', kind: 'solid', name: 'Box', source: 'model', layer: '0', ring: [[1, 1], [2, 1], [2, 2], [1, 2]], base: 0, height: 1, material: 'solid' },
  ], { storeys: 2 }));
  const col = m.solids.find(s => s.kind === 'column')!;
  check('column volume', near(vol(col), 0.09 * (0.45 + 6), 1e-6), vol(col).toFixed(4));
  const box = m.solids.find(s => s.kind === 'solid')!;
  check('box volume', near(vol(box), 1, 1e-9));
  const st = m.solids.find(s => s.kind === 'stair')!;
  check('stair is a closed positive solid', vol(st) > 0, vol(st).toFixed(3));
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall kernel checks passed');
process.exit(failed ? 1 : 0);
