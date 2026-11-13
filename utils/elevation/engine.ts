// utils/elevation/engine.ts
// Turns an ElevationModel (traced external walls + openings + building specs)
// into a black-and-white A3 sheet holding FRONT, REAR, LEFT and RIGHT elevations.
//
// Plan convention: image pixels are converted to millimetres with `mmPerPx`
// and the Y axis is flipped so that "up the page" is +Y. The user says which
// side of the plan is the front; the other views follow from that:
//   - the viewer for each view stands OUTSIDE the building looking at it
//   - LEFT / RIGHT are the building's left / right as seen from the front.

import {
  ElevationModel, ElevationSpecs, ExtWall, Opening, PlanSide, Prim, Sheet, ViewName,
} from './types';
import { Builder, LW, dimH, dimV, fmtLevel, levelMarker } from './builder';
import { drawOpening, drawTag, styleLabel } from './symbols';
import { buildHipRoof, HipRoof } from './hip';

type V = { x: number; y: number };
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V) => Math.hypot(a.x, a.y);
const unit = (a: V): V => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

const SHEET_W = 420;
const SHEET_H = 297;
const SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

interface MMWall { id: string; a: V; b: V; outward: V; tangent: V; length: number }

const sideVec = (s: PlanSide): V =>
  s === 'top' ? { x: 0, y: 1 } : s === 'bottom' ? { x: 0, y: -1 } : s === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };

// ---- wall analysis ---------------------------------------------------------

function pointInside(px: number, py: number, walls: { a: V; b: V }[]): boolean {
  let c = 0;
  for (const w of walls) {
    if ((w.a.y > py) !== (w.b.y > py)) {
      const xi = w.a.x + ((py - w.a.y) * (w.b.x - w.a.x)) / (w.b.y - w.a.y);
      if (xi > px) c++;
    }
  }
  return (c & 1) === 1;
}

export function toMMWalls(walls: ExtWall[], mmPerPx: number): MMWall[] {
  const raw = walls
    .map(w => ({
      id: w.id,
      a: { x: w.x1 * mmPerPx, y: -w.y1 * mmPerPx },
      b: { x: w.x2 * mmPerPx, y: -w.y2 * mmPerPx },
    }))
    .filter(w => len(sub(w.b, w.a)) > 1);

  const all = raw.flatMap(w => [w.a, w.b]);
  const cen = { x: all.reduce((s, p) => s + p.x, 0) / (all.length || 1), y: all.reduce((s, p) => s + p.y, 0) / (all.length || 1) };

  return raw.map(w => {
    const t = unit(sub(w.b, w.a));
    const nA = { x: -t.y, y: t.x };
    const nB = { x: t.y, y: -t.x };
    const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const eps = 40;
    const inA = pointInside(m.x + nA.x * eps, m.y + nA.y * eps, raw);
    const inB = pointInside(m.x + nB.x * eps, m.y + nB.y * eps, raw);
    let outward: V;
    if (inA !== inB) outward = inA ? nB : nA;
    else outward = dot(sub(m, cen), nA) >= 0 ? nA : nB; // open loop: fall back to "away from the centre"
    return { ...w, outward, tangent: t, length: len(sub(w.b, w.a)) };
  });
}

export function validateModel(model: ElevationModel): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { walls, mmPerPx, openings, specs } = model;
  if (!mmPerPx || mmPerPx <= 0) errors.push('Set the drawing scale first (Step 1).');
  if (walls.length < 3) errors.push('Trace at least three external walls (Step 2).');

  if (mmPerPx && walls.length >= 3) {
    // closed-loop test: every end point should be shared by exactly two walls
    const tol = Math.max(250, 12 * mmPerPx);
    const pts = walls.flatMap(w => [{ x: w.x1 * mmPerPx, y: w.y1 * mmPerPx }, { x: w.x2 * mmPerPx, y: w.y2 * mmPerPx }]);
    const bad = pts.filter(p => pts.filter(q => Math.hypot(p.x - q.x, p.y - q.y) < tol).length !== 2).length;
    if (bad > 0) warnings.push('The external walls do not form a closed loop. Elevations are still drawn, but wall directions are guessed from the building centre.');
  }
  if (specs.floors < 1) errors.push('The building needs at least one floor.');
  if (openings.length === 0) warnings.push('No windows or doors have been placed – the elevations will show blank walls.');

  const byId = new Map(walls.map(w => [w.id, w]));
  for (const o of openings) {
    const w = byId.get(o.wallId);
    if (!w || !mmPerPx) continue;
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * mmPerPx;
    if (o.t * L - o.width / 2 < -5 || o.t * L + o.width / 2 > L + 5) warnings.push(`An opening is wider than the wall it sits on (${styleLabel(o.kind, o.style)}).`);
    if (o.sill + o.height > specs.floorHeight - 100) warnings.push(`A ${o.kind} is taller than the storey height and will be trimmed.`);
  }
  return { errors, warnings: Array.from(new Set(warnings)) };
}

// ---- roof model ------------------------------------------------------------

type Roof =
  | { t: 'gable-eave'; L: number; R: number; zEave: number; zRidge: number; topZ: number }
  | { t: 'gable-end'; L: number; R: number; hMin: number; hMax: number; zEave: number; zApex: number; topZ: number }
  | { t: 'hip-eave'; L: number; R: number; zEave: number; zRidge: number; topL: number; topR: number; topZ: number }
  | { t: 'hip-end'; L: number; R: number; zEave: number; zApex: number; topZ: number }
  | { t: 'hip-skel'; L: number; R: number; zEave: number; topZ: number; faces: HipViewFace[] }
  | { t: 'flat'; L: number; R: number; zTop: number; topZ: number }
  | { t: 'shed-along'; L: number; R: number; sgn: 1 | -1; zLo: number; zHi: number; topZ: number }
  | { t: 'shed-high'; L: number; R: number; zWall: number; topZ: number }
  | { t: 'shed-low'; L: number; R: number; zEave: number; zTop: number; topZ: number };

const FASCIA = 150;
const BARGE_DZ = 170;

/** one roof plane as seen from a view: points in (h, z) elevation space, `eave` marks t == 0 points */
interface HipViewFace { pts: { h: number; z: number; eave: boolean }[]; depth: number }

interface ViewGeom {
  name: ViewName; n: V; h: V;
  hMin: number; hMax: number; nMin: number; nMax: number;
}

interface Derived {
  walls: MMWall[];
  zPlate: number;
  tanP: number;
  ridge: 'x' | 'y';
  hs: V; shedLow: number; shedSpan: number;
  /** true hip roof (45-degree rule at every corner); null = could not be built, use the box approximation */
  hip: HipRoof | null;
}

function derive(model: ElevationModel): Derived {
  const walls = toMMWalls(model.walls, model.mmPerPx);
  const s = model.specs;
  const hip = s.roofType === 'hip'
    ? buildHipRoof(walls.map(w => ({ a: w.a, b: w.b })), Math.max(250, 12 * model.mmPerPx), s.overhang)
    : null;
  const pts = walls.flatMap(w => [w.a, w.b]);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const W = Math.max(...xs) - Math.min(...xs), D = Math.max(...ys) - Math.min(...ys);
  const ridge: 'x' | 'y' = s.ridgeAxis === 'auto' ? (W >= D ? 'x' : 'y') : s.ridgeAxis;
  const hs = sideVec(s.shedHigh);
  const proj = pts.map(p => dot(p, hs));
  const shedLow = Math.min(...proj);
  const shedSpan = Math.max(...proj) - shedLow;
  return { walls, zPlate: s.floors * s.floorHeight, tanP: Math.tan((s.roofPitch * Math.PI) / 180), ridge, hs, shedLow, shedSpan, hip };
}

/**
 * Project the true hip roof into one view. Only planes that face the viewer are kept; planes seen
 * edge-on are left out because their outline is already the slanted edge of the neighbouring plane.
 * Planes are sorted far -> near so nearer ones paint over farther ones (painter's algorithm).
 */
function hipViewRoof(v: ViewGeom, d: Derived, sp: ElevationSpecs): Roof {
  const hip = d.hip!;
  const zEave = d.zPlate - d.tanP * sp.overhang;
  const z = (t: number) => zEave + d.tanP * t;
  const all = hip.faces.flatMap(f => f.pts.map(p => dot(p, v.h)));
  const faces: HipViewFace[] = hip.faces
    .filter(f => dot(f.out, v.n) > 1e-3)
    .map(f => ({
      pts: f.pts.map(p => ({ h: dot(p, v.h), z: z(p.t), eave: p.t < 1e-6 })),
      depth: f.pts.reduce((s, p) => s + dot(p, v.n), 0) / f.pts.length,
    }))
    .sort((a, b) => a.depth - b.depth);
  return { t: 'hip-skel', L: Math.min(...all), R: Math.max(...all), zEave, topZ: z(hip.maxT), faces };
}

function viewGeoms(model: ElevationModel, d: Derived): ViewGeom[] {
  const f = sideVec(model.specs.frontSide);
  const defs: [ViewName, V][] = [
    ['front', f],
    ['rear', { x: -f.x, y: -f.y }],
    ['left', { x: f.y, y: -f.x }],
    ['right', { x: -f.y, y: f.x }],
  ];
  const pts = d.walls.flatMap(w => [w.a, w.b]);
  return defs.map(([name, n]) => {
    const h = { x: -n.y, y: n.x };
    const hv = pts.map(p => dot(p, h)), nv = pts.map(p => dot(p, n));
    return { name, n, h, hMin: Math.min(...hv), hMax: Math.max(...hv), nMin: Math.min(...nv), nMax: Math.max(...nv) };
  });
}

function computeRoof(v: ViewGeom, d: Derived, sp: ElevationSpecs): Roof {
  const o = sp.overhang, tp = d.tanP, zP = d.zPlate;
  const hA: 'x' | 'y' = Math.abs(v.h.x) > 0.5 ? 'x' : 'y';
  const B = v.hMax - v.hMin, S = v.nMax - v.nMin;
  const L = v.hMin - o, R = v.hMax + o;
  const zEave = zP - tp * o;

  switch (sp.roofType) {
    case 'flat':
      return { t: 'flat', L: v.hMin - 50, R: v.hMax + 50, zTop: zP + sp.parapet, topZ: zP + sp.parapet + 60 };
    case 'gable':
      if (d.ridge === hA) { const zRidge = zP + tp * (S / 2); return { t: 'gable-eave', L, R, zEave, zRidge, topZ: zRidge }; }
      { const zApex = zP + tp * (B / 2); return { t: 'gable-end', L, R, hMin: v.hMin, hMax: v.hMax, zEave, zApex, topZ: zApex }; }
    case 'hip':
      if (d.hip) return hipViewRoof(v, d, sp);
      // fallback (outline is not one closed loop): rectangular hip from the bounding box
      if (d.ridge === hA) {
        const run = S / 2 + o;
        const pyramid = L + run >= R - run;
        const topL = pyramid ? (L + R) / 2 : L + run, topR = pyramid ? (L + R) / 2 : R - run;
        const zRidge = pyramid ? zEave + tp * ((R - L) / 2) : zP + tp * (S / 2);
        return { t: 'hip-eave', L, R, zEave, zRidge, topL, topR, topZ: zRidge };
      }
      { const zApex = zP + tp * (B / 2); return { t: 'hip-end', L, R, zEave, zApex, topZ: zApex }; }
    case 'shed': {
      const hsAxis: 'x' | 'y' = Math.abs(d.hs.x) > 0.5 ? 'x' : 'y';
      const zLo = zP - tp * o, zHi = zP + tp * (d.shedSpan + o);
      if (hsAxis === hA) {
        const sgn: 1 | -1 = dot(d.hs, v.h) > 0 ? 1 : -1;
        return { t: 'shed-along', L, R, sgn, zLo, zHi, topZ: zHi };
      }
      if (dot(d.hs, v.n) > 0) return { t: 'shed-high', L, R, zWall: zP + tp * d.shedSpan, topZ: zP + tp * d.shedSpan + 220 };
      return { t: 'shed-low', L, R, zEave: zLo, zTop: zHi, topZ: zHi };
    }
  }
}

/** top of the wall at a given plan position, for the current roof type */
function wallTop(roof: Roof, d: Derived, sp: ElevationSpecs, v: ViewGeom, hCoord: number, wallMid: V): number {
  switch (roof.t) {
    case 'flat': return roof.zTop;
    // hs = ±h, so the coordinate along hs equals sgn * hCoord
    case 'shed-along': return d.zPlate + d.tanP * (roof.sgn * hCoord - d.shedLow);
    case 'shed-high':
    case 'shed-low': return d.zPlate + d.tanP * (dot(wallMid, d.hs) - d.shedLow);
    default: return d.zPlate;
  }
}

// ---- merged wall intervals -------------------------------------------------

interface Interval { lo: number; hi: number; depth: number; wallIds: string[]; mids: V[] }

function visibleIntervals(v: ViewGeom, d: Derived): Interval[] {
  const vis = d.walls
    .filter(w => dot(w.outward, v.n) > 0.5)
    .map(w => {
      const a = dot(w.a, v.h), b = dot(w.b, v.h);
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      return { lo: Math.min(a, b), hi: Math.max(a, b), depth: dot(m, v.n), id: w.id, mid: m };
    })
    .sort((p, q) => p.depth - q.depth || p.lo - q.lo);

  const out: Interval[] = [];
  for (const w of vis) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.depth - w.depth) < 100 && w.lo <= last.hi + 60) {
      last.hi = Math.max(last.hi, w.hi); last.wallIds.push(w.id); last.mids.push(w.mid);
    } else out.push({ lo: w.lo, hi: w.hi, depth: w.depth, wallIds: [w.id], mids: [w.mid] });
  }
  return out;
}

// ---- opening marks / legend ------------------------------------------------

export interface Mark { tag: string; label: string; w: number; h: number; sill: number; qty: number }

export function assignMarks(openings: Opening[], floors: number) {
  const keyOf = (o: Opening) => `${o.kind}|${o.style}|${o.width}|${o.height}|${o.sill}`;
  const map = new Map<string, Mark>();
  let wi = 0, di = 0;
  for (const o of openings) {
    const k = keyOf(o);
    const qty = o.level === 'all' ? floors : o.level < floors ? 1 : 0;
    const m = map.get(k);
    if (m) m.qty += qty;
    else map.set(k, {
      tag: o.kind === 'window' ? `W${++wi}` : `D${++di}`,
      label: styleLabel(o.kind, o.style).toUpperCase(), w: o.width, h: o.height, sill: o.sill, qty,
    });
  }
  return { tagOf: (o: Opening) => map.get(keyOf(o))!.tag, marks: Array.from(map.values()) };
}

// ---- drawing one view ------------------------------------------------------

const VIEW_TITLE: Record<ViewName, string> = {
  front: 'FRONT ELEVATION', rear: 'REAR ELEVATION', left: 'LEFT SIDE ELEVATION', right: 'RIGHT SIDE ELEVATION',
};

interface Cell { x: number; y: number; w: number; h: number }
const ZONE = { left: 25, right: 17, top: 7, title: 14, dims: 15 };

function drawView(
  b: Builder, model: ElevationModel, d: Derived, v: ViewGeom, roof: Roof,
  tagOf: (o: Opening) => string, warnings: string[],
) {
  const sp = model.specs;
  const plinth = sp.plinthHeight;
  const gz = -plinth;
  const ivs = visibleIntervals(v, d);
  const byWall = new Map<string, Opening[]>();
  for (const o of model.openings) { const a = byWall.get(o.wallId) ?? []; a.push(o); byWall.set(o.wallId, a); }
  const wallById = new Map(d.walls.map(w => [w.id, w]));
  const gableEnd = roof.t === 'gable-end';

  // ground line + simple hatch below (pure line-work)
  const gl = b.pm(5);
  b.line(roof.L - gl, gz, roof.R + gl, gz, LW.ground);
  const step = b.pm(3), hl = b.pm(2.2);
  for (let x = roof.L - gl + step; x <= roof.R + gl; x += step) b.line(x, gz, x - hl, gz - hl, LW.hair);

  const openingXs: number[] = [];
  const tags: { cx: number; zb: number; h: number; tag: string; isWindow: boolean }[] = [];

  for (const iv of ivs) {
    const zTopLo = wallTop(roof, d, sp, v, iv.lo, iv.mids[0]);
    const zTopHi = wallTop(roof, d, sp, v, iv.hi, iv.mids[0]);
    // wall face: white fill hides anything further away
    b.poly([iv.lo, gz, iv.hi, gz, iv.hi, zTopHi, iv.lo, zTopLo], { closed: true, fill: true, stroke: false });
    b.line(iv.lo, gz, iv.lo, zTopLo, LW.heavy);
    b.line(iv.hi, gz, iv.hi, zTopHi, LW.heavy);
    if (!gableEnd) b.line(iv.lo, zTopLo, iv.hi, zTopHi, LW.heavy);
    // plinth / FFL line
    b.line(iv.lo, 0, iv.hi, 0, LW.thin);
    if (sp.showFloorLines) for (let k = 1; k < sp.floors; k++) b.line(iv.lo, k * sp.floorHeight, iv.hi, k * sp.floorHeight, LW.thin);
    if (roof.t === 'flat') b.rect(iv.lo - 50, roof.zTop, iv.hi - iv.lo + 100, 60, { fill: true, w: LW.med }); // coping

    // openings on the walls that make up this interval
    for (const id of iv.wallIds) {
      const w = wallById.get(id)!;
      for (const o of byWall.get(id) ?? []) {
        const along = Math.abs(dot(w.tangent, v.h));
        if (along < 0.2) continue;
        const P = { x: w.a.x + (w.b.x - w.a.x) * o.t, y: w.a.y + (w.b.y - w.a.y) * o.t };
        const cx = dot(P, v.h);
        const wp = o.width * along;
        const levels = o.level === 'all' ? Array.from({ length: sp.floors }, (_, i) => i) : o.level < sp.floors ? [o.level] : [];
        for (const k of levels) {
          const base = k * sp.floorHeight;
          const maxTop = base + sp.floorHeight - 100;
          const zb = base + (o.kind === 'door' ? 0 : o.sill);
          const h = Math.min(o.height, maxTop - zb);
          if (h < 300) { warnings.push('An opening was skipped because it does not fit within its storey.'); continue; }
          drawOpening(b, o.kind, o.style, cx, zb, wp, h, o.hinge);
          if (sp.showTags) tags.push({ cx, zb, h, tag: tagOf(o), isWindow: o.kind === 'window' });
          openingXs.push(cx - wp / 2, cx + wp / 2);
        }
      }
    }
  }

  // roof (drawn last so it hides the wall tops behind it)
  const zP = d.zPlate;
  const fasc = (L: number, R: number, zTop: number) => b.rect(L, zTop - FASCIA, R - L, FASCIA, { fill: true, w: LW.med });
  switch (roof.t) {
    case 'gable-eave':
      b.rect(roof.L, roof.zEave, roof.R - roof.L, roof.zRidge - roof.zEave, { fill: true, w: LW.heavy });
      fasc(roof.L, roof.R, roof.zEave);
      break;
    case 'hip-eave':
      b.poly([roof.L, roof.zEave, roof.R, roof.zEave, roof.topR, roof.zRidge, roof.topL, roof.zRidge], { fill: true, w: LW.heavy });
      fasc(roof.L, roof.R, roof.zEave);
      break;
    case 'hip-end': {
      const mid = (roof.L + roof.R) / 2;
      b.poly([roof.L, roof.zEave, roof.R, roof.zEave, mid, roof.zApex], { fill: true, w: LW.heavy });
      fasc(roof.L, roof.R, roof.zEave);
      break;
    }
    case 'hip-skel': {
      // an edge shared by two visible planes is a hip / valley / ridge (medium line);
      // an edge that belongs to one visible plane is the roof outline (heavy line)
      const r = (x: number) => Math.round(x / 5) * 5;
      const keyOf = (p: { h: number; z: number }, q: { h: number; z: number }) => {
        const a = `${r(p.h)},${r(p.z)}`, c = `${r(q.h)},${r(q.z)}`;
        return a < c ? `${a}|${c}` : `${c}|${a}`;
      };
      const count = new Map<string, number>();
      for (const f of roof.faces) for (let i = 0; i < f.pts.length; i++) {
        const k = keyOf(f.pts[i], f.pts[(i + 1) % f.pts.length]);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
      for (const f of roof.faces) {
        b.poly(f.pts.flatMap(p => [p.h, p.z]), { closed: true, fill: true, stroke: false });
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length];
          if (Math.abs(p.h - q.h) < 1 && Math.abs(p.z - q.z) < 1) continue;
          b.line(p.h, p.z, q.h, q.z, (count.get(keyOf(p, q)) ?? 1) > 1 ? LW.med : LW.heavy);
          if (p.eave && q.eave) fasc(Math.min(p.h, q.h), Math.max(p.h, q.h), p.z);   // fascia board along each visible eave
        }
      }
      break;
    }
    case 'gable-end': {
      const mid = (roof.hMin + roof.hMax) / 2;
      // wall infill (gable triangle) – no base line so the wall reads as one plane
      b.poly([roof.hMin, zP - 5, mid, roof.zApex, roof.hMax, zP - 5], { closed: true, fill: true, stroke: false });
      b.line(roof.hMin, 0, roof.hMax, 0, LW.thin);
      const tanP = (roof.zApex - zP) / ((roof.hMax - roof.hMin) / 2);
      const dx = BARGE_DZ / tanP;
      // barge boards: a chevron following the roof slope
      b.poly([
        roof.L, roof.zEave, mid, roof.zApex, roof.R, roof.zEave,
        roof.R - dx, roof.zEave, mid, roof.zApex - BARGE_DZ, roof.L + dx, roof.zEave,
      ], { closed: true, fill: true, w: LW.heavy });
      break;
    }
    case 'shed-along': {
      const L = roof.L, R = roof.R;
      const lo = roof.zLo, hi = roof.zHi, t = 180;
      const zl = roof.sgn === 1 ? lo : hi, zr = roof.sgn === 1 ? hi : lo;
      b.poly([L, zl, R, zr, R, zr - t, L, zl - t], { fill: true, w: LW.heavy });
      break;
    }
    case 'shed-high':
      b.rect(roof.L, roof.zWall - 80, roof.R - roof.L, 300, { fill: true, w: LW.heavy });
      break;
    case 'shed-low':
      b.rect(roof.L, roof.zEave, roof.R - roof.L, roof.zTop - roof.zEave, { fill: true, w: LW.heavy });
      fasc(roof.L, roof.R, roof.zEave);
      break;
    case 'flat': break;
  }

  // opening tags go on top of everything: above the opening if there is room under the
  // eaves / parapet, otherwise just below it
  const tagTop = (cx: number): number => {
    switch (roof.t) {
      case 'gable-eave': case 'hip-eave': case 'hip-end': case 'hip-skel': case 'shed-low': return roof.zEave - FASCIA;
      case 'shed-high': return roof.zWall - 80;
      case 'shed-along': return wallTop(roof, d, sp, v, cx, { x: 0, y: 0 }) - 180;
      case 'flat': return roof.zTop;
      default: return roof.zApex;
    }
  };
  for (const t of tags) {
    const need = b.pm(5.4);
    const above = t.zb + t.h + need <= tagTop(t.cx);
    const zRef = above ? t.zb + t.h : t.zb - (t.isWindow ? b.pm(1.2) + 45 : 0) - need;
    drawTag(b, t.cx, zRef, t.tag);
  }

  // ---- annotation -----------------------------------------------------------
  const hMin = v.hMin, hMax = v.hMax;
  const topZ = roof.topZ;

  if (sp.showLevels) {
    const cands: { z: number; pr: number }[] = [
      { z: 0, pr: 0 }, { z: gz, pr: 1 },
      ...Array.from({ length: Math.max(0, sp.floors - 1) }, (_, i) => ({ z: (i + 1) * sp.floorHeight, pr: 2 })),
      { z: zP, pr: 3 }, { z: topZ, pr: 4 },
    ];
    const chosen: number[] = [];
    for (const c of cands.sort((p, q) => p.pr - q.pr)) {
      if (chosen.some(z => Math.abs(z - c.z) < b.pm(3.4))) continue;
      chosen.push(c.z);
      levelMarker(b, roof.L - b.pm(2), roof.L - b.pm(21), c.z, fmtLevel(c.z));
    }
  }

  if (sp.showDimensions) {
    const zDim1 = gz - b.pm(6.5);
    const zDim2 = gz - b.pm(11.5);
    // overall width
    dimH(b, hMin, hMax, zDim2, String(Math.round((hMax - hMin) / 5) * 5), gz);
    // chain of openings (only when it stays readable)
    const xs = Array.from(new Set([hMin, hMax, ...openingXs].map(x => Math.round(x / 5) * 5))).sort((p, q) => p - q);
    if (xs.length > 2 && xs.length <= 14) {
      for (let i = 0; i < xs.length - 1; i++) {
        const seg = xs[i + 1] - xs[i];
        if (seg < b.pm(5)) { b.line(xs[i], zDim1 - b.pm(1.4), xs[i + 1], zDim1 + b.pm(1.4), 0); continue; }
        dimH(b, xs[i], xs[i + 1], zDim1, String(Math.round(seg / 5) * 5), gz);
      }
    }
    // vertical chain
    const xv = roof.R + b.pm(7), xv2 = roof.R + b.pm(13);
    const stops = [gz, 0, ...Array.from({ length: Math.max(0, sp.floors - 1) }, (_, i) => (i + 1) * sp.floorHeight), zP, topZ]
      .filter((z, i, a) => i === 0 || z > a[i - 1] + 1);
    for (let i = 0; i < stops.length - 1; i++) {
      const dz = stops[i + 1] - stops[i];
      if (dz > b.pm(4.5)) dimV(b, stops[i], stops[i + 1], xv, String(Math.round(dz / 5) * 5), roof.R);
      else b.line(xv - b.pm(1.4), stops[i], xv + b.pm(1.4), stops[i], LW.med);
    }
    dimV(b, gz, topZ, xv2, String(Math.round((topZ - gz) / 5) * 5), roof.R);
  }
}

// ---- sheet -----------------------------------------------------------------

export function buildSheet(model: ElevationModel): Sheet {
  const { errors } = validateModel(model);
  if (errors.length) throw new Error(errors.join(' '));
  const warnings: string[] = [];
  const sp = model.specs;
  const d = derive(model);
  const views = viewGeoms(model, d);
  const roofs = views.map(v => computeRoof(v, d, sp));
  if (sp.roofType === 'hip' && !d.hip) {
    warnings.push('The walls do not form one clean closed loop, so the hip roof is approximated from the building\'s bounding box instead of following every corner at 45 degrees.');
  }

  // drawing area
  const frame = 10;
  const tbH = 28;
  const area = { x: frame, y: frame, w: SHEET_W - 2 * frame, h: SHEET_H - 2 * frame - tbH };
  const cellW = area.w / 2, cellH = area.h / 2;
  const dimsZone = sp.showDimensions ? ZONE.dims : 4;

  // choose scale
  let denom: number;
  if (sp.scaleDenom !== 'auto') denom = sp.scaleDenom;
  else {
    denom = SCALES[SCALES.length - 1];
    for (const s of SCALES) {
      const ok = views.every((v, i) => {
        const r = roofs[i];
        const w = (r.R - r.L) / s, h = (r.topZ + sp.plinthHeight) / s;
        return w <= cellW - ZONE.left - ZONE.right - 2 && h <= cellH - ZONE.top - ZONE.title - dimsZone - 2;
      });
      if (ok) { denom = s; break; }
    }
  }

  const { tagOf, marks } = assignMarks(model.openings, sp.floors);
  const all: Prim[] = [];
  const order: ViewName[] = ['front', 'rear', 'left', 'right'];

  order.forEach((name, idx) => {
    const vi = views.findIndex(v => v.name === name);
    const v = views[vi], roof = roofs[vi];
    const col = idx % 2, row = Math.floor(idx / 2);
    const cell: Cell = { x: area.x + col * cellW, y: area.y + row * cellH, w: cellW, h: cellH };
    const gPaper = cell.y + cell.h - ZONE.title - dimsZone;          // paper y of the ground line
    const centreH = (roof.L + roof.R) / 2;
    const regionX = cell.x + ZONE.left + (cell.w - ZONE.left - ZONE.right) / 2;
    const b = new Builder(denom, regionX - centreH / denom, gPaper - sp.plinthHeight / denom);
    drawView(b, model, d, v, roof, tagOf, warnings);
    all.push(...b.prims);

    // view title
    const tb = new Builder(denom);
    const tx = regionX, ty = cell.y + cell.h - 9.5;
    const title = VIEW_TITLE[name];
    tb.pText(tx, ty, title, 4.2, 'middle', { bold: true });
    const tw = title.length * 2.55;
    tb.pLine(tx - tw / 2, ty + 1.4, tx + tw / 2, ty + 1.4, LW.heavy);
    tb.pLine(tx - tw / 2, ty + 2.4, tx + tw / 2, ty + 2.4, LW.hair);
    tb.pText(tx, ty + 6.2, `SCALE 1:${denom}`, 2.3, 'middle');
    all.push(...tb.prims);
  });

  // frame + title block
  const f = new Builder(denom);
  f.pRect(5, 5, SHEET_W - 10, SHEET_H - 10, LW.thin);
  f.pRect(frame, frame, SHEET_W - 2 * frame, SHEET_H - 2 * frame, 0.7);
  const ty0 = SHEET_H - frame - tbH;
  f.pLine(frame, ty0, SHEET_W - frame, ty0, 0.7);
  f.pLine(250, ty0, 250, SHEET_H - frame, LW.med);
  f.pLine(330, ty0, 330, SHEET_H - frame, LW.med);
  // cell separators (very light)
  f.pLine(area.x + cellW, area.y + 4, area.x + cellW, area.y + area.h - 2, LW.hair, [1.5, 1.5]);
  f.pLine(area.x + 4, area.y + cellH, area.x + area.w - 4, area.y + cellH, LW.hair, [1.5, 1.5]);

  f.pText(frame + 2, ty0 + 4, 'OPENINGS KEY', 2.2, 'start', { bold: true });
  const perCol = 5, colW = 80;
  marks.slice(0, perCol * 3).forEach((m, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const x = frame + 2 + c * colW, y = ty0 + 8.2 + r * 3.9;
    const sillTxt = m.tag.startsWith('W') ? `  SILL ${m.sill}` : '';
    const label = m.label.length > 22 ? m.label.slice(0, 21) + '.' : m.label;
    f.pText(x, y, `${m.tag}  ${label}  ${m.w}x${m.h}${sillTxt}  (x${m.qty})`, 1.9, 'start');
  });
  if (marks.length > perCol * 3) f.pText(frame + 2, SHEET_H - frame - 1.2, `+ ${marks.length - perCol * 3} more types`, 1.9, 'start');

  f.pText(252, ty0 + 4, 'PROJECT', 1.8, 'start');
  f.pText(252, ty0 + 9.5, sp.projectName.toUpperCase().slice(0, 34), 3.2, 'start', { bold: true });
  f.pLine(250, ty0 + 14, 330, ty0 + 14, LW.thin);
  f.pText(252, ty0 + 18, 'DRAWING', 1.8, 'start');
  f.pText(252, ty0 + 23.5, 'BUILDING ELEVATIONS', 3.2, 'start', { bold: true });

  f.pText(332, ty0 + 4, 'SCALE', 1.8, 'start');
  f.pText(332, ty0 + 9.5, `1:${denom} @ A3`, 3.2, 'start', { bold: true });
  f.pLine(330, ty0 + 14, SHEET_W - frame, ty0 + 14, LW.thin);
  f.pText(332, ty0 + 18, 'DATE', 1.8, 'start');
  f.pText(332, ty0 + 23.5, new Date().toLocaleDateString('en-GB'), 3.2, 'start', { bold: true });
  f.pText(SHEET_W - frame - 2, ty0 + 23.5, 'E-01', 3.2, 'end', { bold: true });
  all.push(...f.prims);

  return { width: SHEET_W, height: SHEET_H, prims: all, denom, warnings: Array.from(new Set(warnings)) };
}
