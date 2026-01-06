import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { AppStep, ProjectState, GridLine, Column } from './types';
import { GoogleGenAI, Type } from "@google/genai";

// --- CONSTANTS & HELPERS ---

const ISO_PENS = {
  HAIR: 0.13,
  THIN: 0.18,
  MED: 0.35,
  THICK: 0.50,
  XTHICK: 0.70
};

// Helper to create a concrete hatch pattern
const createConcretePattern = (ctx: CanvasRenderingContext2D, scale: number) => {
  const pCanvas = document.createElement('canvas');
  const size = 10 * scale;
  pCanvas.width = size;
  pCanvas.height = size;
  const pCtx = pCanvas.getContext('2d');
  if (!pCtx) return null;
  
  // Draw simplified concrete symbol (dots and triangles or just diagonal hash)
  // Standard 45deg hatch for section
  pCtx.strokeStyle = '#475569'; // Slate 600
  pCtx.lineWidth = 1 * scale;
  pCtx.beginPath();
  pCtx.moveTo(0, size);
  pCtx.lineTo(size, 0);
  pCtx.stroke();
  
  return ctx.createPattern(pCanvas, 'repeat');
};

type HistoryState = Pick<ProjectState, 'gridLines' | 'columns'>;

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [currentTool, setCurrentTool] = useState<'v-line' | 'h-line' | 'select' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [project, setProject] = useState<ProjectState>({
    imageSrc: null,
    imageWidth: 0,
    imageHeight: 0,
    gridLines: [],
    columns: [],
    generatedImageSrc: null,
    settings: {
      scale: 100,
      gridSpacing: 4000,
      wallWidth: 225,      
      trenchWidth: 600,    
      footingWidth: 1000,
      workingSpace: 300,
      blindingOffset: 50
    }
  });

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const saveHistory = useCallback(() => {
    const currentHistory: HistoryState = {
      gridLines: project.gridLines,
      columns: project.columns,
    };
    setPast(prev => [...prev.slice(-19), currentHistory]);
    setFuture([]);
  }, [project.gridLines, project.columns]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const currentHistory: HistoryState = {
      gridLines: project.gridLines,
      columns: project.columns,
    };
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [currentHistory, ...prev]);
    setProject(prev => ({ ...prev, gridLines: previous.gridLines, columns: previous.columns }));
  }, [past, project.gridLines, project.columns]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const currentHistory: HistoryState = {
      gridLines: project.gridLines,
      columns: project.columns,
    };
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, currentHistory]);
    setProject(prev => ({ ...prev, gridLines: next.gridLines, columns: next.columns }));
  }, [future, project.gridLines, project.columns]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleAutoDetect = async () => {
    if (!project.imageSrc) return;
    setIsAnalyzing(true);
    try {
      const [meta, data] = project.imageSrc.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze architectural plan to find structural grid system lines. Return JSON with 'gridLines' containing 'label', 'orientation' (vertical/horizontal), and normalized 'position' (0.0 to 1.0).`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash', // Updated to latest stable model if available
        contents: { parts: [{ inlineData: { mimeType, data } }, { text: prompt }] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              gridLines: {
                type: Type.ARRAY,
                items: {
                   type: Type.OBJECT,
                   properties: {
                     label: { type: Type.STRING },
                     orientation: { type: Type.STRING, enum: ['vertical', 'horizontal'] },
                     position: { type: Type.NUMBER }
                   },
                   required: ['label', 'orientation', 'position']
                }
              }
            }
          }
        }
      });
      if (!response.text) throw new Error("No response from AI.");
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```$/, '');
      const result = JSON.parse(jsonStr);
      if (result.gridLines) {
         saveHistory();
         const newLines: GridLine[] = result.gridLines.map((l: any) => ({
           id: Math.random().toString(36).substr(2, 9),
           label: l.label,
           orientation: l.orientation,
           position: l.orientation === 'vertical' ? l.position * project.imageWidth : l.position * project.imageHeight
         }));
         setProject(prev => ({ ...prev, gridLines: newLines }));
      }
    } catch (e) { alert("Detection failed."); } finally { setIsAnalyzing(false); }
  };

  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    
    // --- SETUP CANVAS ---
    const PPI = 300 / 25.4; // High res for print quality (300 DPI)
    const PAPER_W = 420; // A3 Width mm
    const PAPER_H = 297; // A3 Height mm
    const CANVAS_W = PAPER_W * PPI;
    const CANVAS_H = PAPER_H * PPI;
    
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const { scale, gridSpacing, wallWidth, footingWidth, workingSpace, blindingOffset } = project.settings;

    // Helper: mm to pixels on canvas
    const toPx = (mm: number) => (mm / scale) * PPI;
    const px = (val: number) => val * (PPI/25.4); // Helper for raw PPI sizing

    // Stroke Weights (in pixels)
    const W_HAIR = toPx(ISO_PENS.HAIR * scale); // 0.13mm equivalent at scale
    const W_THIN = toPx(ISO_PENS.THIN * scale);
    const W_MED = toPx(ISO_PENS.MED * scale);
    const W_THICK = toPx(ISO_PENS.THICK * scale);
    const W_XTHICK = toPx(ISO_PENS.XTHICK * scale);

    // --- GRID CALCULATION ---
    const vLines = [...project.gridLines].filter(l => l.orientation === 'vertical').sort((a,b) => a.position - b.position);
    const hLines = [...project.gridLines].filter(l => l.orientation === 'horizontal').sort((a,b) => a.position - b.position);

    if (vLines.length < 1 || hLines.length < 1) return;

    // Determine scale factor from image pixels to real world mm
    let pxPerRealMM = (vLines.length > 1) 
      ? (vLines[vLines.length-1].position - vLines[0].position) / (gridSpacing * (vLines.length - 1))
      : 0.1;

    const totalGridW = vLines.length > 1 ? (gridSpacing * (vLines.length-1)) : 1000;
    const totalGridH = hLines.length > 1 ? (gridSpacing * (hLines.length-1)) : 1000;
    
    // Center logic
    const cX = (CANVAS_W / 2) - (toPx(totalGridW) / 2);
    const cY = (CANVAS_H / 2) - (toPx(totalGridH) / 2);

    const mapX = (x: number) => cX + toPx((x - vLines[0].position) / pxPerRealMM);
    const mapY = (y: number) => cY + toPx((y - hLines[0].position) / pxPerRealMM);

    // --- DATA PREPARATION (IDENTIFY SEGMENTS) ---
    interface Segment { x: number, y: number, w: number, h: number, type: 'v' | 'h' }
    const walls: Segment[] = [];
    const footings: Segment[] = [];
    const excavations: Segment[] = [];
    const columns: {x: number, y: number}[] = [];

    const fW = toPx(footingWidth);
    const wW = toPx(wallWidth);
    const tW = toPx(footingWidth + workingSpace); // Trench width
    const bW = toPx(footingWidth + (blindingOffset * 2)); // Blinding width

    const processLine = (lines: GridLine[], isVert: boolean) => {
      lines.forEach(line => {
        const lineCols = project.columns
          .filter(c => c.intersectionId.includes(line.label))
          .map(c => {
             // Find coordinate of this column on the CURRENT line
             const parts = c.intersectionId.split('-');
             const orthLabel = parts[0] === line.label ? parts[1] : parts[0];
             const orthLine = (isVert ? hLines : vLines).find(l => l.label === orthLabel);
             return orthLine ? { pos: orthLine.position, id: c.intersectionId } : null;
          }).filter(x => x).sort((a,b) => a!.pos - b!.pos);

        // Create continuous segments between adjacent selected columns
        for(let i=0; i<lineCols.length-1; i++) {
           const start = isVert ? mapY(lineCols[i]!.pos) : mapX(lineCols[i]!.pos);
           const end = isVert ? mapY(lineCols[i+1]!.pos) : mapX(lineCols[i+1]!.pos);
           const center = isVert ? mapX(line.position) : mapY(line.position);
           const length = Math.abs(end - start);
           const segX = isVert ? center - (wW/2) : start;
           const segY = isVert ? start : center - (wW/2);
           const segW = isVert ? wW : length;
           const segH = isVert ? length : wW;

           walls.push({ x: segX, y: segY, w: segW, h: segH, type: isVert ? 'v' : 'h' });
           
           // Footing Segment
           const fSegX = isVert ? center - (fW/2) : start - (fW/2); // Extend H-footing slightly?
           const fSegY = isVert ? start - (fW/2) : center - (fW/2);
           const fSegW = isVert ? fW : length + fW; // Overlap corners
           const fSegH = isVert ? length + fW : fW;
           footings.push({ x: fSegX, y: fSegY, w: fSegW, h: fSegH, type: isVert ? 'v' : 'h' });

           // Excavation Segment
           const eSegX = isVert ? center - (tW/2) : start - (tW/2);
           const eSegY = isVert ? start - (tW/2) : center - (tW/2);
           const eSegW = isVert ? tW : length + tW;
           const eSegH = isVert ? length + tW : tW;
           excavations.push({ x: eSegX, y: eSegY, w: eSegW, h: eSegH, type: isVert ? 'v' : 'h' });
        }

        // Store Column Centers
        lineCols.forEach(c => {
           columns.push({ x: mapX(line.position), y: mapY(isVert ? c!.pos : line.position) }); // Fix Y coord logic
        });
      });
    };

    processLine(hLines, false);
    processLine(vLines, true);
    
    // Fix columns array (it might have duplicates or bad mapping due to generic logic above)
    // Simpler: iterate project.columns directly
    const validColumns: {x: number, y: number}[] = [];
    project.columns.forEach(c => {
       const [l1, l2] = c.intersectionId.split('-');
       const line1 = project.gridLines.find(l => l.label === l1);
       const line2 = project.gridLines.find(l => l.label === l2);
       if(line1 && line2) {
          validColumns.push({ 
            x: mapX(line1.orientation === 'vertical' ? line1.position : line2.position),
            y: mapY(line1.orientation === 'vertical' ? line2.position : line1.position)
          });
       }
    });


    // --- RENDERING LAYERS ---

    // 1. Excavation (Dashed)
    ctx.strokeStyle = '#94a3b8'; // Slate 400
    ctx.lineWidth = W_HAIR;
    ctx.setLineDash([toPx(100), toPx(100)]); // 100mm dashes
    excavations.forEach(r => ctx.strokeRect(r.x, r.y, r.w, r.h));
    
    // 2. Blinding (Optional - skipped to keep clean, or drawn light grey)
    
    // 3. Footings (Solid Fill White + Outline)
    // We draw them all filled white first to cover excavation lines
    ctx.fillStyle = '#FFFFFF';
    footings.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
    
    // Then stroke. Note: Overlapping strokes is acceptable for footings, 
    // but to look cleaner we can union them. For simplicity, we draw borders.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = W_MED;
    ctx.setLineDash([]);
    footings.forEach(r => ctx.strokeRect(r.x, r.y, r.w, r.h));

    // 4. Walls (Solid Grey/Hatched - Merged visually)
    // Draw all wall fills first (merges intersections)
    const hatch = createConcretePattern(ctx, 1);
    ctx.fillStyle = hatch || '#334155'; // Fallback to Slate 700
    walls.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
    
    // Draw Wall Outlines (Thick)
    // To avoid internal crossing lines at intersections, we only stroke the outer edges?
    // Hard to do without union logic. 
    // Standard approach: Draw Fill, then Stroke. 
    // To make it look "Standard", we often use Solid Black for walls in 1:100.
    ctx.fillStyle = '#1e293b'; // Very Dark Slate (almost black)
    walls.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));

    // 5. Columns (Load bearing points - Solid Black)
    const colSize = wW * 1.2; // Slightly larger than wall
    ctx.fillStyle = '#000000';
    validColumns.forEach(c => {
       ctx.fillRect(c.x - colSize/2, c.y - colSize/2, colSize, colSize);
    });

    // 6. Grid System (Red Dashed)
    const ext = toPx(2500); // 2.5m extension
    ctx.strokeStyle = '#ef4444'; // Red 500
    ctx.lineWidth = W_HAIR;
    // Standard Grid Line: Long Dash, Dot, Long Dash
    ctx.setLineDash([toPx(800), toPx(150), toPx(100), toPx(150)]); 
    
    vLines.forEach(v => {
       const x = mapX(v.position);
       ctx.beginPath(); ctx.moveTo(x, cY - ext); ctx.lineTo(x, cY + toPx(totalGridH) + ext); ctx.stroke();
    });
    hLines.forEach(h => {
       const y = mapY(h.position);
       ctx.beginPath(); ctx.moveTo(cX - ext, y); ctx.lineTo(cX + toPx(totalGridW) + ext, y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // 7. Dimensions & Annotations
    const BUBBLE_R = toPx(350); 
    const TEXT_SIZE = toPx(300); // 3mm text height roughly
    
    ctx.font = `bold ${TEXT_SIZE}px Inter, sans-serif`;
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.lineWidth = W_THIN;

    // Bubbles
    const drawBubble = (x: number, y: number, label: string) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, BUBBLE_R, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#000000'; ctx.stroke();
      ctx.fillStyle = '#000000'; ctx.fillText(label, x, y);
    };

    vLines.forEach(v => drawBubble(mapX(v.position), cY - ext - BUBBLE_R, v.label));
    hLines.forEach(h => drawBubble(cX - ext - BUBBLE_R, mapY(h.position), h.label));

    // Architectural Dimensions
    const drawDimLine = (x1: number, y1: number, x2: number, y2: number, val: string, offset: number, isVert: boolean) => {
       ctx.strokeStyle = '#000000';
       ctx.lineWidth = W_HAIR;
       const tickSz = toPx(150);
       
       // Main Line
       ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

       // Architectural Ticks (45 degree slash)
       ctx.lineWidth = W_MED;
       const drawTick = (tx: number, ty: number) => {
         ctx.beginPath(); 
         ctx.moveTo(tx - tickSz, ty + tickSz); 
         ctx.lineTo(tx + tickSz, ty - tickSz); 
         ctx.stroke();
       };
       drawTick(x1, y1);
       drawTick(x2, y2);

       // Text
       ctx.fillStyle = '#000000';
       ctx.font = `${TEXT_SIZE}px Inter, sans-serif`;
       ctx.save();
       ctx.translate((x1+x2)/2, (y1+y2)/2);
       if (isVert) {
          ctx.rotate(-Math.PI/2);
          ctx.fillText(val, 0, -toPx(150)); // Text above line
       } else {
          ctx.fillText(val, 0, -toPx(150));
       }
       ctx.restore();
    };

    // Render Dimension Tiers
    const dimGap = toPx(800);
    const tier1 = cY - ext - (BUBBLE_R*2) - dimGap; // Detailed
    const tier2 = tier1 - dimGap - toPx(400); // Overall

    // Horizontal Dims (Top)
    for(let i=0; i<vLines.length-1; i++) {
       const x1 = mapX(vLines[i].position);
       const x2 = mapX(vLines[i+1].position);
       drawDimLine(x1, tier1, x2, tier1, project.settings.gridSpacing.toString(), 0, false);
    }
    // Overall H
    drawDimLine(mapX(vLines[0].position), tier2, mapX(vLines[vLines.length-1].position), tier2, totalGridW.toString(), 0, false);

    // Vertical Dims (Left)
    const vTier1 = cX - ext - (BUBBLE_R*2) - dimGap;
    const vTier2 = vTier1 - dimGap - toPx(400);
    
    for(let i=0; i<hLines.length-1; i++) {
      const y1 = mapY(hLines[i].position);
      const y2 = mapY(hLines[i+1].position);
      drawDimLine(vTier1, y1, vTier1, y2, project.settings.gridSpacing.toString(), 0, true);
   }
   drawDimLine(vTier2, mapY(hLines[0].position), vTier2, mapY(hLines[hLines.length-1].position), totalGridH.toString(), 0, true);

    // 8. Title Block (Bottom Right)
    const tbW = toPx(6000); // 6m wide on paper (scaled)
    const tbH = toPx(2500);
    const tX = CANVAS_W - toPx(500) - tbW;
    const tY = CANVAS_H - toPx(500) - tbH;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(tX, tY, tbW, tbH);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = W_THICK; ctx.strokeRect(tX, tY, tbW, tbH);
    
    // Internal lines
    ctx.lineWidth = W_THIN;
    ctx.beginPath(); ctx.moveTo(tX, tY + tbH/2); ctx.lineTo(tX+tbW, tY + tbH/2); ctx.stroke();
    
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.font = `bold ${toPx(400)}px Inter, sans-serif`;
    ctx.fillText("FOUNDATION LAYOUT PLAN", tX + toPx(150), tY + toPx(350));
    
    ctx.font = `${toPx(250)}px Inter, sans-serif`;
    ctx.fillText(`PROJ: ARCH-AUTO-GEN | SCALE 1:${scale}`, tX + toPx(150), tY + tbH - toPx(600));
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, tX + toPx(150), tY + tbH - toPx(250));

    // Save
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
    if (blob) setProject(prev => ({ ...prev, generatedImageSrc: URL.createObjectURL(blob) }));
  };

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
      <Sidebar 
        step={step} setStep={setStep} project={project} setProject={setProject}
        currentTool={currentTool} setCurrentTool={setCurrentTool}
        onGenerate={handleGenerate} onAutoDetect={handleAutoDetect}
        isAnalyzing={isAnalyzing} onUndo={undo} onRedo={redo}
        canUndo={past.length > 0} canRedo={future.length > 0}
      />
      <main className="flex-1 relative flex items-center justify-center overflow-hidden">
        {step === AppStep.GENERATION ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-8">
             {project.generatedImageSrc ? (
               <div className="flex flex-col items-center space-y-4 animate-fade-in w-full h-full">
                 <div className="flex items-center justify-between w-full max-w-5xl px-2">
                    <h2 className="text-xl font-bold text-blue-400">Structural Layout (Centered & Verified)</h2>
                    <div className="flex gap-2">
                       <a href={project.generatedImageSrc} download="foundation_pro.png" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium">Download PNG</a>
                       <button onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-slate-200 text-sm">Edit</button>
                    </div>
                 </div>
                 <div className="border border-slate-700 rounded overflow-hidden shadow-2xl flex-1 w-full max-w-5xl bg-slate-800 flex items-center justify-center p-4">
                   <img src={project.generatedImageSrc} alt="Generated Plan" className="max-w-full max-h-full object-contain shadow-lg" style={{backgroundColor: 'white'}} />
                 </div>
               </div>
             ) : <div className="text-slate-400 animate-pulse">Calculating load paths and setting out...</div>}
          </div>
        ) : (
          <CanvasEditor step={step} project={project} setProject={setProject} currentTool={currentTool} onCommitChange={saveHistory} />
        )}
      </main>
      {step === AppStep.BACKEND_SPECS && <BackendPreview onClose={() => setStep(AppStep.GRID_MAPPING)} />}
    </div>
  );
}
export default App;
