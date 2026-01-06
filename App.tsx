import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { AppStep, ProjectState, GridLine } from './types';
import { GoogleGenAI, Type } from "@google/genai";
import { QRCodeCanvas } from 'qrcode.react';

type HistoryState = Pick<ProjectState, 'gridLines' | 'columns'>;

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [currentTool, setCurrentTool] = useState<'v-line' | 'h-line' | 'select' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showQR, setShowQR] = useState(false); // New state for QR Modal
  
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
    
    // --- CANVAS CONFIGURATION ---
    const PPI = 300 / 25.4; 
    const PAPER_W = 420; 
    const PAPER_H = 297; 
    const CANVAS_W = PAPER_W * PPI;
    const CANVAS_H = PAPER_H * PPI;
    
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { scale, gridSpacing, wallWidth, footingWidth, workingSpace, blindingOffset } = project.settings;

    const mmToPx = (mm: number) => (mm / scale) * PPI;

    // ISO PEN WEIGHTS
    const P_013 = 0.13 * PPI; 
    const P_025 = 0.25 * PPI; 
    const P_035 = 0.35 * PPI; 
    const P_050 = 0.50 * PPI; 
    
    const T_BODY = 2.5 * PPI; 
    const T_HEAD = 5.0 * PPI; 
    const BUBBLE_DIA = 10 * PPI; 

    const vLines = [...project.gridLines].filter(l => l.orientation === 'vertical').sort((a,b) => a.position - b.position);
    const hLines = [...project.gridLines].filter(l => l.orientation === 'horizontal').sort((a,b) => a.position - b.position);

    if (vLines.length < 1 || hLines.length < 1) return;

    let pxPerRealMM = (vLines.length > 1) 
      ? (vLines[vLines.length-1].position - vLines[0].position) / (gridSpacing * (vLines.length - 1))
      : 0.1;

    const gridW = vLines.length > 1 ? (gridSpacing * (vLines.length-1)) : 1000;
    const gridH = hLines.length > 1 ? (gridSpacing * (hLines.length-1)) : 1000;
    
    const cX = (CANVAS_W / 2) - (mmToPx(gridW) / 2);
    const cY = (CANVAS_H / 2) - (mmToPx(gridH) / 2);

    const mapX = (x: number) => cX + mmToPx((x - vLines[0].position) / pxPerRealMM);
    const mapY = (y: number) => cY + mmToPx((y - hLines[0].position) / pxPerRealMM);

    // Initial Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    
    const connections: {x1: number, y1: number, x2: number, y2: number}[] = [];
    const findConnections = (lines: GridLine[], isVert: boolean) => {
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
           if (isVert) connections.push({ x1: mapX(line.position), y1: mapY(cols[i]!.pos), x2: mapX(line.position), y2: mapY(cols[i+1]!.pos) });
           else connections.push({ x1: mapX(cols[i]!.pos), y1: mapY(line.position), x2: mapX(cols[i+1]!.pos), y2: mapY(line.position) });
        }
      });
    };
    findConnections(hLines, false);
    findConnections(vLines, true);

    const fPx = mmToPx(footingWidth);
    const wPx = mmToPx(wallWidth);
    const tPx = mmToPx(footingWidth + workingSpace);
    const bPx = mmToPx(footingWidth + (blindingOffset * 2));

    // Drawing Layers
    connections.forEach(c => {
       const dx = c.x2 - c.x1; const dy = c.y2 - c.y1; const len = Math.sqrt(dx*dx + dy*dy);
       const nx = -dy/len; const ny = dx/len;
       ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = P_013; ctx.setLineDash([]); 
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*tPx/2, c.y1 + ny*tPx/2); ctx.lineTo(c.x2 + nx*tPx/2, c.y2 + ny*tPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*tPx/2, c.y1 - ny*tPx/2); ctx.lineTo(c.x2 - nx*tPx/2, c.y2 - ny*tPx/2); ctx.stroke();
       ctx.strokeStyle = '#e2e8f0'; 
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*bPx/2, c.y1 + ny*bPx/2); ctx.lineTo(c.x2 + nx*bPx/2, c.y2 + ny*bPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*bPx/2, c.y1 - ny*bPx/2); ctx.lineTo(c.x2 - nx*bPx/2, c.y2 - ny*bPx/2); ctx.stroke();
    });

    ctx.setLineDash([]);
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

    connections.forEach(c => {
       const dx = c.x2 - c.x1; const dy = c.y2 - c.y1; const len = Math.sqrt(dx*dx + dy*dy);
       const nx = -dy/len; const ny = dx/len;
       ctx.fillStyle = '#64748b'; 
       ctx.beginPath();
       ctx.moveTo(c.x1 + nx*wPx/2, c.y1 + ny*wPx/2); ctx.lineTo(c.x2 + nx*wPx/2, c.y2 + ny*wPx/2);
       ctx.lineTo(c.x2 - nx*wPx/2, c.y2 - ny*wPx/2); ctx.lineTo(c.x1 - nx*wPx/2, c.y1 - ny*wPx/2);
       ctx.closePath(); ctx.fill();
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
             const padW = mmToPx(Math.max(footingWidth + workingSpace + 200, 1200));

             ctx.fillStyle = '#ffffff'; ctx.fillRect(x - padW/2, y - padW/2, padW, padW);
             ctx.strokeStyle = '#000000'; ctx.lineWidth = P_035; ctx.strokeRect(x - padW/2, y - padW/2, padW, padW);
             ctx.fillStyle = '#000000'; ctx.fillRect(x - colW/2, y - colH/2, colW, colH);
        }
    });

    const ext = mmToPx(2000);
    ctx.setLineDash([mmToPx(800), mmToPx(150), mmToPx(100), mmToPx(150)]); 
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = P_025;
    vLines.forEach(v => { const x = mapX(v.position); ctx.beginPath(); ctx.moveTo(x, cY - ext); ctx.lineTo(x, cY + mmToPx(gridH) + ext); ctx.stroke(); });
    hLines.forEach(h => { const y = mapY(h.position); ctx.beginPath(); ctx.moveTo(cX - ext, y); ctx.lineTo(cX + mmToPx(gridW) + ext, y); ctx.stroke(); });
    ctx.setLineDash([]);

    ctx.font = `bold ${T_BODY}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    vLines.forEach(v => {
       const x = mapX(v.position); const y = cY - ext - BUBBLE_DIA/2;
       ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = P_025;
       ctx.beginPath(); ctx.arc(x, y, BUBBLE_DIA/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.fillText(v.label, x, y);
    });
    hLines.forEach(h => {
       const x = cX - ext - BUBBLE_DIA/2; const y = mapY(h.position);
       ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = P_025;
       ctx.beginPath(); ctx.arc(x, y, BUBBLE_DIA/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.fillText(h.label, x, y);
    });

    const drawDim = (x1: number, y1: number, x2: number, y2: number, txt: string, off: number, isV: boolean) => {
       ctx.strokeStyle = '#000'; ctx.lineWidth = P_013;
       ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
       const tick = mmToPx(150); ctx.lineWidth = P_025;
       ctx.beginPath(); ctx.moveTo(x1-tick, y1+tick); ctx.lineTo(x1+tick, y1-tick); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(x2-tick, y2+tick); ctx.lineTo(x2+tick, y2-tick); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.font = `${T_BODY*0.9}px Inter`;
       ctx.save(); ctx.translate((x1+x2)/2, (y1+y2)/2); if(isV) ctx.rotate(-Math.PI/2); ctx.fillText(txt, 0, -T_BODY/1.5); ctx.restore();
    };

    const t1Y = cY - ext - BUBBLE_DIA - 30*PPI;
    drawDim(mapX(vLines[0].position), t1Y, mapX(vLines[vLines.length-1].position), t1Y, gridW.toString(), t1Y, false);
    
    const tbW = 100 * PPI; const tbH = 45 * PPI;
    const tX = CANVAS_W - 10*PPI - tbW; const tY = CANVAS_H - 10*PPI - tbH;
    ctx.fillStyle = '#fff'; ctx.fillRect(tX, tY, tbW, tbH);
    ctx.strokeStyle = '#000'; ctx.lineWidth = P_050; ctx.strokeRect(tX, tY, tbW, tbH);
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.font = `bold ${T_HEAD}px Inter`;
    ctx.fillText("FOUNDATION LAYOUT PLAN", tX + 4*PPI, tY + 8*PPI);
    ctx.font = `${T_BODY}px Inter`;
    ctx.fillText(`PROJECT: SITE_AUTOGEN_S101`, tX + 4*PPI, tY + 18*PPI);
    ctx.fillText(`SCALE: 1:${scale} @ A3`, tX + 4*PPI, tY + 24*PPI);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, tX + 4*PPI, tY + 30*PPI);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
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
                       <button onClick={() => setShowQR(!showQR)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 21v-4H3v4h2zm6-4h2v4h-2v-4zM21 3h-6v6h6V3zM9 3H3v6h6V3zM9 15H3v6h6v-6z" /></svg>
                         Mobile Access
                       </button>
                       <a href={project.generatedImageSrc} download="foundation_pro.png" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium">Download PNG</a>
                       <button onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-slate-200 text-sm">Edit</button>
                    </div>
                 </div>
                 
                 <div className="relative border border-slate-700 rounded overflow-hidden shadow-2xl flex-1 w-full max-w-5xl bg-slate-800 flex items-center justify-center p-4 group">
                   <img src={project.generatedImageSrc} alt="Generated Plan" className="max-w-full max-h-full object-contain shadow-lg" style={{backgroundColor: 'white'}} />
                   
                   {/* QR Code Overlay */}
                   {showQR && (
                     <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in" onClick={() => setShowQR(false)}>
                        <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-scale-in" onClick={e => e.stopPropagation()}>
                           <h3 className="text-slate-900 font-bold text-lg">Scan to View on Site</h3>
                           <div className="p-2 border-2 border-slate-100 rounded-lg">
                             <QRCodeCanvas 
                               value={`https://autofoundation.app/share/p/${project.gridLines.length}-${Date.now()}`} 
                               size={200}
                               level={"H"}
                               includeMargin={true}
                             />
                           </div>
                           <p className="text-slate-500 text-xs text-center max-w-[200px]">
                             Scan this code with your tablet or phone to access the high-res plan immediately.
                           </p>
                           <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-slate-600 text-sm mt-2">Close</button>
                        </div>
                     </div>
                   )}
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