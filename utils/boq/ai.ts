// utils/boq/ai.ts
// Reads architectural drawings with a Groq vision model and turns the answer into schedule rows.
// The model only READS what is printed on the drawing. Nothing it returns reaches the bill until the
// user has reviewed it on the Schedule tab, and every value is sanity-checked first.

import { Assumptions, BoqModel, OpeningRow, WallRow } from './types';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
// Groq retired Llama 4 Scout (17 Jul 2026) and Maverick (9 Mar 2026). Qwen 3.6 27B is Groq's recommended replacement and
// accepts images (max 3 per request, 20 MB). Models are tried in this order if the chosen one cannot read images.
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.6-27b';
export const VISION_FALLBACKS = ['qwen/qwen3.6-27b'];
const RETIRED_MODELS = /llama-4-scout|llama-4-maverick|llama-3\.2-.*vision/i;
/** Map a stored or typed model id to one that can still read images. */
export function resolveModel(m: string): string { return !m.trim() || RETIRED_MODELS.test(m) ? DEFAULT_GROQ_MODEL : m.trim(); }
/** Ids from Groq's list that are not chat/vision models (speech, guard, embeddings). */
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
  specs: string[];
  warnings: string[];
}

export const EMPTY_EXTRACTION: AiExtraction = {
  drawingType: 'unknown', scale: null, overall: { lengthM: null, widthM: null }, walls: [], doors: [], windows: [], rooms: [],
  heights: { floorHeightMm: null, plinthMm: null, foundationDepthMm: null }, floors: null, specs: [], warnings: [],
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
  const ex: AiExtraction = {
    drawingType: str(r.drawingType) || 'unknown', scale: str(r.scale) || null,
    floors: (() => { const f = num(r.floors); return f && f >= 1 && f <= 10 ? Math.round(f) : null; })(),
    overall: { lengthM: L && L > 1 && L < 300 ? L : null, widthM: B && B > 1 && B < 300 ? B : null },
    walls,
    rooms: list('rooms').map(x => ({ name: str(x?.name), lengthM: num(x?.lengthM), widthM: num(x?.widthM), areaM2: num(x?.areaM2) })).filter(x => x.name),
    doors: list('doors').map(o => opening(o, 'door')).filter((o): o is AiOpening => !!o),
    windows: list('windows').map(o => opening(o, 'window')).filter((o): o is AiOpening => !!o),
    heights: { floorHeightMm: num(r.heights?.floorHeightMm), plinthMm: num(r.heights?.plinthMm), foundationDepthMm: num(r.heights?.foundationDepthMm) },
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
  const out: AiExtraction = { ...EMPTY_EXTRACTION, overall: { lengthM: null, widthM: null }, heights: { ...EMPTY_EXTRACTION.heights }, walls: [], doors: [], windows: [], rooms: [], specs: [], warnings: [] };
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

  const next: Assumptions = { ...a };
  if (ex.floors) { next.floors = ex.floors; summary.push(`${ex.floors} storey(s)`); }
  if (ex.heights.floorHeightMm) next.floorHeight = Math.round(ex.heights.floorHeightMm);
  if (ex.heights.plinthMm !== null) next.plinthHeight = Math.round(ex.heights.plinthMm);
  if (ex.heights.foundationDepthMm) next.foundationDepth = Math.round(ex.heights.foundationDepthMm);
  if (ex.heights.floorHeightMm || ex.heights.plinthMm !== null || ex.heights.foundationDepthMm) summary.push('levels');

  return { model: { ...model, walls, footprint, openings: [...keep(model.openings), ...open] }, assumptions: next, summary };
}

// ---------------------------------------------------------------- Groq calls
async function post(url: string, apiKey: string, body: unknown, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Could not reach api.groq.com. Check your internet connection, any ad-blocker or firewall, and that the key is correct.');
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { msg = JSON.parse(text)?.error?.message ?? text; } catch { /* keep raw */ }
    const err = new Error(res.status === 401 ? 'Groq rejected the API key (401). Check the key and try again.'
      : res.status === 429 ? 'Groq rate limit reached (429). Wait a minute and retry, or analyse fewer pages.'
      : `Groq error ${res.status}: ${msg.slice(0, 300)}`);
    (err as any).status = res.status; (err as any).detail = msg; throw err;
  }
  return JSON.parse(text);
}

export async function listGroqModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(res.status === 401 ? 'Groq rejected the API key (401).' : `Could not list models (${res.status}).`);
  const j = await res.json();
  return (j.data as { id: string }[]).map(m => m.id).filter(isChatModelId).sort();
}

const NOT_VISION = /must be a string|image|vision|multimodal|content.*(array|string)/i;
const GONE = /decommission|deprecat|no longer supported|not found|does not exist|model_not_found/i;

export async function analyseDrawing(opts: { apiKey: string; model: string; imageDataUrl: string; hint: string; signal?: AbortSignal }): Promise<{ extraction: AiExtraction; raw: string; modelUsed: string }> {
  const first = resolveModel(opts.model);
  const candidates = [first, ...VISION_FALLBACKS.filter(m => m !== first)];
  let lastErr: unknown;
  for (const model of candidates) {
    const body: Record<string, unknown> = {
      model, temperature: 0, max_completion_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: [{ type: 'text', text: buildPrompt(opts.hint) }, { type: 'image_url', image_url: { url: opts.imageDataUrl } }] },
      ],
      response_format: { type: 'json_object' },
    };
    try {
      let json: any;
      try { json = await post(`${GROQ_BASE}/chat/completions`, opts.apiKey, body, opts.signal); }
      catch (e) {
        // some models reject JSON mode together with images: retry once in plain mode
        const d = String((e as any).detail);
        if ((e as any).status === 400 && /response_format|json_object|json mode/i.test(d) && !/must be a string/i.test(d)) {
          delete body.response_format; json = await post(`${GROQ_BASE}/chat/completions`, opts.apiKey, body, opts.signal);
        } else throw e;
      }
      const raw: string = json?.choices?.[0]?.message?.content ?? '';
      if (!raw.trim()) throw new Error(`${model} returned an empty reply (it may have used its whole token budget thinking). Try again or use a smaller page.`);
      const ex = normalise(extractJson(raw));
      ex.warnings.push(...crossCheck(ex));
      return { extraction: ex, raw, modelUsed: model };
    } catch (e) {
      lastErr = e;
      const status = (e as any).status, d = String((e as any).detail ?? (e as Error).message);
      const modelProblem = (status === 400 && NOT_VISION.test(d)) || ((status === 400 || status === 404) && GONE.test(d));
      if (!modelProblem || model === candidates[candidates.length - 1]) {
        if (modelProblem) throw new Error(`"${model}" cannot read images on your Groq account (${d.slice(0, 160)}). Choose a vision model such as ${DEFAULT_GROQ_MODEL} in the Model box.`);
        throw e;
      }
      // otherwise fall through to the next vision-capable candidate
    }
  }
  throw lastErr;
}

/** Live check with the person's real key: draws a small image containing a number and asks the model to read it back. */
export async function testVision(apiKey: string, model: string): Promise<{ ok: boolean; modelUsed: string; message: string }> {
  const c = document.createElement('canvas'); c.width = 320; c.height = 120;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 120); g.fillStyle = '#000'; g.font = 'bold 72px sans-serif'; g.fillText('4817', 40, 88);
  const url = c.toDataURL('image/jpeg', 0.9);
  const candidates = [resolveModel(model), ...VISION_FALLBACKS].filter((m, i, a) => a.indexOf(m) === i);
  let last = '';
  for (const m of candidates) {
    try {
      const json = await post(`${GROQ_BASE}/chat/completions`, apiKey, { model: m, temperature: 0, max_completion_tokens: 2000,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'What number is written in this image? Reply with the digits only.' }, { type: 'image_url', image_url: { url } }] }] });
      const out = String(json?.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
      return out.includes('4817') ? { ok: true, modelUsed: m, message: `${m} can read images with your key.` } : { ok: false, modelUsed: m, message: `${m} answered "${out.trim().slice(0, 60)}", not 4817. It is not reading images reliably.` };
    } catch (e) { last = (e as Error).message; }
  }
  return { ok: false, modelUsed: candidates[0], message: last };
}
