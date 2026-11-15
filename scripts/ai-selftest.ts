// Offline test of the Groq drawing reader: simulates the "content must be a string" 400 and a retired model.
import { analyseDrawing, resolveModel, DEFAULT_GROQ_MODEL, extractJson } from '../utils/boq/ai';
const ok = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok  ', m); };
const good = { drawingType: 'floor_plan', overall: { lengthM: 12, widthM: 9 }, doors: [{ mark: 'D1', widthMm: 900, heightMm: 2100, count: 4 }], windows: [{ mark: 'W1', widthMm: 1200, heightMm: 1200, count: 6 }], rooms: [{ name: 'Living', areaM2: 24 }] };
const calls: string[] = [];
(globalThis as any).fetch = async (_u: string, init: any) => {
  const b = JSON.parse(init.body); calls.push(b.model);
  if (b.model !== 'qwen/qwen3.6-27b') return new Response(JSON.stringify({ error: { message: "'messages.1.content' : value must be a string" } }), { status: 400 });
  return new Response(JSON.stringify({ choices: [{ message: { content: '<think>reading…</think>```json\n' + JSON.stringify(good) + '\n```' } }] }), { status: 200 });
};
(async () => {
  ok(resolveModel('meta-llama/llama-4-scout-17b-16e-instruct') === DEFAULT_GROQ_MODEL, 'retired Scout id is migrated');
  ok(resolveModel('') === DEFAULT_GROQ_MODEL, 'empty model uses default');
  ok((extractJson('<think>x</think>{"a":1}') as any).a === 1, 'reasoning block stripped before JSON parse');
  const r = await analyseDrawing({ apiKey: 'k', model: 'llama-3.3-70b-versatile', imageDataUrl: 'data:image/jpeg;base64,AAAA', hint: '' });
  ok(calls.join() === 'llama-3.3-70b-versatile,qwen/qwen3.6-27b', 'text-only model 400 falls back to the vision model: ' + calls.join(' -> '));
  ok(r.modelUsed === 'qwen/qwen3.6-27b' && r.extraction.doors[0].count === 4 && r.extraction.windows[0].count === 6, 'drawing data parsed after fallback');
  console.log('ALL PASSED');
})();
