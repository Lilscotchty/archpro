// utils/cad/types.ts — document + solid-model types for the 3D CAD page.
// Model units are METRES. Plan coordinates are (x, z) on the ground plane (plan "down the sheet" = +z),
// elevation is y (up). This is a right-handed, Y-up system (the same one glTF uses).

export type V2 = [number, number];
export type Ring = V2[];
export type Poly = Ring[];          // [outer, ...holes]
export type MultiPoly = Poly[];

export type MatKey = 'wall' | 'plinth' | 'slab' | 'roof' | 'door' | 'frame' | 'glass' | 'column' | 'stair' | 'solid' | 'ground';
export type ObjKind = 'wall' | 'door' | 'window' | 'column' | 'stair' | 'solid';

export interface Layer { name: string; color: string; visible: boolean; locked: boolean }

interface Base { id: string; layer: string; name: string; source: 'plan' | 'model'; hidden?: boolean }
export interface WallObj extends Base { kind: 'wall'; a: V2; b: V2; thickness: number }
export interface OpeningObj extends Base {
  kind: 'door' | 'window'; hostId: string; offset: number; width: number; height: number; sill: number;
  level: number | 'all'; hinge: 'left' | 'right';
}
export interface ColumnObj extends Base { kind: 'column'; at: V2; w: number; d: number; round: boolean; base: number; height: number }
export interface StairObj extends Base { kind: 'stair'; start: V2; angle: number; width: number; level: number }
export interface SolidObj extends Base { kind: 'solid'; ring: V2[]; base: number; height: number; material: MatKey }
export type CadObj = WallObj | OpeningObj | ColumnObj | StairObj | SolidObj;

export interface RoofSpec { type: 'gable' | 'hip' | 'shed' | 'flat'; pitch: number; overhang: number; thickness: number; ridge: 'auto' | 'x' | 'z'; shedHigh: 'north' | 'south' | 'east' | 'west'; parapet: number }
export interface CadSettings {
  storeys: number; storeyHeight: number; plinth: number; slab: number; wallThickness: number;
  roof: RoofSpec; doorHeight: number; windowHeight: number; windowSill: number;
}
export interface CadDoc { settings: CadSettings; objects: CadObj[]; layers: Layer[] }

export const DEFAULT_SETTINGS: CadSettings = {
  storeys: 1, storeyHeight: 3, plinth: 0.45, slab: 0.15, wallThickness: 0.225,
  roof: { type: 'gable', pitch: 30, overhang: 0.6, thickness: 0.15, ridge: 'auto', shedHigh: 'north', parapet: 0.45 },
  doorHeight: 2.1, windowHeight: 1.2, windowSill: 0.9,
};

export const DEFAULT_LAYERS: Layer[] = [
  { name: 'A-WALL', color: '#e8e2d6', visible: true, locked: false },
  { name: 'A-DOOR', color: '#8b5a2b', visible: true, locked: false },
  { name: 'A-GLAZ', color: '#5fb4e8', visible: true, locked: false },
  { name: 'A-FLOR', color: '#a8adb3', visible: true, locked: false },
  { name: 'A-ROOF', color: '#b5523b', visible: true, locked: false },
  { name: 'A-STRS', color: '#c8c8c8', visible: true, locked: false },
  { name: 'S-COLS', color: '#d0d0d0', visible: true, locked: false },
  { name: '0', color: '#ffffff', visible: true, locked: false },
];

/** One rendered/exported solid (a single closed mesh). Flat-shaded: every triangle owns its vertices. */
export interface Solid {
  id: string;
  objectId: string | null;     // the document object it belongs to (null = derived: slabs, roof)
  name: string;
  kind: ObjKind | 'slab' | 'roof';
  layer: string;
  material: MatKey;
  level: number;               // storey (−1 = roof / not on a storey)
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface CadModel {
  solids: Solid[];
  min: [number, number, number];
  max: [number, number, number];
  stats: { triangles: number; walls: number; doors: number; windows: number; rooms: number; warnings: string[] };
}

/** Per-object edits made on the 3D page (the plan stays the source of truth for plan-derived objects). */
export interface ObjOverride { thickness?: number; layer?: string; hidden?: boolean }
/** Everything the 3D page persists inside the project. */
export interface Cad3dState {
  overrides: Record<string, ObjOverride>;
  customs: CadObj[];                       // objects modelled directly in 3D (solids, columns, stairs)
  layers: Record<string, Partial<Layer>>;
  settings: Partial<Omit<CadSettings, 'storeys' | 'storeyHeight' | 'plinth'>>;
}
export const EMPTY_CAD3D: Cad3dState = { overrides: {}, customs: [], layers: {}, settings: {} };
