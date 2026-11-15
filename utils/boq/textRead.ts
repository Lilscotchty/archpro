// utils/boq/textRead.ts — get the text off a drawing page without a vision model.
// 1) PDFs: read the text layer with pdf.js (exact numbers, no guessing). CAD and Drafting Studio PDFs have one.
// 2) Scans, photos and PDFs without a text layer: free in-browser OCR (tesseract.js). Nothing is uploaded for this step.

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isPdf, loadPlanFile } from '../elevation/planLoader';

export interface PageText { text: string; numPages: number; method: 'pdf-text' | 'ocr'; chars: number }

async function pdfText(file: File, pageNo: number): Promise<{ text: string; numPages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const tc = await page.getTextContent();
  type It = { s: string; x: number; y: number };
  const items: It[] = (tc.items as any[]).filter(i => typeof i.str === 'string' && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
  // rebuild reading lines: top to bottom, then left to right, items within 3 units of height share a line
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: It[][] = [];
  for (const it of items) { const l = lines[lines.length - 1]; if (l && Math.abs(l[0].y - it.y) < 3) l.push(it); else lines.push([it]); }
  const text = lines.map(l => l.sort((a, b) => a.x - b.x).map(i => i.s).join('  ')).join('\n');
  return { text, numPages: doc.numPages };
}

export async function ocrDataUrl(dataUrl: string, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text') onProgress?.(m.progress); } });
  try { const { data } = await worker.recognize(dataUrl); return data.text; } finally { await worker.terminate(); }
}

export async function readPageText(file: File, page: number, onStatus?: (s: string) => void): Promise<PageText> {
  let numPages = 1;
  if (isPdf(file)) {
    const r = await pdfText(file, page); numPages = r.numPages;
    if (r.text.replace(/\s/g, '').length >= 150) return { text: r.text, numPages, method: 'pdf-text', chars: r.text.length };
    onStatus?.('No text layer found, running OCR…');
  } else onStatus?.('Running OCR…');
  const { plan, numPages: n } = await loadPlanFile(file, page); numPages = n;
  const text = await ocrDataUrl(plan.src, p => onStatus?.(`OCR ${Math.round(p * 100)}%…`));
  return { text, numPages, method: 'ocr', chars: text.length };
}
