// utils/drafting/project.ts — the starting project, and safe loading of saved plans.
import { ArchElement, ProjectState } from '../../types';

export const newProject = (): ProjectState => ({
  imageSrc: null, imageWidth: 0, imageHeight: 0, gridLines: [], elements: [],
  settings: { scale: 100, gridSpacing: 4000, wallWidth: 225, trenchWidth: 450, footingWidth: 1000, workingSpace: 300, blindingOffset: 50, foundationDepth: 1200, concreteGrade: 'C25/30', mmPerUnit: 1 },
  specs: { floors: 1, floorHeight: 3000, plinthHeight: 450, roof: { type: 'gable', pitch: 30, overhang: 600 } },
  generatedImageSrc: null, calculatedTrenchLength: 0,
} as unknown as ProjectState);

const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Validates a parsed plan and fills in anything missing. Bad elements are dropped rather than trusted. */
export function sanitizeProject(raw: any): ProjectState {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a plan file.');
  const base = newProject();
  const els: ArchElement[] = (Array.isArray(raw.elements) ? raw.elements : [])
    .filter((e: any) => e && typeof e.id === 'string' && typeof e.type === 'string' && fin(e.x1) && fin(e.y1) && fin(e.x2) && fin(e.y2))
    .map((e: any) => ({ ...e, gridRef: typeof e.gridRef === 'string' ? e.gridRef : '' }));
  const grid = (Array.isArray(raw.gridLines) ? raw.gridLines : [])
    .filter((g: any) => g && typeof g.id === 'string' && fin(g.position) && (g.orientation === 'vertical' || g.orientation === 'horizontal'))
    .map((g: any) => ({ id: g.id, label: String(g.label ?? ''), position: g.position, orientation: g.orientation }));
  const u = raw.underlay && typeof raw.imageSrc === 'string' && fin(raw.imageWidth) && fin(raw.imageHeight) && fin(raw.underlay.mmPerPx) && raw.underlay.mmPerPx > 0
    ? {
        mmPerPx: raw.underlay.mmPerPx, x: fin(raw.underlay.x) ? raw.underlay.x : 0, y: fin(raw.underlay.y) ? raw.underlay.y : 0,
        rot: fin(raw.underlay.rot) ? raw.underlay.rot : 0, opacity: fin(raw.underlay.opacity) ? Math.min(1, Math.max(0.05, raw.underlay.opacity)) : 0.6,
        visible: raw.underlay.visible !== false, calibrated: !!raw.underlay.calibrated, method: String(raw.underlay.method ?? ''),
        name: String(raw.underlay.name ?? 'Drawing'), kind: raw.underlay.kind === 'pdf' ? 'pdf' : 'image',
        paperMm: raw.underlay.paperMm && fin(raw.underlay.paperMm.w) && fin(raw.underlay.paperMm.h) ? raw.underlay.paperMm : undefined,
        page: fin(raw.underlay.page) ? raw.underlay.page : 1, numPages: fin(raw.underlay.numPages) ? raw.underlay.numPages : 1,
      }
    : undefined;
  return {
    ...base,
    imageSrc: u ? raw.imageSrc : null, imageWidth: u ? raw.imageWidth : 0, imageHeight: u ? raw.imageHeight : 0,
    underlay: u as ProjectState['underlay'],
    elements: els, gridLines: grid,
    settings: { ...base.settings, ...(raw.settings || {}), mmPerUnit: 1 },       // model units are millimetres
    specs: { ...base.specs, ...(raw.specs || {}), roof: { ...base.specs.roof, ...(raw.specs?.roof || {}) } },
  };
}
