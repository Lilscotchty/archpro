import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
const g: any = globalThis;
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  try { g[k] = (dom.window as any)[k] ?? g[k]; } catch { Object.defineProperty(g, k, { value: (dom.window as any)[k], configurable: true }); }
}
g.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
g.IS_REACT_ACT_ENVIRONMENT = true;
(dom.window.navigator as any).getGamepads = () => [];
(dom.window as any).ResizeObserver = g.ResizeObserver;
Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }) });

const errors: any[] = []; const origErr = console.error; console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); };

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { createGraphicsDevice } = await import('playcanvas');
const { SimView } = await import('../components/sim/SimView');
const { buildModel } = await import('../utils/sim/build');
const { DEFAULT_COLORS } = await import('../utils/sim/types');

const canvasProbe = dom.window.document.createElement('canvas');
const device = await createGraphicsDevice(canvasProbe as any, { deviceTypes: ['null'] });
const els: any[] = [{ id: 'r', type: 'rect', x1: 1000, y1: 1000, x2: 9000, y2: 7000 }, { id: 'd', type: 'door', x1: 4550, y1: 7000, x2: 5450, y2: 7000 }, { id: 'w', type: 'window', x1: 1900, y1: 7000, x2: 3100, y2: 7000 }];
const picks: any[] = [];
const mk = (roof: any, extra: any = {}) => buildModel(els, { floors: 2, roof: { type: roof, pitch: 30, overhangMm: 600, ridge: 'auto', shedHigh: 'north' } });
const base = { colors: DEFAULT_COLORS, wireframe: false, shadows: true, grid: true, showRoof: true, hiddenLevels: [] as number[], sunAz: 140, sunEl: 48, ambient: 0.42, fly: false, selectedPartId: null, selectedSourceId: null, frameKey: 0, onPick: (p: any) => picks.push(p), graphicsDevice: device as any };
const root = createRoot(dom.window.document.getElementById('root')!);
const render = async (props: any) => { await act(async () => { root.render(React.createElement(SimView, { ...base, ...props })); }); await new Promise(r => setTimeout(r, 80)); };
let ok = true; const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); console.log('ok  ', name); } catch (e: any) { ok = false; console.log('FAIL', name, e?.stack?.split('\n').slice(0, 4).join(' | ')); } };

await step('mount with gable model', () => render({ model: mk('gable') }));
for (const r of ['hip', 'flat', 'shed']) await step(`rebuild: ${r} roof`, () => render({ model: mk(r) }));
await step('wireframe + hide roof + hide level + fly', () => render({ model: mk('gable'), wireframe: true, showRoof: false, hiddenLevels: [1], fly: true }));
await step('selection highlight (by source id)', () => render({ model: mk('gable'), selectedSourceId: 'd', selectedPartId: null }));
await step('sun / ambient / shadows off / frame', () => render({ model: mk('gable'), sunAz: 20, sunEl: 70, ambient: 0.2, shadows: false, frameKey: 3 }));
await step('colour change', () => render({ model: mk('gable'), colors: { ...DEFAULT_COLORS, wall: '#ff0000' } }));
await step('click picks a part (ray from camera)', async () => {
  await render({ model: mk('gable'), frameKey: 5 });
  await new Promise(r => setTimeout(r, 400));
  const canvas = dom.window.document.querySelector('canvas')!;
  picks.length = 0;
  for (const [x, y] of [[450, 300], [450, 350], [400, 280], [500, 330]]) {
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { button: 0, clientX: x, clientY: y, bubbles: true }));
    canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { button: 0, clientX: x, clientY: y, bubbles: true }));
  }
  console.log('     picks ->', picks.map(p => p ? p.name : null).join(' | '));
  if (!picks.some(Boolean)) throw new Error('no pick hit anything at the model centre');
});
await step('unmount / destroy', async () => { await act(async () => { root.unmount(); }); });
console.error = origErr;
const real = errors.filter(e => !/not wrapped in act|ReactDOMTestUtils/.test(e));
console.log('console.error count (excluding act warnings):', real.length); real.slice(0, 5).forEach(e => console.log('  ', e.slice(0, 300)));
console.log(ok && real.length === 0 ? 'HEADLESS SMOKE TEST PASSED' : 'HEADLESS SMOKE TEST HAD PROBLEMS');
process.exit(0);
