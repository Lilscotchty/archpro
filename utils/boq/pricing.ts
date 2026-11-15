// utils/boq/pricing.ts — price the take-off lines and build the final summary (abstract).

import { BoqLine, CustomLine, LineOverride, Markups, RateLibrary, SECTIONS } from './types';

export interface PricedLine extends BoqLine {
  rate: number; amount: number; overridden: boolean; custom?: boolean; omitted: boolean; autoQty: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function priceLines(lines: BoqLine[], rates: RateLibrary, ov: Record<string, LineOverride>, customs: CustomLine[]): PricedLine[] {
  const out: PricedLine[] = lines.map(l => {
    const o = ov[l.key] ?? {};
    const lib = rates[l.rateKey]?.rate ?? 0;
    const qty = o.qty ?? l.qty;
    const rate = o.rate ?? r2(lib * l.rateMul);
    const omitted = !!o.omit;
    return { ...l, qty, autoQty: l.qty, rate, amount: omitted ? 0 : r2(qty * rate), overridden: o.qty !== undefined || o.rate !== undefined, omitted };
  });
  customs.forEach(c => out.push({
    key: c.id, section: c.section, description: c.description, qty: c.qty, unit: c.unit, rateKey: '', rateMul: 1, calc: 'manual item', basis: 'measured',
    rate: c.rate, amount: r2(c.qty * c.rate), overridden: false, custom: true, omitted: false, autoQty: c.qty,
  }));
  return out;
}

export interface SectionTotal { code: string; title: string; lines: PricedLine[]; total: number }
export interface Summary {
  sections: SectionTotal[]; net: number; prelims: number; ohp: number; contingency: number; subtotal: number; tax: number; grand: number; perM2: number;
}

export function summarize(lines: PricedLine[], mk: Markups, gfaM2: number): Summary {
  const sections: SectionTotal[] = SECTIONS.map(s => {
    const ls = lines.filter(l => l.section === s.code);
    return { code: s.code, title: s.title, lines: ls, total: r2(ls.reduce((x, l) => x + l.amount, 0)) };
  }).filter(s => s.lines.length > 0);
  const net = r2(sections.reduce((x, s) => x + s.total, 0));
  const prelims = r2(net * mk.prelimsPct / 100);
  const ohp = r2((net + prelims) * mk.ohpPct / 100);
  const contingency = r2((net + prelims + ohp) * mk.contingencyPct / 100);
  const subtotal = r2(net + prelims + ohp + contingency);
  const tax = r2(subtotal * mk.taxPct / 100);
  const grand = r2(subtotal + tax);
  return { sections, net, prelims, ohp, contingency, subtotal, tax, grand, perM2: gfaM2 > 0 ? r2(grand / gfaM2) : 0 };
}

/** Lines still priced with an unsourced placeholder rate (no dated rate in the library and no rate typed on the line). */
export function placeholderStats(lines: PricedLine[], rates: RateLibrary, ov: Record<string, LineOverride>) {
  const live = lines.filter(l => !l.custom && !l.omitted && l.amount > 0);
  const ph = live.filter(l => ov[l.key]?.rate === undefined && !rates[l.rateKey]?.updated);
  const amount = ph.reduce((x, l) => x + l.amount, 0), all = live.reduce((x, l) => x + l.amount, 0);
  return { count: ph.length, of: live.length, amount: r2(amount), share: all > 0 ? amount / all : 0 };
}
export function rateWarning(st: ReturnType<typeof placeholderStats>): string {
  return st.count === 0 ? '' : `${st.count} of ${st.of} priced items (${Math.round(st.share * 100)}% of the net works) still use placeholder rates that are not real prices. Enter your own rates in the Rates step (or import a CSV) before using this total.`;
}
