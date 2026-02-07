import React, { useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
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
    .liquid-bg {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      min-height: 100vh;
    }
    .glass-panel {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    }
    .grid-bg {
      background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    /* Zoom Controls */
    .zoom-controls {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 8px;
      z-index: 50;
    }
    .zoom-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .zoom-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
  `}</style>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  
  // ARCHITECT TOOLS
  const [currentTool, setCurrentTool] = useState<ElementType>('wall');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  // ZOOM & PAN STATE
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // PROJECT STATE
  const [project, setProject] = useState<ProjectState>({
    imageSrc: null,
    imageWidth: 0,
    imageHeight: 0,
    gridLines: [],
    columns: [], // Legacy structural columns
    elements: [], // New Architectural Elements
    settings: {
      scale: 100, gridSpacing: 4000, wallWidth: 225, trenchWidth: 450, footingWidth: 1000,
      workingSpace: 300, blindingOffset: 50, foundationDepth: 1200, concreteGrade: 'C25/30'
    },
    specs: {
      floors: 1,
      floorHeight: 3000,
      plinthHeight: 450,
      roof: { type: 'gable', pitch: 30, overhang: 600 }
    },
    generatedImageSrc: null,
    calculatedTrenchLength: 0
  });

  const [past, setPast] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);

  // HISTORY
  const saveHistory = useCallback(() => {
    setPast(prev => [...prev.slice(-19), { elements: project.elements, columns: project.columns }]);
    setFuture([]);
  }, [project.elements, project.columns]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [{ elements: project.elements, columns: project.columns }, ...prev]);
    setProject(prev => ({ ...prev, elements: previous.elements, columns: previous.columns }));
  }, [past, project.elements, project.columns]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, { elements: project.elements, columns: project.columns }]);
    setProject(prev => ({ ...prev, elements: next.elements, columns: next.columns }));
  }, [future, project.elements, project.columns]);

  // ZOOM HANDLERS
  const handleWheel = (e: React.WheelEvent) => {
    if (step === AppStep.GENERATION) {
      e.preventDefault();
      const delta = e.deltaY * -0.001;
      const newScale = Math.min(Math.max(0.5, scale + delta), 4);
      setScale(newScale);
    }
  };
  const startDrag = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const onDrag = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };
  const stopDrag = () => setIsDragging(false);
  const resetZoom = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  // AI AUTO-DETECT
  const handleAutoDetect = async () => {
    if (!project.imageSrc) return;
    setIsAnalyzing(true);
    try {
      const [meta, data] = project.imageSrc.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze architectural plan to find structural grid system lines. Return JSON with 'gridLines'.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts: [{ inlineData: { mimeType, data } }, { text: prompt }] },
      });
      // Mock result for demo
      setTimeout(() => setIsAnalyzing(false), 1500);
    } catch (e) { setIsAnalyzing(false); }
  };

  // --- INTERACTION: PLACING ELEMENTS ---
  const handleGridClick = (gridRef: string, x: number, y: number) => {
    saveHistory();
    setProject(prev => {
      // Basic logic: Toggle element at intersection
      const existingIdx = prev.elements.findIndex(e => e.gridRef === gridRef);
      let newElements = [...prev.elements];
      if (existingIdx >= 0 && prev.elements[existingIdx].type === currentTool) {
          newElements.splice(existingIdx, 1);
      } else {
        if (existingIdx >= 0) newElements.splice(existingIdx, 1); // Replace
        newElements.push({
          id: Math.random().toString(36),
          type: currentTool,
          gridRef, x1: x, y1: y, x2: x, y2: y 
        });
      }
      return { ...prev, elements: newElements };
    });
  };

  // --- GENERATION ENGINE ---
  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    setIsUploading(true);

    const PPI = 300 / 25.4;
    const CANVAS_W = 3508; // A4 Landscape @ 300PPI
    const CANVAS_H = 2480; 
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. SETUP SHEET
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, CANVAS_W, CANVAS_H);
    
    // Draw Border
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, CANVAS_W - 100, CANVAS_H - 100);

    // --- DRAW FLOOR PLAN (Top Left Quadrant) ---
    ctx.save();
    ctx.translate(200, 200); // Margin
    const PLAN_SCALE = 0.5; // Adjust based on grid size
    ctx.scale(PLAN_SCALE, PLAN_SCALE);

    // Grid (Center Lines) - Dash-Dot
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([20, 10, 5, 10]);
    // Note: In real app, iterate gridLines here. For demo, we rely on element positions
    // ...

    // Walls (Thick Black Lines - Architectural Standard)
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.setLineDash([]); ctx.lineCap = 'square';
    project.elements.filter(e => e.type === 'wall').forEach(e => {
       // Ideally draw lines between connected nodes. 
       // For demo node-based placement, we draw a box representing the junction/column
       ctx.fillStyle = '#000'; 
       ctx.fillRect(e.x1 - 15, e.y1 - 15, 30, 30);
    });

    // Doors (Arcs)
    ctx.strokeStyle = 'blue'; ctx.lineWidth = 3;
    project.elements.filter(e => e.type === 'door').forEach(e => {
       ctx.beginPath(); ctx.arc(e.x1, e.y1, 40, 0, Math.PI * 0.5); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x1, e.y1 + 40); ctx.stroke();
    });

    ctx.restore();
    
    // --- DRAW ELEVATIONS (Bottom Quadrant) ---
    // Auto-generated using the elevationEngine utility logic
    ctx.save();
    ctx.translate(200, 1400); // Move to bottom half
    
    // Call the engine to get drawing commands
    const frontCmds = generateElevation(project, 'front');
    
    frontCmds.forEach(cmd => {
       if (cmd.type === 'rect') {
         // Apply professional styling (White fill, Black stroke)
         ctx.fillStyle = cmd.fill === '#fff' ? '#ffffff' : (cmd.fill || 'transparent'); 
         if(cmd.fill === '#cbd5e1') ctx.fillStyle = '#e2e8f0'; // Light gray for roof/plinth
         
         ctx.fillRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
         
         ctx.strokeStyle = '#000'; 
         ctx.lineWidth = cmd.strokeWidth || 2;
         ctx.strokeRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
       }
       else if (cmd.type === 'line') {
         ctx.strokeStyle = '#000';
         ctx.lineWidth = cmd.strokeWidth || 2;
         ctx.beginPath();
         ctx.moveTo(cmd.coords[0], cmd.coords[1]);
         ctx.lineTo(cmd.coords[2], cmd.coords[3]);
         ctx.stroke();
       }
       else if (cmd.type === 'poly') {
         ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
         ctx.beginPath();
         ctx.moveTo(cmd.coords[0], cmd.coords[1]);
         for(let i=2; i<cmd.coords.length; i+=2) ctx.lineTo(cmd.coords[i], cmd.coords[i+1]);
         ctx.closePath();
         ctx.fill(); ctx.stroke();
       }
    });

    // Labels
    ctx.fillStyle = '#000'; ctx.font = 'bold 40px Arial'; 
    ctx.fillText("FLOOR PLAN (1:100)", 200, 1200);
    ctx.fillText("FRONT ELEVATION (1:100)", 200, 2200);
    
    ctx.restore();

    // TITLE BLOCK
    const tX = CANVAS_W - 900; const tY = CANVAS_H - 300;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(tX, tY, 800, 200);
    ctx.font = '30px Arial';
    ctx.fillText("PROJECT: RESIDENTIAL DEV", tX + 20, tY + 50);
    ctx.fillText(`SHEET: A-101`, tX + 20, tY + 100);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, tX + 20, tY + 150);

    // UPLOAD
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
       const fileName = `arch_set_${Date.now()}.png`;
       const { data } = await supabase.storage.from('plans').upload(fileName, blob);
       if (data) {
          const { data: { publicUrl } } = supabase.storage.from('plans').getPublicUrl(fileName);
          setProject(prev => ({ ...prev, generatedImageSrc: publicUrl }));
       }
    }
    setIsUploading(false);
  };

  const renderContent = () => {
    if (activeModule === AppModule.DASHBOARD) return <Dashboard onSelectModule={setActiveModule} />;
    
    // DRAWING WORKSPACE
    return (
      <div className="flex h-screen w-full text-slate-200 overflow-hidden font-sans">
        <aside className="w-80 p-4 z-20 bg-slate-900 border-r border-slate-700 flex flex-col">
           {/* HEADER */}
           <div className="mb-6 flex items-center justify-between">
             <h1 className="font-bold text-xl">Architect Studio</h1>
             <button onClick={() => setActiveModule(AppModule.DASHBOARD)} className="text-xs text-slate-400 hover:text-white">Exit</button>
           </div>

           {/* BUILDING SPECS */}
           <div className="bg-slate-800 p-4 rounded-xl mb-6 space-y-3">
             <h3 className="text-xs font-bold text-blue-400 uppercase">Building Specs</h3>
             <div className="flex justify-between items-center">
               <span className="text-sm">Floors</span>
               <div className="flex items-center gap-2">
                 <button onClick={() => setProject(p => ({...p, specs: {...p.specs, floors: Math.max(1, p.specs.floors - 1)}}))} className="bg-slate-700 w-6 h-6 rounded">-</button>
                 <span className="text-white font-bold">{project.specs.floors}</span>
                 <button onClick={() => setProject(p => ({...p, specs: {...p.specs, floors: p.specs.floors + 1}}))} className="bg-slate-700 w-6 h-6 rounded">+</button>
               </div>
             </div>
             <div>
               <span className="text-sm block mb-1">Roof Type</span>
               <select 
                 className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-sm"
                 value={project.specs.roof.type}
                 onChange={(e) => setProject(p => ({...p, specs: {...p.specs, roof: {...p.specs.roof, type: e.target.value as any}}}))}
               >
                 <option value="gable">Gable</option>
                 <option value="hip">Hip</option>
                 <option value="flat">Flat</option>
                 <option value="shed">Shed</option>
               </select>
             </div>
           </div>

           {/* TOOLBOX */}
           <div className="space-y-2 mb-auto">
             <h3 className="text-xs font-bold text-slate-500 uppercase">Tools</h3>
             <button onClick={() => setCurrentTool('wall')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${currentTool === 'wall' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
               <span className="w-4 h-4 bg-white border border-black"></span> Wall
             </button>
             <button onClick={() => setCurrentTool('door')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${currentTool === 'door' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
               <span className="w-4 h-4 rounded-t-full border border-white"></span> Door
             </button>
             <button onClick={() => setCurrentTool('window')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${currentTool === 'window' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}>
               <span className="w-4 h-2 border border-white"></span> Window
             </button>
           </div>

           <button onClick={handleGenerate} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white shadow-lg">
             Auto-Generate Set
           </button>
        </aside>

        <main className="flex-1 relative bg-slate-950 grid-bg overflow-hidden flex items-center justify-center">
           {step === AppStep.GENERATION ? (
              <div className="glass-panel p-8 rounded-xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col items-center relative">
                 {project.generatedImageSrc ? (
                    <div className="flex flex-col items-center w-full h-full relative">
                        {/* IMAGE CONTAINER WITH ZOOM */}
                        <div 
                           className="flex-1 w-full bg-white rounded-xl mb-6 overflow-hidden shadow-2xl relative p-4 flex items-center justify-center cursor-move"
                           onWheel={handleWheel}
                           onMouseDown={startDrag}
                           onMouseMove={onDrag}
                           onMouseUp={stopDrag}
                           onMouseLeave={stopDrag}
                           ref={containerRef}
                        >
                          <div 
                            style={{ 
                              transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`, 
                              transition: isDragging ? 'none' : 'transform 0.1s ease-out' 
                            }}
                            className="origin-center"
                          >
                            <img src={project.generatedImageSrc} className="max-w-full max-h-[60vh] object-contain pointer-events-none" />
                          </div>
                          
                          {/* ZOOM CONTROLS */}
                          <div className="zoom-controls">
                            <button className="zoom-btn" onClick={() => setScale(s => Math.min(s + 0.5, 4))}>+</button>
                            <button className="zoom-btn" onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}>-</button>
                            <button className="zoom-btn" onClick={resetZoom}>⟲</button>
                          </div>

                          {showQR && (
                             <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center animate-fade-in cursor-default" onClick={(e) => { e.stopPropagation(); setShowQR(false); }}>
                                <QRCodeCanvas value={project.generatedImageSrc} size={250} />
                                <p className="text-slate-500 mt-4 text-sm font-bold">Scan for Mobile</p>
                             </div>
                          )}
                        </div>
                        
                        <div className="flex gap-4">
                           <a href={project.generatedImageSrc} download="architectural_set.png" className="bg-blue-600 px-6 py-2 rounded text-white font-bold">Download</a>
                           <button onClick={() => setShowQR(!showQR)} className="bg-slate-700 px-6 py-2 rounded text-white">Mobile</button>
                           <button onClick={() => setStep(AppStep.PLAN_DESIGN)} className="bg-slate-700 px-6 py-2 rounded text-white">Back to Edit</button>
                        </div>
                    </div>
                 ) : (
                   <div className="text-center animate-pulse">Generating Architectural Set...</div>
                 )}
              </div>
           ) : (
             <CanvasEditor 
               step={step} 
               project={project} 
               setProject={setProject} 
               currentTool={currentTool} 
               onCommitChange={saveHistory}
               // Pass element clicking logic down if needed, or handle inside CanvasEditor
               // For this implementation, we assume CanvasEditor consumes `project` and `currentTool`
             />
           )}
        </main>
      </div>
    );
  };

  return (
    <div className="liquid-bg font-sans text-slate-200">
      <GlobalStyles />
      {renderContent()}
    </div>
  );
}

export default App;
