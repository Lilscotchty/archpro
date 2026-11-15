// utils/boq/rasterize.ts — turn a plan file (image or PDF page) into a JPEG small enough for a vision API
// (base64 images are limited to about 4 MB).

import { loadPlanFile } from '../elevation/planLoader';

const MAX_B64 = 3_600_000;

async function toImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the image.')); i.src = src; });
}

export async function rasterizeForAi(file: File, page: number): Promise<{ dataUrl: string; width: number; height: number; numPages: number; label: string }> {
  const { plan, numPages } = await loadPlanFile(file, page);
  const img = await toImage(plan.src);
  let side = Math.min(2200, Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = side / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.88, 0.78, 0.68]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= MAX_B64) return { dataUrl: url, width: c.width, height: c.height, numPages, label: plan.name };
    }
    side = Math.round(side * 0.78);
  }
  throw new Error('The page is too large to send even after shrinking. Crop it or use a lower-resolution export.');
}
