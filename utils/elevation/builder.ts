// utils/elevation/builder.ts
// A tiny drawing builder. Geometry is given in MODEL millimetres (x = along the
// view, z = height, z up) and converted to PAPER millimetres (y down) using the
// drawing scale. Line weights and text sizes are always given in paper mm so a
// sheet looks the same whatever the scale. Everything is pure black on white.

import { Prim } from './types';

export const LW = {
  hair: 0.12,
  thin: 0.18,
  med: 0.3,
  heavy: 0.5,
  ground: 0.8,
};

export class Builder {
  prims: Prim[] = [];
  constructor(public denom: number, public ox = 0, public oy = 0) {}

  /** model mm -> paper mm */
  X = (x: number) => this.ox + x / this.denom;
  Z = (z: number) => this.oy - z / this.denom;
  /** paper mm -> model mm */
  pm = (p: number) => p * this.denom;

  line(x1: number, z1: number, x2: number, z2: number, w = LW.med, dash?: [number, number]) {
    this.prims.push({ k: 'line', x1: this.X(x1), y1: this.Z(z1), x2: this.X(x2), y2: this.Z(z2), w, dash });
  }

  /** open or closed polyline, optionally filled white (used to hide what is behind). */
  poly(pts: number[], o: { closed?: boolean; fill?: boolean; stroke?: boolean; w?: number; dash?: [number, number] } = {}) {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(this.X(pts[i]), this.Z(pts[i + 1]));
    this.prims.push({
      k: 'poly', pts: out, closed: o.closed ?? true, fill: o.fill ?? false,
      stroke: o.stroke ?? true, w: o.w ?? LW.med, dash: o.dash,
    });
  }

  rect(x: number, z: number, w: number, h: number, o: { fill?: boolean; stroke?: boolean; w?: number; dash?: [number, number] } = {}) {
    this.poly([x, z, x + w, z, x + w, z + h, x, z + h], { closed: true, ...o });
  }

  circle(x: number, z: number, rPaper: number, w = LW.thin, fill = false) {
    this.prims.push({ k: 'circle', cx: this.X(x), cy: this.Z(z), r: rPaper, w, fill });
  }

  text(x: number, z: number, text: string, size = 2.5, anchor: 'start' | 'middle' | 'end' = 'middle', o: { bold?: boolean; rotate?: number } = {}) {
    this.prims.push({ k: 'text', x: this.X(x), y: this.Z(z), text, size, anchor, ...o });
  }

  // ---- paper-space helpers (for sheet frame / title block) ----
  pLine(x1: number, y1: number, x2: number, y2: number, w = LW.med, dash?: [number, number]) {
    this.prims.push({ k: 'line', x1, y1, x2, y2, w, dash });
  }
  pRect(x: number, y: number, w: number, h: number, lw = LW.med) {
    this.prims.push({ k: 'poly', pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true, fill: false, stroke: true, w: lw });
  }
  pText(x: number, y: number, text: string, size = 2.5, anchor: 'start' | 'middle' | 'end' = 'start', o: { bold?: boolean; rotate?: number } = {}) {
    this.prims.push({ k: 'text', x, y, text, size, anchor, ...o });
  }
}

// ---- Architectural annotation helpers --------------------------------------

/** Horizontal dimension line with oblique architectural ticks. */
export function dimH(b: Builder, xA: number, xB: number, zLine: number, label: string, zFrom?: number) {
  const gap = b.pm(1), over = b.pm(2), tick = b.pm(1.4);
  if (zFrom !== undefined) {
    const dir = zLine < zFrom ? -1 : 1; // model z is up: a line below the object has dir = -1
    b.line(xA, zFrom + dir * gap, xA, zLine + dir * over, LW.hair);
    b.line(xB, zFrom + dir * gap, xB, zLine + dir * over, LW.hair);
  }
  b.line(xA, zLine, xB, zLine, LW.thin);
  for (const x of [xA, xB]) b.line(x - tick, zLine - tick, x + tick, zLine + tick, LW.med);
  b.text((xA + xB) / 2, zLine + b.pm(0.8), label, 2.3, 'middle');
}

/** Vertical dimension line (text reads from the right-hand side). */
export function dimV(b: Builder, zA: number, zB: number, xLine: number, label: string, xFrom?: number) {
  const gap = b.pm(1), over = b.pm(2), tick = b.pm(1.4);
  if (xFrom !== undefined) {
    const dir = xLine > xFrom ? 1 : -1;
    b.line(xFrom + dir * gap, zA, xLine + dir * over, zA, LW.hair);
    b.line(xFrom + dir * gap, zB, xLine + dir * over, zB, LW.hair);
  }
  b.line(xLine, zA, xLine, zB, LW.thin);
  for (const z of [zA, zB]) b.line(xLine - tick, z - tick, xLine + tick, z + tick, LW.med);
  b.text(xLine - b.pm(0.8), (zA + zB) / 2, label, 2.3, 'middle', { rotate: -90 });
}

/** Level marker: triangle sitting on a level line + text (e.g. +3.000). */
export function levelMarker(b: Builder, xFrom: number, xMark: number, z: number, label: string) {
  const s = b.pm(1.7);
  b.line(xFrom, z, xMark + b.pm(15), z, LW.hair, [1.2, 0.8]);
  b.poly([xMark - s, z + 2 * s, xMark + s, z + 2 * s, xMark, z], { closed: true, w: LW.thin });
  b.line(xMark - s, z, xMark + b.pm(15), z, LW.thin);
  b.text(xMark + b.pm(3.2), z + b.pm(0.9), label, 2.4, 'start');
}

export function fmtLevel(mm: number): string {
  const m = mm / 1000;
  const s = Math.abs(m).toFixed(3);
  if (Math.abs(m) < 0.0005) return '±0.000';
  return (m > 0 ? '+' : '-') + s;
}
