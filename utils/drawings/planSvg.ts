// utils/drawings/planSvg.ts
// Black-and-white A3 drawings made from the Drafting Studio model: a floor plan (with the same wall and opening
// references as the SMM7 schedule) and a foundation plan (trench, footing, pads). Plan coordinates are millimetres.

import { ProjectState } from '../../types';
import { Assumptions } from '../boq/types';
import { PlanMarks } from '../boq/model';

type El = { id: string; type: string; x1: number; y1: number; x2: number; y2: number };
const W = 420, H = 297, FR = 10, TB = 24;
const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number) => Math.round(v * 100) / 100;

interface Ctx { s: number; ox: number; oy: number; denom: number }
const px = (c: Ctx, x: number) => n(c.ox + x * c.s);
const py = (c: Ctx, y: number) => n(c.oy + y * c.s);

function fit(els: El[], margin: number): Ctx | null {
  const xs = els.flatMap(e => [e.x1, e.x2]), ys = els.flatMap(e => [e.y1, e.y2]);
  if (!xs.length) return null;
  const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin, minY = Math.min(...ys) - margin, maxY = Math.max(...ys) + margin;
  const aw = W - 2 * FR - 30, ah = H - 2 * FR - TB - 30;
  const denom = SCALES.find(d => (maxX - minX) / d <= aw && (maxY - minY) / d <= ah) ?? SCALES[SCALES.length - 1];
  const s = 1 / denom;
  return { s, denom, ox: FR + 15 + (aw - (maxX - minX) * s) / 2 - minX * s, oy: FR + 15 + (ah - (maxY - minY) * s) / 2 - minY * s };
}

const rectPoly = (c: Ctx, x1: number, y1: number, x2: number, y2: number, t: number) => {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * (t / 2), ny = (dx / l) * (t / 2);
  return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]].map(([x, y]) => `${px(c, x)},${py(c, y)}`).join(' ');
};

function dimLine(c: Ctx, x1: number, y1: number, x2: number, y2: number, off: number, label: string) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const a = { x: x1 + nx * off, y: y1 + ny * off }, b = { x: x2 + nx * off, y: y2 + ny * off };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const flip = ang > 90 || ang < -90 ? ang + 180 : ang;
  return `<g stroke="#000" stroke-width="0.18" fill="none"><line x1="${px(c, x1)}" y1="${py(c, y1)}" x2="${px(c, a.x)}" y2="${py(c, a.y)}" stroke-dasharray="0.8 0.8"/>` +
    `<line x1="${px(c, x2)}" y1="${py(c, y2)}" x2="${px(c, b.x)}" y2="${py(c, b.y)}" stroke-dasharray="0.8 0.8"/>` +
    `<line x1="${px(c, a.x)}" y1="${py(c, a.y)}" x2="${px(c, b.x)}" y2="${py(c, b.y)}"/></g>` +
    `<text x="${px(c, m.x)}" y="${py(c, m.y) - 0.8}" font-size="2.3" text-anchor="middle" transform="rotate(${n(flip)} ${px(c, m.x)} ${py(c, m.y)})" fill="#000">${esc(label)}</text>`;
}

function sheet(body: string, title: string, ref: string, denom: number, projectName: string, note: string) {
  const y0 = H - FR - TB;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/><rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="none" stroke="#000" stroke-width="0.25"/>
<rect x="${FR}" y="${FR}" width="${W - 2 * FR}" height="${H - 2 * FR}" fill="none" stroke="#000" stroke-width="0.7"/>
${body}
<line x1="${FR}" y1="${y0}" x2="${W - FR}" y2="${y0}" stroke="#000" stroke-width="0.7"/><line x1="250" y1="${y0}" x2="250" y2="${H - FR}" stroke="#000" stroke-width="0.35"/><line x1="330" y1="${y0}" x2="330" y2="${H - FR}" stroke="#000" stroke-width="0.35"/>
<text x="${FR + 2}" y="${y0 + 5}" font-size="2" fill="#000">NOTES</text><text x="${FR + 2}" y="${y0 + 10}" font-size="2.2" fill="#000">${esc(note)}</text>
<text x="252" y="${y0 + 5}" font-size="1.8" fill="#000">PROJECT</text><text x="252" y="${y0 + 10.5}" font-size="3.2" font-weight="bold" fill="#000">${esc(projectName.toUpperCase().slice(0, 34))}</text>
<line x1="250" y1="${y0 + 13}" x2="330" y2="${y0 + 13}" stroke="#000" stroke-width="0.25"/><text x="252" y="${y0 + 17}" font-size="1.8" fill="#000">DRAWING</text><text x="252" y="${y0 + 22}" font-size="3.2" font-weight="bold" fill="#000">${esc(title.toUpperCase())}</text>
<text x="332" y="${y0 + 5}" font-size="1.8" fill="#000">SCALE</text><text x="332" y="${y0 + 10.5}" font-size="3.2" font-weight="bold" fill="#000">1:${denom} @ A3</text>
<line x1="330" y1="${y0 + 13}" x2="${W - FR}" y2="${y0 + 13}" stroke="#000" stroke-width="0.25"/><text x="332" y="${y0 + 17}" font-size="1.8" fill="#000">DRAWING NO.</text><text x="332" y="${y0 + 22}" font-size="3" font-weight="bold" fill="#000">${esc(ref)}</text>
</svg>`;
}

const walls = (p: ProjectState) => (p.elements as unknown as El[]).filter(e => e.type === 'wall');

export function floorPlanSvg(p: ProjectState, a: Assumptions, marks: PlanMarks): string | null {
  const els = p.elements as unknown as El[], ws = walls(p);
  const c = fit(ws.length ? ws : els, 1500); if (!c) return null;
  const t = p.settings.wallWidth;
  let g = '';
  ws.forEach(w => { g += `<polygon points="${rectPoly(c, w.x1, w.y1, w.x2, w.y2, t)}" fill="#d9d9d9" stroke="#000" stroke-width="0.35"/>`; });
  els.filter(e => e.type === 'rect').forEach(r => { g += `<rect x="${px(c, Math.min(r.x1, r.x2))}" y="${py(c, Math.min(r.y1, r.y2))}" width="${n(Math.abs(r.x2 - r.x1) * c.s)}" height="${n(Math.abs(r.y2 - r.y1) * c.s)}" fill="#000"/>`; });
  els.filter(e => e.type === 'window').forEach(o => {
    const w = Math.abs(o.x2 - o.x1) || 1200, y = o.y1, x = Math.min(o.x1, o.x2);
    g += `<rect x="${px(c, x)}" y="${py(c, y - t / 2)}" width="${n(w * c.s)}" height="${n(t * c.s)}" fill="#fff" stroke="#000" stroke-width="0.3"/><line x1="${px(c, x)}" y1="${py(c, y)}" x2="${px(c, x + w)}" y2="${py(c, y)}" stroke="#000" stroke-width="0.25"/>`;
    g += `<text x="${px(c, x + w / 2)}" y="${py(c, y + t / 2 + 450)}" font-size="2" text-anchor="middle" font-weight="bold" fill="#000">${esc(marks.openingMark.get(o.id) ?? '')}</text>`;
  });
  els.filter(e => e.type === 'door').forEach(o => {
    const w = Math.abs(o.x2 - o.x1) || 900;
    g += `<rect x="${px(c, o.x1)}" y="${py(c, o.y1 - t / 2)}" width="${n(w * c.s)}" height="${n(t * c.s)}" fill="#fff" stroke="none"/>` +
      `<line x1="${px(c, o.x1)}" y1="${py(c, o.y1)}" x2="${px(c, o.x1)}" y2="${py(c, o.y1 - w)}" stroke="#000" stroke-width="0.3"/>` +
      `<path d="M ${px(c, o.x1)} ${py(c, o.y1 - w)} A ${n(w * c.s)} ${n(w * c.s)} 0 0 1 ${px(c, o.x1 + w)} ${py(c, o.y1)}" fill="none" stroke="#000" stroke-width="0.25" stroke-dasharray="1 0.8"/>`;
    g += `<text x="${px(c, o.x1 + w / 2)}" y="${py(c, o.y1 + t / 2 + 450)}" font-size="2" text-anchor="middle" font-weight="bold" fill="#000">${esc(marks.openingMark.get(o.id) ?? '')}</text>`;
  });
  ws.forEach(w => {
    const mx = w.x1 + (w.x2 - w.x1) * 0.3, my = w.y1 + (w.y2 - w.y1) * 0.3, l = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const off = t / 2 + 700; const nx = (-(w.y2 - w.y1) / l) * off, ny = ((w.x2 - w.x1) / l) * off;
    g += `<text x="${px(c, mx + nx)}" y="${py(c, my + ny)}" font-size="1.9" text-anchor="middle" fill="#555">${esc(marks.wallLabel.get(w.id) ?? '')}${marks.external.get(w.id) ? ' ext' : ' int'}</text>`;
  });
  const ext = ws.filter(w => marks.external.get(w.id));
  if (ext.length) {
    const xs = ext.flatMap(w => [w.x1, w.x2]), ys = ext.flatMap(w => [w.y1, w.y2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g += dimLine(c, x0, y1, x1, y1, 1400, String(Math.round(x1 - x0))) + dimLine(c, x1, y1, x1, y0, 1400, String(Math.round(y1 - y0)));
  }
  return sheet(g, 'Floor plan', '', c.denom, a.projectName, 'Dimensions in mm (wall centre-lines). Wall references (W1..) and opening marks (D1, W1..) match the SMM7 schedule. Generated for take-off.');
}

export function foundationPlanSvg(p: ProjectState, a: Assumptions): string | null {
  const els = p.elements as unknown as El[], ws = walls(p);
  const c = fit(ws.length ? ws : els, 1700); if (!c) return null;
  const t = p.settings.wallWidth, tw = a.trenchWidth;
  let g = '';
  ws.forEach(w => {
    g += `<polygon points="${rectPoly(c, w.x1, w.y1, w.x2, w.y2, tw)}" fill="none" stroke="#000" stroke-width="0.5" stroke-dasharray="2.2 1"/>`;
    g += `<polygon points="${rectPoly(c, w.x1, w.y1, w.x2, w.y2, t)}" fill="#d9d9d9" stroke="#000" stroke-width="0.3"/>`;
  });
  els.filter(e => e.type === 'rect').forEach(r => {
    const x = Math.min(r.x1, r.x2), y = Math.min(r.y1, r.y2), w = Math.abs(r.x2 - r.x1), h = Math.abs(r.y2 - r.y1);
    if (a.columnPad) g += `<rect x="${px(c, x + w / 2 - a.padSize / 2)}" y="${py(c, y + h / 2 - a.padSize / 2)}" width="${n(a.padSize * c.s)}" height="${n(a.padSize * c.s)}" fill="none" stroke="#000" stroke-width="0.5" stroke-dasharray="2.2 1"/>`;
    g += `<rect x="${px(c, x)}" y="${py(c, y)}" width="${n(w * c.s)}" height="${n(h * c.s)}" fill="#000"/>`;
  });
  const ext = ws;
  if (ext.length) {
    const xs = ext.flatMap(w => [w.x1, w.x2]), ys = ext.flatMap(w => [w.y1, w.y2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g += dimLine(c, x0, y1, x1, y1, 1800, String(Math.round(x1 - x0))) + dimLine(c, x1, y1, x1, y0, 1800, String(Math.round(y1 - y0)));
  }
  const note = `Trench ${tw}mm wide x ${a.foundationDepth}mm deep from ground level; strip footing ${a.footingThickness}mm thick, ${a.footingGrade}; walls ${t}mm. Dimensions in mm. Generated for take-off.`;
  return sheet(g, 'Foundation plan', '', c.denom, a.projectName, note);
}

/** Put the designation into the title block (the ref is only known when saving). */
export const withRef = (svg: string, ref: string) => svg.replace(/(DRAWING NO\.<\/text><text[^>]*>)[^<]*/, `$1${esc(ref)}`);
export const SHEET_MM = { w: W, h: H };
