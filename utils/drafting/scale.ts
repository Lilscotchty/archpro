// utils/drafting/scale.ts
// Scale maths for traced drawings. The model is always real millimetres; an underlay (image or PDF page)
// has its own mmPerPx, and these helpers set it from a known dimension or from a printed drawing scale.

import { Underlay } from '../../types';
import { Pt, rotateAbout, normDeg } from './geometry';

export const STANDARD_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

/** Paper sizes in millimetres, long side first. */
export const PAPER_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 }, A2: { w: 594, h: 420 }, A1: { w: 841, h: 594 }, A0: { w: 1189, h: 841 },
};

/** Real mm per pixel from two clicked points and the real distance between them. */
export const mmPerPxTwoPoint = (pxDistance: number, realMm: number): number =>
  pxDistance > 0 && realMm > 0 ? realMm / pxDistance : 0;

/** Real mm per pixel for a drawing printed at 1:denom on a page of known width (mm), rasterised to `pxWidth`. */
export const mmPerPxPaper = (paperWidthMm: number, pxWidth: number, denom: number): number =>
  paperWidthMm > 0 && pxWidth > 0 && denom > 0 ? (paperWidthMm / pxWidth) * denom : 0;

/** Same, for a raster image that is known to be scanned at `dpi`. */
export const mmPerPxDpi = (dpi: number, denom: number): number => (dpi > 0 && denom > 0 ? (25.4 / dpi) * denom : 0);

/** Paper width (mm) for an image of the given pixel size printed on a named paper size, matching its orientation. */
export function paperWidthFor(name: string, pxW: number, pxH: number): number {
  const p = PAPER_SIZES[name];
  if (!p) return 0;
  return pxW >= pxH ? p.w : p.h;
}

/** A first guess so a freshly opened drawing appears at a plausible size: 1:100, 150 dpi for images, page size for PDFs. */
export function provisionalMmPerPx(kind: 'image' | 'pdf', pxW: number, paperMm?: { w: number; h: number }): number {
  if (kind === 'pdf' && paperMm) return mmPerPxPaper(paperMm.w, pxW, 100);
  return mmPerPxDpi(150, 100);
}

// ------------------------------------------------------------------ underlay <-> model transforms

export const underlaySizeMm = (u: Underlay, pxW: number, pxH: number) => ({ w: pxW * u.mmPerPx, h: pxH * u.mmPerPx });

/** Pixel position on the image -> model millimetres. */
export function imageToModel(u: Underlay, px: Pt): Pt {
  const o = { x: u.x, y: u.y };
  return rotateAbout({ x: u.x + px.x * u.mmPerPx, y: u.y + px.y * u.mmPerPx }, o, u.rot);
}

/** Model millimetres -> pixel position on the image. */
export function modelToImage(u: Underlay, m: Pt): Pt {
  const o = { x: u.x, y: u.y };
  const r = rotateAbout(m, o, -u.rot);
  return { x: (r.x - u.x) / u.mmPerPx, y: (r.y - u.y) / u.mmPerPx };
}

/** Rescale the underlay so the model distance between a and b becomes `realMm`. The point `a` stays where it is. */
export function calibrateUnderlay(u: Underlay, a: Pt, b: Pt, realMm: number, method: string): Underlay | null {
  const cur = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(cur > 0) || !(realMm > 0)) return null;
  const k = realMm / cur;
  return { ...u, mmPerPx: u.mmPerPx * k, x: a.x + (u.x - a.x) * k, y: a.y + (u.y - a.y) * k, calibrated: true, method };
}

/** Set the scale directly (printed scale), keeping the image centre in place. */
export function setUnderlayScale(u: Underlay, mmPerPx: number, pxW: number, pxH: number, method: string): Underlay | null {
  if (!(mmPerPx > 0)) return null;
  const c = imageToModel(u, { x: pxW / 2, y: pxH / 2 });
  const next: Underlay = { ...u, mmPerPx, calibrated: true, method };
  const c2 = imageToModel(next, { x: pxW / 2, y: pxH / 2 });
  return { ...next, x: next.x + (c.x - c2.x), y: next.y + (c.y - c2.y) };
}

/** Rotate the underlay about `a` so the line a->b becomes horizontal (or vertical when it is closer to vertical). */
export function alignUnderlay(u: Underlay, a: Pt, b: Pt): Underlay | null {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return null;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;            // screen angle, clockwise positive
  const target = Math.abs(Math.cos((ang * Math.PI) / 180)) >= Math.abs(Math.sin((ang * Math.PI) / 180))
    ? (Math.cos((ang * Math.PI) / 180) >= 0 ? 0 : 180) : (Math.sin((ang * Math.PI) / 180) >= 0 ? 90 : -90);
  const delta = normDeg(target - ang);
  const o = rotateAbout({ x: u.x, y: u.y }, a, delta);
  return { ...u, x: o.x, y: o.y, rot: normDeg(u.rot + delta) };
}
