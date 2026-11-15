// utils/drafting/handoff.ts — what the Drafting Studio gives the Elevation Studio.
// The Elevation Studio works in image pixels and has its own calibration step, so walls are converted to pixels of
// the traced drawing; with no drawing, a plain raster of the plan is made (the name says what 1 px is).
import { ProjectState } from '../../types';
import { isWall } from './ops';
import { modelToImage } from './scale';
import { boxOfSegs } from './geometry';

export interface ElevationHandoff {
  plan: { src: string; width: number; height: number; name: string } | null;
  walls: { id: string; x1: number; y1: number; x2: number; y2: number }[];
}

export function elevationHandoff(p: ProjectState): ElevationHandoff {
  const walls = p.elements.filter(isWall);
  const u = p.underlay;
  if (u && p.imageSrc) {
    return {
      plan: { src: p.imageSrc, width: p.imageWidth, height: p.imageHeight, name: u.name },
      walls: walls.map(w => { const a = modelToImage(u, { x: w.x1, y: w.y1 }), b = modelToImage(u, { x: w.x2, y: w.y2 }); return { id: w.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }),
    };
  }
  if (!walls.length) return { plan: null, walls: [] };
  const box = boxOfSegs(walls)!, m = 1500;
  const x0 = box.x0 - m, y0 = box.y0 - m, bw = box.x1 - box.x0 + 2 * m, bh = box.y1 - box.y0 + 2 * m;
  const mmPerPx = Math.max(10, Math.max(bw, bh) / 3500);
  const c = document.createElement('canvas'); c.width = Math.ceil(bw / mmPerPx); c.height = Math.ceil(bh / mmPerPx);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#000'; g.lineWidth = Math.max(2, p.settings.wallWidth / mmPerPx); g.lineCap = 'square';
  for (const w of walls) { g.beginPath(); g.moveTo((w.x1 - x0) / mmPerPx, (w.y1 - y0) / mmPerPx); g.lineTo((w.x2 - x0) / mmPerPx, (w.y2 - y0) / mmPerPx); g.stroke(); }
  return {
    plan: { src: c.toDataURL('image/png'), width: c.width, height: c.height, name: `Drafting Studio plan (1 px = ${mmPerPx.toFixed(1)} mm)` },
    walls: walls.map(w => ({ id: w.id, x1: (w.x1 - x0) / mmPerPx, y1: (w.y1 - y0) / mmPerPx, x2: (w.x2 - x0) / mmPerPx, y2: (w.y2 - y0) / mmPerPx })),
  };
}
