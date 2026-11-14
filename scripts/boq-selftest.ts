// Run: npx tsx scripts/boq-selftest.ts
import { buildBoq } from '../utils/boq/takeoff';
import { priceLines, summarize } from '../utils/boq/pricing';
import { DEFAULT_RATES } from '../utils/boq/rates';
import { DEFAULT_ASSUMPTIONS, DEFAULT_MARKUPS, BoqModel } from '../utils/boq/types';
import { footprintOf } from '../utils/boq/model';

let fails = 0;
const eq = (name: string, got: number, want: number, tol = 0.011) => {
  const ok = Math.abs(got - want) <= tol; if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got}, want ${want}`);
};

// 10 m x 8 m house, centre-line, 225 external / 150 internal, two internal walls (8 m and 5 m)
const W = (id: string, L: number, ext: boolean, th: number) => ({ id, label: id, lengthMm: L, thicknessMm: th, external: ext, source: 'manual' as const });
const model: BoqModel = {
  walls: [W('e1', 10000, true, 225), W('e2', 8000, true, 225), W('e3', 10000, true, 225), W('e4', 8000, true, 225), W('i1', 8000, false, 150), W('i2', 5000, false, 150)],
  openings: [
    { id: 'd1', kind: 'door', mark: 'D1', description: 'Panel door', widthMm: 900, heightMm: 2100, qty: 1, external: true, source: 'manual' },
    { id: 'd2', kind: 'door', mark: 'D2', description: 'Flush door', widthMm: 900, heightMm: 2100, qty: 4, external: false, source: 'manual' },
    { id: 'w1', kind: 'window', mark: 'W1', description: 'Sliding window', widthMm: 1200, heightMm: 1200, qty: 6, external: true, source: 'manual' },
  ],
  columns: [],
  footprint: { lengthM: 10, widthM: 8, areaM2: 80, source: 'manual' },
};
const a = { ...DEFAULT_ASSUMPTIONS, columnPad: false, stairCount: 0 };
const { lines, geo } = buildBoq(model, a);
const get = (k: string) => lines.find(l => l.key === k)?.qty ?? 0;

// geometry
eq('A_ext (10.225 x 8.225)', geo.aExtM2, 10.225 * 8.225);
eq('A_net  (9.775 x 7.775 - internal walls)', geo.aNetM2, 9.775 * 7.775 - (7.775 * 0.15 + 4.775 * 0.15));
eq('trench length 36 + (8-.45) + (5-.45)', geo.trenchLenM, 36 + 7.55 + 4.55);
eq('trench depth 1.2 - 0.15 topsoil', geo.trenchDepthM, 1.05);
// excavation & concrete
eq('trench excavation', get('d20.trench'), 48.1 * 0.45 * 1.05);
eq('footing concrete', get('e10.footing'), 48.1 * 0.45 * 0.225);
eq('ground slab', get('e10.groundslab'), geo.aNetM2 * 0.15);
// walls: substructure 225 = 36 m x (1.2-0.225+0.45) = 36 x 1.425
eq('substructure 225 wall', get('f10.sub.225'), 36 * 1.425);
// superstructure external: 36 x 3.0 = 108 - openings (6 x1.44 + 1 x 1.89) - lintels - ring beam + gables
const openExt = 6 * 1.44 + 1.89;
const lintExt = 6 * (1.2 + 0.45) * 0.15 + 1 * (0.9 + 0.45) * 0.15;
const ring = 36 * 0.15;
const gable = geo.shortExtM * (geo.shortExtM / 2) * Math.tan(25 * Math.PI / 180);
eq('external 225 superstructure', get('f10.sup.E225'), 108 - openExt - lintExt - ring + gable, 0.02);
// roof
const plan = geo.aExtM2 + geo.pExtM * 0.6 + 4 * 0.36;
eq('roof sloped area', get('roof.cover'), plan / Math.cos(25 * Math.PI / 180));
eq('roof plan via rectangle (10.225+1.2)(8.225+1.2)', plan, 11.425 * 9.425, 0.02);
// pricing + summary
const priced = priceLines(lines, DEFAULT_RATES, {}, []);
const s = summarize(priced, DEFAULT_MARKUPS, geo.gfaM2);
eq('sections add up to net', s.sections.reduce((x, y) => x + y.total, 0), s.net, 0.05);
eq('grand = subtotal x 1.15', s.grand, s.subtotal * 1.15, 0.05);
console.log(`\n${lines.length} lines, net ${s.net.toFixed(0)}, grand ${s.grand.toFixed(0)}, ${s.perM2.toFixed(0)} per m2 GFA (${geo.gfaM2.toFixed(1)} m2)`);
lines.filter(l => l.qty <= 0 || !Number.isFinite(l.qty)).forEach(l => { fails++; console.log('BAD qty', l.key); });
s.sections.forEach(x => console.log(`  ${x.code.padEnd(4)} ${x.title.padEnd(48)} ${x.total.toFixed(0).padStart(9)}`));

// footprint: closed L-shape polygon and open fallback
const el = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, type: 'wall', x1, y1, x2, y2 });
const L = [el('a', 0, 0, 6000, 0), el('b', 6000, 0, 6000, 3000), el('c', 6000, 3000, 3000, 3000), el('d', 3000, 3000, 3000, 6000), el('e', 3000, 6000, 0, 6000), el('f', 0, 6000, 0, 0)];
eq('L-shaped footprint area', footprintOf(L).areaM2, 27);
eq('open loop falls back to bbox', footprintOf(L.slice(0, 5)).areaM2, 36);

// flat roof & two storeys must still produce sane output
const b2 = buildBoq(model, { ...a, floors: 2, roofType: 'flat' });
eq('2-storey flat: no trusses', b2.lines.filter(l => l.section === 'G20').length, 0);
eq('2-storey flat: suspended slab m3', b2.lines.find(l => l.key === 'e10.suspslab')!.qty, (geo.aExtM2 + (geo.aExtM2 + geo.pExtM * 0.6 + 1.44)) * 0.15, 0.03);

// ---------------------------------------------------------------- AI parsing and apply (no network)
import { extractJson, normalise, mergeExtractions, applyExtraction, crossCheck } from '../utils/boq/ai';
import { EMPTY_MODEL } from '../utils/boq/model';
{
  const reply = 'Here you go:\n```json\n{"drawingType":"floor_plan","floors":"1","overall":{"lengthM":"12.0","widthM":9.5},' +
    '"rooms":[{"name":"Living","lengthM":5,"widthM":4},{"name":"Bed 1","areaM2":12}],' +
    '"doors":[{"mark":"D1","widthMm":0.9,"heightMm":2.1,"count":"3"},{"mark":"D9","widthMm":90000,"count":1}],' +
    '"windows":[{"mark":"W1","widthMm":1200,"heightMm":1200,"count":5,"external":true}],' +
    '"heights":{"floorHeightMm":3.0,"plinthMm":450,"foundationDepthMm":99999},"specs":["Concrete C25"]}\n```';
  const ex = normalise(extractJson(reply));
  eq('AI: fenced JSON parsed, metres converted (door width mm)', ex.doors[0].widthMm, 900);
  eq('AI: absurd door dropped', ex.doors.length, 1);
  eq('AI: floor height 3.0 -> 3000', ex.heights.floorHeightMm ?? 0, 3000);
  eq('AI: bad foundation depth rejected', ex.heights.foundationDepthMm === null ? 1 : 0, 1);
  const merged = mergeExtractions([ex, normalise({ doors: [{ mark: 'D1', widthMm: 900, count: 4 }] })]);
  eq('AI: duplicate mark across pages takes max, not sum', merged.doors[0].count, 4);
  const applied = applyExtraction(merged, EMPTY_MODEL, DEFAULT_ASSUMPTIONS, 'replace');
  eq('AI: four external walls generated', applied.model.walls.length, 4);
  eq('AI: centre-line footprint area (11.775 x 9.275)', applied.model.footprint.areaM2, 11.775 * 9.275, 0.02);
  const r = buildBoq(applied.model, { ...applied.assumptions, columnPad: false });
  eq('AI: generated model produces a bill', r.lines.length > 20 ? 1 : 0, 1);
  eq('AI: 4 + 5 openings carried to bill (L20+L10 nr)', r.lines.filter(l => l.unit === 'nr' && (l.section === 'L10' || l.section === 'L20')).reduce((s, l) => s + l.qty, 0), 9);
  eq('cross-check flags room-area mismatch', crossCheck(merged).some(w => /Room areas/.test(w)) ? 1 : 0, 1);
  try { extractJson('sorry, I cannot read this'); eq('non-JSON must throw', 0, 1); } catch { eq('non-JSON throws', 1, 1); }
}
console.log(fails ? `\n${fails} FAILED (incl. AI)` : '\nall checks passed (incl. AI)'); process.exit(fails ? 1 : 0);
