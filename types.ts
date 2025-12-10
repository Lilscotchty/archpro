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
  position: number; // Pixel coordinate (X for vertical, Y for horizontal)
  orientation: GridOrientation;
}

export interface Intersection {
  id: string;
  x: number;
  y: number;
  vLabel: string;
  hLabel: string;
}

export interface Column {
  intersectionId: string;
  type: 'square' | 'rectangular';
  width: number; // in pixels (mock scale)
  height: number;
}

export interface ProjectSettings {
  scale: number; // 1:X (e.g., 100)
  gridSpacing: number; // Real world mm between grids (approx)
  wallWidth: number; // mm
  trenchWidth: number; // mm
  footingWidth: number; // mm
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