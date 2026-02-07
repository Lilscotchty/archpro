// types.ts

export enum AppStep {
  UPLOAD = 'UPLOAD',
  GRID_MAPPING = 'GRID_MAPPING',
  COLUMN_SELECTION = 'COLUMN_SELECTION',
  GENERATION = 'GENERATION',
  BACKEND_SPECS = 'BACKEND_SPECS'
}

export type GridOrientation = 'vertical' | 'horizontal';

export interface GridLine {
  id: string;
  label: string;
  position: number; // Pixel coordinate
  orientation: GridOrientation;
}

export interface Column {
  intersectionId: string;
  type: 'square' | 'rectangular';
  width: number; // in mm
  height: number;
}

export interface ProjectSettings {
  scale: number; // 1:X
  gridSpacing: number; // mm
  wallWidth: number; // mm
  trenchWidth: number; // mm
  footingWidth: number; // mm
  workingSpace: number; // mm (default 300)
  blindingOffset: number; // mm (default 50)
  // NEW SMM7 FIELDS
  foundationDepth: number; // mm (default 1000)
  concreteGrade: string;   // e.g. 'C20/25'
}

export interface ProjectState {
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  gridLines: GridLine[];
  columns: Column[];
  settings: ProjectSettings;
  generatedImageSrc: string | null;
}

export interface BackendSpecData {
  fileName: string;
  language: string;
  code: string;
  description: string;
}

// NEW INTERFACE FOR SMM7
export interface BoQItem {
  code: string;       // e.g., "D20.2.1"
  description: string;
  quantity: number;
  unit: string;       // "m3", "m2", "m", "nr"
}
