
import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { AppStep, ProjectState, GridLine } from './types';
import { GoogleGenAI, Type } from "@google/genai";

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
        model: 'gemini-3-flash-preview',
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
    
    const PPI = 11.811; 
    const PAPER_W = 420; // mm
    const PAPER_H = 297; // mm
    const CANVAS_W = PAPER_W * PPI;
    const CANVAS_H = PAPER_H * PPI;
    
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { scale, gridSpacing, wallWidth, footingWidth, workingSpace, blindingOffset } = project.settings;

    // ISO Pen Weights
    const P_HAIR = 0.13 * PPI;
    const P_THIN = 0.25 * PPI;
    const P_MED = 0.35 * PPI;
    const P_THICK = 0.5 * PPI;
    const P_BORDER = 0.7 * PPI;
    const T_BODY = 2.5 * PPI;
    const T_HEAD = 5.0 * PPI;
    const BUBBLE_DIA = 12 * PPI;

    const mmToPx = (mm: number) => (mm / scale) * PPI;

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
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = P_BORDER;
    ctx.strokeRect(10*PPI, 10*PPI, CANVAS_W - 20*PPI, CANVAS_H - 20*PPI);

    // Draw Elements
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

    connections.forEach(c => {
       const dx = c.x2 - c.x1; const dy = c.y2 - c.y1; const len = Math.sqrt(dx*dx + dy*dy);
       const nx = -dy/len; const ny = dx/len;

       // 1. Excavation Line (Dashed)
       ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = P_HAIR; ctx.setLineDash([P_HAIR*8, P_HAIR*4]);
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*tPx/2, c.y1 + ny*tPx/2); ctx.lineTo(c.x2 + nx*tPx/2, c.y2 + ny*tPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*tPx/2, c.y1 - ny*tPx/2); ctx.lineTo(c.x2 - nx*tPx/2, c.y2 - ny*tPx/2); ctx.stroke();

       // 2. Blinding Layer (Thin Dashed)
       ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([P_HAIR*4, P_HAIR*2]);
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*bPx/2, c.y1 + ny*bPx/2); ctx.lineTo(c.x2 + nx*bPx/2, c.y2 + ny*bPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*bPx/2, c.y1 - ny*bPx/2); ctx.lineTo(c.x2 - nx*bPx/2, c.y2 - ny*bPx/2); ctx.stroke();
       ctx.setLineDash([]);

       // 3. Footing (Solid)
       ctx.strokeStyle = '#000000'; ctx.lineWidth = P_MED;
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*fPx/2, c.y1 + ny*fPx/2); ctx.lineTo(c.x2 + nx*fPx/2, c.y2 + ny*fPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*fPx/2, c.y1 - ny*fPx/2); ctx.lineTo(c.x2 - nx*fPx/2, c.y2 - ny*fPx/2); ctx.stroke();

       // 4. Substructure Wall (Thick Solid)
       ctx.lineWidth = P_THICK;
       ctx.beginPath(); ctx.moveTo(c.x1 + nx*wPx/2, c.y1 + ny*wPx/2); ctx.lineTo(c.x2 + nx*wPx/2, c.y2 + ny*wPx/2); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(c.x1 - nx*wPx/2, c.y1 - ny*wPx/2); ctx.lineTo(c.x2 - nx*wPx/2, c.y2 - ny*wPx/2); ctx.stroke();
    });

    // Grid lines with 2000mm extensions
    const ext = mmToPx(2000);
    ctx.setLineDash([20, 5, 2, 5]); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = P_HAIR;
    vLines.forEach(v => { const x = mapX(v.position); ctx.beginPath(); ctx.moveTo(x, cY - ext); ctx.lineTo(x, cY + mmToPx(gridH) + ext); ctx.stroke(); });
    hLines.forEach(h => { const y = mapY(h.position); ctx.beginPath(); ctx.moveTo(cX - ext, y); ctx.lineTo(cX + mmToPx(gridW) + ext, y); ctx.stroke(); });
    ctx.setLineDash([]);

    // Grid Bubbles
    ctx.font = `bold ${T_BODY}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    vLines.forEach(v => {
       const x = mapX(v.position); const y = cY - ext - BUBBLE_DIA/2;
       ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = P_THIN;
       ctx.beginPath(); ctx.arc(x, y, BUBBLE_DIA/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.fillText(v.label, x, y);
    });
    hLines.forEach(h => {
       const x = cX - ext - BUBBLE_DIA/2; const y = mapY(h.position);
       ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = P_THIN;
       ctx.beginPath(); ctx.arc(x, y, BUBBLE_DIA/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.fillText(h.label, x, y);
    });

    // 3-Tier Dimensioning
    const drawDim = (x1: number, y1: number, x2: number, y2: number, txt: string, off: number, isV: boolean) => {
       ctx.strokeStyle = '#000'; ctx.lineWidth = P_HAIR;
       const dx = isV ? 0 : 0; const dy = isV ? 0 : 0;
       ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
       const tick = 2 * PPI; ctx.lineWidth = P_MED;
       ctx.beginPath(); ctx.moveTo(x1-tick, y1+tick); ctx.lineTo(x1+tick, y1-tick); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(x2-tick, y2+tick); ctx.lineTo(x2+tick, y2-tick); ctx.stroke();
       ctx.fillStyle = '#000'; ctx.font = `${T_BODY*0.9}px Inter`;
       ctx.save(); ctx.translate((x1+x2)/2, (y1+y2)/2); if(isV) ctx.rotate(-Math.PI/2); ctx.fillText(txt, 0, -T_BODY); ctx.restore();
    };

    // V-Dimensions (Top)
    const t3Y = cY - ext - BUBBLE_DIA - 10*PPI;
    const t2Y = t3Y - 10*PPI;
    const t1Y = t2Y - 10*PPI;

    // Tier 1 (Overall)
    drawDim(mapX(vLines[0].position), t1Y, mapX(vLines[vLines.length-1].position), t1Y, gridW.toString(), t1Y, false);
    // Tier 2 (Spacing)
    for(let i=0; i<vLines.length-1; i++) {
       drawDim(mapX(vLines[i].position), t2Y, mapX(vLines[i+1].position), t2Y, gridSpacing.toString(), t2Y, false);
    }
    // Tier 3 (Detailed Setting Out)
    vLines.forEach(v => {
       const x = mapX(v.position);
       drawDim(x, t3Y, x + fPx/2, t3Y, (footingWidth/2).toString(), t3Y, false);
       drawDim(x - wPx/2, t3Y + 4*PPI, x + wPx/2, t3Y + 4*PPI, wallWidth.toString(), t3Y, false);
    });

    // Title Block
    const tbW = 100 * PPI; const tbH = 45 * PPI;
    const tX = CANVAS_W - 10*PPI - tbW; const tY = CANVAS_H - 10*PPI - tbH;
    ctx.fillStyle = '#fff'; ctx.fillRect(tX, tY, tbW, tbH);
    ctx.strokeStyle = '#000'; ctx.lineWidth = P_MED; ctx.strokeRect(tX, tY, tbW, tbH);
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.font = `bold ${T_HEAD}px Inter`;
    ctx.fillText("FOUNDATION LAYOUT PLAN", tX + 4*PPI, tY + 8*PPI);
    ctx.font = `${T_BODY}px Inter`;
    ctx.fillText(`PROJECT: SITE_AUTOGEN_S101`, tX + 4*PPI, tY + 18*PPI);
    ctx.fillText(`SCALE: 1:${scale} @ A3`, tX + 4*PPI, tY + 24*PPI);
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, tX + 4*PPI, tY + 30*PPI);

    // Engineering Notes
    const nX = 15*PPI; const nY = CANVAS_H - 45*PPI;
    ctx.font = `bold ${T_BODY}px Inter`; ctx.fillText("GENERAL NOTES:", nX, nY);
    ctx.font = `${T_BODY*0.8}px Inter`;
    const notes = [
      "1. CONCRETE GRADE: C25/30.",
      "2. STEEL GRADE: HIGH YIELD DEFORMED BARS (460 N/mm²).",
      "3. CONCRETE COVER: 50mm (EARTH CONTACT).",
      "4. DPM: 1200 GAUGE POLYETHYLENE.",
      `5. TRENCH WIDTH = FOOTING + ${workingSpace}mm WORKING SPACE.`
    ];
    notes.forEach((n, i) => ctx.fillText(n, nX, nY + (i+1)*4*PPI));

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
