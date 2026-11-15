// utils/drafting/geometry.ts
// Plane geometry and formatting for the Drafting Studio. Model space is real millimetres, y down the screen.

export type Pt = { x: number; y: number };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const same = (a: Pt, b: Pt, tol = 0.5) => dist(a, b) <= tol;

export interface Seg { x1: number; y1: number; x2: number; y2: number }

export const segLen = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
export const unit = (s: Seg): Pt => { const L = segLen(s) || 1; return { x: (s.x2 - s.x1) / L, y: (s.y2 - s.y1) / L }; };

/** Closest point on a segment, with its parameter t in [0,1]. */
export function projectOnSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, q, d: dist(p, q) };
}

/** Intersection of two segments (including touching ends), or null. Parallel segments return null. */
export function segIntersect(a: Seg, b: Seg): Pt | null {
  const rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / den;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x1 + t * rx, y: a.y1 + t * ry };
}

/** Compass angle in degrees: 0 = east, 90 = up the screen (counter-clockwise), range (-180, 180]. */
export const angleDeg = (from: Pt, to: Pt) => (Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI;

export const polar = (from: Pt, lenMm: number, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return { x: from.x + Math.cos(r) * lenMm, y: from.y - Math.sin(r) * lenMm };
};

export const normDeg = (d: number) => { let r = ((d + 180) % 360 + 360) % 360 - 180; if (r === -180) r = 180; return r; };

/** 1, 2, 5 x 10^n step that is at least `min`. */
export function niceStep(min: number): number {
  if (!(min > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(min)));
  for (const m of [1, 2, 5, 10]) if (m * e >= min) return m * e;
  return 10 * e;
}

export const fmtMm = (v: number) => {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(2)} m`;
  return `${Math.round(v).toLocaleString('en-US').replace(/,/g, ' ')} mm`;
};
export const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');

export const rectCorners = (a: Pt, b: Pt): Pt[] => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];

export interface Box { x0: number; y0: number; x1: number; y1: number }
export const boxOfSegs = (segs: Seg[]): Box | null => {
  if (!segs.length) return null;
  const xs = segs.flatMap(s => [s.x1, s.x2]), ys = segs.flatMap(s => [s.y1, s.y2]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/** Rotate a point about a centre by `deg` degrees, clockwise on screen (y down). */
export const rotateAbout = (p: Pt, c: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
};

// ------------------------------------------------------------------ typed entry

export type Entry =
  | { kind: 'length'; len: number }
  | { kind: 'polar'; len: number; deg: number }
  | { kind: 'rel'; dx: number; dy: number };

const num = (s: string): number | null => {
  const m = /^([+-]?\d*\.?\d+)(mm|cm|m)?$/i.exec(s.trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] || 'mm').toLowerCase();
  return u === 'm' ? v * 1000 : u === 'cm' ? v * 10 : v;
};

/**
 * Parses what a person types while drawing, in millimetres (or with an m / cm suffix):
 *   "4500"      length along the current direction
 *   "4500<90"   length and compass angle (90 = up, 0 = right)
 *   "3000,2000" offset right, up (negative = left, down)
 */
export function parseEntry(text: string): Entry | null {
  const t = text.trim().replace(/^@/, '');
  if (!t) return null;
  if (t.includes('<')) {
    const [l, a] = t.split('<');
    const len = num(l), deg = parseFloat(a);
    return len !== null && Number.isFinite(deg) && len > 0 ? { kind: 'polar', len, deg } : null;
  }
  if (t.includes(',')) {
    const [a, b] = t.split(',');
    const dx = num(a), dy = num(b);
    return dx !== null && dy !== null && (dx !== 0 || dy !== 0) ? { kind: 'rel', dx, dy } : null;
  }
  const len = num(t);
  return len !== null && len > 0 ? { kind: 'length', len } : null;
}
