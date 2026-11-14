// utils/drawings/pack.ts
// Builds the drawings the SMM7 take-off needs (floor plan, foundation plan, elevations) from the Drafting Studio model,
// and saves drawings made by the other pages together with the data that produced them.

import { ProjectState } from '../../types';
import { Assumptions, DEFAULT_ASSUMPTIONS } from '../boq/types';
import { modelWithMarks } from '../boq/model';
import { ElevationModel, Opening, DEFAULT_SPECS } from '../elevation/types';
import { buildSheet } from '../elevation/engine';
import { sheetToSVG } from '../elevation/svg';
import { floorPlanSvg, foundationPlanSvg, withRef } from './planSvg';
import { saveDrawing, refFor } from './store';
import { DrawingKind, DrawingOrigin } from './types';

export interface PackItem { refSuffix: string; kind: DrawingKind; title: string; svg: string; width: number; height: number; data: unknown }
export interface Pack { items: PackItem[]; skipped: string[] }

/** The plan data without the (large) underlay image. */
export const planData = (p: ProjectState) => ({
  elements: p.elements, gridLines: p.gridLines, settings: p.settings, specs: p.specs, imageWidth: p.imageWidth, imageHeight: p.imageHeight,
});

export function savedAssumptions(p: ProjectState): Assumptions {
  try {
    const raw = localStorage.getItem('archpro.boq.v1');
    if (raw) return { ...DEFAULT_ASSUMPTIONS, ...(JSON.parse(raw).assumptions ?? {}) };
  } catch { /* fall through */ }
  return { ...DEFAULT_ASSUMPTIONS, floors: p.specs.floors, floorHeight: p.specs.floorHeight, plinthHeight: p.specs.plinthHeight,
    foundationDepth: p.settings.foundationDepth, trenchWidth: p.settings.trenchWidth, roofType: p.specs.roof.type, roofPitch: p.specs.roof.pitch || 25, overhang: p.specs.roof.overhang ?? 600 };
}

type El = { id: string; type: string; x1: number; y1: number; x2: number; y2: number };

function elevationModel(p: ProjectState, a: Assumptions, external: Map<string, boolean>): ElevationModel {
  const els = p.elements as unknown as El[];
  const walls = els.filter(e => e.type === 'wall' && external.get(e.id)).map(w => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 }));
  const openings: Opening[] = [];
  els.filter(e => e.type === 'door' || e.type === 'window').forEach(o => {
    const w = Math.abs(o.x2 - o.x1) || (o.type === 'door' ? 900 : 1200);
    const cx = Math.min(o.x1, o.x2) + w / 2, cy = o.y1;
    let best: { id: string; t: number; d: number } | null = null;
    walls.forEach(wl => {
      const dx = wl.x2 - wl.x1, dy = wl.y2 - wl.y1, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((cx - wl.x1) * dx + (cy - wl.y1) * dy) / l2));
      const d = Math.hypot(cx - (wl.x1 + t * dx), cy - (wl.y1 + t * dy));
      if (!best || d < best.d) best = { id: wl.id, t, d };
    });
    const b = best as { id: string; t: number; d: number } | null;
    if (!b || b.d > Math.max(400, p.settings.wallWidth * 2)) return;       // not on an external wall
    const win = o.type === 'window';
    openings.push({ id: o.id, wallId: b.id, kind: win ? 'window' : 'door', style: win ? 'casement' : 'panel', t: Math.min(0.97, Math.max(0.03, b.t)),
      width: w, height: win ? 1200 : 2100, sill: win ? 900 : 0, level: win ? 'all' : 0, hinge: 'left' });
  });
  return { mmPerPx: 1, walls, openings, specs: { ...DEFAULT_SPECS, projectName: a.projectName, floors: a.floors, floorHeight: a.floorHeight, plinthHeight: a.plinthHeight,
    roofType: a.roofType, roofPitch: a.roofPitch, overhang: a.overhang, parapet: a.parapet } };
}

export function generatePack(p: ProjectState, a: Assumptions): Pack {
  const items: PackItem[] = [], skipped: string[] = [];
  if (!(p.elements as unknown as El[]).some(e => e.type === 'wall')) return { items, skipped: ['No walls in the Drafting Studio yet, so no drawings were generated.'] };
  const { model, marks } = modelWithMarks(p, a);
  const base = { plan: planData(p), assumptions: a, wallRefs: [...marks.wallLabel.entries()], openingMarks: [...marks.openingMark.entries()], external: [...marks.external.entries()] };

  const fp = floorPlanSvg(p, a, marks);
  if (fp) items.push({ refSuffix: 'FLOOR-PLAN-AUTO', kind: 'floor_plan', title: 'Floor plan (generated)', svg: fp, width: 1587, height: 1123, data: { ...base, schedule: model } });
  const fd = foundationPlanSvg(p, a);
  if (fd) items.push({ refSuffix: 'FOUNDATION-PLAN-AUTO', kind: 'foundation_plan', title: 'Foundation plan (generated)', svg: fd, width: 1587, height: 1123, data: base });
  try {
    const em = elevationModel(p, a, marks.external);
    const sh = buildSheet(em);
    items.push({ refSuffix: 'ELEVATIONS-AUTO', kind: 'elevations', title: 'Elevations (generated)', svg: sheetToSVG(sh), width: 1587, height: 1123, data: { ...base, model: em, warnings: sh.warnings, scale: `1:${sh.denom}` } });
  } catch (e) { skipped.push(`Elevations were not generated: ${(e as Error).message}`); }
  return { items, skipped };
}

const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml' });

/** Generate and store the pack. Returns the skip reasons so the UI can show them. */
export async function savePack(p: ProjectState, a: Assumptions): Promise<string[]> {
  const { items, skipped } = generatePack(p, a);
  for (const it of items) {
    await saveDrawing({ kind: it.kind, refSuffix: it.refSuffix, title: it.title, origin: 'measurement', generated: true,
      blob: svgBlob(withRef(it.svg, refFor(it.refSuffix))), width: it.width, height: it.height, data: it.data });
  }
  return skipped;
}

export async function dataUrlToBlob(url: string): Promise<Blob> { return (await fetch(url)).blob(); }

/** Called by the Drafting Studio when it produces a sheet: stores the sheet, an SVG floor plan, the underlay, and the page data. */
export async function saveFromDrafting(p: ProjectState, sheet: { title: string; src: string }, dims: { w: number; h: number }): Promise<void> {
  const a = savedAssumptions(p);
  const data = { page: 'drafting', plan: planData(p), assumptions: a };
  await saveDrawing({ kind: 'foundation_plan', refSuffix: 'FOUNDATION-PLAN', title: sheet.title, origin: 'drafting', generated: false, blob: await dataUrlToBlob(sheet.src), width: dims.w, height: dims.h, data });
  const { marks } = modelWithMarks(p, a);
  const fp = floorPlanSvg(p, a, marks);
  if (fp) await saveDrawing({ kind: 'floor_plan', refSuffix: 'FLOOR-PLAN', title: 'Floor plan', origin: 'drafting', generated: false, blob: svgBlob(withRef(fp, refFor('FLOOR-PLAN'))), width: 1587, height: 1123, data });
  if (p.imageSrc) await saveDrawing({ kind: 'source_plan', refSuffix: 'SOURCE-PLAN', title: 'Source plan (underlay)', origin: 'drafting', generated: false, blob: await dataUrlToBlob(p.imageSrc), width: p.imageWidth, height: p.imageHeight, data: { page: 'drafting', imageWidth: p.imageWidth, imageHeight: p.imageHeight } });
}

/** Called by the Elevation Studio when its sheet is (re)built. */
export async function saveFromElevation(svg: string, model: ElevationModel, scale: number, plan: { src: string; width: number; height: number; name: string } | null): Promise<void> {
  const data = { page: 'elevation', model, scale: `1:${scale}`, planName: plan?.name ?? null };
  await saveDrawing({ kind: 'elevations', refSuffix: 'ELEVATIONS', title: 'Elevations', origin: 'elevation', generated: false, blob: svgBlob(svg), width: 1587, height: 1123, data });
  if (plan?.src) await saveDrawing({ kind: 'source_plan', refSuffix: 'SOURCE-PLAN-ELEV', title: `Source plan (${plan.name})`, origin: 'elevation', generated: false, blob: await dataUrlToBlob(plan.src), width: plan.width, height: plan.height, data: { page: 'elevation', name: plan.name } });
}
