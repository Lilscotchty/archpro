// Run: npx tsx scripts/drawings-selftest.ts
import { generatePack } from '../utils/drawings/pack';
import { withRef } from '../utils/drawings/planSvg';
import { modelFromProject } from '../utils/boq/model';
import { DEFAULT_ASSUMPTIONS } from '../utils/boq/types';
import { buildBoq } from '../utils/boq/takeoff';

let fails = 0; const ok = (name: string, c: boolean, extra = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const el = (id: string, type: string, x1: number, y1: number, x2: number, y2: number) => ({ id, type, x1, y1, x2, y2, gridRef: '' });
const project: any = {
  imageSrc: null, imageWidth: 3508, imageHeight: 2480, gridLines: [], columns: [],
  settings: { scale: 100, gridSpacing: 4000, wallWidth: 225, trenchWidth: 450, footingWidth: 1000, workingSpace: 300, blindingOffset: 50, foundationDepth: 1200, concreteGrade: 'C25/30' },
  specs: { floors: 1, floorHeight: 3000, plinthHeight: 450, roof: { type: 'gable', pitch: 25, overhang: 600 } },
  elements: [
    el('w1', 'wall', 1000, 1000, 11000, 1000), el('w2', 'wall', 11000, 1000, 11000, 9000), el('w3', 'wall', 11000, 9000, 1000, 9000), el('w4', 'wall', 1000, 9000, 1000, 1000),
    el('w5', 'wall', 1000, 5000, 11000, 5000),
    el('o1', 'door', 5000, 9000, 5900, 9000), el('o2', 'window', 2000, 1000, 3200, 1000), el('o3', 'window', 7000, 1000, 8200, 1000), el('o4', 'door', 4000, 5000, 4900, 5000), el('c1', 'rect', 5400, 4900, 5600, 5100),
  ],
};
const a = { ...DEFAULT_ASSUMPTIONS };
const pack = generatePack(project, a);
console.log('skipped:', pack.skipped);
ok('three drawings generated', pack.items.length === 3, `(${pack.items.map(i => i.refSuffix).join(', ')})`);
pack.items.forEach(i => {
  ok(`${i.refSuffix}: valid svg, no NaN/undefined`, i.svg.startsWith('<?xml') && i.svg.includes('</svg>') && !/NaN|undefined/.test(i.svg));
  ok(`${i.refSuffix}: data carries plan + assumptions`, !!(i.data as any).plan && !!(i.data as any).assumptions);
});
const fp = pack.items.find(i => i.refSuffix === 'FLOOR-PLAN-AUTO')!;
const model = modelFromProject(project, a);
const marks = model.openings.map(o => o.mark);
ok('floor plan prints every schedule mark', marks.every(m => fp.svg.includes(`>${m}</text>`)), `(${marks.join(',')})`);
ok('external/internal wall tags printed', fp.svg.includes('W1 ext') && fp.svg.includes('W5 int'));
ok('designation written into title block', withRef(fp.svg, 'P7K2-FLOOR-PLAN-AUTO').includes('>P7K2-FLOOR-PLAN-AUTO<'));
const el_ = pack.items.find(i => i.refSuffix === 'ELEVATIONS-AUTO')!;
ok('elevations contain the plan openings', (el_.data as any).model.openings.length === 3, `(${(el_.data as any).model.openings.length} on external walls; internal door excluded)`);
const bill = buildBoq(model, a);
ok('schedule from same project still builds a bill', bill.lines.length > 20);
console.log('footprint', model.footprint, 'ext walls', model.walls.filter(w => w.external).length);

// no walls -> clear reason, no throw
const empty = generatePack({ ...project, elements: [] }, a);
ok('empty plan gives a reason, not an error', empty.items.length === 0 && empty.skipped.length === 1);
// open (non-closed) walls: elevations may fail but plans still generate
const open = generatePack({ ...project, elements: project.elements.filter((e: any) => e.id !== 'w4') }, a);
ok('open wall loop still gives plans', open.items.some(i => i.kind === 'floor_plan') && open.items.some(i => i.kind === 'foundation_plan'), `(skipped: ${open.skipped.join('|') || 'none'})`);
console.log(fails ? `\n${fails} FAILED` : '\nall drawing checks passed'); process.exit(fails ? 1 : 0);
