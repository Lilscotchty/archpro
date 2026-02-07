// utils/smm7Engine.ts
import { ProjectSettings, BoQItem } from '../types';

export const generateSMM7BoQ = (
  netTrenchLength: number, // in meters (overlaps deducted)
  settings: ProjectSettings
): BoQItem[] => {
  const boq: BoQItem[] = [];
  
  // Convert mm to meters for calculation
  const depth = settings.foundationDepth / 1000;
  const width = settings.trenchWidth / 1000; 
  const footingW = settings.footingWidth / 1000;
  
  // =========================================================
  // SECTION D: GROUNDWORK (D20 Excavation & Filling)
  // =========================================================
  
  // 1. DETERMINE DEPTH CATEGORY (SMM7 D20 Rule)
  // Rules: <=0.25, 0.25-1.00, 1.00-2.00, then 2m stages
  let depthRange = "";
  if (depth <= 0.25) {
    depthRange = "maximum depth not exceeding 0.25m";
  } else if (depth <= 1.00) {
    depthRange = "maximum depth exceeding 0.25m but not exceeding 1.00m";
  } else if (depth <= 2.00) {
    depthRange = "maximum depth exceeding 1.00m but not exceeding 2.00m";
  } else {
    // Logic for deep trenches > 2m (e.g. 3m depth = "exceeding 2.00m but n.e 4.00m")
    const stageLower = Math.floor((depth - 0.01) / 2) * 2;
    const stageUpper = stageLower + 2;
    depthRange = `maximum depth exceeding ${stageLower}.00m but not exceeding ${stageUpper}.00m`;
  }

  // 2. EXCAVATE TRENCHES (Item D20.2.*)
  // Volume = Length * Width * Depth
  const excavationVol = netTrenchLength * width * depth;
  
  boq.push({
    code: "D20.2.1", // Adjust suffix based on exact SMM7 lookup if needed
    description: `Excavating trenches; ${depthRange}; starting from ground level.`,
    quantity: parseFloat(excavationVol.toFixed(2)),
    unit: "m3"
  });

  // 3. EARTHWORK SUPPORT (Item D20.8.*)
  // Rule: Measure area of exposed faces. Distance between faces matters.
  // We calculate both sides: Length * Depth * 2
  
  let supportCategory = "";
  if (width <= 2.00) {
    supportCategory = "distance between opposing faces not exceeding 2.00m";
  } else if (width <= 4.00) {
    supportCategory = "distance between opposing faces exceeding 2.00m but not exceeding 4.00m";
  } else {
    supportCategory = "distance between opposing faces exceeding 4.00m";
  }

  const supportArea = netTrenchLength * depth * 2;

  // Only apply support if depth warrants it (Standard practice >0.25m)
  if (depth > 0.25) {
    boq.push({
      code: "D20.8.1",
      description: `Earthwork support; ${supportCategory}.`,
      quantity: parseFloat(supportArea.toFixed(2)),
      unit: "m2"
    });
  }

  // 4. COMPACTING BOTTOMS (Item D20.13.*)
  // Measured in m2 (Length * Width)
  const bottomArea = netTrenchLength * width;
  boq.push({
    code: "D20.13.1",
    description: "Compacting bottom of excavations.",
    quantity: parseFloat(bottomArea.toFixed(2)),
    unit: "m2"
  });

  // =========================================================
  // SECTION E: IN-SITU CONCRETE (E10)
  // =========================================================

  // 5. CONCRETE FOUNDATIONS
  // Assuming strip footing thickness.
  // NOTE: If no specific thickness is given, we assume a ratio or standard 225mm.
  // For this engine, let's derive it or default it. 
  const concreteThickness = 0.225; // Standard strip thickness 225mm

  // Thickness Category (SMM7 E10 Rule)
  let thickDesc = "";
  if (concreteThickness <= 0.15) thickDesc = "thickness not exceeding 150mm";
  else if (concreteThickness <= 0.45) thickDesc = "thickness exceeding 150mm but not exceeding 450mm";
  else thickDesc = "thickness exceeding 450mm";

  const concreteVol = netTrenchLength * footingW * concreteThickness;

  boq.push({
    code: "E10.4.1",
    description: `Plain concrete foundations; ${settings.concreteGrade || 'C20/25'}; poured on or against earth; ${thickDesc}.`,
    quantity: parseFloat(concreteVol.toFixed(2)),
    unit: "m3"
  });

  return boq;
};
