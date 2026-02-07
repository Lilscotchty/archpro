// types.ts

export enum AppModule {
  DASHBOARD = 'DASHBOARD',
  DRAWINGS = 'DRAWINGS',
  MEASUREMENT = 'MEASUREMENT',
  METHOD_STUDY = 'METHOD_STUDY',
  PHYSICS = 'PHYSICS'
}

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
  position: number; 
  orientation: GridOrientation;
}

export interface Column {
  intersectionId: string;
  type: 'square' | 'rectangular';
  width: number; 
  height: number;
}

export interface ProjectSettings {
  scale: number; 
  gridSpacing: number; 
  wallWidth: number; 
  trenchWidth: number; 
  footingWidth: number; 
  workingSpace: number; 
  blindingOffset: number; 
  // Global Engineering Settings
  foundationDepth: number; // in mm
  concreteGrade: string;
}

export interface ProjectState {
  imageSrc: string | null;
  imageWidth: number;
  imageHeight: number;
  gridLines: GridLine[];
  columns: Column[];
  settings: ProjectSettings;
  generatedImageSrc: string | null;
  // Shared Data Bridge
  calculatedTrenchLength?: number; // stored in meters
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
