// utils/elevation/svg.ts
// Serialises a Sheet to a pure black-on-white SVG (vector, print-ready) and,
// in the browser, rasterises it to a PNG.

import { Prim, Sheet } from './types';

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function primsToSVGBody(prims: Prim[]): string {
  return prims.map(p => {
    switch (p.k) {
      case 'line':
        return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke="#000" stroke-width="${p.w}"${p.dash ? ` stroke-dasharray="${p.dash[0]} ${p.dash[1]}"` : ''} stroke-linecap="butt"/>`;
      case 'poly': {
        const pts = [];
        for (let i = 0; i < p.pts.length; i += 2) pts.push(`${f(p.pts[i])},${f(p.pts[i + 1])}`);
        const tag = p.closed ? 'polygon' : 'polyline';
        return `<${tag} points="${pts.join(' ')}" fill="${p.fill ? '#fff' : 'none'}" stroke="${p.stroke ? '#000' : 'none'}" stroke-width="${p.w}" stroke-linejoin="miter"${p.dash ? ` stroke-dasharray="${p.dash[0]} ${p.dash[1]}"` : ''}/>`;
      }
      case 'circle':
        return `<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${p.r}" fill="${p.fill ? '#fff' : 'none'}" stroke="#000" stroke-width="${p.w}"/>`;
      case 'text': {
        const rot = p.rotate ? ` transform="rotate(${p.rotate} ${f(p.x)} ${f(p.y)})"` : '';
        return `<text x="${f(p.x)}" y="${f(p.y)}" font-size="${p.size}" text-anchor="${p.anchor}" font-family="Arial, Helvetica, sans-serif"${p.bold ? ' font-weight="bold"' : ''} fill="#000"${rot}>${esc(p.text)}</text>`;
      }
    }
  }).join('\n');
}

export function sheetToSVG(sheet: Sheet, opts: { responsive?: boolean } = {}): string {
  const size = opts.responsive ? 'width="100%" style="display:block;background:#fff"' : `width="${sheet.width}mm" height="${sheet.height}mm"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${sheet.width} ${sheet.height}">
<rect width="${sheet.width}" height="${sheet.height}" fill="#fff"/>
${primsToSVGBody(sheet.prims)}
</svg>`;
}

/** Browser only: rasterise an SVG string to a PNG blob (A3 @ 300 dpi by default). */
export async function svgToPngBlob(svg: string, pxW = 4961, pxH = 3508): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not rasterise the sheet'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = pxW; c.height = pxH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
