// utils/elevation/symbols.ts
// Drafting-convention symbols for windows and doors in ELEVATION, drawn as pure
// black line-work (no colour, no grey fills). They follow the usual
// architectural conventions rather than being copied from any third-party block
// library: dashed swing lines meet at the HINGE side, arrows show sliding
// leaves, horizontal slats show louvres / roller shutters, and so on.

import { Builder, LW } from './builder';
import { DoorStyle, OpeningKind, OpeningStyle, Prim, WindowStyle } from './types';

export const WINDOW_STYLES: { id: WindowStyle; label: string; defW: number; defH: number; defSill: number }[] = [
  { id: 'casement',  label: 'Casement (1 leaf)',  defW: 900,  defH: 1200, defSill: 900 },
  { id: 'casement2', label: 'Casement (2 leaf)',  defW: 1500, defH: 1200, defSill: 900 },
  { id: 'sliding',   label: 'Sliding',            defW: 1800, defH: 1200, defSill: 900 },
  { id: 'fixed',     label: 'Fixed glazing',      defW: 1200, defH: 1200, defSill: 900 },
  { id: 'louvre',    label: 'Louvre',             defW: 900,  defH: 1200, defSill: 900 },
  { id: 'awning',    label: 'Top-hung / awning',  defW: 1200, defH: 600,  defSill: 1500 },
];

export const DOOR_STYLES: { id: DoorStyle; label: string; defW: number; defH: number; defSill: number }[] = [
  { id: 'panel',   label: 'Panelled door',        defW: 900,  defH: 2100, defSill: 0 },
  { id: 'flush',   label: 'Flush door',           defW: 900,  defH: 2100, defSill: 0 },
  { id: 'double',  label: 'Double panelled door', defW: 1800, defH: 2100, defSill: 0 },
  { id: 'french',  label: 'Double glazed door',   defW: 1800, defH: 2100, defSill: 0 },
  { id: 'sliding', label: 'Sliding glass door',   defW: 2400, defH: 2100, defSill: 0 },
  { id: 'roller',  label: 'Roller shutter',       defW: 3000, defH: 2400, defSill: 0 },
];

export const styleLabel = (kind: OpeningKind, style: OpeningStyle): string =>
  ((kind === 'window' ? WINDOW_STYLES : DOOR_STYLES) as { id: string; label: string }[]).find(s => s.id === style)?.label ?? style;

export const styleDefaults = (kind: OpeningKind, style: OpeningStyle) =>
  ((kind === 'window' ? WINDOW_STYLES : DOOR_STYLES) as { id: string; defW: number; defH: number; defSill: number }[]).find(s => s.id === style)
  ?? (kind === 'window' ? WINDOW_STYLES[0] : DOOR_STYLES[0]);

// ---- small helpers ---------------------------------------------------------

/** two short diagonal "glass" strokes inside a pane */
function glint(b: Builder, x: number, z: number, w: number, h: number) {
  if (w < 350 || h < 350) return;
  const a = Math.min(w, h) * 0.22;
  const x0 = x + w * 0.2, z0 = z + h * 0.18;
  b.line(x0, z0, x0 + a, z0 + a, LW.hair);
  b.line(x0 + a * 0.45, z0, x0 + a * 1.45, z0 + a, LW.hair);
}

/** Dashed swing lines meeting at the hinge side (view from outside). */
function swing(b: Builder, x: number, z: number, w: number, h: number, hinge: 'left' | 'right') {
  const dash: [number, number] = [1.6, 1.0];
  if (hinge === 'left') {
    b.line(x + w, z, x, z + h / 2, LW.thin, dash);
    b.line(x + w, z + h, x, z + h / 2, LW.thin, dash);
  } else {
    b.line(x, z, x + w, z + h / 2, LW.thin, dash);
    b.line(x, z + h, x + w, z + h / 2, LW.thin, dash);
  }
}

function awningSwing(b: Builder, x: number, z: number, w: number, h: number) {
  const dash: [number, number] = [1.6, 1.0];
  b.line(x, z, x + w / 2, z + h, LW.thin, dash);
  b.line(x + w, z, x + w / 2, z + h, LW.thin, dash);
}

function arrow(b: Builder, xFrom: number, xTo: number, z: number) {
  const hd = b.pm(1.6);
  const dir = xTo > xFrom ? 1 : -1;
  b.line(xFrom, z, xTo, z, LW.med);
  b.line(xTo, z, xTo - dir * hd, z + hd * 0.6, LW.med);
  b.line(xTo, z, xTo - dir * hd, z - hd * 0.6, LW.med);
}

function handle(b: Builder, xEdge: number, dirIn: 1 | -1, z: number) {
  // lever handle: short vertical bar set in from the free edge
  const x = xEdge + dirIn * 90;
  b.line(x, z - 70, x, z + 70, LW.heavy);
}

// ---- WINDOWS ---------------------------------------------------------------

function drawWindow(b: Builder, style: WindowStyle, cx: number, z0: number, w: number, h: number, hinge: 'left' | 'right') {
  const x0 = cx - w / 2;
  const f = Math.min(60, w / 6, h / 6);           // frame width
  const ix = x0 + f, iz = z0 + f, iw = w - 2 * f, ih = h - 2 * f;

  // projecting sill (below the frame)
  b.rect(x0 - 50, z0 - 45, w + 100, 45, { fill: true, w: LW.med });
  // frame (opaque so nothing behind shows through)
  b.rect(x0, z0, w, h, { fill: true, w: LW.heavy });
  b.rect(ix, iz, iw, ih, { fill: true, w: LW.thin });

  switch (style) {
    case 'casement':
      glint(b, ix, iz, iw, ih);
      swing(b, ix, iz, iw, ih, hinge);
      break;
    case 'casement2': {
      const mid = cx;
      const m = 25;
      b.line(mid - m, iz, mid - m, iz + ih, LW.thin);
      b.line(mid + m, iz, mid + m, iz + ih, LW.thin);
      swing(b, ix, iz, iw / 2 - m, ih, 'left');
      swing(b, mid + m, iz, iw / 2 - m, ih, 'right');
      glint(b, ix, iz, iw / 2 - m, ih);
      glint(b, mid + m, iz, iw / 2 - m, ih);
      break;
    }
    case 'sliding': {
      const mid = cx;
      // right pane sits in front of left pane
      b.rect(mid - 20, iz, iw / 2 + 20, ih, { fill: true, w: LW.med });
      b.rect(ix, iz, iw / 2 + 20, ih, { fill: false, w: LW.thin });
      b.line(mid - 20, iz, mid - 20, iz + ih, LW.med);
      glint(b, ix, iz, iw / 2 - 20, ih);
      glint(b, mid + 20, iz, iw / 2 - 20, ih);
      arrow(b, mid + iw * 0.38, mid + iw * 0.08, iz + ih / 2);
      break;
    }
    case 'fixed':
      glint(b, ix, iz, iw, ih);
      break;
    case 'louvre': {
      const pitch = 100;
      const n = Math.max(2, Math.floor(ih / pitch));
      const step = ih / n;
      for (let i = 1; i < n; i++) b.line(ix, iz + i * step, ix + iw, iz + i * step, LW.thin);
      for (let i = 0; i < n; i++) {
        // blade edge: slightly inset second line to read as a slat
        b.line(ix, iz + i * step + step * 0.35, ix + iw, iz + i * step + step * 0.35, LW.hair);
      }
      break;
    }
    case 'awning':
      glint(b, ix, iz, iw, ih);
      awningSwing(b, ix, iz, iw, ih);
      break;
  }
}

// ---- DOORS -----------------------------------------------------------------

function panels(b: Builder, x: number, z: number, w: number, h: number) {
  // 4-panel door: two small upper, two tall lower
  const rail = Math.min(130, w / 5);
  const stileX = Math.min(100, w / 5);
  const pw = (w - 3 * stileX) / 2;
  if (pw < 60) return;
  const upperH = (h - 4 * rail) * 0.42;
  const lowerH = (h - 4 * rail) * 0.58;
  for (let c = 0; c < 2; c++) {
    const px = x + stileX + c * (pw + stileX);
    b.rect(px, z + rail, pw, lowerH, { w: LW.thin });
    b.rect(px, z + h - rail - upperH, pw, upperH, { w: LW.thin });
  }
}

function drawDoor(b: Builder, style: DoorStyle, cx: number, z0: number, w: number, h: number, hinge: 'left' | 'right') {
  const x0 = cx - w / 2;
  const f = Math.min(70, w / 8);
  const ix = x0 + f, iz = z0, iw = w - 2 * f, ih = h - f;

  b.rect(x0, z0, w, h, { fill: true, w: LW.heavy });         // frame / architrave
  b.rect(ix, iz, iw, ih, { fill: true, w: LW.thin });        // leaf opening

  const freeEdge = (leafX: number, leafW: number, hg: 'left' | 'right') =>
    hg === 'left' ? { x: leafX + leafW, dir: -1 as const } : { x: leafX, dir: 1 as const };

  switch (style) {
    case 'panel': {
      panels(b, ix, iz, iw, ih);
      swing(b, ix, iz, iw, ih, hinge);
      const fe = freeEdge(ix, iw, hinge);
      handle(b, fe.x, fe.dir, iz + 1000);
      break;
    }
    case 'flush': {
      swing(b, ix, iz, iw, ih, hinge);
      const fe = freeEdge(ix, iw, hinge);
      handle(b, fe.x, fe.dir, iz + 1000);
      break;
    }
    case 'double': {
      const m = 15, lw = iw / 2 - m;
      b.line(cx - m, iz, cx - m, iz + ih, LW.thin);
      b.line(cx + m, iz, cx + m, iz + ih, LW.thin);
      panels(b, ix, iz, lw, ih);
      panels(b, cx + m, iz, lw, ih);
      swing(b, ix, iz, lw, ih, 'left');
      swing(b, cx + m, iz, lw, ih, 'right');
      handle(b, cx - m, -1, iz + 1000);
      handle(b, cx + m, 1, iz + 1000);
      break;
    }
    case 'french': {
      const m = 15, lw = iw / 2 - m;
      b.line(cx - m, iz, cx - m, iz + ih, LW.thin);
      b.line(cx + m, iz, cx + m, iz + ih, LW.thin);
      for (const lx of [ix, cx + m]) {
        const rail = 110, glassZ = iz + 650;
        b.rect(lx + rail, glassZ, lw - 2 * rail, ih - 650 - rail, { w: LW.thin });
        glint(b, lx + rail, glassZ, lw - 2 * rail, ih - 650 - rail);
        b.line(lx, glassZ - 60, lx + lw, glassZ - 60, LW.hair);
      }
      swing(b, ix, iz, lw, ih, 'left');
      swing(b, cx + m, iz, lw, ih, 'right');
      handle(b, cx - m, -1, iz + 1000);
      handle(b, cx + m, 1, iz + 1000);
      break;
    }
    case 'sliding': {
      const mid = cx;
      b.rect(mid - 20, iz, iw / 2 + 20, ih, { fill: true, w: LW.med });
      b.rect(ix, iz, iw / 2 + 20, ih, { w: LW.thin });
      b.line(mid - 20, iz, mid - 20, iz + ih, LW.med);
      glint(b, ix + 80, iz + 150, iw / 2 - 160, ih - 300);
      glint(b, mid + 100, iz + 150, iw / 2 - 160, ih - 300);
      arrow(b, mid + iw * 0.38, mid + iw * 0.08, iz + ih / 2);
      break;
    }
    case 'roller': {
      const box = Math.min(300, ih * 0.14);
      b.rect(ix, iz + ih - box, iw, box, { w: LW.med });          // shutter box
      const pitch = 90;
      for (let z = iz + pitch; z < iz + ih - box; z += pitch) b.line(ix, z, ix + iw, z, LW.hair);
      b.line(ix + 60, iz, ix + 60, iz + ih - box, LW.thin);       // guide rails
      b.line(ix + iw - 60, iz, ix + iw - 60, iz + ih - box, LW.thin);
      break;
    }
  }
}

export function drawOpening(
  b: Builder, kind: OpeningKind, style: OpeningStyle,
  cx: number, zBottom: number, w: number, h: number, hinge: 'left' | 'right',
) {
  if (kind === 'window') drawWindow(b, style as WindowStyle, cx, zBottom, w, h, hinge);
  else drawDoor(b, style as DoorStyle, cx, zBottom, w, h, hinge);
}

/** Opening tag: small circle containing e.g. "W1", centred above the opening. */
export function drawTag(b: Builder, cx: number, zTop: number, tag: string) {
  const r = 2.1;
  const zc = zTop + b.pm(r + 0.8);
  b.circle(cx, zc, r, LW.thin, true);
  b.text(cx, zc - b.pm(0.55), tag, 1.8, 'middle', { bold: true });
}

/** Stand-alone preview used for the style pickers in the UI. */
export function symbolPreview(kind: OpeningKind, style: OpeningStyle, hinge: 'left' | 'right' = 'left'):
  { prims: Prim[]; vbW: number; vbH: number } {
  const d = styleDefaults(kind, style);
  const denom = 20;
  const pad = 4;
  const b = new Builder(denom, pad + (d.defW + 100) / denom / 2, 0);
  const sill = kind === 'window' ? 45 : 0;
  b.oy = pad + (d.defH + 0) / denom;      // z=0 at the bottom
  drawOpening(b, kind, style, 0, 0, d.defW, d.defH, hinge);
  return { prims: b.prims, vbW: (d.defW + 100) / denom + 2 * pad, vbH: (d.defH + sill) / denom + 2 * pad + 2 };
}
