// utils/smm7Ai.ts
// Gemini helpers for the SMM7 module. Every function returns *proposals*; nothing is written
// into the bill of quantities until the user accepts it in the UI.
import { GoogleGenAI, Type } from '@google/genai';
import { BoQItem } from '../types';
import { SMM7_SECTIONS, UNITS } from './smm7Calc';

export interface AiConfig {
  apiKey: string;   // optional; falls back to GEMINI_API_KEY from .env.local
  model: string;
  currency: string;
  region: string;
}

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const hasEnvKey = (): boolean => {
  try { return !!process.env.GEMINI_API_KEY; } catch { return false; }
};

export interface AiItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
  rationale: string;
  needsInput: boolean; // true when the quantity could not be derived from what was supplied
}

export interface ReviewIssue {
  severity: 'info' | 'warn' | 'error';
  ref: string;
  message: string;
  suggestion: string;
}

export interface ReviewResult { issues: ReviewIssue[]; missing: AiItem[] }
export interface RateSuggestion { id: string; rate: number; note: string }
export interface TidySuggestion { id: string; before: string; after: string }

const SYSTEM = `You are a quantity surveyor's assistant working to the UK Standard Method of Measurement of Building Works, 7th edition (SMM7).
Rules:
- Use SMM7 work-section letters (${SMM7_SECTIONS.map(s => `${s.id} ${s.name}`).join('; ')}).
- Never invent quantities. A quantity must follow arithmetically from dimensions the user gave. If it cannot, set quantity to 0, needsInput to true and say what is missing in the rationale.
- Units must be one of: ${UNITS.join(', ')}.
- Keep descriptions in SMM7 style: item, then material/grade, then the classifying qualifiers, separated by semicolons.
- Your output is a draft for a qualified person to check. Be concise.`;

const clamp = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

const normUnit = (u: unknown): string => {
  const s = String(u ?? '').toLowerCase().replace(/\s/g, '').replace('²', '2').replace('³', '3');
  const map: Record<string, string> = { sqm: 'm2', 'm^2': 'm2', cum: 'm3', 'm^3': 'm3', no: 'nr', number: 'nr', each: 'nr', ea: 'nr', lm: 'm', tonne: 't', tonnes: 't', ls: 'sum' };
  const v = map[s] ?? s;
  return UNITS.includes(v) ? v : 'item';
};

const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const cleanItem = (x: any): AiItem => ({
  code: clamp(x?.code, 20),
  description: clamp(x?.description, 400),
  quantity: Math.max(0, Math.round(num(x?.quantity) * 100) / 100),
  unit: normUnit(x?.unit),
  rationale: clamp(x?.rationale, 300),
  needsInput: !!x?.needsInput || num(x?.quantity) <= 0,
});

const itemSchema = {
  type: Type.OBJECT,
  properties: {
    code: { type: Type.STRING, description: 'SMM7 style reference, e.g. F10.1.1' },
    description: { type: Type.STRING },
    quantity: { type: Type.NUMBER },
    unit: { type: Type.STRING },
    rationale: { type: Type.STRING, description: 'How the quantity was derived, or what is missing' },
    needsInput: { type: Type.BOOLEAN },
  },
  required: ['code', 'description', 'quantity', 'unit', 'rationale', 'needsInput'],
};

async function callJson<T>(cfg: AiConfig, user: string, schema: any): Promise<T> {
  const apiKey = cfg.apiKey || (hasEnvKey() ? process.env.GEMINI_API_KEY! : '');
  if (!apiKey) throw new Error('No Gemini API key. Add one in the AI settings, or set GEMINI_API_KEY in .env.local.');
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: cfg.model || DEFAULT_MODEL,
    contents: user,
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
  });
  const text = res.text;
  if (!text) throw new Error('The model returned an empty response.');
  try { return JSON.parse(text) as T; } catch { throw new Error('The model returned malformed JSON. Try again.'); }
}

const boqContext = (items: BoQItem[]) =>
  items.slice(0, 200).map(i => `${i.id} | ${i.code} | ${i.description} | ${i.quantity} ${i.unit} | rate ${i.rate ?? 'none'}`).join('\n');

/** Turn a plain-English description of the works (with dimensions) into draft BoQ items. */
export async function aiDraftItems(cfg: AiConfig, brief: string, existing: BoQItem[]): Promise<{ items: AiItem[]; assumptions: string[] }> {
  const prompt = `Draft bill-of-quantities items for this work. Only measure what is described.
Items already in the BoQ (do not duplicate them):
${boqContext(existing) || '(none)'}

WORK DESCRIPTION:
${brief}`;
  const r = await callJson<{ items?: any[]; assumptions?: any[] }>(cfg, prompt, {
    type: Type.OBJECT,
    properties: { items: { type: Type.ARRAY, items: itemSchema }, assumptions: { type: Type.ARRAY, items: { type: Type.STRING } } },
    required: ['items', 'assumptions'],
  });
  return {
    items: (r.items ?? []).slice(0, 40).map(cleanItem).filter(i => i.description),
    assumptions: (r.assumptions ?? []).slice(0, 15).map(a => clamp(a, 300)).filter(Boolean),
  };
}

/** Audit the BoQ for omissions, unit/classification mistakes and implausible quantities. */
export async function aiReview(cfg: AiConfig, items: BoQItem[]): Promise<ReviewResult> {
  const prompt = `Review this bill of quantities. Report: wrong units for the item type, descriptions missing a classifying qualifier, items filed under the wrong SMM7 section, duplicates, implausible quantities relative to each other (e.g. blockwork area vs trench length), and commonly associated items that look omitted. Reference issues by the item's code. Propose omitted items in "missing" (quantity 0 and needsInput true unless it follows from the quantities listed).

BOQ (id | code | description | quantity unit | rate):
${boqContext(items)}`;
  const r = await callJson<{ issues?: any[]; missing?: any[] }>(cfg, prompt, {
    type: Type.OBJECT,
    properties: {
      issues: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            severity: { type: Type.STRING, description: 'info, warn or error' },
            ref: { type: Type.STRING },
            message: { type: Type.STRING },
            suggestion: { type: Type.STRING },
          },
          required: ['severity', 'ref', 'message', 'suggestion'],
        },
      },
      missing: { type: Type.ARRAY, items: itemSchema },
    },
    required: ['issues', 'missing'],
  });
  return {
    issues: (r.issues ?? []).slice(0, 40).map(x => ({
      severity: (['info', 'warn', 'error'].includes(x?.severity) ? x.severity : 'info') as ReviewIssue['severity'],
      ref: clamp(x?.ref, 30), message: clamp(x?.message, 400), suggestion: clamp(x?.suggestion, 400),
    })).filter(x => x.message),
    missing: (r.missing ?? []).slice(0, 20).map(cleanItem).filter(i => i.description),
  };
}

/** Indicative unit rates. These are rough market guesses, not a priced estimate. */
export async function aiRates(cfg: AiConfig, items: BoQItem[]): Promise<RateSuggestion[]> {
  const targets = items.filter(i => !i.rate);
  if (!targets.length) return [];
  const prompt = `Suggest an indicative all-in unit rate (labour, plant, materials) in ${cfg.currency || 'GBP'} for construction in: ${cfg.region || 'unspecified region'}.
These are rough orders of magnitude for early-stage budgeting. If the region is unspecified or you are unsure, say so in the note and give your best estimate anyway. Return one entry per item id.

ITEMS:
${boqContext(targets)}`;
  const r = await callJson<{ rates?: any[] }>(cfg, prompt, {
    type: Type.OBJECT,
    properties: {
      rates: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, rate: { type: Type.NUMBER }, note: { type: Type.STRING } }, required: ['id', 'rate', 'note'] },
      },
    },
    required: ['rates'],
  });
  const ids = new Set(targets.map(t => t.id));
  return (r.rates ?? []).filter(x => ids.has(x?.id) && num(x.rate) > 0)
    .map(x => ({ id: String(x.id), rate: Math.round(num(x.rate) * 100) / 100, note: clamp(x.note, 200) }));
}

/** Rewrite descriptions into consistent SMM7 phrasing without changing their meaning. */
export async function aiTidy(cfg: AiConfig, items: BoQItem[]): Promise<TidySuggestion[]> {
  const prompt = `Rewrite each description in consistent SMM7 style. Keep every dimension, grade and material exactly as written; do not add facts. Return an entry only for descriptions you actually change.

ITEMS:
${boqContext(items)}`;
  const r = await callJson<{ items?: any[] }>(cfg, prompt, {
    type: Type.OBJECT,
    properties: { items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, description: { type: Type.STRING } }, required: ['id', 'description'] } } },
    required: ['items'],
  });
  const byId = new Map(items.map(i => [i.id, i]));
  return (r.items ?? []).map(x => ({ id: String(x?.id), before: byId.get(x?.id)?.description ?? '', after: clamp(x?.description, 400) }))
    .filter(x => byId.has(x.id) && x.after && x.after !== x.before);
}
