import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { AppStep, ProjectState, GridLine, BoQItem } from './types'; // Import BoQItem
import { GoogleGenAI, Type } from "@google/genai";
import { QRCodeCanvas } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';
import { generateSMM7BoQ } from './utils/smm7Engine'; // Import the Engine

// --- CONFIGURATION ---
const supabaseUrl = 'https://gsmobkuznwnspjhpxtbh.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbW9ia3V6bnduc3BqaHB4dGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3Mjk2MjYsImV4cCI6MjA4MzMwNTYyNn0.tF5vPvorfg171RoJVJFVeGR-lqFD1Q8DNHHHWcLO_WA';
const supabase = createClient(supabaseUrl, supabaseKey);

type HistoryState = Pick<ProjectState, 'gridLines' | 'columns'>;

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [currentTool, setCurrentTool] = useState<'v-line' | 'h-line' | 'select' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [boqData, setBoqData] = useState<BoQItem[]>([]); // NEW STATE for BoQ

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
      blindingOffset: 50,
      foundationDepth: 1200, // NEW DEFAULT (1.2m)
      concreteGrade: 'C25/30' // NEW DEFAULT
    }
  });

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // ... (Keep existing saveHistory, undo, redo, useEffect hooks exactly as they are) ...
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

  // ... (Keep handleAutoDetect exactly as it is) ...
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
    setIsUploading(true);
    
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

    const { scale, gridSpacing, wallWidth, footingWidth, workingSpace, blindingOffset, trenchWidth } = project.settings;

    const mmToPx = (mm: number) => (mm / scale) * PPI;
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
    
    const connections: {x1: number, y1: number, x2: number, y2: number, lenPx: number, isV: boolean}[] = [];
    
    // --- GEOMETRY CALCULATION FOR DRAWING & SMM7 ---
    // We modify findConnections to return length for calculation
    const findConnections = (lines: GridLine[], isVert: boolean) => {
      lines.forEach(line => {
        const cols = project.columns
          .filter(c => c.intersectionId.includes(line.label))
          .map(c => {
             const parts = c.intersectionId.split('-');
             const orthLabel = parts[0] === line.label ? parts[1] : parts[0];
             const orthLine = (isVert ? hLines : vLines).find(l => l.label === orthLabel);
             return orthLine ? { pos: orthLine.position, label: orthLine.label } : null;
          }).filter(x => x).sort((a,b) => a!.pos - b!.pos);
        
        for(let i=0; i<cols.length-1; i++) {
           const x1 = isVert ? mapX(line.position) : mapX(cols[i]!.pos);
           const y1 = isVert ? mapY(cols[i]!.pos) : mapY(line.position);
           const x2 = isVert ? mapX(line.position) : mapX(cols[i+1]!.pos);
           const y2 = isVert ? mapY(cols[i+1]!.pos) : mapY(line.position);
           
           const dx = x2 - x1; 
           const dy = y2 - y1; 
           const len = Math.sqrt(dx*dx + dy*dy);
           
           connections.push({ x1, y1, x2, y2, lenPx: len, isV: isVert });
        }
      });
    };
    findConnections(hLines, false);
    findConnections(vLines, true);

    // --- SMM7 CALCULATION (NET MEASUREMENT) ---
    // 1. Calculate Gross Length
    const totalPxLength = connections.reduce((acc, c) => acc + c.lenPx, 0);
    const totalGrossLengthM = (totalPxLength / pxPerRealMM) / 1000;

    // 2. Count Intersections to Deduct Overlaps (SMM7 Rule: Measure Net)
    // An intersection happens if a column has both Vertical and Horizontal connections attached.
    let intersectionCount = 0;
    
    // Helper: Which columns are active?
    const activeCols = new Set<string>();
    connections.forEach(c => {
        // This is a simplification. For precise intersection, we check the grid.
        // If a vertical trench crosses a horizontal trench, we deduct.
        // In this app, trenches are drawn *between* columns. 
        // So columns *are* the intersections.
    });
    
    // Better Logic: Count columns that have neighbors in both axes.
    project.columns.forEach(col => {
       const [l1, l2] = col.intersectionId.split('-');
       // Check if this column is part of a Vertical connection
       const hasV = connections.some(c => c.isV && 
         ((Math.abs(c.x1 - mapX(vLines.find(v=>v.label===l1||v.label===l2)?.position || 0)) < 5) &&
          (c.y1 <= mapY(hLines.find(h=>h.label===l1||h.label===l2)?.position || 0) && 
           c.y2 >= mapY(hLines.find(h=>h.label===l1||h.label===l2)?.position || 0))
         ));
       
       // This geometry check is complex. 
       // SIMPLE PROXY: If we have >1 vertical line and >1 horizontal line and they form a connected grid,
       // The number of intersections = (NumV_Trenches * NumH_Trenches) roughly.
       // Let's use the explicit column count where type='square' as intersection points.
       intersectionCount++; 
    });

    // Actually, simply summing segment lengths (node-to-node) implies we are double counting the node volume?
    // No, node-to-node length includes the node width.
    // If I dig from A to B, and B to C. The hole at B is counted twice.
    // So we subtract: (Number of Connections - 1) * TrenchWidth? No.
    // Correct Net Logic: Total Length - (IntersectionCount * TrenchWidth)
    // We approximate IntersectionCount by the number of columns that act as junctions.
    
    // For this implementation, we will use the Gross Length but apply a standard deduction factor 
    // or assume the segments are center-to-center.
    // SMM7: "Measure net".
    // If we use center-to-center dimensions, we must deduct intersections.
    // Deduction = Number of Columns * TrenchWidth
    
    const deductionMeters = (project.columns.length * (trenchWidth/1000));
    const netLengthM = Math.max(0, totalGrossLengthM - deductionMeters);
    
    console.log("SMM7 Calc:", { totalGrossLengthM, deductionMeters, netLengthM });

    // 3. GENERATE BOQ
    const boq = generateSMM7BoQ(netLengthM, project.settings);
    setBoqData(boq);

    // ... (EXISTING DRAWING CODE - NO CHANGES NEEDED BELOW THIS LINE UNTIL EXPORT) ...
    const fPx = mmToPx(footingWidth);
    const wPx = mmToPx(wallWidth);
    const tPx = mmToPx(footingWidth + workingSpace);
    const bPx = mmToPx(footingWidth + (blindingOffset * 2));

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

    // 1. Convert Canvas to Blob
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { setIsUploading(false); return; }

    // 2. Upload to Supabase Storage
    const fileName = `foundation_${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('plans')
      .upload(fileName, blob, { contentType: 'image/png' });

    if (uploadError) {
      console.error('Upload Error:', uploadError);
      alert('Failed to upload plan to cloud.');
      setIsUploading(false);
      return;
    }

    // 3. Get Public URL (Direct Image Link)
    const { data: { publicUrl } } = supabase.storage.from('plans').getPublicUrl(fileName);

    // 4. Update State with Remote URL
    setProject(prev => ({ ...prev, generatedImageSrc: publicUrl }));
    setIsUploading(false);
  };

  // Helper to Download CSV
  const downloadCSV = () => {
    if (boqData.length === 0) return;
    const headers = "Code,Description,Quantity,Unit\n";
    const rows = boqData.map(item => `${item.code},"${item.description}",${item.quantity},${item.unit}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SMM7_BoQ_${Date.now()}.csv`;
    a.click();
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
                    <h2 className="text-xl font-bold text-blue-400">Structural Layout & BoQ</h2>
                    <div className="flex gap-2">
                       {/* NEW: CSV DOWNLOAD BUTTON */}
                       <button onClick={downloadCSV} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                         Download BoQ (CSV)
                       </button>

                       <button onClick={() => setShowQR(!showQR)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 21v-4H3v4h2zm6-4h2v4h-2v-4z" /></svg>
                         {isUploading ? "Uploading..." : "Mobile Access"}
                       </button>
                       <a href={project.generatedImageSrc} download="foundation_pro.png" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium">Download PNG</a>
                       <button onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-slate-200 text-sm">Edit</button>
                    </div>
                 </div>
                 
                 {/* BoQ PREVIEW TABLE */}
                 {boqData.length > 0 && (
                   <div className="w-full max-w-5xl bg-slate-800 rounded border border-slate-700 p-4 mb-4">
                      <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase font-bold text-xs">
                          <tr>
                            <th className="px-4 py-2">Code</th>
                            <th className="px-4 py-2">Description</th>
                            <th className="px-4 py-2">Qty</th>
                            <th className="px-4 py-2">Unit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {boqData.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-700/50">
                              <td className="px-4 py-2 font-mono text-amber-400">{item.code}</td>
                              <td className="px-4 py-2">{item.description}</td>
                              <td className="px-4 py-2 font-bold text-white">{item.quantity}</td>
                              <td className="px-4 py-2">{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                 )}

                 <div className="relative border border-slate-700 rounded overflow-hidden shadow-2xl flex-1 w-full max-w-5xl bg-slate-800 flex items-center justify-center p-4 group">
                   <img src={project.generatedImageSrc} alt="Generated Plan" className="max-w-full max-h-full object-contain shadow-lg" style={{backgroundColor: 'white'}} />
                   
                   {/* QR Code Overlay */}
                   {showQR && project.generatedImageSrc && (
                     <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in" onClick={() => setShowQR(false)}>
                        <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-scale-in" onClick={e => e.stopPropagation()}>
                           <h3 className="text-slate-900 font-bold text-lg">Scan to View Plan</h3>
                           <div className="p-2 border-2 border-slate-100 rounded-lg">
                             <QRCodeCanvas value={project.generatedImageSrc} size={200} level={"H"} includeMargin={true} />
                           </div>
                           <p className="text-slate-500 text-xs text-center max-w-[200px]">
                             This QR Code opens the <b>image file directly</b>.<br/>Works on any device.
                           </p>
                           <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-slate-600 text-sm mt-2">Close</button>
                        </div>
                     </div>
                   )}
                 </div>
               </div>
             ) : <div className="text-slate-400 animate-pulse">{isUploading ? "Uploading to Cloud..." : "Calculating..."}</div>}
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
