import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BackendPreview } from './components/BackendPreview';
import { Dashboard } from './components/Dashboard';
import { MeasurementModule } from './components/MeasurementModule';
import { AppStep, ProjectState, GridLine, AppModule } from './types';
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
const supabaseUrl = 'https://gsmobkuznwnspjhpxtbh.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbW9ia3V6bnduc3BqaHB4dGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3Mjk2MjYsImV4cCI6MjA4MzMwNTYyNn0.tF5vPvorfg171RoJVJFVeGR-lqFD1Q8DNHHHWcLO_WA';
const supabase = createClient(supabaseUrl, supabaseKey);

type HistoryState = Pick<ProjectState, 'gridLines' | 'columns'>;

function App() {
  // ROUTING STATE
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  
  // DRAWING MODULE LOCAL STATE
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [currentTool, setCurrentTool] = useState<'v-line' | 'h-line' | 'select' | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // GLOBAL PROJECT STATE
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

  // ... (Keep existing history Logic: saveHistory, undo, redo, useEffect) ...
  // [OMITTED FOR BREVITY - PASTE ORIGINAL HISTORY LOGIC HERE] 
  const saveHistory = useCallback(() => {
    setPast(prev => [...prev.slice(-19), { gridLines: project.gridLines, columns: project.columns }]);
    setFuture([]);
  }, [project.gridLines, project.columns]);
  const undo = useCallback(() => { /* ... */ }, [past, project]);
  const redo = useCallback(() => { /* ... */ }, [future, project]);

  // ... (Keep handleAutoDetect logic) ...
  const handleAutoDetect = async () => { /* ... PASTE ORIGINAL AI LOGIC ... */ };

  // MODIFIED GENERATE FUNCTION
  const handleGenerate = async () => {
    setStep(AppStep.GENERATION);
    setIsUploading(true);
    
    // 1. Setup Canvas
    const PPI = 300 / 25.4; 
    const PAPER_W = 420; const PAPER_H = 297; 
    const CANVAS_W = PAPER_W * PPI; const CANVAS_H = PAPER_H * PPI;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ... (Keep existing geometry logic for vLines/hLines/mmToPx) ...
    const { gridSpacing, trenchWidth } = project.settings;
    const vLines = [...project.gridLines].filter(l => l.orientation === 'vertical').sort((a,b) => a.position - b.position);
    const hLines = [...project.gridLines].filter(l => l.orientation === 'horizontal').sort((a,b) => a.position - b.position);
    
    // ... Calculate connections ...
    const connections: {x1: number, y1: number, x2: number, y2: number, len: number}[] = [];
    // (Simulate finding connections for drawing...)
    // IMPORTANT: WE CALCULATE TOTAL LENGTH HERE FOR THE SHARED STATE
    let totalLenPx = 0;
    // ... loop connections ...
    // connections.forEach(c => totalLenPx += c.len);

    // MOCK CALCULATION (Replace with actual summation from your loop)
    // For now, let's assume we summed it up inside the drawing loop
    const pxPerRealMM = 0.1; // derived from grid
    const totalMeters = (totalLenPx / pxPerRealMM) / 1000;
    
    // UPDATE GLOBAL STATE FOR MEASUREMENT MODULE
    setProject(prev => ({
        ...prev,
        calculatedTrenchLength: totalMeters // Save this!
    }));

    // ... (Keep existing Canvas Drawing & Upload logic) ...
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
          <div className="flex h-screen w-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
             <Sidebar 
               step={step} setStep={setStep} 
               project={project} setProject={setProject}
               currentTool={currentTool} setCurrentTool={setCurrentTool}
               onGenerate={handleGenerate} onAutoDetect={handleAutoDetect} 
               isAnalyzing={isAnalyzing} 
               onUndo={undo} onRedo={redo} canUndo={past.length > 0} canRedo={future.length > 0}
               onGoHome={() => setActiveModule(AppModule.DASHBOARD)}
             />
             <main className="flex-1 relative flex items-center justify-center overflow-hidden">
               {step === AppStep.GENERATION ? (
                 // Simple Result View
                 <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-8">
                    {project.generatedImageSrc ? (
                        <img src={project.generatedImageSrc} className="max-w-full shadow-2xl" />
                    ) : <div className="text-white">Generating...</div>}
                    <button onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="mt-4 bg-slate-700 text-white px-4 py-2 rounded">Back to Edit</button>
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
           <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-400 flex-col">
              <h1 className="text-3xl font-bold mb-4">Under Construction</h1>
              <button onClick={() => setActiveModule(AppModule.DASHBOARD)} className="text-blue-400 hover:underline">Return Home</button>
           </div>
        );
    }
  };

  return renderContent();
}

export default App;
