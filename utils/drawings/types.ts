// utils/drawings/types.ts — every drawing the app makes or receives is stored under a designated id and kept with the data that produced it.

export type DrawingKind = 'source_plan' | 'floor_plan' | 'foundation_plan' | 'elevations';
export type DrawingOrigin = 'drafting' | 'elevation' | 'measurement' | 'upload';

export interface DrawingMeta {
  id: string;            // uuid, assigned once
  ref: string;           // designation, e.g. P7K2-FLOOR-PLAN: stable, so re-generating updates the same drawing
  projectId: string;
  kind: DrawingKind;
  title: string;
  origin: DrawingOrigin;   // which page produced it
  generated: boolean;      // true when the app made it automatically
  mime: string;
  width: number; height: number;
  version: number;
  createdAt: string; updatedAt: string;
  backend: 'cloud' | 'local';
}

export interface SaveInput {
  kind: DrawingKind; refSuffix: string; title: string; origin: DrawingOrigin; generated: boolean;
  blob: Blob; width: number; height: number;
  /** The page's data that produced the drawing (model, settings, specs ...). Stored with the drawing. */
  data: unknown;
}

export const KIND_LABEL: Record<DrawingKind, string> = {
  source_plan: 'Source drawing', floor_plan: 'Floor plan', foundation_plan: 'Foundation plan', elevations: 'Elevations',
};
export const ORIGIN_LABEL: Record<DrawingOrigin, string> = {
  drafting: 'Drafting Studio', elevation: 'Elevation Studio', measurement: 'Measurement (auto)', upload: 'Uploaded',
};
