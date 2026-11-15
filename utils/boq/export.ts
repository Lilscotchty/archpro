// utils/boq/export.ts — CSV and print-ready bill of quantities.

import { Summary } from './pricing';
import { Assumptions, Markups } from './types';
import { scopeNotes } from './takeoff';

const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
const money = (n: number, cur: string) => `${cur} ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const refOf = (code: string, i: number) => `${code}/${i + 1}`;
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function billCsv(s: Summary, mk: Markups, a: Assumptions, note = ''): string {
  const rows: (string | number)[][] = [['Project', a.projectName], ['Location', a.location], ['Currency', a.currency], ...(note ? [['NOTE', note]] : []), [],
    ['Ref', 'Description', 'Quantity', 'Unit', 'Rate', 'Amount', 'Basis', 'Workings']];
  s.sections.forEach(sec => {
    rows.push([sec.code, sec.title.toUpperCase()]);
    sec.lines.filter(l => !l.omitted).forEach((l, i) => rows.push([refOf(sec.code, i), l.description, l.qty, l.unit, l.rate.toFixed(2), l.amount.toFixed(2), l.basis, l.calc]));
    rows.push(['', `Total ${sec.code}`, '', '', '', sec.total.toFixed(2)], []);
  });
  rows.push(['', 'Net measured works', '', '', '', s.net.toFixed(2)],
    ['', `Preliminaries ${mk.prelimsPct}%`, '', '', '', s.prelims.toFixed(2)],
    ['', `Overheads and profit ${mk.ohpPct}%`, '', '', '', s.ohp.toFixed(2)],
    ['', `Contingency ${mk.contingencyPct}%`, '', '', '', s.contingency.toFixed(2)],
    ['', 'Sub-total', '', '', '', s.subtotal.toFixed(2)],
    ['', `Taxes and levies ${mk.taxPct}%`, '', '', '', s.tax.toFixed(2)],
    ['', 'TENDER TOTAL', '', '', '', s.grand.toFixed(2)]);
  return rows.map(r => r.map(esc).join(',')).join('\n');
}

export function printBill(s: Summary, mk: Markups, a: Assumptions, gfa: number, note = '') {
  const cur = a.currency;
  const body = s.sections.map(sec => `
    <h2>${html(sec.code)} &nbsp; ${html(sec.title)}</h2>
    <table><thead><tr><th class="ref">Ref</th><th>Description</th><th class="n">Qty</th><th class="u">Unit</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
    ${sec.lines.filter(l => !l.omitted).map((l, i) => `<tr><td class="ref">${refOf(sec.code, i)}</td><td>${html(l.description)}${l.basis === 'approx' ? ' <em>(approx. quantity)</em>' : ''}${l.basis === 'ps' ? ' <em>(provisional sum)</em>' : ''}<div class="w">${html(l.calc)}</div></td><td class="n">${plain(l.qty)}</td><td class="u">${html(l.unit)}</td><td class="n">${plain(l.rate)}</td><td class="n">${plain(l.amount)}</td></tr>`).join('')}
    <tr class="tot"><td></td><td colspan="4">Total carried to summary</td><td class="n">${plain(sec.total)}</td></tr></tbody></table>`).join('');
  const sumRows = s.sections.map(x => `<tr><td class="ref">${x.code}</td><td>${html(x.title)}</td><td class="n">${plain(x.total)}</td></tr>`).join('');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Bill of quantities - ${html(a.projectName)}</title><style>
    @page{size:A4;margin:14mm 12mm} body{font:11px/1.4 "IBM Plex Sans",Arial,sans-serif;color:#111} h1{font-size:20px;margin:0 0 2px} h2{font-size:12px;margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:3px;page-break-after:avoid}
    table{width:100%;border-collapse:collapse;margin-bottom:6px} th{text-align:left;border-bottom:1px solid #111;padding:3px 4px;font-size:10px} td{padding:4px;border-bottom:1px solid #ddd;vertical-align:top}
    .ref{width:54px;font-family:monospace} .n{text-align:right;width:78px;font-family:monospace} .u{width:48px} .w{color:#666;font-size:9px;font-family:monospace;margin-top:1px} tr{page-break-inside:avoid}
    .tot td{font-weight:700;border-top:1px solid #111;border-bottom:none} .meta{color:#444;margin-bottom:14px} .grand td{font-weight:700;font-size:13px;border-top:2px solid #111} ol{padding-left:16px} li{margin-bottom:3px}
    .pb{page-break-before:always}</style></head><body>
    <h1>BILL OF QUANTITIES</h1><div class="meta">${html(a.projectName)}${a.location ? ' &middot; ' + html(a.location) : ''} &middot; Gross floor area ${plain(gfa)} m&sup2; &middot; ${new Date().toLocaleDateString('en-GB')} &middot; Prepared with ArchPro (SMM7 work sections)</div>
    ${note ? `<div style="border:2px solid #b00;color:#b00;padding:6px 8px;margin-bottom:10px;font-weight:600">${html(note)}</div>` : ''}
    ${body}
    <div class="pb"></div><h1>GENERAL SUMMARY</h1><div class="meta">Currency: ${html(cur)}</div>
    <table><thead><tr><th class="ref">Section</th><th>Description</th><th class="n">Amount</th></tr></thead><tbody>${sumRows}
    <tr class="tot"><td></td><td>Net measured works</td><td class="n">${plain(s.net)}</td></tr>
    <tr><td></td><td>Preliminaries (${mk.prelimsPct}%)</td><td class="n">${plain(s.prelims)}</td></tr>
    <tr><td></td><td>Overheads and profit (${mk.ohpPct}%)</td><td class="n">${plain(s.ohp)}</td></tr>
    <tr><td></td><td>Contingency (${mk.contingencyPct}%)</td><td class="n">${plain(s.contingency)}</td></tr>
    <tr class="tot"><td></td><td>Sub-total</td><td class="n">${plain(s.subtotal)}</td></tr>
    <tr><td></td><td>Taxes and levies (${mk.taxPct}%)</td><td class="n">${plain(s.tax)}</td></tr>
    <tr class="grand"><td></td><td>TENDER TOTAL</td><td class="n">${money(s.grand, cur)}</td></tr></tbody></table>
    <div class="meta">Cost per m&sup2; GFA: ${money(s.perM2, cur)}</div>
    <h2>Basis of the take-off</h2><ol>${scopeNotes(a).map(n => `<li>${html(n)}</li>`).join('')}</ol></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  frame.contentDocument!.open(); frame.contentDocument!.write(doc); frame.contentDocument!.close();
  setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 2000); }, 300);
}
