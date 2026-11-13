// utils/elevation/planLoader.ts
// Loads an uploaded plan (image or PDF) and returns it as a raster data URL.
// PDFs are rendered with pdf.js (loaded lazily so it never slows the main app).

import { PlanSource } from './types';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MAX_SIDE = 4200; // px – plenty for tracing, still light on memory

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

async function loadImage(file: File): Promise<PlanSource> {
  const url = await readAsDataURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('That image could not be opened. Try a PNG, JPG or PDF.'));
    i.src = url;
  });
  const long = Math.max(img.width, img.height);
  if (long <= MAX_SIDE) return { src: url, width: img.width, height: img.height, name: file.name };

  const k = MAX_SIDE / long;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), width: c.width, height: c.height, name: file.name };
}

async function loadPdf(file: File, pageNo: number): Promise<{ plan: PlanSource; numPages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const n = Math.min(Math.max(1, pageNo), doc.numPages);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(6, MAX_SIDE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const numPages = doc.numPages;
  void task.destroy();
  return {
    plan: { src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, name: `${file.name} (page ${n}/${numPages})` },
    numPages,
  };
}

export async function loadPlanFile(file: File, pageNo = 1): Promise<{ plan: PlanSource; numPages: number }> {
  if (isPdf(file)) return loadPdf(file, pageNo);
  return { plan: await loadImage(file), numPages: 1 };
}
