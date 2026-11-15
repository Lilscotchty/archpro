// Run: npx tsx scripts/drafting-selftest.ts
import { angleDeg, polar, parseEntry, niceStep, projectOnSeg, segIntersect } from '../utils/drafting/geometry';
import { snap } from '../utils/drafting/snap';
import { calibrateUnderlay, setUnderlayScale, alignUnderlay, imageToModel, modelToImage, mmPerPxPaper, mmPerPxTwoPoint, paperWidthFor } from '../utils/drafting/scale';
import { rectangleWalls, hitTest, moveElements, stretchEnd, setWallLength, placeOpening, removeElements, planStats, newWall } from '../utils/drafting/ops';
import { newProject, sanitizeProject } from '../utils/drafting/project';
import { parseProjectFile, projectToFile } from '../utils/drafting/persist';

let fails = 0;
const ok = (n: string, c: boolean, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) <= t;

// entry parsing
ok('entry length', JSON.stringify(parseEntry('4500')) === '{"kind":"length","len":4500}');
ok('entry metres', (parseEntry('4.5m') as any)?.len === 4500);
ok('entry polar', (parseEntry('3000<90') as any)?.deg === 90);
ok('entry rel', (parseEntry('@3000,-2000') as any)?.dy === -2000);
ok('entry junk rejected', parseEntry('abc') === null && parseEntry('0') === null);
const p = polar({ x: 0, y: 0 }, 1000, 90);
ok('polar up = -y', near(p.x, 0, 1e-9) && near(p.y, -1000) && near(angleDeg({ x: 0, y: 0 }, p), 90));
ok('niceStep', niceStep(7) === 10 && niceStep(1.2) === 2 && niceStep(30) === 50);
ok('intersect', !!segIntersect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 0, y1: 10, x2: 10, y2: 0 }));

// scale maths
ok('two point', near(mmPerPxTwoPoint(200, 5000), 25));
ok('printed 1:100 on A3 PDF 3508px', near(mmPerPxPaper(420, 3508, 100), 420 / 3508 * 100));
ok('paper orientation', paperWidthFor('A3', 3000, 2000) === 420 && paperWidthFor('A3', 2000, 3000) === 297);
const u0: any = { mmPerPx: 10, x: 0, y: 0, rot: 0, opacity: 1, visible: true, calibrated: false, method: '', name: 'x', kind: 'image' };
// the user clicks two model points 1000 mm apart (at current scale) that are really 4000 mm
const cal = calibrateUnderlay(u0, { x: 500, y: 500 }, { x: 1500, y: 500 }, 4000, 't')!;
ok('calibrate x4', near(cal.mmPerPx, 40) && cal.calibrated);
ok('calibrate keeps first point fixed', (() => { const px = modelToImage(u0, { x: 500, y: 500 }); const m = imageToModel(cal, px); return near(m.x, 500) && near(m.y, 500); })());
const cal2 = setUnderlayScale(u0, 20, 1000, 800, 'p')!;
ok('printed scale keeps image centre', (() => { const c0 = imageToModel(u0, { x: 500, y: 400 }), c1 = imageToModel(cal2, { x: 500, y: 400 }); return near(c0.x, c1.x) && near(c0.y, c1.y); })());
const tilted = alignUnderlay({ ...u0, rot: 0 }, { x: 0, y: 0 }, { x: 1000, y: 100 })!;
ok('straighten removes the tilt', near(tilted.rot, -5.7106, 1e-3), `rot=${tilted.rot.toFixed(3)}`);
ok('image<->model round trip with rotation', (() => { const uu = { ...u0, x: 300, y: -200, rot: 33, mmPerPx: 7.5 }; const m = imageToModel(uu, { x: 123, y: 456 }); const b = modelToImage(uu, m); return near(b.x, 123, 1e-6) && near(b.y, 456, 1e-6); })());

// ops
const proj = () => { const pr = newProject(); pr.elements = rectangleWalls({ x: 0, y: 0 }, { x: 8000, y: 6000 }); return pr; };
let pr = proj();
ok('rectangle = 4 joined walls', pr.elements.length === 4 && planStats(pr).dangling === 0);
ok('tiny rectangle ignored', rectangleWalls({ x: 0, y: 0 }, { x: 0.2, y: 500 }).length === 0);
ok('hit wall', hitTest({ x: 4000, y: 40 }, pr, 0.1)?.id === pr.elements[0].id);
ok('miss', hitTest({ x: 4000, y: 3000 }, pr, 0.1) === null);

// stretch one corner: both joined walls follow
const w0 = pr.elements[0];
pr = { ...pr, elements: stretchEnd(pr, w0.id, 2, { x: 9000, y: 0 }) };
ok('stretch moves the joined wall too', pr.elements[1].x1 === 9000 && planStats(pr).dangling === 0);
// wall length edit keeps direction
pr = { ...pr, elements: setWallLength(pr, w0.id, 5000) };
ok('set length', near(Math.hypot(pr.elements[0].x2 - pr.elements[0].x1, pr.elements[0].y2 - pr.elements[0].y1), 5000) && pr.elements[1].x1 === 5000);

// openings
pr = proj();
const pl = placeOpening(pr, { x: 3000, y: 80 }, 900, 0.1)!;
ok('opening sits on the wall, correct width', !!pl && near(pl.x2 - pl.x1, 900) && near(pl.y1, 0) && pl.hostId === pr.elements[0].id);
ok('no host far from walls', placeOpening(pr, { x: 4000, y: 3000 }, 900, 0.1) === null);
const edge = placeOpening(pr, { x: 10, y: 0 }, 900, 0.1)!;
ok('opening clamped inside wall', edge.x1 >= 0);
const door = { id: 'd', type: 'door', x1: pl.x1, y1: pl.y1, x2: pl.x2, y2: pl.y2, gridRef: '' } as any;
pr = { ...pr, elements: [...pr.elements, door] };
const moved = moveElements(pr, new Set([pr.elements[0].id]), 0, 500);
ok('moving a wall carries its door and stretches neighbours', moved.find(e => e.id === 'd')!.y1 === 500 && moved[1].y1 === 500 && moved[3].y2 === 500);
ok('deleting a wall removes its door', !removeElements(pr, new Set([pr.elements[0].id])).some(e => e.id === 'd'));
ok('deleting another wall keeps the door', removeElements(pr, new Set([pr.elements[2].id])).some(e => e.id === 'd'));

// snapping
const sn = (raw: any, extra: any = {}) => snap({ raw, elements: pr.elements, gridLines: [], zoom: 0.1, settings: { object: true, grid: true, track: true, ortho: false }, ...extra });
ok('snaps to endpoint', sn({ x: 7990, y: 12 }).kind === 'endpoint' && sn({ x: 7990, y: 12 }).p.x === 8000);
ok('snaps to midpoint', sn({ x: 4010, y: 6000 }).kind === 'midpoint');
ok('snaps to grid in open space', (() => { const r = sn({ x: 3012, y: 2987 }); return r.kind === 'grid' && r.p.x % 100 === 0; })());
const from = { x: 1000, y: 1000 };
const pol = sn({ x: 5000, y: 1050 }, { from, elements: [] });
ok('polar tracking locks to 0 degrees', pol.kind === 'polar' && near(pol.p.y, 1000, 1e-6), JSON.stringify(pol.p));
const ort = sn({ x: 5000, y: 3500 }, { from, elements: [], settings: { object: true, grid: false, track: false, ortho: true } });
ok('ortho forces 0/90', near(ort.p.y, 1000) || near(ort.p.x, 1000));
ok('snaps off returns raw', snap({ raw: { x: 3.3, y: 4.4 }, elements: [], gridLines: [], zoom: 1, settings: { object: false, grid: false, track: false, ortho: false } }).p.x === 3.3);

// project files
const file = projectToFile({ ...proj(), underlay: undefined } as any);
const back = parseProjectFile(file);
ok('file round trip', back.elements.length === 4 && back.settings.mmPerUnit === 1);
ok('bad file rejected', (() => { try { parseProjectFile('{"a":1}'); return false; } catch { return true; } })());
const dirty = sanitizeProject({ elements: [{ id: 'a', type: 'wall', x1: 0, y1: 0, x2: NaN, y2: 5 }, { id: 'b', type: 'wall', x1: 0, y1: 0, x2: 10, y2: 0 }], gridLines: [{ id: 'g', position: 'x', orientation: 'vertical' }], settings: { mmPerUnit: 77 } });
ok('sanitiser drops bad elements and forces mm units', dirty.elements.length === 1 && dirty.gridLines.length === 0 && dirty.settings.mmPerUnit === 1);
ok('projectOnSeg', near(projectOnSeg({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }).d, 5));
ok('newWall', newWall({ x: 0, y: 0 }, { x: 1, y: 1 }).type === ('wall' as any));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
