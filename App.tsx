import React, { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { Dashboard } from './components/Dashboard';
import { MeasurementModule } from './components/MeasurementModule';
import { AppStep, ProjectState, AppModule } from './types';
import { GoogleGenAI, Type } from "@google/genai";
import { QRCodeCanvas } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
const supabaseUrl = 'https://gsmobkuznwnspjhpxtbh.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbW9ia3V6bnduc3BqaHB4dGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3Mjk2MjYsImV4cCI6MjA4MzMwNTYyNn0.tF5vPvorfg171RoJVJFVeGR-lqFD1Q8DNHHHWcLO_WA';
const supabase = createClient(supabaseUrl, supabaseKey);

type HistoryState = Pick<ProjectState, 'gridLines' | 'columns'>;

// --- GLOBAL STYLES (Clean Glass, No Rainbows, No Movement) ---
const GlobalStyles = () => (
  <style>{`
    .liquid-bg {
      background: 
        radial-gradient(circle at 15% 50%, rgba(76, 29, 149, 0.4), transparent 25%), 
        radial-gradient(circle at 85% 30%, rgba(6, 182, 212, 0.4), transparent 25%), 
        linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      background-size: cover;
      min-height: 100vh;
      width: 100vw;
    }

    /* STATIC GLASS MATERIAL */
    .glass-panel {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.36);
    }
    
    /* Subtle Text Shine */
    .text-shine {
      background: linear-gradient(to right, #94a3b8 20%, #ffffff 50%, #94a3b8 80%);
      background-size: 200% auto;
      color: transparent;
      background-clip: text;
      -webkit-background-clip: text;
      animation: shine 4s linear infinite;
    }
    @keyframes shine { to { background-position: 200% center; } }
  `}</style>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  
  // --- DRAWING MODULE STATE ---
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [currentTool, setCurrentTool] = useState<'v-line' | 'h-line' | 'select' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQR, setShowQR] = useState(false); // Restored QR State

  // --- GLOBAL PROJECT STATE ---
  const [project, setProject] = useState<ProjectState>({
    imageSrc: null,
    imageWidth: 0,
    imageHeight: 0,
    gridLines: [],
    columns: [],
    generatedImageSrc: null,
    calculatedTrenchLength: 0, 
    settings: {
      scale: 100,
      gridSpacing: 4000,
      wallWidth: 225,      
      trenchWidth: 600,    
      footingWidth: 1000,
      workingSpace: 300,
      blindingOffset: 50,
      foundationDepth: 1200, 
      concreteGrade: 'C25/30'
    }
  });

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // HISTORY LOGIC
  const saveHistory = useCallback(() => {
    setPast(prev => [...prev.slice(-19), { gridLines: project.gridLines, columns: project.columns }]);
    setFuture([]);
  }, [project.gridLines, project.columns]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [{ gridLines: project.gridLines, columns: project.columns }, ...prev]);
    setProject(prev => ({ ...prev, gridLines: previous.gridLines, columns: previous.columns }));
  }, [past, project.gridLines, project.columns]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, { gridLines: project.gridLines, columns: project.columns }]);
    setProject(prev => ({ ...prev, gridLines: next.gridLines, columns: next.columns }));
  }, [future, project.gridLines, project.columns]);

  // AI AUTO-DETECT
  const handleAutoDetect = async () => {
    if (!project.imageSrc) return;
    setIsAnalyzing(true);
    try {
      const [meta, data] = project.imageSrc.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze architectural plan to find structural grid system lines. Return JSON with 'gridLines' containing 'label', 'orientation' (vertical/horizontal), and normalized 'position' (0.0 to 1.0).`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
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
         const newLines: any[] = result.gridLines.map((l: any) => ({
           id: Math.random().toString(36).substr(2, 9),
           label: l.label,
           orientation: l.orientation,
           position: l.orientation === 'vertical' ? l.position * project.imageWidth : l.position * project.imageHeight
         }));
         setProject(prev => ({ ...prev, gridLines: newLines }));
      }
    } catch (e) { alert("Detection failed."); } finally { setIsAnalyzing(false); }
  };

  // GENERATION (Restored Original Canvas Logic)
  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    setIsUploading(true);
    
    const PPI = 300 / 25.4; 
    const PAPER_W = 420; const PAPER_H = 297; 
    const CANVAS_W = PAPER_W * PPI; const CANVAS_H = PAPER_H * PPI;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { scale, gridSpacing, wallWidth, footingWidth, workingSpace, blindingOffset, trenchWidth } = project.settings;
    const mmToPx = (mm: number) => (mm / scale) * PPI;
    const P_035 = 0.35 * PPI; 
    const P_050 = 0.50 * PPI; 
    const T_HEAD = 5.0 * PPI; 
    const BUBBLE_DIA = 10 * PPI; 

    const vLines = [...project.gridLines].filter(l => l.orientation === 'vertical').sort((a,b) => a.position - b.position);
    const hLines = [...project.gridLines].filter(l => l.orientation === 'horizontal').sort((a,b) => a.position - b.position);

    if (vLines.length < 1 || hLines.length < 1) { setIsUploading(false); return; }

    let pxPerRealMM = (vLines.length > 1) 
      ? (vLines[vLines.length-1].position - vLines[0].position) / (gridSpacing * (vLines.length - 1))
      : 0.1;

    const gridW = vLines.length > 1 ? (gridSpacing * (vLines.length-1)) : 1000;
    const gridH = hLines.length > 1 ? (gridSpacing * (hLines.length-1)) : 1000;
    
    const cX = (CANVAS_W / 2) - (mmToPx(gridW) / 2);
    const cY = (CANVAS_H / 2) - (mmToPx(gridH) / 2);
    const mapX = (x: number) => cX + mmToPx((x - vLines[0].position) / pxPerRealMM);
    const mapY = (y: number) => cY + mmToPx((y - hLines[0].position) / pxPerRealMM);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const connections: {x1: number, y1: number, x2: number, y2: number, lenPx: number}[] = [];
    
    const findConnections = (lines: any[], isVert: boolean) => {
      lines.forEach(line => {
        const cols = project.columns
          .filter(c => c.intersectionId.includes(line.label))
          .map(c => {
             const parts = c.intersectionId.split('-');
             const orthLabel = parts[0] === line.label ? parts[1] : parts[0];
             const orthLine = (isVert ? hLines : vLines).find(l => l.label === orthLabel);
             return orthLine ? { pos: orthLine.position } : null;
          }).filter(x => x).sort((a,b) => a!.pos - b!.pos);
        
        for(let i=0; i<cols.length-1; i++) {
           const x1 = isVert ? mapX(line.position) : mapX(cols[i]!.pos);
           const y1 = isVert ? mapY(cols[i]!.pos) : mapY(line.position);
           const x2 = isVert ? mapX(line.position) : mapX(cols[i+1]!.pos);
           const y2 = isVert ? mapY(cols[i+1]!.pos) : mapY(line.position);
           const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx*dx + dy*dy);
           connections.push({ x1, y1, x2, y2, lenPx: len });
        }
      });
    };
    findConnections(hLines, false);
    findConnections(vLines, true);

    // Calculate Length (Silently store for Measurement Module)
    const totalPxLength = connections.reduce((acc, c) => acc + c.lenPx, 0);
    const totalMeters = (totalPxLength / pxPerRealMM) / 1000;
    const deduction = (project.columns.length * (trenchWidth/1000));
    const netMeters = Math.max(0, totalMeters - deduction);
    
    setProject(prev => ({ ...prev, calculatedTrenchLength: netMeters }));

    // Drawing
    const fPx = mmToPx(footingWidth);
    connections.forEach(c => {
       const dx = c.x2 - c.x1; const dy = c.y2 - c.y1; const len = Math.sqrt(dx*dx + dy*dy);
       const nx = -dy/len; const ny = dx/len;
       ctx.fillStyle = '#ffffff';
       ctx.beginPath();
       ctx.moveTo(c.x1 + nx*fPx/2, c.y1 + ny*fPx/2); ctx.lineTo(c.x2 + nx*fPx/2, c.y2 + ny*fPx/2);
       ctx.lineTo(c.x2 - nx*fPx/2, c.y2 - ny*fPx/2); ctx.lineTo(c.x1 - nx*fPx/2, c.y1 - ny*fPx/2);
       ctx.closePath(); ctx.fill();
       ctx.strokeStyle = '#000000'; ctx.lineWidth = P_035; ctx.stroke();
    });

    project.columns.forEach(col => {
        const [l1, l2] = col.intersectionId.split('-');
        const line1 = project.gridLines.find(l => l.label === l1);
        const line2 = project.gridLines.find(l => l.label === l2);
        if (line1 && line2) {
             const x = mapX(line1.orientation === 'vertical' ? line1.position : line2.position);
             const y = mapY(line1.orientation === 'vertical' ? line2.position : line1.position);
             const rawW = (col.width && col.width > 50) ? col.width : Math.max(300, wallWidth); 
             const rawH = (col.height && col.height > 50) ? col.height : Math.max(300, wallWidth);
             const colW = mmToPx(rawW); const colH = mmToPx(rawH);
             ctx.fillStyle = '#000000'; ctx.fillRect(x - colW/2, y - colH/2, colW, colH);
        }
    });

    const tbW = 100 * PPI; const tbH = 45 * PPI;
    const tX = CANVAS_W - 10*PPI - tbW; const tY = CANVAS_H - 10*PPI - tbH;
    ctx.strokeStyle = '#000'; ctx.lineWidth = P_050; ctx.strokeRect(tX, tY, tbW, tbH);
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.font = `bold ${T_HEAD}px Inter`;
    ctx.fillText("FOUNDATION LAYOUT", tX + 4*PPI, tY + 8*PPI);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { setIsUploading(false); return; }
    const fileName = `foundation_${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage.from('plans').upload(fileName, blob, { contentType: 'image/png' });
    if (!uploadError) {
       const { data: { publicUrl } } = supabase.storage.from('plans').getPublicUrl(fileName);
       setProject(prev => ({ ...prev, generatedImageSrc: publicUrl }));
    }
    setIsUploading(false);
  };

  const renderContent = () => {
    switch (activeModule) {
      case AppModule.DASHBOARD:
        return <Dashboard onSelectModule={setActiveModule} />;
      
      case AppModule.MEASUREMENT:
        return (
          <MeasurementModule 
            project={project} 
            onClose={() => setActiveModule(AppModule.DASHBOARD)} 
          />
        );

      case AppModule.DRAWINGS:
        return (
          <div className="flex h-screen w-full text-slate-200 overflow-hidden font-sans">
             <Sidebar 
               step={step} setStep={setStep} 
               project={project} setProject={setProject}
               currentTool={currentTool} setCurrentTool={setCurrentTool}
               onGenerate={handleGenerate} onAutoDetect={handleAutoDetect} 
               isAnalyzing={isAnalyzing} 
               onUndo={undo} onRedo={redo} canUndo={past.length > 0} canRedo={future.length > 0}
               onGoHome={() => setActiveModule(AppModule.DASHBOARD)}
             />
             <main className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/20 backdrop-blur-sm">
               {step === AppStep.GENERATION ? (
                 <div className="glass-panel p-8 rounded-3xl flex flex-col items-center max-w-4xl w-full mx-4 max-h-[90vh]">
                    {project.generatedImageSrc ? (
                        <div className="flex flex-col items-center w-full h-full">
                           <div className="flex-1 w-full bg-white rounded-xl mb-6 overflow-hidden shadow-2xl relative p-4 flex items-center justify-center">
                              <img src={project.generatedImageSrc} className="max-w-full max-h-[50vh] object-contain shadow-lg" />
                              
                              {/* QR CODE OVERLAY */}
                              {showQR && (
                                <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center animate-fade-in" onClick={() => setShowQR(false)}>
                                   <QRCodeCanvas value={project.generatedImageSrc} size={250} />
                                   <p className="text-slate-500 mt-4 text-sm font-bold">Scan to view on Mobile</p>
                                   <p className="text-slate-400 text-xs">Tap to close</p>
                                </div>
                              )}
                           </div>
                           
                           <div className="flex items-center justify-between w-full gap-4">
                              <div className="flex gap-2">
                                <a href={project.generatedImageSrc} download="foundation_plan.png" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  Download Plan
                                </a>
                                <button onClick={() => setShowQR(!showQR)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl font-medium flex items-center gap-2">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 21v-4H3v4h2zm6-4h2v4h-2v-4z" /></svg>
                                  Mobile
                                </button>
                              </div>

                              <button onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="text-slate-400 hover:text-white px-4 py-2 text-sm font-medium">
                                Back to Editor
                              </button>
                           </div>

                           {/* SMM7 SUGGESTION - SUBTLE BOTTOM BUTTON */}
                           <div className="w-full mt-6 pt-6 border-t border-white/10 flex justify-end">
                              <button 
                                onClick={() => setActiveModule(AppModule.MEASUREMENT)} 
                                className="group flex items-center gap-3 text-slate-400 hover:text-emerald-400 transition-colors text-sm"
                              >
                                <span>Finished with drawing? Proceed to Measurement</span>
                                <div className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-emerald-500/20 flex items-center justify-center">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>
                              </button>
                           </div>
                        </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="animate-pulse">Generating Foundation & Calculating Geometry...</p>
                      </div>
                    )}
                 </div>
               ) : (
                 <CanvasEditor 
                   step={step} 
                   project={project} 
                   setProject={setProject} 
                   currentTool={currentTool} 
                   onCommitChange={saveHistory} 
                 />
               )}
             </main>
          </div>
        );
      
      default:
        return (
           <div className="flex h-screen w-full items-center justify-center text-slate-400 flex-col">
              <h1 className="text-3xl font-bold mb-4">Module Under Construction</h1>
              <button onClick={() => setActiveModule(AppModule.DASHBOARD)} className="text-blue-400 hover:underline">Return Home</button>
           </div>
        );
    }
  };

  return (
    <div className="liquid-bg font-sans selection:bg-blue-500/30 text-slate-200">
      <GlobalStyles />
      {renderContent()}
    </div>
  );
}

export default App;
