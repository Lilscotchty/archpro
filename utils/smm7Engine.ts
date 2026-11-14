// utils/smm7Engine.ts
import { ProjectSettings, BoQItem } from '../types';

export const generateSMM7BoQ = (
  lengthMeters: number, 
  settings: ProjectSettings
): BoQItem[] => {
  const boq: BoQItem[] = [];
  
  // 1. Setup Dimensions (Convert mm to meters)
  const depth = settings.foundationDepth / 1000;
  const width = settings.trenchWidth / 1000; 
  const footingW = settings.footingWidth / 1000;
  const concreteThickness = 0.225; // Standard strip thickness assumed if not specified

  // --- SECTION D: GROUNDWORK (D20) ---

  // Rule D20.1: Depth Categories
  let depthRange = "";
  if (depth <= 0.25) depthRange = "maximum depth not exceeding 0.25m";
  else if (depth <= 1.00) depthRange = "maximum depth exceeding 0.25m but not exceeding 1.00m";
  else if (depth <= 2.00) depthRange = "maximum depth exceeding 1.00m but not exceeding 2.00m";
  else {
    const stage = Math.ceil((depth - 2) / 2) * 2 + 2;
    depthRange = `maximum depth exceeding ${stage - 2}.00m but not exceeding ${stage}.00m`;
  }

  // Item 1: Excavation
  const excavVol = lengthMeters * width * depth;
  boq.push({
    code: "D20.2.1",
    description: `Excavating trenches; ${depthRange}; starting from ground level.`,
    quantity: parseFloat(excavVol.toFixed(2)),
    unit: "m3"
  });

  // Item 2: Earthwork Support (D20.8)
  // Rule: Distance between faces
  let supportCat = "";
  if (width <= 2.00) supportCat = "distance between opposing faces not exceeding 2.00m";
  else if (width <= 4.00) supportCat = "distance between opposing faces 2.00m - 4.00m";
  else supportCat = "distance between opposing faces exceeding 4.00m";

  // Measure both faces: 2 * Length * Depth
  if (depth > 0.25) {
    boq.push({
      code: "D20.8.1",
      description: `Earthwork support; ${supportCat}.`,
      quantity: parseFloat((lengthMeters * depth * 2).toFixed(2)),
      unit: "m2"
    });
  }

  // Item 3: Compacting Bottoms (D20.13)
  boq.push({
    code: "D20.13.1",
    description: "Compacting bottom of excavations.",
    quantity: parseFloat((lengthMeters * width).toFixed(2)),
    unit: "m2"
  });

  // --- SECTION E: CONCRETE (E10) ---

  // Rule E10: Thickness Categories
  let thickDesc = "";
  if (concreteThickness <= 0.15) thickDesc = "thickness not exceeding 150mm";
  else if (concreteThickness <= 0.45) thickDesc = "thickness 150mm - 450mm";
  else thickDesc = "thickness exceeding 450mm";

  const concreteVol = lengthMeters * footingW * concreteThickness;
  boq.push({
    code: "E10.4.1",
    description: `Plain concrete foundations; ${settings.concreteGrade}; poured on or against earth; ${thickDesc}.`,
    quantity: parseFloat(concreteVol.toFixed(2)),
    unit: "m3"
  });

  return boq;
};

/**
 * Substructure items that follow from the same trench length as the strip foundation:
 * blockwork up to DPC, damp-proof course, filling and disposal of surplus excavated material.
 * wallHeightM = height of wall from top of concrete to DPC (metres).
 */
export const generateSubstructureBoQ = (
  lengthMeters: number,
  settings: ProjectSettings,
  wallHeightM: number
): BoQItem[] => {
  const depth = settings.foundationDepth / 1000;
  const width = settings.trenchWidth / 1000;
  const footingW = settings.footingWidth / 1000;
  const wallT = settings.wallWidth / 1000;
  const concreteThickness = 0.225; // keep in step with generateSMM7BoQ

  const excavVol = lengthMeters * width * depth;
  const concreteVol = lengthMeters * footingW * concreteThickness;
  const wallBelowGround = lengthMeters * wallT * Math.max(0, depth - concreteThickness);
  const filling = Math.max(0, excavVol - concreteVol - wallBelowGround);
  const disposal = Math.max(0, excavVol - filling);
  const r2 = (n: number) => parseFloat(n.toFixed(2));
  const wallMm = Math.round(settings.wallWidth);

  const out: BoQItem[] = [];
  if (wallHeightM > 0) {
    out.push({
      code: 'F10.1.1',
      description: `Blockwork in foundation walls; ${wallMm}mm thick; in cement mortar; vertical, straight.`,
      quantity: r2(lengthMeters * wallHeightM),
      unit: 'm2',
    });
    out.push({
      code: 'J40.1.1',
      description: `Damp-proof course; horizontal; width ${wallMm}mm; bedded in cement mortar.`,
      quantity: r2(lengthMeters * wallT),
      unit: 'm2',
    });
  }
  if (filling > 0) {
    out.push({
      code: 'D20.9.1',
      description: 'Filling to excavations with excavated material; deposited in layers and compacted.',
      quantity: r2(filling),
      unit: 'm3',
    });
  }
  if (disposal > 0) {
    out.push({
      code: 'D20.6.1',
      description: 'Disposal of surplus excavated material; off site.',
      quantity: r2(disposal),
      unit: 'm3',
    });
  }
  return out;
};
