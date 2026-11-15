// utils/boq/ai.ts
// Reads architectural drawings with a Groq vision model and turns the answer into schedule rows.
// The model only READS what is printed on the drawing. Nothing it returns reaches the bill until the
// user has reviewed it in the Quantities step, and every value is sanity-checked first.

import { Assumptions, BoqModel, CeilingType, ColumnRow, FloorFinish, OpeningRow, RoofCovering, RoofType, WallRow } from './types';

// Two free routes. 'gemini' reads the page image directly (Google AI Studio free tier). 'groq-text' never sends an image:
// the page text is extracted in the browser (PDF text layer, or free in-browser OCR for scans) and a text model structures it.
export type Provider = 'gemini' | 'groq-text';
export const DEFAULT_MODEL: Record<Provider, string> = { gemini: 'gemini-3.1-flash-lite', 'groq-text': 'openai/gpt-oss-120b' };
const RETIRED_GROQ = /llama-4-scout|llama-4-maverick|llama-3\.2-.*vision|llama-3\.3-70b-versatile|llama-3\.1-8b-instant|qwen3-32b/i;
export function resolveModel(provider: Provider, m: string): string {
  const t = m.trim();
  if (!t) return DEFAULT_MODEL[provider];
  if (provider === 'groq-text' && (RETIRED_GROQ.test(t) || t.startsWith('gemini'))) return DEFAULT_MODEL[provider];
  if (provider === 'gemini' && !t.startsWith('gemini')) return DEFAULT_MODEL[provider];
  return t;
}
/** Ids from Groq's list that are not chat models (speech, guard, embeddings). */
export const isChatModelId = (id: string) => !/whisper|tts|orpheus|guard|safeguard|embed|compound/i.test(id);

export interface AiOpening { mark: string; widthMm: number; heightMm: number | null; count: number; external: boolean | null; description: string | null }
export interface AiExtraction {
  drawingType: string; scale: string | null;
  overall: { lengthM: number | null; widthM: number | null };
  walls: { kind: 'external' | 'internal'; lengthM: number; thicknessMm: number | null }[];
  doors: AiOpening[]; windows: AiOpening[];
  rooms: { name: string; lengthM: number | null; widthM: number | null; areaM2: number | null }[];
  heights: { floorHeightMm: number | null; plinthMm: number | null; foundationDepthMm: number | null };
  floors: number | null;
  roof: { type: RoofType | null; pitchDeg: number | null; covering: RoofCovering | null };
  columns: { label: string; bMm: number; dMm: number; count: number }[];
  stairs: number | null; ceiling: CeilingType | null; floorFinish: FloorFinish | null;
  specs: string[];
  warnings: string[];
}

export const EMPTY_EXTRACTION: AiExtraction = {
  drawingType: 'unknown', scale: null, overall: { lengthM: null, widthM: null }, walls: [], doors: [], windows: [], rooms: [],
  heights: { floorHeightMm: null, plinthMm: null, foundationDepthMm: null }, floors: null, specs: [], warnings: [],
  roof: { type: null, pitchDeg: null, covering: null }, columns: [], stairs: null, ceiling: null, floorFinish: null,
};

const SYSTEM = `You are a quantity surveyor's assistant that READS construction drawings. You never estimate or guess.
Only report a number if it is printed on the drawing (dimension strings, door/window schedules, room labels, notes) or can be read directly from a printed dimension chain.
If a value is not visible, use null. Do not invent marks, sizes or counts. Convert everything to the units requested.
Reply with ONE JSON object and nothing else.`;

const SCHEMA = `{
 "drawingType": "floor_plan | foundation_plan | elevation | section | roof_plan | schedule | other",
 "scale": "e.g. 1:100, or null",
 "floors": number of storeys shown or null,
 "overall": { "lengthM": overall external length in metres or null, "widthM": overall external width in metres or null },
 "walls": [ { "kind": "external | internal", "lengthM": number, "thicknessMm": number or null } ],
 "rooms": [ { "name": string, "lengthM": number or null, "widthM": number or null, "areaM2": number or null } ],
 "doors":   [ { "mark": "D1", "widthMm": number, "heightMm": number or null, "count": integer, "external": true | false | null, "description": string or null } ],
 "windows": [ { "mark": "W1", "widthMm": number, "heightMm": number or null, "count": integer, "external": true | false | null, "description": string or null } ],
 "heights": { "floorHeightMm": number or null, "plinthMm": number or null, "foundationDepthMm": number or null },
 "roof": { "type": "gable | hip | shed | flat | null", "pitchDeg": degrees printed on an elevation or section or null, "covering": "aluminium_sheet | concrete_tile | null" },
 "columns": [ { "label": "C1", "bMm": number, "dMm": number, "count": integer } ],
 "stairs": number of staircases shown or null,
 "ceiling": "pvc | plasterboard | none | null (only if a note or finishes schedule says so)",
 "floorFinish": "ceramic_tile | screed_only | none | null (only if a note or finishes schedule says so)",
 "specs": [ "short quotes of notes that affect quantities or pricing: concrete grade, block size, roof covering, finishes" ],
 "warnings": [ "anything unreadable, cropped, or contradictory" ]
}`;

export function buildPrompt(hint: string): string {
  return `Read this drawing and extract quantities for a bill of quantities.\n${hint ? `Context from the user: ${hint}\n` : ''}` +
    `Rules:\n- Dimensions in the drawing may be in mm or m: output metres for *M fields and millimetres for *Mm fields.\n` +
    `- For doors and windows, if there is a schedule use it (mark, size, count). Otherwise count the symbols on the plan and group them by size.\n` +
    `- List walls only if their lengths are dimensioned; otherwise leave "walls" empty and give "overall".\n` +
    `- Include every room label you can read.\nReturn exactly this JSON shape:\n${SCHEMA}`;
}

// ---------------------------------------------------------------- parsing and validation
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function extractJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error('The model did not return JSON.');
}

export function normalise(raw: unknown): AiExtraction {
  const r = (raw ?? {}) as Record<string, any>;
  const warnings: string[] = Array.isArray(r.warnings) ? r.warnings.map(str).filter(Boolean) : [];
  const opening = (o: any, kind: 'door' | 'window'): AiOpening | null => {
    let w = num(o?.widthMm), h = num(o?.heightMm);
    if (w === null) return null;
    if (w > 0 && w < 10) w *= 1000;                      // metres by mistake
    if (h !== null && h > 0 && h < 10) h *= 1000;
    const lo = kind === 'door' ? 600 : 400, hi = kind === 'door' ? 3600 : 4200;
    if (w < lo || w > hi) { warnings.push(`Ignored ${kind} ${str(o?.mark) || '?'}: width ${Math.round(w)}mm is outside the usual range.`); return null; }
    if (h !== null && (h < 300 || h > 3500)) { warnings.push(`${kind} ${str(o?.mark) || '?'}: height ${Math.round(h)}mm looks wrong, default used.`); h = null; }
    const count = Math.max(1, Math.round(num(o?.count) ?? 1));
    return { mark: str(o?.mark) || (kind === 'door' ? 'D?' : 'W?'), widthMm: Math.round(w), heightMm: h === null ? null : Math.round(h), count,
      external: typeof o?.external === 'boolean' ? o.external : null, description: str(o?.description) || null };
  };
  const list = (k: string) => (Array.isArray(r[k]) ? r[k] : []) as any[];
  const walls = list('walls').map(w => ({
    kind: (str(w?.kind).toLowerCase().startsWith('int') ? 'internal' : 'external') as 'internal' | 'external',
    lengthM: num(w?.lengthM) ?? 0, thicknessMm: num(w?.thicknessMm),
  })).filter(w => w.lengthM > 0.3 && w.lengthM < 200);
  const L = num(r.overall?.lengthM), B = num(r.overall?.widthM);
  const rt = str(r.roof?.type).toLowerCase(), rc = str(r.roof?.covering).toLowerCase(), pd = num(r.roof?.pitchDeg);
  const roof = {
    type: (/hip/.test(rt) ? 'hip' : /gable|pitch/.test(rt) ? 'gable' : /shed|mono|lean/.test(rt) ? 'shed' : /flat/.test(rt) ? 'flat' : null) as RoofType | null,
    pitchDeg: pd !== null && pd >= 3 && pd <= 60 ? pd : null,
    covering: (/tile/.test(rc) ? 'concrete_tile' : /alumin|sheet|zinc|iron|long/.test(rc) ? 'aluminium_sheet' : null) as RoofCovering | null,
  };
  const columns = (Array.isArray(r.columns) ? r.columns : []).map((c: any) => ({ label: str(c?.label) || 'C', bMm: num(c?.bMm) ?? 0, dMm: num(c?.dMm) ?? 0, count: Math.max(1, Math.round(num(c?.count) ?? 1)) }))
    .filter((c: { bMm: number; dMm: number; count: number }) => c.bMm >= 100 && c.bMm <= 1500 && c.dMm >= 100 && c.dMm <= 1500 && c.count <= 200);
  const st = num(r.stairs), cl = str(r.ceiling).toLowerCase(), ff = str(r.floorFinish).toLowerCase();
  const ex: AiExtraction = {
    drawingType: str(r.drawingType) || 'unknown', scale: str(r.scale) || null,
    floors: (() => { const f = num(r.floors); return f && f >= 1 && f <= 10 ? Math.round(f) : null; })(),
    overall: { lengthM: L && L > 1 && L < 300 ? L : null, widthM: B && B > 1 && B < 300 ? B : null },
    walls,
    rooms: list('rooms').map(x => ({ name: str(x?.name), lengthM: num(x?.lengthM), widthM: num(x?.widthM), areaM2: num(x?.areaM2) })).filter(x => x.name),
    doors: list('doors').map(o => opening(o, 'door')).filter((o): o is AiOpening => !!o),
    windows: list('windows').map(o => opening(o, 'window')).filter((o): o is AiOpening => !!o),
    heights: { floorHeightMm: num(r.heights?.floorHeightMm), plinthMm: num(r.heights?.plinthMm), foundationDepthMm: num(r.heights?.foundationDepthMm) },
    roof, columns, stairs: st !== null && st >= 0 && st <= 6 ? Math.round(st) : null,
    ceiling: /pvc/.test(cl) ? 'pvc' : /plaster/.test(cl) ? 'plasterboard' : /none|no ceiling/.test(cl) ? 'none' : null,
    floorFinish: /tile|ceramic|porcelain/.test(ff) ? 'ceramic_tile' : /screed|cement/.test(ff) ? 'screed_only' : /none/.test(ff) ? 'none' : null,
    specs: Array.isArray(r.specs) ? r.specs.map(str).filter(Boolean).slice(0, 20) : [],
    warnings,
  };
  const h = ex.heights;
  (['floorHeightMm', 'plinthMm', 'foundationDepthMm'] as const).forEach(k => {
    const v = h[k]; if (v !== null && v > 0 && v < 10) h[k] = v * 1000;
  });
  if (h.floorHeightMm !== null && (h.floorHeightMm < 2200 || h.floorHeightMm > 5000)) { ex.warnings.push(`Floor height ${h.floorHeightMm}mm ignored (outside 2.2 to 5.0m).`); h.floorHeightMm = null; }
  if (h.plinthMm !== null && (h.plinthMm < 0 || h.plinthMm > 1500)) { ex.warnings.push(`Plinth height ${h.plinthMm}mm ignored.`); h.plinthMm = null; }
  if (h.foundationDepthMm !== null && (h.foundationDepthMm < 300 || h.foundationDepthMm > 4000)) { ex.warnings.push(`Foundation depth ${h.foundationDepthMm}mm ignored.`); h.foundationDepthMm = null; }
  return ex;
}

/** Cross-checks between the pieces the model returned. Returns human-readable warnings. */
export function crossCheck(ex: AiExtraction): string[] {
  const w: string[] = [];
  const { lengthM: L, widthM: B } = ex.overall;
  if (L && B) {
    const roomSum = ex.rooms.reduce((s, r) => s + (r.areaM2 ?? (r.lengthM && r.widthM ? r.lengthM * r.widthM : 0)), 0);
    if (roomSum > 0 && (roomSum > L * B * 1.05 || roomSum < L * B * 0.45))
      w.push(`Room areas add up to ${roomSum.toFixed(1)} m2 but the overall size gives ${(L * B).toFixed(1)} m2. Check the rooms and the overall dimensions.`);
    const ext = ex.walls.filter(x => x.kind === 'external').reduce((s, x) => s + x.lengthM, 0);
    if (ext > 0 && Math.abs(ext - 2 * (L + B)) / (2 * (L + B)) > 0.15)
      w.push(`External wall lengths add up to ${ext.toFixed(1)} m but the overall size gives a perimeter of ${(2 * (L + B)).toFixed(1)} m.`);
  }
  if (!L && !B && ex.walls.length === 0 && ex.rooms.length === 0) w.push('No overall dimensions, walls or rooms were read. Try a higher resolution page or add a hint.');
  const openings = ex.doors.reduce((s, o) => s + o.count, 0) + ex.windows.reduce((s, o) => s + o.count, 0);
  if (openings > 80) w.push(`${openings} openings were read, which is unusually many. Check the counts.`);
  return w;
}

/** Merge results from several pages: schedules and plans often repeat the same marks, so take the larger count, not the sum. */
export function mergeExtractions(list: AiExtraction[]): AiExtraction {
  if (list.length === 0) return EMPTY_EXTRACTION;
  const out: AiExtraction = { ...EMPTY_EXTRACTION, overall: { lengthM: null, widthM: null }, heights: { ...EMPTY_EXTRACTION.heights }, walls: [], doors: [], windows: [], rooms: [], specs: [], warnings: [], roof: { ...EMPTY_EXTRACTION.roof }, columns: [] };
  const byMark = (a: AiOpening[], b: AiOpening[]) => {
    const map = new Map(a.map(o => [`${o.mark.toLowerCase()}|${o.widthMm}`, o]));
    b.forEach(o => { const k = `${o.mark.toLowerCase()}|${o.widthMm}`; const e = map.get(k);
      if (!e) map.set(k, o); else map.set(k, { ...e, count: Math.max(e.count, o.count), heightMm: e.heightMm ?? o.heightMm, external: e.external ?? o.external, description: e.description ?? o.description }); });
    return [...map.values()];
  };
  list.forEach(x => {
    out.drawingType = out.drawingType === 'unknown' ? x.drawingType : out.drawingType;
    out.scale = out.scale ?? x.scale; out.floors = out.floors ?? x.floors;
    out.overall.lengthM = out.overall.lengthM ?? x.overall.lengthM; out.overall.widthM = out.overall.widthM ?? x.overall.widthM;
    if (x.walls.length > out.walls.length) out.walls = x.walls;
    if (x.columns.length > out.columns.length) out.columns = x.columns;
    out.roof = { type: out.roof.type ?? x.roof.type, pitchDeg: out.roof.pitchDeg ?? x.roof.pitchDeg, covering: out.roof.covering ?? x.roof.covering };
    out.stairs = out.stairs ?? x.stairs; out.ceiling = out.ceiling ?? x.ceiling; out.floorFinish = out.floorFinish ?? x.floorFinish;
    out.doors = byMark(out.doors, x.doors); out.windows = byMark(out.windows, x.windows);
    const seen = new Set(out.rooms.map(r => r.name.toLowerCase()));
    x.rooms.forEach(r => { if (!seen.has(r.name.toLowerCase())) { out.rooms.push(r); seen.add(r.name.toLowerCase()); } });
    (Object.keys(out.heights) as (keyof AiExtraction['heights'])[]).forEach(k => { out.heights[k] = out.heights[k] ?? x.heights[k]; });
    out.specs.push(...x.specs.filter(s => !out.specs.includes(s))); out.warnings.push(...x.warnings);
  });
  out.warnings.push(...crossCheck(out));
  return out;
}

// ---------------------------------------------------------------- apply to the schedule
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function applyExtraction(ex: AiExtraction, model: BoqModel, a: Assumptions, mode: 'replace' | 'add'): { model: BoqModel; assumptions: Assumptions; summary: string[] } {
  const summary: string[] = [];
  const keep = <T extends { source: string }>(rows: T[]) => (mode === 'replace' ? rows.filter(r => r.source === 'manual') : rows);
  let walls: WallRow[] = keep(model.walls);
  let footprint = model.footprint;
  const t = model.walls.find(w => w.external)?.thicknessMm ?? 225;

  if (ex.walls.length) {
    const rows = ex.walls.map((w, i) => ({ id: uid(), label: `A${i + 1}`, lengthMm: Math.round(w.lengthM * 1000), thicknessMm: Math.round(w.thicknessMm ?? (w.kind === 'external' ? t : 150)),
      external: w.kind === 'external', source: 'ai' as const }));
    walls = [...walls, ...rows]; summary.push(`${rows.length} wall lengths`);
  } else if (ex.overall.lengthM && ex.overall.widthM) {
    const L = Math.round(ex.overall.lengthM * 1000 - t), B = Math.round(ex.overall.widthM * 1000 - t);   // external size to centre-line
    const rows = [L, B, L, B].map((len, i) => ({ id: uid(), label: `A${i + 1}`, lengthMm: len, thicknessMm: t, external: true, source: 'ai' as const }));
    walls = [...walls, ...rows]; summary.push('four external walls from the overall size');
  }
  if (ex.overall.lengthM && ex.overall.widthM) {
    const l = ex.overall.lengthM - t / 1000, b = ex.overall.widthM - t / 1000;
    footprint = { lengthM: Math.max(l, b), widthM: Math.min(l, b), areaM2: l * b, source: 'ai' }; summary.push(`footprint ${l.toFixed(2)} x ${b.toFixed(2)} m (centre-line)`);
  }
  const toRows = (list: AiOpening[], kind: 'door' | 'window'): OpeningRow[] => list.map(o => ({
    id: uid(), kind, mark: o.mark, description: o.description ?? (kind === 'window' ? 'Aluminium sliding window, glazed' : 'Flush door, hardwood frame'),
    widthMm: o.widthMm, heightMm: o.heightMm ?? (kind === 'door' ? 2100 : 1200), qty: o.count, external: o.external ?? (kind === 'window'), source: 'ai',
  }));
  const open = [...toRows(ex.doors, 'door'), ...toRows(ex.windows, 'window')];
  if (open.length) summary.push(`${open.length} door/window types`);

  const cols: ColumnRow[] = ex.columns.map((c, i) => ({ id: uid(), label: c.label || `C${i + 1}`, bMm: Math.round(c.bMm), dMm: Math.round(c.dMm), qty: c.count, source: 'ai' as const }));
  if (cols.length) summary.push(`${cols.reduce((n, c) => n + c.qty, 0)} columns`);
  const next: Assumptions = { ...a };
  if (ex.roof.type) { next.roofType = ex.roof.type; summary.push(`${ex.roof.type} roof`); }
  if (ex.roof.pitchDeg) next.roofPitch = Math.round(ex.roof.pitchDeg);
  if (ex.roof.covering) next.roofCovering = ex.roof.covering;
  if (ex.stairs !== null) next.stairCount = ex.stairs;
  if (ex.ceiling) next.ceiling = ex.ceiling;
  if (ex.floorFinish) next.floorFinish = ex.floorFinish;
  if (ex.floors) { next.floors = ex.floors; summary.push(`${ex.floors} storey(s)`); }
  if (ex.heights.floorHeightMm) next.floorHeight = Math.round(ex.heights.floorHeightMm);
  if (ex.heights.plinthMm !== null) next.plinthHeight = Math.round(ex.heights.plinthMm);
  if (ex.heights.foundationDepthMm) next.foundationDepth = Math.round(ex.heights.foundationDepthMm);
  if (ex.heights.floorHeightMm || ex.heights.plinthMm !== null || ex.heights.foundationDepthMm) summary.push('levels');

  return { model: { ...model, walls, footprint, openings: [...keep(model.openings), ...open], columns: [...keep(model.columns), ...cols] }, assumptions: next, summary };
}

// ---------------------------------------------------------------- provider calls
export const GROQ_BASE = 'https://api.groq.com/openai/v1';
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function send(name: string, url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try { res = await fetch(url, init); }
  catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(`Could not reach ${name}. Check your internet connection, any ad-blocker or firewall, and that the key is correct.`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { const j = JSON.parse(text); msg = j?.error?.message ?? text; } catch { /* keep raw */ }
    const err = new Error(res.status === 401 || res.status === 403 ? `${name} rejected the API key (${res.status}). Check the key and try again.`
      : res.status === 429 ? `${name} free-tier rate limit reached (429). Wait a minute and retry, or read fewer pages.`
      : `${name} error ${res.status}: ${msg.slice(0, 300)}`);
    (err as any).status = res.status; (err as any).detail = msg; throw err;
  }
  return JSON.parse(text);
}
const groqPost = (key: string, path: string, body: unknown, signal?: AbortSignal) =>
  send('api.groq.com', `${GROQ_BASE}${path}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });

export async function listGroqModels(apiKey: string): Promise<string[]> {
  const j = await send('api.groq.com', `${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  return (j.data as { id: string }[]).map(m => m.id).filter(isChatModelId).sort();
}
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const j = await send('Google AI', `${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  return (j.models as { name: string; supportedGenerationMethods?: string[] }[])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/image|tts|live|embed|veo|imagen|audio/i.test(m.name))
    .map(m => m.name.replace(/^models\//, '')).sort();
}

// ---- text route (Groq, no images): message content is always a plain string
export function buildTextPrompt(hint: string, pageText: string): string {
  return `Below is the text extracted from ONE page of a construction drawing (PDF text layer or OCR). Positions are lost, so it is a list of labels, dimension strings, schedule rows and notes.\n` +
    `Only use numbers that appear in this text. If the text does not contain a value, use null and add a warning. Do not invent door or window counts: count only marks or schedule rows that appear.\n` +
    `${hint ? `Context from the user: ${hint}\n` : ''}` +
    `Rules:\n- Dimensions may be in mm or m: output metres for *M fields and millimetres for *Mm fields.\n- If a door/window schedule is present, use its mark, size and quantity.\n- Include every room name that appears.\nReturn exactly this JSON shape:\n${SCHEMA}\n\n----- PAGE TEXT -----\n${pageText.slice(0, 24000)}`;
}

export async function analyseText(opts: { apiKey: string; model: string; pageText: string; hint: string; signal?: AbortSignal }): Promise<{ extraction: AiExtraction; raw: string; modelUsed: string }> {
  const model = resolveModel('groq-text', opts.model);
  const body: Record<string, unknown> = {
    model, temperature: 0, max_completion_tokens: 8000,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: buildTextPrompt(opts.hint, opts.pageText) }],
    response_format: { type: 'json_object' },
  };
  let json: any;
  try { json = await groqPost(opts.apiKey, '/chat/completions', body, opts.signal); }
  catch (e) {
    if ((e as any).status === 400 && /response_format|json_object|json mode/i.test(String((e as any).detail))) { delete body.response_format; json = await groqPost(opts.apiKey, '/chat/completions', body, opts.signal); }
    else if (/decommission|deprecat|no longer supported|not found|does not exist|model_not_found/i.test(String((e as any).detail ?? ''))) throw new Error(`Groq model "${model}" is not available on your account. Use "Check key and list models" and pick another text model.`);
    else throw e;
  }
  const raw: string = json?.choices?.[0]?.message?.content ?? '';
  if (!raw.trim()) throw new Error(`${model} returned an empty reply. Try again.`);
  const ex = normalise(extractJson(raw)); ex.warnings.push(...crossCheck(ex));
  return { extraction: ex, raw, modelUsed: model };
}

// ---- vision route (Gemini free tier)
export async function analyseGemini(opts: { apiKey: string; model: string; imageDataUrl: string; hint: string; signal?: AbortSignal }): Promise<{ extraction: AiExtraction; raw: string; modelUsed: string }> {
  const m = /^data:([^;]+);base64,(.*)$/.exec(opts.imageDataUrl); if (!m) throw new Error('Internal error: the page image was not a data URL.');
  const call = (model: string) => send('Google AI', `${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST', signal: opts.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(opts.hint) }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8000, responseMimeType: 'application/json' },
    }),
  });
  let model = resolveModel('gemini', opts.model), json: any;
  try { json = await call(model); }
  catch (e) {
    const st = (e as any).status;
    if (st !== 404 && st !== 400) throw e;
    // model name retired or renamed: pick the first current Flash model your key can use
    const list = await listGeminiModels(opts.apiKey);
    const alt = list.find(x => /flash-lite/.test(x) && !/preview|exp/.test(x)) ?? list.find(x => /flash/.test(x) && !/preview|exp/.test(x)) ?? list.find(x => /flash/.test(x));
    if (!alt || alt === model) throw e;
    model = alt; json = await call(model);
  }
  const raw: string = (json?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
  if (!raw.trim()) throw new Error(`Gemini returned no text (${json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'unknown reason'}).`);
  const ex = normalise(extractJson(raw)); ex.warnings.push(...crossCheck(ex));
  return { extraction: ex, raw, modelUsed: model };
}

/** Live check with the person's real key. */
export async function testProvider(provider: Provider, apiKey: string, model: string): Promise<{ ok: boolean; modelUsed: string; message: string }> {
  try {
    if (provider === 'groq-text') {
      const m = resolveModel(provider, model);
      const j = await groqPost(apiKey, '/chat/completions', { model: m, temperature: 0, max_completion_tokens: 500, messages: [{ role: 'user', content: 'Reply with only the number 4817.' }] });
      const out = String(j?.choices?.[0]?.message?.content ?? '');
      return out.includes('4817') ? { ok: true, modelUsed: m, message: `${m} works with your Groq key (text route).` } : { ok: false, modelUsed: m, message: `${m} replied "${out.slice(0, 60)}".` };
    }
    const c = document.createElement('canvas'); c.width = 320; c.height = 120;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 120); g.fillStyle = '#000'; g.font = 'bold 72px sans-serif'; g.fillText('4817', 40, 88);
    const body = (mm: string) => send('Google AI', `${GEMINI_BASE}/models/${mm}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'What number is written in this image? Digits only.' }, { inline_data: { mime_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] } }] }] }) });
    let m = resolveModel('gemini', model), j: any;
    try { j = await body(m); } catch (e) {
      if ((e as any).status !== 404 && (e as any).status !== 400) throw e;
      const list = await listGeminiModels(apiKey); const alt = list.find(x => /flash/.test(x) && !/preview|exp/.test(x)) ?? list.find(x => /flash/.test(x)); if (!alt) throw e; m = alt; j = await body(m);
    }
    const out = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
    return out.includes('4817') ? { ok: true, modelUsed: m, message: `${m} can read images with your Google key.` } : { ok: false, modelUsed: m, message: `${m} answered "${out.trim().slice(0, 60)}", not 4817.` };
  } catch (e) { return { ok: false, modelUsed: model, message: (e as Error).message }; }
}
