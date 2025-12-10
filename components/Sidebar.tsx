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
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  step, setStep, project, setProject, currentTool, setCurrentTool, onGenerate, onAutoDetect, isAnalyzing 
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

  const clearGrid = () => {
    if(confirm("Clear all grid lines?")) {
      setProject(prev => ({ ...prev, gridLines: [] }));
    }
  };

  const clearColumns = () => {
    if(confirm("Clear all columns?")) {
      setProject(prev => ({ ...prev, columns: [] }));
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
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
           <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
           </svg>
           AutoFoundation
        </h1>
        <p className="text-xs text-slate-400 mt-1">AI-Assisted Structural Planning</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Step 1: Upload */}
        <div className={`space-y-3 ${step !== AppStep.UPLOAD && 'opacity-60 grayscale'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs">1</span>
            Upload Plan
          </div>
          {step === AppStep.UPLOAD && (
             <div className="relative border-2 border-dashed border-slate-600 rounded-lg p-6 hover:border-blue-500 transition-colors bg-slate-800/50">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <p className="text-sm text-slate-300">Click to upload architectural plan</p>
                  <p className="text-xs text-slate-500">Supports JPG, PNG</p>
                </div>
             </div>
          )}
        </div>

        {/* Step 2: Grid */}
        <div className={`space-y-3 ${step !== AppStep.GRID_MAPPING && 'opacity-60'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs">2</span>
            Define Grid
          </div>
          {step === AppStep.GRID_MAPPING && (
            <div className="space-y-3">
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-500 focus:ring-purple-500 shadow-purple-500/20"
                onClick={onAutoDetect}
                disabled={isAnalyzing}
              >
                 {isAnalyzing ? (
                   <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      AI Detecting...
                   </span>
                 ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Auto-Detect Grids
                    </span>
                 )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-800 px-2 text-slate-500">Or Manual</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant={currentTool === 'v-line' ? 'primary' : 'secondary'} 
                  onClick={() => setCurrentTool('v-line')}
                  className="text-xs"
                >
                  + Vert. Line
                </Button>
                <Button 
                  variant={currentTool === 'h-line' ? 'primary' : 'secondary'} 
                  onClick={() => setCurrentTool('h-line')}
                  className="text-xs"
                >
                  + Horiz. Line
                </Button>
                <Button variant="ghost" className="col-span-2 text-xs text-red-400" onClick={clearGrid}>
                  Clear All Grids
                </Button>
                <Button 
                  variant="primary" 
                  className="col-span-2 mt-2" 
                  onClick={() => {
                    if (project.gridLines.length < 2) {
                       alert("Please define at least one vertical and one horizontal grid line.");
                       return;
                    }
                    setStep(AppStep.COLUMN_SELECTION);
                    setCurrentTool('select');
                  }}
                >
                  Next: Place Columns
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Columns */}
        <div className={`space-y-3 ${step !== AppStep.COLUMN_SELECTION && 'opacity-60'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
             <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs">3</span>
             Select Columns
          </div>
          {step === AppStep.COLUMN_SELECTION && (
            <div className="space-y-4">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-3">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configuration</p>
                 
                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="text-xs text-slate-500">Scale (1:x)</label>
                     <input 
                        type="number" 
                        value={project.settings.scale} 
                        onChange={(e) => updateSetting('scale', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-slate-500">Grid Spacing (mm)</label>
                     <input 
                        type="number" 
                        value={project.settings.gridSpacing} 
                        onChange={(e) => updateSetting('gridSpacing', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-slate-500">Wall (mm)</label>
                     <input 
                        type="number" 
                        value={project.settings.wallWidth} 
                        onChange={(e) => updateSetting('wallWidth', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-slate-500">Trench (mm)</label>
                     <input 
                        type="number" 
                        value={project.settings.trenchWidth} 
                        onChange={(e) => updateSetting('trenchWidth', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                     />
                   </div>
                   <div className="col-span-2">
                     <label className="text-xs text-slate-500">Footing Width (mm)</label>
                     <input 
                        type="number" 
                        value={project.settings.footingWidth} 
                        onChange={(e) => updateSetting('footingWidth', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                     />
                   </div>
                 </div>
              </div>

              <div className="flex justify-between items-center text-sm text-slate-300 bg-slate-900 p-2 rounded">
                 <span>Selected Columns:</span>
                 <span className="font-bold text-white">{project.columns.length}</span>
              </div>
               <Button variant="ghost" className="w-full text-xs text-red-400" onClick={clearColumns}>
                Reset Selection
              </Button>
              <Button 
                variant="primary" 
                className="w-full"
                onClick={() => {
                   if (project.columns.length === 0) {
                     alert("Please select at least one column.");
                     return;
                   }
                   onGenerate();
                }}
              >
                Generate A3 Plan
              </Button>
            </div>
          )}
        </div>

      </div>

      <div className="p-4 border-t border-slate-700 space-y-2">
         <Button variant="secondary" className="w-full text-xs" onClick={() => setStep(AppStep.BACKEND_SPECS)}>
           <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
           View Backend Code
         </Button>
      </div>
    </div>
  );
};