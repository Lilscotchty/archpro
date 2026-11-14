// utils/smm7Calc.ts
// Pure helpers for the SMM7 workbook: dimension-sheet maths, pricing totals, CSV export.
import { BoQItem } from '../types';

export interface Smm7Section { id: string; name: string }

export const SMM7_SECTIONS: Smm7Section[] = [
  { id: 'A', name: 'Preliminaries / general conditions' },
  { id: 'C', name: 'Demolition / alteration / renovation' },
  { id: 'D', name: 'Groundwork' },
  { id: 'E', name: 'In situ concrete / large precast concrete' },
  { id: 'F', name: 'Masonry' },
  { id: 'G', name: 'Structural / carcassing in metal or timber' },
  { id: 'H', name: 'Cladding / covering' },
  { id: 'J', name: 'Waterproofing' },
  { id: 'K', name: 'Linings / sheathing / dry partitioning' },
  { id: 'L', name: 'Windows / doors / stairs' },
  { id: 'M', name: 'Surface finishes' },
  { id: 'N', name: 'Furniture / equipment' },
  { id: 'P', name: 'Building fabric sundries' },
  { id: 'Q', name: 'Paving / planting / fencing / site furniture' },
  { id: 'R', name: 'Disposal systems' },
  { id: 'S', name: 'Piped supply systems' },
  { id: 'T', name: 'Mechanical heating / cooling / refrigeration' },
  { id: 'U', name: 'Ventilation / air conditioning' },
  { id: 'V', name: 'Electrical supply / power / lighting' },
  { id: 'W', name: 'Communications / security / control' },
  { id: 'X', name: 'Transport systems' },
  { id: 'Z', name: 'Other / unclassified' },
];

export const UNITS = ['m', 'm2', 'm3', 'nr', 'kg', 't', 'item', 'sum', 'hr'];

export const uid = () => Math.random().toString(36).slice(2, 9);

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const sectionOf = (item: Pick<BoQItem, 'code'>): string => {
  const m = /^[A-Za-z]/.exec((item.code || '').trim());
  const id = m ? m[0].toUpperCase() : 'Z';
  return SMM7_SECTIONS.some(s => s.id === id) ? id : 'Z';
};

// ---------------------------------------------------------------- dimension sheet

export interface DimRow {
  id: string;
  note: string;
  nr: number;     // number of times
  l: number;      // length (0 = not used)
  b: number;      // breadth / width (0 = not used)
  h: number;      // height / depth / thickness (0 = not used)
  deduct: boolean;
}

export interface TakeoffGroup {
  id: string;
  code: string;
  description: string;
  unit: string;
  rows: DimRow[];
}

export const newRow = (): DimRow => ({ id: uid(), note: '', nr: 1, l: 0, b: 0, h: 0, deduct: false });

export const newGroup = (): TakeoffGroup => ({
  id: uid(), code: 'D20.2.1', description: '', unit: 'm3', rows: [newRow()],
});

/** Times-and-multiply: nr x every dimension that is entered (non-zero). Deductions are negative. */
export const rowQty = (r: DimRow): number => {
  const dims = [r.l, r.b, r.h].filter(v => v > 0);
  const q = r.nr * dims.reduce((a, v) => a * v, 1);
  return r.deduct ? -q : q;
};

export const groupTotal = (g: TakeoffGroup): number => round2(g.rows.reduce((a, r) => a + rowQty(r), 0));

// ---------------------------------------------------------------- pricing

export interface Fin {
  currency: string;
  prelimsPct: number;
  contingencyPct: number;
  ohpPct: number;
}

export const DEFAULT_FIN: Fin = { currency: 'GBP', prelimsPct: 0, contingencyPct: 0, ohpPct: 0 };

export const lineAmount = (i: BoQItem) => round2((i.quantity || 0) * (i.rate || 0));

export interface Summary {
  bySection: { id: string; name: string; count: number; amount: number }[];
  subtotal: number;
  prelims: number;
  contingency: number;
  ohp: number;
  total: number;
}

/** Preliminaries on the subtotal, contingency on (subtotal + prelims), OH&P on everything before it. */
export const summarise = (items: BoQItem[], fin: Fin): Summary => {
  const bySection = SMM7_SECTIONS.map(s => {
    const mine = items.filter(i => sectionOf(i) === s.id);
    return { id: s.id, name: s.name, count: mine.length, amount: round2(mine.reduce((a, i) => a + lineAmount(i), 0)) };
  }).filter(s => s.count > 0);
  const subtotal = round2(bySection.reduce((a, s) => a + s.amount, 0));
  const prelims = round2(subtotal * fin.prelimsPct / 100);
  const contingency = round2((subtotal + prelims) * fin.contingencyPct / 100);
  const ohp = round2((subtotal + prelims + contingency) * fin.ohpPct / 100);
  return { bySection, subtotal, prelims, contingency, ohp, total: round2(subtotal + prelims + contingency + ohp) };
};

// ---------------------------------------------------------------- export

// Text cells that start with = + - @ are neutralised so spreadsheets never treat them as formulas.
const cell = (s: string) => {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const toCSV = (items: BoQItem[], fin: Fin): string => {
  const head = `Ref,Section,Description,Quantity,Unit,Rate (${fin.currency}),Amount (${fin.currency})`;
  const rows = items.map(i =>
    [cell(i.code), cell(sectionOf(i)), cell(i.description), i.quantity, cell(i.unit), i.rate ?? '', i.rate ? lineAmount(i) : ''].join(','));
  const s = summarise(items, fin);
  const tail = [
    '', `${cell('Subtotal')},,,,,,${s.subtotal}`,
    `${cell(`Preliminaries ${fin.prelimsPct}%`)},,,,,,${s.prelims}`,
    `${cell(`Contingency ${fin.contingencyPct}%`)},,,,,,${s.contingency}`,
    `${cell(`Overheads & profit ${fin.ohpPct}%`)},,,,,,${s.ohp}`,
    `${cell('Total')},,,,,,${s.total}`,
  ];
  return [head, ...rows, ...tail].join('\n');
};
