
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
