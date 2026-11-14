// utils/sim/types.ts — neutral (engine-independent) 3D model produced from the 2D plan.
// Units: metres. Right-handed, +Y up. Plan x -> world X, plan y (down the sheet) -> world Z.

export type MatKey = 'wall' | 'slab' | 'roof' | 'door' | 'frame' | 'glass' | 'plinth' | 'column' | 'ground';
export type PartKind = 'wall' | 'slab' | 'roof' | 'door' | 'window' | 'column' | 'ground';

export interface SimPart {
  id: string;
  name: string;
  kind: PartKind;
  level: number;          // storey index, -1 for roof/ground
  sourceId?: string;      // id of the plan element this part came from
  material: MatKey;
  positions: number[];    // xyz
  normals: number[];
  indices: number[];
}

export interface SimSettings {
  mmPerUnit: number;      // mm represented by one drawing unit
  wallThicknessMm: number;
  floors: number;
  floorHeightMm: number;
  plinthMm: number;
  slabMm: number;
  roof: { type: 'gable' | 'hip' | 'flat' | 'shed'; pitch: number; overhangMm: number; ridge: 'auto' | 'x' | 'z'; shedHigh: 'north' | 'south' | 'east' | 'west' };
  doorHeightMm: number;
  windowSillMm: number;
  windowHeightMm: number;
}

export const DEFAULT_SIM: SimSettings = {
  mmPerUnit: 1, wallThicknessMm: 225, floors: 1, floorHeightMm: 3000, plinthMm: 450, slabMm: 150,
  roof: { type: 'gable', pitch: 30, overhangMm: 600, ridge: 'auto', shedHigh: 'north' },
  doorHeightMm: 2100, windowSillMm: 900, windowHeightMm: 1200,
};

export const DEFAULT_COLORS: Record<MatKey, string> = {
  wall: '#e9e4da', slab: '#b9bcc0', roof: '#8c4a3a', door: '#6b4a2f', frame: '#f2f2f2',
  glass: '#8fc7e8', plinth: '#9a9fa6', column: '#c9c9c9', ground: '#2a3a2c',
};

/** Plan element as the studio stores it (optional per-opening overrides, in mm). */
export interface PlanEl {
  id: string; type: string; x1: number; y1: number; x2: number; y2: number;
  sill?: number; height?: number;
}

export interface SimStats { tris: number; walls: number; doors: number; windows: number; slabs: number; unhosted: number; warnings: string[] }

export interface SimModel {
  parts: SimPart[];
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  stats: SimStats;
}
