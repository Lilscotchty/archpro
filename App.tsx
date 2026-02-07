import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { MeasurementModule } from './components/MeasurementModule';
import { AppStep, ProjectState, AppModule, ElementType } from './types';
import { GoogleGenAI, Type } from "@google/genai";
import { QRCodeCanvas } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';
import { generateElevation } from './utils/elevationEngine';

// --- CONFIGURATION ---
const supabaseUrl = 'https://gsmobkuznwnspjhpxtbh.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbW9ia3V6bnduc3BqaHB4dGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3Mjk2MjYsImV4cCI6MjA4MzMwNTYyNn0.tF5vPvorfg171RoJVJFVeGR-lqFD1Q8DNHHHWcLO_WA';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- GLOBAL STYLES ---
const GlobalStyles = () => (
  <style>{`
    .app-bg { background-color: #0f172a; min-height: 100vh; color: #e2e8f0; }
    .canvas-container { 
      background-color: #334155; 
      overflow: hidden;
      cursor: crosshair;
      position: relative;
    }
    .sheet-preview {
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 1px solid #475569;
      background: white;
    }
    .tool-btn {
      transition: all 0.2s;
      border: 1px solid transparent;
    }
    .tool-btn:hover { background-color: #1e293b; }
    .tool-btn.active {
      background-color: #2563eb;
      color: white;
      border-color: #60a5fa;
      box-shadow: 0 0 10px rgba(37, 99, 235, 0.3);
    }
    .dim-tooltip {
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,0.2);
    }
    /* Hide scrollbars for cleaner UI */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  `}</style>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  
  // TOOLS
  const [currentTool, setCurrentTool] = useState<'grid' | 'wall' | 'door' | 'window' | 'rect'>('grid');
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{x: number, y: number} | null>(null);
  
  // MANUAL DIMENSIONS STATE
  const [manualLength, setManualLength] = useState<number>(0);
  const [manualBreadth, setManualBreadth] = useState<number>(0);

  // OUTPUT STATE
  const [isUploading, setIsUploading] = useState(false);
  const [generatedSheet, setGeneratedSheet] = useState<string | null>(null);
  const [generatedType, setGeneratedType] = useState<'foundation' | 'elevation' | null>(null);

  // PROJECT STATE
  const [project, setProject] = useState<ProjectState>({
    imageSrc: null,
    imageWidth: 0,
    imageHeight: 0,
    gridLines: [], 
    elements: [],  
    columns: [],   
    settings: {
      scale: 100, gridSpacing: 4000, wallWidth: 225, trenchWidth: 450, footingWidth: 1000,
      workingSpace: 300, blindingOffset: 50, foundationDepth: 1200, concreteGrade: 'C25/30'
    },
    specs: {
      floors: 1, floorHeight: 3000, plinthHeight: 450, roof: { type: 'gable', pitch: 30, overhang: 600 }
    },
    generatedImageSrc: null,
    calculatedTrenchLength: 0
  });

  // CANVAS REF
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 1. INITIALIZATION & DRAWING LOOP ---
  useEffect(() => {
    if (step === AppStep.GRID_MAPPING || step === AppStep.PLAN_DESIGN) {
      renderCanvas();
    }
  }, [project, step, currentTool, dragStart, currentMousePos]); 

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background Image (Uploaded Plan or Blank White)
    if (project.imageSrc) {
       const img = new Image();
       img.src = project.imageSrc;
       if (img.complete) {
          ctx.drawImage(img, 0, 0, project.imageWidth, project.imageHeight);
       }
    } else {
       ctx.fillStyle = '#ffffff';
       ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw Grid Lines (Dashed)
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ef4444'; // Red
    ctx.setLineDash([10, 5]);
    project.gridLines.forEach(l => {
       ctx.beginPath();
       if (l.orientation === 'vertical') {
         ctx.moveTo(l.position, 0); ctx.lineTo(l.position, project.imageHeight);
       } else {
         ctx.moveTo(0, l.position); ctx.lineTo(project.imageWidth, l.position);
       }
       ctx.stroke();
    });

    // 3. Draw Elements (Solid)
    ctx.setLineDash([]);
    project.elements.forEach(el => {
       if (el.type === 'wall') {
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 4; 
         ctx.beginPath();
         ctx.moveTo(el.x1, el.y1);
         ctx.lineTo(el.x2, el.y2);
         ctx.stroke();
         
         ctx.fillStyle = '#2563eb';
         ctx.fillRect(el.x1-4, el.y1-4, 8, 8);
         ctx.fillRect(el.x2-4, el.y2-4, 8, 8);
       }
       else if (el.type === 'rect') {
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 2;
         ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
         const w = el.x2 - el.x1;
         const h = el.y2 - el.y1;
         ctx.fillRect(el.x1, el.y1, w, h);
         ctx.strokeRect(el.x1, el.y1, w, h);
       }
       else if (el.type === 'door') {
         ctx.strokeStyle = 'blue'; ctx.lineWidth = 2;
         ctx.beginPath(); ctx.arc(el.x1, el.y1, 20, 0, Math.PI*2); ctx.stroke();
         ctx.fillStyle = 'rgba(0,0,255,0.2)'; ctx.fill();
       }
    });

    // 4. Draw Current Drag (Preview & Measurement)
    if (isDrawing && dragStart && currentMousePos) {
       ctx.strokeStyle = '#2563eb';
       ctx.lineWidth = 2;
       ctx.setLineDash([5, 5]);

       const dx = currentMousePos.x - dragStart.x;
       const dy = currentMousePos.y - dragStart.y;

       if (currentTool === 'rect') {
          ctx.strokeRect(dragStart.x, dragStart.y, dx, dy);
          
          // Measurement Label
          const text = `W: ${Math.abs(dx).toFixed(0)} | H: ${Math.abs(dy).toFixed(0)}`;
          drawTooltip(ctx, text, currentMousePos.x + 15, currentMousePos.y + 15);
       } 
       else if (currentTool === 'wall' || currentTool === 'grid') {
          ctx.beginPath();
          ctx.moveTo(dragStart.x, dragStart.y);
          ctx.lineTo(currentMousePos.x, currentMousePos.y);
          ctx.stroke();

          // Measurement Label
          const len = Math.sqrt(dx*dx + dy*dy);
          const text = `L: ${len.toFixed(0)} mm`;
          drawTooltip(ctx, text, currentMousePos.x + 15, currentMousePos.y + 15);
       }
    }
  };

  const drawTooltip = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
      ctx.font = '12px sans-serif';
      const width = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(x, y, width, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 5, y + 14);
  };

  // --- 2. CANVAS INTERACTION HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setDragStart({ x, y });
    setCurrentMousePos({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentMousePos({ x, y });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !dragStart) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newElementBase = {
       id: Date.now().toString(),
       gridRef: '', 
       x1: dragStart.x, y1: dragStart.y,
       x2: x, y2: y
    };

    if (currentTool === 'wall') {
       setProject(prev => ({ ...prev, elements: [...prev.elements, { ...newElementBase, type: 'wall' }] }));
    } 
    else if (currentTool === 'rect') {
       setProject(prev => ({ ...prev, elements: [...prev.elements, { ...newElementBase, type: 'rect' }] }));
    }
    else if (currentTool === 'grid') {
       const isVertical = Math.abs(x - dragStart.x) < Math.abs(y - dragStart.y);
       const newGrid = {
         id: Date.now().toString(),
         label: 'G',
         orientation: isVertical ? 'vertical' : 'horizontal' as any,
         position: isVertical ? dragStart.x : dragStart.y
       };
       setProject(prev => ({ ...prev, gridLines: [...prev.gridLines, newGrid] }));
    }
    else {
       // Point items
       setProject(prev => ({ ...prev, elements: [...prev.elements, { ...newElementBase, type: currentTool, x2: x+40 }] }));
    }

    setIsDrawing(false);
    setDragStart(null);
  };

  // --- 3. MANUAL INPUT ADD ---
  const handleManualAdd = () => {
    // Adds an element at center of screen based on manual inputs
    const cx = project.imageWidth / 2;
    const cy = project.imageHeight / 2;
    
    if (currentTool === 'wall') {
        // Draw horizontal line of length
        const len = manualLength || 1000;
        setProject(prev => ({
            ...prev,
            elements: [...prev.elements, { 
                id: Date.now().toString(), type: 'wall', gridRef: '', 
                x1: cx - len/2, y1: cy, x2: cx + len/2, y2: cy 
            }]
        }));
    } else if (currentTool === 'rect') {
        const w = manualLength || 1000;
        const h = manualBreadth || 1000;
        setProject(prev => ({
            ...prev,
            elements: [...prev.elements, {
                id: Date.now().toString(), type: 'rect', gridRef: '',
                x1: cx - w/2, y1: cy - h/2, x2: cx + w/2, y2: cy + h/2
            }]
        }));
    }
  };

  // --- 4. START OPTIONS ---
  const handleStartBlank = () => {
    const W = 3508; const H = 2480; 
    setProject(prev => ({
      ...prev,
      imageSrc: null, 
      imageWidth: W, imageHeight: H,
      gridLines: [], elements: []
    }));
    setStep(AppStep.GRID_MAPPING);
  };

  // --- 5. GENERATORS (PRESERVED) ---
  const generateFoundationPlan = async () => {
    setGeneratedType('foundation');
    setStep(AppStep.GENERATION);
    setIsUploading(true);

    const W = 3508; const H = 2480; 
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.strokeRect(50,50,W-100,H-100);

    ctx.save();
    ctx.translate(W/2 - project.imageWidth/2, H/2 - project.imageHeight/2);
    
    // Grid
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([20,10]);
    project.gridLines.forEach(l => {
       ctx.beginPath();
       if(l.orientation==='vertical') { ctx.moveTo(l.position,0); ctx.lineTo(l.position, project.imageHeight); }
       else { ctx.moveTo(0,l.position); ctx.lineTo(project.imageWidth,l.position); }
       ctx.stroke();
    });

    // Trenches & Walls
    const { trenchWidth, wallWidth, footingWidth } = project.settings;
    const pxTrench = trenchWidth; 
    const pxWall = wallWidth;
    const pxPad = footingWidth;

    ctx.setLineDash([]);
    
    // Process Walls
    project.elements.filter(e => e.type === 'wall').forEach(e => {
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.fillStyle = '#fff';
        const dx = e.x2 - e.x1; const dy = e.y2 - e.y1;
        const ang = Math.atan2(dy, dx);
        const len = Math.sqrt(dx*dx + dy*dy);
        
        ctx.save();
        ctx.translate((e.x1+e.x2)/2, (e.y1+e.y2)/2);
        ctx.rotate(ang);
        ctx.strokeRect(-len/2, -pxTrench/2, len, pxTrench); // Outer Trench
        ctx.lineWidth = 1; 
        ctx.strokeRect(-len/2, -pxWall/2, len, pxWall); // Inner Wall
        ctx.restore();

        // Pads
        ctx.lineWidth = 5;
        ctx.strokeRect(e.x1 - pxPad/2, e.y1 - pxPad/2, pxPad, pxPad);
        ctx.strokeRect(e.x2 - pxPad/2, e.y2 - pxPad/2, pxPad, pxPad);
    });

    // Process Rects (e.g. Rooms/Slabs)
    project.elements.filter(e => e.type === 'rect').forEach(e => {
       const w = e.x2 - e.x1; const h = e.y2 - e.y1;
       ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
       ctx.fillRect(e.x1, e.y1, w, h);
       ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
       ctx.strokeRect(e.x1, e.y1, w, h);
    });

    ctx.restore();

    ctx.fillStyle = '#000'; ctx.font = 'bold 50px Arial';
    ctx.fillText("FOUNDATION PLAN", 100, H-150);

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r));
    if(blob) {
       const fileName = `found_${Date.now()}.png`;
       const { data } = await supabase.storage.from('plans').upload(fileName, blob);
       if(data) {
          const { data: { publicUrl } } = supabase.storage.from('plans').getPublicUrl(fileName);
          setGeneratedSheet(publicUrl);
       }
    }
    setIsUploading(false);
  };

  const generateElevations = async () => {
    setGeneratedType('elevation');
    setStep(AppStep.GENERATION);
    setIsUploading(true);
    
    const W = 3508; const H = 2480;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.strokeRect(50,50,W-100,H-100);

    ctx.save();
    ctx.translate(100, 1500); 
    const cmds = generateElevation(project, 'front');
    cmds.forEach(cmd => {
        if(cmd.type === 'rect') {
            ctx.fillStyle = cmd.fill || '#fff'; ctx.fillRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
        }
        else if (cmd.type === 'line') {
            ctx.beginPath(); ctx.moveTo(cmd.coords[0], cmd.coords[1]); ctx.lineTo(cmd.coords[2], cmd.coords[3]); ctx.stroke();
        }
        else if (cmd.type === 'poly') {
            ctx.fillStyle = '#ddd'; ctx.beginPath();
            ctx.moveTo(cmd.coords[0], cmd.coords[1]);
            for(let i=2; i<cmd.coords.length; i+=2) ctx.lineTo(cmd.coords[i], cmd.coords[i+1]);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    });
    ctx.restore();

    ctx.fillStyle = '#000'; ctx.font = 'bold 50px Arial';
    ctx.fillText("ELEVATIONS", 100, H-150);

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r));
    if(blob) {
       const fileName = `elev_${Date.now()}.png`;
       const { data } = await supabase.storage.from('plans').upload(fileName, blob);
       if(data) {
          const { data: { publicUrl } } = supabase.storage.from('plans').getPublicUrl(fileName);
          setGeneratedSheet(publicUrl);
       }
    }
    setIsUploading(false);
  };

  const renderContent = () => {
    if (activeModule === AppModule.DASHBOARD) return <Dashboard onSelectModule={setActiveModule} />;
    if (activeModule === AppModule.MEASUREMENT) return <MeasurementModule project={project} onClose={() => setActiveModule(AppModule.DASHBOARD)} />;

    return (
      <div className="flex h-screen w-full text-slate-200 overflow-hidden font-sans">
        
        {/* --- SIDEBAR --- */}
        <aside className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col z-20">
           <div className="p-4 border-b border-slate-700 flex justify-between items-center">
             <h1 className="font-bold text-lg text-white">Drafting Studio</h1>
             <button onClick={() => setActiveModule(AppModule.DASHBOARD)} className="text-xs text-slate-400 hover:text-white">Exit</button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {/* START OPTIONS */}
              {step === AppStep.UPLOAD && (
                <div className="space-y-4">
                  <div className="p-6 border-2 border-slate-700 border-dashed rounded-xl text-center hover:bg-slate-800 cursor-pointer relative group">
                     <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                             const img = new Image();
                             img.onload = () => {
                               setProject(p => ({ ...p, imageSrc: ev.target?.result as string, imageWidth: img.width, imageHeight: img.height }));
                               setStep(AppStep.GRID_MAPPING);
                             };
                             img.src = ev.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        }
                     }} />
                     <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📂</div>
                     <h3 className="font-bold text-white">Upload Plan</h3>
                     <p className="text-xs text-slate-400">Trace existing drawing</p>
                  </div>

                  <div className="relative text-center">
                    <span className="bg-slate-900 px-2 text-xs text-slate-500">OR</span>
                  </div>

                  <button onClick={handleStartBlank} className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left flex items-center gap-4 group">
                     <div className="text-2xl group-hover:scale-110 transition-transform">📄</div>
                     <div>
                       <h3 className="font-bold text-white">Start Blank</h3>
                       <p className="text-xs text-slate-400">Draw from scratch</p>
                     </div>
                  </button>
                </div>
              )}

              {/* TOOLS */}
              {(step === AppStep.GRID_MAPPING || step === AppStep.PLAN_DESIGN) && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">1. Layout</h3>
                    <button onClick={() => setCurrentTool('grid')} className={`tool-btn w-full p-3 rounded flex items-center gap-3 ${currentTool === 'grid' ? 'active' : 'bg-slate-800'}`}>
                      <span>📏</span> Draw Grid (Dashed)
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">2. Architecture</h3>
                    <div className="space-y-2">
                      <button onClick={() => setCurrentTool('wall')} className={`tool-btn w-full p-3 rounded flex items-center gap-3 ${currentTool === 'wall' ? 'active' : 'bg-slate-800'}`}>
                        <span>✏️</span> Wall (Line)
                      </button>
                      <button onClick={() => setCurrentTool('rect')} className={`tool-btn w-full p-3 rounded flex items-center gap-3 ${currentTool === 'rect' ? 'active' : 'bg-slate-800'}`}>
                        <span>⬜</span> 2D Shape (Rect)
                      </button>
                      <button onClick={() => setCurrentTool('door')} className={`tool-btn w-full p-3 rounded flex items-center gap-3 ${currentTool === 'door' ? 'active' : 'bg-slate-800'}`}>
                        <span>🚪</span> Place Door
                      </button>
                    </div>
                  </div>

                  {/* PRECISE INPUT SECTION */}
                  <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                    <h3 className="text-xs font-bold text-blue-400 uppercase mb-2">Precise Input</h3>
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <label className="text-xs w-10">Len/W</label>
                        <input type="number" value={manualLength} onChange={e => setManualLength(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs" />
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-xs w-10">Bre/H</label>
                        <input type="number" value={manualBreadth} onChange={e => setManualBreadth(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs" />
                      </div>
                      <button onClick={handleManualAdd} className="w-full mt-2 py-1 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded">
                        Add Fixed Shape
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-700 space-y-3">
                    <h3 className="text-xs font-bold text-emerald-500 uppercase">3. Generate</h3>
                    <button onClick={generateFoundationPlan} className="w-full py-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded font-bold text-sm">
                      🏗️ Foundation Plan
                    </button>
                    <button onClick={generateElevations} className="w-full py-3 bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded font-bold text-sm">
                      🏠 Elevations
                    </button>
                  </div>
                </div>
              )}
           </div>
        </aside>

        {/* --- MAIN WORKSPACE --- */}
        <main className="flex-1 relative canvas-container flex items-center justify-center">
           {step === AppStep.GENERATION ? (
             <div className="bg-white p-4 shadow-2xl max-w-4xl max-h-[90vh] overflow-auto flex flex-col items-center">
                <h2 className="text-black font-bold text-2xl mb-4 uppercase tracking-widest">{generatedType} SHEET</h2>
                {generatedSheet ? (
                   <img src={generatedSheet} className="border border-slate-200 shadow-lg max-w-full" />
                ) : (
                   <div className="text-slate-500 animate-pulse py-20">Rendering High-Res Sheet...</div>
                )}
                <div className="mt-6 flex gap-4">
                   <button onClick={() => setStep(AppStep.GRID_MAPPING)} className="bg-slate-800 text-white px-6 py-2 rounded">Back</button>
                   {generatedSheet && <a href={generatedSheet} download="sheet.png" className="bg-blue-600 text-white px-6 py-2 rounded">Download</a>}
                </div>
             </div>
           ) : (
             (step === AppStep.GRID_MAPPING || step === AppStep.PLAN_DESIGN) && (
               <div className="relative shadow-2xl overflow-hidden" style={{ width: project.imageWidth || '100%', height: project.imageHeight || '100%', maxWidth: '90%', maxHeight: '90%' }}>
                  <canvas 
                    ref={canvasRef}
                    width={project.imageWidth || 800}
                    height={project.imageHeight || 600}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className="w-full h-full bg-white cursor-crosshair"
                  />
               </div>
             )
           )}
           
           {/* Upload/Blank Step Placeholder if stuck */}
           {step === AppStep.UPLOAD && (
              <div className="text-slate-500">Select an option in the sidebar to begin.</div>
           )}
        </main>
      </div>
    );
  };

  return (
    <div className="app-bg font-sans">
      <GlobalStyles />
      {renderContent()}
    </div>
  );
}

export default App;
