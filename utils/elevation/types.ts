// utils/elevation/types.ts
// Data model for the Elevation Studio. All plan geometry is stored in IMAGE PIXELS
// (exactly as the user clicked) and converted to millimetres through `mmPerPx`.

export interface Pt { x: number; y: number }

export interface PlanSource {
  src: string;          // data URL of the (rasterised) plan
  width: number;
  height: number;
  name: string;
}

export interface Calibration {
  p1?: Pt;
  p2?: Pt;
  distanceMm?: number;
  mmPerPx?: number;
}

export interface ExtWall {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

export type OpeningKind = 'window' | 'door';

export type WindowStyle = 'casement' | 'casement2' | 'sliding' | 'fixed' | 'louvre' | 'awning';
export type DoorStyle = 'panel' | 'flush' | 'double' | 'french' | 'sliding' | 'roller';
export type OpeningStyle = WindowStyle | DoorStyle;

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  style: OpeningStyle;
  t: number;                 // 0..1 – centre of the opening along the wall (x1,y1 -> x2,y2)
  width: number;             // mm
  height: number;            // mm
  sill: number;              // mm above floor level (doors: 0)
  level: number | 'all';     // 0 = ground floor, 1 = first floor ... or every floor
  hinge: 'left' | 'right';   // as seen from OUTSIDE
}

export type RoofType = 'gable' | 'hip' | 'flat' | 'shed';
export type PlanSide = 'top' | 'bottom' | 'left' | 'right';

export interface ElevationSpecs {
  projectName: string;
  floors: number;
  floorHeight: number;       // mm, floor-to-floor
  plinthHeight: number;      // mm, ground to ground-floor FFL
  roofType: RoofType;
  roofPitch: number;         // degrees
  overhang: number;          // mm (eaves / verge)
  ridgeAxis: 'auto' | 'x' | 'y'; // gable / hip ridge direction in plan
  shedHigh: PlanSide;        // shed roof: which plan side is the high side
  parapet: number;           // mm, flat roof parapet height
  frontSide: PlanSide;       // which side of the PLAN (as drawn) is the front of the building
  scaleDenom: number | 'auto';
  showDimensions: boolean;
  showLevels: boolean;
  showTags: boolean;
  showFloorLines: boolean;
}

export const DEFAULT_SPECS: ElevationSpecs = {
  projectName: 'PROPOSED BUILDING',
  floors: 1,
  floorHeight: 3000,
  plinthHeight: 450,
  roofType: 'gable',
  roofPitch: 25,
  overhang: 600,
  ridgeAxis: 'auto',
  shedHigh: 'top',
  parapet: 600,
  frontSide: 'bottom',
  scaleDenom: 'auto',
  showDimensions: true,
  showLevels: true,
  showTags: true,
  showFloorLines: true,
};

export interface ElevationModel {
  mmPerPx: number;
  walls: ExtWall[];
  openings: Opening[];
  specs: ElevationSpecs;
}

// ---- Drawing primitives (all coordinates in PAPER millimetres) ----
export type Prim =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; dash?: [number, number] }
  | { k: 'poly'; pts: number[]; fill: boolean; stroke: boolean; w: number; closed: boolean; dash?: [number, number] }
  | { k: 'circle'; cx: number; cy: number; r: number; w: number; fill: boolean }
  | { k: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; bold?: boolean; rotate?: number };

export interface Sheet {
  width: number;   // paper mm
  height: number;
  prims: Prim[];
  denom: number;
  warnings: string[];
}

export type ViewName = 'front' | 'rear' | 'left' | 'right';
