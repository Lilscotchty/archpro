// utils/boq/rates.ts
// Default rate library. These are PLACEHOLDER rates (GHS, indicative) so a first bill is not blank.
// They are not a price list: replace them with your own supplier / subcontract / market rates.

import { RateLibrary } from './types';

export const DEFAULT_RATES: RateLibrary = {
  'd20.strip':    { label: 'Strip topsoil, average depth stated', unit: 'm2', rate: 8 },
  'd20.excav':    { label: 'Excavate trenches / pits', unit: 'm3', rate: 65 },
  'd20.support':  { label: 'Earthwork support to faces', unit: 'm2', rate: 35 },
  'd20.compact':  { label: 'Compact bottoms / surfaces', unit: 'm2', rate: 6 },
  'd20.backfill': { label: 'Return, fill and ram selected excavated material', unit: 'm3', rate: 40 },
  'd20.disposal': { label: 'Dispose of excavated material', unit: 'm3', rate: 55 },
  'd20.fill':     { label: 'Imported selected fill, compacted', unit: 'm3', rate: 140 },
  'd20.hardcore': { label: 'Hardcore, blinded and compacted', unit: 'm3', rate: 260 },
  'd20.sand':     { label: 'Sand blinding (per 50mm)', unit: 'm2', rate: 22 },
  'd20.termite':  { label: 'Anti-termite soil treatment', unit: 'm2', rate: 14 },
  'e10.blind':    { label: 'Concrete blinding C10', unit: 'm3', rate: 1500 },
  'e10.footing':  { label: 'Concrete foundations', unit: 'm3', rate: 2100 },
  'e10.slab':     { label: 'Concrete ground slab', unit: 'm3', rate: 2300 },
  'e10.struct':   { label: 'Structural concrete (columns, beams, lintels, suspended slabs)', unit: 'm3', rate: 2600 },
  'e20.form':     { label: 'Formwork, plain finish', unit: 'm2', rate: 110 },
  'e30.bar':      { label: 'Reinforcement bars (supply, cut, bend, fix)', unit: 't', rate: 14500 },
  'e30.mesh':     { label: 'Fabric reinforcement', unit: 'm2', rate: 55 },
  'f10.b100':     { label: '100mm block walling', unit: 'm2', rate: 120 },
  'f10.b150':     { label: '150mm block walling', unit: 'm2', rate: 165 },
  'f10.b225':     { label: '225mm block walling', unit: 'm2', rate: 230 },
  'f30.dpc':      { label: 'Damp proof course', unit: 'm', rate: 14 },
  'g20.truss':    { label: 'Timber roof truss (per metre of span)', unit: 'm span', rate: 380 },
  'g20.purlin':   { label: 'Timber purlins / battens', unit: 'm', rate: 28 },
  'g20.plate':    { label: 'Timber wall plate, bolted', unit: 'm', rate: 22 },
  'h31.sheet':    { label: 'Aluminium long-span roof sheeting', unit: 'm2', rate: 210 },
  'h31.ridge':    { label: 'Ridge / hip capping, metal', unit: 'm', rate: 75 },
  'h60.tile':     { label: 'Concrete roof tiles on battens', unit: 'm2', rate: 260 },
  'h60.ridge':    { label: 'Ridge / hip tiles, bedded', unit: 'm', rate: 90 },
  'p20.fascia':   { label: 'Fascia / barge board, primed', unit: 'm', rate: 70 },
  'p20.skirting': { label: 'Skirting', unit: 'm', rate: 28 },
  'r10.gutter':   { label: 'Rainwater gutter', unit: 'm', rate: 65 },
  'r10.pipe':     { label: 'Rainwater downpipe', unit: 'm', rate: 55 },
  'r10.outlet':   { label: 'Rainwater outlet / shoe', unit: 'nr', rate: 120 },
  'j40.dpm':      { label: 'Polythene DPM, 1000 gauge', unit: 'm2', rate: 18 },
  'j40.roof':     { label: 'Bituminous roof membrane', unit: 'm2', rate: 120 },
  'k10.pb':       { label: 'Plasterboard ceiling on brandering', unit: 'm2', rate: 95 },
  'k13.pvc':      { label: 'PVC ceiling panels', unit: 'm2', rate: 80 },
  'l10.window':   { label: 'Window, complete with glazing (per m2 of opening)', unit: 'm2', rate: 1100 },
  'l20.door.ext': { label: 'External door, complete (per m2 of leaf)', unit: 'm2', rate: 1400 },
  'l20.door.int': { label: 'Internal door, complete (per m2 of leaf)', unit: 'm2', rate: 900 },
  'l30.stair':    { label: 'Staircase, complete', unit: 'nr', rate: 18000 },
  'm10.screed':   { label: 'Cement:sand screed, 40mm', unit: 'm2', rate: 38 },
  'm20.int':      { label: 'Internal cement:sand render, 15mm', unit: 'm2', rate: 40 },
  'm20.ext':      { label: 'External cement:sand render, 20mm', unit: 'm2', rate: 48 },
  'm40.floor':    { label: 'Ceramic floor tiling', unit: 'm2', rate: 150 },
  'm40.wall':     { label: 'Ceramic wall tiling', unit: 'm2', rate: 170 },
  'm60.int':      { label: 'Emulsion paint, 1 sealer + 2 coats', unit: 'm2', rate: 18 },
  'm60.ext':      { label: 'Masonry paint, 1 sealer + 2 coats', unit: 'm2', rate: 24 },
  'ps.electrical':{ label: 'Electrical installation allowance (per m2 GFA)', unit: 'm2 GFA', rate: 260 },
  'ps.plumbing':  { label: 'Plumbing and sanitary allowance (per m2 GFA)', unit: 'm2 GFA', rate: 180 },
  'ps.drainage':  { label: 'Drainage below ground, septic tank, soakaway (per m2 GFA)', unit: 'm2 GFA', rate: 90 },
  'ps.external':  { label: 'External works allowance (per m2 GFA)', unit: 'm2 GFA', rate: 120 },
};

export const blockRateKey = (thicknessMm: number) =>
  thicknessMm <= 125 ? 'f10.b100' : thicknessMm <= 190 ? 'f10.b150' : 'f10.b225';

// ---------------------------------------------------------------- CSV import / export of the rate library
const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export const today = () => new Date().toISOString().slice(0, 10);

export function ratesToCsv(rates: RateLibrary): string {
  const rows = [['key', 'item', 'unit', 'rate', 'source', 'updated'], ...Object.keys(rates).sort().map(k => [k, rates[k].label, rates[k].unit, rates[k].rate, rates[k].source ?? '', rates[k].updated ?? ''])];
  return rows.map(r => r.map(q).join(',')).join('\n');
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', inQ = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) out.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) out.push(row);
  return out;
}

/** Update the library from a CSV with columns key (or item), rate and optionally source, updated. Unknown keys are reported, never invented. */
export function importRatesCsv(lib: RateLibrary, text: string, defaultSource: string): { rates: RateLibrary; applied: number; skipped: string[] } {
  const rows = parseCsv(text); if (rows.length < 2) throw new Error('The file has no rows.');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...n: string[]) => head.findIndex(h => n.includes(h));
  const iKey = col('key', 'code'), iItem = col('item', 'label', 'description'), iRate = col('rate', 'price', 'amount'), iSrc = col('source', 'supplier'), iUpd = col('updated', 'date');
  if (iRate < 0 || (iKey < 0 && iItem < 0)) throw new Error('Needs a "rate" column and a "key" (or "item") column. Export the current rates to see the layout.');
  const next: RateLibrary = { ...lib }; const skipped: string[] = []; let applied = 0;
  const byLabel = new Map(Object.entries(lib).map(([k, v]) => [v.label.toLowerCase(), k]));
  for (const r of rows.slice(1)) {
    const key = (iKey >= 0 && lib[r[iKey]?.trim()] ? r[iKey].trim() : undefined) ?? (iItem >= 0 ? byLabel.get(r[iItem]?.trim().toLowerCase()) : undefined);
    const rate = parseFloat(String(r[iRate] ?? '').replace(/[^0-9.\-]/g, ''));
    if (!key || !Number.isFinite(rate) || rate < 0) { skipped.push((iKey >= 0 ? r[iKey] : r[iItem]) || '(blank)'); continue; }
    const hasDate = iUpd >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(r[iUpd]?.trim() ?? '');
    if (rate === lib[key].rate && !hasDate && !lib[key].updated) continue;   // unchanged placeholder: do not mark it as a real price
    const upd = iUpd >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(r[iUpd]?.trim() ?? '') ? r[iUpd].trim() : today();
    next[key] = { ...next[key], rate, updated: upd, source: (iSrc >= 0 && r[iSrc]?.trim()) || defaultSource }; applied++;
  }
  return { rates: next, applied, skipped };
}
