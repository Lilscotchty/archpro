// utils/drafting/loadSource.ts
// Opens a drawing to trace over: an image (PNG, JPG, WebP) or one page of a PDF. PDFs also report their physical page
// size, which lets the Drafting Studio offer an exact "printed at 1:N" scale.

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface LoadedSource {
  src: string;               // PNG/JPEG data URL
  width: number;
  height: number;
  name: string;
  kind: 'image' | 'pdf';
  paperMm?: { w: number; h: number };   // PDF page size in mm (rotation applied)
  page: number;
  numPages: number;
}

const MAX_SIDE = 5000;               // px on the long side: sharp enough to trace, light on memory
const MAX_BYTES = 60 * 1024 * 1024;

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

const readDataUrl = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = () => rej(new Error('The file could not be read.'));
  r.readAsDataURL(file);
});

async function loadImage(file: File): Promise<LoadedSource> {
  const url = await readDataUrl(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('That image could not be opened. Use a PNG, JPG or PDF.'));
    i.src = url;
  });
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  if (long <= MAX_SIDE) return { src: url, width: img.naturalWidth, height: img.naturalHeight, name: file.name, kind: 'image', page: 1, numPages: 1 };
  const k = MAX_SIDE / long;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), width: c.width, height: c.height, name: file.name, kind: 'image', page: 1, numPages: 1 };
}

async function loadPdf(file: File, pageNo: number): Promise<LoadedSource> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try { doc = await task.promise; }
  catch (e) { throw new Error((e as Error).name === 'PasswordException' ? 'This PDF is password protected.' : 'That PDF could not be opened.'); }
  const n = Math.min(Math.max(1, Math.round(pageNo)), doc.numPages);
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });                 // 1 unit = 1/72 inch
  const scale = Math.min(8, MAX_SIDE / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  const numPages = doc.numPages;
  void task.destroy();
  return {
    src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height,
    name: file.name, kind: 'pdf', page: n, numPages,
    paperMm: { w: (base.width * 25.4) / 72, h: (base.height * 25.4) / 72 },
  };
}

export async function loadDraftingSource(file: File, pageNo = 1): Promise<LoadedSource> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 60 MB. Export a smaller copy and try again.');
  if (isPdfFile(file)) return loadPdf(file, pageNo);
  if (isImageFile(file)) return loadImage(file);
  throw new Error('Use a PNG, JPG or PDF file.');
}
