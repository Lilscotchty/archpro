// Run: npm i --no-save fake-indexeddb && npx tsx scripts/store-selftest.ts   (local backend only; Supabase needs a real project)
import 'fake-indexeddb/auto';
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
import { saveDrawing, listDrawings, getDrawingBlob, getDrawingData, deleteDrawing, refFor, getProjectId, newProjectId, getStatus } from '../utils/drawings/store';

let fails = 0; const ok = (n: string, c: boolean, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
(async () => {
  const input = (svg: string, data: unknown) => ({ kind: 'floor_plan' as const, refSuffix: 'FLOOR-PLAN', title: 'Floor plan', origin: 'drafting' as const, generated: false, blob: new Blob([svg], { type: 'image/svg+xml' }), width: 1587, height: 1123, data });
  ok('cloud not configured -> local backend', getStatus().backend === 'local' && !getStatus().configured);
  const m1 = await saveDrawing(input('<svg>a</svg>', { walls: 4 }));
  ok('first save returns meta with designated ref', m1?.ref === refFor('FLOOR-PLAN') && m1.version === 1, m1?.ref);
  ok('identical re-save is skipped', (await saveDrawing(input('<svg>a</svg>', { walls: 4 }))) === null);
  const m2 = await saveDrawing(input('<svg>b</svg>', { walls: 5 }));
  ok('changed re-save bumps version, keeps id', m2?.version === 2 && m2.id === m1?.id);
  const list = await listDrawings();
  ok('one drawing listed (updated in place)', list.length === 1 && list[0].version === 2);
  ok('blob round-trips', (await (await getDrawingBlob(list[0])).text()) === '<svg>b</svg>');
  ok('page data stored with the drawing', (await getDrawingData(list[0]) as any).walls === 5);
  const old = getProjectId(); const np = newProjectId();
  ok('new drawing set is separate', np !== old && (await listDrawings()).length === 0);
  await deleteDrawing(list[0]);
  ok('delete removes it', (await listDrawings()).length === 0 && true);
  console.log(fails ? `\n${fails} FAILED` : '\nall store checks passed'); process.exit(fails ? 1 : 0);
})();
