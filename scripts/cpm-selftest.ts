// Run: npx tsx scripts/cpm-selftest.ts
import { Activity, schedule } from '../utils/methodEngine';
import { layoutCpm, renderCpmSvg, wrapName, BOX } from '../utils/cpmDiagram';

let fails = 0;
const ok = (n: string, c: boolean, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

// the network from the reference diagram
const acts: Activity[] = [
  { id: 1, name: 'TRENCH', days: 2, preds: [] }, { id: 2, name: 'D', days: 4, preds: [] },
  { id: 3, name: 'CONCRETE', days: 2, preds: [1] }, { id: 4, name: 'E', days: 8, preds: [2] },
  { id: 5, name: 'TRH BLOCK', days: 5, preds: [3, 4] }, { id: 6, name: 'FENCE', days: 2, preds: [3, 4] },
  { id: 7, name: 'H', days: 2, preds: [6] }, { id: 8, name: 'C', days: 1, preds: [7] },
];
const s = schedule(acts);
const L = layoutCpm(s.items, s.total);
const N = (name: string) => L.nodes.find(n => n.label === name)!;
ok('schedule is consistent: LF of last activities = total', s.items.filter(i => i.id === 5 || i.id === 8).every(i => i.lf === s.total), `total ${s.total}`);
ok('every box satisfies LS = ES + float and LF = EF + float', s.items.every(i => i.ls === i.es + i.float && i.lf === i.ef + i.float));
ok('Start and End boxes present', !!N('Start') && !!N('End') && N('End').es === s.total && N('End').lf === s.total);

// columns match the reference: Start | TRENCH,D | CONCRETE,E | TRH BLOCK,FENCE | H | C | End
const col = (n: string) => N(n).x;
ok('columns', col('Start') < col('TRENCH') && col('TRENCH') === col('D') && col('D') < col('CONCRETE') && col('CONCRETE') === col('E') && col('E') < col('FENCE') && col('FENCE') === col('TRH BLOCK') && col('FENCE') < col('H') && col('H') < col('C') && col('C') < col('End'));
ok('row order follows the network (TRENCH above D, CONCRETE above E, TRH BLOCK above FENCE)', N('TRENCH').y < N('D').y && N('CONCRETE').y < N('E').y && N('TRH BLOCK').y < N('FENCE').y);
ok('Start sits between the two first activities', N('Start').y > N('TRENCH').y && N('Start').y < N('D').y);
ok('FENCE, H, C share a row (straight arrows)', N('FENCE').y === N('H').y && N('H').y === N('C').y);

// geometry invariants on the reference network and on random networks
const inside = (n: { x: number; y: number; w: number; h: number }, px: number, py: number) => px > n.x + 0.5 && px < n.x + n.w - 0.5 && py > n.y - n.h / 2 + 0.5 && py < n.y + n.h / 2 - 0.5;
function crossesBox(L: ReturnType<typeof layoutCpm>): string | null {
  for (const e of L.edges) for (let i = 0; i + 1 < e.points.length; i++) {
    const a = e.points[i], b = e.points[i + 1], steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 0; k <= steps; k++) {
      const px = a.x + ((b.x - a.x) * k) / steps, py = a.y + ((b.y - a.y) * k) / steps;
      for (const n of L.nodes) if (inside(n, px, py)) return `${e.from}->${e.to} through ${n.label}`;
    }
  }
  return null;
}
function boxesOverlap(L: ReturnType<typeof layoutCpm>): boolean {
  for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) {
    const a = L.nodes[i], b = L.nodes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && Math.abs(a.y - b.y) < (a.h + b.h) / 2) return true;
  }
  return false;
}
ok('reference network: no arrow crosses a box, no boxes overlap', crossesBox(L) === null && !boxesOverlap(L), String(crossesBox(L)));
ok('every arrow ends on the left edge of its box at mid-height', L.edges.every(e => { const t = L.nodes.find(n => n.label === (e.to === 'end' ? 'End' : acts.find(a => `a${a.id}` === e.to)!.name))!; const p = e.points[e.points.length - 1]; return Math.abs(p.x - t.x) < 0.01 && Math.abs(p.y - t.y) < 0.01; }));

let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let bad = '';
for (let t = 0; t < 300 && !bad; t++) {
  const n = 2 + Math.floor(rnd() * 13), a: Activity[] = [];
  for (let i = 1; i <= n; i++) a.push({ id: i, name: `Act ${i}`, days: Math.floor(rnd() * 9), preds: Array.from({ length: i - 1 }, (_, k) => k + 1).filter(() => rnd() < 0.3) });
  const sc = schedule(a); if (sc.error) continue;
  const lay = layoutCpm(sc.items, sc.total);
  const c = crossesBox(lay);
  if (c || boxesOverlap(lay)) bad = `trial ${t}: ${c ?? 'overlap'}`;
  if (!bad && !(lay.nodes.length === n + 2)) bad = `trial ${t}: node count`;
  if (!bad && lay.edges.some(e => e.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0))) bad = `trial ${t}: bad coordinate`;
}
ok('300 random networks: no arrow crosses a box, no overlaps, all coordinates valid', !bad, bad);

// SVG
const svg = renderCpmSvg(L);
ok('SVG is well formed and has one box per node', svg.startsWith('<svg') && svg.endsWith('</svg>') && (svg.match(/<rect x=/g) ?? []).length === L.nodes.length);
const evil = layoutCpm(schedule([{ id: 1, name: '<img onerror=x> & "q"', days: 1, preds: [] }]).items, 1);
const evilSvg = renderCpmSvg(evil);
ok('names are escaped in the SVG', !evilSvg.includes('<img') && evilSvg.includes('&lt;img'));
ok('wrapName keeps two lines and ellipsis', wrapName('Excavate foundation trenches and dispose of arisings off site').length === 2 && wrapName('A very long single word name indeed').every(l => l.length <= 19));
ok('title and key options add space', renderCpmSvg(L, { title: 'T', key: true }).includes('Critical path') && renderCpmSvg(L, { highlight: true }).includes('#c40000'));
ok('empty schedule gives empty diagram', renderCpmSvg(layoutCpm([], 0)) === '');
// parallel critical branches are listed as separate paths
ok('critical paths are listed separately', L.criticalPaths.length === 2 && L.criticalPaths.every(p => p[0] === 'Start' && p[p.length - 1] === 'End'), JSON.stringify(L.criticalPaths));

// PDF writer: valid structure and correct xref offsets
import { buildPdf } from '../utils/cpmExport';
const pdf = buildPdf(new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]), 10, 10, 595, 842, 10, 10, 100, 100);
const txt = Buffer.from(pdf).toString('latin1');
ok('PDF header and trailer', txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'));
const xr = txt.indexOf('xref\n0 '), table = txt.slice(xr).split('\n').filter(l => /^\d{10} 00000 n/.test(l));
ok('PDF xref offsets point at each object', table.length === 6 && table.every((l, i) => txt.slice(parseInt(l, 10)).startsWith(`${i + 1} 0 obj`)));
ok('PDF startxref points at the table', txt.slice(parseInt(txt.split('startxref\n')[1], 10)).startsWith('xref'));
console.log(`box ${BOX.w}x${BOX.h}, diagram ${L.width}x${L.height}`);
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
