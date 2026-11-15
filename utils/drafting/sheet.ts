// utils/drafting/sheet.ts
// Foundation plan sheet: A3 landscape, drawn at a standard scale (1:50, 1:100, ...) chosen so the building fits,
// with a scale bar, wall dimensions and a title block. Model space is millimetres, so no unit guessing is needed.

import { ArchElement, ProjectState } from '../../types';
import { Pt, Seg, boxOfSegs, fmtNum, segLen } from './geometry';
import { isRect, isWall } from './ops';
import { STANDARD_SCALES } from './scale';

export const SHEET_PX = { w: 3508, h: 2480 };
const PAPER = { w: 420, h: 297 };                 // A3, mm
const PX = SHEET_PX.w / PAPER.w;                  // sheet pixels per paper millimetre
const SCALES = [...STANDARD_SCALES, 300, 400, 750, 1500, 2000, 2500, 5000].sort((a, b) => a - b);

export interface FoundationSheet { title: string; src: string; w: number; h: number; denom: number }

export function foundationSheet(project: ProjectState): FoundationSheet | null {
  const els = project.elements;
  const walls = els.filter(isWall);
  const rects = els.filter(isRect);
  if (!walls.length && !rects.length) return null;

  const { trenchWidth, wallWidth, footingWidth } = project.settings;
  const segs: Seg[] = [...walls, ...rects];
  const box = boxOfSegs(segs)!;
  const pad = Math.max(trenchWidth, footingWidth) / 2;
  const bx0 = box.x0 - pad, by0 = box.y0 - pad, bx1 = box.x1 + pad, by1 = box.y1 + pad;
  const bw = bx1 - bx0, bh = by1 - by0;

  const area = { x: 10, y: 10, w: PAPER.w - 20, h: PAPER.h - 20 - 34 };       // paper mm, above the title block
  const need = Math.max(bw / (area.w - 60), bh / (area.h - 50));
  const denom = SCALES.find(s => s >= need) ?? SCALES[SCALES.length - 1];
  const k = PX / denom;                                                          // sheet px per real mm
  const ox = (area.x + area.w / 2) * PX - ((bx0 + bx1) / 2) * k;
  const oy = (area.y + area.h / 2) * PX - ((by0 + by1) / 2) * k;
  const X = (x: number) => ox + x * k, Y = (y: number) => oy + y * k;

  const c = document.createElement('canvas'); c.width = SHEET_PX.w; c.height = SHEET_PX.h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#000'; g.lineWidth = 1.2 * PX / 3; g.strokeRect(10 * PX, 10 * PX, (PAPER.w - 20) * PX, (PAPER.h - 20) * PX);
  const font = (mm: number, bold = false) => `${bold ? 'bold ' : ''}${Math.round(mm * PX)}px Arial, Helvetica, sans-serif`;

  // structural grid
  g.save(); g.setLineDash([18, 8, 3, 8]); g.strokeStyle = '#d33'; g.lineWidth = 2; g.fillStyle = '#d33'; g.font = font(3); g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const l of project.gridLines) {
    g.beginPath();
    if (l.orientation === 'vertical') { g.moveTo(X(l.position), Y(by0) - 9 * PX); g.lineTo(X(l.position), Y(by1) + 9 * PX); }
    else { g.moveTo(X(bx0) - 9 * PX, Y(l.position)); g.lineTo(X(bx1) + 9 * PX, Y(l.position)); }
    g.stroke();
  }
  g.setLineDash([]);
  for (const l of project.gridLines) {
    const p: Pt = l.orientation === 'vertical' ? { x: X(l.position), y: Y(by0) - 12 * PX } : { x: X(bx0) - 12 * PX, y: Y(l.position) };
    g.beginPath(); g.arc(p.x, p.y, 3.5 * PX, 0, Math.PI * 2); g.stroke(); g.fillText(l.label, p.x, p.y);
  }
  g.restore();

  // trenches and walls (true widths)
  const strip = (e: Segish, w: number) => {
    const L = segLen(e); if (L < 1) return;
    g.save(); g.translate(X((e.x1 + e.x2) / 2), Y((e.y1 + e.y2) / 2)); g.rotate(Math.atan2(e.y2 - e.y1, e.x2 - e.x1));
    g.beginPath(); g.rect((-L / 2 - w / 2) * k, (-w / 2) * k, (L + w) * k, w * k); g.restore();
  };
  type Segish = Seg;
  g.lineJoin = 'miter';
  g.fillStyle = '#f0f0f0'; g.strokeStyle = '#000'; g.lineWidth = 3;
  for (const w of walls) { strip(w, trenchWidth); g.fill(); g.stroke(); }
  g.fillStyle = '#c8c8c8'; g.lineWidth = 1.6;
  for (const w of walls) { strip(w, wallWidth); g.fill(); g.stroke(); }
  for (const r of rects) { g.fillStyle = '#bdbdbd'; g.lineWidth = 3; g.beginPath(); g.rect(X(Math.min(r.x1, r.x2)), Y(Math.min(r.y1, r.y2)), Math.abs(r.x2 - r.x1) * k, Math.abs(r.y2 - r.y1) * k); g.fill(); g.stroke(); }

  // footing pads at wall ends (once per joined point)
  const seen: Pt[] = [];
  g.save(); g.setLineDash([14, 8]); g.lineWidth = 2;
  for (const w of walls) for (const p of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
    if (seen.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1)) continue;
    seen.push(p); g.strokeRect(X(p.x - footingWidth / 2), Y(p.y - footingWidth / 2), footingWidth * k, footingWidth * k);
  }
  g.restore();

  // wall lengths
  g.fillStyle = '#000'; g.font = font(2.6); g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const w of walls) {
    const L = segLen(w); if (L * k < 22 * PX) continue;
    let a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1); if (a > Math.PI / 2 || a <= -Math.PI / 2) a += Math.PI;
    g.save(); g.translate(X((w.x1 + w.x2) / 2), Y((w.y1 + w.y2) / 2)); g.rotate(a); g.fillText(fmtNum(L), 0, -(trenchWidth / 2) * k - 6); g.restore();
  }

  // overall dimensions
  if (walls.length) {
    const dim = (x1: number, y1: number, x2: number, y2: number, off: number, text: string) => {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * off, ny = dx / L * off;
      g.save(); g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x1 + nx, y1 + ny); g.lineTo(x2 + nx, y2 + ny);
      g.moveTo(x1, y1); g.lineTo(x1 + nx * 1.1, y1 + ny * 1.1); g.moveTo(x2, y2); g.lineTo(x2 + nx * 1.1, y2 + ny * 1.1); g.stroke();
      g.translate((x1 + x2) / 2 + nx, (y1 + y2) / 2 + ny); g.rotate(Math.atan2(dy, dx)); g.font = font(3); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(text, 0, -6); g.restore();
    };
    dim(X(box.x0), Y(by1), X(box.x1), Y(by1), 7 * PX, fmtNum(box.x1 - box.x0));
    dim(X(bx1), Y(box.y1), X(bx1), Y(box.y0), 7 * PX, fmtNum(box.y1 - box.y0));
  }

  // scale bar (alternating 1 m blocks, up to 5 m)
  const barM = bw / 1000 > 12 ? 5 : bw / 1000 > 5 ? 2 : 1, segMm = barM * 1000 / 5;
  const sx = 20 * PX, sy = (PAPER.h - 10 - 34 - 14) * PX;
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(sx + i * segMm * k, sy, segMm * k, 2 * PX); g.strokeRect(sx + i * segMm * k, sy, segMm * k, 2 * PX); }
  g.fillStyle = '#000'; g.font = font(2.6); g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('0', sx, sy + 2.6 * PX); g.fillText(`${barM} m`, sx + 5 * segMm * k - 4 * PX, sy + 2.6 * PX);

  // title block
  const ty = (PAPER.h - 10 - 34) * PX;
  g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(10 * PX, ty); g.lineTo((PAPER.w - 10) * PX, ty); g.stroke();
  g.fillStyle = '#000'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = font(7, true); g.fillText('FOUNDATION PLAN', 16 * PX, ty + 14 * PX);
  g.font = font(3); g.fillStyle = '#333';
  g.fillText(`Strip foundation: trench ${fmtNum(trenchWidth)} mm wide, ${fmtNum(project.settings.foundationDepth)} mm deep; wall ${fmtNum(wallWidth)} mm; concrete ${project.settings.concreteGrade}`, 16 * PX, ty + 22 * PX);
  g.fillText('All dimensions in millimetres. Do not scale from this drawing; verify on site.', 16 * PX, ty + 28 * PX);
  g.fillStyle = '#000'; g.font = font(3, true); g.textAlign = 'right';
  g.fillText(`SCALE 1:${denom} @ A3`, (PAPER.w - 16) * PX, ty + 14 * PX);
  g.font = font(2.6); g.fillStyle = '#333'; g.fillText(new Date().toISOString().slice(0, 10), (PAPER.w - 16) * PX, ty + 22 * PX);

  return { title: 'Foundation plan', src: c.toDataURL('image/png'), w: c.width, h: c.height, denom };
}

export const elementsBox = (els: ArchElement[]) => boxOfSegs(els.filter(e => isWall(e) || isRect(e)));
