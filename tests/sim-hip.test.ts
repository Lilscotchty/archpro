// Run: npx tsx tests/sim-hip.test.ts — the 3D hip roof (equal pitch, 45-degree bisector hips).
import { buildModel } from '../utils/sim/build';
import { PlanEl } from '../utils/sim/types';

let fails = 0;
const ok = (n: string, c: boolean, x = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n} ${x}`); };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): PlanEl => ({ id, type: 'wall', x1, y1, x2, y2 });
const loop = (pts: [number, number][]) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return wall(`w${i}`, p[0], p[1], q[0], q[1]); });
const cfg = { floors: 1, wallThicknessMm: 225, floorHeightMm: 3000, plinthMm: 450, roof: { type: 'hip' as const, pitch: 30, overhangMm: 600, ridge: 'auto' as const, shedHigh: 'north' as const } };
const tp = Math.tan((30 * Math.PI) / 180), yTop = 0.45 + 3;

// rectangle 8 m x 6 m: ridge 2 m long, apex at half the (overhang-extended) short span
const rect = buildModel(loop([[0, 0], [8000, 0], [8000, 6000], [0, 6000]]), cfg);
const roof = rect.parts.find(p => p.name === 'Hip roof');
ok('rectangle: hip roof built', !!roof && rect.stats.warnings.every(w => !/Hip roof/.test(w)));
ok('rectangle: ridge height = wall top + tan(pitch) x half span', Math.abs(rect.max[1] - (yTop + tp * 3)) < 0.01, `max y ${rect.max[1].toFixed(3)} want ${(yTop + tp * 3).toFixed(3)}`);
ok('rectangle: eaves overhang 0.6 m beyond the walls', Math.abs(rect.min[0] - -0.6) < 0.01 && Math.abs(rect.max[0] - 8.6) < 0.01);

// every triangle faces the way its stored normal says, nothing is NaN
let bad = 0, nan = 0;
for (const p of rect.parts) for (let i = 0; i < p.indices.length; i += 3) {
  const [a, b, c] = [0, 1, 2].map(j => p.indices[i + j] * 3);
  const A = p.positions.slice(a, a + 3), B = p.positions.slice(b, b + 3), C = p.positions.slice(c, c + 3);
  const u = B.map((v, q) => v - A[q]), w = C.map((v, q) => v - A[q]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], s = p.normals.slice(a, a + 3);
  if (n[0] * s[0] + n[1] * s[1] + n[2] * s[2] <= 0) bad++;
  if ([...A, ...B, ...C].some(v => !isFinite(v))) nan++;
}
ok('winding matches normals, no NaN', bad === 0 && nan === 0);

// square: all four hips meet at one apex
const sq = buildModel(loop([[0, 0], [6000, 0], [6000, 6000], [0, 6000]]), cfg);
ok('square: single apex at half span', Math.abs(sq.max[1] - (yTop + tp * 3)) < 0.01);

// L-shaped plan (not a rectangle): hips, ridges and a valley; the old bounding-box hip would be wrong here
const L = buildModel(loop([[0, 0], [10000, 0], [10000, 4000], [4000, 4000], [4000, 9000], [0, 9000]]), cfg);
const lroof = L.parts.find(p => p.name === 'Hip roof');
ok('L-shape: true hip roof built (no fallback warning)', !!lroof && L.stats.warnings.every(w => !/Hip roof/.test(w)));
ok('L-shape: roof stays within the overhang outline', L.min[0] >= -0.61 && L.max[0] <= 10.61 && L.min[2] >= -0.61 && L.max[2] <= 9.61);
ok('L-shape: ridge no higher than the widest wing allows', L.max[1] <= yTop + tp * 3 + 0.01, `max y ${L.max[1].toFixed(3)}`);

// open outline falls back with a warning instead of failing
const open = buildModel([wall('a', 0, 0, 8000, 0), wall('b', 8000, 0, 8000, 6000)], cfg);
ok('open outline: falls back and warns', open.parts.some(p => p.name === 'Hip roof') && open.stats.warnings.some(w => /Hip roof/.test(w)));

console.log(fails ? `\n${fails} FAILED` : '\nHIP ROOF TESTS PASSED');
process.exit(fails ? 1 : 0);
