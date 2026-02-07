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
    .zoom-controls {
      position: absolute; bottom: 20px; right: 20px; display: flex; gap: 8px; z-index: 50;
    }
    .zoom-btn {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(255,255,255,0.1); backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2); color: white;
      display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
    }
    .zoom-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
  `}</style>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  
  // TOOLS
  const [currentTool, setCurrentTool] = useState<ElementType>('wall');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  // ZOOM & PAN
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
    columns: [],
    elements: [], 
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
    setPast(prev => [...prev.slice(-19), { elements: project.elements, columns: project.columns, gridLines: project.gridLines }]);
    setFuture([]);
  }, [project.elements, project.columns, project.gridLines]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [{ elements: project.elements, columns: project.columns, gridLines: project.gridLines }, ...prev]);
    setProject(prev => ({ ...prev, elements: previous.elements, columns: previous.columns, gridLines: previous.gridLines }));
  }, [past, project.elements, project.columns]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, { elements: project.elements, columns: project.columns, gridLines: project.gridLines }]);
    setProject(prev => ({ ...prev, elements: next.elements, columns: next.columns, gridLines: next.gridLines }));
  }, [future, project.elements, project.columns]);

  // --- NEW: START BLANK PROJECT ---
  const handleStartBlank = () => {
    // Generate a blank white canvas (A3 Landscape approx pixels)
    const canvas = document.createElement('canvas');
    canvas.width = 3000; 
    canvas.height = 2000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 3000, 2000);
      
      // Draw a faint guide grid to help user feel orientation
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      for(let x=0; x<3000; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,2000); ctx.stroke(); }
      for(let y=0; y<2000; y+=100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(3000,y); ctx.stroke(); }

      const blankImg = canvas.toDataURL('image/jpeg');
      
      setProject(prev => ({
        ...prev,
        imageSrc: blankImg,
        imageWidth: 3000,
        imageHeight: 2000,
        gridLines: [], // Reset grid
        elements: []   // Reset elements
      }));
      setStep(AppStep.GRID_MAPPING);
    }
  };

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
    if (scale > 1) { setIsDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  };
  const onDrag = (e: React.MouseEvent) => {
    if (isDragging) { setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }
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
      const prompt = `Analyze architectural plan...`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts: [{ inlineData: { mimeType, data } }, { text: prompt }] },
      });
      setTimeout(() => setIsAnalyzing(false), 1500);
    } catch (e) { setIsAnalyzing(false); }
  };

  // --- GENERATION ENGINE ---
  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    setIsUploading(true);

    const PPI = 300 / 25.4;
    const CANVAS_W = 3508; 
    const CANVAS_H = 2480; 
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. SETUP SHEET
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(50, 50, CANVAS_W - 100, CANVAS_H - 100);

    // 2. DRAW FLOOR PLAN
    ctx.save();
    ctx.translate(200, 200); 
    const PLAN_SCALE = 0.5; 
    ctx.scale(PLAN_SCALE, PLAN_SCALE);

    // Draw Grid Lines (Dash-Dot)
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([20, 10, 5, 10]);
    // (In real implementation, iterate gridLines here)

    // Draw Walls (Thick Black)
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.setLineDash([]); ctx.lineCap = 'square';
    project.elements.filter(e => e.type === 'wall').forEach(e => {
       ctx.fillStyle = '#000'; ctx.fillRect(e.x1 - 15, e.y1 - 15, 30, 30);
    });

    // Draw Doors (Blue Arc)
    ctx.strokeStyle = 'blue'; ctx.lineWidth = 3;
    project.elements.filter(e => e.type === 'door').forEach(e => {
       ctx.beginPath(); ctx.arc(e.x1, e.y1, 40, 0, Math.PI * 0.5); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x1, e.y1 + 40); ctx.stroke();
    });

    ctx.restore();
    
    // 3. DRAW ELEVATIONS (Bottom)
    ctx.save();
    ctx.translate(200, 1400); 
    const frontCmds = generateElevation(project, 'front');
    frontCmds.forEach(cmd => {
       if (cmd.type === 'rect') {
         ctx.fillStyle = cmd.fill === '#fff' ? '#ffffff' : (cmd.fill || 'transparent'); 
         if(cmd.fill === '#cbd5e1') ctx.fillStyle = '#e2e8f0'; 
         ctx.fillRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
         ctx.strokeStyle = '#000'; ctx.lineWidth = cmd.strokeWidth || 2;
         ctx.strokeRect(cmd.coords[0], cmd.coords[1], cmd.coords[2], cmd.coords[3]);
       } else if (cmd.type === 'line') {
         ctx.strokeStyle = '#000'; ctx.lineWidth = cmd.strokeWidth || 2;
         ctx.beginPath(); ctx.moveTo(cmd.coords[0], cmd.coords[1]); ctx.lineTo(cmd.coords[2], cmd.coords[3]); ctx.stroke();
       } else if (cmd.type === 'poly') {
         ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
         ctx.beginPath(); ctx.moveTo(cmd.coords[0], cmd.coords[1]);
         for(let i=2; i<cmd.coords.length; i+=2) ctx.lineTo(cmd.coords[i], cmd.coords[i+1]);
         ctx.closePath(); ctx.fill(); ctx.stroke();
       }
    });

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
        
        {/* SIDEBAR */}
        <Sidebar 
          step={step} setStep={setStep} 
          project={project} setProject={setProject}
          currentTool={currentTool} setCurrentTool={setCurrentTool}
          onGenerate={handleGenerate} onAutoDetect={handleAutoDetect} 
          isAnalyzing={isAnalyzing} 
          onUndo={undo} onRedo={redo} canUndo={past.length > 0} canRedo={future.length > 0}
          onGoHome={() => setActiveModule(AppModule.DASHBOARD)}
          onStartBlank={handleStartBlank} // Pass the new handler
        />

        <main className="flex-1 relative bg-slate-950 grid-bg overflow-hidden flex items-center justify-center">
           {step === AppStep.GENERATION ? (
              <div className="glass-panel p-8 rounded-xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col items-center relative">
                 {project.generatedImageSrc ? (
                    <div className="flex flex-col items-center w-full h-full relative">
                        <div 
                           className="flex-1 w-full bg-white rounded-xl mb-6 overflow-hidden shadow-2xl relative p-4 flex items-center justify-center cursor-move"
                           onWheel={handleWheel} onMouseDown={startDrag} onMouseMove={onDrag} onMouseUp={stopDrag} onMouseLeave={stopDrag} ref={containerRef}
                        >
                          <div style={{ transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`, transition: isDragging ? 'none' : 'transform 0.1s ease-out' }} className="origin-center">
                            <img src={project.generatedImageSrc} className="max-w-full max-h-[60vh] object-contain pointer-events-none" />
                          </div>
                          
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
               step={step} project={project} setProject={setProject} 
               currentTool={currentTool} onCommitChange={saveHistory}
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
