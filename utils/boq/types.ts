// utils/boq/types.ts
// Data model for the SMM7 take-off. All lengths are millimetres unless the name ends in M / M2 / M3.

export type SourceTag = 'plan' | 'ai' | 'manual';

export interface WallRow {
  id: string; label: string;
  lengthMm: number;      // centre-line length
  thicknessMm: number;
  external: boolean;
  source: SourceTag;
}

export interface OpeningRow {
  id: string; kind: 'door' | 'window';
  mark: string;          // D1, W2 ...
  description: string;   // e.g. "Flush door, hardwood frame"
  widthMm: number; heightMm: number; qty: number;
  external: boolean;
  source: SourceTag;
}

export interface ColumnRow {
  id: string; label: string;
  bMm: number; dMm: number; qty: number;
  source: SourceTag;
}

export type RoofType = 'gable' | 'hip' | 'shed' | 'flat';
export type RoofCovering = 'aluminium_sheet' | 'concrete_tile';
export type CeilingType = 'pvc' | 'plasterboard' | 'none';
export type FloorFinish = 'ceramic_tile' | 'screed_only' | 'none';

export interface Assumptions {
  projectName: string; location: string; currency: string;
  // levels
  floors: number; floorHeight: number; plinthHeight: number;
  // substructure
  foundationDepth: number;      // ground level to underside of footing
  trenchWidth: number;          // also the strip footing width
  footingThickness: number;
  footingGrade: string; slabGrade: string; structGrade: string;
  footingBlinding: number;      // mm of C10 blinding under strip, 0 = none
  topsoilStrip: number;         // mm, 0 = none
  stripMargin: number;          // mm beyond the building line
  supportThresholdM: number;    // earthwork support measured when trench deeper than this
  hardcoreThk: number; sandBlindingThk: number; slabThk: number;
  antiTermite: boolean;
  // walling
  blockSpec: string; mortar: string;
  openingDeductM2: number;      // openings up to this size are not deducted (SMM7 convention 0.50 m2)
  lintelDepth: number; lintelBearing: number;
  ringBeam: boolean; ringBeamDepth: number;
  suspendedSlabThk: number;
  columnPad: boolean; padSize: number; padThk: number;
  rebarKgM3: { pad: number; column: number; lintel: number; ringBeam: number; slab: number };
  // roof
  roofType: RoofType; roofPitch: number; overhang: number; roofCovering: RoofCovering;
  trussSpacing: number; purlinSpacing: number; parapet: number;
  // finishes
  ceiling: CeilingType; floorFinish: FloorFinish;
  internalRenderThk: number; externalRenderThk: number; skirtingHeight: number;
  wetWallTilingM2: number;      // user supplied, there is no room data in the plan
  stairCount: number;           // staircases (nr), defaults to floors - 1
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  projectName: 'Proposed building', location: '', currency: 'GHS',
  floors: 1, floorHeight: 3000, plinthHeight: 450,
  foundationDepth: 1200, trenchWidth: 450, footingThickness: 225,
  footingGrade: 'C20/25', slabGrade: 'C25/30', structGrade: 'C25/30',
  footingBlinding: 0, topsoilStrip: 150, stripMargin: 1000, supportThresholdM: 1.2,
  hardcoreThk: 150, sandBlindingThk: 50, slabThk: 150, antiTermite: true,
  blockSpec: 'Sandcrete blocks', mortar: 'cement mortar (1:6)',
  openingDeductM2: 0.5, lintelDepth: 150, lintelBearing: 225,
  ringBeam: true, ringBeamDepth: 150, suspendedSlabThk: 150,
  columnPad: true, padSize: 1000, padThk: 300,
  rebarKgM3: { pad: 70, column: 150, lintel: 120, ringBeam: 110, slab: 100 },
  roofType: 'gable', roofPitch: 25, overhang: 600, roofCovering: 'aluminium_sheet',
  trussSpacing: 1000, purlinSpacing: 1200, parapet: 600,
  ceiling: 'pvc', floorFinish: 'ceramic_tile',
  internalRenderThk: 15, externalRenderThk: 20, skirtingHeight: 100,
  wetWallTilingM2: 0, stairCount: 0,
};

export interface BoqModel {
  walls: WallRow[]; openings: OpeningRow[]; columns: ColumnRow[];
  /** Centre-line footprint of the external walls. Used for floor, roof and excavation areas. */
  footprint: { lengthM: number; widthM: number; areaM2: number; source: SourceTag };
}

export type Basis = 'measured' | 'approx' | 'ps';

export interface BoqLine {
  key: string;            // stable id, so manual overrides survive regeneration
  section: string;        // SMM7 work section code, e.g. D20
  description: string;
  qty: number; unit: string;
  rateKey: string;
  rateMul: number;        // effective rate = library rate x rateMul (used for per-size doors/windows)
  calc: string;           // dimension workings shown on the bill and on the print-out
  basis: Basis;
}

export interface RateItem { label: string; unit: string; rate: number }
export type RateLibrary = Record<string, RateItem>;

export interface LineOverride { qty?: number; rate?: number; omit?: boolean }
export interface CustomLine { id: string; section: string; description: string; qty: number; unit: string; rate: number }

export interface Markups { prelimsPct: number; ohpPct: number; contingencyPct: number; taxPct: number }
export const DEFAULT_MARKUPS: Markups = { prelimsPct: 12, ohpPct: 10, contingencyPct: 5, taxPct: 15 };

export interface SectionDef { code: string; title: string }
export const SECTIONS: SectionDef[] = [
  { code: 'D20', title: 'Excavating and filling' },
  { code: 'E10', title: 'In situ concrete' },
  { code: 'E20', title: 'Formwork for in situ concrete' },
  { code: 'E30', title: 'Reinforcement for in situ concrete' },
  { code: 'F10', title: 'Brick / block walling' },
  { code: 'F30', title: 'Accessories and sundry items for walling' },
  { code: 'G20', title: 'Carpentry / timber framing / first fixing' },
  { code: 'H31', title: 'Metal profiled sheet coverings' },
  { code: 'H60', title: 'Clay / concrete roof tiling' },
  { code: 'J40', title: 'Flexible sheet damp proofing' },
  { code: 'K10', title: 'Plasterboard dry linings / ceilings' },
  { code: 'K13', title: 'Rigid sheet fine linings / ceilings' },
  { code: 'L10', title: 'Windows' },
  { code: 'L20', title: 'Doors' },
  { code: 'L30', title: 'Stairs' },
  { code: 'M10', title: 'Screeds and toppings' },
  { code: 'M20', title: 'Plastered / rendered coatings' },
  { code: 'M40', title: 'Ceramic tiling' },
  { code: 'M60', title: 'Painting' },
  { code: 'P20', title: 'Trims, skirtings and sundry items' },
  { code: 'R10', title: 'Rainwater pipework and gutters' },
  { code: 'PS', title: 'Provisional sums (services and external works)' },
];
