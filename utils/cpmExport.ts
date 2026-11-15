// utils/cpmExport.ts — file output for the critical path diagram: SVG, PNG and PDF (a one-page PDF with the diagram embedded).

const dl = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

export const downloadSvg = (svg: string, name: string) => dl(new Blob([svg], { type: 'image/svg+xml' }), name);

/** Rasterise the SVG on a white canvas. `scale` is capped so the canvas stays within what browsers allow. */
export async function svgToCanvas(svg: string, w: number, h: number, scale = 3): Promise<HTMLCanvasElement> {
  const s = Math.max(1, Math.min(scale, 8000 / Math.max(w, h)));
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('The diagram could not be rendered.'));
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not create the image.'))), type, q));

export async function downloadPng(svg: string, w: number, h: number, name: string) {
  dl(await toBlob(await svgToCanvas(svg, w, h, 3), 'image/png'), name);
}

// ------------------------------------------------------------------------------------------------ PDF

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };

/**
 * A one-page PDF holding a JPEG. The page is `pageW` x `pageH` points; the picture is drawn at (x, y) with size
 * (drawW, drawH), measured from the bottom-left as PDF does.
 */
export function buildPdf(jpeg: Uint8Array, imgW: number, imgH: number, pageW: number, pageH: number, x: number, y: number, drawW: number, drawH: number, title = 'Critical path diagram'): Uint8Array {
  const f = (n: number) => n.toFixed(2);
  const content = `q ${f(drawW)} 0 0 ${f(drawH)} ${f(x)} ${f(y)} cm /Im0 Do Q`;
  const objs: Uint8Array[] = [
    enc('<< /Type /Catalog /Pages 2 0 R >>'),
    enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    cat([enc(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, enc('\nendstream')]),
    enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    enc(`<< /Title (${title.replace(/[()\\]/g, '')}) /Producer (ArchPro) >>`),
  ];
  const parts: Uint8Array[] = [enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const chunk = cat([enc(`${i + 1} 0 obj\n`), o, enc('\nendobj\n')]);
    parts.push(chunk); pos += chunk.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  parts.push(enc(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return cat(parts);
}

/** Landscape A4 (or A3 for wide diagrams), the diagram scaled to fit with a margin and centred. */
export async function downloadPdf(svg: string, w: number, h: number, name: string, title?: string) {
  const c = await svgToCanvas(svg, w, h, 3);
  const jpeg = new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.95)).arrayBuffer());
  const a3 = w > 1100;
  const pageW = a3 ? 1190.55 : 841.89, pageH = a3 ? 841.89 : 595.28, m = 28;
  const k = Math.min((pageW - 2 * m) / w, (pageH - 2 * m) / h, 1.6);
  const dw = w * k, dh = h * k;
  dl(new Blob([buildPdf(jpeg, c.width, c.height, pageW, pageH, (pageW - dw) / 2, (pageH - dh) / 2, dw, dh, title)], { type: 'application/pdf' }), name);
}
