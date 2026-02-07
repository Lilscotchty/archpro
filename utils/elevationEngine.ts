import { ProjectState, ArchElement } from '../types';

interface DrawCommand {
  type: 'rect' | 'poly' | 'line' | 'text';
  coords: number[]; // [x, y, w, h] or [x1, y1, x2, y2...]
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
}

export const generateElevation = (project: ProjectState, view: 'front' | 'side'): DrawCommand[] => {
  const cmds: DrawCommand[] = [];
  const { floors, floorHeight, plinthHeight, roof } = project.specs;
  
  // 1. Calculate Building Bounds (in Grid Units)
  // We project all elements onto a single axis (X for Front, Y for Side)
  const elements = project.elements.filter(e => e.type === 'wall' || e.type === 'column');
  if (elements.length === 0) return [];

  // Flatten logic: For Front view, we care about min/max X.
  const xValues = elements.flatMap(e => [e.x1, e.x2]);
  const minDim = Math.min(...xValues);
  const maxDim = Math.max(...xValues);
  const buildingWidth = maxDim - minDim;
  const totalHeight = (floors * floorHeight) + plinthHeight;

  // Ground Line
  cmds.push({ type: 'line', coords: [-1000, 0, buildingWidth + 1000, 0], stroke: '#000', strokeWidth: 4 });

  // 2. Draw Floor Levels (The Shell)
  let currentY = -plinthHeight; // Start at Plinth
  
  // Plinth
  cmds.push({ 
    type: 'rect', 
    coords: [minDim, 0, buildingWidth, -plinthHeight], 
    stroke: '#000', strokeWidth: 2, fill: '#e5e7eb' 
  });

  // Walls (Stacked Floors)
  for (let f = 0; f < floors; f++) {
    cmds.push({
      type: 'rect',
      coords: [minDim, currentY, buildingWidth, -floorHeight],
      stroke: '#000',
      strokeWidth: 2,
      fill: '#fff'
    });
    
    // Add Slab Line
    if (f > 0) {
      cmds.push({ type: 'line', coords: [minDim, currentY, maxDim, currentY], stroke: '#9ca3af', strokeWidth: 1 });
    }
    
    // 3. Project Windows/Doors (Simplified Projection)
    // We look for elements that align with this view
    const visibleOpenings = project.elements.filter(e => 
      (e.type === 'window' || e.type === 'door') &&
      // Simple visibility check: is the wall parallel to view?
      // For now, we just project ALL openings for the demo
      true
    );

    visibleOpenings.forEach(op => {
       // Mock position mapping
       const opX = (op.x1 + op.x2) / 2;
       const opW = 1200; // Standard window width
       const opH = op.type === 'door' ? 2100 : 1200;
       const sill = op.type === 'door' ? 0 : 900;
       
       const drawY = currentY - sill - opH; // Coordinates are negative going up
       
       cmds.push({
         type: 'rect',
         coords: [opX - (opW/2), currentY - sill, opW, -opH],
         stroke: '#000', strokeWidth: 1, fill: '#bfdbfe'
       });
    });

    currentY -= floorHeight;
  }

  // 4. Draw Roof
  const roofH = (Math.tan(roof.pitch * (Math.PI/180)) * (buildingWidth / 2));
  
  if (roof.type === 'gable') {
    cmds.push({
      type: 'poly',
      coords: [
        minDim - roof.overhang, currentY, // Left Eave
        maxDim + roof.overhang, currentY, // Right Eave
        (minDim + maxDim) / 2, currentY - roofH // Ridge
      ],
      stroke: '#000', strokeWidth: 3, fill: '#cbd5e1'
    });
  } else if (roof.type === 'flat') {
     cmds.push({
      type: 'rect',
      coords: [minDim - roof.overhang, currentY, buildingWidth + (roof.overhang*2), -300],
      stroke: '#000', strokeWidth: 3, fill: '#cbd5e1'
    });
  }

  return cmds;
};
