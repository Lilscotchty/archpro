
import React from 'react';
import { AppStep, ProjectState } from '../types';
import { Button } from './Button';

interface SidebarProps {
  step: AppStep;
  setStep: (step: AppStep) => void;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  currentTool: 'v-line' | 'h-line' | 'select' | null;
  setCurrentTool: (tool: 'v-line' | 'h-line' | 'select' | null) => void;
  onGenerate: () => void;
  onAutoDetect: () => void;
  isAnalyzing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  step, setStep, project, setProject, currentTool, setCurrentTool, onGenerate, onAutoDetect, isAnalyzing,
  onUndo, onRedo, canUndo, canRedo
}) => {

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setProject(prev => ({
            ...prev,
            imageSrc: event.target?.result as string,
            imageWidth: img.width,
            imageHeight: img.height
          }));
          setStep(AppStep.GRID_MAPPING);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const updateSetting = (key: keyof typeof project.settings, value: string) => {
      const num = parseInt(value);
      if(!isNaN(num)) {
          setProject(prev => ({
              ...prev,
              settings: { ...prev.settings, [key]: num }
          }));
      }
  };

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-full shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 text-blue-400">
           AutoFoundation
        </h1>
        <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Structural Engineering</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Step 1: Upload */}
        <div className={`space-y-3 ${step !== AppStep.UPLOAD && 'opacity-60 grayscale'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs text-white">1</span>
            Upload Architectural Plan
          </div>
          {step === AppStep.UPLOAD && (
             <div className="relative border-2 border-dashed border-slate-600 rounded-lg p-6 hover:border-blue-500 transition-colors bg-slate-800/50">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="text-center">
                  <p className="text-sm text-slate-300">Click to upload plan</p>
                </div>
             </div>
          )}
        </div>

        {/* Step 2: Grid */}
        <div className={`space-y-3 ${step !== AppStep.GRID_MAPPING && 'opacity-60'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300 justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs text-white">2</span>
              Map Structural Grids
            </div>
            {step === AppStep.GRID_MAPPING && (
              <div className="flex gap-1">
                <button onClick={onUndo} disabled={!canUndo} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30">Undo</button>
                <button onClick={onRedo} disabled={!canRedo} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 disabled:opacity-30">Redo</button>
              </div>
            )}
          </div>
          {step === AppStep.GRID_MAPPING && (
            <div className="space-y-3">
              <Button className="w-full bg-indigo-600" onClick={onAutoDetect} disabled={isAnalyzing}>
                 {isAnalyzing ? "Analyzing Plan..." : "AI Auto-Detect Grids"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={currentTool === 'v-line' ? 'primary' : 'secondary'} onClick={() => setCurrentTool('v-line')} className="text-xs">V-Line</Button>
                <Button variant={currentTool === 'h-line' ? 'primary' : 'secondary'} onClick={() => setCurrentTool('h-line')} className="text-xs">H-Line</Button>
                <Button variant="primary" className="col-span-2 mt-2" onClick={() => setStep(AppStep.COLUMN_SELECTION)}>Next: Place Columns</Button>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Column Config */}
        <div className={`space-y-3 ${step !== AppStep.COLUMN_SELECTION && 'opacity-60'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
             <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs text-white">3</span>
             Foundation Specs
          </div>
          {step === AppStep.COLUMN_SELECTION && (
            <div className="space-y-4">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-3">
                 <div className="grid grid-cols-2 gap-2">
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Scale (1:x)</label>
                     <input type="number" value={project.settings.scale} onChange={(e) => updateSetting('scale', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Grid (mm)</label>
                     <input type="number" value={project.settings.gridSpacing} onChange={(e) => updateSetting('gridSpacing', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Footing (mm)</label>
                     <input type="number" value={project.settings.footingWidth} onChange={(e) => updateSetting('footingWidth', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Wall (mm)</label>
                     <input type="number" value={project.settings.wallWidth} onChange={(e) => updateSetting('wallWidth', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Working Space</label>
                     <input type="number" value={project.settings.workingSpace} onChange={(e) => updateSetting('workingSpace', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500">Blinding</label>
                     <input type="number" value={project.settings.blindingOffset} onChange={(e) => updateSetting('blindingOffset', e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white" />
                   </div>
                 </div>
              </div>
              <Button variant="primary" className="w-full" onClick={onGenerate}>Generate Pro Plan</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
