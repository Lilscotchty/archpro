// types.ts (Update)

export enum AppModule {
  DASHBOARD = 'DASHBOARD',
  DRAWINGS = 'DRAWINGS',
  MEASUREMENT = 'MEASUREMENT',
  // New Modules can be added later
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  GRID_MAPPING = 'GRID_MAPPING',
  PLAN_DESIGN = 'PLAN_DESIGN', // Renamed from COLUMN_SELECTION
  GENERATION = 'GENERATION',
}

export type GridOrientation = 'vertical' | 'horizontal';

export interface GridLine {
  id: string;
  label: string;
  position: number; 
  orientation: GridOrientation;
}

// NEW: Architectural Elements
export type ElementType = 'wall' | 'column' | 'door' | 'window' | 'opening';

export interface ArchElement {
  id: string;
  type: ElementType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gridRef: string; // e.g., "A-1" to "A-2"
}

export interface RoofSettings {
  type: 'gable' | 'hip' | 'flat' | 'shed';
  pitch: number; // degrees (e.g., 30)
  overhang: number; // mm (e.g., 600)
}

export interface BuildingSpecs {
  floors: number;
  floorHeight: number; // mm (e.g., 3000)
  plinthHeight: number; // mm (e.g., 450)
  roof: RoofSettings;
}

export interface ProjectSettings {
  scale: number; 
  gridSpacing: number; 
  wallWidth: number; // 225mm
  trenchWidth: number; // 450mm
  footingWidth: number; // 1000mm
  // ... other structural settings
}

export interface ProjectState {
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  gridLines: GridLine[];
  
  // NEW: The Building Model
  elements: ArchElement[]; // Replaces 'columns' logic
  specs: BuildingSpecs;

  generatedImageSrc: string | null;
  settings: ProjectSettings;
  // Legacy support for calculation
  calculatedTrenchLength?: number;
}
