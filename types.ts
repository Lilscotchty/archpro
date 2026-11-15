// types.ts (Update)

export enum AppModule {
  DASHBOARD = 'DASHBOARD',
  DRAWINGS = 'DRAWINGS',
  MEASUREMENT = 'MEASUREMENT',
  ELEVATIONS = 'ELEVATIONS',
  METHOD_STUDY = 'METHOD_STUDY',
  PHYSICS = 'PHYSICS',
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  GRID_MAPPING = 'GRID_MAPPING',
  PLAN_DESIGN = 'PLAN_DESIGN', // Renamed from COLUMN_SELECTION
  GENERATION = 'GENERATION',
  COLUMN_SELECTION = 'COLUMN_SELECTION', // legacy (CanvasEditor / Sidebar)
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
  sill?: number;   // mm – windows only (3D model)
  height?: number; // mm – doors / windows (3D model)
  flip?: boolean;   // doors: swing to the other side of the wall
  mirror?: boolean; // doors: hinge on the other jamb
}

/**
 * A traced drawing (image or PDF page) placed in model space.
 * Model coordinates are always real millimetres; the underlay carries its own scale.
 */
export interface Underlay {
  mmPerPx: number;       // real millimetres represented by one image pixel
  x: number;             // model position (mm) of the image's top-left corner
  y: number;
  rot: number;           // degrees, clockwise on screen
  opacity: number;       // 0..1
  visible: boolean;
  calibrated: boolean;   // false until the user sets the scale
  method: string;        // how the scale was set, for display
  name: string;
  kind: 'image' | 'pdf';
  paperMm?: { w: number; h: number }; // physical page size, known for PDFs
  page?: number;
  numPages?: number;
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
  workingSpace: number;
  blindingOffset: number;
  foundationDepth: number; // mm
  concreteGrade: string;
  mmPerUnit?: number; // millimetres represented by one drawing unit (1 on a blank sheet)
}

export interface BoQItem {
  code: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface BackendSpecData {
  fileName: string;
  language: string;
  code: string;
  description: string;
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
  underlay?: Underlay;
  settings: ProjectSettings;
  // Legacy support for calculation
  calculatedTrenchLength?: number;
}
