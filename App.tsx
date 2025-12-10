import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { AppStep, ProjectState, GridLine, Column } from './types';
import { GoogleGenAI, Type } from "@google/genai";

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
      gridSpacing: 4000, // 4m default
      wallWidth: 230,
      trenchWidth: 600,
      footingWidth: 1000
    }
  });

  const handleAutoDetect = async () => {
    if (!project.imageSrc) return;
    
    setIsAnalyzing(true);
    try {
      // NOTE: In a production environment, this function would call the Python Cloud Function
      // defined in constants.ts. That function uses OpenCV (HoughLinesP) and Google Cloud Vision
      // to extract precise pixel coordinates and text labels.
      
      // For this client-side demo, we simulate this intelligent backend by using Gemini 
      // with a highly specific prompt to approximate the structure.
      
      // Parse base64
      const [meta, data] = project.imageSrc.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Improved prompt focusing on line geometry rather than just bubbles
      const prompt = `
        Analyze this architectural floor plan image to extract the structural grid system.
        
        The image contains grid lines marked by bubbles (circles) with text inside (A, B, C... or 1, 2, 3...).
        
        Your goal is to identify the location of the *lines* associated with these bubbles.
        1. Find all vertical grid lines. Return their X-axis position (0.0 to 1.0).
        2. Find all horizontal grid lines. Return their Y-axis position (0.0 to 1.0).
        3. Extract the label inside the bubble (e.g. "A", "1").
        
        Be precise. The lines usually run through the center of the columns.
        
        Return a JSON object:
        {
          "gridLines": [
            { "label": "A", "orientation": "vertical", "position": 0.15 },
            ...
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
             { inlineData: { mimeType, data } },
             { text: prompt }
          ]
        },
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
                     position: { type: Type.NUMBER, description: "Normalized coordinate (0.0 to 1.0)" }
                   },
                   required: ['label', 'orientation', 'position']
                }
              }
            }
          }
        }
      });
      
      if (!response.text) {
        throw new Error("No response from AI.");
      }

      // Robust JSON cleaning to prevent parsing errors
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
         jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```$/, '');
      }
      
      const result = JSON.parse(jsonStr);
      
      if (result.gridLines && Array.isArray(result.gridLines) && result.gridLines.length > 0) {
         const newLines: GridLine[] = result.gridLines.map((l: any) => ({
           id: Math.random().toString(36).substr(2, 9),
           label: l.label,
           orientation: l.orientation,
           position: l.orientation === 'vertical' 
             ? l.position * project.imageWidth 
             : l.position * project.imageHeight
         }));
         
         setProject(prev => ({
           ...prev,
           gridLines: newLines
         }));
      } else {
        throw new Error("AI could not confidently identify grid lines.");
      }
      
    } catch (e) {
      console.error(e);
      let msg = "AI Detection failed.";
      if (e instanceof Error) msg = e.message;
      alert(`${msg}\n\nFalling back to manual mode. Please use the sidebar tools to draw grid lines over the existing plan labels.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    
    // A3 Dimensions in pixels (approx 200 DPI for screen viewing/download)
    // A3 is 420mm x 297mm
    const PPI = 8; // pixels per mm
    const A3_WIDTH = 420 * PPI;
    const A3_HEIGHT = 297 * PPI;
    
    const canvas = document.createElement('canvas');
    canvas.width = A3_WIDTH;
    canvas.height = A3_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- SETUP DRAWING ---
    const { scale, gridSpacing, wallWidth, trenchWidth, footingWidth } = project.settings;
    
    // Fill Paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Coordinate System Logic
    // 1. Calculate average pixel distance between grid lines in the source image
    const vLines = project.gridLines.filter(l => l.orientation === 'vertical').sort((a,b) => a.position - b.position);
    const hLines = project.gridLines.filter(l => l.orientation === 'horizontal').sort((a,b) => a.position - b.position);

    let avgPixSpacing = 100; // fallback
    if (vLines.length > 1) {
      avgPixSpacing = (vLines[vLines.length-1].position - vLines[0].position) / (vLines.length - 1);
    } else if (hLines.length > 1) {
       avgPixSpacing = (hLines[hLines.length-1].position - hLines[0].position) / (hLines.length - 1);
    }

    // 2. Conversion Factor: Screen Pixels -> Real Millimeters
    // "gridSpacing" is what the user says the distance between grids is (e.g. 4000mm)
    const pxToRealMM = gridSpacing / avgPixSpacing;

    // 3. Conversion Factor: Real Millimeters -> A3 Canvas Pixels
    // Using User Scale (e.g., 1:100). 1mm on paper = 100mm real.
    // So RealMM / Scale = PaperMM.
    // PaperMM * PPI = CanvasPixels.
    const realMMToCanvasPx = (mm: number) => (mm / scale) * PPI;

    // Helper to map Source Image X/Y to A3 Canvas X/Y
    // We center the grid on the A3 sheet
    const sourceCenter = {
       x: vLines.length > 0 ? (vLines[0].position + vLines[vLines.length-1].position)/2 : project.imageWidth/2,
       y: hLines.length > 0 ? (hLines[0].position + hLines[hLines.length-1].position)/2 : project.imageHeight/2
    };
    
    const canvasCenter = { x: A3_WIDTH / 2, y: A3_HEIGHT / 2 };

    const mapX = (sourceX: number) => {
       const distFromCenterPx = sourceX - sourceCenter.x;
       const distRealMM = distFromCenterPx * pxToRealMM;
       return canvasCenter.x + realMMToCanvasPx(distRealMM);
    };

    const mapY = (sourceY: number) => {
       const distFromCenterPx = sourceY - sourceCenter.y;
       const distRealMM = distFromCenterPx * pxToRealMM;
       return canvasCenter.y + realMMToCanvasPx(distRealMM);
    };

    // --- DRAWING ---

    // 1. Trenches & Walls (Auto-connect adjacent columns on same grid lines)
    const trenchPx = realMMToCanvasPx(trenchWidth);
    const wallPx = realMMToCanvasPx(wallWidth);
    
    // Identify connections
    const connections: {x1: number, y1: number, x2: number, y2: number}[] = [];
    
    // Check horizontal connections
    hLines.forEach(h => {
       // Find columns on this grid line
       const colsOnLine = project.columns
         .filter(c => c.intersectionId.endsWith(`-${h.label}`)) // Assumes ID format "V-H"
         .map(c => {
             const vLabel = c.intersectionId.split('-')[0];
             const v = vLines.find(l => l.label === vLabel);
             return v ? { col: c, pos: v.position } : null;
         })
         .filter(item => item !== null)
         .sort((a, b) => a!.pos - b!.pos);

       // Connect adjacent
       for(let i=0; i < colsOnLine.length - 1; i++) {
          connections.push({
            x1: mapX(colsOnLine[i]!.pos),
            y1: mapY(h.position),
            x2: mapX(colsOnLine[i+1]!.pos),
            y2: mapY(h.position)
          });
       }
    });

    // Check vertical connections
    vLines.forEach(v => {
      const colsOnLine = project.columns
        .filter(c => c.intersectionId.startsWith(`${v.label}-`))
        .map(c => {
            const hLabel = c.intersectionId.split('-')[1];
            const h = hLines.find(l => l.label === hLabel);
            return h ? { col: c, pos: h.position } : null;
        })
        .filter(item => item !== null)
        .sort((a, b) => a!.pos - b!.pos);

      for(let i=0; i < colsOnLine.length - 1; i++) {
        connections.push({
          x1: mapX(v.position),
          y1: mapY(colsOnLine[i]!.pos),
          x2: mapX(v.position),
          y2: mapY(colsOnLine[i+1]!.pos)
        });
      }
    });

    // Draw Trenches (Bottom Layer)
    ctx.strokeStyle = '#94a3b8'; // Light Slate
    ctx.lineWidth = 1; 
    ctx.setLineDash([10, 5]); // Dashed for excavation limits
    connections.forEach(c => {
      // Draw parallel lines for trench width
      const dx = c.x2 - c.x1;
      const dy = c.y2 - c.y1;
      const len = Math.sqrt(dx*dx + dy*dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      const halfT = trenchPx / 2;
      
      ctx.beginPath();
      ctx.moveTo(c.x1 + nx*halfT, c.y1 + ny*halfT);
      ctx.lineTo(c.x2 + nx*halfT, c.y2 + ny*halfT);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(c.x1 - nx*halfT, c.y1 - ny*halfT);
      ctx.lineTo(c.x2 - nx*halfT, c.y2 - ny*halfT);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Draw Walls (Middle Layer)
    ctx.strokeStyle = '#334155'; // Darker Slate
    ctx.lineWidth = Math.max(1, wallPx); 
    connections.forEach(c => {
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
    });

    // 2. Grid Lines
    ctx.strokeStyle = '#ef4444'; // Red engineering lines
    ctx.lineWidth = 1;
    ctx.setLineDash([20, 10, 5, 10]); // Center line pattern
    
    // Draw Verticals extended
    vLines.forEach(v => {
       const x = mapX(v.position);
       ctx.beginPath();
       ctx.moveTo(x, 50); // Margin
       ctx.lineTo(x, A3_HEIGHT - 50);
       ctx.stroke();
       
       // Bubble
       ctx.save();
       ctx.setLineDash([]);
       ctx.fillStyle = '#ffffff';
       ctx.strokeStyle = '#000000';
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.arc(x, 40, 20, 0, Math.PI*2);
       ctx.fill();
       ctx.stroke();
       ctx.fillStyle = '#000000';
       ctx.font = 'bold 24px sans-serif';
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText(v.label, x, 40);
       ctx.restore();
    });

    // Draw Horizontals extended
    hLines.forEach(h => {
       const y = mapY(h.position);
       ctx.beginPath();
       ctx.moveTo(50, y);
       ctx.lineTo(A3_WIDTH - 50, y);
       ctx.stroke();

       // Bubble
       ctx.save();
       ctx.setLineDash([]);
       ctx.fillStyle = '#ffffff';
       ctx.strokeStyle = '#000000';
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.arc(40, y, 20, 0, Math.PI*2);
       ctx.fill();
       ctx.stroke();
       ctx.fillStyle = '#000000';
       ctx.font = 'bold 24px sans-serif';
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText(h.label, 40, y);
       ctx.restore();
    });
    ctx.setLineDash([]);


    // 3. Columns & Footings
    const footingPx = realMMToCanvasPx(footingWidth);
    const colPx = realMMToCanvasPx(400); // Standard 400mm column

    project.columns.forEach(col => {
       const parts = col.intersectionId.split('-');
       const v = vLines.find(l => l.label === parts[0]);
       const h = hLines.find(l => l.label === parts[1]);
       
       if (v && h) {
          const cx = mapX(v.position);
          const cy = mapY(h.position);

          // Footing (Hidden Line style)
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.strokeRect(cx - footingPx/2, cy - footingPx/2, footingPx, footingPx);
          
          // Column (Solid fill)
          ctx.fillStyle = '#000000';
          ctx.setLineDash([]);
          ctx.fillRect(cx - colPx/2, cy - colPx/2, colPx, colPx);
       }
    });

    // 4. Title Block
    const TB_W = 600;
    const TB_H = 200;
    const TB_X = A3_WIDTH - TB_W - 20;
    const TB_Y = A3_HEIGHT - TB_H - 20;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(TB_X, TB_Y, TB_W, TB_H);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(TB_X, TB_Y, TB_W, TB_H);
    
    // Lines inside title block
    ctx.beginPath();
    ctx.moveTo(TB_X + 200, TB_Y);
    ctx.lineTo(TB_X + 200, TB_Y + TB_H);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("AUTOFOUNDATION", TB_X + 100, TB_Y + TB_H/2);

    ctx.textAlign = 'left';
    ctx.font = '24px sans-serif';
    ctx.fillText(`SHEET: FOUNDATION PLAN`, TB_X + 220, TB_Y + 40);
    ctx.fillText(`SCALE: 1:${scale}`, TB_X + 220, TB_Y + 90);
    ctx.fillText(`GRID SPACING: ${gridSpacing}mm`, TB_X + 220, TB_Y + 120);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, TB_X + 220, TB_Y + 160);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const url = URL.createObjectURL(blob);
      setProject(prev => ({ ...prev, generatedImageSrc: url }));
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
      
      {/* Sidebar Controls */}
      <Sidebar 
        step={step} 
        setStep={setStep}
        project={project} 
        setProject={setProject}
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        onGenerate={handleGenerate}
        onAutoDetect={handleAutoDetect}
        isAnalyzing={isAnalyzing}
      />

      {/* Main Area */}
      <main className="flex-1 relative">
        {step === AppStep.GENERATION ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-8">
             {project.generatedImageSrc ? (
               <div className="flex flex-col items-center space-y-6 animate-fade-in w-full h-full">
                 <div className="flex items-center justify-between w-full max-w-5xl">
                    <h2 className="text-2xl font-bold text-green-400 flex items-center gap-2">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       A3 Plan Generated
                    </h2>
                    <div className="flex gap-3">
                       <a 
                          href={project.generatedImageSrc} 
                          download="foundation_plan_a3.png"
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2 text-sm font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          Download A3 PNG
                        </a>
                        <button 
                          onClick={() => setStep(AppStep.COLUMN_SELECTION)}
                          className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-slate-200 text-sm"
                        >
                          Edit Settings
                        </button>
                    </div>
                 </div>
                 
                 <div className="border-4 border-slate-800 rounded-lg overflow-hidden shadow-2xl flex-1 w-full max-w-5xl bg-slate-800">
                   <img src={project.generatedImageSrc} alt="Generated Plan" className="w-full h-full object-contain bg-white" />
                 </div>
               </div>
             ) : (
               <div className="flex flex-col items-center text-slate-400">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p>Processing geometry and scaling to A3...</p>
               </div>
             )}
          </div>
        ) : (
          <CanvasEditor 
            step={step} 
            project={project} 
            setProject={setProject} 
            currentTool={currentTool} 
          />
        )}
        
        {/* Helper Overlay */}
        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur border border-slate-700 p-3 rounded text-xs text-slate-400 max-w-xs shadow-xl pointer-events-none">
           <p className="font-bold text-slate-200 mb-1">Current Status:</p>
           {step === AppStep.UPLOAD && "Upload a floor plan image to begin."}
           {step === AppStep.GRID_MAPPING && (isAnalyzing ? "Analyzing grid structure..." : "Use AI Auto-Detect or manually place grid lines.")}
           {step === AppStep.COLUMN_SELECTION && "Configure dimensions in sidebar, then select columns on the plan."}
           {step === AppStep.GENERATION && "Rendering high-resolution A3 plan..."}
        </div>
      </main>

      {/* Code Modal */}
      {step === AppStep.BACKEND_SPECS && (
        <BackendPreview onClose={() => setStep(AppStep.GRID_MAPPING)} />
      )}

    </div>
  );
}

export default App;